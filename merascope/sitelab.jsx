/* ── Site Lab: gamified placement screening (Builder, paid) ── */

const SL_PRESETS = [
  { name: 'Edge', mw: 50, n: 1, desc: '1×1 cell · ~50 MW' },
  { name: 'Campus', mw: 200, n: 2, desc: '2×2 cells · ~200 MW' },
  { name: 'Hyperscale', mw: 1000, n: 3, desc: '3×3 cells · ~1 GW' }
];

const SL_IDX = {};
window.MERA.GRID.cells.forEach(c => { SL_IDX[c.r + '-' + c.c] = c; });

function slCells(r0, c0, n) {
  const out = [];
  for (let dr = 0; dr < n; dr++) for (let dc = 0; dc < n; dc++) {
    const cell = SL_IDX[(r0 + dr) + '-' + (c0 + dc)];
    if (!cell || cell.gate) return null;
    out.push(cell);
  }
  return out;
}
function slScore(cells, w) {
  const M = window.MERA;
  return cells.reduce((s, c) => s + M.composite(c.ind, w), 0) / cells.length;
}
function slCompass(dr, dc) {
  const dirs = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];
  const ang = Math.atan2(-dr, dc);
  return dirs[Math.round(((ang + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
}
function slSuggest(placed, n, w, baseScore) {
  const out = [];
  for (let dr = -8; dr <= 8; dr++) for (let dc = -8; dc <= 8; dc++) {
    if (dr === 0 && dc === 0) continue;
    const r0 = placed.r0 + dr, c0 = placed.c0 + dc;
    const cells = slCells(r0, c0, n);
    if (!cells) continue;
    const s = slScore(cells, w);
    if (s > baseScore + 0.03) out.push({ r0, c0, s, dir: slCompass(dr, dc), km: Math.round(Math.hypot(dc * 11.4, dr * 16.7)) });
  }
  out.sort((a, b) => b.s - a.s);
  const picked = [];
  for (const cand of out) {
    if (picked.every(p => Math.max(Math.abs(p.r0 - cand.r0), Math.abs(p.c0 - cand.c0)) >= n + 1)) picked.push(cand);
    if (picked.length === 3) break;
  }
  return picked;
}

function SiteLabPage() {
  const M = window.MERA;
  const { ramp } = React.useContext(MeraCtx);
  const { cells, cols, rows } = M.GRID;
  const W = cols * CELL_PX, H = rows * CELL_PX;
  const weights = M.DEFAULT_WEIGHTS;
  const [preset, setPreset] = React.useState(SL_PRESETS[1]);
  const [placed, setPlaced] = React.useState(null);   /* {r0,c0} */
  const [hover, setHover] = React.useState(null);     /* {r0,c0,valid,score,px,py} */
  const [toast, setToast] = React.useState(null);
  const wrapRef = React.useRef(null);
  const n = preset.n;

  const rects = React.useMemo(() => cells.map(cell => {
    const fill = cell.gate ? 'var(--gate)' : M.rampColor(M.composite(cell.ind, weights), ramp);
    return <rect key={cell.id} x={cell.c * CELL_PX + 0.75} y={cell.r * CELL_PX + 0.75} width={CELL_PX - 1.5} height={CELL_PX - 1.5} rx="2" fill={fill} />;
  }), [ramp]);

  function anchor(r, c) {
    let r0 = r - Math.floor(n / 2), c0 = c - Math.floor(n / 2);
    r0 = Math.max(0, Math.min(rows - n, r0)); c0 = Math.max(0, Math.min(cols - n, c0));
    return { r0, c0 };
  }
  function handleMove(e) {
    const box = e.currentTarget.getBoundingClientRect();
    const sx = (e.clientX - box.left) / box.width * W, sy = (e.clientY - box.top) / box.height * H;
    const { r0, c0 } = anchor(Math.floor(sy / CELL_PX), Math.floor(sx / CELL_PX));
    const fc = slCells(r0, c0, n);
    const wb = wrapRef.current.getBoundingClientRect();
    setHover({ r0, c0, valid: !!fc, score: fc ? slScore(fc, weights) : null, px: e.clientX - wb.left, py: e.clientY - wb.top });
  }
  function handleClick() {
    if (hover && hover.valid) setPlaced({ r0: hover.r0, c0: hover.c0 });
  }

  const placedCells = placed ? slCells(placed.r0, placed.c0, n) : null;
  const placedScore = placedCells ? slScore(placedCells, weights) : null;
  const suggestions = React.useMemo(() => (placed && placedCells) ? slSuggest(placed, n, weights, placedScore) : [], [placed, n]);
  const avgInd = placedCells ? M.INDICATORS.map(m => ({ k: m.k, label: m.label, v: placedCells.reduce((s, c) => s + c.ind[m.k], 0) / placedCells.length })) : null;
  const verdict = placedScore == null ? null : placedScore >= 0.75 ? ['Build', 'lo'] : placedScore >= 0.55 ? ['Negotiate', 'med'] : ['Walk away', 'hi'];

  function moveTo(sug) { setPlaced({ r0: sug.r0, c0: sug.c0 }); }
  function addWatch() {
    const cell = placedCells[0];
    setToast(`Added ${preset.name} @ ${cell.lat.toFixed(2)}N / ${Math.abs(cell.lon).toFixed(2)}W to watchlist`);
    setTimeout(() => setToast(null), 2600);
  }

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Builder — Site Lab">
      <BuilderSubNav active="sitelab" />
      <PageHead eyebrow="Site Lab" title="Drop a campus. See what the land says."
        sub="Pick a footprint, place it on any viable ground, and the engine scores it instantly — then finds better ground within sight line. Same public engine; the game is finding where it says yes."
        right={<PromiseBadge />} />
      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* map */}
        <div className="card" style={{ flex: '1 1 640px', minWidth: 0, padding: 14, position: 'relative' }} ref={wrapRef}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', cursor: 'crosshair' }}
            onMouseMove={handleMove} onMouseLeave={() => setHover(null)} onClick={handleClick}
            role="img" aria-label="Site Lab placement map">
            {rects}
            {suggestions.map((s, i) => (
              <g key={i}>
                <rect className="sl-suggest" x={s.c0 * CELL_PX} y={s.r0 * CELL_PX} width={n * CELL_PX} height={n * CELL_PX} rx="3" fill="none" stroke="var(--cyan)" strokeWidth="2.6" style={{ cursor: 'pointer' }} onClick={ev => { ev.stopPropagation(); moveTo(s); }} />
                <circle cx={s.c0 * CELL_PX} cy={s.r0 * CELL_PX} r="8" fill="var(--cyan)" />
                <text x={s.c0 * CELL_PX} y={s.r0 * CELL_PX + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">{i + 1}</text>
              </g>
            ))}
            {placed && (
              <rect x={placed.c0 * CELL_PX} y={placed.r0 * CELL_PX} width={n * CELL_PX} height={n * CELL_PX} rx="3"
                fill="rgba(31,92,77,.34)" stroke="var(--evergreen)" strokeWidth="3" style={{ transition: 'x .25s ease, y .25s ease' }} />
            )}
            {hover && (
              <rect x={hover.c0 * CELL_PX} y={hover.r0 * CELL_PX} width={n * CELL_PX} height={n * CELL_PX} rx="3"
                fill={hover.valid ? 'rgba(180,95,29,.22)' : 'rgba(192,57,43,.25)'}
                stroke={hover.valid ? 'var(--basalt)' : '#C0392B'} strokeWidth="2" strokeDasharray={hover.valid ? 'none' : '5 3'} pointerEvents="none" />
            )}
          </svg>
          {hover && (
            <div style={{ position: 'absolute', left: Math.min(hover.px + 16, (wrapRef.current ? wrapRef.current.clientWidth - 130 : 600)), top: hover.py - 14, background: 'var(--mist)', border: '1px solid var(--line)', borderRadius: 8, boxShadow: '0 4px 14px rgba(0,0,0,.4)', padding: '5px 11px', pointerEvents: 'none', zIndex: 30 }}>
              {hover.valid
                ? <span className="score-serif" style={{ fontSize: 17, color: M.rampColor(hover.score, ramp) }}>{hover.score.toFixed(3)}</span>
                : <span style={{ fontSize: 12.5, fontWeight: 650, color: '#C0392B' }}>gated / off-map</span>}
              <span className="microcopy" style={{ marginLeft: 7 }}>{hover.valid ? 'click to place' : 'try elsewhere'}</span>
            </div>
          )}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <MapLegend showMarkers={false} />
            <span className="microcopy">Cyan squares = better ground within sight line · click one to relocate</span>
          </div>
          {toast && (
            <div style={{ position: 'absolute', bottom: 56, left: '50%', transform: 'translateX(-50%)', background: 'var(--ink)', color: '#fff', fontSize: 13, borderRadius: 8, padding: '8px 16px', zIndex: 40 }}>{toast}</div>
          )}
        </div>

        {/* control rail */}
        <div style={{ width: 318, flexShrink: 0, display: 'grid', gap: 12 }}>
          <div className="card" style={{ padding: '14px 16px' }}>
            <b style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--slate)' }}>Footprint</b>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7, marginTop: 9 }}>
              {SL_PRESETS.map(p => (
                <button key={p.name} onClick={() => { setPreset(p); setPlaced(null); }}
                  style={{ border: '1.5px solid ' + (preset.name === p.name ? 'var(--basalt)' : 'var(--line)'), background: preset.name === p.name ? 'var(--sand)' : 'var(--mist)', borderRadius: 8, padding: '9px 6px', textAlign: 'center' }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 13 }}>{p.name}</span>
                  <span className="microcopy" style={{ fontSize: 10.5 }}>{p.desc}</span>
                </button>
              ))}
            </div>
          </div>
          {!placed ? (
            <div className="panel" style={{ padding: '18px 18px', textAlign: 'center' }}>
              <Glyph size={30} />
              <h4 style={{ marginTop: 8, fontSize: 15 }}>Click any viable cell to drop it.</h4>
              <p className="microcopy" style={{ margin: '6px 0 0' }}>Dark cells are hard-gated — no footprint can land there, at any weight.</p>
            </div>
          ) : (
            <React.Fragment>
              <div className="card" style={{ padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <ScoreNum value={placedScore} style={{ fontSize: 40, color: M.rampColor(placedScore, ramp) }} />
                  {verdict && <Chip tone={verdict[1]} style={{ fontSize: 13.5 }}>{verdict[0]}</Chip>}
                </div>
                <div className="microcopy" style={{ marginBottom: 10 }}>composite · {preset.mw.toLocaleString()} MW {preset.name.toLowerCase()} · public default weights</div>
                <div style={{ display: 'grid', gap: 4 }}>
                  {avgInd.map(a => <BarRow key={a.k} label={a.label} value={a.v} width={150} />)}
                </div>
                <div className="kv" style={{ marginTop: 10 }}><span>Est. closed-loop water</span><b><span className="score-serif">{(preset.mw * 0.105).toFixed(1)}</span> M gal/yr</b></div>
                <div className="kv" style={{ borderBottom: 'none' }}><span>Footprint</span><b><span className="score-serif">{n}×{n}</span> cells · ~<span className="score-serif">{(n * n * 190).toLocaleString()}</span> km²</b></div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn btn-primary btn-sm" onClick={addWatch}>Add to watchlist</button>
                  <button className="btn btn-quiet btn-sm" onClick={() => setPlaced(null)}>Clear</button>
                </div>
              </div>
              <div className="panel" style={{ padding: '14px 16px' }}>
                <b style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--slate)' }}>Better ground within sight line</b>
                {suggestions.length === 0 ? (
                  <p style={{ fontSize: 13.5, margin: '8px 0 0' }}>None found — this is already the best placement in range. <span className="microcopy">The engine has nothing to add.</span></p>
                ) : (
                  <div style={{ display: 'grid', gap: 8, marginTop: 9 }}>
                    {suggestions.map((s, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--sand)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 11px' }}>
                        <span style={{ width: 19, height: 19, borderRadius: '50%', background: 'var(--cyan)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                        <span style={{ fontSize: 13 }}><span className="score-serif" style={{ fontWeight: 700 }}>{s.s.toFixed(3)}</span> <span style={{ color: 'var(--lo-tx)', fontWeight: 650 }}>(+{(s.s - placedScore).toFixed(2)})</span> · {s.km} km {s.dir}</span>
                        <button className="btn btn-ghost btn-xs" style={{ marginLeft: 'auto' }} onClick={() => moveTo(s)}>Move here</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </React.Fragment>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SiteLabPage });
