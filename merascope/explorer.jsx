/* ── Surface A: Public Explorer ── */

function GradeStrip() {
  const M = window.MERA;
  const [open, setOpen] = React.useState(null);
  return (
    <section style={{ marginTop: 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div className="score-serif" style={{ fontSize: 46, lineHeight: 1, color: 'var(--basalt)' }}>{M.STATE_GRADE}</div>
            <div className="microcopy">Washington</div>
          </div>
          <div>
            <h3 style={{ fontSize: 18 }}>State report card</h3>
            <p className="microcopy" style={{ margin: 0 }}>Click a grade to read the plain-language finding. {M.VERSION}.</p>
          </div>
        </div>
        <a className="btn btn-ghost btn-sm" href="#/factsheets/state">Download State Fact Sheet (PDF)</a>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {M.GRADES.map((g, i) => (
          <button key={g.k} className={'grade-chip' + (open === i ? ' open' : '')} onClick={() => setOpen(open === i ? null : i)} style={{ flex: '1 1 108px' }}>
            <span className="grade-letter" style={{ color: g.g[0] <= 'B' ? 'var(--evergreen)' : 'var(--basalt)' }}>{g.g}</span>
            <span style={{ fontSize: 12, color: 'var(--slate)', fontWeight: 650, textAlign: 'center' }}>{g.k}</span>
          </button>
        ))}
      </div>
      {open !== null && (
        <div className="card" style={{ marginTop: 10, padding: '14px 18px', fontSize: 14, lineHeight: 1.6 }}>
          <b style={{ color: 'var(--evergreen)' }}>{M.GRADES[open].k} — {M.GRADES[open].g}.</b> {M.GRADES[open].why}
        </div>
      )}
    </section>
  );
}

function ClusterTable() {
  const M = window.MERA;
  const { ramp } = React.useContext(MeraCtx);
  const [sort, setSort] = React.useState({ k: 'composite', dir: -1 });
  const rows = [...M.CLUSTERS].sort((a, b) => {
    const va = sort.k === 'name' ? a.name : sort.k === 'status' ? a.status : a.composite;
    const vb = sort.k === 'name' ? b.name : sort.k === 'status' ? b.status : b.composite;
    return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
  });
  const th = (k, label) => (
    <th style={{ cursor: 'pointer' }} onClick={() => setSort({ k, dir: sort.k === k ? -sort.dir : -1 })}>
      {label}{sort.k === k ? (sort.dir < 0 ? ' ▾' : ' ▴') : ''}
    </th>
  );
  return (
    <section style={{ marginTop: 34 }}>
      <h3 style={{ fontSize: 18, marginBottom: 4 }}>Cluster scoreboard</h3>
      <p className="microcopy" style={{ margin: '0 0 12px' }}>Existing and proposed campuses, scored at default weights (Transmission 40 · Water 35 · Community 25). Sort any column.</p>
      <div className="card" style={{ overflow: 'auto' }}>
        <table className="mtable">
          <thead><tr>{th('name', 'Cluster')}{th('status', 'Status')}{th('composite', 'Composite')}<th>Water</th><th>Transmission</th><th>Flatness</th></tr></thead>
          <tbody>
            {rows.map(cl => (
              <tr key={cl.name}>
                <td style={{ fontWeight: 650 }}>{cl.name}</td>
                <td>{cl.status === 'existing' ? <Chip tone="mist">existing</Chip> : <Chip tone="slate">proposed</Chip>}</td>
                <td><span className="score-badge" style={{ background: M.rampColor(cl.composite, ramp), color: M.rampText(cl.composite, ramp), fontSize: 14 }}>{cl.composite.toFixed(3)}</span></td>
                <td className="score-serif">{cl.ind.water.toFixed(3)}</td>
                <td className="score-serif">{cl.ind.transmission.toFixed(3)}</td>
                <td className="score-serif">{cl.ind.flatness.toFixed(3)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan="6" style={{ fontSize: 12.5, color: 'var(--slate)', background: 'var(--sand)' }}>
                Wallula Gap water score: <span className="score-serif">0.000</span> — the floor of the state. Contamination distance: <span className="score-serif">0.014</span> (Hanford-adjacent).
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function NewsBand() {
  return (
    <section style={{ marginTop: 34 }}>
      <div className="card" style={{ display: 'flex', gap: 18, padding: '18px 22px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--slate)', border: '1px solid var(--line)', borderRadius: 5, padding: '3px 8px' }}>In the news</span>
        <blockquote style={{ margin: 0, flex: '1 1 380px', fontSize: 15, lineHeight: 1.55 }}>
          “An independent scoring model shows Washington’s largest proposed data-center campuses clustering in the driest cells of the state — a finding now cited in the legislature’s moratorium study.”
          <div className="microcopy" style={{ marginTop: 5 }}>— Statewide technology press, February 2026</div>
        </blockquote>
        <a className="btn btn-quiet btn-sm" href="#/factsheets/state">Open the record</a>
      </div>
    </section>
  );
}

function ExplorerPage({ query }) {
  const M = window.MERA;
  const initial = React.useMemo(() => {
    if (query && query.w) {
      const parts = query.w.split(',').map(Number);
      if (parts.length === 9 && parts.every(n => !isNaN(n))) {
        const w = {}; M.INDICATORS.forEach((m, i) => { w[m.k] = parts[i]; });
        return w;
      }
    }
    return { ...M.DEFAULT_WEIGHTS };
  }, []);
  const [weights, setWeights] = React.useState(initial);
  const isMobile = window.innerWidth < 900;
  const viable = M.GATE_COUNTS.viable;

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '26px 24px 60px' }} data-screen-label="Public Explorer">
      <PageHead eyebrow="Public Explorer — free, no login" title="Washington State suitability surface"
        sub={<span><span className="score-serif">974</span> grid cells at 0.15° (~14 km) · <span className="score-serif">{viable}</span> viable after hard gates · scores update live as you weight the indicators.</span>}
        right={<PromiseBadge />} />
      <div className="explorer-layout" style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card" style={{ padding: 14 }}>
            <WAMap weights={weights} pins={null} />
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line-soft)' }}>
              <MapLegend />
            </div>
          </div>
          <GradeStrip />
          <ClusterTable />
          <NewsBand />
        </div>
        <WeightPanel weights={weights} setWeights={setWeights} dock={isMobile} />
      </div>
    </div>
  );
}

Object.assign(window, { ExplorerPage, GradeStrip, ClusterTable });
