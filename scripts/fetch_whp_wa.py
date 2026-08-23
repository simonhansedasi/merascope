"""One-time fetch: USFS Wildfire Hazard Potential (WHP) 2020, cropped to
Washington -- the fire-risk equivalent of PRISM in 02_indicators.py. WHP is
an agency-scored index (fuel + weather + topography + historical fire
occurrence already folded in), read directly rather than building our own
temperature+history composite.

The WHP download bundles a File Geodatabase (needs GDAL/ESRI FileGDB API --
off-limits per CLAUDE.md's no-GDAL rule) but ALSO ships plain GeoTIFF
exports with .tfw worldfiles under Data/whp2020_GeoTIF/. Using
whp2020_cls_conus.tif -- the classified 1-5 hazard-potential product (same
"very low".."very high" classes USFS publishes), not the continuous score,
so this reads the same way the water report's Aqueduct tag (low/high/
extremely high) does. Confirmed via the shipped .xml metadata: Albers
Conical Equal Area, NAD83, standard parallels 29.5/45.5, central meridian
-96 -- i.e. EPSG:5070 (NAD83 / Conus Albers), same equal-area CRS already
used for area math in export_pnw_watersheds.py and this script's sibling.

Pixel values (confirmed by direct inspection): 1-5 = hazard class (low to
very high), 6 = non-burnable, 7 = water, 255 = nodata/outside raster extent.

No rasterio/GDAL: PIL reads the TIFF pixels, the .tfw worldfile gives the
affine transform directly (6 plain numbers, no embedded-tag parsing
needed), pyproj reprojects WA's lon/lat bbox into EPSG:5070 to compute the
crop window -- same PIL-for-raster / pyproj-for-projection pattern as
fetch_prism_ppt in 02_indicators.py, extended because WHP isn't in
plate-carree like PRISM.

Run: python3 scripts/fetch_whp_wa.py
Output: data/shared/whp_wa.npy (uint8 class array)
        data/shared/whp_wa_transform.json (crop's own affine origin + pixel size + CRS)
"""
import json
import os
import zipfile

import geopandas as gpd
import numpy as np
import requests
from PIL import Image
from pyproj import Transformer

Image.MAX_IMAGE_PIXELS = None  # WHP CONUS tif is 17132x10803 -- not a decompression bomb

BASE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
SHARED = os.path.join(BASE, "shared")
WHP_CRS = "EPSG:5070"

WHP_URL = "https://www.fs.usda.gov/rds/archive/products/RDS-2015-0047-3/RDS-2015-0047-3.zip"
TIF_MEMBER = "Data/whp2020_GeoTIF/whp2020_cls_conus.tif"
TFW_MEMBER = "Data/whp2020_GeoTIF/whp2020_cls_conus.tfw"

PAD_M = 20_000  # 20km pad around WA's reprojected bbox so edge pixels aren't clipped


def _read_tfw(path):
    """.tfw worldfile: 6 lines -- pixel_x, rot, rot, pixel_y (negative), origin_x, origin_y
    (origin = center of the top-left pixel, per Esri worldfile spec)."""
    vals = [float(x) for x in open(path).read().split()]
    px, _, _, py, ox, oy = vals
    return px, py, ox, oy


def fetch_whp():
    """Download WHP (stream to disk), extract only the CONUS classified
    GeoTIFF + worldfile (23 MB) from the 398 MB archive, then delete the zip."""
    zip_path = os.path.join(SHARED, "whp_dl.zip")
    tif_path = os.path.join(SHARED, "whp2020_cls_conus.tif")
    tfw_path = os.path.join(SHARED, "whp2020_cls_conus.tfw")

    if os.path.exists(tif_path) and os.path.exists(tfw_path):
        print("  Cached: whp2020_cls_conus.tif already extracted")
        return tif_path, tfw_path

    if not os.path.exists(zip_path):
        print("  Downloading USFS Wildfire Hazard Potential (streaming to disk, ~398 MB)...")
        r = requests.get(WHP_URL, timeout=900, stream=True,
                          headers={"User-Agent": "datacenter-siting-research/1.0"})
        r.raise_for_status()
        total = 0
        with open(zip_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8 * 1024 * 1024):
                f.write(chunk)
                total += len(chunk)
        print(f"  Downloaded {total / 1e6:.1f} MB -> {os.path.basename(zip_path)}")

    try:
        with zipfile.ZipFile(zip_path) as z:
            for member, dest in [(TIF_MEMBER, tif_path), (TFW_MEMBER, tfw_path)]:
                with z.open(member) as src, open(dest, "wb") as out:
                    out.write(src.read())
        print(f"  Extracted {os.path.basename(tif_path)} + worldfile")
        return tif_path, tfw_path
    finally:
        if os.path.exists(zip_path):
            os.unlink(zip_path)


def crop_to_wa(tif_path, tfw_path):
    px, py, ox, oy = _read_tfw(tfw_path)
    arr = np.array(Image.open(tif_path))
    nrows, ncols = arr.shape
    print(f"  Full CONUS raster: {arr.shape}, pixel size {px}m")

    wa = gpd.read_file(os.path.join(BASE, "WA", "raw", "state.geojson"))
    minlon, minlat, maxlon, maxlat = wa.total_bounds
    to_whp = Transformer.from_crs("EPSG:4326", WHP_CRS, always_xy=True)
    # Reproject all 4 corners, not just min/max lon/lat -- Albers isn't axis-aligned
    # with lon/lat, so a corner-only transform of the diagonal could clip a side.
    corners = [(minlon, minlat), (minlon, maxlat), (maxlon, minlat), (maxlon, maxlat)]
    xs, ys = zip(*(to_whp.transform(lon, lat) for lon, lat in corners))
    x0, x1 = min(xs) - PAD_M, max(xs) + PAD_M
    y0, y1 = min(ys) - PAD_M, max(ys) + PAD_M

    col0 = max(0, int((x0 - ox) / px))
    col1 = min(ncols, int((x1 - ox) / px) + 1)
    row0 = max(0, int((oy - y1) / -py))
    row1 = min(nrows, int((oy - y0) / -py) + 1)

    crop = arr[row0:row1, col0:col1]
    crop_ox = ox + col0 * px
    crop_oy = oy + row0 * py  # py is negative; row0 moves origin down (south)
    print(f"  WA crop: {crop.shape} pixels")

    np.save(os.path.join(SHARED, "whp_wa.npy"), crop)
    transform = {"origin_x": crop_ox, "origin_y": crop_oy, "pixel_x": px, "pixel_y": py, "crs": WHP_CRS}
    with open(os.path.join(SHARED, "whp_wa_transform.json"), "w") as f:
        json.dump(transform, f)
    print("  Saved whp_wa.npy + whp_wa_transform.json")
    return crop, transform


def main():
    os.makedirs(SHARED, exist_ok=True)
    tif_path, tfw_path = fetch_whp()
    crop_to_wa(tif_path, tfw_path)
    os.unlink(tif_path)
    os.unlink(tfw_path)


if __name__ == "__main__":
    main()
