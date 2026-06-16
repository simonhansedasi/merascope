"""
patch_raws.py — Retrofit raw (un-normalized) columns into completed state grids.

Adds the following columns to each state's grid_scores.geojson without re-running
the full pipeline. Reads only from cached files in data/{STATE}/raw/.

Raw columns added:
  tx_dist_m        — distance to nearest HV transmission line (m)
  ann_precip_mm    — PRISM annual precip (mm/yr)
  pop_density      — population density (persons/km²)
  seismic_pga_g    — interpolated PGA (g)
  tri_dist_m       — distance to nearest TRI facility (m)
  river_dist_m     — distance to nearest major river (m)
  heatflow_mwm2    — interpolated heat flow (mW/m²)
  protected_frac   — fraction of cell covered by protected land
  aquifer_depth_ft — interpolated depth to water table (ft)
  ksat_mean_ums    — interpolated mean saturated hydraulic conductivity (µm/s)

NOT added here (require SRTM tiles, already deleted):
  flat_frac, slope_mean_deg — available for new states going forward

Usage:
  python3 scripts/patch_raws.py WA OR TX CA NV UT ID MT AZ
"""

import argparse
import sys
import warnings
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import requests
from PIL import Image
from scipy.spatial import cKDTree

sys.path.insert(0, str(Path(__file__).parent))
from config import get_state, get_paths

warnings.filterwarnings("ignore")
CRS = "EPSG:4326"

PRISM_WEST  = -125.0208333
PRISM_NORTH =  49.9375000
PRISM_PIXEL =  1.0 / 24.0

IDW_K     = 8
IDW_POWER = 2


# ── IDW helper ─────────────────────────────────────────────────────────────────

def idw_k(src_pts, src_vals, tgt_pts, k=IDW_K, power=IDW_POWER):
    k = min(k, len(src_pts))
    tree = cKDTree(src_pts)
    dists, idxs = tree.query(tgt_pts, k=k)
    if k == 1:
        dists = dists[:, np.newaxis]
        idxs  = idxs[:, np.newaxis]
    exact = dists[:, 0] == 0
    weights = 1.0 / np.where(dists == 0, 1e-10, dists) ** power
    weights /= weights.sum(axis=1, keepdims=True)
    interp = (weights * src_vals[idxs]).sum(axis=1)
    interp[exact] = src_vals[idxs[exact, 0]]
    return interp


# ── Per-step raw extractors ────────────────────────────────────────────────────

def patch_step02(grid, raw, root, cfg):
    """tx_dist_m, ann_precip_mm, pop_density"""
    crs_proj = cfg["utm_epsg"]

    # transmission distance
    tx_path = raw / "transmission.geojson"
    if tx_path.exists() and "tx_dist_m" not in grid.columns:
        tx_gdf = gpd.read_file(tx_path)
        if len(tx_gdf) > 0:
            tx_proj   = tx_gdf.to_crs(crs_proj)
            tx_union  = tx_proj.geometry.unary_union
            grid_proj = grid.to_crs(crs_proj)
            centroids = list(grid_proj.geometry.centroid)
            grid["tx_dist_m"] = [tx_union.distance(pt) for pt in centroids]
            print(f"  tx_dist_m: {grid.tx_dist_m.min():.0f} - {grid.tx_dist_m.max():.0f} m")

    # PRISM precip
    if "ann_precip_mm" not in grid.columns:
        tif = root / "data" / "prism_ppt_30yr.tif"
        if tif.exists():
            arr = np.array(Image.open(tif), dtype=np.float32)
            centroids_ll = grid.geometry.centroid
            lons = np.array([p.x for p in centroids_ll])
            lats = np.array([p.y for p in centroids_ll])
            cols = np.round((lons - PRISM_WEST) / PRISM_PIXEL).astype(int)
            rows = np.round((PRISM_NORTH - lats) / PRISM_PIXEL).astype(int)
            cols = np.clip(cols, 0, arr.shape[1] - 1)
            rows = np.clip(rows, 0, arr.shape[0] - 1)
            vals = arr[rows, cols].astype(float)
            vals[vals < -9000] = np.nan
            grid["ann_precip_mm"] = np.where(np.isnan(vals), np.nanmean(vals), vals)
            print(f"  ann_precip_mm: {np.nanmin(vals):.0f} - {np.nanmax(vals):.0f} mm/yr")

    # population density
    tracts_path = raw / "tracts.geojson"
    acs_path    = raw / "acs_demog.csv"
    if tracts_path.exists() and acs_path.exists() and "pop_density" not in grid.columns:
        tracts = gpd.read_file(tracts_path)
        df_acs = pd.read_csv(acs_path, dtype={"GEOID": str})
        tracts["GEOID"] = tracts["GEOID"].astype(str).str.zfill(11)
        df_acs["GEOID"] = df_acs["GEOID"].astype(str).str.zfill(11)
        tracts_pop = tracts[["GEOID", "geometry"]].merge(
            df_acs[["GEOID", "pop"]], on="GEOID", how="left"
        )
        tracts_proj = tracts_pop.to_crs(crs_proj).copy()
        tracts_proj["area_km2"] = tracts_proj.geometry.area / 1e6
        tracts_proj["pop_density"] = tracts_proj["pop"] / tracts_proj["area_km2"].clip(lower=0.01)
        tracts_pop["pop_density"] = tracts_proj["pop_density"].values
        grid_pts = gpd.GeoDataFrame(
            {"cell_id": grid["cell_id"]}, geometry=grid.geometry.centroid, crs=CRS
        )
        joined = gpd.sjoin(
            grid_pts, tracts_pop[["pop_density", "geometry"]],
            how="left", predicate="within"
        )
        density_by_cell = joined.groupby("cell_id")["pop_density"].mean()
        grid["pop_density"] = grid["cell_id"].map(density_by_cell).fillna(0)
        print(f"  pop_density: {grid.pop_density.min():.1f} - {grid.pop_density.max():.1f} /km2")


def patch_step03(grid, raw):
    """seismic_pga_g"""
    if "seismic_pga_g" in grid.columns:
        return
    seismic_path = raw / "seismic_sample.csv"
    if not seismic_path.exists():
        print("  seismic_sample.csv not found; skipping seismic_pga_g")
        return
    seismic_df = pd.read_csv(seismic_path)
    centroids = grid.geometry.centroid
    tgt = np.column_stack([[p.y for p in centroids], [p.x for p in centroids]])
    src = seismic_df[["lat", "lon"]].values
    pgam_interp = idw_k(src, seismic_df["pgam"].values, tgt)
    grid["seismic_pga_g"] = pgam_interp.round(4)
    print(f"  seismic_pga_g: {pgam_interp.min():.4f} - {pgam_interp.max():.4f} g")


def patch_step04(grid, raw, cfg):
    """tri_dist_m, river_dist_m"""
    crs_proj = cfg["utm_epsg"]
    grid_proj = grid.to_crs(crs_proj)
    centroids_proj = np.column_stack([
        [c.x for c in grid_proj.geometry.centroid],
        [c.y for c in grid_proj.geometry.centroid],
    ])

    if "tri_dist_m" not in grid.columns:
        tri_path = raw / "tri_facilities.csv"
        if tri_path.exists():
            tri_df = pd.read_csv(tri_path)
            tri_df = tri_df.dropna(subset=["lat", "lon"])
            if len(tri_df) > 0:
                tri_gdf = gpd.GeoDataFrame(
                    tri_df, geometry=gpd.points_from_xy(tri_df["lon"], tri_df["lat"]), crs=CRS
                ).to_crs(crs_proj)
                tri_coords = np.column_stack([tri_gdf.geometry.x, tri_gdf.geometry.y])
                dist, _ = cKDTree(tri_coords).query(centroids_proj, k=1)
                grid["tri_dist_m"] = dist.round(1)
                print(f"  tri_dist_m: {dist.min():.0f} - {dist.max():.0f} m")
            else:
                grid["tri_dist_m"] = np.nan

    if "river_dist_m" not in grid.columns:
        rivers_path = raw / "rivers.geojson"
        if rivers_path.exists():
            rivers = gpd.read_file(rivers_path)
            if len(rivers) > 0:
                rivers_proj  = rivers.to_crs(crs_proj)
                rivers_union = rivers_proj.geometry.unary_union
                dists_riv = np.array([rivers_union.distance(
                    gpd.GeoSeries([pt], crs=crs_proj).iloc[0]
                ) for pt in grid_proj.geometry.centroid])
                grid["river_dist_m"] = dists_riv.round(1)
                print(f"  river_dist_m: {dists_riv.min():.0f} - {dists_riv.max():.0f} m")
            else:
                grid["river_dist_m"] = np.nan


def patch_step05(grid, raw, cfg):
    """heatflow_mwm2"""
    if "heatflow_mwm2" in grid.columns:
        return
    hf_path = raw / "heatflow.csv"
    if not hf_path.exists():
        print("  heatflow.csv not found; skipping heatflow_mwm2")
        return
    hf_df = pd.read_csv(hf_path)
    if len(hf_df) < 2:
        grid["heatflow_mwm2"] = np.nan
        return
    crs_proj  = cfg["utm_epsg"]
    grid_proj = grid.to_crs(crs_proj)
    hf_gdf = gpd.GeoDataFrame(
        hf_df, geometry=gpd.points_from_xy(hf_df["lon"], hf_df["lat"]), crs=CRS
    ).to_crs(crs_proj)
    q95 = np.percentile(hf_df["q"], 95)
    q_capped = hf_df["q"].clip(upper=q95).values
    src_pts = np.column_stack([hf_gdf.geometry.x, hf_gdf.geometry.y])
    tgt_pts = np.column_stack([
        [c.x for c in grid_proj.geometry.centroid],
        [c.y for c in grid_proj.geometry.centroid],
    ])
    q_interp = idw_k(src_pts, q_capped, tgt_pts)
    grid["heatflow_mwm2"] = q_interp.round(2)
    print(f"  heatflow_mwm2: {q_interp.min():.1f} - {q_interp.max():.1f} mW/m2")


def patch_step07(grid, raw, cfg):
    """protected_frac"""
    if "protected_frac" in grid.columns:
        return
    crs_proj = cfg["utm_epsg"]
    fed_path    = raw / "federal_lands.geojson"
    tribal_path = raw / "tribal_tiger.geojson"
    gdfs = []
    for p in [fed_path, tribal_path]:
        if p.exists():
            g = gpd.read_file(p)
            if len(g) > 0:
                gdfs.append(g[["geometry"]])
    if not gdfs:
        grid["protected_frac"] = 0.0
        return
    all_prot = gpd.GeoDataFrame(pd.concat(gdfs, ignore_index=True), crs=CRS)
    all_proj = all_prot.to_crs(crs_proj)
    prot_dissolved = all_proj.dissolve().reset_index(drop=True)
    grid_proj = grid.to_crs(crs_proj).copy()
    grid_proj["cell_id_idx"] = grid_proj.index
    grid_proj["cell_area"]   = grid_proj.geometry.area
    isect = gpd.overlay(
        grid_proj[["cell_id_idx", "cell_area", "geometry"]],
        prot_dissolved[["geometry"]],
        how="intersection", keep_geom_type=False,
    )
    isect["prot_area"] = isect.geometry.area
    prot_by_cell = isect.groupby("cell_id_idx")["prot_area"].sum()
    cell_areas   = grid_proj.set_index("cell_id_idx")["cell_area"]
    grid["protected_frac"] = (
        prot_by_cell.reindex(cell_areas.index, fill_value=0) / cell_areas
    ).clip(0, 1).values
    print(f"  protected_frac: {grid.protected_frac.min():.3f} - {grid.protected_frac.max():.3f}")


def patch_step08(grid, raw):
    """aquifer_depth_ft"""
    if "aquifer_depth_ft" in grid.columns:
        return
    cache = raw / "well_depths.csv"
    if not cache.exists():
        print("  well_depths.csv not found; skipping aquifer_depth_ft")
        return
    df = pd.read_csv(cache)
    df = df.dropna(subset=["lat", "lon", "depth_ft"])
    if len(df) < 2:
        grid["aquifer_depth_ft"] = np.nan
        return
    centroids = grid.geometry.centroid
    tgt_pts   = np.column_stack([centroids.x, centroids.y])
    src_pts   = df[["lon", "lat"]].values
    interp_depth = idw_k(src_pts, df["depth_ft"].values, tgt_pts)
    grid["aquifer_depth_ft"] = interp_depth.round(1)
    print(f"  aquifer_depth_ft: {interp_depth.min():.1f} - {interp_depth.max():.1f} ft")


def patch_step10(grid, raw):
    """ksat_mean_ums"""
    if "ksat_mean_ums" in grid.columns:
        return
    horizons_path = raw / "soil_profile_horizons.csv"
    coords_path   = raw / "soil_coords.csv"
    if not horizons_path.exists() or not coords_path.exists():
        print("  horizon/coord cache missing; skipping ksat_mean_ums")
        return
    df_h = pd.read_csv(horizons_path)
    for col in ["hzdept_r", "hzdepb_r", "ksat_r"]:
        df_h[col] = pd.to_numeric(df_h[col], errors="coerce")
    df_h["hzdepb_r"] = np.minimum(df_h["hzdepb_r"], 150.0)
    df_h["thickness"] = (df_h["hzdepb_r"] - df_h["hzdept_r"]).clip(lower=0)
    df_h = df_h[df_h["thickness"] > 0]

    records = []
    for mukey, grp in df_h.groupby("mukey"):
        thick = grp["thickness"].values
        ksat_valid = grp["ksat_r"].notna()
        if ksat_valid.any():
            kw = thick * grp["ksat_r"]
            tw = thick[ksat_valid.values].sum()
            wmean_ksat = kw[ksat_valid.values].sum() / tw if tw > 0 else np.nan
        else:
            wmean_ksat = np.nan
        records.append({"mukey": str(mukey), "wmean_ksat": wmean_ksat})

    df_agg = pd.DataFrame(records)
    ksat_med = df_agg["wmean_ksat"].median()
    df_agg["wmean_ksat"] = df_agg["wmean_ksat"].fillna(ksat_med)

    df_coords = pd.read_csv(coords_path, dtype={"mukey": str})
    df = df_agg.merge(df_coords, on="mukey", how="inner")
    if len(df) < 10:
        grid["ksat_mean_ums"] = np.nan
        return

    centroids = grid.geometry.centroid
    tgt_pts   = np.column_stack([centroids.x, centroids.y])
    src_pts   = df[["lon", "lat"]].values
    ksat_interp = idw_k(src_pts, df["wmean_ksat"].values, tgt_pts)
    grid["ksat_mean_ums"] = ksat_interp.round(4)
    print(f"  ksat_mean_ums: {ksat_interp.min():.3f} - {ksat_interp.max():.3f} um/s")


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Add raw columns to completed state grids.")
    parser.add_argument("states", nargs="+", help="State abbreviations (e.g. WA OR TX)")
    args = parser.parse_args()

    root = Path(__file__).parent.parent

    for abbr in args.states:
        cfg = get_state(abbr.upper())
        _, raw, _, grid_path = get_paths(cfg["abbr"])
        print(f"\n=== patch_raws: {cfg['name']} ({cfg['abbr']}) ===")

        grid = gpd.read_file(grid_path)
        print(f"  {len(grid)} cells, {len(grid.columns)} columns before patch")

        patch_step02(grid, raw, root, cfg)
        patch_step03(grid, raw)
        patch_step04(grid, raw, cfg)
        patch_step05(grid, raw, cfg)
        patch_step07(grid, raw, cfg)
        patch_step08(grid, raw)
        patch_step10(grid, raw)

        grid.to_file(grid_path, driver="GeoJSON")
        print(f"  Saved: {len(grid.columns)} columns")
        print(f"  Raw cols added: {[c for c in grid.columns if c not in ['cell_id','geometry'] and not c.endswith('_score')]}")


if __name__ == "__main__":
    main()
