/* ── Pricing, Login, Methodology ── */

/* ── pricing: two workspaces, each with its own schematic ── */
function TierRow({ name, price, per, blurb, cta, kind }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '13px 0', borderBottom: '1px solid var(--line-soft)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontSize: 14.5 }}>{name}</b>
        <div className="microcopy" style={{ marginTop: 2 }}>{blurb}</div>
      </div>
      <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        <span className="score-serif" style={{ fontSize: 21 }}>{price}</span>
        <span style={{ color: 'var(--slate)', fontSize: 12.5 }}>{per}</span>
      </div>
      <button className={'btn btn-sm ' + kind}>{cta}</button>
    </div>
  );
}

function PricingPage() {
  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '36px 24px 60px' }} data-screen-label="Pricing">
      <PageHead eyebrow="Pricing" title="Two workspaces. One engine."
        sub="Builder and Steward are priced separately because they buy different work — never different numbers." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 18, alignItems: 'stretch' }}>
        {/* Builder mode */}
        <div className="card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: 'var(--sand)', borderBottom: '1px solid var(--line-soft)', padding: '16px 22px', display: 'flex', gap: 11, alignItems: 'center' }}>
            <span style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--sand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--line)' }}><Icon name="pylon" size={19} color="var(--basalt)" /></span>
            <div>
              <h3 style={{ fontSize: 17 }}>Builder workspace</h3>
              <span className="microcopy">Developers, operators, capital</span>
            </div>
          </div>
          <div style={{ padding: '6px 22px 18px', flex: 1 }}>
            <TierRow name="Individual" price="$149" per="/mo" cta="Start now" kind="btn-quiet"
              blurb="Full indicator set · grid resolution · exports · shareable weights" />
            <TierRow name="Group" price="from $24k" per="/yr" cta="Start trial" kind="btn-primary"
              blurb="Seats & workspaces · ZCTA + parcel layers · API · watchlists · Site Lab · portfolio screening" />
            <TierRow name="Enterprise" price="Custom" per="" cta="Talk to us" kind="btn-quiet"
              blurb="SSO · dossier credits · field-survey marketplace · named account manager" />
            <p className="microcopy" style={{ margin: '12px 0 0' }}>Site dossiers $25–75k · field surveys proctored & tracked with chain-of-custody.</p>
          </div>
        </div>
        {/* Steward mode */}
        <div className="card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: 'var(--mist)', borderBottom: '1px solid var(--line-soft)', padding: '16px 22px', display: 'flex', gap: 11, alignItems: 'center' }}>
            <span style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--sand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--line)' }}><Icon name="gavel" size={19} color="var(--evergreen)" /></span>
            <div>
              <h3 style={{ fontSize: 17 }}>Steward console</h3>
              <span className="microcopy">Agencies, counties, commissions, tribal governments</span>
            </div>
          </div>
          <div style={{ padding: '6px 22px 18px', flex: 1 }}>
            <TierRow name="County / single office" price="from $12k" per="/yr" cta="Talk to us" kind="btn-quiet"
              blurb="Docket lite · report cards · fact sheets · hearing exhibits" />
            <TierRow name="State agency" price="from $60k" per="/yr" cta="Talk to us" kind="btn-primary"
              blurb="Full Docket · impasse register · litigation exports · Entra ID SSO · all geographies" />
            <TierRow name="Mandated studies" price="$75–400k" per="" cta="Scope it" kind="btn-quiet"
              blurb="Study workbench · statutory deadline tracking · expert bench testimony" />
            <p className="microcopy" style={{ margin: '12px 0 0' }}>Procurement-friendly contracting · sovereign consultation support built in.</p>
          </div>
        </div>
      </div>
      {/* free band */}
      <div className="panel" style={{ marginTop: 18, padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <b style={{ fontSize: 14.5 }}>Free, and it stays free</b>
          <p style={{ margin: '3px 0 0', fontSize: 13.5, color: 'var(--slate)', maxWidth: 620 }}>The Public Explorer, report cards, methodology, and fact sheets. They are the point, not the funnel.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="btn btn-quiet btn-sm" href="#/explorer">Open the Explorer</a>
        </div>
      </div>
      {/* performance participation */}
      <div className="callout" style={{ marginTop: 12, padding: '14px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <b style={{ fontSize: 14 }}>Performance participation</b>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--slate)', maxWidth: 640 }}>Success-linked structures for placed sites — compensation indexed to long-run site truth, which enforces the firewall from the inside.</p>
        </div>
        <button className="btn btn-quiet btn-sm">Talk to us</button>
      </div>
      <p className="microcopy" style={{ textAlign: 'center', marginTop: 22 }}>
        ◈ Every tier sees the same scores. Paid tiers buy resolution and workflow — never outcomes.
      </p>
    </div>
  );
}

/* ── login / auth ── */
const NEW_ROLES = [
  { id: 'builder', name: 'Builder', desc: 'Developers, operators, capital' },
  { id: 'steward', name: 'Steward', desc: 'Agencies, counties, commissions, tribal governments' },
  { id: 'reporter', name: 'Reporter', desc: 'Verified press — read-only scores & fact sheets' }
];

function LoginPage() {
  const M = window.MERA;
  const { setRole } = React.useContext(AuthCtx);
  const [err, setErr] = React.useState(null);
  const [newRole, setNewRole] = React.useState('builder');
  const [w, setW] = React.useState({ ...M.DEFAULT_WEIGHTS });
  React.useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let flip = false;
    const t = setInterval(() => { flip = !flip; setW(normalizeWeights({ ...M.DEFAULT_WEIGHTS }, 'community', flip ? 45 : 25)); }, 2800);
    return () => clearInterval(t);
  }, []);
  const enter = r => { setRole(r); location.hash = r === 'builder' ? '#/builder' : r === 'steward' ? '#/steward' : '#/factsheets'; };
  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 56px)' }} data-screen-label="Login">
      <div style={{ flex: '1 1 440px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: 372 }}>
          <h2 style={{ fontSize: 26 }}>Welcome back to the map.</h2>
          <p style={{ color: 'var(--slate)', fontSize: 14.5, margin: '6px 0 22px' }}>Same scores as everyone else. Your workspace on top.</p>
          <form onSubmit={e => { e.preventDefault(); setErr("That didn't match. Try again, or reset below."); }} style={{ display: 'grid', gap: 10 }}>
            <input placeholder="Email" type="email" required style={{ padding: '10px 13px', border: '1px solid var(--line)', borderRadius: 7, fontSize: 14.5, background: 'var(--sand)', color: 'var(--ink)' }} />
            <input placeholder="Password" type="password" required style={{ padding: '10px 13px', border: '1px solid var(--line)', borderRadius: 7, fontSize: 14.5, background: 'var(--sand)', color: 'var(--ink)' }} />
            {err && <div style={{ background: 'var(--hi-bg)', color: 'var(--hi-tx)', fontSize: 13, borderRadius: 7, padding: '8px 12px' }}>{err}</div>}
            <button className="btn btn-primary" type="submit">Sign in</button>
          </form>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 10 }}>
            <a href="#/login">Forgot password?</a><a href="#/pricing">Create an account</a>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0', color: 'var(--slate)', fontSize: 12.5 }}>
            <hr className="hr-soft" style={{ flex: 1 }} /> or <hr className="hr-soft" style={{ flex: 1 }} />
          </div>
          <button className="btn btn-quiet" style={{ width: '100%' }} onClick={() => enter('steward')}>⊞ Sign in with Microsoft Entra ID</button>
          <p className="microcopy" style={{ marginTop: 8 }}>For agency and enterprise workspaces. Your views and permissions are scoped by your organization — your scores are not.</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-quiet btn-xs" style={{ flex: 1 }} onClick={() => enter('builder')}>Demo SSO — Builder (Sarah Chen)</button>
            <button className="btn btn-quiet btn-xs" style={{ flex: 1 }} onClick={() => enter('steward')}>Demo SSO — Steward (Ecology)</button>
          </div>
          <div className="panel" style={{ marginTop: 20, padding: '15px 17px' }}>
            <b style={{ fontSize: 13.5 }}>New here? Which door did you come in through?</b>
            <div style={{ display: 'grid', gap: 7, marginTop: 10 }}>
              {NEW_ROLES.map(r => (
                <label key={r.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, background: newRole === r.id ? 'var(--sand)' : 'transparent', border: '1px solid ' + (newRole === r.id ? 'var(--evergreen)' : 'var(--line-soft)'), borderRadius: 8, padding: '8px 11px', cursor: 'pointer' }}>
                  <input type="radio" name="newrole" checked={newRole === r.id} onChange={() => setNewRole(r.id)} style={{ marginTop: 2 }} />
                  <span><b style={{ fontWeight: 650 }}>{r.name}</b><span style={{ color: 'var(--slate)' }}> — {r.desc}</span></span>
                </label>
              ))}
            </div>
            <button className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: 10 }} onClick={() => enter(newRole)}>Create workspace</button>
            <p className="microcopy" style={{ margin: '8px 0 0' }}>More roles coming — researcher, advocate, educator. Just exploring? <a href="#/explorer">You don't need an account for the public map.</a></p>
          </div>
          <div className="microcopy" style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <PromiseBadge compact align="left" /> <a href="#/methodology">Methodology</a> · <a href="#/">Privacy</a> · <a href="#/">Status</a>
          </div>
        </div>
      </div>
      <div className="hide-mobile" style={{ flex: '1 1 420px', background: 'var(--mist)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
        <div style={{ width: '100%', maxWidth: 560 }}>
          <WAMap weights={w} interactive={false} markers={false} />
          <p className="microcopy" style={{ textAlign: 'center', marginTop: 10 }}>The product is the decoration. Community-burden weight oscillating 25% ↔ 45%.</p>
        </div>
      </div>
    </div>
  );
}

/* ── methodology ── */
const GEOGRAPHIES = [
  ['0.15° grid (~14 km)', 'Base layer', 'Public — free', 'The shared reference frame everyone argues from'],
  ['County', 'Administrative', 'Group', 'Permitting posture, hearings, moratorium maps'],
  ['ZCTA', 'Postal', 'Group', 'Community-burden context, listing search'],
  ['Census tract / block group', 'Statistical', 'Group', 'EJ analysis at evidence-grade resolution'],
  ['Utility / PUD service territory', 'Operational', 'Group', 'Rate cases, large-load tariff exposure'],
  ['Parcel', 'Cadastral', 'Enterprise', 'Listings, dossiers, site control'],
  ['Balancing authority', 'Operational', 'Enterprise', 'Queue & curtailment modeling'],
  ['Watershed (HUC-8 / HUC-10)', 'Hydrologic', 'Agency', 'Water findings, replenishment conditions'],
  ['Congressional district', 'Political', 'Agency', 'Delegation briefings, federal testimony'],
  ['State legislative district', 'Political', 'Agency', 'Bill drafting, moratorium studies, fiscal notes']
];

function MethodologyPage() {
  const M = window.MERA;

  const INDS = [
    { n: 'Transmission proximity', col: 'tx_score', wt: '40%',
      src: 'OSM (ODbL) power lines >=230 kV; EIA Form 860 2023 substations',
      formula: '1 - clip(dist_m / p99, 0, 1)',
      why: 'No power, no datacenter. Every megawatt of IT load requires a direct interconnect to high-voltage transmission. Interconnection queue wait times now average five to seven years in constrained corridors; proximity to existing 230 kV or higher infrastructure cuts that timeline and avoids $1-4 million per mile in new line costs. This is the single largest gating constraint in hyperscale site selection.' },
    { n: 'Water availability', col: 'water_score', wt: '35%',
      src: 'PRISM Climate Group 4 km 30-yr precip normals (ppt, 1991-2020)',
      formula: 'clip(ppt_mm, p05, p95) rescaled to [0, 1]',
      why: 'Large datacenters are significant water consumers. Evaporative cooling on a 100 MW campus can draw one to five million gallons per day. Regions with declining precipitation, over-appropriated river systems, or closed water rights queues face permitting barriers and community opposition that can block or delay projects by years. Annual precipitation is scored as a proxy for long-term water budget viability.' },
    { n: 'Community burden', col: 'ej_score', wt: '25%',
      src: 'Census ACS 5-yr (B03002 race, B17020 poverty, B25003 tenure, B15003 education, B08301 commute)',
      formula: '1 - clip(demog_index / p95, 0, 1)  [inverted]',
      why: 'Datacenters bring noise, light, diesel exhaust from emergency generators, and limited local employment relative to their footprint. Siting in already-burdened communities compounds existing harms and now draws heightened regulatory scrutiny under environmental justice frameworks at the federal level and in states like California, Washington, and New York. Lower-burden communities offer cleaner permitting paths and lower litigation exposure.' },
    { n: 'Population exposure', col: 'pop_exposure_score', wt: '0%',
      src: 'Census ACS 5-yr B01003 total population (persons / km2)',
      formula: '1 - clip(pop_density / p95, 0, 1)',
      why: 'Dense residential neighborhoods mean noise complaints (transformers and cooling tower fans are audible at 500 meters), visual opposition to blank concrete walls, and traffic impacts during construction. Lower population density around a candidate site simplifies the public hearing record and reduces the scope of required mitigation measures.' },
    { n: 'Seismic safety', col: 'seismic_score', wt: '0%',
      src: 'USGS ASCE 7-22 API (PGAm, Risk Cat II, Site Class C); sparse 6x10 grid; IDW k=8 p=2',
      formula: '1 - clip(pgam_g / p99, 0, 1)',
      why: 'Tier III and IV facilities require 99.982 to 99.999% annual uptime. Seismic events damage physical equipment, underground fiber, and utility interconnects simultaneously. High peak ground acceleration zones require 15 to 25% structural cost premiums and may trigger stricter review for critical infrastructure. Some operators categorically exclude sites with PGA above 0.5g.' },
    { n: 'Flood safety', col: 'flood_score', wt: '0%',
      src: 'FEMA NFHL SFHA (zones A, AE, AH, AO, AR, A99, VE, V)',
      formula: '0 if centroid in SFHA; 1 otherwise  [binary hard gate]',
      gate: true,
      why: 'FEMA Special Flood Hazard Areas represent the 100-year floodplain. Submerged UPS banks, generator fuel tanks, and fiber termination rooms cause catastrophic, long-duration outages. Insurance carriers either exclude flood events at SFHA locations entirely or charge prohibitive premiums. This is a hard gate: no composite score can recover a flood-zone cell.' },
    { n: 'Contamination distance', col: 'contamination_score', wt: '0%',
      src: 'EPA Toxics Release Inventory (TRI) via ECHO REST API',
      formula: 'clip(tri_dist_m / max, 0, 1)',
      why: 'Active TRI facilities represent proxies for shared groundwater contamination risk. Chlorinated solvents and heavy metals from nearby industrial sites create environmental liability at permitting — TRI proximity is a standard flag in Phase I environmental assessments. Air quality near active emitters also degrades HVAC inlet conditions, increasing filtration cost and equipment wear.' },
    { n: 'Waterway sensitivity', col: 'waterway_score', wt: '0%',
      src: 'OSM Overpass API (waterway=river)',
      formula: 'clip(river_dist_m / max, 0, 1)',
      why: 'Rivers and wetlands trigger Section 404 of the Clean Water Act and state equivalents. A campus-scale footprint (50 to 100 acres) generates substantial impervious surface; sites near waterways must demonstrate complex stormwater treatment, wetland delineation, and often mitigation banking. The score rewards distance from sensitive waterways as a proxy for permitting complexity and cost.' },
    { n: 'Geothermal opportunity', col: 'geothermal_score', wt: '0%',
      src: 'IHFC 2024 Global Heat Flow Database (mW/m2); IDW k=8 p=2',
      formula: 'clip(heatflow_mwm2 / q95_cap, 0, 1)',
      why: 'Regions with high crustal heat flow — particularly near active volcanic systems in the Cascades and Basin and Range — can support direct geothermal power procurement. Geothermal baseload is 24/7 carbon-free, making it uniquely attractive to operators with hourly clean energy matching commitments. Geothermal-adjacent sites can sometimes negotiate direct PPAs with geothermal developers, lowering both carbon footprint and long-run energy cost.' },
    { n: 'Terrain flatness', col: 'flatness_score', wt: '0%',
      src: 'SRTM 1 arc-sec HGT (AWS S3); downsampled 3x (~90 m); numpy.gradient',
      formula: 'flat_frac / p95',
      why: 'Grading cost scales with terrain relief. A consistent 1-2% grade across a 200-acre site can be prepared for a few hundred thousand dollars; switchback terrain or cliff faces are a different order of magnitude. This score rewards cells where a large fraction of the land meets a gentle-slope threshold (< 5 deg), but even low-scoring cells are not excluded -- a single graded pad within a broader rough cell can still be viable. Cells with very low flatness will score poorly here and also on the slope indicator, which together act as a cost signal rather than a veto.' },
    { n: 'Mean slope', col: 'slope_score', wt: '0%',
      src: 'Same SRTM tiles; slope = arctan(|grad z|) in degrees',
      formula: '1 - clip(slope_mean_deg / p95, 0, 1)',
      why: 'Average slope governs earthwork volume, surface drainage design, and foundation depth. Even cells that pass the flatness gate can carry significant slope-related construction cost premiums if the buildable area sits at the edge of a grade break or requires cut-and-fill to achieve a level platform.' },
    { n: 'Protected land', col: 'protected_score', wt: '0%',
      src: 'Esri USA Federal Lands (NPS/USFWS/DoD/USFS; BLM excluded) + Census TIGER 2022 AIANNH',
      formula: '1 - protected_frac  |  HARD GATE: protected_frac > 0.25 -> 0',
      gate: true,
      why: 'Federal lands administered by NPS, USFWS, DoD, and the Forest Service are legally unavailable for private commercial development. Tribal sovereign territory under AIANNH boundaries requires government-to-government consultation and cannot be treated as ordinary real estate. Cells where more than 25% of the area falls under these designations are gated out: the viable buildable footprint is too constrained to be actionable.' },
    { n: 'Aquifer depth', col: 'aquifer_score', wt: '0%',
      src: 'USGS NWIS OGC API param 72019 (depth-to-water-table, ft); median per site (>=2 obs); IDW k=8 p=2',
      formula: 'clip(depth_ft / p95, 0, 1)',
      why: 'Shallow groundwater provides a practical backup cooling source and supports dry-well cooling strategies during peak demand. Deep aquifers make extraction economically marginal and often indicate regionally over-appropriated systems with closed well permits. The score rewards shallow depth-to-water-table as measured by USGS NWIS monitoring wells.' },
    { n: 'Soil permeability (HSG)', col: 'soil_score', wt: '0%',
      src: 'USDA SSURGO Soil Data Mart; hydgrpdcd via mukey/muaggatt/legend join; IDW k=8 p=2',
      formula: 'A=0.00  B=0.33  C=0.67  D=1.00  (A/D=0.50  B/D=0.67  C/D=0.83)',
      why: 'Heavy equipment — UPS banks, diesel generators, cooling towers, transformers — imposes significant concentrated loads on foundation soils. Sandy soils (HSG A, high permeability) are prone to differential settlement under point loads; clay-dominant soils (HSG C/D, low permeability) offer better bearing capacity. Higher scores reflect soils that can support heavy infrastructure without pile foundations, which add $2 to $5 million to construction cost.' },
    { n: 'Soil profile chemistry', col: 'soil_profile_score', wt: '0%',
      src: 'SSURGO chorizon 0-150 cm (CaCO3, K-sat, clay); per-mukey thickness-weighted aggregation',
      formula: '0.40*(1-CaCO3/15) + 0.35*(1-log1p(ksat)/log1p(100)) + 0.25*(clay/35)',
      why: 'Three sub-components address long-run operations cost. High carbonate content (CaCO3) causes scale buildup in cooling tower fill, heat exchangers, and chiller tubes, requiring chemical water treatment and frequent maintenance. Low hydraulic conductivity improves containment of diesel fuel and refrigerant spills from on-campus storage. High clay content contributes to structural bearing capacity for heavy equipment pads.' },
    { n: 'Hydraulic K-sat', col: 'ksat_score', wt: '0%',
      src: 'SSURGO chorizon thickness-weighted mean K-sat (um/s); same query as soil profile',
      formula: '1 - clip(log1p(ksat_ums) / log1p(100), 0, 1)  [log-scaled]',
      why: 'Low saturated hydraulic conductivity means the subsurface resists lateral transport of dissolved contaminants. Datacenter campuses store hundreds of thousands of gallons of diesel fuel for emergency generators — 72-hour loads are standard at Tier III and IV facilities. Low K-sat soils slow groundwater transport of any fuel release, buying time for remediation and substantially limiting environmental liability exposure.' },
  ];

  const SOURCES = [
    ['OSM power lines (voltage >= 230,000 V)', 'OpenStreetMap contributors (ODbL)', 'Overpass API', 'tx_score'],
    ['EIA Form 860 2023 substations', 'US Energy Information Administration', 'eia.gov bulk download', 'tx_score'],
    ['PRISM 30-yr precip normals (ppt, 1991-2020, 4 km)', 'PRISM Climate Group / Oregon State University', 'prism.oregonstate.edu/normals/', 'water_score'],
    ['ACS 5-yr B03002, B17020, B25003, B15003, B08301', 'US Census Bureau', 'census.gov/data/developers', 'ej_score, pop_exposure_score'],
    ['ASCE 7-22 seismic design maps API (PGAm)', 'US Geological Survey', 'earthquake.usgs.gov/ws/designmaps/', 'seismic_score'],
    ['NFHL Special Flood Hazard Area polygons', 'Federal Emergency Management Agency', 'msc.fema.gov REST API', 'flood_score'],
    ['Toxics Release Inventory (TRI) facility locations', 'US EPA ECHO REST API', 'echo.epa.gov/tools/web-services', 'contamination_score'],
    ['OSM waterway=river features', 'OpenStreetMap contributors (ODbL)', 'Overpass API', 'waterway_score'],
    ['2024 Global Heat Flow Database (GHFDB)', 'International Heat Flow Commission (IHFC)', 'ihfc-iugg.org/community/ihfc-database/', 'geothermal_score'],
    ['SRTM 1 arc-second HGT elevation tiles', 'NASA/USGS via AWS S3', 'elevation-tiles-prod/skadi', 'flatness_score, slope_score'],
    ['USA Federal Lands (NPS, USFWS, DoD, Forest Service)', 'Esri (sourced from federal agencies)', 'ArcGIS Living Atlas', 'protected_score'],
    ['TIGER 2022 AIANNH tribal boundaries', 'US Census Bureau', 'census.gov/geographies/mapping-files', 'protected_score'],
    ['NWIS parameter 72019 (depth-to-water-table)', 'US Geological Survey', 'waterservices.usgs.gov OGC API', 'aquifer_score'],
    ['SSURGO mapunit / muaggatt / chorizon tables', 'USDA NRCS Soil Data Mart (SDM)', 'sdmdataaccess.nrcs.usda.gov', 'soil_score, soil_profile_score, ksat_score'],
    ['TIGER 2022 state boundaries (grid clip)', 'US Census Bureau', 'census.gov/geographies/mapping-files', 'all indicators'],
  ];

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '36px 24px 60px' }} data-screen-label="Methodology">
      <PageHead eyebrow="Methodology" title="Public, identical, reproducible."
        sub="If you can read this page, you can rebuild the map. That is the point." />

      <div className="callout" style={{ padding: '16px 20px', fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
        <b style={{ color: 'var(--evergreen)' }}>◈ The Same Score Promise.</b> {M.PROMISE.long}
      </div>

      <h3 style={{ fontSize: 17, marginBottom: 8 }}>The scoring grid</h3>
      <p style={{ fontSize: 14.5, lineHeight: 1.65, marginBottom: 22 }}>
        The base unit is a <b>0.15° x 0.15° fishnet cell</b> — approximately 14 km per edge at mid-latitudes (~133 km²). Cell centroids are clipped to 2022 Census TIGER state boundaries. The pipeline runs per-state; all 48 contiguous US states are complete. Scores attach to the centroid and are not area-averaged within the cell. Each cell in each state is assigned a row in a GeoJSON with score columns and raw physical-value columns (for national renormalization).
      </p>

      <h3 style={{ fontSize: 17, marginBottom: 8 }}>Sixteen indicators</h3>
      <p style={{ fontSize: 14.5, lineHeight: 1.65, marginBottom: 18 }}>
        Every indicator is normalized 0-1 within the state (higher = more suitable). Three compose the default composite — transmission (40%), water availability (35%), community burden (25%). All sixteen are computed and published; users can assign non-zero weight to any of them. Two are hard gates that no weight combination can override.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12, marginBottom: 28 }}>
        {INDS.map(ind => (
          <div key={ind.col} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{ind.n}</div>
              <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center' }}>
                {ind.gate && <Chip tone="gate">hard gate</Chip>}
                {parseFloat(ind.wt) > 0 && <Chip tone="mist">{ind.wt}</Chip>}
              </div>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--slate)', margin: 0 }}>{ind.why}</p>
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--line)', marginTop: 8 }}>{ind.col}</div>
          </div>
        ))}
      </div>

      <h4 style={{ fontSize: 15, marginBottom: 8, fontWeight: 700 }}>Technical specifications</h4>
      <div className="card" style={{ overflow: 'auto', marginBottom: 28 }}>
        <table className="mtable">
          <thead>
            <tr>
              <th style={{ minWidth: 160 }}>Indicator</th>
              <th style={{ minWidth: 260 }}>Primary source(s)</th>
              <th style={{ minWidth: 300 }}>Score formula (state-normalized)</th>
              <th style={{ minWidth: 70, textAlign: 'center' }}>Default wt</th>
            </tr>
          </thead>
          <tbody>
            {INDS.map(ind => (
              <tr key={ind.col}>
                <td style={{ fontWeight: 650, whiteSpace: 'nowrap' }}>{ind.n}</td>
                <td style={{ fontSize: 12.5, color: 'var(--slate)' }}>{ind.src}</td>
                <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{ind.formula}</td>
                <td style={{ textAlign: 'center' }} className="score-serif">{ind.wt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: 17, marginBottom: 8 }}>Hard gates</h3>
      <p style={{ fontSize: 14.5, lineHeight: 1.65, marginBottom: 10 }}>
        Two conditions exclude a cell from consideration before any weighting is applied. No weight setting can recover a gated cell. Terrain is not a hard gate -- rugged cells score poorly but are not excluded, because parcels within a cell can be graded.
      </p>
      <div className="card" style={{ overflow: 'auto', marginBottom: 26 }}>
        <table className="mtable">
          <thead><tr><th>Gate</th><th>Threshold</th><th>How the raw metric is derived</th><th>Effect</th></tr></thead>
          <tbody>
            <tr>
              <td style={{ fontWeight: 650 }}>Protected / sovereign</td>
              <td style={{ fontFamily: 'monospace', fontSize: 13, whiteSpace: 'nowrap' }}>{'protected_frac > 0.25'}</td>
              <td style={{ fontSize: 13, color: 'var(--slate)' }}>Exact geometric intersection of cell polygon with Esri USA Federal Lands (NPS, USFWS, DoD, Forest Service; BLM excluded) plus Census TIGER 2022 AIANNH tribal boundaries; protected_frac = intersection area / cell area</td>
              <td style={{ fontSize: 13 }}>protected_score set to 0; cell excluded from national rankings</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 650 }}>FEMA flood zone</td>
              <td style={{ fontFamily: 'monospace', fontSize: 13, whiteSpace: 'nowrap' }}>{'flood_score = 0'}</td>
              <td style={{ fontSize: 13, color: 'var(--slate)' }}>Cell centroid or majority area falls within FEMA Special Flood Hazard Area (SFHA); flood_score = 0 for SFHA cells, 1 otherwise</td>
              <td style={{ fontSize: 13 }}>Cell excluded from portfolio screening; insurance availability and FEMA permitting requirements make SFHA sites commercially unviable for this asset class</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: 17, marginBottom: 8 }}>State vs. national normalization</h3>
      <p style={{ fontSize: 14.5, lineHeight: 1.65, marginBottom: 10 }}>
        <b>State-level (pipeline output).</b> Percentile anchors are computed from the state's own cells and used to clip outliers before linear rescaling to [0, 1]. Continuous indicators use p01/p99 or p05/p95 depending on distribution shape. Binary indicators (flood_score, protected_score) skip percentile normalization. The soil HSG score uses an ordinal lookup table (A/B/C/D) and requires no clipping.
      </p>
      <p style={{ fontSize: 14.5, lineHeight: 1.65, marginBottom: 22 }}>
        <b>National (post-pipeline).</b> After all 48 states are scored, a second pass computes p01/p99 percentile anchors from each raw physical-value column across the full 48-state dataset and rescales to produce <code>_nat</code> columns (e.g. <code>tx_score_nat</code>, <code>water_score_nat</code>). This enables cross-state comparison on a common scale. Binary gate indicators (flood_score, protected_score) are copied directly as their <code>_nat</code> column. Indicators without a single physical unit (ej_score, soil_score, soil_profile_score) are nationally normalized by ranking their state-level scores across all 48-state cells and rescaling linearly.
      </p>

      <h3 style={{ fontSize: 17, marginBottom: 8 }}>Spatial interpolation (IDW)</h3>
      <p style={{ fontSize: 14.5, lineHeight: 1.65, marginBottom: 22 }}>
        Indicators derived from sparse point observations — seismic PGA, aquifer depth, geothermal heat flow, SSURGO soil classes, and hydraulic conductivity — are interpolated to the 0.15° grid using <b>inverse distance weighting (IDW)</b> with k = 8 nearest neighbors and distance exponent p = 2, implemented via <code>scipy.spatial.cKDTree</code>. The seismic indicator first queries a sparse 6 x 10 anchor grid per state before IDW infill across all cell centroids. SSURGO data is interpolated from representative polygon centroid locations.
      </p>

      <h3 style={{ fontSize: 17, marginBottom: 8 }}>Composite score</h3>
      <p style={{ fontSize: 14.5, lineHeight: 1.65, marginBottom: 22 }}>
        Composite = weighted sum of all indicator scores, with weights normalized to sum to 1.0. Default: transmission 40%, water 35%, community burden 25%. Builder and Steward workspaces expose all sixteen weight sliders. Hard-gated cells receive composite = 0 regardless of weight configuration.
      </p>

      <h3 style={{ fontSize: 17, marginBottom: 8 }}>Data source index</h3>
      <div className="card" style={{ overflow: 'auto', marginBottom: 26 }}>
        <table className="mtable">
          <thead>
            <tr>
              <th style={{ minWidth: 220 }}>Dataset</th>
              <th style={{ minWidth: 180 }}>Publisher</th>
              <th style={{ minWidth: 160 }}>Access</th>
              <th style={{ minWidth: 160 }}>Indicator(s)</th>
            </tr>
          </thead>
          <tbody>
            {SOURCES.map(([d, pub, acc, inds]) => (
              <tr key={d}>
                <td style={{ fontWeight: 550, fontSize: 13 }}>{d}</td>
                <td style={{ fontSize: 12.5, color: 'var(--slate)' }}>{pub}</td>
                <td style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--slate)' }}>{acc}</td>
                <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{inds}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: 17, marginBottom: 8 }}>One engine, many geographies</h3>
      <p style={{ fontSize: 14.5, lineHeight: 1.65, marginBottom: 12 }}>
        The public map is the 0.15° grid, free forever. Paid tiers re-aggregate the same cell scores into the geographies that decisions actually use. All rollups are exact area-weighted averages of published cell scores — scores are never recomputed or re-weighted at a different resolution.
      </p>
      <div className="card" style={{ overflow: 'auto', marginBottom: 8 }}>
        <table className="mtable">
          <thead><tr><th>Geography</th><th>Hierarchy</th><th>Tier</th><th>Built for</th></tr></thead>
          <tbody>
            {GEOGRAPHIES.map(([g, h, t, b]) => (
              <tr key={g}>
                <td style={{ fontWeight: 650 }}>{g}</td>
                <td style={{ fontSize: 13 }}>{h}</td>
                <td>{t === 'Public — free' ? <Chip tone="mist">{t}</Chip> : <Chip tone="slate">{t}</Chip>}</td>
                <td style={{ fontSize: 13, color: 'var(--slate)' }}>{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="microcopy" style={{ marginBottom: 20 }}>Tribal lands appear in consultation workflows only with the consent of the sovereign government concerned — they are parties, not polygons.</p>

      <h3 style={{ fontSize: 17, marginBottom: 8 }}>Reproducibility</h3>
      <p style={{ fontSize: 14.5, lineHeight: 1.65, marginBottom: 22 }}>
        The pipeline is version-stamped ({M.VERSION}). Every score displayed in the product carries its version. All data inputs are drawn from public APIs and bulk downloads — none require proprietary access. Run the open-source pipeline against the same inputs and you will produce identical numbers. That is the warranty.
      </p>

      <div style={{ marginTop: 28, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <a className="btn btn-primary" href="#/explorer">Open the Explorer</a>
        <a className="btn btn-quiet" href="#/factsheets">Fact sheets</a>
      </div>
    </div>
  );
}

Object.assign(window, { PricingPage, LoginPage, MethodologyPage });
