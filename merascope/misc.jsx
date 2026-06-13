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
            <span style={{ width: 36, height: 36, borderRadius: 8, background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--line)' }}><Icon name="pylon" size={19} color="var(--basalt)" /></span>
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
            <span style={{ width: 36, height: 36, borderRadius: 8, background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--line)' }}><Icon name="gavel" size={19} color="var(--evergreen)" /></span>
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
          <p style={{ margin: '3px 0 0', fontSize: 13.5, color: 'var(--slate)', maxWidth: 620 }}>The Public Explorer, report cards, methodology, fact sheets — and the Token Tracker plug-in. They are the point, not the funnel.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="btn btn-quiet btn-sm" href="#/explorer">Open the Explorer</a>
          <a className="btn btn-quiet btn-sm" href="#/tracker">Get the Token Tracker</a>
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
          <form onSubmit={e => { e.preventDefault(); setErr('That didn’t match. Try again, or reset below.'); }} style={{ display: 'grid', gap: 10 }}>
            <input placeholder="Email" type="email" required style={{ padding: '10px 13px', border: '1px solid var(--line)', borderRadius: 7, fontSize: 14.5, background: '#fff' }} />
            <input placeholder="Password" type="password" required style={{ padding: '10px 13px', border: '1px solid var(--line)', borderRadius: 7, fontSize: 14.5, background: '#fff' }} />
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
                <label key={r.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, background: newRole === r.id ? '#fff' : 'transparent', border: '1px solid ' + (newRole === r.id ? 'var(--evergreen)' : 'var(--line-soft)'), borderRadius: 8, padding: '8px 11px', cursor: 'pointer' }}>
                  <input type="radio" name="newrole" checked={newRole === r.id} onChange={() => setNewRole(r.id)} style={{ marginTop: 2 }} />
                  <span><b style={{ fontWeight: 650 }}>{r.name}</b><span style={{ color: 'var(--slate)' }}> — {r.desc}</span></span>
                </label>
              ))}
            </div>
            <button className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: 10 }} onClick={() => enter(newRole)}>Create workspace</button>
            <p className="microcopy" style={{ margin: '8px 0 0' }}>More roles coming — researcher, advocate, educator. Just exploring? <a href="#/explorer">You don’t need an account for the public map.</a></p>
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
  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '36px 24px 60px' }} data-screen-label="Methodology">
      <PageHead eyebrow="About the methodology" title="Public, identical, reproducible."
        sub="If you can read this page, you can rebuild the map. That is the point." />
      <div className="callout" style={{ padding: '16px 20px', fontSize: 14, lineHeight: 1.6, marginBottom: 26 }}>
        <b style={{ color: 'var(--evergreen)' }}>◈ The Same Score Promise.</b> {M.PROMISE.long}
      </div>
      <h3 style={{ fontSize: 17, marginBottom: 10 }}>Nine indicators, normalized 0–1</h3>
      <div className="card" style={{ overflow: 'auto', marginBottom: 26 }}>
        <table className="mtable">
          <thead><tr><th>Indicator</th><th>Default weight</th><th>Primary sources</th></tr></thead>
          <tbody>
            {[['Transmission proximity', '40%', 'OSM power=line ≥230 kV (ODbL)'],
              ['Water availability', '35%', 'Open-Meteo ERA5; state well logs; adjudication records'],
              ['Community burden', '25%', 'US Census ACS 5-yr; EPA EJScreen-class inputs'],
              ['Seismic safety', '0%', 'USGS NSHM PGA'],
              ['Flood safety', '0%', 'FEMA NFHL SFHA'],
              ['Contamination distance', '0%', 'EPA NPL / Superfund'],
              ['Waterway sensitivity', '0%', 'Critical-habitat reaches; mainstem proximity'],
              ['Geothermal opportunity', '0%', 'IHFC 2024 heat-flow'],
              ['Terrain flatness', '0%', 'USGS 3DEP DEM']].map(([a, b, c]) => (
              <tr key={a}><td style={{ fontWeight: 650 }}>{a}</td><td className="score-serif">{b}</td><td style={{ fontSize: 13, color: 'var(--slate)' }}>{c}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 style={{ fontSize: 17, marginBottom: 8 }}>Two hard gates — not sliders</h3>
      <p style={{ fontSize: 14.5, lineHeight: 1.65 }}>
        A cell is excluded outright when less than <span className="score-serif">3%</span> of its terrain is flat, or when more than <span className="score-serif">25%</span> is protected or sovereign land.
        In Washington: <span className="score-serif">61</span> terrain-gated cells, <span className="score-serif">82</span> protected-gated, <span className="score-serif">124</span> total excluded of <span className="score-serif">974</span> (<span className="score-serif">850</span> viable). Gates apply regardless of weights — no weighting scheme can buy back an unbuildable cell.
      </p>
      <h3 style={{ fontSize: 17, margin: '24px 0 8px' }}>One engine, many geographies</h3>
      <p style={{ fontSize: 14.5, lineHeight: 1.65, marginBottom: 12 }}>
        The public map is the 0.15° grid — free forever. Paid tiers re-aggregate the same cell scores into the geographies decisions actually use. Rollups are exact re-aggregations of published cell scores, computed up each hierarchy — never re-scored, never re-weighted behind the curtain.
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
      <p className="microcopy" style={{ marginBottom: 4 }}>Tribal lands appear in consultation workflows only with the consent of the sovereign government concerned — they are parties, not polygons.</p>
      <h3 style={{ fontSize: 17, margin: '24px 0 8px' }}>Reproducibility</h3>
      <p style={{ fontSize: 14.5, lineHeight: 1.65 }}>
        Every input is public: {M.DATA_SOURCES}. The scoring code is published and version-stamped ({M.VERSION}); every score shown anywhere in the product carries its version. Run it yourself and you will get our numbers — that is the warranty.
      </p>
      <div style={{ marginTop: 26, display: 'flex', gap: 10 }}>
        <a className="btn btn-primary" href="#/explorer">Open the Explorer</a>
        <a className="btn btn-quiet" href="#/factsheets">Fact sheets</a>
      </div>
    </div>
  );
}

Object.assign(window, { PricingPage, LoginPage, MethodologyPage });
