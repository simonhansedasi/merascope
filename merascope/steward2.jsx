/* ── Surface C (cont.): impasse register, litigation, mandated studies ── */

function ImpassePage() {
  const M = window.MERA;
  const [cat, setCat] = React.useState('Water rights');
  return (
    <div style={{ maxWidth: 1140, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Steward — Impasse register">
      <StewardSubNav active="impasse" />
      <PageHead title="Impasse register" sub="Deadlocks across all active cases, categorized and routable to mediation. The register itself becomes the intelligence." />
      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: '2 1 540px', overflow: 'auto' }}>
          <table className="mtable">
            <thead><tr><th>Case</th><th>Site</th><th>Category</th><th>Deadlocked item</th><th>Days</th><th></th></tr></thead>
            <tbody>
              {M.IMPASSES.map(im => (
                <tr key={im.caseId + im.item} onClick={() => setCat(im.cat)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 650 }}>{im.caseId}</td>
                  <td style={{ fontSize: 13 }}>{im.site}</td>
                  <td><Chip tone={im.cat === 'Water rights' ? 'hi' : 'med'}>{im.cat}</Chip></td>
                  <td style={{ fontSize: 13, maxWidth: 240 }}>{im.item}<div className="microcopy">{im.parties}</div></td>
                  <td className="score-serif">{im.days}</td>
                  <td><button className="btn btn-quiet btn-xs">Route to mediation</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel" style={{ flex: '1 1 300px', padding: '16px 18px' }}>
          <b style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--slate)' }}>What historically unlocks “{cat}”</b>
          <p className="microcopy" style={{ margin: '4px 0 12px' }}>Conditions that resolved this impasse type across the register. Click a row to switch category.</p>
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
  return (
    <div style={{ maxWidth: 940, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Steward — Litigation tracker">
      <StewardSubNav active="litigation" />
      <PageHead title="Litigation tracker" sub="Rare by design. Versioned scores and chain-of-custody were built for admissibility before anyone needed them." />
      <div style={{ display: 'grid', gap: 12 }}>
        {M.LITIGATION.map(l => (
          <div key={l.no} className="card" style={{ padding: '16px 20px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <Icon name="gavel" size={20} color="var(--slate)" />
            <div style={{ flex: '1 1 300px' }}>
              <b style={{ fontSize: 14.5 }}>{l.name}</b>
              <div className="microcopy" style={{ marginTop: 2 }}>{l.court} · No. {l.no} · filed {l.filed}</div>
            </div>
            <Chip tone={l.status === 'Briefing' ? 'med' : 'slate'}>{l.status}</Chip>
            <button className="btn btn-quiet btn-sm">Export evidentiary record (versioned scores + chain-of-custody)</button>
          </div>
        ))}
      </div>
      <p className="microcopy" style={{ marginTop: 16 }}>2 matters statewide. Every score version, finding, and survey custody event since intake is exportable as a single signed record.</p>
    </div>
  );
}

function daysUntil(iso) {
  return Math.max(0, Math.ceil((new Date(iso) - new Date('2026-06-11')) / 86400000));
}

function StudiesPage() {
  const M = window.MERA;
  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Steward — Mandated studies">
      <StewardSubNav active="studies" />
      <PageHead title="Mandated-study workbench" sub="Nearly every moratorium is a pause-to-study. The law manufactures the deadline; the workbench keeps you ahead of it." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14 }}>
        {M.STUDIES.map(st => {
          const d = daysUntil(st.due);
          return (
            <div key={st.name} className="card" style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <b style={{ fontSize: 15 }}>{st.name}</b>
                  <div className="microcopy" style={{ marginTop: 2 }}>{st.body}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className="score-serif" style={{ fontSize: 24, color: d < 40 ? '#C0392B' : 'var(--basalt)', lineHeight: 1 }}>{d}</div>
                  <div className="microcopy">days to statutory deadline</div>
                </div>
              </div>
              <div style={{ margin: '14px 0 5px', display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--slate)' }}>
                <span>{st.sections}</span><span className="score-serif">{st.progress}%</span>
              </div>
              <div className="mb-track" style={{ height: 7 }}><div className="mb-fill" style={{ width: st.progress + '%', background: 'var(--evergreen)' }}></div></div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button className="btn btn-primary btn-sm">Open workbench</button>
                <button className="btn btn-quiet btn-sm">Assign section</button>
              </div>
            </div>
          );
        })}
        <div className="card" style={{ padding: '18px 20px', borderStyle: 'dashed', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
          <b style={{ fontSize: 14 }}>Start from a template</b>
          {['Moratorium impact study — NY-style', 'Application review scorecard', 'Water-availability assessment', 'Rate-impact memorandum'].map(t => (
            <button key={t} className="btn btn-quiet btn-sm" style={{ justifyContent: 'flex-start' }}>{t}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ImpassePage, LitigationPage, StudiesPage });
