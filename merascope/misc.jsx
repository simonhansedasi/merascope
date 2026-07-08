/* ── Pricing, Login, Methodology ── */

/* ── pricing: two workspaces, each with its own schematic ── */
function TierRow({ name, price, per, blurb, cta, kind, href, onCta }) {
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
      {href
        ? <a className={'btn btn-sm ' + kind} href={href}>{cta}</a>
        : <button className={'btn btn-sm ' + kind} onClick={onCta}>{cta}</button>}
    </div>
  );
}

/* Sales-touch CTAs post to /api/lead; the modal carries which tier was clicked. */
function LeadModal({ lead, onClose }) {
  const [form, setForm] = React.useState({ name: '', email: '', org: '', note: '' });
  const [sent, setSent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const set = function(k) { return function(e) { var v = e.target.value; setForm(function(f) { return Object.assign({}, f, { [k]: v }); }); }; };
  const submit = function(e) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.email, name: form.name, org: form.org, note: form.note,
        workspace: lead.workspace, tier: lead.tier,
        session_id: window.MERA_SESSION || ''
      })
    })
      .then(function(r) { return r.json(); })
      .then(function(d) { if (d.ok) { setSent(true); } else { setErr(d.err || 'Something went wrong.'); } })
      .catch(function() { setErr('Network error — please try again.'); })
      .finally(function() { setLoading(false); });
  };
  const inputStyle = { padding: '9px 12px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--sand)', color: 'var(--ink)', fontSize: 13.5, fontFamily: 'inherit', width: '100%' };
  return (
    <div onClick={onClose}
      style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 800, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={function(e) { e.stopPropagation(); }}
        style={{ background: 'var(--mist)', borderRadius: 12, padding: '22px 24px', width: 440, maxWidth: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.5)', border: '1px solid var(--line)' }}>
        {sent ? (
          <div>
            <b style={{ fontSize: 16 }}>Thanks — we got it.</b>
            <p style={{ fontSize: 13.5, color: 'var(--slate)', margin: '8px 0 0', lineHeight: 1.6 }}>
              We'll reply to <b>{form.email}</b> within one business day about <b>{lead.tier}</b>.
              Meanwhile, the <a href="#/explorer" onClick={onClose}>Public Explorer</a> is open — same scores as every tier.
            </p>
            <button className="btn btn-quiet btn-sm" style={{ marginTop: 14 }} onClick={onClose}>Close</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <b style={{ fontSize: 16 }}>{lead.cta} — {lead.tier}</b>
            <p className="microcopy" style={{ margin: '4px 0 0' }}>{lead.workspace === 'steward' ? 'Steward console' : 'Builder workspace'} · we reply within one business day.</p>
            <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              <input placeholder="Name" value={form.name} onChange={set('name')} style={inputStyle} />
              <input placeholder="Work email" type="email" required value={form.email} onChange={set('email')} style={inputStyle} />
              <input placeholder="Organization / agency" value={form.org} onChange={set('org')} style={inputStyle} />
              <textarea placeholder="What are you evaluating? Timeline, geography, seats — whatever helps us scope."
                rows={3} value={form.note} onChange={set('note')} style={Object.assign({}, inputStyle, { resize: 'vertical' })} />
              {err && <div style={{ background: 'var(--hi-bg)', color: 'var(--hi-tx)', fontSize: 13, borderRadius: 7, padding: '8px 12px' }}>{err}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                <button className="btn btn-primary btn-sm" type="submit" disabled={loading}>{loading ? 'Sending...' : 'Send'}</button>
                <button className="btn btn-quiet btn-sm" type="button" onClick={onClose}>Cancel</button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function PricingPage() {
  const [lead, setLead] = React.useState(null);
  const ask = function(workspace, tier, cta) { return function() { setLead({ workspace: workspace, tier: tier, cta: cta }); }; };
  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '36px 24px 60px' }} data-screen-label="Pricing">
      <PageHead eyebrow="Pricing" title="Two workspaces. One engine."
        sub="Builder and Steward are priced separately because they buy different work, never different numbers." />
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
            <TierRow name="Individual" price="$149" per="/mo" cta="Start now" kind="btn-quiet" href="#/login"
              blurb="Full indicator set · grid resolution · exports · shareable weights" />
            <TierRow name="Group" price="from $24k" per="/yr" cta="Start trial" kind="btn-primary" onCta={ask('builder', 'Group', 'Start trial')}
              blurb="Seats & workspaces · ZCTA + parcel layers · API · watchlists · Site Lab · portfolio screening" />
            <TierRow name="Enterprise" price="Custom" per="" cta="Talk to us" kind="btn-quiet" onCta={ask('builder', 'Enterprise', 'Talk to us')}
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
            <TierRow name="County / single office" price="from $12k" per="/yr" cta="Talk to us" kind="btn-quiet" onCta={ask('steward', 'County / single office', 'Talk to us')}
              blurb="Docket lite · report cards · fact sheets · hearing exhibits" />
            <TierRow name="State agency" price="from $60k" per="/yr" cta="Talk to us" kind="btn-primary" onCta={ask('steward', 'State agency', 'Talk to us')}
              blurb="Full Docket · impasse register · litigation exports · Entra ID SSO · all geographies" />
            <TierRow name="Mandated studies" price="$75–400k" per="" cta="Scope it" kind="btn-quiet" onCta={ask('steward', 'Mandated studies', 'Scope it')}
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
        <button className="btn btn-quiet btn-sm" onClick={ask('builder', 'Performance participation', 'Talk to us')}>Talk to us</button>
      </div>
      <p className="microcopy" style={{ textAlign: 'center', marginTop: 22 }}>
        ◈ Every tier sees the same scores. Paid tiers buy resolution and workflow, never outcomes.
      </p>
      {lead && <LeadModal lead={lead} onClose={function() { setLead(null); }} />}
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
  const [email, setEmail] = React.useState('');
  const [sent, setSent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const [newRole, setNewRole] = React.useState('builder');
  const [w, setW] = React.useState({ ...M.DEFAULT_WEIGHTS });
  React.useEffect(function() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var flip = false;
    var t = setInterval(function() { flip = !flip; setW(normalizeWeights({ ...M.DEFAULT_WEIGHTS }, 'community', flip ? 45 : 25)); }, 2800);
    return function() { clearInterval(t); };
  }, []);
  var enter = function(r) { setRole(r); location.hash = r === 'builder' ? '#/builder' : r === 'steward' ? '#/steward' : '#/factsheets'; };
  var handleRequest = function(e) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    fetch('/api/auth/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email })
    })
      .then(function(r) { return r.json(); })
      .then(function(d) { if (d.ok) { setSent(true); } else { setErr(d.err || 'Something went wrong.'); } })
      .catch(function() { setErr('Network error — please try again.'); })
      .finally(function() { setLoading(false); });
  };
  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 56px)' }} data-screen-label="Login">
      <div style={{ flex: '1 1 440px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: 372 }}>
          <h2 style={{ fontSize: 26 }}>Welcome back to the map.</h2>
          <p style={{ color: 'var(--slate)', fontSize: 14.5, margin: '6px 0 22px' }}>Same scores as everyone else. Your workspace on top.</p>
          {sent ? (
            <div style={{ background: 'var(--lo-bg)', border: '1px solid var(--lo-tx)', borderRadius: 8, padding: '16px 18px' }}>
              <b style={{ fontSize: 15 }}>Check your inbox.</b>
              <p style={{ fontSize: 13.5, color: 'var(--slate)', margin: '6px 0 0', lineHeight: 1.55 }}>We sent a sign-in link to <b>{email}</b>. Click it to open your workspace. It expires in 1 hour.</p>
              <button className="btn btn-quiet btn-sm" style={{ marginTop: 12 }} onClick={function() { setSent(false); setEmail(''); }}>Use a different email</button>
            </div>
          ) : (
            <form onSubmit={handleRequest} style={{ display: 'grid', gap: 10 }}>
              <input
                placeholder="Work email"
                type="email"
                required
                value={email}
                onChange={function(e) { setEmail(e.target.value); }}
                style={{ padding: '10px 13px', border: '1px solid var(--line)', borderRadius: 7, fontSize: 14.5, background: 'var(--sand)', color: 'var(--ink)' }}
              />
              {err && <div style={{ background: 'var(--hi-bg)', color: 'var(--hi-tx)', fontSize: 13, borderRadius: 7, padding: '8px 12px' }}>{err}</div>}
              <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Sending...' : 'Send sign-in link'}</button>
              <p className="microcopy" style={{ margin: '2px 0 0' }}>No password. We email you a one-click link.</p>
            </form>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0', color: 'var(--slate)', fontSize: 12.5 }}>
            <hr className="hr-soft" style={{ flex: 1 }} /> demo <hr className="hr-soft" style={{ flex: 1 }} />
          </div>
          <button className="btn btn-quiet" style={{ width: '100%' }} onClick={function() { enter('steward'); }}>Sign in with Microsoft Entra ID</button>
          <p className="microcopy" style={{ marginTop: 8 }}>For agency and enterprise workspaces. Your views and permissions are scoped by your organization — your scores are not.</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-quiet btn-xs" style={{ flex: 1 }} onClick={function() { enter('builder'); }}>Demo SSO — Builder (Sarah Chen)</button>
            <button className="btn btn-quiet btn-xs" style={{ flex: 1 }} onClick={function() { enter('steward'); }}>Demo SSO — Steward (Ecology)</button>
          </div>
          <div className="panel" style={{ marginTop: 20, padding: '15px 17px' }}>
            <b style={{ fontSize: 13.5 }}>New here? Which door did you come in through?</b>
            <div style={{ display: 'grid', gap: 7, marginTop: 10 }}>
              {NEW_ROLES.map(function(r) {
                return (
                  <label key={r.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, background: newRole === r.id ? 'var(--sand)' : 'transparent', border: '1px solid ' + (newRole === r.id ? 'var(--evergreen)' : 'var(--line-soft)'), borderRadius: 8, padding: '8px 11px', cursor: 'pointer' }}>
                    <input type="radio" name="newrole" checked={newRole === r.id} onChange={function() { setNewRole(r.id); }} style={{ marginTop: 2 }} />
                    <span><b style={{ fontWeight: 650 }}>{r.name}</b><span style={{ color: 'var(--slate)' }}> -- {r.desc}</span></span>
                  </label>
                );
              })}
            </div>
            <button className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: 10 }} onClick={function() { enter(newRole); }}>Create workspace</button>
            <p className="microcopy" style={{ margin: '8px 0 0' }}>Just exploring? <a href="#/explorer">You don't need an account for the public map.</a></p>
          </div>
          <div className="microcopy" style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <PromiseBadge compact align="left" /> <a href="#/methodology">Methodology</a> · <a href="#/">Privacy</a> · <a href="#/">Status</a>
          </div>
        </div>
      </div>
      <div className="hide-mobile" style={{ flex: '1 1 420px', background: 'var(--mist)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
        <div style={{ width: '100%', maxWidth: 560 }}>
          <WAMap weights={w} interactive={false} markers={false} />
          <p className="microcopy" style={{ textAlign: 'center', marginTop: 10 }}>The product is the decoration. Community-burden weight oscillating 25% ~~ 45%.</p>
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
      formula: '1 - clip(depth_ft / p95, 0, 1)',
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
    { n: 'Substation proximity', col: 'substation_score', wt: '0%',
      src: 'EIA Form 860 Annual Electric Generator Report (2024 with 2023 fallback); plant capacity (MW) as voltage-class proxy; cached in data/shared/substations.csv',
      formula: '0.6 * (1 - dist_m / max_dist) + 0.4 * capacity_weight(MW)',
      why: 'Transmission line proximity tells you where the wire runs, not where you can actually tap it. Interconnection requires a substation — a physical facility that steps down voltage, provides protection equipment, and terminates the point-of-interconnect agreement. High-capacity substations (proxied here by large plant connections) reduce both construction cost and queue time by offering available spare capacity at an existing breaker position. The composite score weights proximity at 60% and estimated capacity at 40%.' },
    { n: 'Superfund distance', col: 'superfund_score', wt: '0%',
      src: 'EPA Envirofacts REST API — SEMS (Superfund Enterprise Management System) National Priorities List sites',
      formula: 'clip(superfund_dist_m / p99, 0, 1)',
      why: 'EPA Superfund National Priorities List sites represent the most contaminated locations in the United States. Proximity triggers mandatory review in Phase I environmental assessments, generates automatic flags in NEPA and state environmental review, and creates direct environmental liability risk through regulatory brownfield association. Unlike TRI, Superfund status indicates documented past contamination rather than ongoing releases — meaning the plume is already in the ground. A Superfund site within 2-5 km is typically disqualifying for institutional financing regardless of regulatory approval status.' },
    { n: 'RCRA distance', col: 'rcra_score', wt: '0%',
      src: 'EPA Envirofacts REST API — RCRAInfo corrective action facilities (active hazardous waste cleanup)',
      formula: 'clip(rcra_dist_m / p99, 0, 1)',
      why: 'RCRA corrective action facilities are actively remediating known hazardous waste releases under EPA or state oversight. Unlike Superfund, RCRA corrective action covers a much larger universe of industrial and commercial sites that handled hazardous materials and subsequently required cleanup. These sites carry ongoing compliance obligations and can restrict neighboring land use through institutional controls. Proximity to an active RCRA facility appears in Phase I reports and can trigger Phase II investigation requirements, adding months and material cost to site due diligence.' },
    { n: 'Air quality (NAAQS)', col: 'air_quality_score', wt: '0%',
      src: 'EPA Green Book non-attainment area GIS shapefile (PM2.5, PM10, Ozone); county-level spatial join',
      formula: '0 if county is in non-attainment for PM2.5, PM10, or Ozone; 1 otherwise  [binary]',
      gate: true,
      why: 'Counties designated as non-attainment under the Clean Air Act face stricter permitting requirements for new stationary sources of air pollution. Datacenter campuses routinely operate 10 to 50+ diesel backup generators — a 100 MW facility may have 50,000 kW of emergency diesel capacity. In non-attainment areas, generator permits require offsets, enhanced controls, or face outright denial. Communities in non-attainment counties also tend to oppose new facilities more vigorously given documented air quality failure, increasing litigation exposure and public hearing complexity.' },
    { n: 'Fiber connectivity', col: 'fiber_score', wt: '0%',
      src: 'PeeringDB /api/fac (public JSON, no auth) — carrier-neutral colocation and data center facility locations; cached in data/shared/peeringdb_fac.csv',
      formula: '1 - clip(fac_dist_m / p99, 0, 1)',
      why: 'Long-haul fiber routes terminate at carrier-neutral colocation facilities — carrier hotels, internet exchange points, and neutral meet-me rooms. These are the physical locations where backbone providers, CDNs, and cloud networks hand off traffic. A campus close to one of these facilities benefits from shorter dark fiber spans, more competitive pricing from competing carriers, and lower latency to major peering fabrics. For latency-sensitive workloads (AI inference, financial services, gaming, video streaming), fiber proximity is as operationally constraining as transmission proximity. Even for hyperscale backfill campuses, distant fiber sites require bespoke builds at $30,000-80,000 per route mile.' },
    { n: 'Water stress', col: 'water_stress_score', wt: '0%',
      src: 'WRI Aqueduct Water Risk Atlas 3.0, baseline water stress score (bws_score, 0-5); watershed polygon spatial join; CONUS clip cached in data/shared/aqueduct_watersheds.gpkg',
      formula: '1 - clip((bws_score - state_min) / (state_max - state_min), 0, 1)  [inverted: lower stress = higher score]',
      why: 'Annual precipitation (water_score) captures supply potential over climatological timescales. Water stress captures whether that supply is actually accessible — accounting for existing withdrawals, water rights allocations, and regulatory closure risk. A watershed with high precipitation but over-appropriated rights offers no practical water budget for new large industrial users. WRI Aqueduct rates baseline water stress on a 0-5 scale: 0-1 is low stress, 3-4 is high stress, above 4 is extremely stressed. Many of the highest-scoring cells on precipitation are in the arid West, where paper water rights already exceed average annual flow. This indicator corrects for that mismatch.' },
    { n: 'Grid capacity', col: 'grid_capacity_score', wt: '0%',
      src: 'EIA Form 860M Monthly Electric Generator Report, Planned sheet (current month); state-level planned MW vs. operating MW ratio',
      formula: '1 - clip(planned_mw / operating_mw / p75_ratio, 0, 1)  [state-level constant: all cells in a state share the same score]',
      why: 'States with a high ratio of planned and proposed capacity to existing operating capacity face the longest interconnection queues. Each new large load application joins a queue behind every proposed generator — interconnection studies for load are bundled with generator studies and proceed at the same pace. A state where planned capacity is already two to three times the operating base signals multi-year queue congestion and elevated probability of project withdrawal or restudy due to upstream changes. This is a state-level indicator: all cells within a state receive the same score, making it useful for state comparison rather than within-state cell ranking.' },
];

function MethodologyPage() {
  const M = window.MERA;
  const [specsOpen, setSpecsOpen] = React.useState(false);
  const [sourcesOpen, setSourcesOpen] = React.useState(false);
  const [expandedInds, setExpandedInds] = React.useState({});
  const toggleInd = k => setExpandedInds(prev => Object.assign({}, prev, { [k]: !prev[k] }));

  const scrollTo = id => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const NAV_LINKS = [
    { id: 'm-pipeline', label: 'Pipeline' },
    { id: 'm-grid', label: 'Scoring grid' },
    { id: 'm-indicators', label: 'Indicators' },
    { id: 'm-gates', label: 'Hard gates' },
    { id: 'm-normalization', label: 'Normalization' },
    { id: 'm-idw', label: 'Interpolation' },
    { id: 'm-composite', label: 'Composite' },
    { id: 'm-sources', label: 'Data sources' },
    { id: 'm-geographies', label: 'Geographies' },
    { id: 'm-repro', label: 'Reproducibility' },
  ];

  const PIPELINE_STEPS = [
    { label: 'Fetch', sub: '20+ public sources' },
    { label: 'Interpolate', sub: 'IDW k=8, p=2' },
    { label: 'Score', sub: 'p01/p99 per state' },
    { label: 'Gate', sub: '2 hard exclusions' },
    { label: 'Composite', sub: 'weighted sum 0-1' },
  ];

  const SOURCES = [
    ['OSM power lines (voltage >= 230,000 V)', 'OpenStreetMap contributors (ODbL)', 'Overpass API', 'tx_score'],
    ['EIA Form 860 Annual (2024) — plant locations + capacity', 'US Energy Information Administration', 'eia.gov bulk download', 'tx_score, substation_score'],
    ['EIA Form 860M Monthly — Planned sheet (current)', 'US Energy Information Administration', 'eia.gov/electricity/data/eia860m/', 'grid_capacity_score'],
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
    ['Superfund SEMS NPL site locations', 'US EPA Envirofacts REST API', 'enviro.epa.gov/envirofacts/sems/', 'superfund_score'],
    ['RCRAInfo corrective action facilities', 'US EPA Envirofacts REST API', 'enviro.epa.gov/envirofacts/rcra/', 'rcra_score'],
    ['Green Book GIS non-attainment areas (PM2.5, PM10, Ozone)', 'US EPA', 'epa.gov/green-book', 'air_quality_score'],
    ['Aqueduct Water Risk Atlas 3.0 (bws_score, watershed polygons)', 'World Resources Institute', 'wri.org/data/aqueduct-water-risk-atlas', 'water_stress_score'],
    ['PeeringDB /api/fac (carrier hotel and colo facility locations)', 'PeeringDB (community-managed)', 'peeringdb.com/api/fac', 'fiber_score'],
  ];

  const navBtnStyle = { display: 'block', width: '100%', textAlign: 'left', background: 'none',
    border: 'none', cursor: 'pointer', padding: '5px 10px', borderRadius: 6,
    fontSize: 12.5, color: 'var(--slate)', fontFamily: 'var(--sans)', marginBottom: 1 };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '36px 24px 60px' }} data-screen-label="Methodology">
      <PageHead eyebrow="Methodology" title="Public, identical, reproducible."
        sub="If you can read this page, you can rebuild the map. That is the point." />

      <div className="callout" style={{ padding: '16px 20px', fontSize: 14, lineHeight: 1.6, marginBottom: 32 }}>
        <b style={{ color: 'var(--evergreen)' }}>&#9670; The Same Score Promise.</b> {M.PROMISE.long}
      </div>

      <div style={{ display: 'flex', gap: 36, alignItems: 'flex-start' }}>

        {/* Sticky left nav */}
        <nav style={{ width: 148, flexShrink: 0, position: 'sticky', top: 68, alignSelf: 'flex-start' }}>
          {NAV_LINKS.map(n => (
            <button key={n.id} onClick={() => scrollTo(n.id)} style={navBtnStyle}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--gate)'; e.currentTarget.style.color = 'var(--ink)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--slate)'; }}>
              {n.label}
            </button>
          ))}
        </nav>

        {/* Scrolling content */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Pipeline diagram */}
          <div id="m-pipeline" style={{ marginBottom: 36, scrollMarginTop: 72 }}>
            <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', gap: 0, paddingBottom: 4 }}>
              {PIPELINE_STEPS.map((step, i) => (
                <React.Fragment key={step.label}>
                  {i > 0 && <div style={{ color: 'var(--slate)', fontSize: 18, padding: '0 6px', flexShrink: 0 }}>&#8594;</div>}
                  <div style={{ background: 'var(--sand)', border: '1px solid var(--line)', borderRadius: 9,
                    padding: '12px 18px', textAlign: 'center', flexShrink: 0, minWidth: 108 }}>
                    <div style={{ fontWeight: 750, fontSize: 13, color: 'var(--ink)' }}>{step.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--slate)', marginTop: 3 }}>{step.sub}</div>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>

          <div id="m-grid" style={{ scrollMarginTop: 72 }}>
            <h3 style={{ fontSize: 17, marginBottom: 8 }}>The scoring grid</h3>
            <p style={{ fontSize: 14.5, lineHeight: 1.65, marginBottom: 22 }}>
              The base unit is a <b>0.15&#176; x 0.15&#176; fishnet cell</b> &#8212; approximately 14 km per edge at mid-latitudes (~133 km&#178;). Cell centroids are clipped to 2022 Census TIGER state boundaries. The pipeline runs per-state; all 48 contiguous US states are complete. Scores attach to the centroid and are not area-averaged within the cell. Each cell in each state is assigned a row in a GeoJSON with score columns and raw physical-value columns (for national renormalization).
            </p>
          </div>

          <div id="m-indicators" style={{ scrollMarginTop: 72 }}>
            <h3 style={{ fontSize: 17, marginBottom: 8 }}>Twenty-two indicators</h3>
            <p style={{ fontSize: 14.5, lineHeight: 1.65, marginBottom: 18 }}>
              Every indicator is normalized 0-1 within the state (higher = more suitable). Three compose the default composite &#8212; transmission (40%), water availability (35%), community burden (25%). All twenty-two are computed and published; users can assign non-zero weight to any of them. Two hard gates cannot be overridden by any weight configuration. Seven supplemental indicators (substation proximity, Superfund distance, RCRA distance, air quality, fiber connectivity, water stress, grid capacity) default to zero weight and appear in the Explorer sliders for optional use.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8, marginBottom: 12 }}>
              {INDS.map(ind => {
                const open = !!expandedInds[ind.col];
                return (
                  <div key={ind.col} className="card" style={{ padding: '12px 14px', cursor: 'pointer' }}
                    onClick={() => toggleInd(ind.col)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{ind.n}</div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                        {ind.gate && <Chip tone="gate">hard gate</Chip>}
                        {parseFloat(ind.wt) > 0 && <Chip tone="mist">{ind.wt}</Chip>}
                      </div>
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: 10.5, color: 'var(--line)', marginTop: 4 }}>{ind.col}</div>
                    {open && (
                      <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--slate)', margin: '10px 0 0' }}>{ind.why}</p>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--slate)', marginTop: open ? 8 : 6, textAlign: 'right' }}>
                      {open ? '▲ collapse' : '▼ rationale'}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginBottom: 28 }}>
              <button onClick={() => setSpecsOpen(v => !v)} className="btn btn-quiet btn-sm" style={{ marginBottom: specsOpen ? 10 : 0 }}>
                {specsOpen ? '▼' : '▶'} Technical specifications
              </button>
              {specsOpen && (
                <div className="card" style={{ overflow: 'auto' }}>
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
              )}
            </div>
          </div>

          <div id="m-gates" style={{ scrollMarginTop: 72 }}>
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
          </div>

          <div id="m-normalization" style={{ scrollMarginTop: 72 }}>
            <h3 style={{ fontSize: 17, marginBottom: 8 }}>State vs. national normalization</h3>
            <p style={{ fontSize: 14.5, lineHeight: 1.65, marginBottom: 10 }}>
              <b>State-level (pipeline output).</b> Percentile anchors are computed from the state's own cells and used to clip outliers before linear rescaling to [0, 1]. Continuous indicators use p01/p99 or p05/p95 depending on distribution shape. Binary indicators (flood_score, protected_score) skip percentile normalization. The soil HSG score uses an ordinal lookup table (A/B/C/D) and requires no clipping.
            </p>
            <p style={{ fontSize: 14.5, lineHeight: 1.65, marginBottom: 22 }}>
              <b>National (post-pipeline).</b> After all 48 states are scored, a second pass computes p01/p99 percentile anchors from each raw physical-value column across the full 48-state dataset and rescales to produce <code>_nat</code> columns (e.g. <code>tx_score_nat</code>, <code>water_score_nat</code>). This enables cross-state comparison on a common scale. Binary indicators (flood_score, protected_score, air_quality_score) are copied directly as their <code>_nat</code> column. Indicators without a single physical unit (ej_score, soil_score, soil_profile_score, grid_capacity_score) are nationally normalized by ranking their state-level scores across all 48-state cells and rescaling linearly. All seven supplemental indicators have national (<code>_nat</code>) columns and contribute to state grade computation.
            </p>
          </div>

          <div id="m-idw" style={{ scrollMarginTop: 72 }}>
            <h3 style={{ fontSize: 17, marginBottom: 8 }}>Spatial interpolation (IDW)</h3>
            <p style={{ fontSize: 14.5, lineHeight: 1.65, marginBottom: 22 }}>
              Indicators derived from sparse point observations &#8212; seismic PGA, aquifer depth, geothermal heat flow, SSURGO soil classes, and hydraulic conductivity &#8212; are interpolated to the 0.15&#176; grid using <b>inverse distance weighting (IDW)</b> with k = 8 nearest neighbors and distance exponent p = 2, implemented via <code>scipy.spatial.cKDTree</code>. The seismic indicator first queries a sparse 6 x 10 anchor grid per state before IDW infill across all cell centroids. SSURGO data is interpolated from representative polygon centroid locations.
            </p>
          </div>

          <div id="m-composite" style={{ scrollMarginTop: 72 }}>
            <h3 style={{ fontSize: 17, marginBottom: 8 }}>Composite score</h3>
            <p style={{ fontSize: 14.5, lineHeight: 1.65, marginBottom: 22 }}>
              Composite = weighted sum of all indicator scores, with weights normalized to sum to 1.0. Default: transmission 40%, water 35%, community burden 25% (all supplemental indicators at 0%). Builder and Steward workspaces expose all twenty-two weight sliders. Hard-gated cells receive composite = 0 regardless of weight configuration.
            </p>
          </div>

          <div id="m-sources" style={{ scrollMarginTop: 72, marginBottom: 28 }}>
            <h3 style={{ fontSize: 17, marginBottom: 8 }}>Data source index</h3>
            <button onClick={() => setSourcesOpen(v => !v)} className="btn btn-quiet btn-sm" style={{ marginBottom: sourcesOpen ? 10 : 0 }}>
              {sourcesOpen ? '▼' : '▶'} {sourcesOpen ? 'Hide' : 'Show'} {SOURCES.length} sources
            </button>
            {sourcesOpen && (
              <div className="card" style={{ overflow: 'auto' }}>
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
            )}
          </div>

          <div id="m-geographies" style={{ scrollMarginTop: 72 }}>
            <h3 style={{ fontSize: 17, marginBottom: 8 }}>One engine, many geographies</h3>
            <p style={{ fontSize: 14.5, lineHeight: 1.65, marginBottom: 12 }}>
              The public map is the 0.15&#176; grid, free forever. Paid tiers re-aggregate the same cell scores into the geographies that decisions actually use. All rollups are exact area-weighted averages of published cell scores &#8212; scores are never recomputed or re-weighted at a different resolution.
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
            <p className="microcopy" style={{ marginBottom: 20 }}>Tribal lands appear in consultation workflows only with the consent of the sovereign government concerned &#8212; they are parties, not polygons.</p>
          </div>

          <div id="m-repro" style={{ scrollMarginTop: 72 }}>
            <h3 style={{ fontSize: 17, marginBottom: 8 }}>Reproducibility</h3>
            <p style={{ fontSize: 14.5, lineHeight: 1.65, marginBottom: 22 }}>
              The pipeline is version-stamped ({M.VERSION}). Every score displayed in the product carries its version. All data inputs are drawn from public APIs and bulk downloads &#8212; none require proprietary access. Run the open-source pipeline against the same inputs and you will produce identical numbers. That is the warranty.
            </p>
          </div>

          <div style={{ marginTop: 28, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a className="btn btn-primary" href="#/explorer">Open the Explorer</a>
            <a className="btn btn-quiet" href="#/factsheets">Fact sheets</a>
          </div>

        </div>
      </div>
    </div>
  );
}

function EvidencePage({ caseId }) {
  const M = window.MERA;
  const C = caseId && M.CASE_DETAIL_MAP && M.CASE_DETAIL_MAP[caseId];
  const { role, readOnly } = React.useContext(AuthCtx);
  const isLead = role === 'steward' && !readOnly;
  const [toast, setToast] = React.useState(null);
  const [studies, setStudies] = React.useState(function() { return C && C.studies ? C.studies : []; });
  const [selectedIndicator, setSelectedIndicator] = React.useState('');
  const [formNote, setFormNote] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(function() {
    if (!caseId || (C && C.studies)) return;
    fetch('/api/studies?case_id=' + caseId).then(function(r) { return r.json(); }).then(setStudies).catch(function() {});
  }, [caseId]);

  const showToast = function(msg) {
    setToast(msg);
    setTimeout(function() { setToast(null); }, 3500);
  };

  const contestedFindings = C && C.findings ? C.findings.filter(function(f) { return f.contested; }) : [];
  const allFindings = C && C.findings ? C.findings : [];

  const handleCommission = function(e) {
    e.preventDefault();
    if (!selectedIndicator) return;
    setSubmitting(true);
    var due = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
    var name = selectedIndicator + ' — independent study';
    fetch('/api/studies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, body: formNote, due: due, case_id: caseId, finding: selectedIndicator })
    }).then(function(r) { return r.json(); }).then(function(res) {
      setSubmitting(false);
      if (res.ok) {
        var newStudy = { id: res.id, name: name, body: formNote, due: due, case_id: caseId, finding: selectedIndicator };
        setStudies(function(prev) { return [newStudy].concat(prev); });
        setFormNote('');
        setSelectedIndicator('');
        showToast('Study commissioned — it will appear in the mandated-study workbench.');
      } else {
        showToast('Error: ' + (res.err || 'could not submit'));
      }
    }).catch(function() { setSubmitting(false); showToast('Network error — try again.'); });
  };

  const title = C ? (C.title + ' — ' + C.id) : 'Evidence Record';

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '36px 24px 80px' }} data-screen-label="Evidence">
      {caseId && (
        <div style={{ marginBottom: 18 }}>
          <a href={"#/steward/case/" + caseId} className="btn btn-quiet btn-sm">
            &larr; Back to workspace
          </a>
        </div>
      )}
      <PageHead eyebrow="Evidence Record" title={title}
        sub="Source citations, formulas, and data provenance for each indicator. Commissioned studies resolve on top of the base finding." />

      {!C && (
        <div className="callout" style={{ padding: '20px 24px', marginBottom: 24 }}>
          <p style={{ margin: 0, color: 'var(--slate)' }}>No case selected. Open a case file and click Evidence to view case-specific findings.</p>
        </div>
      )}

      {C && C.findings && (
        <div style={{ display: 'grid', gap: 14, marginBottom: 48 }}>
          {C.findings.map(function(f) {
            const ind = INDS.find(function(i) { return i.n === f.k; });
            const score = parseFloat(f.v);
            const tone = score < 0.2 ? 'hi' : score < 0.5 ? 'med' : 'lo';
            const linked = studies.find(function(s) { return s.finding === f.k; });
            const days = linked ? Math.round((new Date(linked.due) - Date.now()) / 86400000) : null;
            return (
              <div key={f.k} className="card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                  <b style={{ fontSize: 15 }}>{f.k}</b>
                  <span className={'chip chip-' + tone} style={{ fontSize: 13 }}>{f.v}</span>
                  {f.contested && <Chip tone="hi">contested</Chip>}
                  <Chip tone="slate">{f.ver}</Chip>
                </div>
                <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 4 }}>{f.evidence}</div>
                {ind && (
                  <div className="microcopy" style={{ lineHeight: 1.6 }}>
                    <span style={{ fontWeight: 650 }}>Source:</span> {ind.src}<br />
                    <span style={{ fontWeight: 650 }}>Formula:</span> {ind.formula}
                  </div>
                )}
                {linked ? (
                  <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(46,204,113,0.08)', border: '1px solid rgba(46,204,113,0.35)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <Icon name="check-circle" size={14} color="#27AE60" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 650, color: '#27AE60' }}>Study mandated: {linked.name}</div>
                      {linked.body && <div className="microcopy" style={{ marginTop: 2 }}>{linked.body}</div>}
                    </div>
                    <div style={{ fontSize: 12, color: days < 30 ? '#C0392B' : 'var(--slate)', fontWeight: 600, flexShrink: 0 }}>{days}d to deadline</div>
                  </div>
                ) : (
                  <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--sand)', borderRadius: 6, fontSize: 12.5, color: 'var(--slate)' }}>
                    No independent study on record
                    {f.contested && isLead && <span style={{ marginLeft: 8, color: 'var(--basalt)', fontWeight: 600, cursor: 'pointer' }} onClick={function() { setSelectedIndicator(f.k); document.getElementById('commission-form').scrollIntoView({ behavior: 'smooth' }); }}>Commission one &darr;</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isLead ? (
        <div id="commission-form" className="card" style={{ padding: '24px 28px' }}>
          <h3 style={{ fontSize: 17, marginBottom: 6 }}>Commission a study</h3>
          <p style={{ color: 'var(--slate)', fontSize: 14, margin: '0 0 20px', lineHeight: 1.6 }}>
            Refer a contested indicator to independent review. Merascope coordinates the commission, maintains chain of custody, and takes a 1–2% fee from the consultant side. The commissioned study resolves on top of the base finding and is visible to all parties.
          </p>
          <form onSubmit={handleCommission} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 650, color: 'var(--slate)', display: 'block', marginBottom: 4 }}>
                Indicator to study
              </label>
              <select
                value={selectedIndicator}
                onChange={function(e) { setSelectedIndicator(e.target.value); }}
                required
                style={{ width: '100%', padding: '9px 12px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontFamily: 'var(--sans)', fontSize: 14 }}>
                <option value="">Select an indicator...</option>
                {contestedFindings.length > 0 && <option disabled>── Contested ──</option>}
                {contestedFindings.map(function(f) {
                  var alreadyMandated = studies.some(function(s) { return s.finding === f.k; });
                  return <option key={f.k} value={f.k} disabled={alreadyMandated}>{f.k}{alreadyMandated ? ' (already mandated)' : ''}</option>;
                })}
                {allFindings.filter(function(f) { return !f.contested; }).length > 0 && <option disabled>── Other ──</option>}
                {allFindings.filter(function(f) { return !f.contested; }).map(function(f) {
                  var alreadyMandated = studies.some(function(s) { return s.finding === f.k; });
                  return <option key={f.k} value={f.k} disabled={alreadyMandated}>{f.k}{alreadyMandated ? ' (already mandated)' : ''}</option>;
                })}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 650, color: 'var(--slate)', display: 'block', marginBottom: 4 }}>
                Scope and rationale
              </label>
              <textarea
                value={formNote}
                onChange={function(e) { setFormNote(e.target.value); }}
                rows={4}
                required
                style={{ width: '100%', padding: '10px 12px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--paper)', color: 'var(--ink)', fontFamily: 'var(--sans)', fontSize: 14, resize: 'vertical' }}
                placeholder="e.g. Water availability score is contested by CTUIR. Request independent hydrologist review of well-log data and aquifer recharge rates."
              />
            </div>
            <div>
              <button type="submit" className="btn btn-accent" disabled={submitting || !selectedIndicator}>
                {submitting ? 'Submitting...' : 'Commission study'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="card" style={{ padding: '20px 24px', color: 'var(--slate)', fontSize: 14 }}>
          <b style={{ color: 'var(--ink)' }}>Commission a study</b>
          <p style={{ margin: '6px 0 0', lineHeight: 1.6 }}>Commissioning independent studies is a steward action. Sign in as a steward to refer a contested indicator to independent review.</p>
          {role !== 'steward' && <a href="#/login" className="btn btn-quiet btn-sm" style={{ marginTop: 10, display: 'inline-block' }}>Sign in</a>}
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 200,
          background: 'var(--lo-bg)', color: 'var(--lo-tx)', border: '1px solid var(--lo-tx)',
          borderRadius: 8, padding: '12px 20px', fontWeight: 600, fontSize: 14,
          boxShadow: '0 4px 16px rgba(0,0,0,.18)',
          animation: 'fadeSlideUp .25s ease'
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { PricingPage, LoginPage, MethodologyPage, EvidencePage });
