"""
make_seattle_report.py -- regenerate funding/seattle_duwamish_sample_report.md from the
outputs of parcels/seattle_sample.py and notebooks/seattle_parcel_sensitivity.ipynb.

Run from the merascope repo root after both have run:
  /home/simonhans/anaconda3/envs/merascope/bin/python3 parcels/make_seattle_report.py

The report text (sensitivity numbers, plateau counts, code findings) is hand-written into this
file's template; when the scoring script or notebook results change, update the numbers here.
Writes to funding/ (git-ignored).
"""
import pandas as pd, json, numpy as np

O = 'data/WA/parcels/seattle_duwamish_'
d = pd.read_csv(O + 'scored.csv')
v1 = pd.read_csv(O + 'scored_v1.csv')
v2 = pd.read_csv(O + 'scored_v2.csv')
meta = json.load(open(O + 'meta.json'))
rob = pd.read_csv(O + 'robust.csv')
ng = d[~d.gated]
f = meta['funnel']
ex = meta['excluded_by_use']
ACRE = 4047.0


def addr(a):
    return str(a).strip() if isinstance(a, str) else '(no address)'


def fl(r):
    names = [('res<100ft', 'flag_res_within_100ft'), ('recept<100ft', 'flag_receptor_within_100ft'),
             ('nbr bldg<10ft', 'flag_neighbor_bldg_within_10ft'), ('wetland', 'flag_wetland'),
             ('landfill', 'flag_landfill'), ('slide', 'flag_slide'), ('lowflow', 'flag_low_fire_flow')]
    return ','.join(n for n, c in names if r[c]) or '-'


def table(df):
    rows = [f"| {int(r.PIN):010d} | {addr(r.ADDR_FULL)} | {str(r.zoning).strip()} | {str(r.PREUSE_DESC).strip()} | "
            f"{r.acres:.1f} | {r.usable_area_m2 / ACRE:.2f} | {r.res_dist_m / 0.3048:.0f} | {r.parcel_score:.3f} | {fl(r)} |"
            for _, r in df.iterrows()]
    head = ("| PIN | Address | Zoning | Current use | Acres | Usable acres | To residential (ft) | Score | Flags |\n"
            "|---|---|---|---|---|---|---|---|---|\n")
    return head + '\n'.join(rows)


top = ng.sort_values('parcel_score', ascending=False).head(10)
robtop = rob[rob.acres >= 1.0].sort_values('parcel_score', ascending=False).head(10)
excl = '; '.join(f"{k}: {v}" for k, v in ex.items())
sub = ng.ctx_substation_osm_m
n_util = int(ng.use_status.str.startswith('utility').sum())

md = f"""# Sample site screening report: Duwamish industrial area, Seattle (v3)

Battery energy storage (BESS) screening of King County parcels, rerun 2026-10-29. This is an internal proof of concept for the parcel-level service, not a client deliverable. v3 adds utility-data findings, a zoning use-status check, published-reference scales and a sensitivity analysis.

## Scope and limitations

This is a desktop screening based on public datasets, intended for use before site-specific studies. It is not a permit application, a permitting or eligibility determination, an engineering, geotechnical, or hydrologic opinion, or legal advice. Zoning use allowances, utility interconnection, fire-code requirements, parcel ownership and availability must be confirmed with the relevant agencies and owners. The component weights are illustrative judgements with no outcome data behind them; some distance scales come from published draft or peer ordinances, which are not Seattle law.

## What changed since v2

Scales were recalibrated to published references (below). The neighbor-building distance was replaced by a usable-area measure built on the 10 ft separation in the Seattle Fire Code. A zoning use-status column was added. Mapped substations were added as context only. A sensitivity notebook (notebooks/seattle_parcel_sensitivity.ipynb) tests how much the ranking depends on the assumptions.

## What was screened

Sample area: lon {meta['bbox'][0]} to {meta['bbox'][2]}, lat {meta['bbox'][1]} to {meta['bbox'][3]} (SODO, Georgetown, South Park). Parcels come from the King County parcel layer. Zoning, hazard (ECA), 2023 building outlines, fire station, hospital, school and community center layers come from the City of Seattle's public GIS services, fetched over a 0.01 degree padded box. Everything is cached under data/WA/parcels/ and the run is reproducible with parcels/seattle_sample.py.

Funnel: {f['fetched']:,} parcels in the box; {f['min_acres']} at or above {meta['min_acres']} acre (assumed minimum footprint); {f['use_filtered']} after removing parcels whose county use code is not realistically available to a developer ({excl}); {f['screened']} after removing {f['residential_zoned_removed']} residentially zoned parcels; {len(ng)} after the flood gate ({meta['n_gated']} gated: more than 50 percent of the parcel is in the city's ECA flood-prone area).

## How parcels are scored

Seven components, each 0 to 1 with higher being better. Weights are judgements; scales are tied to the references in the validation section.

| Component | Weight | Full score at | Basis |
|---|---|---|---|
| Residential setback | 20 | 500 ft to residentially zoned land | Whitman County WA draft (500 ft); Thurston County WA model recommendation (100 ft) |
| School, hospital, community center | 10 | 500 ft | Same basis as above |
| Usable area | 15 | 1 acre usable | Area left after a 10 ft inset from lot lines and 10 ft around buildings on the parcel (2021 Seattle Fire Code 1207.8.3); the 1 acre scale is an assumption |
| Transmission | 15 | WA ZCTA distance scale | Distance to nearest mapped transmission line |
| Flood | 15 | no overlap | Share of parcel outside the ECA flood-prone area |
| Liquefaction | 10 | no overlap | Share outside the ECA liquefaction-prone area |
| Site hazard | 15 | no overlap | Share outside ECA steep slope, known slide, wetland and historical landfill |

ZIP-code (ZCTA) values (grid capacity, seismic, community, EJ priority area) stay as area-context columns and are not in the ranking, since the free map already carries them.

## Utility data (item 4)

What exists publicly: Seattle City Light publishes line, pole and energization-project layers on Seattle's GIS open data site. The lines layer has only a subtype code and a conductor type (overhead or underground), with no voltage or capacity, so it cannot rank parcels and was not used. I found no public substation hosting-capacity or interconnection-capacity map; the City Light 2021 Grid Modernization Roadmap lists feeder-level hosting capacity as a future state. SCL's website says it has 16 major substations but gives no capacity data.

What was used: three substations mapped in OpenStreetMap over the padded box (Massachusetts, South and Delridge; two small transition stations were excluded). Distance to the nearest one is a context column (median {sub.median():.0f} m, range {sub.min():.0f} to {sub.max():.0f} m for non-gated parcels). OSM coverage is partial, and distance says nothing about available capacity, so this is not in the score. Real interconnection capacity would have to come from Seattle City Light directly.

## Zoning use status (item 5)

Finding: battery storage is not named in the Seattle use tables I found, so what a developer can build depends on how the City classifies it.

- Chapter 23.50A (the industrial zones MML, II, UI and IC) has a use table, Table A for 23.50A.004. In the City's OPCD draft ordinance for that chapter (adopted July 2023 according to OPCD materials; the codified text should be checked), "Utility services uses" are permitted (P) in all four zones, and "Power plants" are P in MML and II, prohibited in UI and a council conditional use in IC.
- The code definition I could retrieve (2009 Title 23 archive; it may have been amended) says a utility services use "provides the system for transferring or delivering power, water, sewage, storm water runoff, or other similar substances" and gives electrical substations as an example. A power plant is a use in which electricity is produced. Storage neither produces nor simply delivers power, so neither category clearly fits.
- Unlisted uses are not permitted unless the Director decides they are substantially similar to a listed use (SMC 23.42.010), so a BESS may need a Director's interpretation. I found no published SDCI interpretation placing BESS in a category.
- Permits that apply regardless: Seattle Fire Department requires a permit for stationary energy storage systems (Administrative Rule 12.01.22; annual permit code 6401), and SDCI's electrical permit routes energy storage through an ESS questionnaire.

In the data, {n_util} of {len(ng)} non-gated parcels are in zones where utility services uses are P in the draft table; the rest (neighborhood commercial, commercial, Seattle mixed) were not checked. Each parcel carries a use_status text column saying exactly this and no more.

## Validation (item 6)

### Parameters against published references

| Parameter | Used | Reference | Note |
|---|---|---|---|
| Spacing to lot lines and buildings | 10 ft inset | 2021 Seattle Fire Code 1207.8.3: 10 ft minimum, 3 ft with a fire barrier or 2-hour wall | Primary source, Seattle's adopted code |
| Remote installation | not scored | 2021 Seattle Fire Code 1207.8.1: more than 100 ft from exposures | Reduces some requirements, subject to the fire code official |
| Residential setback | full score at 500 ft | Whitman County WA draft: 500 ft for 0.6 to 200 MWh systems; Thurston County WA model recommendation: 100 ft to adjacent residential property; peer counties: 200 to 600 ft | Draft and peer rules, not Seattle law; the range is wide |
| Receptor distance | full score at 500 ft | Whitman draft and peer counties: 500 to 600 ft from occupied structures | Same caveat |
| Minimum useful footprint | 1 acre usable | none found | Judgement; the most influential unreferenced assumption (see below) |
| Component weights | 20/10/15/15/15/10/15 | none | Judgements |
| Zoning use | status column only | City 23.50A.004 table and definitions | BESS classification unresolved |

### Sensitivity of the ranking to the assumptions

Method: rebuild the score under alternative scales and weights and compare it with the base ranking (rank correlation, and how many of the base top 50 stay in the top 50). Details are in the notebook.

Important caveat first: the top of the ranking is a plateau, not a ladder. The score has a ceiling of 0.900, 37 parcels sit within 0.002 of it and 74 within 0.01, and the top 50 contain only 20 distinct score values. 103 of the {len(ng)} non-gated parcels earn full marks on residential setback, receptor distance and usable area at once. Inside that group the model cannot say which parcel is better, so the top-50 overlap figures below are partly decided by tie-breaking order and should be read loosely. Rank correlation and the robust-candidate set (top-quartile membership) are the more reliable statistics.

- Weights barely matter. Equal, safety-heavy and grid-heavy weight sets gave rank correlations of 0.97 to 0.99 (top-50 overlap 46 to 48). Across 300 random weight draws (each weight scaled by 0.5 to 1.5), the mean rank correlation was 0.97 and the worst was 0.88.
- The ranking is carried by two components. Dropping usable area drops the rank correlation to 0.46 (top-50 overlap 10 of 50); dropping the residential setback drops it to 0.73 (overlap 40). Dropping any other component leaves it at 0.92 or above, because transmission, receptor distance and liquefaction hardly vary across this area.
- The usable-area scale matters a lot and has no reference. The residential scale (100 to 984 ft) moves the rank correlation only to 0.89 to 0.94, but the usable-area scale moves top-50 membership heavily: with a 0.25 acre scale only 17 of the base top 50 remain, at 0.5 acre 22, at 2 acres 27.
- Robust candidates: {len(rob)} of {len(ng)} non-gated parcels are in the top quartile in at least 80 percent of 310 variants (all the scale changes, weight sets and random draws). All 50 of the base top 50 are in that group. These are the parcels whose standing does not depend on the assumptions, and they are listed in data/WA/parcels/seattle_duwamish_robust.csv.

What this does and does not validate: it shows the ranking is stable to weights and to the residential scale, and it identifies which assumption to pin down first. It does not show the ranking predicts what gets permitted or built; there is no outcome data in this analysis.

### Questions to put to prospective buyers

1. What minimum usable footprint (acres or square feet) do you need for the projects you screen, and does it change with project size in MW and MWh?
2. What disqualifies a site outright for you, before any study?
3. What residential setback do you plan around in Seattle and in the other jurisdictions you work in?
4. Which agencies or utilities do you check first, and what do you ask them?
5. Do you treat sites within 100 ft of other parcels' buildings differently from isolated ones?
6. What data do you pay for today to do this screening, and what does it cost?
7. Which of these would change a go or no-go decision: ownership, zoning, interconnection availability, or hazard overlays?

## Results

Score spread among non-gated parcels: standard deviation {ng.parcel_score.std():.3f} (v2 {v2[~v2.gated].parcel_score.std():.3f}, v1 {v1[~v1.gated].composite.std():.3f}). Spread is not the test of quality; see the sensitivity section.

Flags among the {len(ng)} non-gated parcels: residentially zoned land within 100 ft {int(ng.flag_res_within_100ft.sum())}, within 500 ft {int(ng.flag_res_within_500ft.sum())}; school, hospital or community center within 100 ft {int(ng.flag_receptor_within_100ft.sum())}; another parcel's building within 10 ft of the lot line {int(ng.flag_neighbor_bldg_within_10ft.sum())}; wetland {int(ng.flag_wetland.sum())}; historical landfill {int(ng.flag_landfill.sum())}; known slide {int(ng.flag_slide.sum())}; low fire flow area {int(ng.flag_low_fire_flow.sum())}.

Top 10 non-gated parcels by score:

{table(top)}

Top robust candidates of 1 acre or more (by score):

{table(robtop)}

The parcels at the top tie at the 0.900 ceiling, so the order within the table above is arbitrary; read it as a tier of parcels that clear every screen in this model, not as a ranking.

Several of the highest-ranked parcels have no street address and are vacant lots, which may be fragments, easements or landlocked; shape and access need a manual check. Ownership and availability are not in this data.

## Still needed for a client-ready version

- Seattle City Light interconnection capacity for specific sites (not public).
- Confirmation from the City of how battery storage is classified in each zone, and a check of the commercial and mixed-use zone tables.
- Answers to the buyer questions above, especially the minimum footprint.
- Data that can separate the parcels inside the top tier: interconnection capacity, parcel ownership and availability, and project-specific footprint needs.
- Parcel ownership and availability.
- A client-facing report format with the scope statement attached, and a check of the draft-vs-codified zoning table.

## Sources

King County GIS Parcels (gismaps.kingcounty.gov, Property/KingCo_PropertyInfo/MapServer/2). City of Seattle GIS (services.arcgis.com, org ZOyb2t4B0UYuYNYH): zoning, ECA hazard layers, Building Outlines 2023, Fire Stations, Hospital, schools, Community Centers, Low Fire Flow Areas, EJ Priority Areas, Seattle City Light Lines. OpenStreetMap power=substation via Overpass. 2021 Seattle Fire Code, Chapter 12 (seattle.gov, SDCI). Seattle OPCD, Chapter 23.50A draft ordinance (seattle.gov, industrialmaritimenewindustrialzoningordinance.pdf). Seattle Municipal Code Title 23, 2009 archive (clerk.seattle.gov). Whitman County, BESS Ordinance Comparison Table (2026-04-01). Seattle Fire Department Administrative Rule 12.01.22. SDCI Tip 420. Seattle City Light 2021 Grid Modernization Plan. All fetched 2026-10-29.
"""
open('funding/seattle_duwamish_sample_report.md', 'w').write(md)
print(len(md.split()), 'words; robust', len(rob), '; utility-P parcels', n_util)
