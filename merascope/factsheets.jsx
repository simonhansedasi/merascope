/* ── Fact sheets: print-styled US Letter previews ── */

function QRPlaceholder({ seed = 7, size = 64 }) {
  const n = 17, mods = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const inFinder = (x < 5 && y < 5) || (x > n - 6 && y < 5) || (x < 5 && y > n - 6);
    if (inFinder) continue;
    const v = Math.sin(x * 127.1 + y * 311.7 + seed * 53.7) * 43758.5453;
    if (v - Math.floor(v) > 0.52) mods.push(<rect key={x + '-' + y} x={x} y={y} width="1" height="1" />);
  }
  const finder = (fx, fy) => (
    <g key={fx + ',' + fy}><rect x={fx} y={fy} width="5" height="5" fill="none" stroke="#1A1A1A" strokeWidth="1" /><rect x={fx + 1.5} y={fy + 1.5} width="2" height="2" /></g>
  );
  return (
    <svg width={size} height={size} viewBox={`-0.5 -0.5 ${n + 1} ${n + 1}`} fill="#1A1A1A" aria-label="QR code linking to live page">
      {mods}{finder(0, 0)}{finder(n - 5, 0)}{finder(0, n - 5)}
    </svg>
  );
}

function SheetShell({ title, kicker, children, seed }) {
  const M = window.MERA;
  return (
    <div className="sheet" data-screen-label={'Fact sheet — ' + title}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <Wordmark size={13} />
        <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--slate)' }}>{M.VERSION} · June 11, 2026</div>
      </div>
      <div style={{ borderTop: '2.5px solid var(--evergreen)', paddingTop: 14, marginTop: 8 }}>
        <div className="eyebrow" style={{ fontSize: 10.5 }}>{kicker}</div>
        <h2 style={{ fontSize: 25, marginTop: 2 }}>{title}</h2>
      </div>
      <div style={{ marginTop: 16 }}>{children}</div>
      <div style={{ position: 'absolute', left: 58, right: 58, bottom: 38, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
        <div style={{ fontSize: 9.5, color: 'var(--slate)', maxWidth: 520, lineHeight: 1.5 }}>
          Methodology: 23 indicators normalized 0-1, 2 hard gates (protected land {'>'} 25%, FEMA flood zone), ZCTA geography. Sources: OSM (ODbL) · Census ACS · PRISM Climate Group · USGS NWIS + ASCE 7-22 · FEMA NFHL · EPA TRI + Envirofacts NPL + RCRA · EPA Green Book · SSURGO SDM · IHFC 2024 GHFDB · SRTM1 · EIA Form 860 + 860M · WRI Aqueduct 3.0 · PeeringDB. {M.VERSION}. All scoring code reproducible.
          <div style={{ marginTop: 4, fontWeight: 700, color: 'var(--evergreen)' }}>◈ Same Score Promise — identical methodology, weights, and sources for every reader of this page.</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <QRPlaceholder seed={seed} />
          <div style={{ fontSize: 8.5, color: 'var(--slate)', marginTop: 2 }}>live page</div>
        </div>
      </div>
    </div>
  );
}

function SheetH({ children }) {
  return <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 750, color: 'var(--slate)', borderBottom: '1px solid var(--line)', paddingBottom: 4, marginBottom: 9 }}>{children}</div>;
}

function FactSheetDynamic({ stateCode, onRawFeats }) {
  const [gradeData, setGradeData] = React.useState(null);
  const [rawFeats, setRawFeats] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!stateCode) return;
    let attempts = 0;

    function tryCompute() {
      if (window.computeStateGrades && window.getStateFeatures) {
        const result = window.computeStateGrades(stateCode);
        if (result) {
          const feats = window.getStateFeatures(stateCode);
          setGradeData(result);
          setRawFeats(feats);
          if (onRawFeats) onRawFeats(feats);
          setLoading(false);
          return;
        }
      }
      if (attempts >= 20) { setLoading(false); return; }
      attempts++;
      setTimeout(tryCompute, 500);
    }

    if (!window.getStateFeatures || !window.getStateFeatures(stateCode).length) {
      (window.loadGridCache ? window.loadGridCache() : Promise.reject(new Error('loadGridCache not available')))
        .then(() => tryCompute())
        .catch(() => { setLoading(false); });
    } else {
      tryCompute();
    }
  }, [stateCode]);

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--slate)' }}>
      Loading {window.STATE_NAMES ? window.STATE_NAMES[stateCode] : stateCode} data — computing national rankings across all 48 states...
    </div>
  );
  if (!gradeData) return (
    <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--slate)' }}>
      Could not load data for {stateCode}. <a href="#/explorer">Open the Explorer</a> first.
    </div>
  );

  const M = window.MERA;
  const { stateGrade, stateName, overallRank, grades } = gradeData;
  const n = grades[0] ? grades[0].n : 48;

  /* Raw physical stats from GeoJSON features */
  const props = rawFeats.map(f => f.properties);
  const med = col => {
    const vals = props.map(p => p[col]).filter(v => v != null && !isNaN(v)).sort((a, b) => a - b);
    if (!vals.length) return null;
    const m = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
  };
  const totalCells = props.length;
  const protectedGated = props.filter(p => p.protected_score === 0).length;
  const floodGated = props.filter(p => p.flood_score === 0).length;
  const viable = props.filter(p => p.protected_score !== 0 && p.flood_score !== 0).length;
  const medPrecip = med('ann_precip_mm');
  const medAquifer = med('aquifer_depth_ft');
  const medKsat = med('ksat_mean_ums');
  const maxSeismic = props.length ? Math.max(...props.map(p => p.seismic_pga_g || 0).filter(v => !isNaN(v))) : null;
  const medTxDist = med('tx_dist_m');
  const hasRaw = props.length > 0;

  return (
    <SheetShell kicker="State fact sheet" title={`${stateName} — data center siting posture`} seed={stateCode.charCodeAt(0) + stateCode.charCodeAt(1)}>
      <div style={{ display: 'grid', gridTemplateColumns: '185px 1fr', gap: 22 }}>

        {/* Left: grade block + category ranking list + grid stats */}
        <div>
          <div style={{ textAlign: 'center', background: 'var(--mist)', borderRadius: 10, padding: '16px 12px 12px' }}>
            <div className="score-serif" style={{ fontSize: 68, lineHeight: 1, color: 'var(--basalt)' }}>{stateGrade}</div>
            <div style={{ fontSize: 10, color: 'var(--slate)', marginTop: 3 }}>composite grade</div>
            <div style={{ fontSize: 10, color: 'var(--slate)', marginTop: 1 }}>{'#' + (overallRank + 1) + ' of ' + n + ' states'}</div>
            <div style={{ fontSize: 9, color: 'var(--slate)', marginTop: 8, lineHeight: 1.5, borderTop: '1px solid var(--line-soft)', paddingTop: 7, textAlign: 'left' }}>
              Grade reflects equal weighting across 5 categories. A state may score well overall while ranking poorly on a specific dimension (e.g. water). Use the Explorer to apply weights matching your priorities.
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            {grades.map(g => (
              <div key={g.k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 2px', borderBottom: '1px solid var(--line-soft)' }}>
                <span style={{ fontSize: 11, color: 'var(--slate)' }}>{g.k}</span>
                <span style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: 'var(--slate)' }}>{'#' + (g.rank + 1)}</span>
                  <span className="score-serif" style={{ fontSize: 13 }}>{g.g}</span>
                </span>
              </div>
            ))}
          </div>
          {hasRaw && (
            <div style={{ marginTop: 10 }}>
              <SheetH>Grid</SheetH>
              <div style={{ display: 'grid', gap: 2, fontSize: 11.5 }}>
                <div className="kv"><span>Total cells</span><b className="score-serif">{totalCells.toLocaleString()}</b></div>
                <div className="kv"><span>Viable</span><b className="score-serif">{viable.toLocaleString()}</b></div>
                <div className="kv"><span>Protected-gated</span><b className="score-serif">{protectedGated}</b></div>
                <div className="kv"><span>In flood zone</span><b className="score-serif">{floodGated}</b></div>
              </div>
            </div>
          )}
        </div>

        {/* Right: findings + physical profile */}
        <div>
          <SheetH>Category findings</SheetH>
          {grades.map(g => (
            <div key={g.k} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
                <span style={{ fontWeight: 700, fontSize: 12.5 }}>{g.k}</span>
                <span style={{ fontSize: 11, color: 'var(--slate)' }}>{'— ' + g.g + ', #' + (g.rank + 1) + ' of ' + g.n}</span>
              </div>
              <div style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--basalt)' }}>{g.why}</div>
            </div>
          ))}

          {hasRaw && (() => {
            const physStats = [
              medPrecip    != null ? { label: 'Annual precipitation',  val: Math.round(medPrecip) + ' mm' }          : null,
              medAquifer   != null ? { label: 'Depth to water table',  val: Math.round(medAquifer) + ' ft' }          : null,
              medKsat      != null ? { label: 'Hydraulic conductivity', val: medKsat.toFixed(1) + ' um/s' }           : null,
              maxSeismic        ? { label: 'Max seismic PGA',       val: maxSeismic.toFixed(3) + ' g' }           : null,
              medTxDist    != null ? { label: 'Median HV tx distance', val: (medTxDist / 1000).toFixed(1) + ' km' } : null,
            ].filter(Boolean);
            if (!physStats.length) return null;
            return (
              <React.Fragment>
                <SheetH>Physical profile — state medians</SheetH>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 16px', fontSize: 12 }}>
                  {physStats.map(s => (
                    <div key={s.label} className="kv"><span>{s.label}</span><b className="score-serif">{s.val}</b></div>
                  ))}
                </div>
                <div style={{ fontSize: 9.5, color: 'var(--slate)', marginTop: 5, lineHeight: 1.5 }}>
                  Precip: PRISM Climate Group 30-yr normals (1991-2020). Water table: USGS NWIS param 72019. K-sat: SSURGO chorizon thickness-weighted mean. Seismic: USGS ASCE 7-22 PGAm (Risk Cat II, Site Class C). Tx: OSM + EIA Form 860 distance to nearest HV line or substation.
                </div>
              </React.Fragment>
            );
          })()}
        </div>
      </div>
    </SheetShell>
  );
}

const _GRADE_SCALE = [
  { g: 'A+', pct: '0-8%',   desc: 'Top 4 states' },
  { g: 'A',  pct: '8-17%',  desc: 'Top 8 states' },
  { g: 'A-', pct: '17-25%', desc: 'Top 12 states' },
  { g: 'B+', pct: '25-33%', desc: 'Top 16 states' },
  { g: 'B',  pct: '33-42%', desc: 'Top 20 states' },
  { g: 'B-', pct: '42-50%', desc: 'Top 24 states' },
  { g: 'C+', pct: '50-58%', desc: 'Bottom 24 states' },
  { g: 'C',  pct: '58-67%', desc: 'Bottom 20 states' },
  { g: 'C-', pct: '67-75%', desc: 'Bottom 16 states' },
  { g: 'D+', pct: '75-83%', desc: 'Bottom 12 states' },
  { g: 'D',  pct: '83-92%', desc: 'Bottom 8 states' },
  { g: 'D-', pct: '92-100%', desc: 'Bottom 4 states' },
];

const _GRADE_CAT_DETAIL = [
  { k: 'Water Durability',       inds: 'Water availability, Aquifer depth, Waterway sensitivity' },
  { k: 'Grid Access',            inds: 'Transmission proximity' },
  { k: 'Hazard Exposure',        inds: 'Seismic safety, Flood safety' },
  { k: 'Community Burden',       inds: 'Community burden, Population exposure' },
  { k: 'Contamination Distance', inds: 'Contamination distance' },
];

function GradeMethodologyPanel() {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="panel" style={{ marginBottom: 20, padding: '12px 16px' }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
          cursor: 'pointer', fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 650,
          color: 'var(--ink)', padding: 0, width: '100%', textAlign: 'left' }}>
        {open ? '▼' : '▶'} How grades are calculated
      </button>
      {open && (
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
              color: 'var(--slate)', marginBottom: 8 }}>5 categories</div>
            <p style={{ fontSize: 13, color: 'var(--slate)', lineHeight: 1.6, margin: '0 0 10px' }}>
              Each category averages the nationally-normalized scores for its constituent indicators across all viable cells in the state. National normalization (p01/p99 across 48 states) makes cross-state comparison valid. The composite grade averages the 5 category scores with equal weight.
            </p>
            {_GRADE_CAT_DETAIL.map(c => (
              <div key={c.k} style={{ display: 'flex', gap: 10, marginBottom: 5, fontSize: 12.5 }}>
                <span style={{ fontWeight: 700, minWidth: 160, flexShrink: 0 }}>{c.k}</span>
                <span style={{ color: 'var(--slate)' }}>{c.inds}</span>
              </div>
            ))}
          </div>

          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
              color: 'var(--slate)', marginBottom: 8 }}>12-point grade scale</div>
            <p style={{ fontSize: 13, color: 'var(--slate)', lineHeight: 1.6, margin: '0 0 10px' }}>
              Grades are rank-percentile based, not score-threshold based. A state scores A+ by ranking in the top 8% of states on a given category — not by crossing an absolute score cutoff. With 48 states, each grade band covers roughly 4 states.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '3px 8px' }}>
              {_GRADE_SCALE.map(row => (
                <div key={row.g} style={{ display: 'flex', alignItems: 'baseline', gap: 5, fontSize: 12 }}>
                  <span className="score-serif" style={{ fontSize: 14, minWidth: 28 }}>{row.g}</span>
                  <span style={{ color: 'var(--slate)', fontSize: 11 }}>{row.pct}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

function IndicatorBreakdownPanel({ rawFeats }) {
  if (!rawFeats || !rawFeats.length) return null;
  const M = window.MERA;
  const props = rawFeats.map(f => f.properties);
  const rows = M.INDICATORS.map(ind => {
    const vals = props.map(p => p[ind.nat_col]).filter(v => v != null && !isNaN(v));
    if (!vals.length) return null;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { label: ind.label, score: mean, k: ind.k, confidence: ind.confidence, confidence_note: ind.confidence_note };
  }).filter(Boolean).sort((a, b) => b.score - a.score);

  const barColor = s => s >= 0.67 ? 'var(--evergreen)' : s >= 0.33 ? '#b89a2a' : '#c0392b';
  const quartileLabel = s => s >= 0.75 ? 'Top 25%' : s >= 0.5 ? 'Upper mid' : s >= 0.25 ? 'Lower mid' : 'Bottom 25%';
  const confColor = c => c === 'High' ? 'var(--evergreen)' : c === 'Medium' ? '#b89a2a' : '#c0392b';

  return (
    <div className="panel" style={{ maxWidth: 980, margin: '0 auto 20px', padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 650 }}>Indicator score breakdown — national comparison</div>
        <div style={{ fontSize: 11, color: 'var(--slate)' }}>
          Confidence: <span style={{ color: 'var(--evergreen)', fontWeight: 700 }}>H</span> direct lookup &ensp;
          <span style={{ color: '#b89a2a', fontWeight: 700 }}>M</span> interpolated &ensp;
          <span style={{ color: '#c0392b', fontWeight: 700 }}>L</span> sparse data — hover for detail
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px 24px' }}>
        {rows.map(r => (
          <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--line-soft)' }}>
            <span style={{ fontSize: 12, color: 'var(--slate)', minWidth: 160, flexShrink: 0 }}>{r.label}</span>
            <div style={{ flex: 1, height: 7, background: 'var(--line-soft)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: (r.score * 100) + '%', height: '100%', background: barColor(r.score), borderRadius: 4 }} />
            </div>
            <span style={{ fontSize: 11, color: barColor(r.score), minWidth: 70, textAlign: 'right', flexShrink: 0, fontWeight: 600 }}>{quartileLabel(r.score)}</span>
            {r.confidence && (
              <span title={r.confidence_note || r.confidence}
                style={{ fontSize: 10, fontWeight: 700, color: confColor(r.confidence), minWidth: 10, flexShrink: 0, cursor: 'help' }}>
                {r.confidence[0]}
              </span>
            )}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--slate)', marginTop: 10, lineHeight: 1.5 }}>
        Bars show the state mean score on the national scale (p01/p99 across all 48 states, 1 = most favorable). Sorted strongest to weakest. Quartile reflects where this state falls relative to the national distribution for each indicator. This section does not appear in the printed fact sheet.
      </div>
    </div>
  );
}

function DataSourcesPanel() {
  const [open, setOpen] = React.useState(false);
  const M = window.MERA;
  return (
    <div className="panel" style={{ marginBottom: 20, padding: '12px 16px' }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
          cursor: 'pointer', fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 650,
          color: 'var(--ink)', padding: 0, width: '100%', textAlign: 'left' }}>
        {open ? '▼' : '▶'} Data sources and spatial methods
      </button>
      {open && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.6, margin: '0 0 12px' }}>
            Each indicator is computed from a public federal or open dataset. All pipeline scripts are reproducible and stateless; re-running a script against the same source data produces identical scores. Scores are normalized 0-1 within state (state view) or against the national p01/p99 distribution (national view). Raw physical values are stored alongside every score to support re-normalization at any geographic window.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            {M.INDICATORS.map(ind => (
              <div key={ind.k} style={{ padding: '7px 0', borderBottom: '1px solid var(--line-soft)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 2 }}>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>{ind.label}</div>
                  {ind.confidence && (() => {
                    const cc = ind.confidence === 'High' ? 'var(--evergreen)' : ind.confidence === 'Medium' ? '#b89a2a' : '#c0392b';
                    return <span title={ind.confidence_note} style={{ fontSize: 10, fontWeight: 700, color: cc, cursor: 'help' }}>{ind.confidence} confidence</span>;
                  })()}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--slate)', lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 600 }}>Source:</span> {ind.source}<br />
                  <span style={{ fontWeight: 600 }}>Method:</span> {ind.method}<br />
                  <span style={{ fontWeight: 600 }}>Update freq:</span> {ind.freq}
                  {ind.confidence_note && <><br /><span style={{ fontStyle: 'italic' }}>{ind.confidence_note}</span></>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FactSheetsPage({ which }) {
  const STATE_NAMES = window.STATE_NAMES || {};
  const initCode = which && which.length === 2 && STATE_NAMES[which.toUpperCase()] ? which.toUpperCase() : null;
  const [selectedState, setSelectedState] = React.useState(initCode);
  const [sheetFeats, setSheetFeats] = React.useState([]);

  function handleSelect(st) {
    setSelectedState(st || null);
    setSheetFeats([]);
    location.hash = st ? '#/factsheets/' + st : '#/factsheets';
  }

  const stateName = selectedState ? (STATE_NAMES[selectedState] || selectedState) : null;

  return (
    <div data-screen-label={stateName ? 'Fact sheet — ' + stateName : 'Fact sheets'}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '30px 24px 0' }}>
        <PageHead eyebrow="Fact sheets — print-grade, version-stamped"
          title={stateName ? stateName + ' — data center siting posture' : 'State fact sheets'}
          sub="15-indicator profile, national rankings, physical measurements. Select a state to load its fact sheet."
          right={selectedState
            ? <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>Print / Save as PDF</button>
            : null} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <StateSelector selectedState={selectedState} onChange={handleSelect} />
          {selectedState && (
            <span className="microcopy">Loading ranks all 48 states — takes a few seconds on first open.</span>
          )}
        </div>
        <GradeMethodologyPanel />
        <DataSourcesPanel />
      </div>
      {selectedState ? (
        <div className="sheet-wrap" style={{ marginTop: 0 }}>
          <FactSheetDynamic stateCode={selectedState} onRawFeats={setSheetFeats} />
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '80px 24px', color: 'var(--slate)', fontSize: 15 }}>
          Select a state above to load its fact sheet.
          <div className="microcopy" style={{ marginTop: 8 }}>Company and site formats available in paid tiers.</div>
        </div>
      )}
      {selectedState && <IndicatorBreakdownPanel rawFeats={sheetFeats} />}
    </div>
  );
}

Object.assign(window, { FactSheetsPage, QRPlaceholder });
