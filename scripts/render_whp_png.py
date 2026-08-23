"""Colorize whp_wa.npy into a PNG for the wa-fire-risk report's map --
rendered as an image overlay (native raster form), not vectorized into
artificial zones. Pixels outside WA's real boundary are transparent, same
"don't paint what isn't real" discipline as clipping watershed polygons to
each state's own boundary in export_pnw_watersheds.py.

IMPORTANT: whp_wa.npy's pixel grid is axis-aligned in EPSG:5070 (Albers
Conical Equal Area), not in lon/lat. Leaflet's L.imageOverlay only takes a
simple rectangular [[south,west],[north,east]] bounds and stretches the
image into it uniformly -- that's only correct if the source pixel grid is
already axis-aligned in lon/lat. Albers isn't: away from its central
meridian (-96 deg), a fixed row/col grid is rotated relative to true
north by the projection's convergence angle (~14.8 deg at WA's longitude --
confirmed by spot-check: n*(lon-(-96)) with n=0.603 the Albers cone
constant). An earlier version of this script took only the 4 corner points
to build the bounds and stretched the raw Albers-aligned pixels into that
box, which rendered WA rotated ~15 degrees on the map (caught by Simon
visually, not by any automated check -- see CONTEXT.md).

Fixed by inverse-warping: build the output image on a genuine lon/lat grid
(so the bounds rectangle is actually valid), and for each output pixel look
up the corresponding source Albers pixel via pyproj -- same lon/lat ->
Albers lookup analysis_wa_fire_risk.py already does per DC site, just
vectorized over a full grid instead of ~11 points.

SECOND bug, caught by Simon 2026-08-07 from a real screenshot ("it's saying
the fuel is in the river, and the river burned"): the single-point-per-pixel
nearest-neighbor lookup above loses narrow linear features like rivers.
Verified against OSM's real Columbia River geometry near Chelan: the raw
source array (whp_wa.npy) reads water correctly at 96% of real river
points, but the single-sample WGS84 regrid dropped that to 78%. Root cause
is the same ~15deg Albers/WGS84 rotation as the first bug -- nearest-neighbor
resampling a ~1-source-pixel-wide diagonal feature between two differently
rotated grids is a textbook aliasing failure, even though there's no
systematic offset (confirmed separately via cross-correlation against the
South Sound coastline, which found a zero-shift best fit). Fixed by
supersampling each output pixel (SUPERSAMPLE x SUPERSAMPLE sub-points) and
resolving to water if *any* sub-point hits water -- water renders fully
transparent, so being generous about calling something water is the safe
failure mode for a wildfire report (never paint hazard color over a real
river), unlike being generous about any of the actual hazard classes.

THIRD bug, caught by Simon 2026-08-07 ("Tacoma on the fuel map sits in the
water on the background map... correct at the borders, worse in the
middle"): Leaflet's L.imageOverlay doesn't stretch an image linearly by
latitude -- it stretches linearly in Web Mercator space, the same
projection the CartoDB basemap tiles use, since that's what the whole map
runs in internally. This script was building rows spaced uniformly in
degrees of latitude (equirectangular/Plate Carree), not uniformly in Web
Mercator Y. Those are different projections: Mercator Y is a nonlinear
(roughly secant-shaped) function of latitude. Giving Leaflet only the two
corner bounds pins those exactly right -- which is why edges checked out --
but every row between them got linearly interpolated in Leaflet's Mercator
space while the row's actual content was equirectangular-spaced, so the
mismatch is zero at the corners and grows toward the middle of the
image, worst around the vertical center. Fixed by spacing output rows
uniformly in Web Mercator Y (`_mercator_y`/`_inverse_mercator_y` below) so
each row's sampled latitude is exactly where Leaflet will linearly place it.
Longitude/columns needed no change -- Mercator X is already linear in
longitude, no distortion in that direction (matches what Simon
independently reported: no east-west symptom, only north-south).

FOURTH change, requested by Simon 2026-08-07 after the "how is this to be trusted" conversation:
make WHP's documented agricultural/CRP non-burnable blind spot (see CONTEXT.md and
analysis_wa_fire_risk.py's caveats) a first-class visual element instead of something you only
learn from a paragraph of caveat text. Any pixel that MTBS says really burned (1984-2024) but WHP
classifies "non-burnable" now renders in a distinct purple ("blind spot") rather than plain
non-burnable gray -- the disagreement between the two independent datasets IS the finding, so it
gets its own color instead of being invisible. The fire perimeters themselves switched from a
year-colored fill to a plain dashed outline (styling lives in report_wa_fire_risk.html) so the
purple isn't visually competing with a filled polygon on top of it.

Run: python3 scripts/render_whp_png.py
Output: data/shared/whp_wa.png
        data/shared/whp_wa_bounds.json  (Leaflet imageOverlay bounds: [[south,west],[north,east]])
"""
import json
import os

import geopandas as gpd
import numpy as np
from PIL import Image
from pyproj import Transformer
from scipy import stats
from shapely import contains_xy

BASE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
SHARED = os.path.join(BASE, "shared")
OUT_PIXEL_DEG = 0.003  # ~330m at WA's latitude, close to WHP's native 270m
SUPERSAMPLE = 3  # 3x3 = 9 sub-samples per output pixel, water wins on any hit

# 1-5 hazard class -> RGB, low-to-high (green -> red, same palette family as
# the water-stress map's low/high/extremely-high). 6=non-burnable (dim gray,
# shown but visually recessive), 7=water (transparent -- basemap shows water
# better than we can), 255=nodata (transparent).
CLASS_COLORS = {
    1: (76, 175, 130),   # very low -- var(--green)
    2: (76, 175, 130),   # low -- same color as very low, on purpose: the map legend already
                         # merges these two into one "very low/low" swatch (report_wa_fire_risk.html),
                         # but this dict used to give class 2 its own slightly different green,
                         # so the map showed an unlabeled second shade the legend never explained.
                         # Caught by Simon 2026-08-07 ("map only shows one shade of green" was the
                         # legend being right and the raster being wrong, not the other way around).
    3: (224, 192, 96),   # moderate -- var(--yellow)
    4: (224, 130, 70),
    5: (224, 92, 92),    # very high -- var(--red)
    6: (60, 60, 75),     # non-burnable
}
ALPHA = 190
BLIND_SPOT_COLOR = (155, 89, 182)  # purple -- real MTBS burn on WHP-"non-burnable" ground
BLIND_SPOT_ALPHA = 225  # more opaque than the hazard classes -- this is the callout color


def _mercator_y(lat_deg):
    lat_rad = np.radians(lat_deg)
    return np.log(np.tan(np.pi / 4 + lat_rad / 2))


def _inverse_mercator_y(y):
    return np.degrees(2 * np.arctan(np.exp(y)) - np.pi / 2)


def main():
    arr = np.load(os.path.join(SHARED, "whp_wa.npy"))
    t = json.load(open(os.path.join(SHARED, "whp_wa_transform.json")))

    wa = gpd.read_file(os.path.join(BASE, "WA", "raw", "state.geojson"))
    minlon, minlat, maxlon, maxlat = wa.total_bounds
    wa_union = wa.union_all()  # WGS84 -- mask test happens in lon/lat now, no reprojection needed

    ncols = int(np.ceil((maxlon - minlon) / OUT_PIXEL_DEG))
    # Row count from the same physical pixel size at the state's mean latitude --
    # nrows no longer comes from a degrees-of-latitude span, since rows are now
    # spaced by Mercator Y, not by degrees (see module docstring, bug 3).
    nrows = int(np.ceil((maxlat - minlat) / OUT_PIXEL_DEG))
    col_idx, row_idx = np.meshgrid(np.arange(ncols), np.arange(nrows))
    lons = minlon + (col_idx + 0.5) * OUT_PIXEL_DEG

    # Rows spaced uniformly in Web Mercator Y (what Leaflet actually linearly
    # interpolates between the two bounds corners), not uniformly in degrees --
    # then converted back to the real latitude each row must be sampled at.
    ymax, ymin = _mercator_y(maxlat), _mercator_y(minlat)
    row_frac = (row_idx[:, :1] + 0.5) / nrows  # 0 at north edge, 1 at south edge, per-row
    lats = np.broadcast_to(_inverse_mercator_y(ymax - row_frac * (ymax - ymin)), (nrows, ncols))

    to_whp = Transformer.from_crs("EPSG:4326", t["crs"], always_xy=True)

    # Supersample each output pixel's real footprint (not just its center) --
    # single-point nearest-neighbor loses narrow features when the source
    # grid is rotated relative to the output grid (see module docstring).
    sub_offsets = (np.arange(SUPERSAMPLE) - (SUPERSAMPLE - 1) / 2) / SUPERSAMPLE * OUT_PIXEL_DEG
    votes = np.empty((nrows, ncols, SUPERSAMPLE * SUPERSAMPLE), dtype=np.uint16)
    k = 0
    for dlon in sub_offsets:
        for dlat in sub_offsets:
            xs, ys = to_whp.transform((lons + dlon).ravel(), (lats + dlat).ravel())
            src_col = np.round((np.array(xs) - t["origin_x"]) / t["pixel_x"]).astype(int)
            src_row = np.round((t["origin_y"] - np.array(ys)) / -t["pixel_y"]).astype(int)
            valid = (src_row >= 0) & (src_row < arr.shape[0]) & (src_col >= 0) & (src_col < arr.shape[1])
            vals = np.where(valid, arr[np.clip(src_row, 0, arr.shape[0] - 1), np.clip(src_col, 0, arr.shape[1] - 1)], 255)
            votes[:, :, k] = vals.reshape(nrows, ncols)
            k += 1

    any_water = (votes == 7).any(axis=2)
    classes = stats.mode(votes, axis=2, keepdims=False).mode
    classes[any_water] = 7
    print(f"  Output grid: {classes.shape} (lon/lat-aligned, {OUT_PIXEL_DEG} deg/px, "
          f"{SUPERSAMPLE}x{SUPERSAMPLE} supersample, water-priority)")

    rgba = np.zeros((nrows, ncols, 4), dtype=np.uint8)
    for cls, rgb in CLASS_COLORS.items():
        mask = classes == cls
        rgba[mask, 0], rgba[mask, 1], rgba[mask, 2] = rgb
        rgba[mask, 3] = ALPHA
    # class 7 (water) and 255 (nodata/outside source raster) stay alpha=0

    # Blind spot: real MTBS burn on ground WHP calls non-burnable. Overrides the
    # plain non-burnable gray above -- the disagreement between the two
    # independent datasets is the finding, so it gets its own color rather than
    # being indistinguishable from ordinary developed/agricultural land that
    # simply hasn't burned.
    from shapely.geometry import shape as _shape
    perimeters = json.load(open(os.path.join(SHARED, "wa_fire_perimeters.geojson")))
    fire_union = gpd.GeoSeries(
        [_shape(f["geometry"]) for f in perimeters["features"]], crs="EPSG:4326"
    ).union_all()
    in_fire = contains_xy(fire_union, lons, lats)
    blind_spot = (classes == 6) & in_fire
    rgba[blind_spot, 0], rgba[blind_spot, 1], rgba[blind_spot, 2] = BLIND_SPOT_COLOR
    rgba[blind_spot, 3] = BLIND_SPOT_ALPHA
    print(f"  {blind_spot.sum()} pixels are blind spots (burned, WHP calls non-burnable)")

    # Mask to WA's real boundary -- now a direct lon/lat test, no reprojection.
    inside = contains_xy(wa_union, lons, lats)
    rgba[~inside, 3] = 0
    print(f"  {inside.sum()} / {inside.size} pixels inside WA boundary")

    Image.fromarray(rgba, mode="RGBA").save(os.path.join(SHARED, "whp_wa.png"))

    bounds = [[minlat, minlon], [maxlat, maxlon]]  # genuinely axis-aligned now
    with open(os.path.join(SHARED, "whp_wa_bounds.json"), "w") as f:
        json.dump(bounds, f)
    print(f"  Saved whp_wa.png ({os.path.getsize(os.path.join(SHARED, 'whp_wa.png'))/1e6:.2f} MB), bounds={bounds}")


if __name__ == "__main__":
    main()
