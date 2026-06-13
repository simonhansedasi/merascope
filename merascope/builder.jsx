/* ── Surface B: Builder workspace — search + listing cards ── */

function BuilderSubNav({ active }) {
  const tabs = [['search', 'Search', '#/builder'], ['sitelab', 'Site Lab', '#/builder/sitelab'], ['watchlist', 'Watchlist', '#/builder/watchlist'], ['portfolio', 'Portfolio screening', '#/builder/portfolio']];
  return (
    <div className="tabs" style={{ marginBottom: 18 }}>
      {tabs.map(([k, label, href]) => (
        <button key={k} className={active === k ? 'on' : ''} onClick={() => { location.hash = href; }}>{label}</button>
      ))}
    </div>
  );
}

/* ── the site listing card — the product ── */
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

function FilterBar({ filters, setFilters }) {
  const set = (k, v) => setFilters({ ...filters, [k]: v });
  const haz = filters.hazards;
  const toggleHaz = h => set('hazards', haz.includes(h) ? haz.filter(x => x !== h) : [...haz, h]);
  return (
    <div className="card" style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: '10px 22px', alignItems: 'center', marginBottom: 16, fontSize: 13 }}>
      <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontWeight: 650 }}>
        State
        <select value="WA" onChange={() => {}} style={{ padding: '4px 8px', border: '1px solid var(--line)', borderRadius: 6 }}>
          <option>WA</option>
        </select>
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        Min composite <input className="mslider" type="range" min="0" max="1" step="0.01" value={filters.minScore} style={{ width: 90 }} onChange={e => set('minScore', +e.target.value)} />
        <span className="score-serif" style={{ width: 32 }}>{filters.minScore.toFixed(2)}</span>
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        Min acreage <input className="mslider" type="range" min="0" max="1000" step="50" value={filters.minAcres} style={{ width: 80 }} onChange={e => set('minAcres', +e.target.value)} />
        <span className="score-serif" style={{ width: 34 }}>{filters.minAcres}</span>
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        Max km to ≥230 kV <input className="mslider" type="range" min="1" max="10" step="0.5" value={filters.maxKv} style={{ width: 74 }} onChange={e => set('maxKv', +e.target.value)} />
        <span className="score-serif" style={{ width: 28 }}>{filters.maxKv}</span>
      </label>
      <label style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        Water rights
        <select value={filters.water} onChange={e => set('water', e.target.value)} style={{ padding: '4px 8px', border: '1px solid var(--line)', borderRadius: 6 }}>
          <option>Any</option><option>Adjudicated</option><option>Available</option><option>Constrained</option>
        </select>
      </label>
      <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 650 }}>Exclude:</span>
        {['SFHA flood', 'PGA > 0.4g', 'tornado-belt', 'wildfire'].map(h => (
          <label key={h} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', color: 'var(--slate)' }}>
            <input type="checkbox" checked={haz.includes(h)} onChange={() => toggleHaz(h)} /> {h}
          </label>
        ))}
      </span>
      <label style={{ display: 'inline-flex', gap: 5, alignItems: 'center', color: 'var(--slate)' }}>
        <input type="checkbox" checked={filters.heat} onChange={e => set('heat', e.target.checked)} /> Heat-reuse demand &lt; 5 km
      </label>
      <label style={{ display: 'inline-flex', gap: 5, alignItems: 'center', color: 'var(--slate)' }}>
        <input type="checkbox" checked={filters.farm} onChange={e => set('farm', e.target.checked)} /> Exclude farmland class I–II
      </label>
    </div>
  );
}

function BuilderSearch() {
  const M = window.MERA;
  const loading = useFakeLoad(750);
  const [filters, setFilters] = React.useState({ minScore: 0.5, minAcres: 0, maxKv: 10, water: 'Any', hazards: [], heat: false, farm: false });
  const [watched, setWatched] = React.useState([...M.WATCHED]);
  const [selected, setSelected] = React.useState(null);

  const sites = M.SITES.filter(s =>
    s.composite >= filters.minScore &&
    s.acres >= filters.minAcres &&
    s.kvDist <= filters.maxKv &&
    (filters.water === 'Any' || s.waterRights === filters.water) &&
    (!filters.heat || s.bars['Heat-reuse'] >= 0.55)
  ).sort((a, b) => b.composite - a.composite);

  const open = site => { location.hash = '#/builder/site/' + site.id; };
  const watch = id => setWatched(w => w.includes(id) ? w.filter(x => x !== id) : [...w, id]);

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Builder — Search">
      <BuilderSubNav active="search" />
      <FilterBar filters={filters} setFilters={setFilters} />
      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
        <div style={{ width: 470, flexShrink: 0, display: 'grid', gap: 12, maxHeight: '72vh', overflowY: 'auto', paddingRight: 4 }}>
          {loading ? (
            <React.Fragment><div className="shimmer" style={{ height: 190 }}></div><div className="shimmer" style={{ height: 190 }}></div><div className="shimmer" style={{ height: 190 }}></div></React.Fragment>
          ) : sites.length === 0 ? (
            <div className="card" style={{ padding: '34px 24px', textAlign: 'center' }}>
              <Glyph size={30} tone="var(--slate)" accent="var(--slate)" />
              <h4 style={{ marginTop: 10 }}>No sites clear these filters.</h4>
              <p className="microcopy" style={{ maxWidth: 300, margin: '6px auto 0' }}>That is the answer, not an error. Loosen the composite floor or widen the line-distance cap to see what trades away.</p>
            </div>
          ) : (
            <React.Fragment>
              <div className="microcopy"><span className="score-serif">{sites.length}</span> sites match · sorted by composite</div>
              {sites.map(s => <SiteCard key={s.id} site={s} onOpen={open} watched={watched.includes(s.id)} onWatch={watch} selected={selected === s.id} />)}
            </React.Fragment>
          )}
        </div>
        <div className="card hide-mobile" style={{ flex: 1, padding: 14, position: 'sticky', top: 70 }}>
          <WAMap weights={M.DEFAULT_WEIGHTS} markers={false} recommended={false}
            pins={loading ? [] : sites} onPinClick={s => setSelected(s.id)} />
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <MapLegend showMarkers={false} />
            <span className="microcopy">Pins colored by composite · click a pin to highlight its card</span>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { BuilderSearch, BuilderSubNav, SiteCard, MiniRampBar });
