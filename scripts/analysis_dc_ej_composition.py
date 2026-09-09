"""DC hosting and demographic composition: the poverty-rate gap between ZIP codes hosting a
confirmed data center and those that don't decomposes into a composition effect (racial mix)
and a rate effect (within-race poverty), and the composition effect is what actually drives
the gap -- a real-world case of Simpson's Paradox. Within white residents, or within minority
residents, hosting and non-hosting ZIPs sit close to parity; pool the two populations and a
gap appears, because hosting ZIPs simply have a different racial mix and minority poverty
runs structurally higher nationally, independent of data centers.

Behind /findings/dc-ej-composition (the decomposition narrative) and /findings/dc-ej-map
(the interactive national dot-map) -- same compute(), two pages, so neither can quote a
different number than the other.

Same has_dc definition as the rest of the DC/EJ investigation this finding is drawn from
(data/datacenters/zcta_labels.csv, the multi-source OSM+PeeringDB+IM3+Compute Atlas rollup --
NOT datacenters.db's stricter 2+-independent-source bar used by the fire/water findings;
switching sources would produce different numbers than the already-published LinkedIn series).

Reads two cached 2022 ACS pulls (raw Census API response shape: header row + data rows),
fetched once for the originating investigation (drawing/civil/dc_ej_selection_vs_impact.ipynb)
and copied in as static inputs so this script never hits the Census API at request time:
  - data/shared/acs_zcta_2022_b17001_b02001.json  (B17001 poverty status, B02001 race)
  - data/shared/acs_zcta_2022_b17001a.json        (B17001A poverty status, White alone)

Run: python3 scripts/analysis_dc_ej_composition.py
"""
import csv
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.join(ROOT, "data", "shared")
DATA_ROOT = os.path.join(ROOT, "data")


def _load_json(name):
    with open(os.path.join(BASE, name)) as f:
        return json.load(f)


def _acs_rows_to_dicts(rows):
    header, data = rows[0], rows[1:]
    idx = {name: i for i, name in enumerate(header)}
    out = {}
    for row in data:
        zcta = row[idx["zip code tabulation area"]].zfill(5)
        out[zcta] = {k: row[i] for k, i in idx.items()}
    return out


def _load_labels():
    """zcta -> has_dc (bool), from the same multi-source rollup used throughout the
    LinkedIn DC/EJ series."""
    has_dc = {}
    with open(os.path.join(DATA_ROOT, "datacenters", "zcta_labels.csv")) as f:
        for row in csv.DictReader(f):
            has_dc[row["zcta"].zfill(5)] = row["has_dc"] == "1"
    return has_dc


def _load_model_table():
    """zcta -> {state, lon, lat}, for placing points on the map."""
    out = {}
    with open(os.path.join(ROOT, "notebooks", "cache", "model_table.csv")) as f:
        for row in csv.DictReader(f):
            try:
                out[row["zcta"].zfill(5)] = {
                    "state": row["state"], "lon": float(row["lon"]), "lat": float(row["lat"]),
                }
            except (ValueError, KeyError):
                continue
    return out


def compute():
    acs = _acs_rows_to_dicts(_load_json("acs_zcta_2022_b17001_b02001.json"))
    racepov = _acs_rows_to_dicts(_load_json("acs_zcta_2022_b17001a.json"))
    has_dc = _load_labels()
    geo = _load_model_table()

    per_zcta = {}
    for zcta, row in acs.items():
        rp = racepov.get(zcta)
        if rp is None:
            continue
        try:
            total_pop, total_pov = float(row["B17001_001E"]), float(row["B17001_002E"])
            race_total, white_total = float(row["B02001_001E"]), float(row["B02001_002E"])
            white_pop, white_pov = float(rp["B17001A_001E"]), float(rp["B17001A_002E"])
        except (ValueError, KeyError):
            continue
        if total_pop <= 0 or race_total <= 0 or white_pop <= 0:
            continue
        minority_pop, minority_pov = total_pop - white_pop, total_pov - white_pov
        if minority_pop <= 0:
            continue
        per_zcta[zcta] = {
            "pov_rate": total_pov / total_pop,
            "minority_rate": 1 - (white_total / race_total),   # population share, B02001
            "wht_povrate": white_pov / white_pop,
            "min_povrate": minority_pov / minority_pop,
        }

    hosting = [z for z in per_zcta if has_dc.get(z)]
    nonhosting = [z for z in per_zcta if not has_dc.get(z)]

    def mean(zs, key):
        vals = [per_zcta[z][key] for z in zs]
        return sum(vals) / len(vals)

    wh_, wn_ = mean(hosting, "wht_povrate"), mean(nonhosting, "wht_povrate")
    mh_, mn_ = mean(hosting, "min_povrate"), mean(nonhosting, "min_povrate")
    sh_, sn_ = mean(hosting, "minority_rate"), mean(nonhosting, "minority_rate")
    actual_host, actual_non = mean(hosting, "pov_rate"), mean(nonhosting, "pov_rate")

    # Composition effect, split exactly: (sh-sn)*(mh-wh) = minority_comp + white_comp
    minority_comp = mh_ * (sh_ - sn_)
    white_comp = -wh_ * (sh_ - sn_)
    comp = minority_comp + white_comp

    # Rate effect, split exactly: (1-sn)*white_gap + sn*minority_gap
    white_rate = (1 - sn_) * (wh_ - wn_)
    minority_rate = sn_ * (mh_ - mn_)
    rate = white_rate + minority_rate

    gap = actual_host - actual_non
    # comp + rate reconciles to `gap` only approximately: comp/rate come from averaging
    # separate white/minority ratios and shares, while `gap` averages each ZIP's own combined
    # ratio directly -- averaging ratios first vs. combining-then-implying-a-ratio don't
    # commute. Real, documented residual (see drawing/civil/dc_ej_selection_vs_impact.ipynb),
    # not a bug -- reported alongside the numbers rather than silently reconciled.
    residual = gap - (comp + rate)

    national_nonhost_pov_rate = actual_non

    points = []
    for z in hosting:
        g = geo.get(z)
        if g is None:
            continue
        points.append({
            "zcta": z, "state": g["state"], "lon": g["lon"], "lat": g["lat"],
            "poverty_gap": round(per_zcta[z]["pov_rate"] - national_nonhost_pov_rate, 4),
            "minority_rate": round(per_zcta[z]["minority_rate"], 4),
        })

    return {
        "n_hosting": len(hosting),
        "n_nonhosting": len(nonhosting),
        "national_nonhosting_pov_rate": round(national_nonhost_pov_rate, 4),
        "gap": round(gap, 4),
        "white_comp": round(white_comp, 4),
        "minority_comp": round(minority_comp, 4),
        "comp": round(comp, 4),
        "white_rate": round(white_rate, 4),
        "minority_rate_effect": round(minority_rate, 4),
        "rate": round(rate, 4),
        "residual": round(residual, 4),
        "white_pov_hosting": round(wh_, 4),
        "white_pov_nonhosting": round(wn_, 4),
        "minority_pov_hosting": round(mh_, 4),
        "minority_pov_nonhosting": round(mn_, 4),
        "minority_share_hosting": round(sh_, 4),
        "minority_share_nonhosting": round(sn_, 4),
        "points": points,
    }


if __name__ == "__main__":
    d = compute()
    for k, v in d.items():
        if k == "points":
            print(f"points: {len(v)} hosting ZCTAs with map coordinates")
        else:
            print(f"{k}: {v}")
