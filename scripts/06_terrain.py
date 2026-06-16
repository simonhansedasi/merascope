"""
06_terrain.py — Compute terrain flatness score from SRTM1 tiles.

Adds to grid_scores.geojson:
  flatness_score — 0.0 if < FLAT_GATE (hard gate), else normalized flat_frac

Data: SRTM1 HGT tiles from AWS S3 (public), parsed with numpy (no GDAL).
Tiles cached under data/{STATE}/raw/srtm_tiles/.

Usage:
  python 06_terrain.py WA
"""

import argparse
import gzip
import sys
import warnings
from pathlib import Path

import geopandas as gpd
import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
import numpy as np
import requests

sys.path.insert(0, str(Path(__file__).parent))
from config import get_state, get_paths

warnings.filterwarnings("ignore")
CRS = "EPSG:4326"
DARK_BG = "#1a1a2e"
WHITE = "white"

TILE_SIZE = 3601        # SRTM1 1-degree tiles: 3601x3601
DOWNSAMPLE = 3          # 30m -> ~90m (reduces array ~9x)
NODATA_VAL = -32768
FLAT_GATE = 0.03        # < 3% flat area = hard gate (unbuildable)
SLOPE_THRESHOLD = 5.0   # degrees: flat is slope < 5 deg


def srtm_tile_range(bbox):
    """Return (lat_tiles, lon_tiles) covering the bbox.
    lat_tiles: list of integer N-latitudes (tile covers lat to lat+1), N->S order
    lon_tiles: list of integer W-longitudes as positive (e.g. W120 = 120), W->E order
    """
    west, south, east, north = bbox
    lat_min = int(np.floor(south))
    lat_max = int(np.floor(north))
    # For SRTM: N?W117 covers lon -117 to -116. Tile ID = ceil(abs(lon)).
    lon_min = int(np.ceil(abs(east)))   # easternmost tile (smallest W number)
    lon_max = int(np.ceil(abs(west)))   # westernmost tile (largest W number)
    lat_tiles = list(range(lat_min, lat_max + 1))[::-1]  # N->S (descending)
    lon_tiles = list(range(lon_min, lon_max + 1))         # W->E ascending
    return lat_tiles, lon_tiles


def download_tile(lat, lon, tile_dir):
    lat_tag = f"N{lat:02d}"
    filename = f"{lat_tag}W{lon:03d}.hgt"
    path = tile_dir / filename
    if path.exists():
        return path
    url = f"https://s3.amazonaws.com/elevation-tiles-prod/skadi/{lat_tag}/{filename}.gz"
    print(f"    Fetching {filename}...")
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    path.write_bytes(gzip.decompress(r.content))
    return path


def load_tile(path):
    data = np.frombuffer(path.read_bytes(), dtype=">i2").reshape(TILE_SIZE, TILE_SIZE).astype(np.float32)
    data[data == NODATA_VAL] = np.nan
    return data


def score_cells_tiled(grid, lat_tiles, lon_tiles, tile_dir):
    """Process one SRTM tile at a time to avoid OOM on large states.
    Each cell is scored from the tile containing its centroid."""
    flat_fracs   = np.zeros(len(grid), dtype=np.float32)
    slope_means  = np.full(len(grid), np.nan, dtype=np.float32)
    centroids  = grid.geometry.centroid
    cell_lats  = np.array([pt.y for pt in centroids])
    cell_lons  = np.array([pt.x for pt in centroids])

    for lat in lat_tiles:
        for lon in lon_tiles:
            t_south, t_north = float(lat), float(lat + 1)
            t_west,  t_east  = float(-lon), float(-(lon - 1))

            in_tile = np.where(
                (cell_lats >= t_south) & (cell_lats < t_north) &
                (cell_lons >= t_west)  & (cell_lons < t_east)
            )[0]
            if len(in_tile) == 0:
                continue

            try:
                path      = download_tile(lat, lon, tile_dir)
                tile_data = load_tile(path)
            except Exception as e:
                print(f"    N{lat:02d}W{lon:03d} failed ({e}); {len(in_tile)} cells default 0")
                continue

            tile_ds = tile_data[::DOWNSAMPLE, ::DOWNSAMPLE]
            del tile_data

            lat_1d = np.linspace(t_north, t_south, tile_ds.shape[0])
            lon_1d = np.linspace(t_west,  t_east,  tile_ds.shape[1])
            dy_m   = (t_north - t_south) / tile_ds.shape[0] * 110540.0
            dx_m   = (t_east  - t_west)  / tile_ds.shape[1] * np.cos(np.radians(lat_1d[:, np.newaxis])) * 111320.0

            filled = np.where(np.isnan(tile_ds),
                              np.nanmedian(tile_ds) if not np.all(np.isnan(tile_ds)) else 0.0,
                              tile_ds)
            dz_dy, dz_dx = np.gradient(filled)
            slope = np.degrees(np.arctan(np.sqrt((dz_dx / dx_m) ** 2 + (dz_dy / dy_m) ** 2)))
            slope[np.isnan(tile_ds)] = np.nan
            del tile_ds, filled, dz_dy, dz_dx

            for pos, gi in enumerate(in_tile):
                minx, miny, maxx, maxy = grid.iloc[gi].geometry.bounds
                r0 = max(0, int(np.searchsorted(-lat_1d, -maxy)))
                r1 = min(slope.shape[0], int(np.searchsorted(-lat_1d, -miny)) + 1)
                c0 = max(0, int(np.searchsorted(lon_1d, minx)))
                c1 = min(slope.shape[1], int(np.searchsorted(lon_1d, maxx)) + 1)
                patch = slope[r0:r1, c0:c1]
                valid = patch[~np.isnan(patch)]
                flat_fracs[gi]  = float(np.mean(valid < SLOPE_THRESHOLD)) if len(valid) > 0 else 0.0
                slope_means[gi] = float(np.mean(valid)) if len(valid) > 0 else np.nan

            print(f"  N{lat:02d}W{lon:03d}: scored {len(in_tile)} cells")
            del slope

    return flat_fracs.tolist(), slope_means.tolist()


def plot_terrain(cfg, state, dc_gdf, grid, buildable, processed):
    grid_proj = grid.to_crs(cfg["utm_epsg"])
    state_proj = state.to_crs(cfg["utm_epsg"])
    dc_proj = dc_gdf.to_crs(cfg["utm_epsg"]) if len(dc_gdf) > 0 else dc_gdf
    build_plot = grid_proj[buildable]
    gated_plot = grid_proj[~buildable]

    plt.rcParams.update({"text.color": WHITE, "axes.labelcolor": WHITE,
                         "xtick.color": WHITE, "ytick.color": WHITE, "font.size": 16})
    fig, ax = plt.subplots(1, 1, figsize=(12, 10), facecolor=DARK_BG)
    ax.set_facecolor(DARK_BG)
    state_proj.boundary.plot(ax=ax, color="#4a4a6a", linewidth=1.0, zorder=1)
    if len(gated_plot) > 0:
        gated_plot.plot(ax=ax, color="#2a2a3a", alpha=0.80, zorder=2)
    n0 = len(fig.axes)
    build_plot.plot(column="flatness_score", ax=ax, cmap="YlGn", vmin=0, vmax=1,
                    legend=True, legend_kwds={"shrink": 0.65, "label": "0=little flat / 1=most flat"},
                    alpha=0.85, zorder=3)
    if len(fig.axes) > n0:
        cb = fig.axes[-1]; cb.tick_params(labelsize=14, colors=WHITE)
        cb.yaxis.label.set_color(WHITE)
    if len(dc_proj) > 0:
        rep = dc_proj[dc_proj["source"].isin(["reported", "OSM"])]
        prop = dc_proj[dc_proj["source"] == "proposed"]
        ax.scatter(rep.geometry.x, rep.geometry.y, c=WHITE, s=100, marker="D",
                   zorder=5, edgecolors="black", linewidths=0.8)
        ax.scatter(prop.geometry.x, prop.geometry.y, facecolors="none", s=100,
                   marker="D", zorder=5, edgecolors="black", linewidths=1.5)
    gated_patch = mpatches.Patch(color="#2a2a3a", alpha=0.9,
                                 label=f"Gated: < {FLAT_GATE:.0%} flat area")
    leg = ax.legend(handles=[gated_patch], loc="lower right",
                    facecolor=DARK_BG, edgecolor="#4a4a6a", fontsize=12)
    for t in leg.get_texts():
        t.set_color(WHITE)
    ax.set_title(
        f"{cfg['name']}: Terrain Flatness (SRTM1 ~90m)\n"
        f"(Fraction with slope < {SLOPE_THRESHOLD}deg; hard gate at {FLAT_GATE:.0%})\n"
        "White filled = existing DC  /  outline = proposed DC",
        color=WHITE, fontsize=18, pad=10, linespacing=1.4,
    )
    ax.tick_params(left=False, bottom=False, labelleft=False, labelbottom=False)
    for s in ax.spines.values():
        s.set_edgecolor("#4a4a6a")
    plt.tight_layout()
    out = processed / "terrain_flatness.png"
    plt.savefig(out, dpi=150, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close()
    print(f"  Saved {out.name}")


def main():
    parser = argparse.ArgumentParser(description="Compute terrain flatness score from SRTM1.")
    parser.add_argument("state", help="Two-letter state abbreviation (e.g. WA)")
    args = parser.parse_args()

    cfg = get_state(args.state)
    root, raw, processed, grid_path = get_paths(cfg["abbr"])
    tile_dir = raw / "srtm_tiles"
    tile_dir.mkdir(exist_ok=True)
    print(f"\n=== 06_terrain: {cfg['name']} ({cfg['abbr']}) ===")

    state = gpd.read_file(raw / "state.geojson")
    dc_gdf = gpd.read_file(raw / "datacenters.geojson") if (raw / "datacenters.geojson").exists() else \
             gpd.GeoDataFrame(columns=["source", "geometry"], crs=CRS)
    grid = gpd.read_file(grid_path)
    print(f"Grid: {len(grid)} cells")

    lat_tiles, lon_tiles = srtm_tile_range(cfg["bbox"])
    print(f"SRTM tiles: {len(lat_tiles)} lat x {len(lon_tiles)} lon = {len(lat_tiles)*len(lon_tiles)} tiles")

    print(f"Processing tiles one at a time (~{DOWNSAMPLE*30}m resolution)...")
    flat_fracs, slope_means = score_cells_tiled(grid, lat_tiles, lon_tiles, tile_dir)
    grid["flat_frac"] = flat_fracs
    grid["slope_mean_deg"] = slope_means
    print(f"  flat_frac: {grid.flat_frac.min():.3f} - {grid.flat_frac.max():.3f}")

    buildable = grid["flat_frac"] >= FLAT_GATE
    n_gated = (~buildable).sum()
    p95 = grid.loc[buildable, "flat_frac"].quantile(0.95)
    grid["flatness_score"] = 0.0
    grid.loc[buildable, "flatness_score"] = (grid.loc[buildable, "flat_frac"] / p95).clip(0, 1)
    # slope_score: continuous normalized version, no hard gate zeroing — for use as weighted slider
    grid["slope_score"] = (grid["flat_frac"] / p95).clip(0, 1)
    print(f"  Gate: {n_gated} cells gated ({n_gated/len(grid):.1%}); p95={p95:.3f}")

    grid_out = grid
    grid_out.to_file(grid_path, driver="GeoJSON")
    print(f"\nSaved grid to {grid_path.name}")

    print("Terrain map...")
    plot_terrain(cfg, state, dc_gdf, grid_out, buildable, processed)
    print("Done.")


if __name__ == "__main__":
    main()
