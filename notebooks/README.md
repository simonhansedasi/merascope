# ZCTA data-center targeting model

Can we predict which ZCTAs get targeted for data centers, using Merascope's own
23 indicators as features and mapped data centers as labels?

## Notebooks

| notebook | what it does |
|---|---|
| `01_build_dataset.ipynb` | Pulls per-state ZCTA scores + OSM data centers, joins them, writes `cache/model_table.csv` |
| `02_diagnostics.ipynb` | The pre-model check: is this a siting model or an urbanization detector? |
| `03_model.ipynb` | Spatially-blocked nested model comparison, importances, predicted targets |
| `04_labels.ipynb` | Multi-source label rebuild, bias audit, recalibration, tier table |

`dcmodel.py` holds the shared loaders, feature groups and CV helpers.

## Running

Kernel is `merascope` (registered from the conda env of the same name). Notebook 01
downloads ~240 MB of state score files into `cache/` on first run and skips them
afterwards; everything under `cache/` is gitignored.

Nothing here needs the Hetzner data volume — features are pulled over HTTP from
merascope.com, which is also what guarantees we model exactly what the product serves.

## Headline results

Spatially-blocked CV, `has_dc_any` (523 positives, 1.57% base rate). `lift` is
average precision over the base rate; 1.0x = no better than random.

| feature group | lift | ROC AUC |
|---|---|---|
| PHYSICAL only (23 siting indicators) | 1.60x | 0.644 |
| POWER only | 2.91x | 0.757 |
| URBAN only | 4.35x | 0.844 |
| URBAN + POWER | 4.45x | 0.843 |
| URBAN + POWER + PHYSICAL | 4.88x | 0.843 |
| ...plus fiber_score (see note 3) | 14.97x | 0.900 |

On `has_dc_noncolo` (319 positives, co-located facilities stripped): URBAN+POWER+PHYSICAL
reaches **5.63x** and +fiber **7.48x** — the physical indicators do *better* on
greenfield sites, the same gradient as the facility-size result.

Three things to carry out of this:

1. **Physical suitability indicators alone barely predict siting** (1.6x). Existing
   mapped data centers are mostly explained by "this is an industrial part of a city."
2. **The physical increment grows with facility size** — +10% lift on any data center,
   +40% on facilities >= 1 ha. Bigger campuses are more land/terrain/water constrained,
   which is the result that supports the product thesis.
3. **`fiber_score` is ~2/3 leakage, ~1/3 real signal — keep it, but report it
   honestly.** It is built from PeeringDB colocation facilities, and 20.6% of our
   labelled OSM data centers sit within 100 m of one (same building), 43% within 1 km.
   Against the full label fiber multiplies lift by 3.07x; against `has_dc_noncolo`
   (positives >= 1 km from any PeeringDB facility) only 1.33x. Dropping it discards
   real predictive power; quoting the full-label number overstates the model threefold.

## Open decisions

- **Label scale.** `has_dc_any` (523) / `>= 1 ha` (204) / `>= 10 ha` (29). Hyperscale
  is what customers care about but 29 positives is too thin to validate.
- **Retrodiction vs prediction.** Nothing here has a time dimension — only 29 of 1,809
  OSM features carry a `start_date`. A genuine "will be targeted" model needs an
  announced-projects dataset as a forward holdout.
- **Census API key.** Not present on this machine, so real population density is
  missing; `pop_exposure_score_nat` (per-state, p95-clipped) stands in for it. A key
  in `~/.env` as `CENSUS_API_KEY` would sharpen the confound test.


---

## Multi-source labels (notebook 04)

`scripts/17_datacenter_labels.py` rebuilds the ground truth from four sources.
5,736 raw records resolve to **2,302 facilities** (300 m merge radius); 822 are
asserted by 2+ independent sources. Positives per ZCTA: 523 (OSM only) -> **1,196**.

### Data sources and attribution

| source | licence | attribution |
|---|---|---|
| OpenStreetMap | ODbL | (c) OpenStreetMap contributors |
| PeeringDB | open API | PeeringDB |
| IM3 Open Source Data Center Atlas | ODbL (code BSD-2) | Battelle Memorial Institute / IMMM-SFA; OSM-derived |
| Compute Atlas | data CC BY 4.0, code MIT | (c) 2026 Edward Kubiak |

**Attribution is a licence condition for Compute Atlas (CC BY 4.0) and the ODbL
sources — it must appear anywhere this data is published.**

Not used, deliberately: Baxtel, DataCenterMap, Cloudscene. Commercial database
products where the compilation is the business; database rights and ToS make
scraping them a legal exposure. Licence them if their coverage is needed.
compute-atlas.com's robots.txt disallows ClaudeBot and sets `Content-Signal:
ai-train=no`; we read the author's GitHub repo, not the site.

### Did it fix calibration?

Mostly. The worst bin went from **predicted 0.347 vs observed 0.148** to
**predicted 0.349 vs observed 0.307, inside its CI**. Still imperfect: `(0.2, 0.3]`
remains over (0.238 vs 0.174) and a new n=20 top bin is badly over. Good enough to
ship tiers; **not** good enough to print a percentage next to a ZIP code.

### The result that reframes the project

`pop_exposure_score_nat > 0.9` = sparse/rural. National baseline 69.9%.

| label | n | rural share |
|---|---|---|
| OSM only | 523 | 22.8% |
| 4 sources | 1,196 | 29.3% |
| 2+ sources confirmed | 500 | 19.4% |
| **proposed / permitted** | **259** | **66.4%** |

Existing mapped data centers are heavily urban. **Proposed ones are nearly as rural
as the country at large.** The urbanization confound that dominated notebook 03 is
largely an artifact of what has already been built and mapped — it does not carry
over to what is being proposed. That is also why `PHYSICAL only` lift is highest on
the forward label (2.09x vs 1.60x on OSM-only).

Note `has_dc_multi` is the *least* rural label (19.4%) — the sources overlap most in
cities, so demanding multi-source confirmation biases urban. Do not treat it as neutral.

### Tier table (label `has_dc`) — what the public product reports

**Rebuilt 2026-08-24** after the border-ZCTA state fix (see below) changed features
on ~10% of rows. Monotonic across all ten tiers, n=3,325 each.

| tier | hosts a data center | has one proposed | ej_score |
|---|---|---|---|
| 1 | 0.09% | 0.06% | 0.811 |
| 5 | 0.96% | 0.36% | 0.750 |
| 8 | 4.96% | 1.71% | 0.659 |
| 9 | 8.90% | 1.23% | 0.577 |
| 10 | 15.18% | 2.01% | 0.520 |

Both rates are measured over the SAME ZIPs in each row — one binning, on the
`has_dc` score. The separate forward-label ranking was retired; see the README's
"One binning, two rates". Do not quote the bottom-to-top ratio: tier 1 holds 3
positives of 3,326 and it swings on a single facility.

The `ej_score` column falls monotonically (lower = more community burden). That skew
is real and gets stated as a finding, not hidden.

### Forward-looking model

`has_dc_forward` (proposed/permitted, 259 positives) is the honest basis for any
"will be targeted" claim, and it is much weaker — it was 21x top-vs-bottom as its own
ranking, and its bottom half was not monotonic. It now lives as the second RATE on
the exposure bins rather than as a ranking of its own. Its distinctive population is
still visible: Kokomo IN, Blythe CA, Ennis TX, Los Lunas NM, Stillwater OK — small
towns, not metros.

### Border ZCTAs (fixed 2026-08-24)

3,365 ZCTAs (10%) appear in 2+ state files carrying the full unclipped polygon, so
the old "keep the largest area" dedup in `load_zctas` was a tie every time and pandas
handed each to whichever state came first in `STATES`. Because normalization is
state-relative, that also picked arbitrary FEATURE values — 18 of 23 `_nat` columns
differ between copies. Now resolved by overlay against TIGER state polygons. 1,675
rows changed state; lift 4.10x -> 4.18x. **Everything above the "Multi-source labels"
heading was computed before this fix and has not been recomputed.**
