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
  const openable = !!(M.CASE_DETAIL_MAP && M.CASE_DETAIL_MAP[k.id]);
  return (
    <div className="kcard" onClick={() => { if (openable) location.hash = '#/steward/case/' + k.id; }}
      title={openable ? '' : 'Demo — full record available for case 26-0142'}
      style={{ cursor: openable ? 'pointer' : 'default' }}>
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
      {openable
        ? <div style={{ marginTop: 8, fontSize: 12, fontWeight: 650, color: 'var(--basalt)' }}>Open the record →</div>
        : <div style={{ marginTop: 8, fontSize: 11, color: 'var(--slate)' }}>Demo preview</div>}
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
const COND_TYPES = ['Water', 'Grid', 'Community', 'Environmental', 'Heat reuse', 'Economic'];

function CaseFilePage({ id }) {
  const M = window.MERA;
  const C = (M.CASE_DETAIL_MAP && M.CASE_DETAIL_MAP[id]) || M.CASE_DETAIL;
  const { ramp } = React.useContext(MeraCtx);
  const { role, partyKey } = React.useContext(AuthCtx);
  const isLead = role === 'steward';
  const isCoParty = role === 'co-party';

  const partyName = (() => {
    if (!isCoParty || !partyKey) return null;
    const found = (window.DEMO_CO_PARTIES || []).find(p => p.key === partyKey);
    return found ? found.name : partyKey;
  })();

  const [conditions, setConditions] = React.useState(C.conditions);
  const [showForm, setShowForm] = React.useState(false);
  const [draft, setDraft] = React.useState({ text: '', type: 'Water' });
  const [toast, setToast] = React.useState(null);
  const [showInvite, setShowInvite] = React.useState(false);
  const [dirSearch, setDirSearch] = React.useState('');
  const [dirType, setDirType] = React.useState('all');
  const [sessionInvited, setSessionInvited] = React.useState([]);

  React.useEffect(() => {
    setConditions(C.conditions);
    setShowForm(false);
    setDraft({ text: '', type: 'Water' });
  }, [id]);

  const notify = msg => { setToast(msg); };

  const submitCondition = () => {
    if (!draft.text.trim()) return;
    const by = isCoParty ? (partyName || 'Co-party') : 'Dept. of Ecology';
    const newCond = { text: draft.text.trim(), by, type: draft.type, status: 'Proposed', submittedByRole: isCoParty ? 'co-party' : 'lead', pendingApproval: isCoParty };
    setConditions(prev => [...prev, newCond]);
    setDraft({ text: '', type: 'Water' });
    setShowForm(false);
    notify(isCoParty ? 'Sent to lead agency for review' : 'Co-parties notified');
  };

  const approvePending = (idx) => {
    setConditions(prev => prev.map((c, i) => i === idx ? Object.assign({}, c, { pendingApproval: false, status: 'Proposed' }) : c));
    notify('Condition approved — co-parties notified');
  };

  const rejectPending = (idx) => {
    setConditions(prev => prev.filter((_, i) => i !== idx));
    notify('Condition returned to co-party');
  };

  const exportConditions = () => {
    const rows = [
      ['condition', 'proposed_by', 'type', 'status', 'pending_approval'].join(','),
      ...conditions.map(c => [c.text, c.by, c.type, c.status, c.pendingApproval ? 'yes' : 'no'].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','))
    ];
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows.join('\n'));
    a.download = 'conditions_' + C.id + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const exportEvidentiary = () => {
    const lines = [
      '=== MERASCOPE EVIDENTIARY RECORD ===',
      'Case: ' + C.id + ' | ' + C.title,
      'Applicant: ' + C.applicant + ' | Score: ' + C.score.toFixed(3) + ' | Stage: ' + C.stage,
      'Exported: ' + new Date().toISOString(),
      '', 'FINDINGS', 'indicator,value,evidence,version,contested',
      ...C.findings.map(f => [f.k, f.v, f.evidence, f.ver, f.contested ? 'yes' : 'no'].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')),
      '', 'CONDITIONS', 'condition,proposed_by,type,status',
      ...conditions.map(c => [c.text, c.by, c.type, c.status].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')),
      '', 'DOCUMENT CHAIN', 'document,date',
      ...C.docs.map(d => [d.name, d.date].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','))
    ];
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(lines.join('\n'));
    a.download = 'evidentiary_record_' + C.id + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const TYPE_TONE = { state: 'lo', county: 'slate', tribe: 'med', utility: 'mist', federal: 'hi' };
  const TYPE_LABEL = { state: 'State', county: 'County', tribe: 'Tribe', utility: 'Utility', federal: 'Federal' };
  const isInvited = key => (C.invitedParties || []).includes(key) || sessionInvited.includes(key);
  const inviteFromDir = agency => {
    if (isInvited(agency.key)) return;
    setSessionInvited(prev => [...prev, agency.key]);
    notify('Invite sent to ' + agency.name);
  };
  const dirQ = dirSearch.trim().toLowerCase();
  const filteredDir = (M.AGENCY_DIRECTORY || []).filter(a => {
    if (dirType !== 'all' && a.type !== dirType) return false;
    if (dirQ && a.name.toLowerCase().indexOf(dirQ) === -1) return false;
    return true;
  });
  const onCaseNames = [
    ...(C.invitedParties || []).map(k => {
      const d = (M.AGENCY_DIRECTORY || []).find(a => a.key === k);
      return d ? d.name : (M.PARTY_NAMES[k] || k);
    }),
    ...sessionInvited.map(k => {
      const d = (M.AGENCY_DIRECTORY || []).find(a => a.key === k);
      return d ? d.name : k;
    })
  ];
  const coParties = C.coParties || [];
  const backHref = isCoParty ? '#/co-party' : '#/steward';
  const backLabel = isCoParty ? 'Back to My Cases' : 'Back to the Docket';

  return (
    <div style={{ maxWidth: 1340, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Steward — Case file">
      {toast && <NotifyToast message={toast} onDone={() => setToast(null)} />}
      {showInvite && isLead && (
        <div onClick={() => setShowInvite(false)}
          style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 800, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--mist)', borderRadius: 12, padding: '22px 24px', width: 560, maxWidth: '100%', maxHeight: '82vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.5)', border: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <b style={{ fontSize: 16 }}>Invite co-parties</b>
                <div className="microcopy" style={{ marginTop: 2 }}>Case {C.id} - {onCaseNames.length} agenc{onCaseNames.length === 1 ? 'y' : 'ies'} currently on this case</div>
              </div>
              <button className="btn btn-quiet btn-xs" onClick={() => setShowInvite(false)}>Close</button>
            </div>
            {onCaseNames.length > 0 && (
              <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--line)' }}>
                <div className="eyebrow" style={{ marginBottom: 7 }}>Currently on this case</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {onCaseNames.map((name, i) => <Chip key={i} tone="lo">{name}</Chip>)}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input type="text" placeholder="Search registered agencies..." value={dirSearch}
                onChange={e => setDirSearch(e.target.value)}
                style={{ flex: 1, padding: '7px 11px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--sand)', fontSize: 13, fontFamily: 'inherit', color: 'inherit' }} />
            </div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
              {['all', 'state', 'county', 'tribe', 'utility', 'federal'].map(t => (
                <button key={t} className={'btn btn-xs ' + (dirType === t ? 'btn-primary' : 'btn-quiet')}
                  onClick={() => setDirType(t)}>
                  {t === 'all' ? 'All types' : TYPE_LABEL[t]}
                </button>
              ))}
            </div>
            <div className="microcopy" style={{ marginBottom: 6 }}>
              {filteredDir.length} of {(M.AGENCY_DIRECTORY || []).length} agencies
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gap: 3 }}>
              {filteredDir.map(agency => {
                const already = isInvited(agency.key);
                return (
                  <div key={agency.key}
                    style={{ display: 'flex', alignItems: 'center', padding: '7px 10px', borderRadius: 7, background: already ? 'var(--sand)' : undefined, gap: 10 }}>
                    <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: already ? 'var(--slate)' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agency.name}</span>
                    <Chip tone={TYPE_TONE[agency.type] || 'slate'}>{TYPE_LABEL[agency.type] || agency.type}</Chip>
                    {already
                      ? <span style={{ fontSize: 12, color: 'var(--evergreen)', fontWeight: 700, flexShrink: 0, minWidth: 52, textAlign: 'right' }}>On case</span>
                      : <button className="btn btn-primary btn-xs" style={{ flexShrink: 0 }} onClick={() => inviteFromDir(agency)}>Invite</button>}
                  </div>
                );
              })}
              {filteredDir.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--slate)' }}>
                  <div style={{ fontSize: 14 }}>No agencies match your search.</div>
                  <div className="microcopy">Try the email option below for unregistered entities.</div>
                </div>
              )}
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="email" placeholder="Not listed? Invite by email..."
                style={{ flex: 1, padding: '7px 11px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--sand)', fontSize: 13, fontFamily: 'inherit', color: 'inherit' }} />
              <button className="btn btn-ghost btn-xs" onClick={() => notify('Invite email queued')}>Send</button>
            </div>
          </div>
        </div>
      )}
      <a href={backHref} style={{ fontSize: 13, fontWeight: 650, textDecoration: 'none' }}>{backLabel}</a>
      <div className="card" style={{ marginTop: 12, padding: '18px 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="eyebrow">Case {C.id}</div>
            <h2 style={{ fontSize: 23 }}>{C.title}</h2>
            <div className="microcopy">Applicant: {C.applicant} · Lead agency: {C.leadParty || 'Dept. of Ecology'}
              {isCoParty && partyName && <span> · Viewing as: <b>{partyName}</b></span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {isLead && (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowInvite(v => !v)}>Invite co-parties</button>
            )}
            <div style={{ textAlign: 'right' }}>
              <span className="score-badge" style={{ background: M.rampColor(C.score, ramp), color: M.rampText(C.score, ramp), fontSize: 22, padding: '4px 13px' }}>{C.score.toFixed(3)}</span>
              <div className="microcopy" style={{ marginTop: 3 }}>composite · public weights</div>
            </div>
          </div>
        </div>
        <StageStepper current={C.stage} />
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* findings */}
        <div style={{ flex: '1 1 300px', minWidth: 290 }}>
          <h3 style={{ fontSize: 15, marginBottom: 9 }}>Findings <span className="microcopy" style={{ fontWeight: 400 }}>· versioned, shared with all parties</span></h3>
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
                  <a href="#/methodology" style={{ fontSize: 12, marginLeft: 'auto', fontWeight: 650 }}>evidence</a>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* conditions */}
        <div style={{ flex: '2.2 1 460px', minWidth: 380 }}>
          <h3 style={{ fontSize: 15, marginBottom: 9 }}>Conditions negotiation</h3>
          <div className="card" style={{ overflow: 'auto' }}>
            <table className="mtable">
              <thead>
                <tr>
                  <th>Condition</th><th>Proposed by</th><th>Type</th><th>Status</th>
                  {isLead && <th></th>}
                </tr>
              </thead>
              <tbody>
                {conditions.map((c, i) => (
                  <tr key={i} style={{ background: c.pendingApproval ? 'rgba(180,95,29,0.05)' : undefined }}>
                    <td style={{ fontWeight: 600, fontSize: 13.5, maxWidth: 300 }}>{c.text}</td>
                    <td style={{ fontSize: 13 }}>{c.by}</td>
                    <td><Chip tone="mist">{c.type}</Chip></td>
                    <td>
                      {c.pendingApproval
                        ? <Chip tone="med">Pending lead approval</Chip>
                        : <Chip tone={COND_TONE[c.status] || 'slate'}>{c.status}</Chip>}
                    </td>
                    {isLead && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {c.pendingApproval && (
                          <span style={{ display: 'inline-flex', gap: 5 }}>
                            <button className="btn btn-primary btn-xs" onClick={() => approvePending(i)}>Approve</button>
                            <button className="btn btn-quiet btn-xs" onClick={() => rejectPending(i)}>Reject</button>
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {showForm && (
            <div style={{ display: 'grid', gap: 8, marginTop: 10, padding: '12px 14px', background: 'var(--sand)', borderRadius: 8 }}>
              <textarea placeholder="Describe the proposed condition..." value={draft.text} rows={3}
                onChange={e => { const v = e.target.value; setDraft(d => Object.assign({}, d, { text: v })); }}
                style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', color: 'inherit', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={draft.type} onChange={e => { const v = e.target.value; setDraft(d => Object.assign({}, d, { type: v })); }}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', color: 'inherit', fontSize: 13 }}>
                  {COND_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
                <span className="microcopy">Proposed by: <b>{isCoParty ? (partyName || 'Co-party') : 'Dept. of Ecology'}</b></span>
              </div>
              <button className="btn btn-primary btn-sm" onClick={submitCondition}>
                {isCoParty ? 'Submit to lead for review' : 'Add condition'}
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setShowForm(s => !s)}>
              {showForm ? 'Cancel' : 'Propose condition'}
            </button>
            <button className="btn btn-quiet btn-sm" onClick={exportConditions}>Export conditions record</button>
          </div>
        </div>

        {/* right rail */}
        <div style={{ flex: '1 1 260px', minWidth: 250, display: 'grid', gap: 12 }}>
          {C.daysToRebuttal != null && (
            <div className="callout" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <Icon name="clock" size={17} color="var(--basalt)" />
                <b style={{ fontSize: 13, letterSpacing: '.06em', textTransform: 'uppercase' }}>Rebuttal clock</b>
              </div>
              <div style={{ fontSize: 14 }}>Applicant response due in <span className="score-serif" style={{ fontSize: 22, color: 'var(--basalt)' }}>{C.daysToRebuttal}</span> days</div>
              <div className="microcopy" style={{ marginTop: 3 }}>Cycle 2 of 3 · time-boxed by rule · applicant can see this</div>
            </div>
          )}
          {coParties.length > 0 && (
            <div className="panel" style={{ padding: '14px 16px' }}>
              <b style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--slate)' }}>Co-party tracker</b>
              <div style={{ display: 'grid', gap: 7, marginTop: 9, fontSize: 13 }}>
                {coParties.map(([p, s, tone]) => (
                  <div key={p} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <Chip tone={tone} style={{ flexShrink: 0 }}>{p}</Chip>
                    <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>{s}</span>
                  </div>
                ))}
              </div>
              {C.id === '26-0142' && <p className="microcopy" style={{ margin: '9px 0 0' }}>Tribal governments are sovereign consultation parties, not stakeholders.</p>}
            </div>
          )}
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
            <button className="btn btn-quiet btn-xs" style={{ marginTop: 10, width: '100%' }} onClick={exportEvidentiary}>Export evidentiary record</button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DocketPage, CaseFilePage, StewardSubNav, StageStepper });
