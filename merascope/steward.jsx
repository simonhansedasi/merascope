/* ── Surface C: Steward console — "The Docket" ── */

function StewardSubNav({ active }) {
  const tabs = [['docket', 'Docket', '#/steward'], ['impasse', 'Impasse register', '#/steward/impasse'], ['litigation', 'Litigation tracker', '#/steward/litigation'], ['studies', 'Mandated studies', '#/steward/studies']];
  return (
    <div className="tabs" style={{ marginBottom: 18 }}>
      {tabs.map(([k, label, href]) => (
        <button key={k} className={active === k ? 'on' : ''} onClick={() => { location.hash = href; }}>{label}</button>
      ))}
    </div>
  );
}

function PartyAvatars({ parties }) {
  const M = window.MERA;
  return (
    <span style={{ display: 'inline-flex' }}>
      {parties.map((p, i) => (
        <span key={p} title={M.PARTY_NAMES[p] || p} style={{ width: 21, height: 21, borderRadius: '50%', background: 'var(--mist)', border: '1.5px solid #fff', color: 'var(--evergreen)', fontSize: 8.5, fontWeight: 750, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: i ? -6 : 0 }}>{p}</span>
      ))}
    </span>
  );
}

function CaseCard({ k }) {
  const M = window.MERA;
  const { ramp } = React.useContext(MeraCtx);
  const openable = k.id === '26-0142';
  return (
    <div className="kcard" onClick={() => { if (openable) location.hash = '#/steward/case/26-0142'; }} data-comment-anchor={'case-' + k.id} style={{ opacity: openable ? 1 : 0.93 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span className="microcopy" style={{ fontWeight: 700 }}>Case {k.id}</span>
        <span className="dot" style={{ background: k.dot }}></span>
      </div>
      <div style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.3 }}>{k.site}</div>
      <div className="microcopy" style={{ marginTop: 1 }}>{k.applicant}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 9 }}>
        <span className="score-badge" style={{ background: M.rampColor(k.score, ramp), color: M.rampText(k.score, ramp), fontSize: 12.5 }}>{k.score.toFixed(3)}</span>
        <span className="microcopy"><span className="score-serif">{k.days}</span>d in stage</span>
        <PartyAvatars parties={k.parties} />
      </div>
      {k.resolution && <div style={{ marginTop: 8 }}><Chip tone="lo">{k.resolution}</Chip></div>}
      {openable && <div style={{ marginTop: 8, fontSize: 12, fontWeight: 650, color: 'var(--basalt)' }}>Open the record →</div>}
    </div>
  );
}

function DocketPage() {
  const M = window.MERA;
  const loading = useFakeLoad(700);
  return (
    <div style={{ maxWidth: 1340, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Steward — Docket">
      <StewardSubNav active="docket" />
      <PageHead title="The Docket" sub={<span><span className="score-serif">{M.CASES.length}</span> active case files · Dept. of Ecology — reviewer view · all findings versioned on one evidence base.</span>}
        right={<React.Fragment><button className="btn btn-ghost btn-sm">New case file</button><PromiseBadge /></React.Fragment>} />
      <div className="kanban">
        {M.STAGES.map(stage => {
          const cards = M.CASES.filter(c => c.stage === stage);
          return (
            <div key={stage} className="kcol">
              <h4>{stage} <span className="score-serif" style={{ color: 'var(--slate)' }}>{cards.length}</span></h4>
              {loading ? <div className="shimmer" style={{ height: 110 }}></div>
                : cards.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--slate)', textAlign: 'center', padding: '26px 8px', border: '1.5px dashed var(--line)', borderRadius: 8 }}>No cases in {stage.toLowerCase()}.</div>
                : cards.map(k => <CaseCard key={k.id} k={k} />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── full case file ── */
function StageStepper({ current }) {
  const M = window.MERA;
  const idx = M.STAGES.indexOf(current);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap', margin: '10px 0 2px' }}>
      {M.STAGES.map((s, i) => (
        <React.Fragment key={s}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: i === idx ? 'var(--basalt)' : i < idx ? 'var(--evergreen)' : 'var(--slate)', whiteSpace: 'nowrap' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: i === idx ? 'var(--basalt)' : i < idx ? 'var(--evergreen)' : 'var(--line)', display: 'inline-block' }}></span>
            {s}
          </span>
          {i < M.STAGES.length - 1 && <span style={{ width: 22, height: 1.5, background: i < idx ? 'var(--evergreen)' : 'var(--line)', margin: '0 6px' }}></span>}
        </React.Fragment>
      ))}
    </div>
  );
}

const COND_TONE = { 'Accepted': 'lo', 'Under review': 'med', 'Countered': 'med', 'Proposed': 'slate', 'Impasse': 'hi' };

function CaseFilePage() {
  const M = window.MERA;
  const C = M.CASE_DETAIL;
  const { ramp } = React.useContext(MeraCtx);
  return (
    <div style={{ maxWidth: 1340, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Steward — Case file">
      <a href="#/steward" style={{ fontSize: 13, fontWeight: 650, textDecoration: 'none' }}>← Back to the Docket</a>
      <div className="card" style={{ marginTop: 12, padding: '18px 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="eyebrow">Case {C.id}</div>
            <h2 style={{ fontSize: 23 }}>{C.title}</h2>
            <div className="microcopy">Applicant: {C.applicant} · Lead agency: Dept. of Ecology</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="score-badge" style={{ background: M.rampColor(C.score, ramp), color: M.rampText(C.score, ramp), fontSize: 22, padding: '4px 13px' }}>{C.score.toFixed(3)}</span>
            <div className="microcopy" style={{ marginTop: 3 }}>composite · public weights</div>
          </div>
        </div>
        <StageStepper current={C.stage} />
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* findings */}
        <div style={{ flex: '1 1 300px', minWidth: 290 }}>
          <h3 style={{ fontSize: 15, marginBottom: 9 }}>Findings <span className="microcopy" style={{ fontWeight: 400 }}>· versioned, shared with all co-parties</span></h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {C.findings.map(f => (
              <div key={f.k} className="card" style={{ padding: '10px 13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <b style={{ fontSize: 13.5 }}>{f.k}</b>
                  <span className="score-serif" style={{ fontSize: 17, color: parseFloat(f.v) < 0.1 ? '#C0392B' : 'var(--ink)' }}>{f.v}</span>
                </div>
                <div className="microcopy" style={{ margin: '3px 0 6px' }}>{f.evidence}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Chip tone="slate">{f.ver}</Chip>
                  {f.contested && <Chip tone="hi">contested</Chip>}
                  <a href="#/methodology" style={{ fontSize: 12, marginLeft: 'auto', fontWeight: 650 }}>evidence →</a>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* conditions negotiation */}
        <div style={{ flex: '2.2 1 460px', minWidth: 380 }}>
          <h3 style={{ fontSize: 15, marginBottom: 9 }}>Conditions negotiation</h3>
          <div className="card" style={{ overflow: 'auto' }}>
            <table className="mtable">
              <thead><tr><th>Condition</th><th>Proposed by</th><th>Type</th><th>Status</th></tr></thead>
              <tbody>
                {C.conditions.map(c => (
                  <tr key={c.text}>
                    <td style={{ fontWeight: 600, fontSize: 13.5, maxWidth: 300 }}>{c.text}</td>
                    <td style={{ fontSize: 13 }}>{c.by}</td>
                    <td><Chip tone="mist">{c.type}</Chip></td>
                    <td><Chip tone={COND_TONE[c.status] || 'slate'}>{c.status}</Chip></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary btn-sm">Propose condition</button>
            <button className="btn btn-quiet btn-sm">Export conditions record</button>
          </div>
        </div>

        {/* right rail */}
        <div style={{ flex: '1 1 260px', minWidth: 250, display: 'grid', gap: 12 }}>
          <div className="callout" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <Icon name="clock" size={17} color="var(--basalt)" />
              <b style={{ fontSize: 13, letterSpacing: '.06em', textTransform: 'uppercase' }}>Rebuttal clock</b>
            </div>
            <div style={{ fontSize: 14 }}>Applicant response due in <span className="score-serif" style={{ fontSize: 22, color: 'var(--basalt)' }}>{C.daysToRebuttal}</span> days</div>
            <div className="microcopy" style={{ marginTop: 3 }}>Cycle 2 of 3 · time-boxed by rule</div>
          </div>
          <div className="panel" style={{ padding: '14px 16px' }}>
            <b style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--slate)' }}>Co-party tracker</b>
            <div style={{ display: 'grid', gap: 7, marginTop: 9, fontSize: 13 }}>
              {[['CTUIR', 'Consultation: meeting held 5/22 — written response pending', 'med'],
                ['Walla Walla County', 'Findings v2 acknowledged', 'lo'],
                ['Franklin PUD', 'Rate impact memo filed', 'lo'],
                ['Attorney General', 'Observer status', 'slate'],
                ['Serving utility', 'Interconnection study shared', 'lo']].map(([p, s, tone]) => (
                <div key={p} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Chip tone={tone} style={{ flexShrink: 0 }}>{p}</Chip>
                  <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>{s}</span>
                </div>
              ))}
            </div>
            <p className="microcopy" style={{ margin: '9px 0 0' }}>Tribal governments are sovereign consultation parties, not stakeholders.</p>
          </div>
          <div className="card" style={{ padding: '14px 16px' }}>
            <b style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--slate)' }}>Document chain</b>
            <div style={{ display: 'grid', gap: 6, marginTop: 9 }}>
              {C.docs.map(d => (
                <div key={d.name} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <Icon name="doc" size={14} color="var(--slate)" />
                  <span style={{ flex: 1 }}>{d.name}</span>
                  <span className="microcopy">{d.date}</span>
                </div>
              ))}
            </div>
            <button className="btn btn-quiet btn-xs" style={{ marginTop: 10, width: '100%' }}>Export evidentiary record</button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DocketPage, CaseFilePage, StewardSubNav, StageStepper });
