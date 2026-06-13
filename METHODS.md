# datacenter_siting — Methods Reference

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

**Source:** Open-Meteo Historical Weather API (ERA5 reanalysis, 1991–2020 climatological mean annual precipitation).
**Method:** Mean annual precipitation per cell centroid queried from ERA5 reanalysis (Zippenfenig, 2023; Hersbach et al., 2023). Normalized 0–1 (high = higher precipitation).
**Rationale:** Cooling tower water demand makes freshwater availability a binding constraint for large hyperscale facilities.

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
**Method:** Mukey → hydrologic soil group (hydgrpdcd) from `muaggatt` table. Score mapping: A = 0.00, B = 0.33, C = 0.67, D = 1.00 (split classes interpolated). One representative mupolygon coordinate per mukey via `MIN(mupolygonkey)`. IDW to cell centroids.
**Rationale:** USDA hydrologic groups A–D directly describe surface-to-groundwater infiltration rate. Group A soils (sands) allow rapid spill percolation; Group D soils (clays) retard it substantially.

---

## Full-Column Soil Profile (Phase 3 extension)

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

## Composite Scoring

All indicator scores are 0–1. Composite suitability = user-weighted sum:

```
S = Σ wᵢ × scoreᵢ,   Σ wᵢ = 1
```

Default preset weights are defined for three stakeholder profiles:
- **Developer** — emphasizes grid access, water, flatness
- **Agency/Permitter** — emphasizes EJ, flood safety, contamination, protected lands
- **Community** — derived from live public survey (Borda count aggregation)

Hard-gated cells (flatness_score = 0 or protected_score = 0) are excluded from top-site rankings regardless of composite score.

---

## Community Survey

**Method:** Public ranking survey using a 12-indicator Borda count. Each respondent ranks all indicators from 1 (most important) to 12. Points assigned: rank r → (N+1−r) where N=12 (rank 1 = 12 points, rank 12 = 1 point, unranked = 0).

Indicator weights derived from submitted rankings:
```
mean_borda(k) = mean Borda score across all respondents for indicator k
w_raw(k) = mean_borda(k) / (1 + stdev_borda(k))
w(k) = w_raw(k) / Σ w_raw
```

Variance discounting reduces the influence of indicators with high disagreement among respondents — an operationalization of the principle that unanimously prioritized concerns should dominate contested ones (Borda, 1781).

One response per IP address; ZIP code entry cross-referenced against study area ZCTAs to confirm residency. IP addresses stored as SHA-256 hashes.

**Snapshot mechanism:** At formal comment deadlines, current weights can be snapshotted with a timestamp label using `manage_survey.py snapshot`. Reports can display both "as of [date]" and "current" community weights.

---

## Interpolation

All indicator IDW uses the formulation from Shepard (1968):

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
- Hersbach, H., et al. (2023). ERA5 hourly data on single levels from 1940 to present. ECMWF. https://doi.org/10.24381/cds.adbb2d47
- Zippenfenig, P. (2023). Open-Meteo Weather API. https://open-meteo.com
- U.S. Census Bureau. (2022). *American Community Survey 5-Year Estimates*. Tables B01003, B02001, B17001. https://www.census.gov/data/developers/data-sets/acs-5year.html
- U.S. Geological Survey. National Water Information System (NWIS). https://waterdata.usgs.gov
- U.S. Energy Information Administration. (2023). *Form EIA-860 Annual Electric Generator Report*. https://www.eia.gov/electricity/data/eia860/
- Federal Emergency Management Agency. National Flood Hazard Layer (NFHL). https://msc.fema.gov/portal/
- U.S. Environmental Protection Agency. Toxics Release Inventory (TRI) Program. https://www.epa.gov/toxics-release-inventory-tri-program
- OpenStreetMap contributors. (2024). OpenStreetMap. https://www.openstreetmap.org (Accessed 2024–2026). License: ODbL 1.0.
