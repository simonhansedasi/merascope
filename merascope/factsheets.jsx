/* ── Fact sheets: print-styled US Letter previews ── */
// Home page of the public/press ("Reporter") surface at #/factsheets. Renders a
// per-state, letter-sized, print-ready "fact sheet" (composite grade, category
// rankings, physical medians) computed client-side from the same grid cache the
// Explorer map uses — no separate fact-sheet backend, no separate scoring path.
// Also hosts the "All-state rankings" leaderboard (RankingsPage) and the two
// screen-only methodology/breakdown panels shown below the printable area.
// See CONTEXT.md "Report card system" / "Indicator breakdown & methodology panels"
// for the grading algorithm this file's components consume from explorer.jsx.

// Human-readable date derived from the pipeline version string (vYYYY.MM.DD) so
// the printed sheet's date can never drift from the data it was built with.
function versionDate(v) {
  const m = /v(\d{4})\.(\d{2})\.(\d{2})/.exec(v || '');
  if (!m) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1];
}

// Common print-styled wrapper for every "sheet" in this file (state fact sheets;
// company/site sheets would use it too if built). Draws the branded header
// (wordmark + pipeline version/date), the title block, the children content area,
// and a fixed footer with the methodology summary, source list, Same Score
// Promise, and a permalink — all styled for US Letter printing via the `.sheet`
// CSS class (see window.print() call in FactSheetsPage).
function SheetShell({ title, kicker, children, seed, code }) {
  const M = window.MERA;
  const permalink = 'merascope.com/#/factsheets/' + (code || '');
  return (
    <div className="sheet" data-screen-label={'Fact sheet — ' + title}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <Wordmark size={13} />
        <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--slate)' }}>{M.VERSION} · {versionDate(M.VERSION)}</div>
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
        <div style={{ textAlign: 'right', minWidth: 150 }}>
          <div style={{ fontSize: 8.5, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Live, reproducible page</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--evergreen)', marginTop: 2 }}>{permalink}</div>
        </div>
      </div>
    </div>
  );
}

// Small uppercase section-header label used inside a sheet (e.g. "Grid",
// "Category findings", "Physical profile").
function SheetH({ children }) {
  return <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 750, color: 'var(--slate)', borderBottom: '1px solid var(--line)', paddingBottom: 4, marginBottom: 9 }}>{children}</div>;
}

// Renders one state's fact sheet: composite grade, per-category grades/ranks,
// grid stats, and physical-profile medians. All numbers are computed client-side
// from the grid cache the Explorer map already loaded — this component doesn't
// hit the server, it hits window.computeStateGrades/getStateFeatures (explorer.jsx).
function FactSheetDynamic({ stateCode, onRawFeats, onGradeData }) {
  const [gradeData, setGradeData] = React.useState(null);
  const [rawFeats, setRawFeats] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!stateCode) return;
    let attempts = 0;

    // Retry-poll pattern: the grid cache may still be loading (esp. on a cold
    // navigation straight to a fact-sheet URL, before the Explorer has ever run),
    // so keep retrying computeStateGrades every 500ms for up to ~10s (20 attempts)
    // before giving up and showing the "could not load" fallback below.
    function tryCompute() {
      if (window.computeStateGrades && window.getStateFeatures) {
        const result = window.computeStateGrades(stateCode);
        if (result) {
          const feats = window.getStateFeatures(stateCode);
          setGradeData(result);
          setRawFeats(feats);
          if (onRawFeats) onRawFeats(feats);
          if (onGradeData) onGradeData(result);
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
  // These are unscored, unnormalized medians/maxes (precip, aquifer depth,
  // ksat, seismic PGA, tx distance) pulled straight from the grid cell
  // properties — distinct from the 0-1 normalized scores used for grading.
  // Gives readers a physical sanity check alongside the abstract grade.
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
    <SheetShell kicker="State fact sheet" title={`${stateName} — data center siting posture`} code={stateCode} seed={stateCode.charCodeAt(0) + stateCode.charCodeAt(1)}>
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
                {stateCode !== 'WA' && (medAquifer == null || !maxSeismic || medKsat == null) && (
                  <div style={{ fontSize: 9.5, color: 'var(--slate)', marginTop: 4, fontStyle: 'italic' }}>
                    Seismic PGA, water-table depth, and hydraulic-conductivity raw medians are currently published for Washington only; scored indicators cover all 48 states.
                  </div>
                )}
              </React.Fragment>
            );
          })()}
        </div>
      </div>
    </SheetShell>
  );
}

// Reference table for GradeMethodologyPanel: the 12-band letter-grade scale is
// rank-percentile based (not score-threshold based) — a state earns A+ by
// landing in the top ~8% of the 48 states on a category, not by crossing a
// fixed score. With 48 states each band covers roughly 4 states.
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

// Reference table for GradeMethodologyPanel: maps each of the 5 grading
// categories to the underlying indicator(s) it's an average of.
const _GRADE_CAT_DETAIL = [
  { k: 'Water Durability',       inds: 'Water availability, Aquifer depth, Waterway sensitivity' },
  { k: 'Grid Access',            inds: 'Transmission proximity' },
  { k: 'Hazard Exposure',        inds: 'Seismic safety, Flood safety' },
  { k: 'Community Burden',       inds: 'Community burden, Population exposure' },
  { k: 'Contamination Distance', inds: 'Contamination distance' },
];

// Collapsible "How grades are calculated" explainer shown above every fact
// sheet and the rankings leaderboard. Purely presentational — renders the
// static _GRADE_CAT_DETAIL / _GRADE_SCALE reference tables, no data fetching.
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

// Screen-only (excluded from print) panel showing every indicator's state mean
// score on the national 0-1 scale, sorted strongest to weakest, with a
// confidence chip (H/M/L) per indicator. Gives a reader more granularity than
// the 5-category grades above without requiring them to open the Explorer.
function IndicatorBreakdownPanel({ rawFeats }) {
  if (!rawFeats || !rawFeats.length) return null;
  const M = window.MERA;
  const props = rawFeats.map(f => f.properties);
  // Average each indicator's nationally-normalized column (nat_col) across all
  // cells in the state, then sort descending so the strongest indicators lead.
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

// Collapsible per-indicator source/method/update-frequency/confidence table.
// Purely presentational, driven off M.INDICATORS (data.js) — the same
// indicator metadata that also backs the Methodology page (misc.jsx).
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

// Triggers a browser download of a CSV built from an array of already-joined
// CSV line strings (each element is one full line, header included).
function _downloadCsv(filename, rows) {
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows.join('\n'));
  a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// Quotes and escapes a single CSV field.
function _csvCell(v) {
  return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
}

/* ── All-state rankings — the journalist's leaderboard ── */

// Sortable all-48-state leaderboard (overall + per-category grade/rank),
// with top-5/bottom-5 callout cards and CSV export. Route: #/factsheets/rankings,
// rendered by FactSheetsPage when `which === 'rankings'`.
function RankingsPage() {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [sort, setSort] = React.useState({ k: 'overall', dir: 1 });

  React.useEffect(() => {
    let attempts = 0;
    // Same cold-cache retry-poll pattern as FactSheetDynamic, but calling
    // computeAllStateGrades() ONCE for all 48 states in a single pass — never
    // call the per-state computeStateGrades() in a loop here, that recomputes
    // every state's category means from scratch each time (O(n^2) trap; see
    // CONTEXT.md "computeAllStateGrades performance note").
    function tryCompute() {
      if (window.computeAllStateGrades) {
        const result = window.computeAllStateGrades();
        if (result) { setData(result); setLoading(false); return; }
      }
      if (attempts >= 20) { setLoading(false); return; }
      attempts++;
      setTimeout(tryCompute, 500);
    }
    (window.loadGridCache ? window.loadGridCache() : Promise.reject(new Error('no grid cache')))
      .then(() => tryCompute())
      .catch(() => { setLoading(false); });
  }, []);

  const gradeColor = window._gradeColor || function() { return 'var(--basalt)'; };

  if (loading) return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '30px 24px 60px' }} data-screen-label="State rankings">
      <PageHead eyebrow="State rankings" title="How the 48 states stack up" sub="Computing national rankings across all 48 states — takes a few seconds on first open." />
      <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--slate)' }}>Loading all-state grid data...</div>
    </div>
  );
  if (!data) return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '30px 24px 60px' }} data-screen-label="State rankings">
      <PageHead eyebrow="State rankings" title="How the 48 states stack up" sub="" />
      <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--slate)' }}>
        Could not load grid data. <a href="#/explorer">Open the Explorer</a> first.
      </div>
    </div>
  );

  // sort.k is either 'name', 'overall', or one of the 5 category names; sort.dir
  // flips between ascending/descending when the same column header is clicked twice.
  const catIdx = data.cats.indexOf(sort.k);
  const rows = [...data.states].sort((a, b) => {
    let va, vb;
    if (sort.k === 'name') { va = a.name; vb = b.name; return sort.dir * (va < vb ? -1 : va > vb ? 1 : 0); }
    if (sort.k === 'overall') { va = a.overall.rank; vb = b.overall.rank; }
    else { va = a.cats[catIdx] ? a.cats[catIdx].rank : 0; vb = b.cats[catIdx] ? b.cats[catIdx].rank : 0; }
    return sort.dir * (va - vb);
  });
  const top5 = data.states.slice(0, 5);
  const bottom5 = data.states.slice(-5).reverse();

  const exportCsv = () => {
    const header = ['state', 'code', 'overall_grade', 'overall_rank'].concat(
      data.cats.map(c => c.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_grade'),
      data.cats.map(c => c.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_rank'));
    const lines = [header.join(',')].concat(data.states.map(s =>
      [s.name, s.code, s.overall.g, s.overall.rank + 1]
        .concat(s.cats.map(c => c.g), s.cats.map(c => c.rank + 1))
        .map(_csvCell).join(',')));
    _downloadCsv('merascope_state_rankings.csv', lines);
  };

  // Clickable column-header cell; clicking the currently-active sort column
  // flips direction, clicking a new column sorts ascending by default.
  const th = (k, label) => (
    <th key={k} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
      onClick={() => setSort(s => ({ k, dir: s.k === k ? -s.dir : 1 }))}>
      {label}{sort.k === k ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
    </th>
  );

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '30px 24px 60px' }} data-screen-label="State rankings">
      <PageHead eyebrow="State rankings — same methodology as every fact sheet"
        title="How the 48 states stack up"
        sub={'Overall and per-category national rankings across all ' + data.n + ' contiguous states. Equal category weighting; click any column to sort, any state for its fact sheet.'}
        right={<button className="btn btn-ghost btn-sm" onClick={exportCsv}>Download CSV</button>} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 20 }}>
        <div className="card" style={{ padding: '14px 18px', background: 'var(--mist)' }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Strongest siting posture</div>
          {top5.map(s => (
            <div key={s.code} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 13.5 }}>
              <a href={'#/factsheets/' + s.code} style={{ fontWeight: 650, color: 'inherit' }}>{'#' + (s.overall.rank + 1) + ' ' + s.name}</a>
              <span className="score-serif" style={{ color: gradeColor(s.overall.g) }}>{s.overall.g}</span>
            </div>
          ))}
        </div>
        <div className="card" style={{ padding: '14px 18px', background: 'var(--sand)' }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Most constrained</div>
          {bottom5.map(s => (
            <div key={s.code} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 13.5 }}>
              <a href={'#/factsheets/' + s.code} style={{ fontWeight: 650, color: 'inherit' }}>{'#' + (s.overall.rank + 1) + ' ' + s.name}</a>
              <span className="score-serif" style={{ color: gradeColor(s.overall.g) }}>{s.overall.g}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ overflow: 'auto' }}>
        <table className="mtable" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              {th('name', 'State')}
              {th('overall', 'Overall')}
              {data.cats.map(c => th(c, c))}
            </tr>
          </thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.code}>
                <td style={{ fontWeight: 650, whiteSpace: 'nowrap' }}>
                  <a href={'#/factsheets/' + s.code} style={{ color: 'inherit' }}>{s.name}</a>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <span className="score-serif" style={{ fontSize: 15, color: gradeColor(s.overall.g) }}>{s.overall.g}</span>
                  <span className="microcopy" style={{ marginLeft: 6 }}>{'#' + (s.overall.rank + 1)}</span>
                </td>
                {s.cats.map(c => (
                  <td key={c.k} style={{ whiteSpace: 'nowrap' }}>
                    <span className="score-serif" style={{ color: gradeColor(c.g) }}>{c.g}</span>
                    <span className="microcopy" style={{ marginLeft: 6 }}>{'#' + (c.rank + 1)}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="microcopy" style={{ marginTop: 10 }}>
        Grades use equal category weighting over the same 22 normalized indicators shown on every fact sheet. Methodology is public; scores are identical for every party. Quote freely with attribution.
      </p>
    </div>
  );
}

// Main entry point for the whole file / #/factsheets route. Owns the state
// selector, prev/next navigation, permalink copy, print/CSV export, and the
// two methodology panels — then delegates the actual sheet rendering to
// FactSheetDynamic (or hands off entirely to RankingsPage for the leaderboard).
function FactSheetsPage({ which }) {
  const STATE_NAMES = window.STATE_NAMES || {};
  const initCode = which && which.length === 2 && STATE_NAMES[which.toUpperCase()] ? which.toUpperCase() : null;
  const [selectedState, setSelectedState] = React.useState(initCode);
  const [sheetFeats, setSheetFeats] = React.useState([]);
  const [sheetGrades, setSheetGrades] = React.useState(null);
  const [copied, setCopied] = React.useState(false);

  if (which === 'rankings') return <RankingsPage />;

  function handleSelect(st) {
    setSelectedState(st || null);
    setSheetFeats([]);
    setSheetGrades(null);
    setCopied(false);
    location.hash = st ? '#/factsheets/' + st : '#/factsheets';
  }

  const stateCodes = Object.keys(STATE_NAMES).sort();
  const stateIdx = selectedState ? stateCodes.indexOf(selectedState) : -1;
  const prevState = stateIdx > 0 ? stateCodes[stateIdx - 1] : null;
  const nextState = stateIdx >= 0 && stateIdx < stateCodes.length - 1 ? stateCodes[stateIdx + 1] : null;

  const copyPermalink = () => {
    const url = location.origin + location.pathname + '#/factsheets/' + selectedState;
    try {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } catch (e) {}
  };

  const exportStateCsv = () => {
    if (!sheetGrades) return;
    const lines = [
      ['category', 'grade', 'rank', 'of_n_states'].join(','),
      ['Overall', sheetGrades.stateGrade, sheetGrades.overallRank + 1, sheetGrades.grades[0] ? sheetGrades.grades[0].n : 48].map(_csvCell).join(','),
      ...sheetGrades.grades.map(g => [g.k, g.g, g.rank + 1, g.n].map(_csvCell).join(','))
    ];
    _downloadCsv('merascope_' + selectedState + '_grades.csv', lines);
  };

  const stateName = selectedState ? (STATE_NAMES[selectedState] || selectedState) : null;

  return (
    <div data-screen-label={stateName ? 'Fact sheet — ' + stateName : 'Fact sheets'}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '30px 24px 0' }}>
        <PageHead eyebrow="Fact sheets — print-grade, version-stamped"
          title={stateName ? stateName + ' — data center siting posture' : 'State fact sheets'}
          sub="15-indicator profile, national rankings, physical measurements. Select a state to load its fact sheet."
          right={selectedState
            ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost btn-sm" onClick={copyPermalink}>{copied ? 'Copied!' : 'Copy link'}</button>
                {sheetGrades && <button className="btn btn-ghost btn-sm" onClick={exportStateCsv}>Download CSV</button>}
                <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>Print / Save as PDF</button>
              </div>
            )
            : <a className="btn btn-ghost btn-sm" href="#/factsheets/rankings">All-state rankings</a>} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          {selectedState && (
            <button className="btn btn-quiet btn-sm" disabled={!prevState}
              onClick={() => prevState && handleSelect(prevState)}
              title={prevState ? STATE_NAMES[prevState] : ''}>← {prevState || ''}</button>
          )}
          <StateSelector selectedState={selectedState} onChange={handleSelect} />
          {selectedState && (
            <button className="btn btn-quiet btn-sm" disabled={!nextState}
              onClick={() => nextState && handleSelect(nextState)}
              title={nextState ? STATE_NAMES[nextState] : ''}>{nextState || ''} →</button>
          )}
          <a href="#/factsheets/rankings" style={{ fontSize: 13, fontWeight: 650 }}>All-state rankings →</a>
          {selectedState && (
            <span className="microcopy">Loading ranks all 48 states — takes a few seconds on first open.</span>
          )}
        </div>
        <GradeMethodologyPanel />
        <DataSourcesPanel />
      </div>
      {selectedState ? (
        <div className="sheet-wrap" style={{ marginTop: 0 }}>
          <FactSheetDynamic stateCode={selectedState} onRawFeats={setSheetFeats} onGradeData={setSheetGrades} />
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

// Exposed on window for app.jsx's router (no module/import system in this build).
Object.assign(window, { FactSheetsPage, RankingsPage });
