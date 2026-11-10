"""Build a reusable zcta -> ruca_rural lookup from USDA ERS's 2020 ZIP-code RUCA file.

Standard binary convention (the one most commonly used in federal/academic research):
RUCA 1-3 = Metropolitan (urban), RUCA 4-10 = Micropolitan/Small-town/Rural (non-metro).
Source: https://www.ers.usda.gov/data-products/rural-urban-commuting-area-codes
2020 ZIP-code file, downloaded 2026-08-31.

ZIP and ZCTA codes are joined as plain 5-digit strings -- ZCTAs are the Census
Bureau's own approximation of ZIP delivery areas using the same codes, so a direct
string match is the standard, widely-used crosswalk (not a perfect one -- ZCTAs
don't exist for every ZIP and vice versa -- but no exact crosswalk exists since the
two are conceptually different things maintained by different agencies).
"""
import pandas as pd
from pathlib import Path

HERE = Path(__file__).parent
ruca = pd.read_csv(HERE / "labels" / "ruca_2020_zip.csv", dtype={"ZIPCode": str})
ruca["zcta"] = ruca["ZIPCode"].str.zfill(5)
ruca["ruca_rural"] = ruca["PrimaryRUCA"] >= 4

out = ruca[["zcta", "PrimaryRUCA", "ruca_rural"]].drop_duplicates(subset="zcta")
out.to_csv(HERE / "labels" / "zcta_ruca_rural.csv", index=False)
print(f"wrote {len(out)} ZCTA->RUCA rows, {out['ruca_rural'].mean():.1%} rural")
