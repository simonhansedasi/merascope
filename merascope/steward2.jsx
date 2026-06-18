/* ── Surface C (cont.): impasse register, litigation, mandated studies ── */

function ImpassePage() {
  const M = window.MERA;
  const [cat, setCat] = React.useState('Water rights');
  const [routed, setRouted] = React.useState({});

  React.useEffect(() => {
    fetch('/api/impasse/routes').then(r => r.json()).then(keys => {
      const init = {};
      keys.forEach(k => { init[k] = true; });
      setRouted(init);
    });
  }, []);

  const routeToMediation = key => {
    fetch('/api/impasse/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    setRouted(r => Object.assign({}, r, { [key]: true }));
  };
  return (
    <div style={{ maxWidth: 1140, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Steward — Impasse register">
      <StewardSubNav active="impasse" />
      <PageHead title="Impasse register" sub="Deadlocked items across all active cases, categorized and time-stamped. What has resolved each category historically is on the right." />
      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: '2 1 540px', overflow: 'auto' }}>
          <table className="mtable">
            <thead><tr><th>Case</th><th>Site</th><th>Category</th><th>Deadlocked item</th><th>Days</th><th></th></tr></thead>
            <tbody>
              {M.IMPASSES.map(im => {
                const key = im.caseId + im.item;
                const done = !!routed[key];
                return (
                  <tr key={key} onClick={() => setCat(im.cat)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 650 }}>{im.caseId}</td>
                    <td style={{ fontSize: 13 }}>{im.site}</td>
                    <td><Chip tone={im.cat === 'Water rights' ? 'hi' : 'med'}>{im.cat}</Chip></td>
                    <td style={{ fontSize: 13, maxWidth: 240 }}>{im.item}<div className="microcopy">{im.parties}</div></td>
                    <td className="score-serif">{im.days}</td>
                    <td>
                      {done
                        ? <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--evergreen)' }}>Routed</span>
                        : <button className="btn btn-quiet btn-xs" onClick={e => { e.stopPropagation(); routeToMediation(key); }}>Route to mediation</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="panel" style={{ flex: '1 1 300px', padding: '16px 18px' }}>
          <b style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--slate)' }}>What historically unlocks "{cat}"</b>
          <p className="microcopy" style={{ margin: '4px 0 12px' }}>Past conditions that broke this deadlock type. Select a row to switch category.</p>
          <div style={{ display: 'grid', gap: 10 }}>
            {(M.IMPASSE_UNLOCKS[cat] || []).map(u => (
              <div key={u.c}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                  <span style={{ fontWeight: 600, paddingRight: 8 }}>{u.c}</span>
                  <span className="score-serif" style={{ color: 'var(--evergreen)' }}>{u.p}%</span>
                </div>
                <div className="mb-track"><div className="mb-fill" style={{ width: u.p + '%', background: 'var(--evergreen)' }}></div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LitigationPage() {
  const M = window.MERA;

  const exportLitigationRecord = l => {
    const lines = [
      'MERASCOPE EVIDENTIARY RECORD -- LITIGATION EXPORT',
      'Matter: ' + l.name,
      'Court: ' + l.court + ' No. ' + l.no,
      'Filed: ' + l.filed + ' | Status: ' + l.status,
      'Exported: ' + new Date().toISOString(),
      '',
      'Versioned scores, findings, and chain-of-custody events since intake are',
      'maintained in the Merascope evidentiary database. Contact the lead agency',
      'reviewer to obtain the full signed export for court or administrative record.'
    ];
    const a = document.createElement('a');
    a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(lines.join('\n'));
    a.download = 'litigation_' + l.no.replace(/[^A-Za-z0-9_-]/g, '_') + '.txt';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <div style={{ maxWidth: 940, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Steward — Litigation tracker">
      <StewardSubNav active="litigation" />
      <PageHead title="Litigation tracker" sub="Rare by design. Versioned scores and complete chain of custody for every case, exportable as a signed record." />
      <div style={{ display: 'grid', gap: 12 }}>
        {M.LITIGATION.map(l => (
          <div key={l.no} className="card" style={{ padding: '16px 20px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <Icon name="gavel" size={20} color="var(--slate)" />
            <div style={{ flex: '1 1 300px' }}>
              <b style={{ fontSize: 14.5 }}>{l.name}</b>
              <div className="microcopy" style={{ marginTop: 2 }}>{l.court} · No. {l.no} · filed {l.filed}</div>
            </div>
            <Chip tone={l.status === 'Briefing' ? 'med' : 'slate'}>{l.status}</Chip>
            <button className="btn btn-quiet btn-sm" onClick={() => exportLitigationRecord(l)}>Export evidentiary record (versioned scores + chain-of-custody)</button>
          </div>
        ))}
      </div>
      <p className="microcopy" style={{ marginTop: 16 }}>{M.LITIGATION.length} matters statewide. Every score version and custody event since intake is in the export.</p>
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
  const M = window.MERA;
  const [expanded, setExpanded] = React.useState({});
  const [checked, setChecked] = React.useState({});
  const [localStudies, setLocalStudies] = React.useState(M.STUDIES);

  React.useEffect(() => {
    fetch('/api/studies/checks').then(r => r.json()).then(list => {
      const init = {};
      list.forEach(c => { init[c.study_name + '|' + c.section_idx] = true; });
      setChecked(init);
    });
  }, []);

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

  const addTemplate = tpl => {
    if (localStudies.find(s => s.name === tpl)) return;
    const secs = STUDY_SECTIONS[tpl] || [];
    setLocalStudies(ls => [...ls, { name: tpl, body: 'Draft', progress: 0, due: '2026-12-31', sections: '0 of ' + secs.length + ' sections drafted' }]);
  };

  const TEMPLATES = ['Moratorium impact study — NY-style', 'Application review scorecard', 'Water-availability assessment', 'Rate-impact memorandum'];

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Steward — Mandated studies">
      <StewardSubNav active="studies" />
      <PageHead title="Mandated-study workbench" sub="Nearly every moratorium is a pause-to-study. The law manufactures the deadline; the workbench keeps you ahead of it." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14 }}>
        {localStudies.map(st => {
          const d = daysUntil(st.due);
          const secs = STUDY_SECTIONS[st.name] || [];
          const checkedCount = secs.filter((_, i) => checked[st.name + '|' + i]).length;
          const pct = secs.length > 0 ? Math.round(checkedCount / secs.length * 100) : st.progress;
          const open = !!expanded[st.name];
          return (
            <div key={st.name} className="card" style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <b style={{ fontSize: 15 }}>{st.name}</b>
                  <div className="microcopy" style={{ marginTop: 2 }}>{st.body}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className="score-serif" style={{ fontSize: 24, color: d < 40 ? '#C0392B' : 'var(--basalt)', lineHeight: 1 }}>{d}</div>
                  <div className="microcopy">days to deadline</div>
                </div>
              </div>
              <div style={{ margin: '14px 0 5px', display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--slate)' }}>
                <span>{secs.length > 0 ? checkedCount + ' of ' + secs.length + ' sections drafted' : st.sections}</span>
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
                {!open && <button className="btn btn-quiet btn-sm">Assign section</button>}
              </div>
            </div>
          );
        })}
        <div className="card" style={{ padding: '18px 20px', borderStyle: 'dashed', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
          <b style={{ fontSize: 14 }}>Start from a template</b>
          {TEMPLATES.map(t => (
            <button key={t} className="btn btn-quiet btn-sm" style={{ justifyContent: 'flex-start' }}
              onClick={() => addTemplate(t)}
              disabled={!!localStudies.find(s => s.name === t)}>
              {localStudies.find(s => s.name === t) ? t + ' (added)' : t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ImpassePage, LitigationPage, StudiesPage });
