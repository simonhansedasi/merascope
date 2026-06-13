/* ── Surface B (cont.): site profile, watchlist, portfolio ── */

const PROFILE_TABS = ['Overview', 'Water & Rights', 'Grid & Queue', 'Hazard & Insurance', 'Community & Permitting Posture', 'Heat-Reuse & Carbon Upside', 'Field Truth', 'Comparables'];

function SiteProfile({ id }) {
  const M = window.MERA;
  const site = M.SITES.find(s => s.id === id) || M.SITES[0];
  const [tab, setTab] = React.useState('Overview');
  const cell = M.cellAt(site.lat, site.lon);
  const ind = cell ? cell.ind : null;

  const tabBody = {
    'Overview': (
      <div style={{ display: 'grid', gap: 14 }}>
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.65 }}>{site.blurb}</p>
        <div style={{ display: 'grid', gap: 6, maxWidth: 460 }}>
          {ind && M.INDICATORS.map(m => <BarRow key={m.k} label={m.label} value={ind[m.k]} width={170} />)}
        </div>
      </div>
    ),
    'Water & Rights': (
      <div style={{ display: 'grid', gap: 4, maxWidth: 560 }}>
        <div className="kv"><span>Water-rights status</span><b>{site.waterRights}</b></div>
        <div className="kv"><span>Consumptive-use ceiling (modeled)</span><b><span className="score-serif">412</span> ac-ft/yr</b></div>
        <div className="kv"><span>Basin adjudication</span><b>{site.waterRights === 'Adjudicated' ? 'Complete — senior rights mapped' : 'Open — junior rights at curtailment risk'}</b></div>
        <div className="kv"><span>Closed-loop feasibility</span><b>Yes — ~0.12 L/kWh design basis</b></div>
        <p className="microcopy" style={{ marginTop: 8 }}>Rights, not rainfall. The indicator scores legal availability under drought-year curtailment, not average precipitation.</p>
      </div>
    ),
    'Grid & Queue': (
      <div style={{ display: 'grid', gap: 4, maxWidth: 560 }}>
        <div className="kv"><span>Nearest line</span><b><span className="score-serif">{site.kvDist}</span> km to {site.kv} kV</b></div>
        <div className="kv"><span>Serving utility</span><b>{site.county} PUD</b></div>
        <div className="kv"><span>Queue position (modeled)</span><b>Cluster study 2027-Q2 window</b></div>
        <div className="kv"><span>Estimated queue-to-power</span><b><span className="score-serif">{site.kv >= 500 ? '4.5' : '6.5'}</span> yrs vs 7+ national avg</b></div>
      </div>
    ),
    'Hazard & Insurance': (
      <div style={{ display: 'grid', gap: 4, maxWidth: 560 }}>
        <div className="kv"><span>Seismic (PGA 10%/50 yr)</span><b className="score-serif">{ind ? (0.5 - ind.seismic * 0.4).toFixed(2) : '—'}g</b></div>
        <div className="kv"><span>SFHA flood overlap</span><b>None mapped</b></div>
        <div className="kv"><span>Wildfire interface</span><b>{site.lon < -121 ? 'Low' : 'Moderate'}</b></div>
        <div className="kv"><span>Insurer pre-screen</span><b>{site.flags[0].t.replace('Insurance: ', '')}</b></div>
      </div>
    ),
    'Community & Permitting Posture': (
      <div style={{ maxWidth: 560 }}>
        <div className="kv"><span>ZCTA {site.zcta} population</span><b className="score-serif">{site.pop.toLocaleString()}</b></div>
        <div className="kv"><span>EJ burden indicator</span><b className="score-serif">{ind ? ind.community.toFixed(3) : '—'}</b></div>
        <div className="kv"><span>Prior large-project hearings</span><b>2 — both approved with conditions</b></div>
        <p className="microcopy" style={{ marginTop: 8 }}>Posture is observed behavior — median approval time, moratorium history, condition patterns — not sentiment polling.</p>
      </div>
    ),
    'Heat-Reuse & Carbon Upside': (
      <div style={{ maxWidth: 560 }}>
        <div className="kv"><span>Heat-reuse demand within 5 km</span><b>{site.bars['Heat-reuse'] >= 0.55 ? 'Yes — district / greenhouse offtake' : 'Limited'}</b></div>
        <div className="kv"><span>Geothermal opportunity</span><b className="score-serif">{ind ? ind.geothermal.toFixed(3) : '—'}</b></div>
        <div className="kv"><span>Waste-heat DAC suitability</span><b>{site.bars['Heat-reuse'] >= 0.5 ? 'Screen-positive' : 'Not screened'}</b></div>
        <p className="microcopy" style={{ marginTop: 8 }}>Purchased offsets are scored as the weakest claim tier. On-site reuse and additionality score highest.</p>
      </div>
    ),
    'Field Truth': (
      <div style={{ maxWidth: 560 }}>
        <div className="card" style={{ padding: '13px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
          <Icon name="borehole" size={22} color="var(--basalt)" />
          <div>
            <b style={{ fontSize: 14 }}>Geotech: ordered via partner — in progress</b>
            <div className="microcopy">Chain-of-custody #4471 · proctored survey · results post to this profile and version the score.</div>
          </div>
          <Chip tone="med" style={{ marginLeft: 'auto' }}>In progress</Chip>
        </div>
        <div className="card" style={{ padding: '13px 16px', display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
          <Icon name="droplet" size={22} color="var(--slate)" />
          <div>
            <b style={{ fontSize: 14 }}>Hydrogeology survey</b>
            <div className="microcopy">Not yet ordered. Partner bench: 3 qualified firms in-state.</div>
          </div>
          <button className="btn btn-quiet btn-xs" style={{ marginLeft: 'auto' }}>Order survey</button>
        </div>
      </div>
    ),
    'Comparables': (
      <div style={{ display: 'grid', gap: 10 }}>
        <p className="microcopy" style={{ margin: 0 }}>Sites like this — matched on grid class, water posture, and acreage band.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {M.SITES.filter(s => s.id !== site.id && Math.abs(s.composite - site.composite) < 0.16).slice(0, 3).map(s => (
            <div key={s.id} className="card" style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }} onClick={() => { location.hash = '#/builder/site/' + s.id; }}>
              <SiteThumb site={s} w={70} h={52} />
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 13.5, display: 'block' }}>{s.title}</b>
                <span className="microcopy">{s.cell}</span>
              </div>
              <ScoreBadge value={s.composite} size={13} decimals={2} style={{ marginLeft: 'auto' }} />
            </div>
          ))}
        </div>
      </div>
    )
  };

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Builder — Site profile">
      <a href="#/builder" style={{ fontSize: 13, fontWeight: 650, textDecoration: 'none' }}>← Back to search</a>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginTop: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 640px', minWidth: 0 }}>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
              <div>
                <h2 style={{ fontSize: 23 }}>{site.title}</h2>
                <div className="microcopy">{site.cell} · {site.county} County, WA · ZCTA {site.zcta}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <ScoreBadge value={site.composite} size={24} decimals={2} style={{ padding: '4px 13px' }} />
                <div className="microcopy" style={{ marginTop: 3 }}>composite · default weights</div>
              </div>
            </div>
            <WAMap weights={window.MERA.DEFAULT_WEIGHTS} markers={false} recommended={false} highlight={site} pins={[site]} />
          </div>
          <div className="card" style={{ marginTop: 14, padding: '0 16px 18px' }}>
            <div className="tabs" style={{ margin: '0 -16px 16px', padding: '0 16px' }}>
              {PROFILE_TABS.map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}
            </div>
            {tabBody[tab]}
          </div>
        </div>
        <div style={{ width: 300, flexShrink: 0, display: 'grid', gap: 12 }}>
          <div className="panel" style={{ padding: '15px 17px' }}>
            <div style={{ fontSize: 11.5, letterSpacing: '.09em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--slate)', marginBottom: 8 }}>Permitting posture</div>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
              <b>{site.county} County</b> — median large-project approval <span className="score-serif">14</span> mo, no active moratorium, 1 prior DC approved w/ conditions.
            </p>
          </div>
          <div className="card" style={{ padding: '15px 17px' }}>
            <div style={{ fontSize: 11.5, letterSpacing: '.09em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--slate)', marginBottom: 8 }}>Key facts</div>
            <div className="kv"><span>Buildable acres</span><b className="score-serif">{site.acres}</b></div>
            <div className="kv"><span>Line distance</span><b><span className="score-serif">{site.kvDist}</span> km · {site.kv} kV</b></div>
            <div className="kv"><span>Qualifying parcels</span><b className="score-serif">{site.parcels}</b></div>
            <div className="kv" style={{ borderBottom: 'none' }}><span>Water rights</span><b>{site.waterRights}</b></div>
          </div>
          <button className="btn btn-accent" style={{ width: '100%' }}>Export board-ready dossier (PDF)</button>
          <a className="btn btn-quiet" href="#/factsheets/site" style={{ width: '100%' }}>Site fact sheet</a>
          <div style={{ textAlign: 'center' }}><PromiseBadge compact /></div>
        </div>
      </div>
    </div>
  );
}

function WatchlistPage() {
  const M = window.MERA;
  const loading = useFakeLoad(650);
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Builder — Watchlist">
      <BuilderSubNav active="watchlist" />
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 480px' }}>
          <h3 style={{ fontSize: 17, marginBottom: 10 }}>Change alerts</h3>
          {loading ? <div style={{ display: 'grid', gap: 9 }}><div className="shimmer" style={{ height: 64 }}></div><div className="shimmer" style={{ height: 64 }}></div><div className="shimmer" style={{ height: 64 }}></div></div> : (
            <div style={{ display: 'grid', gap: 9 }}>
              {M.ALERTS.map(a => (
                <div key={a.title} className="card" style={{ padding: '12px 15px', display: 'flex', gap: 12 }}>
                  <span className={'chip chip-' + a.tone} style={{ alignSelf: 'flex-start', minWidth: 26, justifyContent: 'center' }}>{a.icon}</span>
                  <div style={{ flex: 1 }}>
                    <b style={{ fontSize: 14 }}>{a.title}</b>
                    <div style={{ fontSize: 13, color: 'var(--slate)', marginTop: 2 }}>{a.detail}</div>
                  </div>
                  <span className="microcopy" style={{ whiteSpace: 'nowrap' }}>{a.age}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ flex: '1 1 380px' }}>
          <h3 style={{ fontSize: 17, marginBottom: 10 }}>Watched sites</h3>
          <div style={{ display: 'grid', gap: 9 }}>
            {M.WATCHED.map(id => {
              const s = M.SITES.find(x => x.id === id);
              return s && (
                <div key={id} className="card" style={{ padding: 11, display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }} onClick={() => { location.hash = '#/builder/site/' + id; }}>
                  <SiteThumb site={s} w={62} h={46} />
                  <div style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 13.5, display: 'block' }}>{s.title}</b>
                    <span className="microcopy">{s.cell}</span>
                  </div>
                  <ScoreBadge value={s.composite} size={13} decimals={2} style={{ marginLeft: 'auto' }} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function PortfolioPage() {
  const M = window.MERA;
  const { ramp } = React.useContext(MeraCtx);
  const [killOnly, setKillOnly] = React.useState(false);
  const rows = killOnly ? M.PORTFOLIO.filter(r => r.fail) : M.PORTFOLIO;
  const failCount = M.PORTFOLIO.filter(r => r.fail).length;
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Builder — Portfolio screening">
      <BuilderSubNav active="portfolio" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <div>
          <h3 style={{ fontSize: 17 }}>Portfolio screening — Skyline Infrastructure Partners</h3>
          <p className="microcopy" style={{ margin: '2px 0 0' }}><span className="score-serif">{M.PORTFOLIO.length}</span> candidates scored in bulk · <span className="score-serif">{failCount}</span> fail pre-siting screens</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13.5, fontWeight: 650 }}>
            <input type="checkbox" checked={killOnly} onChange={e => setKillOnly(e.target.checked)} /> Kill-list only
          </label>
          <button className="btn btn-ghost btn-sm">Upload CSV</button>
        </div>
      </div>
      <div className="card" style={{ overflow: 'auto' }}>
        <table className="mtable">
          <thead><tr><th>Candidate</th><th>Cell</th><th>Composite</th><th>Screen</th><th>Why</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.name} style={{ opacity: r.fail && !killOnly ? 0.96 : 1 }}>
                <td style={{ fontWeight: 650 }}>{r.name}</td>
                <td className="microcopy">{r.cell}</td>
                <td>{r.composite > 0
                  ? <span className="score-badge" style={{ background: M.rampColor(r.composite, ramp), color: M.rampText(r.composite, ramp), fontSize: 13.5 }}>{r.composite.toFixed(3)}</span>
                  : <Chip tone="gate">gated</Chip>}</td>
                <td>{r.fail ? <Chip tone="hi">FAIL</Chip> : <Chip tone="lo">PASS</Chip>}</td>
                <td style={{ fontSize: 13, color: r.fail ? 'var(--hi-tx)' : 'var(--slate)', maxWidth: 380 }}>{r.why || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="microcopy" style={{ marginTop: 10 }}>Screens are the public gates plus your filters — the same scores everyone sees, applied before capital is.</p>
    </div>
  );
}

Object.assign(window, { SiteProfile, WatchlistPage, PortfolioPage });
