/* -- Surface B: Builder workspace -- saved cells + comparison */

function BuilderSubNav({ active }) {
  const tabs = [['search', 'Workspace', '#/builder'], ['status', 'Status', '#/builder/status'], ['portfolio', 'Portfolio screening', '#/builder/portfolio'], ['mycase', 'My Application', '#/builder/case/']];
  return (
    <div className="tabs" style={{ marginBottom: 18 }}>
      {tabs.map(([k, label, href]) => (
        <button key={k} className={active === k ? 'on' : ''} onClick={() => { location.hash = href; }}>{label}</button>
      ))}
    </div>
  );
}

/* kept for SiteProfile comparables + legacy refs */
function SiteCard({ site, onOpen, watched, onWatch, selected }) {
  return (
    <div className="card" style={{ padding: 14, borderColor: selected ? 'var(--basalt)' : undefined, boxShadow: selected ? '0 2px 10px rgba(180,95,29,.18)' : undefined }} data-comment-anchor={'site-' + site.id}>
      <div style={{ display: 'flex', gap: 13 }}>
        <SiteThumb site={site} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15.5, lineHeight: 1.25 }}>{site.title}</div>
              <div className="microcopy">{site.cell} · {site.county} County</div>
            </div>
            <ScoreBadge value={site.composite} size={17} decimals={2} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 13px', marginTop: 7, fontSize: 12.5, color: 'var(--slate)' }}>
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Icon name="parcel" size={12} /> <span className="score-serif">{site.acres}</span>&nbsp;buildable acres</span>
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Icon name="pylon" size={12} /> <span className="score-serif">{site.kvDist}</span>&nbsp;km to {site.kv} kV</span>
            <span>ZCTA {site.zcta}</span>
            <span>pop <span className="score-serif">{site.pop.toLocaleString()}</span></span>
            <span><span className="score-serif">{site.parcels}</span> qualifying parcels</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 9, marginTop: 11 }}>
        {Object.entries(site.bars).map(([k, v]) => (
          <div key={k}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--slate)', marginBottom: 2 }}>
              <span>{k}</span><span className="score-serif">{v.toFixed(2)}</span>
            </div>
            <MiniRampBar v={v} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 11 }}>
        {site.flags.map(f => <Chip key={f.t} tone={f.tone}>{f.t}</Chip>)}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn btn-primary btn-sm" onClick={() => onOpen(site)}>Open full profile</button>
        <button className="btn btn-quiet btn-sm" onClick={() => onWatch(site.id)}>{watched ? '★ Watching' : 'Add to watchlist'}</button>
        <button className="btn btn-quiet btn-sm">Generate dossier ($)</button>
      </div>
    </div>
  );
}

function MiniRampBar({ v }) {
  const M = window.MERA;
  const { ramp } = React.useContext(MeraCtx);
  return <div className="mb-track"><div className="mb-fill" style={{ width: (v * 100) + '%', background: M.rampColor(v, ramp) }}></div></div>;
}

/* -- indicator spec for comparison table -- */
var COMP_INDS = [
  { k: 'Transmission',       base: 'tx_score',            raw: 'tx_dist_m',        rUnit: 'km',    rFmt: function(v){ return (v/1000).toFixed(1); } },
  { k: 'Water availability', base: 'water_score',         raw: 'ann_precip_mm',    rUnit: 'mm',    rFmt: function(v){ return Math.round(v) + ''; } },
  { k: 'Community burden',   base: 'ej_score',            raw: null },
  { k: 'Pop. exposure',      base: 'pop_exposure_score',  raw: 'pop_density',      rUnit: '/km2',  rFmt: function(v){ return v.toFixed(1); } },
  { k: 'Seismic safety',     base: 'seismic_score',       raw: 'seismic_pga_g',    rUnit: 'g',     rFmt: function(v){ return v.toFixed(3); } },
  { k: 'Flood safety',       base: 'flood_score',         raw: null },
  { k: 'Contamination',      base: 'contamination_score', raw: 'tri_dist_m',       rUnit: 'km',    rFmt: function(v){ return (v/1000).toFixed(1); } },
  { k: 'Waterway',           base: 'waterway_score',      raw: 'river_dist_m',     rUnit: 'km',    rFmt: function(v){ return (v/1000).toFixed(1); } },
  { k: 'Geothermal',         base: 'geothermal_score',    raw: 'heatflow_mwm2',    rUnit: 'mW/m2', rFmt: function(v){ return v.toFixed(1); } },
  { k: 'Terrain flatness',   base: 'flatness_score',      raw: 'flat_frac',        rUnit: '%',     rFmt: function(v){ return (v*100).toFixed(0) + ''; } },
  { k: 'Mean slope',         base: 'slope_score',         raw: 'slope_mean_deg',   rUnit: 'deg',   rFmt: function(v){ return v.toFixed(1); } },
  { k: 'Protected land',     base: 'protected_score',     raw: 'protected_frac',   rUnit: '%',     rFmt: function(v){ return (v*100).toFixed(0) + ''; } },
  { k: 'Aquifer depth',      base: 'aquifer_score',       raw: 'aquifer_depth_ft', rUnit: 'ft',    rFmt: function(v){ return Math.round(v) + ''; } },
  { k: 'Soil permeability',  base: 'soil_score',          raw: null },
  { k: 'Soil chemistry',     base: 'soil_profile_score',  raw: null },
  { k: 'Hydraulic K-sat',    base: 'ksat_score',          raw: 'ksat_mean_ums',    rUnit: 'um/s',  rFmt: function(v){ return v.toFixed(2); } },
];

function SavedCellCard({ cell, inCompare, canAdd, onToggle, onRemove }) {
  const M = window.MERA;
  const { ramp } = React.useContext(MeraCtx);
  const p = cell.properties;
  const label = window.cellLabel ? window.cellLabel(p) : (p._state || '');
  const pi = window.propsToInd;
  const natScore  = (pi && M) ? M.composite(pi(p, true),  M.DEFAULT_WEIGHTS) : null;
  const stateScore = (pi && M) ? M.composite(pi(p, false), M.DEFAULT_WEIGHTS) : null;
  const viable = (p.protected_frac || 1) <= 0.25 && (p.flood_score || 0) > 0;
  const coords = cell.lat != null
    ? cell.lat.toFixed(3) + 'N, ' + Math.abs(cell.lon).toFixed(3) + 'W'
    : null;
  const rank = cell.stateRank;

  var [geo, setGeo] = React.useState(function() {
    return cell.lat != null ? (window.getCachedMunicipality ? window.getCachedMunicipality(cell.fid) : null) : null;
  });
  React.useEffect(function() {
    if (geo || cell.lat == null) return;
    window.fetchMunicipality && window.fetchMunicipality(cell.fid, cell.lat, cell.lon).then(function(r) { if (r) setGeo(r); });
  }, [cell.fid]);

  return (
    <div className="card" style={{ padding: '12px 14px', borderColor: inCompare ? 'var(--basalt)' : undefined, boxShadow: inCompare ? '0 0 0 2px var(--basalt)' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
          {geo && geo.display
            ? <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 1 }}>{geo.display}</div>
            : coords && <div className="microcopy" style={{ fontFamily: 'monospace', fontSize: 10 }}>{coords}</div>}
        </div>
        {natScore != null && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <span className="score-badge" style={{ background: M.rampColor(natScore, ramp), color: M.rampText(natScore, ramp), fontSize: 13, padding: '2px 8px', display: 'block' }}>
              {natScore.toFixed(3)}
            </span>
            <div className="microcopy" style={{ marginTop: 2 }}>national</div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px', marginTop: 8, fontSize: 11.5 }}>
        {stateScore != null && (
          <div>
            <div style={{ color: 'var(--slate)', marginBottom: 1 }}>State composite</div>
            <span className="score-serif" style={{ fontSize: 14, color: M.rampColor(stateScore, ramp) }}>{stateScore.toFixed(3)}</span>
          </div>
        )}
        {rank && (
          <div>
            <div style={{ color: 'var(--slate)', marginBottom: 1 }}>State rank</div>
            <span className="score-serif" style={{ fontSize: 14 }}>#{rank.rank}</span>
            <span style={{ color: 'var(--slate)' }}> of {rank.total}</span>
            <span style={{ fontSize: 10, marginLeft: 4, color: 'var(--slate)' }}>
              (top {Math.max(1, Math.round(rank.rank / rank.total * 100))}%)
            </span>
          </div>
        )}
      </div>

      {geo && geo.county && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--slate)' }}>
          Contact: <span style={{ fontWeight: 600, color: 'inherit' }}>{geo.county}</span>
          {geo.city ? ' — ' + geo.city + ' city hall' : ' Planning Dept.'}
        </div>
      )}

      {!viable && <div style={{ fontSize: 11, color: '#c0392b', marginTop: 5 }}>Hard gate triggered</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button
          className={'btn btn-sm ' + (inCompare ? 'btn-primary' : 'btn-quiet')}
          onClick={onToggle}
          disabled={!inCompare && !canAdd}
          title={(!inCompare && !canAdd) ? 'Max 4 selected' : ''}>
          {inCompare ? 'Comparing' : 'Compare'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onRemove} style={{ marginLeft: 'auto', color: 'var(--slate)' }}>Remove</button>
      </div>
    </div>
  );
}

function ComparisonPanel({ cells }) {
  const M = window.MERA;
  const { ramp } = React.useContext(MeraCtx);
  const pi = window.propsToInd;
  const hasNat = cells[0] && cells[0].properties.tx_score_nat != null;
  const sc = function(base) { return hasNat ? base + '_nat' : base; };
  const n = cells.length;
  const labels = cells.map(function(c) {
    return window.cellLabel ? window.cellLabel(c.properties) : (c.properties._state || '');
  });
  const natComposites = cells.map(function(c) {
    return (pi && M) ? M.composite(pi(c.properties, true), M.DEFAULT_WEIGHTS) : null;
  });
  const stateComposites = cells.map(function(c) {
    return (pi && M) ? M.composite(pi(c.properties, false), M.DEFAULT_WEIGHTS) : null;
  });
  const gates = cells.map(function(c) {
    return {
      terrain:   (c.properties.flat_frac     || 0) >= 0.03,
      protected: (c.properties.protected_frac || 1) <= 0.25,
      flood:     (c.properties.flood_score   || 0) > 0,
    };
  });

  /* municipality state per cell — seed from cache, fetch if missing */
  var [geos, setGeos] = React.useState(function() {
    return cells.map(function(c) {
      return window.getCachedMunicipality ? window.getCachedMunicipality(c.fid) : null;
    });
  });
  React.useEffect(function() {
    cells.forEach(function(c, i) {
      if (geos[i] || c.lat == null) return;
      window.fetchMunicipality && window.fetchMunicipality(c.fid, c.lat, c.lon).then(function(r) {
        if (r) setGeos(function(prev) { var next = prev.slice(); next[i] = r; return next; });
      });
    });
  }, []);

  const colGrid = '160px repeat(' + n + ', 1fr)';

  return (
    <div className="card" style={{ overflow: 'auto' }}>
      {/* column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: colGrid, borderBottom: '2px solid var(--line)', marginBottom: 2 }}>
        <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '.08em', display: 'flex', alignItems: 'flex-end' }}>
          Indicator
        </div>
        {cells.map(function(cell, i) {
          var rank = cell.stateRank;
          var geo = geos[i];
          return (
            <div key={cell.fid} style={{ padding: '10px 14px', textAlign: 'center', borderLeft: '1px solid var(--line-soft)' }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{labels[i]}</div>
              {geo && geo.display
                ? <div style={{ fontSize: 11, color: 'var(--slate)', marginTop: 2 }}>{geo.display}</div>
                : cell.lat != null && <div className="microcopy" style={{ fontFamily: 'monospace', fontSize: 10 }}>{cell.lat.toFixed(3) + 'N, ' + Math.abs(cell.lon).toFixed(3) + 'W'}</div>}
              {geo && geo.county && (
                <div style={{ fontSize: 10, color: 'var(--slate)', marginTop: 1 }}>
                  {geo.city ? geo.city + ' city hall' : geo.county + ' Planning Dept.'}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 10, flexWrap: 'wrap' }}>
                {natComposites[i] != null && (
                  <div>
                    <div className="score-serif" style={{ fontSize: 30, lineHeight: 1, color: M.rampColor(natComposites[i], ramp) }}>
                      {natComposites[i].toFixed(3)}
                    </div>
                    <div className="microcopy">national</div>
                  </div>
                )}
                {stateComposites[i] != null && (
                  <div>
                    <div className="score-serif" style={{ fontSize: 30, lineHeight: 1, color: M.rampColor(stateComposites[i], ramp) }}>
                      {stateComposites[i].toFixed(3)}
                    </div>
                    <div className="microcopy">in-state</div>
                  </div>
                )}
              </div>
              {rank && (
                <div style={{ fontSize: 11, color: 'var(--slate)', marginTop: 4 }}>
                  #{rank.rank} of {rank.total} in state
                  <span style={{ marginLeft: 5, color: 'var(--basalt)', fontWeight: 700 }}>
                    top {Math.max(1, Math.round(rank.rank / rank.total * 100))}%
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                {['protected', 'flood'].map(function(g) {
                  return (
                    <span key={g} style={{ fontSize: 9.5, padding: '2px 6px', borderRadius: 8, fontWeight: 700,
                      background: gates[i][g] ? 'var(--mist)' : '#fde8e8',
                      color: gates[i][g] ? 'var(--evergreen)' : '#c0392b' }}>
                      {gates[i][g] ? 'PASS' : 'GATED'} {g}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* indicator rows */}
      {COMP_INDS.map(function(ind, ri) {
        var scores = cells.map(function(c) { return c.properties[sc(ind.base)]; });
        var raws   = ind.raw ? cells.map(function(c) { return c.properties[ind.raw]; }) : null;
        var valid  = scores.filter(function(v) { return v != null && !isNaN(v); });
        if (!valid.length) return null;
        var best = Math.max.apply(null, valid);
        return (
          <div key={ind.base} style={{
            display: 'grid',
            gridTemplateColumns: colGrid,
            background: ri % 2 === 0 ? 'var(--sand)' : 'transparent',
            borderBottom: '1px solid var(--line-soft)'
          }}>
            <div style={{ padding: '7px 12px', fontSize: 12, color: 'var(--slate)', display: 'flex', alignItems: 'center' }}>{ind.k}</div>
            {cells.map(function(cell, i) {
              var v    = scores[i];
              var rawV = raws ? raws[i] : null;
              if (v == null || isNaN(v)) return (
                <div key={i} style={{ padding: '7px 14px', borderLeft: '1px solid var(--line-soft)', fontSize: 12, color: 'var(--slate)', display: 'flex', alignItems: 'center' }}>n/a</div>
              );
              var isBest   = valid.length > 1 && v === best;
              var barColor = v > 0.6 ? 'var(--evergreen)' : v > 0.35 ? '#b8860b' : '#c0392b';
              return (
                <div key={i} style={{ padding: '7px 14px', borderLeft: '1px solid var(--line-soft)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ flex: 1, height: 5, background: 'var(--mist)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: Math.max(0, Math.min(100, v * 100)) + '%', background: barColor, borderRadius: 3 }} />
                    </div>
                    <span className="score-serif" style={{ fontSize: 12, fontWeight: isBest ? 700 : 400, color: isBest ? 'var(--evergreen)' : 'inherit', minWidth: 30, textAlign: 'right' }}>
                      {v.toFixed(2)}
                    </span>
                    {isBest && <span style={{ fontSize: 9, background: 'var(--evergreen)', color: '#fff', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>best</span>}
                  </div>
                  {rawV != null && ind.rFmt && (
                    <div style={{ fontSize: 10, color: 'var(--slate)' }}>{ind.rFmt(rawV)} <span style={{ opacity: 0.7 }}>{ind.rUnit}</span></div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      <div className="microcopy" style={{ padding: '10px 12px' }}>
        Indicator bars use national-scale scores when available, otherwise state-scale. "best" = highest in this selection per indicator. Default weights: Transmission 40%, Water 35%, Community 25%.
      </div>
    </div>
  );
}

function BuilderSearch() {
  const [savedCells, setSavedCells] = React.useState(function() {
    return window.getSavedCells ? window.getSavedCells() : [];
  });
  const [compareSet, setCompareSet] = React.useState(new Set());

  React.useEffect(function() {
    var refresh = function() { setSavedCells(window.getSavedCells ? window.getSavedCells() : []); };
    window.addEventListener('focus', refresh);
    return function() { window.removeEventListener('focus', refresh); };
  }, []);

  var toggleCompare = function(fid) {
    setCompareSet(function(prev) {
      var next = new Set(prev);
      if (next.has(fid)) { next.delete(fid); } else if (next.size < 4) { next.add(fid); }
      return next;
    });
  };

  var removeCell = function(fid) {
    window.removeSavedCell && window.removeSavedCell(fid);
    setSavedCells(function(c) { return c.filter(function(x) { return x.fid !== fid; }); });
    setCompareSet(function(prev) { var n = new Set(prev); n.delete(fid); return n; });
  };

  var compareCells = savedCells.filter(function(c) { return compareSet.has(c.fid); });

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Builder -- Workspace">
      <BuilderSubNav active="search" />
      {savedCells.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 24px', color: 'var(--slate)' }}>
          <div style={{ fontSize: 52, lineHeight: 1 }}>&#9711;</div>
          <h3 style={{ fontSize: 18, marginTop: 12 }}>No saved sites yet.</h3>
          <p className="microcopy" style={{ maxWidth: 360, margin: '8px auto 20px', fontSize: 13.5, lineHeight: 1.6 }}>
            Open the Explorer, click any fishnet tile to inspect its scores, then hit "Save to workspace."
          </p>
          <a className="btn btn-primary" href="#/explorer">Open the Explorer</a>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          {/* saved cells list */}
          <div style={{ width: 290, flexShrink: 0, display: 'grid', gap: 10, maxHeight: '80vh', overflowY: 'auto', paddingRight: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="microcopy">
                <span className="score-serif">{savedCells.length}</span> saved &middot; select up to 4 to compare
              </div>
              <a className="btn btn-ghost btn-sm"
                href={'/api/export/workspace?session_id=' + (window.MERA_SESSION || '')}
                download="merascope_workspace.csv"
                title="Export workspace to CSV">
                CSV
              </a>
            </div>
            {savedCells.map(function(cell) {
              return (
                <SavedCellCard key={cell.fid} cell={cell}
                  inCompare={compareSet.has(cell.fid)}
                  canAdd={!compareSet.has(cell.fid) && compareSet.size < 4}
                  onToggle={function() { toggleCompare(cell.fid); }}
                  onRemove={function() { removeCell(cell.fid); }} />
              );
            })}
          </div>

          {/* comparison panel */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {compareCells.length < 2 ? (
              <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--slate)', border: '2px dashed var(--line)', borderRadius: 12 }}>
                <div style={{ fontSize: 15 }}>Select 2 or more saved sites on the left to compare them side by side.</div>
                <div className="microcopy" style={{ marginTop: 6 }}>Up to 4 at a time.</div>
              </div>
            ) : (
              <ComparisonPanel cells={compareCells} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BuilderCaseView({ id }) {
  const M = window.MERA;
  const { ramp } = React.useContext(MeraCtx);
  const [caseId, setCaseId] = React.useState(id || '');
  const [searched, setSearched] = React.useState(!!id);
  const [toast, setToast] = React.useState(null);
  const [rebuttal, setRebuttal] = React.useState('');
  const [rebuttalSent, setRebuttalSent] = React.useState(false);
  const [liveConditions, setLiveConditions] = React.useState(null);
  const [liveStage, setLiveStage] = React.useState(null);

  const C = (M.CASE_DETAIL_MAP && M.CASE_DETAIL_MAP[caseId]) || null;

  React.useEffect(() => {
    if (!C) return;
    setLiveConditions(null);
    setLiveStage(null);
    setRebuttalSent(false);
    fetch('/api/case/' + caseId + '/conditions').then(r => r.json()).then(list => {
      setLiveConditions(list.length > 0
        ? list.map(r => Object.assign({}, r, { pendingApproval: !!r.pending_approval }))
        : C.conditions.map(c => Object.assign({}, c, { pendingApproval: !!c.pendingApproval })));
    });
    fetch('/api/case/' + caseId + '/stage').then(r => r.json()).then(s => { if (s) setLiveStage(s); });
    fetch('/api/case/' + caseId + '/rebuttals').then(r => r.json()).then(list => {
      if (list.length > 0) setRebuttalSent(true);
    });
  }, [caseId]);

  const handleSearch = () => {
    setSearched(true);
    if (C) location.hash = '#/builder/case/' + caseId;
  };

  const sendRebuttal = () => {
    if (!rebuttal.trim()) return;
    fetch('/api/case/' + caseId + '/rebuttal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: rebuttal.trim() })
    }).then(r => r.json()).then(() => {
      setRebuttalSent(true);
      setRebuttal('');
      setToast('Rebuttal submitted to lead agency');
    });
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Builder — My Application">
      {toast && <NotifyToast message={toast} onDone={() => setToast(null)} />}
      <BuilderSubNav active="mycase" />

      {!C ? (
        <div style={{ maxWidth: 440 }}>
          <h2 style={{ fontSize: 21, marginBottom: 6 }}>Find your application</h2>
          <p style={{ color: 'var(--slate)', fontSize: 14, marginBottom: 18, lineHeight: 1.6 }}>
            Your lead agency assigned a case ID when your application was received. Enter it below to view your case file.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" value={caseId} placeholder="e.g. 26-0142"
              onChange={e => { setCaseId(e.target.value.trim()); setSearched(false); }}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
              style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'inherit', fontSize: 14, fontFamily: 'inherit' }} />
            <button className="btn btn-primary" onClick={handleSearch}>Look up</button>
          </div>
          {searched && caseId && !C && (
            <p style={{ marginTop: 12, color: '#C0392B', fontSize: 13.5 }}>
              Case {caseId} not found. Contact your lead agency to confirm the ID.
            </p>
          )}
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn btn-quiet btn-sm" onClick={() => { setCaseId(''); setSearched(false); location.hash = '#/builder/case/'; }}>Look up a different case</button>
            <Chip tone="slate">Read-only view</Chip>
          </div>

          <div className="callout" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <Icon name="lock" size={16} color="var(--basalt)" />
            <div style={{ fontSize: 13.5 }}>
              <b>Your application is under active review.</b> You can see all conditions as they are proposed — including those pending lead agency approval. This is your real-time view of the process.
            </div>
          </div>

          <div className="card" style={{ padding: '18px 22px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div className="eyebrow">Case {C.id}</div>
                <h2 style={{ fontSize: 22 }}>{C.title}</h2>
                <div className="microcopy">Lead agency: {C.leadParty || 'Dept. of Ecology'} · {C.invitedParties ? C.invitedParties.length + ' co-parties invited' : ''} · Stage: <b>{liveStage || C.stage}</b></div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="score-badge" style={{ background: M.rampColor(C.score, ramp), color: M.rampText(C.score, ramp), fontSize: 22, padding: '4px 13px' }}>{C.score.toFixed(3)}</span>
                <div className="microcopy" style={{ marginTop: 3 }}>composite · same weights as all parties</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '1.4 1 320px', minWidth: 290 }}>
              <h3 style={{ fontSize: 15, marginBottom: 9 }}>Findings</h3>
              <div style={{ display: 'grid', gap: 8 }}>
                {C.findings.map(f => (
                  <div key={f.k} className="card" style={{ padding: '10px 13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <b style={{ fontSize: 13.5 }}>{f.k}</b>
                      <span className="score-serif" style={{ fontSize: 17, color: parseFloat(f.v) < 0.1 ? '#C0392B' : 'var(--ink)' }}>{f.v}</span>
                    </div>
                    <div className="microcopy" style={{ margin: '3px 0 5px' }}>{f.evidence}</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Chip tone="slate">{f.ver}</Chip>
                      {f.contested && <Chip tone="hi">contested</Chip>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ flex: '2 1 400px', minWidth: 340 }}>
              <h3 style={{ fontSize: 15, marginBottom: 9 }}>All conditions <span className="microcopy" style={{ fontWeight: 400 }}>· including pending</span></h3>
              <div className="card" style={{ overflow: 'auto' }}>
                <table className="mtable">
                  <thead><tr><th>Condition</th><th>Proposed by</th><th>Type</th><th>Status</th></tr></thead>
                  <tbody>
                    {(liveConditions || C.conditions).map((c, i) => (
                      <tr key={c.id || i} style={{ background: c.pendingApproval ? 'rgba(180,95,29,0.04)' : undefined }}>
                        <td style={{ fontWeight: 600, fontSize: 13, maxWidth: 280 }}>{c.text}</td>
                        <td style={{ fontSize: 12.5 }}>{c.by}</td>
                        <td><Chip tone="mist">{c.type}</Chip></td>
                        <td>
                          {c.pendingApproval
                            ? <Chip tone="med">Pending lead approval</Chip>
                            : <Chip tone={({ 'Accepted': 'lo', 'Under review': 'med', 'Countered': 'med', 'Proposed': 'slate', 'Impasse': 'hi' }[c.status] || 'slate')}>{c.status}</Chip>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(liveStage || C.stage) === 'Rebuttal Cycle' && (
                <div style={{ marginTop: 14, padding: '14px 16px', background: 'var(--sand)', borderRadius: 10 }}>
                  <b style={{ fontSize: 13.5 }}>Rebuttal period is open</b>
                  <p className="microcopy" style={{ margin: '4px 0 10px' }}>You may file a formal rebuttal to any contested finding. This will be logged and shared with all parties.</p>
                  {rebuttalSent ? (
                    <p style={{ color: 'var(--evergreen)', fontWeight: 650, fontSize: 13.5 }}>Rebuttal submitted.</p>
                  ) : (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <textarea rows={3} placeholder="Describe your rebuttal..." value={rebuttal}
                        onChange={e => setRebuttal(e.target.value)}
                        style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', color: 'inherit', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
                      <button className="btn btn-primary btn-sm" onClick={sendRebuttal}>File rebuttal</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { BuilderSearch, BuilderSubNav, SiteCard, MiniRampBar, SavedCellCard, ComparisonPanel, BuilderCaseView });
