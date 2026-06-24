/* -- Surface B: Builder workspace -- saved cells + comparison */

function _resolveAgency(key) {
  if (!key) return '';
  var M = window.MERA;
  var entry = (M.AGENCY_DIRECTORY || []).find(function(a) { return a.key === key; });
  return entry ? entry.name : key;
}

function BuilderSubNav({ active }) {
  const tabs = [['search', 'Workspace', '#/builder'], ['status', 'Status', '#/builder/status'], ['portfolio', 'Portfolio screening', '#/builder/portfolio'], ['mycase', 'My Inquiry', '#/builder/case/']];
  return (
    <div className="tabs" style={{ marginBottom: 18, flexWrap: 'wrap', overflowX: 'visible' }}>
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

var AFFILIATED_AGENCIES = [
  { match: 'Seattle',     key: 'OPCD', label: 'Seattle OPCD',           partner: true  },
  { match: 'King County', key: 'KCDER', label: 'King County DPER',       partner: true  },
  { match: 'Snohomish',   key: 'SN-PDS', label: 'Snohomish County PDS', partner: false },
  { match: 'Pierce',      key: 'PC-PLAN', label: 'Pierce County Planning', partner: false },
  { match: 'Washington',  key: 'ECO', label: 'WA Dept. of Ecology',     partner: true  },
];

function deriveJurisdictions(addr) {
  var pool = [addr.city, addr.town, addr.village, addr.county, addr.state].filter(Boolean);
  var results = [];
  pool.forEach(function(name) {
    AFFILIATED_AGENCIES.forEach(function(ag) {
      if (name.indexOf(ag.match) !== -1 && !results.some(function(r) { return r.label === ag.label; })) {
        results.push(ag);
      }
    });
  });
  if (results.length === 0) {
    var city = addr.city || addr.town || addr.village;
    var county = addr.county;
    if (city)   results.push({ match: city,   label: city + ' Planning Dept.',   partner: false });
    if (county) results.push({ match: county, label: county + ' Planning',        partner: false });
  }
  return results;
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
  const [mode, setMode] = React.useState(id ? 'lookup' : 'submit');
  const [dynCase, setDynCase] = React.useState(null);
  const [dynLoading, setDynLoading] = React.useState(false);

  /* submission form state */
  const [savedCells]        = React.useState(window.getSavedCells ? window.getSavedCells() : []);
  const [selCell, setSelCell]         = React.useState(null);
  const [form, setForm]               = React.useState({ siteName: '', applicant: '', contactName: '', contactEmail: '', score: '0.500', notes: '' });
  const setField = function(k, v) { setForm(function(f) { return Object.assign({}, f, { [k]: v }); }); };
  const [jurisdictions, setJurisdictions]     = React.useState([]);
  const [selJur, setSelJur]           = React.useState(null);
  const [geoLoading, setGeoLoading]   = React.useState(false);
  const [submitting, setSubmitting]   = React.useState(false);
  const [subError, setSubError]       = React.useState('');

  /* import form state */
  const [impForm, setImpForm] = React.useState({ siteName: '', externalPermitId: '', stage: '', lat: '', lon: '', leadAgency: '', applicant: '', contactName: '', contactEmail: '', notes: '' });
  const setImpField = function(k, v) { setImpForm(function(f) { return Object.assign({}, f, { [k]: v }); }); };

  const C = (M.CASE_DETAIL_MAP && M.CASE_DETAIL_MAP[caseId]) || null;

  /* fetch live conditions/stage when viewing a demo case */
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

  /* fetch dynamic case when id is pre-set and not in CASE_DETAIL_MAP */
  React.useEffect(() => {
    if (!id || C) return;
    setDynLoading(true);
    var url = (id || '').startsWith('demo-') ? '/api/demo/case/' + id : '/api/builder/case/' + id;
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && data.case_id) setDynCase(data); })
      .finally(() => setDynLoading(false));
  }, [id]);

  /* Nominatim reverse geocode when a saved cell is selected */
  React.useEffect(function() {
    if (!selCell || selCell.lat == null) { setJurisdictions([]); setSelJur(null); return; }
    setGeoLoading(true);
    setJurisdictions([]);
    setSelJur(null);
    fetch('https://nominatim.openstreetmap.org/reverse?lat=' + selCell.lat + '&lon=' + selCell.lon + '&format=json&zoom=10')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var candidates = deriveJurisdictions(data.address || {});
        setJurisdictions(candidates);
        if (candidates.length === 1) setSelJur(candidates[0]);
      })
      .catch(function() { setJurisdictions([]); })
      .finally(function() { setGeoLoading(false); });
  }, [selCell ? selCell.fid : null]);

  const handleImport = function() {
    setSubError('');
    if (!impForm.siteName.trim())     { setSubError('Site name is required.'); return; }
    if (!impForm.applicant.trim())    { setSubError('Company / applicant is required.'); return; }
    if (!impForm.contactEmail.trim()) { setSubError('Contact email is required.'); return; }
    setSubmitting(true);
    var payload = {
      site:               impForm.siteName.trim(),
      applicant:          impForm.applicant.trim(),
      contact_name:       impForm.contactName.trim(),
      contact_email:      impForm.contactEmail.trim(),
      lead_agency:        impForm.leadAgency.trim(),
      notes:              impForm.notes.trim(),
      external_permit_id: impForm.externalPermitId.trim(),
      stage:              impForm.stage.trim() || 'Site Inquiry',
      score:              0.5,
      imported:           true,
    };
    if (impForm.lat && impForm.lon) {
      payload.lat = parseFloat(impForm.lat);
      payload.lon = parseFloat(impForm.lon);
    }
    payload.session_id = window.MERA_SESSION || '';
    fetch('/api/builder/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.ok) {
          setCaseId(data.case_id);
          setSearched(true);
          setMode('lookup');
          setDynCase(null);
          var caseUrl = data.is_demo ? '/api/demo/case/' + data.case_id : '/api/builder/case/' + data.case_id;
          fetch(caseUrl)
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(d) { if (d && d.case_id) setDynCase(d); });
          if (data.is_demo) {
            try { localStorage.setItem('mera_demo_ts', String(Date.now())); } catch (e) {}
            if (typeof window._setDemoActive === 'function') window._setDemoActive(true);
          }
          location.hash = '#/builder/case/' + data.case_id;
          setToast(data.is_demo ? 'Demo submitted — sign in to file a real inquiry.' : 'Permit registered — Case ' + data.case_id + ' created.');
        } else {
          setSubError(data.err || 'Import failed. Please try again.');
        }
      })
      .catch(function() { setSubError('Network error. Please try again.'); })
      .finally(function() { setSubmitting(false); });
  };

  const handleSearch = () => {
    setSearched(true);
    setDynCase(null);
    if (C) { location.hash = '#/builder/case/' + caseId; return; }
    if (!caseId) return;
    setDynLoading(true);
    var url = (caseId || '').startsWith('demo-') ? '/api/demo/case/' + caseId : '/api/builder/case/' + caseId;
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && data.case_id) setDynCase(data); })
      .finally(() => setDynLoading(false));
  };

  const handleCellSelect = function(fid) {
    var cell = savedCells.find(function(c) { return c.fid === fid; }) || null;
    setSelCell(cell);
    if (cell) {
      var label = (window.cellLabel && window.cellLabel(cell.properties)) || (cell.properties._state || '');
      var pi = window.propsToInd;
      var nat = (pi && M) ? M.composite(pi(cell.properties, true), M.DEFAULT_WEIGHTS) : null;
      setField('siteName', label);
      if (nat != null) setField('score', nat.toFixed(3));
    }
  };

  const handleSubmit = function() {
    setSubError('');
    if (!form.siteName.trim())       { setSubError('Site name is required.'); return; }
    if (!form.applicant.trim())      { setSubError('Company / applicant is required.'); return; }
    if (!form.contactEmail.trim())   { setSubError('Contact email is required.'); return; }
    if (!selJur && jurisdictions.length > 0) { setSubError('Please select a lead agency.'); return; }
    setSubmitting(true);
    var payload = {
      site:          form.siteName.trim(),
      applicant:     form.applicant.trim(),
      score:         parseFloat(form.score) || 0.5,
      contact_name:  form.contactName.trim(),
      contact_email: form.contactEmail.trim(),
      lead_agency:   selJur ? (selJur.key || selJur.label) : (jurisdictions[0] ? (jurisdictions[0].key || jurisdictions[0].label) : ''),
      notes:         form.notes.trim(),
    };
    if (selCell) {
      payload.cell_fid   = selCell.fid;
      payload.lat        = selCell.lat;
      payload.lon        = selCell.lon;
      payload.state_code = selCell.properties._state || '';
    }
    payload.session_id = window.MERA_SESSION || '';
    fetch('/api/builder/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.ok) {
          setCaseId(data.case_id);
          setSearched(true);
          setMode('lookup');
          setDynCase(null);
          var caseUrl = data.is_demo ? '/api/demo/case/' + data.case_id : '/api/builder/case/' + data.case_id;
          fetch(caseUrl)
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(d) { if (d && d.case_id) setDynCase(d); });
          if (data.is_demo) {
            try { localStorage.setItem('mera_demo_ts', String(Date.now())); } catch (e) {}
            if (typeof window._setDemoActive === 'function') window._setDemoActive(true);
          }
          location.hash = '#/builder/case/' + data.case_id;
          setToast(data.is_demo ? 'Demo submitted — sign in to file a real inquiry.' : 'Site inquiry submitted — Case ' + data.case_id + ' created.');
        } else {
          setSubError(data.err || 'Submission failed. Please try again.');
        }
      })
      .catch(function() { setSubError('Network error. Please try again.'); })
      .finally(function() { setSubmitting(false); });
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

  /* ── render ── */
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Builder -- My Inquiry">
      {toast && <NotifyToast message={toast} onDone={() => setToast(null)} />}
      <BuilderSubNav active="mycase" />

      {C ? (
        /* ── full demo case view ── */
        <div>
          <div style={{ marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn btn-quiet btn-sm" onClick={() => { setCaseId(''); setSearched(false); location.hash = '#/builder/case/'; }}>Look up a different case</button>
            <Chip tone="slate">Read-only view</Chip>
          </div>

          <div className="callout" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <Icon name="lock" size={16} color="var(--basalt)" />
            <div style={{ fontSize: 13.5 }}>
              <b>Your site inquiry is under active review.</b> Conditions appear as proposed, including those pending lead agency approval.
            </div>
          </div>

          <div className="card" style={{ padding: '18px 22px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div className="eyebrow">Case {C.id}</div>
                <h2 style={{ fontSize: 22 }}>{C.title}</h2>
                <div className="microcopy">Lead agency: {C.leadParty || 'Dept. of Ecology'} &middot; {C.invitedParties ? C.invitedParties.length + ' co-parties invited' : ''} &middot; Stage: <b>{liveStage || C.stage}</b></div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="score-badge" style={{ background: M.rampColor(C.score, ramp), color: M.rampText(C.score, ramp), fontSize: 22, padding: '4px 13px' }}>{C.score.toFixed(3)}</span>
                <div className="microcopy" style={{ marginTop: 3 }}>composite &middot; same weights as all parties</div>
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
              <h3 style={{ fontSize: 15, marginBottom: 9 }}>All conditions <span className="microcopy" style={{ fontWeight: 400 }}>&middot; including pending</span></h3>
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
                        style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
                      <button className="btn btn-primary btn-sm" onClick={sendRebuttal}>File rebuttal</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

      ) : dynCase ? (
        /* ── intake view for builder-submitted / imported cases ── */
        <div>
          <div style={{ marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn btn-quiet btn-sm" onClick={() => { setDynCase(null); setCaseId(''); setSearched(false); location.hash = '#/builder/case/'; }}>Look up a different case</button>
            {(dynCase.case_id || '').startsWith('demo-')
              ? <Chip tone="amber">Demo</Chip>
              : dynCase.imported ? <Chip tone="basalt">Imported</Chip> : <Chip tone="slate">In intake</Chip>}
          </div>

          {(dynCase.case_id || '').startsWith('demo-') && (
            <div className="callout" style={{ padding: '12px 16px', marginBottom: 16, background: 'rgba(255,180,0,0.08)', border: '1px solid var(--amber)', borderRadius: 8 }}>
              <div style={{ fontSize: 13.5, color: 'var(--amber)' }}>
                <b>Demo mode.</b> This is a preview — your inquiry was not filed with any agency. <a href="#/login" style={{ color: 'var(--basalt)', fontWeight: 600 }}>Sign in</a> to submit a real site inquiry.
              </div>
              <div style={{ marginTop: 8 }}>
                <a href="#/steward" style={{ fontSize: 13, fontWeight: 650, color: 'var(--basalt)' }}>View as agency steward &rarr;</a>
              </div>
            </div>
          )}

          {!(dynCase.case_id || '').startsWith('demo-') && (dynCase.confirmed_at ? (
            <div className="callout" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--lo-bg)', border: '1px solid var(--lo-tx)' }}>
              <div style={{ fontSize: 13.5, color: 'var(--lo-tx)' }}>
                <b>Case accepted{dynCase.lead_agency ? ' by ' + _resolveAgency(dynCase.lead_agency) : ''}.</b>
                {dynCase.agency_tracking_id
                  ? <span> Agency reference: <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{dynCase.agency_tracking_id}</span>. This is your shared record — both you and the agency see the same file.</span>
                  : <span> Your case is now under active review. Both you and the agency see the same file.</span>}
              </div>
            </div>
          ) : (
            <div className="callout" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--med-bg)', border: '1px solid var(--med-tx)' }}>
              <div style={{ fontSize: 13.5, color: 'var(--med-tx)' }}>
                {dynCase.imported
                  ? <span><b>Permit registered.</b> Awaiting agency confirmation. Once confirmed, you will see their tracking number here.</span>
                  : <span><b>Site inquiry received.</b> Awaiting agency confirmation. Once confirmed, you will see their tracking number here.</span>}
              </div>
            </div>
          ))}

          <div className="card" style={{ padding: '18px 22px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                  <span className="eyebrow" style={{ margin: 0 }}>Merascope {dynCase.case_id}</span>
                  {dynCase.agency_tracking_id && (
                    <span style={{ fontSize: 11, color: 'var(--slate)' }}>·</span>
                  )}
                  {dynCase.agency_tracking_id && (
                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--evergreen)', fontWeight: 700, background: 'var(--lo-bg)', padding: '2px 7px', borderRadius: 5 }}>
                      Agency ref: {dynCase.agency_tracking_id}
                    </span>
                  )}
                </div>
                <h2 style={{ fontSize: 22 }}>{dynCase.site}</h2>
                <div className="microcopy">
                  Applicant: {dynCase.applicant}
                  {dynCase.lead_agency ? ' · Lead agency: ' + _resolveAgency(dynCase.lead_agency) : ''}
                  {' · Stage: '}<b>{dynCase.stage || 'Site Inquiry'}</b>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="score-badge" style={{ background: M.rampColor(dynCase.score || 0.5, ramp), color: M.rampText(dynCase.score || 0.5, ramp), fontSize: 22, padding: '4px 13px' }}>{(dynCase.score || 0.5).toFixed(3)}</span>
                <div className="microcopy" style={{ marginTop: 3 }}>composite score</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 640 }}>
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>Contact</div>
              <div style={{ fontWeight: 650 }}>{dynCase.contact_name || '—'}</div>
              <div style={{ fontSize: 13, color: 'var(--slate)' }}>{dynCase.contact_email || ''}</div>
            </div>
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>
                {dynCase.imported ? 'Imported' : 'Submitted'}
              </div>
              <div style={{ fontWeight: 650 }}>{dynCase.ts ? dynCase.ts.substring(0, 10) : '—'}</div>
            </div>
          </div>
          {dynCase.external_permit_id && (
            <div className="card" style={{ padding: '14px 16px', marginTop: 14, maxWidth: 640 }}>
              <div style={{ fontSize: 11, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>External permit / application ID</div>
              <div style={{ fontWeight: 650, fontSize: 14, fontFamily: 'monospace' }}>{dynCase.external_permit_id}</div>
            </div>
          )}
          {dynCase.notes && (
            <div className="card" style={{ padding: '14px 16px', marginTop: 14, maxWidth: 640 }}>
              <div style={{ fontSize: 11, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>Notes</div>
              <div style={{ fontSize: 13.5 }}>{dynCase.notes}</div>
            </div>
          )}

          <div style={{ maxWidth: 640 }}>
            <DocSection caseId={dynCase.case_id} />
          </div>
        </div>

      ) : (
        /* ── lookup / submit form ── */
        <div style={{ maxWidth: 800 }}>
          <div className="tabs" style={{ marginBottom: 20, flexWrap: 'wrap', overflowX: 'visible' }}>
            <button className={mode === 'lookup' ? 'on' : ''} onClick={() => setMode('lookup')}>Find existing case</button>
            <button className={mode === 'submit' ? 'on' : ''} onClick={() => setMode('submit')}>Submit site inquiry</button>
            <button className={mode === 'import' ? 'on' : ''} onClick={() => setMode('import')}>Register existing permit</button>
          </div>

          {mode === 'lookup' ? (
            <div style={{ maxWidth: 480 }}>
              <h2 style={{ fontSize: 21, marginBottom: 6 }}>Find your inquiry</h2>
              <p style={{ color: 'var(--slate)', fontSize: 14, marginBottom: 18, lineHeight: 1.6 }}>
                Enter the case ID assigned by your lead agency to view your case file.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="text" value={caseId} placeholder="e.g. 26-0142"
                  onChange={e => { setCaseId(e.target.value.trim()); setSearched(false); setDynCase(null); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                  style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 14, fontFamily: 'inherit' }} />
                <button className="btn btn-primary" onClick={handleSearch} disabled={dynLoading}>{dynLoading ? 'Searching...' : 'Look up'}</button>
              </div>
              {searched && caseId && !C && !dynCase && !dynLoading && (
                <p style={{ marginTop: 12, color: '#C0392B', fontSize: 13.5 }}>
                  Case {caseId} not found. Check the ID, or use the Submit tab to file a new inquiry.
                </p>
              )}
            </div>
          ) : mode === 'import' ? (
            /* ── import existing pipeline form ── */
            <div>
              <h2 style={{ fontSize: 21, marginBottom: 4 }}>Register an existing permit</h2>
              <p style={{ color: 'var(--slate)', fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
                Already in permitting somewhere? Register it here. Use your own terminology; Merascope tracks from wherever you are.
              </p>

              <div style={{ display: 'grid', gap: 16, maxWidth: 600 }}>

                {/* project details */}
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 650, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--slate)' }}>Project</div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, color: 'var(--slate)', marginBottom: 4 }}>Project / site name (required)</label>
                      <input type="text" value={impForm.siteName} placeholder="e.g. Cascade Ridge Data Center"
                        onChange={function(e) { setImpField('siteName', e.target.value); }}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, color: 'var(--slate)', marginBottom: 4 }}>Existing permit / application ID (optional)</label>
                      <input type="text" value={impForm.externalPermitId} placeholder="e.g. King County #2024-0312, SEPA-2025-0087"
                        onChange={function(e) { setImpField('externalPermitId', e.target.value); }}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                </div>

                {/* current stage */}
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 650, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--slate)' }}>Current stage</div>
                  <p style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 8, lineHeight: 1.5 }}>
                    Use your own terminology, or pick from suggestions.
                  </p>
                  <datalist id="imp-stage-suggestions">
                    {(M.STAGES || []).map(function(s) { return <option key={s} value={s} />; })}
                  </datalist>
                  <input type="text" list="imp-stage-suggestions" value={impForm.stage}
                    placeholder="e.g. Conditional Use Hearing, SEPA Comment Period, Pre-Application..."
                    onChange={function(e) { setImpField('stage', e.target.value); }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>

                {/* lead agency */}
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 650, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--slate)' }}>Lead agency</div>
                  <input type="text" value={impForm.leadAgency} placeholder="e.g. King County DPER, WA Dept. of Ecology"
                    onChange={function(e) { setImpField('leadAgency', e.target.value); }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>

                {/* coordinates (optional) */}
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 650, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--slate)' }}>Coordinates <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>(optional — enables Merascope scoring)</span></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, color: 'var(--slate)', marginBottom: 4 }}>Latitude (decimal)</label>
                      <input type="number" step="0.0001" value={impForm.lat} placeholder="47.6062"
                        onChange={function(e) { setImpField('lat', e.target.value); }}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, color: 'var(--slate)', marginBottom: 4 }}>Longitude (decimal)</label>
                      <input type="number" step="0.0001" value={impForm.lon} placeholder="-122.3321"
                        onChange={function(e) { setImpField('lon', e.target.value); }}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                </div>

                {/* contact */}
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 650, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--slate)' }}>Your details</div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, color: 'var(--slate)', marginBottom: 4 }}>Company / applicant (required)</label>
                      <input type="text" value={impForm.applicant} placeholder="e.g. Cascade Summit Data LLC"
                        onChange={function(e) { setImpField('applicant', e.target.value); }}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 12.5, color: 'var(--slate)', marginBottom: 4 }}>Contact name</label>
                        <input type="text" value={impForm.contactName} placeholder="Jane Smith"
                          onChange={function(e) { setImpField('contactName', e.target.value); }}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12.5, color: 'var(--slate)', marginBottom: 4 }}>Contact email (required)</label>
                        <input type="email" value={impForm.contactEmail} placeholder="jane@example.com"
                          onChange={function(e) { setImpField('contactEmail', e.target.value); }}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, color: 'var(--slate)', marginBottom: 4 }}>Notes (optional)</label>
                      <textarea rows={3} value={impForm.notes} placeholder="Brief description of the project or current status..."
                        onChange={function(e) { setImpField('notes', e.target.value); }}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                </div>

                {subError && <p style={{ color: '#C0392B', fontSize: 13.5, margin: 0 }}>{subError}</p>}
                <div>
                  <button className="btn btn-primary" onClick={handleImport} disabled={submitting}>
                    {submitting ? 'Importing...' : 'Import pipeline'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* ── submission form ── */
            <div>
              <h2 style={{ fontSize: 21, marginBottom: 4 }}>Submit a site inquiry</h2>
              <p style={{ color: 'var(--slate)', fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
                Select a saved site to auto-fill scores and detect the lead agency. Add your contact details and submit; the agency will contact you to open the review.
              </p>

              {/* saved cell picker */}
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 12.5, fontWeight: 650, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--slate)' }}>1. Select saved site</div>
                {savedCells.length === 0 ? (
                  <div style={{ padding: '20px 18px', borderRadius: 10, border: '2px dashed var(--line)', textAlign: 'center', color: 'var(--slate)' }}>
                    <div style={{ marginBottom: 8 }}>No saved sites yet.</div>
                    <a className="btn btn-quiet btn-sm" href="#/explorer">Open Explorer to find sites</a>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                    {savedCells.map(function(c) {
                      var label = (window.cellLabel && window.cellLabel(c.properties)) || (c.properties._state || 'Cell ' + c.fid);
                      var pi = window.propsToInd;
                      var nat = (pi && M) ? M.composite(pi(c.properties, true), M.DEFAULT_WEIGHTS) : null;
                      var isSelected = selCell && selCell.fid === c.fid;
                      return (
                        <div key={c.fid}
                          onClick={() => handleCellSelect(c.fid)}
                          style={{ padding: '11px 13px', borderRadius: 9, border: '2px solid ' + (isSelected ? 'var(--basalt)' : 'var(--line)'), background: isSelected ? 'var(--sand)' : 'var(--paper)', cursor: 'pointer' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                            <div style={{ fontWeight: 650, fontSize: 13, lineHeight: 1.3 }}>{label}</div>
                            {nat != null && (
                              <span className="score-badge" style={{ background: M.rampColor(nat, ramp), color: M.rampText(nat, ramp), fontSize: 11.5, padding: '1px 7px', flexShrink: 0 }}>{nat.toFixed(3)}</span>
                            )}
                          </div>
                          {c.lat != null && (
                            <div style={{ fontSize: 10, color: 'var(--slate)', fontFamily: 'monospace', marginTop: 4 }}>
                              {c.lat.toFixed(2) + 'N ' + Math.abs(c.lon).toFixed(2) + 'W'}
                            </div>
                          )}
                          {isSelected && (
                            <div style={{ marginTop: 5, fontSize: 11, color: 'var(--basalt)', fontWeight: 700 }}>Selected</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* project name — shown once a cell is selected */}
              {selCell && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 650, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--slate)' }}>2. Confirm project details</div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, color: 'var(--slate)', marginBottom: 4 }}>Project / site name (editable)</label>
                      <input type="text" value={form.siteName}
                        onChange={e => setField('siteName', e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--slate)' }}>
                      <span>Composite score:</span>
                      <span className="score-serif" style={{ fontSize: 16, color: M.rampColor(parseFloat(form.score) || 0.5, ramp) }}>{form.score}</span>
                      <span style={{ fontSize: 11 }}>(from selected site)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* lead agency — only shown after cell selected */}
              {selCell && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 650, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--slate)' }}>3. Lead agency</div>
                  {geoLoading && <div style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 6 }}>Detecting jurisdiction from site location...</div>}
                  {!geoLoading && jurisdictions.length > 0 && (
                    <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
                      {jurisdictions.map(function(jur) {
                        return (
                          <label key={jur.label} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 12px', borderRadius: 8, border: '1.5px solid ' + (selJur && selJur.label === jur.label ? 'var(--basalt)' : 'var(--line)'), background: selJur && selJur.label === jur.label ? 'var(--sand)' : 'var(--paper)', cursor: 'pointer' }}>
                            <input type="radio" name="jurisdiction" checked={selJur && selJur.label === jur.label} onChange={() => setSelJur(jur)} style={{ accentColor: 'var(--basalt)' }} />
                            <div style={{ flex: 1 }}>
                              <span style={{ fontWeight: 650, fontSize: 13.5 }}>{jur.label}</span>
                              <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 6px', borderRadius: 10, fontWeight: 700, background: jur.partner ? 'var(--lo-bg)' : 'var(--gate)', color: jur.partner ? 'var(--lo-tx)' : 'var(--slate)' }}>
                                {jur.partner ? 'Merascope Partner' : 'Forwarding via Merascope'}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {!geoLoading && jurisdictions.length === 0 && (
                    <input type="text" placeholder="e.g. King County DPER"
                      value={selJur ? selJur.label : ''}
                      onChange={e => setSelJur({ match: e.target.value, label: e.target.value, partner: false })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  )}
                </div>
              )}

              {/* contact — only shown after cell selected */}
              {selCell && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 650, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--slate)' }}>4. Your details</div>
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, color: 'var(--slate)', marginBottom: 4 }}>Company / applicant (required)</label>
                      <input type="text" value={form.applicant} placeholder="e.g. Cascade Summit Data LLC"
                        onChange={e => setField('applicant', e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 12.5, color: 'var(--slate)', marginBottom: 4 }}>Contact name</label>
                        <input type="text" value={form.contactName} placeholder="Jane Smith"
                          onChange={e => setField('contactName', e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12.5, color: 'var(--slate)', marginBottom: 4 }}>Contact email (required)</label>
                        <input type="email" value={form.contactEmail} placeholder="jane@example.com"
                          onChange={e => setField('contactEmail', e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, color: 'var(--slate)', marginBottom: 4 }}>Notes (optional)</label>
                      <textarea rows={3} value={form.notes} placeholder="Brief project description or additional context..."
                        onChange={e => setField('notes', e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                </div>
              )}

              {selCell && (
                <div>
                  {subError && <p style={{ color: '#C0392B', fontSize: 13.5, marginBottom: 12 }}>{subError}</p>}
                  <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? 'Submitting...' : 'Submit site inquiry'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DocSection({ caseId }) {
  const [docs, setDocs]         = React.useState(null);
  const [label, setLabel]       = React.useState('');
  const [docStatus, setDocStatus] = React.useState('Achieved');
  const [file, setFile]         = React.useState(null);
  const [uploading, setUploading] = React.useState(false);
  const [upToast, setUpToast]   = React.useState(null);
  const fileRef = React.useRef(null);

  var loadDocs = function() {
    fetch('/api/case/' + caseId + '/docs')
      .then(function(r) { return r.json(); })
      .then(function(list) { setDocs(list); });
  };

  React.useEffect(function() { if (caseId) loadDocs(); }, [caseId]);

  var handleUpload = function() {
    if (!file) return;
    var fd = new FormData();
    fd.append('file', file);
    fd.append('label', label.trim());
    fd.append('doc_status', docStatus);
    setUploading(true);
    fetch('/api/case/' + caseId + '/docs', { method: 'POST', body: fd })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.ok) {
          setLabel('');
          setDocStatus('Achieved');
          setFile(null);
          if (fileRef.current) fileRef.current.value = '';
          loadDocs();
          setUpToast('Document uploaded.');
        }
      })
      .finally(function() { setUploading(false); });
  };

  return (
    <div style={{ marginTop: 24 }}>
      {upToast && <NotifyToast message={upToast} onDone={function() { setUpToast(null); }} />}
      <h3 style={{ fontSize: 15, marginBottom: 12 }}>Documents</h3>

      {docs === null ? (
        <div style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 12 }}>Loading...</div>
      ) : docs.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 12 }}>No documents uploaded yet.</div>
      ) : (
        <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
          {docs.map(function(doc) {
            var isAchieved = doc.doc_status === 'Achieved';
            return (
              <div key={doc.id} className="card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 650, fontSize: 13.5 }}>{doc.label || doc.name}</div>
                  {doc.label && <div style={{ fontSize: 11.5, color: 'var(--slate)', marginTop: 1 }}>{doc.name}</div>}
                  <div style={{ fontSize: 11, color: 'var(--slate)', marginTop: 2 }}>{doc.date}</div>
                </div>
                <Chip tone={isAchieved ? 'lo' : 'med'}>{doc.doc_status || 'Achieved'}</Chip>
                <a href={'/api/case/' + caseId + '/docs/' + doc.filename} download={doc.name}
                  className="btn btn-quiet btn-sm" style={{ flexShrink: 0 }}>Download</a>
              </div>
            );
          })}
        </div>
      )}

      <div className="card" style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: 12.5, fontWeight: 650, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--slate)' }}>Upload document</div>
        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, color: 'var(--slate)', marginBottom: 4 }}>Label</label>
            <input type="text" value={label}
              placeholder="e.g. SEPA DNS, Geotech Report, Land Use Permit, Building Permit Application"
              onChange={function(e) { setLabel(e.target.value); }}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>Status:</span>
            {['Achieved', 'In Progress'].map(function(s) {
              return (
                <button key={s} className={'btn btn-sm ' + (docStatus === s ? 'btn-primary' : 'btn-quiet')}
                  onClick={function() { setDocStatus(s); }}>
                  {s}
                </button>
              );
            })}
          </div>
          <div>
            <input ref={fileRef} type="file"
              onChange={function(e) { setFile(e.target.files[0] || null); }}
              style={{ fontSize: 13, color: 'inherit' }} />
          </div>
          <div>
            <button className="btn btn-primary btn-sm" onClick={handleUpload} disabled={uploading || !file}>
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { BuilderSearch, BuilderSubNav, SiteCard, MiniRampBar, SavedCellCard, ComparisonPanel, BuilderCaseView, DocSection });
