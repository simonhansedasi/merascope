/* ── Merascope map engine: WA choropleth + weight sliders ── */

const CELL_PX = 15;

function normalizeWeights(w, k, val) {
  const M = window.MERA;
  const keys = M.INDICATORS.map(m => m.k);
  val = Math.max(0, Math.min(100, val));
  const others = keys.filter(x => x !== k);
  const sumO = others.reduce((s, x) => s + w[x], 0);
  const nw = { ...w, [k]: val };
  const rem = 100 - val;
  if (sumO <= 0.0001) others.forEach(x => { nw[x] = rem / others.length; });
  else others.forEach(x => { nw[x] = w[x] * rem / sumO; });
  return nw;
}

/* ── the WA suitability map ── */
function WAMap({ weights, stateData = null, interactive = true, markers = true, recommended = true, pins = null, onPinClick = null, dimmed = false, highlight = null, style }) {
  const M = window.MERA;
  const { ramp } = React.useContext(MeraCtx);
  const S = stateData || { GRID: M.GRID, CLUSTERS: M.CLUSTERS, RECOMMENDED: M.RECOMMENDED, isWA: true, key: 'WA' };
  const { cells, cols, rows, lonMin, latMax, D } = S.GRID;
  const W = cols * CELL_PX, H = rows * CELL_PX;
  const [hover, setHover] = React.useState(null);
  const wrapRef = React.useRef(null);

  const X = lon => (lon - lonMin) / D * CELL_PX;
  const Y = lat => (latMax - lat) / D * CELL_PX;

  const rects = React.useMemo(() => cells.map(cell => {
    const fill = cell.gate ? 'var(--gate)' : M.rampColor(M.composite(cell.ind, weights), ramp);
    return <rect key={cell.id} x={cell.c * CELL_PX + 0.75} y={cell.r * CELL_PX + 0.75} width={CELL_PX - 1.5} height={CELL_PX - 1.5} rx="2" fill={fill} style={{ transition: 'fill .3s ease' }} />;
  }), [weights, ramp, S.key]);

  const gateGlyphs = React.useMemo(() => cells.filter(c => c.gate).map(cell => (
    <g key={'g' + cell.id} transform={`translate(${cell.c * CELL_PX + CELL_PX / 2},${cell.r * CELL_PX + CELL_PX / 2})`} opacity="0.55">
      {cell.gate === 'terrain'
        ? <path d="M-3.5 2.5 L0 -3 L3.5 2.5 Z" fill="none" stroke="#999" strokeWidth="1" />
        : <path d="M0 -3.2 L3 -1.8 V0.6 C3 2.4 1.6 3.4 0 3.8 C-1.6 3.4 -3 2.4 -3 0.6 V-1.8 Z" fill="none" stroke="#999" strokeWidth="1" />}
    </g>
  )), [S.key]);

  function handleMove(e) {
    if (!interactive) return;
    const svg = e.currentTarget;
    const box = svg.getBoundingClientRect();
    const sx = (e.clientX - box.left) / box.width * W;
    const sy = (e.clientY - box.top) / box.height * H;
    const c = Math.floor(sx / CELL_PX), r = Math.floor(sy / CELL_PX);
    const cell = cells.find(x => x.r === r && x.c === c);
    if (!cell) { setHover(null); return; }
    const wb = wrapRef.current.getBoundingClientRect();
    setHover({ cell, px: e.clientX - wb.left, py: e.clientY - wb.top });
  }

  const tooltip = hover && (() => {
    const cell = hover.cell;
    const score = M.composite(cell.ind, weights);
    const cl = cell.cluster ? { name: cell.cluster } : (S.isWA ? M.nearestCluster(cell.lat, cell.lon) : null);
    const flipX = hover.px > (wrapRef.current ? wrapRef.current.clientWidth - 260 : 600);
    const flipY = hover.py > (wrapRef.current ? wrapRef.current.clientHeight - 260 : 300);
    return (
      <div style={{ position: 'absolute', left: flipX ? hover.px - 252 : hover.px + 14, top: flipY ? hover.py - 248 : hover.py + 12, width: 238, background: '#fff', border: '1px solid var(--line)', borderRadius: 10, boxShadow: '0 8px 24px rgba(26,26,26,.18)', padding: '11px 13px', zIndex: 40, pointerEvents: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
          <span className="microcopy">{Math.abs(cell.lat).toFixed(2)}N / {Math.abs(cell.lon).toFixed(2)}W</span>
          {cl && <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--basalt)' }}>{cl.name}</span>}
        </div>
        {cell.gate ? (
          <div>
            <div className="score-serif" style={{ fontSize: 26, color: 'var(--gate)' }}>gated</div>
            <div style={{ fontSize: 12.5, color: 'var(--slate)' }}>{cell.gate === 'terrain' ? 'Hard gate: terrain — less than 3% of cell is flat.' : 'Hard gate: protected or sovereign land exceeds 25% of cell.'} Gates apply regardless of weights.</div>
          </div>
        ) : (
          <div>
            <div className="score-serif" style={{ fontSize: 30, lineHeight: 1.1, color: M.rampColor(score, ramp) === 'rgb(241,196,15)' ? 'var(--ink)' : M.rampColor(score, ramp) }}>{score.toFixed(3)}</div>
            <div className="microcopy" style={{ marginBottom: 6 }}>composite suitability</div>
            <div style={{ display: 'grid', gap: 3 }}>
              {M.INDICATORS.map(m => <BarRow key={m.k} label={m.label.replace(' proximity', '').replace(' availability', '').replace(' opportunity', '').replace(' sensitivity', '').replace(' distance', '').replace(' safety', ' safety')} value={cell.ind[m.k]} width={92} />)}
            </div>
          </div>
        )}
      </div>
    );
  })();

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...style }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', opacity: dimmed ? 0.85 : 1 }} onMouseMove={handleMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Washington State suitability map">
        {rects}
        {gateGlyphs}
        {highlight && S.isWA && (() => { const cell = M.cellAt(highlight.lat, highlight.lon); return cell ? <rect x={cell.c * CELL_PX - 1} y={cell.r * CELL_PX - 1} width={CELL_PX + 2} height={CELL_PX + 2} rx="3" fill="none" stroke="var(--basalt)" strokeWidth="2.5" /> : null; })()}
        {markers && S.CLUSTERS.map(cl => (
          <g key={cl.name} transform={`translate(${X(cl.lon)},${Y(cl.lat)})`}>
            <rect x="-4.2" y="-4.2" width="8.4" height="8.4" transform="rotate(45)" fill={cl.status === 'existing' ? '#fff' : 'none'} stroke={cl.status === 'existing' ? '#1A1A1A' : '#fff'} strokeWidth="1.8" />
          </g>
        ))}
        {markers && recommended && S.RECOMMENDED.map(rc => (
          <circle key={rc.label} cx={X(rc.lon)} cy={Y(rc.lat)} r="8.5" fill="none" stroke="var(--cyan)" strokeWidth="2.4" />
        ))}
        {pins && pins.map(site => (
          <g key={site.id} transform={`translate(${X(site.lon)},${Y(site.lat)})`} style={{ cursor: 'pointer' }} onClick={() => onPinClick && onPinClick(site)}>
            <line x1="0" y1="0" x2="0" y2="-10" stroke="var(--ink)" strokeWidth="1.6" />
            <circle cx="0" cy="-14" r="7.5" fill={M.rampColor(site.composite, ramp)} stroke="#fff" strokeWidth="2" />
            <circle cx="0" cy="-14" r="2.4" fill="#fff" />
          </g>
        ))}
      </svg>
      {tooltip}
    </div>
  );
}

/* ── legend ── */
function MapLegend({ showMarkers = true }) {
  const M = window.MERA;
  const { ramp } = React.useContext(MeraCtx);
  const grad = `linear-gradient(to right, ${M.RAMPS[ramp].join(',')})`;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center', fontSize: 12, color: 'var(--slate)' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
        <span className="score-serif">0.0</span>
        <span style={{ width: 110, height: 9, borderRadius: 5, background: grad, display: 'inline-block' }}></span>
        <span className="score-serif">1.0</span>
        <span>suitability</span>
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 13, height: 13, borderRadius: 3, background: 'var(--gate)', display: 'inline-block' }}></span> hard-gated
        <svg width="11" height="11" viewBox="0 0 10 10"><path d="M1 8.5 L5 1.5 L9 8.5 Z" fill="none" stroke="#666" strokeWidth="1.2" /></svg> terrain ·
        <svg width="11" height="11" viewBox="0 0 10 10"><path d="M5 0.8 L8.6 2.4 V5 C8.6 7.2 6.9 8.5 5 9.2 C3.1 8.5 1.4 7.2 1.4 5 V2.4 Z" fill="none" stroke="#666" strokeWidth="1.2" /></svg> protected
      </span>
      {showMarkers && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><svg width="12" height="12" viewBox="0 0 12 12"><rect x="2.4" y="2.4" width="7.2" height="7.2" transform="rotate(45 6 6)" fill="#fff" stroke="#1A1A1A" strokeWidth="1.4" /></svg> existing</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><svg width="12" height="12" viewBox="0 0 12 12"><rect x="2.4" y="2.4" width="7.2" height="7.2" transform="rotate(45 6 6)" fill="none" stroke="#888" strokeWidth="1.4" /></svg> proposed</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.4" fill="none" stroke="var(--cyan)" strokeWidth="1.8" /></svg> recommended ≥ 0.75</span>
        </span>
      )}
    </div>
  );
}

/* ── weight slider panel — the signature interaction ── */
function WeightPanel({ weights, setWeights, dock = false }) {
  const M = window.MERA;
  const [collapsed, setCollapsed] = React.useState(false);
  const [shareUrl, setShareUrl] = React.useState(null);
  const isDefault = M.INDICATORS.every(m => Math.abs(weights[m.k] - m.def) < 0.5);

  function share() {
    const q = M.INDICATORS.map(m => Math.round(weights[m.k])).join(',');
    const url = location.origin + location.pathname + '#/explorer?w=' + q;
    setShareUrl(url);
    try { navigator.clipboard.writeText(url); } catch (e) { /* iframe clipboard may be blocked */ }
  }

  return (
    <div className={dock ? 'weight-dock' : ''} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, width: dock ? undefined : 318, flexShrink: 0, overflow: 'hidden' }}>
      <button onClick={() => setCollapsed(!collapsed)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--mist)', border: 'none', borderBottom: collapsed ? 'none' : '1px solid var(--line-soft)', padding: '11px 15px', fontSize: 13.5, fontWeight: 700, color: 'var(--evergreen)' }}>
        <span style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}><Icon name="plumb" color="var(--evergreen)" /> Weight the indicators</span>
        <span style={{ color: 'var(--slate)', fontWeight: 400 }}>{collapsed ? '▴' : '▾'}</span>
      </button>
      {!collapsed && (
        <div style={{ padding: '12px 15px 14px' }}>
          <p className="microcopy" style={{ margin: '0 0 8px' }}>Nine indicators, auto-normalized to 100%. The map recolors as you drag — same math for every user.</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 11 }}>
            {[['Default', null],
              ['Builder lens', { transmission: 50, water: 20, community: 10, seismic: 5, flood: 5, contamination: 5, flatness: 5 }],
              ['Steward lens', { water: 40, community: 25, waterway: 15, contamination: 10, transmission: 10 }],
              ['Net benefit', { geothermal: 25, water: 25, transmission: 20, community: 15, flatness: 15 }]].map(([name, o]) => (
              <button key={name} className="btn btn-quiet btn-xs" onClick={() => {
                if (!o) { setWeights({ ...M.DEFAULT_WEIGHTS }); return; }
                const w = {}; M.INDICATORS.forEach(m => { w[m.k] = o[m.k] || 0; });
                setWeights(w);
              }}>{name}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 9 }}>
            {M.INDICATORS.map(m => (
              <div key={m.k}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 2 }}>
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: 'var(--ink)', fontWeight: 600 }}><Icon name={m.icon} color="var(--slate)" size={13} /> {m.label}</span>
                  <span className="score-serif" style={{ color: weights[m.k] > 0.5 ? 'var(--basalt)' : 'var(--slate)', fontWeight: 600 }}>{Math.round(weights[m.k])}%</span>
                </div>
                <input className="mslider" type="range" min="0" max="100" step="1" value={Math.round(weights[m.k])} aria-label={m.label}
                  onChange={e => setWeights(normalizeWeights(weights, m.k, +e.target.value))} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 13, background: 'var(--sand)', borderRadius: 8, padding: '9px 11px', fontSize: 12.5, color: 'var(--ink)' }}>
            <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
              <span style={{ marginTop: 1 }}><Icon name="lock" color="var(--slate)" /></span>
              <div>
                <b style={{ fontWeight: 700 }}>Hard gates are not sliders.</b><br />
                Terrain gate: <span className="score-serif">61</span> cells excluded. Protected-land gate: <span className="score-serif">82</span> cells excluded. Gates apply regardless of weights.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <button className="btn btn-quiet btn-xs" disabled={isDefault} style={{ opacity: isDefault ? 0.45 : 1 }} onClick={() => { setWeights({ ...M.DEFAULT_WEIGHTS }); setShareUrl(null); }}>Reset to defaults</button>
            <button className="btn btn-ghost btn-xs" onClick={share}>Share these weights</button>
          </div>
          {shareUrl && (
            <div style={{ marginTop: 8 }}>
              <input readOnly value={shareUrl} onFocus={e => e.target.select()} style={{ width: '100%', fontSize: 11.5, padding: '5px 8px', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--slate)', fontFamily: 'monospace' }} />
              <span className="microcopy">Copied to clipboard — anyone opening this link sees your weights.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── mini terrain thumbnail for site cards ── */
function SiteThumb({ site, w = 116, h = 80 }) {
  const M = window.MERA;
  const n = 8, m = 6, cw = w / n, ch = h / m;
  const tiles = [];
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
    const v = M.fbm(site.lon * 3 + i * 0.55, site.lat * 3 + j * 0.55);
    const g = Math.round(214 - v * 52);
    tiles.push(<rect key={i + '-' + j} x={i * cw} y={j * ch} width={cw + 0.5} height={ch + 0.5} fill={`rgb(${g - 8},${g},${g - 18})`} />);
  }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ borderRadius: 7, display: 'block', flexShrink: 0 }} aria-hidden="true">
      {tiles}
      <polygon points={`${w * 0.28},${h * 0.3} ${w * 0.72},${h * 0.22} ${w * 0.8},${h * 0.68} ${w * 0.38},${h * 0.78}`} fill="rgba(180,95,29,0.14)" stroke="var(--basalt)" strokeWidth="1.6" strokeDasharray="4 2.5" />
      <circle cx={w * 0.54} cy={h * 0.5} r="3.2" fill="var(--basalt)" stroke="#fff" strokeWidth="1.2" />
    </svg>
  );
}

Object.assign(window, { WAMap, MapLegend, WeightPanel, SiteThumb, normalizeWeights, CELL_PX });
