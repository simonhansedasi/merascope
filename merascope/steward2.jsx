/* ── Surface C (cont.): impasse register, litigation, mandated studies ── */

function ImpassePage() {
  const [items, setItems] = React.useState([]);
  const [routed, setRouted] = React.useState({});
  const [cat, setCat] = React.useState(null);
  const M = window.MERA;

  React.useEffect(() => {
    fetch('/api/impasse/items').then(r => r.json()).then(setItems);
    fetch('/api/impasse/routes').then(r => r.json()).then(keys => {
      const init = {};
      keys.forEach(k => { init[k] = true; });
      setRouted(init);
    });
  }, []);

  const routeToMediation = (key, caseId) => {
    fetch('/api/impasse/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, case_id: caseId })
    });
    setRouted(r => Object.assign({}, r, { [key]: true }));
  };

  const activeCat = cat || (items[0] ? items[0].type : null);

  const IMPASSE_UNLOCKS = {
    'Water': [{ c: 'Trucked construction water + 3:4 replenishment', p: 71 }, { c: 'Seasonal draw cap with public telemetry', p: 58 }],
    'EJ': [{ c: 'Genset relocation + Tier-4 retrofit', p: 66 }, { c: 'Community benefit agreement w/ air monitoring', p: 52 }],
    'Grid': [{ c: 'Contribution-in-aid w/ refund mechanism', p: 74 }, { c: 'Take-or-pay minimum demand charge', p: 61 }],
    'Discharge': [{ c: 'Closed-loop conversion', p: 80 }, { c: 'Winter holding + summer discharge window', p: 49 }]
  };

  return (
    <div style={{ maxWidth: 1140, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Steward — Impasse register">
      <StewardSubNav active="impasse" />
      <PageHead title="Impasse register" sub="Deadlocked conditions, categorized and time-stamped. Route to mediation to clear." />
      {items.length === 0 ? (
        <div className="panel" style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--slate)' }}>
          No impassed conditions. Conditions reach this register when their status is set to Impasse in a case file.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div className="card" style={{ flex: '2 1 540px', overflow: 'auto' }}>
            <table className="mtable">
              <thead><tr><th>Case</th><th>Site</th><th>Type</th><th>Condition</th><th>By</th><th></th></tr></thead>
              <tbody>
                {items.map(im => {
                  const key = im.case_id + im.id;
                  const done = !!routed[key];
                  return (
                    <tr key={key} onClick={() => setCat(im.type)} style={{ cursor: 'pointer' }}>
                      <td style={{ fontWeight: 650 }}>{im.case_id}</td>
                      <td style={{ fontSize: 13 }}>{im.site}</td>
                      <td><Chip tone="med">{im.type}</Chip></td>
                      <td style={{ fontSize: 13, maxWidth: 240 }}>{im.text}<div className="microcopy">{im.by}</div></td>
                      <td className="microcopy">{im.ts ? im.ts.slice(0, 10) : ''}</td>
                      <td>
                        {done
                          ? <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--evergreen)' }}>Routed</span>
                          : <button className="btn btn-quiet btn-xs" onClick={e => { e.stopPropagation(); routeToMediation(key, im.case_id); }}>Route to mediation</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="panel" style={{ flex: '1 1 300px', padding: '16px 18px' }}>
            <b style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--slate)' }}>What historically unlocks "{activeCat}"</b>
            <p className="microcopy" style={{ margin: '4px 0 12px' }}>Conditions that have resolved this type. Click a row to change category.</p>
            <div style={{ display: 'grid', gap: 10 }}>
              {(IMPASSE_UNLOCKS[activeCat] || []).map(u => (
                <div key={u.c}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                    <span style={{ fontWeight: 600, paddingRight: 8 }}>{u.c}</span>
                    <span className="score-serif" style={{ color: 'var(--evergreen)' }}>{u.p}%</span>
                  </div>
                  <div className="mb-track"><div className="mb-fill" style={{ width: u.p + '%', background: 'var(--evergreen)' }}></div></div>
                </div>
              ))}
              {!(IMPASSE_UNLOCKS[activeCat] || []).length && <p className="microcopy">No historical data for this type yet.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LitigationPage() {
  const [matters, setMatters] = React.useState([]);
  const [form, setForm] = React.useState({ name: '', court: '', no: '', status: 'Active', filed: '' });
  const [adding, setAdding] = React.useState(false);

  React.useEffect(() => {
    fetch('/api/litigation').then(r => r.json()).then(setMatters);
  }, []);

  const exportRecord = l => {
    const lines = [
      'MERASCOPE EVIDENTIARY RECORD -- LITIGATION EXPORT',
      'Matter: ' + l.name,
      'Court: ' + l.court + ' No. ' + l.no,
      'Filed: ' + l.filed + ' | Status: ' + l.status,
      'Exported: ' + new Date().toISOString(),
      '',
      'Versioned scores, findings, and chain-of-custody events since intake are maintained in the Merascope evidentiary database.',
      'Contact the lead agency reviewer to obtain the full signed export for court or administrative record.'
    ];
    const a = document.createElement('a');
    a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(lines.join('\n'));
    a.download = 'litigation_' + (l.no || 'matter').replace(/[^A-Za-z0-9_-]/g, '_') + '.txt';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const submit = () => {
    if (!form.name.trim()) return;
    fetch('/api/litigation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    }).then(r => r.json()).then(res => {
      if (res.ok) {
        setMatters(m => [Object.assign({ id: res.id }, form), ...m]);
        setForm({ name: '', court: '', no: '', status: 'Active', filed: '' });
        setAdding(false);
      }
    });
  };

  const remove = id => {
    fetch('/api/litigation/' + id, { method: 'DELETE' });
    setMatters(m => m.filter(x => x.id !== id));
  };

  return (
    <div style={{ maxWidth: 940, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Steward — Litigation tracker">
      <StewardSubNav active="litigation" />
      <PageHead title="Litigation tracker" sub="Versioned scores and complete chain of custody for every case, exportable as a signed record." />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(a => !a)}>{adding ? 'Cancel' : '+ Add matter'}</button>
      </div>
      {adding && (
        <div className="card" style={{ padding: '18px 20px', marginBottom: 16, display: 'grid', gap: 10 }}>
          <input className="input" placeholder="Matter name" value={form.name} onChange={e => setForm(f => Object.assign({}, f, { name: e.target.value }))} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input className="input" placeholder="Court" value={form.court} onChange={e => setForm(f => Object.assign({}, f, { court: e.target.value }))} />
            <input className="input" placeholder="Case no." value={form.no} onChange={e => setForm(f => Object.assign({}, f, { no: e.target.value }))} />
            <input className="input" placeholder="Filed (e.g. Mar 2026)" value={form.filed} onChange={e => setForm(f => Object.assign({}, f, { filed: e.target.value }))} />
            <select className="input" value={form.status} onChange={e => setForm(f => Object.assign({}, f, { status: e.target.value }))}>
              {['Active', 'Stayed pending mediation', 'Briefing', 'Settled', 'Closed'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <button className="btn btn-primary btn-sm" style={{ width: 'fit-content' }} onClick={submit}>Save matter</button>
        </div>
      )}
      {matters.length === 0 && !adding ? (
        <div className="panel" style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--slate)' }}>No litigation matters on file.</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {matters.map(l => (
            <div key={l.id} className="card" style={{ padding: '16px 20px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <Icon name="gavel" size={20} color="var(--slate)" />
              <div style={{ flex: '1 1 300px' }}>
                <b style={{ fontSize: 14.5 }}>{l.name}</b>
                <div className="microcopy" style={{ marginTop: 2 }}>{l.court}{l.no ? ' · No. ' + l.no : ''}{l.filed ? ' · filed ' + l.filed : ''}</div>
              </div>
              <Chip tone={l.status === 'Briefing' ? 'med' : 'slate'}>{l.status}</Chip>
              <button className="btn btn-quiet btn-sm" onClick={() => exportRecord(l)}>Export evidentiary record</button>
              <button className="btn btn-quiet btn-sm" style={{ color: 'var(--hi-tx)' }} onClick={() => remove(l.id)}>Remove</button>
            </div>
          ))}
        </div>
      )}
      {matters.length > 0 && <p className="microcopy" style={{ marginTop: 16 }}>{matters.length} matter{matters.length !== 1 ? 's' : ''} on file.</p>}
    </div>
  );
}

function daysUntil(iso) {
  return Math.max(0, Math.ceil((new Date(iso) - new Date()) / 86400000));
}

var STUDY_SECTIONS = {
  'Moratorium impact study — NY-style': [
    'Executive summary', 'Statutory mandate + scope', 'Current application inventory',
    'Water consumption analysis', 'Grid demand projections', 'Community burden assessment',
    'EJ screen methodology', 'Economic impact modeling', 'Job creation + wages',
    'Tax revenue projections', 'Mitigation measure catalogue', 'Comparable state reviews',
    'Agency consultation record', 'Tribal consultation record', 'Public comment summary',
    'Contested findings log', 'Recommended permit conditions', 'Scoring methodology review',
    'Data source registry', 'Limitations + uncertainties', 'Minority report', 'Final recommendations'
  ],
  'Application review scorecard': [
    'Intake checklist', 'Site control verification', 'Water rights documentation',
    'Grid interconnection status', 'Environmental baseline', 'EJ screen',
    'Tribal notification log', 'Community benefit proposal', 'Condition negotiation record',
    'Co-party sign-offs', 'Staff recommendation', 'Decision summary'
  ],
  'Water-availability assessment': [
    'Water rights inventory', 'Current allocation vs. capacity', 'Seasonal flow analysis',
    'Drought year modeling', 'Aquifer recharge rates', 'Competing demand forecast',
    'Conservation measure options', 'Curtailment risk assessment', 'Monitoring protocol',
    'Findings + conditions'
  ],
  'Rate-impact memorandum': [
    'Load growth assumptions', 'Transmission upgrade scope', 'Cost allocation methodology',
    'Ratepayer impact by class', 'Comparison to alternatives', 'Mitigation options',
    'PUD board findings', 'Ecology sign-off checklist'
  ]
};

function StudiesPage() {
  const [studies, setStudies] = React.useState([]);
  const [expanded, setExpanded] = React.useState({});
  const [checked, setChecked] = React.useState({});

  React.useEffect(() => {
    var exampleStudies = (window.MERA && window.MERA.STUDIES || []).filter(function(s) { return s.is_example; });
    fetch('/api/studies?all=1').then(r => r.json()).then(function(live) {
      var liveIds = live.map(function(s) { return s.id; });
      var merged = exampleStudies.filter(function(s) { return !liveIds.includes(s.id); }).concat(live);
      setStudies(merged);
    });
    fetch('/api/studies/checks').then(r => r.json()).then(list => {
      const init = {};
      list.forEach(c => { init[c.study_name + '|' + c.section_idx] = true; });
      setChecked(init);
    });
  }, []);

  const addTemplate = tpl => {
    if (studies.find(s => s.name === tpl)) return;
    const due = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
    fetch('/api/studies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tpl, body: 'Draft', due })
    }).then(r => r.json()).then(res => {
      if (res.ok) setStudies(ss => [...ss, { id: res.id, name: tpl, body: 'Draft', due }]);
    });
  };

  const removeStudy = (id, name) => {
    fetch('/api/studies/' + id, { method: 'DELETE' });
    setStudies(ss => ss.filter(s => s.id !== id));
  };

  const toggleExpanded = name => setExpanded(e => Object.assign({}, e, { [name]: !e[name] }));

  const toggleCheck = key => {
    const bar = key.lastIndexOf('|');
    const study_name = key.slice(0, bar);
    const section_idx = parseInt(key.slice(bar + 1));
    const nowChecked = !checked[key];
    fetch('/api/studies/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ study_name, section_idx, checked: nowChecked })
    });
    setChecked(c => Object.assign({}, c, { [key]: nowChecked }));
  };

  const TEMPLATES = ['Moratorium impact study — NY-style', 'Application review scorecard', 'Water-availability assessment', 'Rate-impact memorandum'];

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Steward — Mandated studies">
      <StewardSubNav active="studies" />
      <PageHead title="Mandated-study workbench" sub="Nearly every moratorium is a pause-to-study. The law manufactures the deadline; the workbench keeps you ahead of it." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14 }}>
        {studies.map(st => {
          const d = daysUntil(st.due);
          const secs = STUDY_SECTIONS[st.name] || [];
          const checkedCount = secs.filter((_, i) => checked[st.name + '|' + i]).length;
          const pct = secs.length > 0 ? Math.round(checkedCount / secs.length * 100) : 0;
          const open = !!expanded[st.name];
          return (
            <div key={st.id} className="card" style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <b style={{ fontSize: 15 }}>{st.name}</b>
                  <div className="microcopy" style={{ marginTop: 2 }}>{st.body}</div>
                  {st.case_id && (
                    <a href={'#/steward/case/' + st.case_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 5, fontSize: 12, color: 'var(--basalt)', fontWeight: 600, textDecoration: 'none' }}>
                      <Icon name="folder" size={12} color="var(--basalt)" />
                      Case {st.case_id}
                    </a>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className="score-serif" style={{ fontSize: 24, color: d < 40 ? '#C0392B' : 'var(--basalt)', lineHeight: 1 }}>{d}</div>
                  <div className="microcopy">days to deadline</div>
                </div>
              </div>
              <div style={{ margin: '14px 0 5px', display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--slate)' }}>
                <span>{checkedCount} of {secs.length} sections drafted</span>
                <span className="score-serif">{pct}%</span>
              </div>
              <div className="mb-track" style={{ height: 7 }}><div className="mb-fill" style={{ width: pct + '%', background: 'var(--evergreen)' }}></div></div>
              {open && secs.length > 0 && (
                <div style={{ marginTop: 14, display: 'grid', gap: 5 }}>
                  {secs.map((sec, i) => {
                    const k = st.name + '|' + i;
                    return (
                      <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                        <input type="checkbox" checked={!!checked[k]} onChange={() => toggleCheck(k)} style={{ accentColor: 'var(--evergreen)', width: 14, height: 14 }} />
                        <span style={{ color: checked[k] ? 'var(--slate)' : 'inherit', textDecoration: checked[k] ? 'line-through' : 'none' }}>{sec}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button className="btn btn-primary btn-sm" onClick={() => toggleExpanded(st.name)}>
                  {open ? 'Close workbench' : 'Open workbench'}
                </button>
                <button className="btn btn-quiet btn-sm" style={{ color: 'var(--hi-tx)' }} onClick={() => removeStudy(st.id, st.name)}>Remove</button>
              </div>
            </div>
          );
        })}
        <div className="card" style={{ padding: '18px 20px', borderStyle: 'dashed', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
          <b style={{ fontSize: 14 }}>Start from a template</b>
          {TEMPLATES.map(t => (
            <button key={t} className="btn btn-quiet btn-sm" style={{ justifyContent: 'flex-start' }}
              onClick={() => addTemplate(t)}
              disabled={!!studies.find(s => s.name === t)}>
              {studies.find(s => s.name === t) ? t + ' (added)' : t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ImpassePage, LitigationPage, StudiesPage });
