# Merascope — Methods Reference

## Framework

This project is a **GIS-based Multi-Criteria Decision Analysis (GIS-MCDA)** for data center site suitability. The approach draws on the formal GIS-MCDA framework established by Malczewski (1999), in which spatially referenced evaluation criteria are combined using explicit weighting rules to produce a composite suitability surface. The domain application — data center site selection — follows the multi-criteria hierarchical models described by Daim et al. (2012) and Covas et al. (2013), which identify infrastructure, environmental, community, and risk criteria as the primary evaluation axes for facility siting decisions.

A key design principle is **transparency over optimization**: weights are configurable by end users (builders, permit issuers, community members) rather than fixed by the analyst. The tool exposes the weighting mechanism rather than concealing it in a single composite.

---

## Spatial Resolution Tiers

Three tiers of spatial granularity are implemented for different decision stages:

| Tier | Unit | Resolution | Use case |
|---|---|---|---|
| State atlas | 0.15° fishnet (~14 km) | State-wide | Regional screening, cross-state comparison |
| ZCTA study | ZIP Code Tabulation Area | ZIP code | Jurisdiction-scale analysis, demographic alignment |
| Parcel dossier | Assessor parcel | Parcel | Site-specific due diligence |

The fishnet tier uses uniform spatial coverage without population-density bias — appropriate for physical suitability indicators (terrain, seismic, geothermal). The ZCTA tier aligns naturally with demographic data, as EJ and population exposure are natively collected at this resolution by the U.S. Census Bureau.

Hard gates (terrain flatness, protected lands) are applied at the fishnet tier; cells failing the gate are retained in the GeoJSON with score = 0 but excluded from top-site rankings.

---

## Indicators

### 1. Transmission Infrastructure (`tx_score`)

**Source:** EIA Form 860 (power plant generator data), OpenStreetMap high-voltage transmission lines (voltage ≥ 100 kV via Overpass API).
**Method:** IDW interpolation (Shepard, 1968) from EIA plant locations and OSM line centroids to cell centroids. Normalized 0–1 (high = good grid access).
**Rationale:** Proximity to HV infrastructure reduces interconnection cost and permitting risk (Daim et al., 2012).

### 2. Water Availability (`water_score`)

**Source:** PRISM Climate Group 4km 30-year normal annual precipitation (1991–2020), Oregon State University. Downloaded as national GeoTIFF from `data.prism.oregonstate.edu/normals/us/4km/ppt/monthly/prism_ppt_us_25m_2020_avg_30y.zip`.
**Method:** Nearest-pixel sampling of the PRISM 4km grid at each cell centroid. Values in mm/yr. Normalized 0–1 using 5th–95th percentile range within the state.
**Rationale:** PRISM is a spatially interpolated climate dataset derived from thousands of weather stations using terrain-informed regression (Daly et al., 2008). It eliminates the sparse-sampling artifacts that afflict IDW interpolation from a small number of API-queried points, particularly in large arid states (Nevada, Utah) where IDW produces artificially high scores in corners of the sampling grid.

### 3. Environmental Justice Burden (`ej_score`)

**Source:** U.S. Census Bureau American Community Survey (ACS) 2022 5-year estimates. Tables B17001 (poverty), B02001 (race/ethnicity), B01003 (total population).
**Method:** Demographic Index (DI) = mean(poverty rate, minority share), following the EJScreen methodology (EPA, 2024). Inverted: `ej_score = 1 - DI`. At fishnet tier, ACS tract data is spatially joined to cells; at ZCTA tier, native ZCTA-level ACS data is used.
**Rationale:** High community burden near siting locations creates environmental justice concerns and regulatory risk. EJScreen methodology provides a nationally standardized and legally defensible baseline (EPA, 2024).

### 4. Population Exposure (`pop_exposure_score`)

**Source:** ACS 2022 B01003 tract population.
**Method:** Population density per cell (persons/km²) capped at 95th percentile, then inverted. High score = low residential density nearby.
**Rationale:** Data center siting preference for low-density areas minimizes both community opposition and emergency management complexity.

### 5. Seismic Hazard (`seismic_score`)

**Source:** USGS ASCE 7-22 Hazard API (Peak Ground Acceleration, 2% in 50-year return period).
**Method:** API queried on a 50-point grid over the state bbox; IDW to cell centroids. Inverted (high PGA → low score).
**Rationale:** Seismic risk is a material siting consideration for mission-critical infrastructure with strict uptime requirements.

### 6. Flood Zone (`flood_score`)

**Source:** FEMA National Flood Hazard Layer (NFHL) REST API, Special Flood Hazard Area polygons (SFHA zones beginning with 'A' or 'V').
**Method:** Cell centroid intersection with SFHA polygons. Binary: 0 = inside flood zone, 1 = outside. Acquired via 40-tile grid query across state bbox.
**Rationale:** FEMA flood zone location creates insurance, financing, and permitting barriers for large permanent structures (Daim et al., 2012).

### 7. Contamination Proximity (`contamination_score`)

**Source:** EPA Toxic Release Inventory (TRI_FACILITY table via Envirofacts REST API).
**Method:** IDW from TRI facility locations to cell centroids; inverted (high score = far from TRI facilities).
**Rationale:** Proximity to active TRI reporters indicates industrial co-location risk and elevated baseline environmental burden.

### 8. Waterway Proximity (`waterway_score`)

**Source:** OpenStreetMap (OSM) via Overpass API (`waterway=river`).
**Method:** IDW from OSM river line centroids to cell centroids; inverted (high score = far from major rivers). River lines are segmented at 1 km intervals before IDW.
**Rationale:** Proximity to major rivers increases spill-to-water-body risk and triggers FEMA floodplain adjacency review.

### 9. Geothermal Opportunity (`geothermal_score`)

**Source:** International Heat Flow Commission (IHFC) Global Heat Flow Database, Release 2024 (Global Heat Flow Data Assessment Group et al., 2024).
**Method:** IDW from IHFC borehole locations (filtered to state bbox) to cell centroids. 95th percentile cap before IDW to suppress hydrothermal outliers. High score = high heat flow.
**Rationale:** Elevated geothermal gradient indicates potential for direct geothermal cooling or co-generation, reducing PUE and operational carbon intensity.

### 10. Terrain Flatness (`flatness_score` / hard gate)

**Source:** NASA Shuttle Radar Topography Mission (SRTM) 1 arc-second Digital Elevation Model (Farr et al., 2007).
**Method:** SRTM HGT tiles fetched from AWS S3 public bucket, assembled with numpy. Slope computed via `numpy.gradient` (dx corrected for latitude: `dx = resolution * cos(lat) * 111320` m/degree). Flat fraction = share of cell area with slope < 5°. Hard gate: cells with flat_frac < 3% receive flatness_score = 0 (gated out). Continuous score = flat_frac for cells above threshold. No GDAL.
**Rationale:** Level terrain reduces civil construction cost and stormwater engineering complexity for large pad-footprint structures.

### 11. Protected Lands (`protected_score` / hard gate)

**Source:** Esri USA Federal Lands FeatureLayer (NPS, USFWS, DoD, USFS); Census TIGER American Indian/Alaska Native/Native Hawaiian Areas (AIANNH).
**Method:** Intersection of cell polygon with protected land polygons. Hard gate: cells with > 25% overlap receive protected_score = 0. Binary outcome.
**Rationale:** Federal and tribal land designations create acquisition barriers that are functionally prohibitive for commercial siting (Daim et al., 2012).

### 12. Aquifer Depth (`aquifer_score`)

**Source:** USGS National Water Information System (NWIS), discrete field measurements collection (parameter 72019: depth to water level, ft below land surface), accessed via the post-2025 OGC API (api.waterdata.usgs.gov).
**Method:** Median depth per monitoring site (sites with ≥ 2 measurements). IDW from well sites to cell centroids. Normalized to 95th percentile cap (high score = deep water table).
**Rationale:** Shallow aquifers are directly reachable by surface spills. Deep unsaturated zones provide a longer natural attenuation window for site contamination events.

### 13. Soil Drainage Class (`soil_score`)

**Source:** USDA NRCS Soil Survey Geographic Database (SSURGO), accessed via the Soil Data Access REST API (Soil Survey Staff, NRCS, USDA).
**Method (fixed 2026-07-20):** Exact per-grid-cell mukey via SDA's point-in-polygon spatial function `SDA_Get_Mukey_from_intersection_with_WktWgs84`, one call per cell centroid — not interpolated. Score mapping: A = 0.00, B = 0.33, C = 0.67, D = 1.00 (split classes interpolated). Previously used IDW from one representative mupolygon coordinate per mukey (`MIN(mupolygonkey)`), which blended scores across real hydrologic-group boundaries — the same class of artifact PRISM fixed for water_score. Downloading full SSURGO polygon boundaries for a true local spatial join isn't viable (a single state can have 500K+ polygon instances), so the per-cell point-in-polygon call against SDA directly is the practical exact method.
**Rationale:** USDA hydrologic groups A–D directly describe surface-to-groundwater infiltration rate. Group A soils (sands) allow rapid spill percolation; Group D soils (clays) retard it substantially.

---

## Full-Column Soil Profile

**Source:** SSURGO `chorizon` table via Soil Data Access; SoilGrids 2.0 250m global modeled data (Poggio et al., 2021) reserved as gap-fill for sparse-coverage regions.
**Method:** All horizons with top depth < 150 cm queried per map unit. Three indicators:

| Indicator | Column | Aggregation | Score direction |
|---|---|---|---|
| Lime (CaCO3) risk | `caco3_r` (%) | MAX across horizons | High lime = high risk = low score |
| Hydraulic conductivity | `ksat_r` (µm/s) | Thickness-weighted mean | High K-sat = fast permeability = low score |
| Clay (aquitard) | `claytotal_r` (%) | Thickness-weighted mean | High clay = barrier = high score |

Composite `soil_profile_score` = 0.40 × CaCO3 score + 0.35 × K-sat score + 0.25 × clay score.

**CaCO3 scoring:** `1 - min(MAX_caco3 / 15%, 1)`. NaN treated as 0 (no lime detected).
**K-sat scoring:** log-scale inverse — `1 - clip(log1p(ksat) / log1p(100), 0, 1)`. Reference: 100 µm/s (sandy loam boundary between moderate and fast permeability classes).
**Clay scoring:** `clip(wmean_clay / 35%, 0, 1)`. 35% = threshold for strong aquitard.
**Rationale:** The relevant question is not the surface soil class but whether the full sediment column contains mobilization-risk horizons (soluble carbonates, fast-draining sands) at any depth. SSURGO `chorizon` provides this vertical profile; SSURGO `muaggatt` (used in script 09) provides only the surface drainage class.

---

## Supplemental Indicators (scripts 11-16, all 48 states as of 2026-06-23)

Supplemental indicators extend the 16-score core with infrastructure, contamination, and resource-risk signals not available in the initial pipeline. All 7 carry `*_nat` columns after national normalization. Default weight is 0 in the Explorer; users and stewards enable them via weight sliders or template presets.

### 14. Substation Proximity (`substation_score`)

**Source:** EIA Form 860 Annual Electric Generator Report, plant-level file (2024 with 2023 fallback). Each plant is treated as a grid interconnection node — it is substation-connected by definition. Plant capacity (MW) proxies for voltage class. Cached as `data/shared/substations.csv`.
**Method:** KDTree nearest-neighbor lookup. `proximity_component = 1 - (dist / max_dist)`. `capacity_component` = stepped function from 0.10 (<1 MW) to 1.0 (≥500 MW). `substation_score = 0.6 × proximity + 0.4 × capacity`. National normalization via `substation_dist_m` raw column.
**Rationale:** Transmission line proximity (core score 1) captures the wire; substation proximity captures the point-of-interconnection node — the grid element that actually constrains new-load connection cost and timeline.

### 15. Superfund NPL Proximity (`superfund_score`)

**Source:** EPA Envirofacts REST API, `SEMS.SEMS_SITES_VIEW` table (National Priorities List). Same coordinate-parsing logic as `04_environment.py` (`pref_latitude`/`pref_longitude`, DDMMSS fallback). Per-state cache in `data/{STATE}/raw/superfund_sites.csv`.
**Method:** KDTree proximity. p01–p99 normalized within state. Inverted (1 = farthest from NPL site).
**Rationale:** NPL Superfund designation signals documented soil and groundwater contamination with active EPA remediation orders. Proximity increases likelihood of an adjacent plume intersecting the development footprint, triggering Phase I/II ESA requirements and potentially blocking financing.

### 16. RCRA Corrective Action Proximity (`rcra_score`)

**Source:** EPA Envirofacts REST API, `RCRAINFO.BR_REPORTING` table. Per-state cache in `data/{STATE}/raw/rcra_sites.csv`.
**Method:** Same KDTree + normalization pattern as `superfund_score`.
**Rationale:** RCRA corrective action sites carry documented hazardous waste history and active cleanup obligations under 40 CFR Part 264/265. Distinct from NPL in severity and regulatory pathway; both are checked in standard NEPA and environmental due diligence review.

### 17. NAAQS Air Quality Attainment (`air_quality_score`)

**Source:** EPA Green Book GIS non-attainment area shapefiles (national, PM2.5 / PM10 / Ozone designations). Cached as `data/shared/naaqs_nonattainment.geojson`. One-time download on first state run.
**Method:** Binary spatial join of cell centroid to non-attainment polygons. `air_quality_score = 1.0` (attainment) or `0.0` (non-attainment). Also writes raw binary column `naaqs_nonattainment`.
**Rationale:** Non-attainment designation increases permitting burden for backup diesel generation, creates cumulative-impact exposure for EJ-adjacent communities, and is a leading indicator of NAAQS-triggered offset requirements. CAA permitting friction is a material data center siting risk in certain corridors (Central Valley CA, Front Range CO, Houston TX).

### 18. Fiber Infrastructure Proximity (`fiber_score`)

**Source:** PeeringDB `/api/fac` JSON endpoint (free, no auth required). Each record is a carrier-neutral colocation facility — the physical points where long-haul fiber routes terminate and interconnect. Cached as `data/shared/peeringdb_fac.csv`.
**Method:** KDTree proximity. p01–p99 normalized. `fiber_score = 1 - (dist / p99_dist)`.
**Rationale:** Colocation proximity is a strong proxy for fiber route density and long-haul latency. Latency-sensitive workloads (financial services, CDN edge) require sub-5ms access to major peering points. Remote cells with high physical suitability scores may be disqualified by fiber access cost.

### 19. Watershed Water Stress (`water_stress_score`)

**Source:** WRI Aqueduct Water Risk Atlas 3.0 (Hofste et al., 2019), `bws_score` column (baseline water stress, 0–5 scale, where 5 = extremely high). Global dataset; streamed from WRI, extracted, clipped to CONUS (~4,231 watersheds), cached as `data/shared/aqueduct_watersheds.gpkg` (~27 MB). The source ZIP (614 MB) is deleted after extraction to prevent OOM on memory-constrained hosts.
**Method:** Spatial join of cell centroid to Aqueduct watershed polygon. Cells with no match (rare ocean border cases) receive the state median. Inverted normalization: `1 - (bws - min) / (max - min)`. High score = low stress.
**Rationale:** `water_score` (PRISM) captures precipitation supply; `water_stress_score` captures the demand-and-rights side — withdrawal competition, drought curtailment probability, and regulatory restriction risk. The two are complementary: a cell can have high precipitation but high stress if it is in a heavily over-allocated basin (Colorado River system).

### 20. Grid Interconnection Queue Capacity (`grid_capacity_score`)

**Source:** EIA Form 860M (Monthly Electric Generator Report), Planned sheet (monthly release). `iso_queue_mw` = state total MW in planned/proposed status. `operating_mw` = state operating capacity. Cached as `data/shared/eia860m_state_capacity.csv`.
**Method:** `queue_ratio = planned_mw / max(operating_mw, 1)`. State-level metric — all cells in a state receive the same value. `grid_capacity_score = 1 - clip(queue_ratio / p75_ratio_national, 0, 1)`.
**Rationale:** States with high interconnection queue ratios (TX ERCOT, CA CAISO, TX PJM interties) impose 3–7+ year wait times for new large-load interconnection agreements. Queue pressure is a leading indicator of curtailment risk and cost-of-delay. State-level granularity is appropriate because ISO queue backlogs reflect the regulatory authority level, not individual site proximity.

---

## Composite Scoring

All indicator scores are 0–1. Composite suitability = user-weighted sum:

```
S = Σ wᵢ × scoreᵢ,   Σ wᵢ = 1
```

Five steward preset templates are available, returning named weight configurations from `GET /api/steward/presets`. The Explorer also exposes individual weight sliders across all 23 indicators. Unspecified indicators receive weight 0 under a preset; percentages are shares of the 100-point total.

| Preset | Core weights | Supplemental weights | min_score |
|---|---|---|---|
| **Balanced** (default) | tx 40%, water 35%, community 25% | none | 0.40 |
| **Grid-Complete** | tx 25%, water 15%, community 5% | substation 20%, grid_capacity 20%, fiber 15% | 0.40 |
| **Water Durability** | water 45%, tx 20%, community 10% | water_stress 25% | 0.50 |
| **Contamination Screen** | contamination 20%, community 15%, water 10% | superfund 20%, rcra 20%, air_quality 15% | 0.50 |
| **EJ Forward** | community 30%, contamination 15%, water 10%, tx 5% | air_quality 20%, superfund 10%, rcra 10% | 0.55 |

Preset rationale: Balanced is the default screening view and reflects Merascope's Same Score Promise starting point. Grid-Complete targets developers prioritizing shovel-ready interconnection. Water Durability addresses drought-stressed or water-rights-constrained jurisdictions. Contamination Screen front-loads NEPA/EJ due diligence by emphasizing TRI, NPL, RCRA, and air quality together. EJ Forward is designed for jurisdictions with cumulative-impact mandates or health-based siting ordinances, and carries the highest minimum score threshold.

These presets are defined as Python constants in `server.py` (`PRESET_TEMPLATES`). Stewards can also create named custom templates via the `#/steward/templates` interface, which can be locked to geographic zones to gate builder composite scores.

Hard-gated cells (protected_score = 0 or flood_score = 0) receive composite = 0 regardless of weight configuration.

---

## Community Survey

**Method:** Public ranking survey using a 12-indicator Borda count. Each respondent ranks all indicators from 1 (most important) to 12. Points assigned: rank r → (N+1−r) where N=12 (rank 1 = 12 points, rank 12 = 1 point, unranked = 0).

Indicator weights derived from submitted rankings:
```
mean_borda(k) = mean Borda score across all respondents for indicator k
w_raw(k) = mean_borda(k) / (1 + stdev_borda(k))
w(k) = w_raw(k) / Σ w_raw
```

The base rank-to-points conversion follows de Borda (1781). Variance discounting — dividing by `(1 + stdev_borda(k))` before normalizing — is an in-house methodological choice not found in the original formulation; it reduces the influence of contested indicators on the premise that unanimous priorities should carry more weight than those with high respondent disagreement.

One response per IP address; ZIP code entry cross-referenced against study area ZCTAs to confirm residency. IP addresses stored as SHA-256 hashes.

**Snapshot mechanism:** At formal comment deadlines, current weights can be snapshotted with a timestamp label using `manage_survey.py snapshot`. Reports can display both "as of [date]" and "current" community weights.

---

## Interpolation

Applies to transmission distance, seismic, contamination, waterway, geothermal, and aquifer depth. **Not** `soil_score`/`soil_profile_score`/`ksat_score` (exact per-cell point-in-polygon lookup, fixed 2026-07-20 — see "Soil Drainage Class" above) or `water_score` (direct PRISM raster sampling, fixed 2026-06-14).

All remaining indicator IDW uses the formulation from Shepard (1968):

```
z(x) = Σ wᵢ(x) zᵢ / Σ wᵢ(x),   wᵢ(x) = 1 / d(x, xᵢ)^p
```

Default: k=8 nearest neighbors, power p=2. Exact-coincidence handling: if d=0, assign source value directly. Implemented via `scipy.spatial.cKDTree`.

---

## References

**Frameworks and methods:**

- Malczewski, J. (1999). *GIS and Multicriteria Decision Analysis*. John Wiley & Sons, New York. ISBN 9780471329442.
- Daim, T. U., Bhatla, A., & Mansour, M. (2012). Site selection for a data centre — a multi-criteria decision-making model. *International Journal of Sustainable Engineering*, 6(1), 10–22. https://doi.org/10.1080/19397038.2012.719554
- Covas, M. T., Silva, C. A., & Dias, L. C. (2013). On locating sustainable data centers in Portugal: Problem structuring and GIS-based analysis. *Sustainable Computing: Informatics and Systems*, 3(1), 27–35.
- Shepard, D. (1968). A two-dimensional interpolation function for irregularly-spaced data. *Proceedings of the 1968 ACM National Conference*, 517–524. https://doi.org/10.1145/800186.810616
- de Borda, J.-C. (1781). Mémoire sur les élections au scrutin. *Histoire de l'Académie Royale des Sciences*, Paris, 657–665.

**Data sources:**

- Farr, T. G., et al. (2007). The Shuttle Radar Topography Mission. *Reviews of Geophysics*, 45, RG2004. https://doi.org/10.1029/2005RG000183
- Poggio, L., de Sousa, L. M., Batjes, N. H., Heuvelink, G. B. M., Kempen, B., Ribeiro, E., & Rossiter, D. (2021). SoilGrids 2.0: producing soil information for the globe with quantified spatial uncertainty. *SOIL*, 7, 217–240. https://doi.org/10.5194/soil-7-217-2021
- Global Heat Flow Data Assessment Group, et al. (2024). *The Global Heat Flow Database: Release 2024*. GFZ Data Services. https://doi.org/10.5880/fidgeo.2024.014
- Soil Survey Staff, Natural Resources Conservation Service, United States Department of Agriculture. Soil Survey Geographic (SSURGO) Database. Available online at https://sdmdataaccess.sc.egov.usda.gov. Accessed 2026.
- U.S. Environmental Protection Agency. (2024). *EJScreen Technical Documentation Version 2.3*. Office of Environmental Justice and External Civil Rights, Washington, DC. https://www.epa.gov/system/files/documents/2024-07/ejscreen-tech-doc-version-2-3.pdf
- U.S. Census Bureau. (2022). *American Community Survey 5-Year Estimates*. Tables B01003, B02001, B17001. https://www.census.gov/data/developers/data-sets/acs-5year.html
- U.S. Geological Survey. National Water Information System (NWIS), OGC API. https://api.waterdata.usgs.gov
- U.S. Energy Information Administration. (2024). *Form EIA-860 Annual Electric Generator Report*. https://www.eia.gov/electricity/data/eia860/
- U.S. Energy Information Administration. *Form EIA-860M Monthly Electric Generator Report*. https://www.eia.gov/electricity/data/eia860m/
- Federal Emergency Management Agency. National Flood Hazard Layer (NFHL). https://msc.fema.gov/portal/
- U.S. Environmental Protection Agency. Toxics Release Inventory (TRI) Program. https://www.epa.gov/toxics-release-inventory-tri-program
- U.S. Environmental Protection Agency. Superfund National Priorities List (NPL) via Envirofacts. https://www.epa.gov/superfund/superfund-national-priorities-list-npl
- U.S. Environmental Protection Agency. RCRA Corrective Action Sites via Envirofacts. https://www.epa.gov/hwcorrectiveactionsites
- U.S. Environmental Protection Agency. *Green Book: Nonattainment Areas for Criteria Pollutants*. https://www.epa.gov/green-book
- Hofste, R. W., et al. (2019). Aqueduct 3.0: Updated Decision-Relevant Global Water Risk Indicators. *Technical Note*. World Resources Institute, Washington, DC. https://www.wri.org/research/aqueduct-30
- PeeringDB. Carrier-Neutral Colocation Facility Database. https://www.peeringdb.com/api/fac (Accessed 2026).
- OpenStreetMap contributors. (2024). OpenStreetMap. https://www.openstreetmap.org (Accessed 2024–2026). License: ODbL 1.0.
