/* ── Surface C: Steward console — "The Docket" ── */

function StewardSubNav({ active }) {
  const tabs = [['docket', 'Docket', '#/steward'], ['templates', 'Weight templates', '#/steward/templates'], ['impasse', 'Impasse register', '#/steward/impasse'], ['litigation', 'Litigation tracker', '#/steward/litigation'], ['studies', 'Mandated studies', '#/steward/studies']];
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
  const hasDetail = !!(M.CASE_DETAIL_MAP && M.CASE_DETAIL_MAP[k.id]);
  const openable = hasDetail || !!k._dynamic;
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

var DOCKET_LIMIT = 50;

function _shapeDynamic(c) {
  return { id: c.case_id, site: c.site, applicant: c.applicant, score: c.score, stage: c.stage || 'Site Inquiry', dot: '#888', days: c.days || 0, parties: [], resolution: null, _dynamic: true };
}

function _agencyLabel(authUser) {
  const M = window.MERA;
  if (!authUser || !authUser.agency_key) return 'Lead Agency';
  var entry = (M.AGENCY_DIRECTORY || []).find(function(a) { return a.key === authUser.agency_key; });
  return entry ? entry.name : authUser.agency_key;
}

function DocketPage() {
  const M = window.MERA;
  const { authUser, demoActive, readOnly } = React.useContext(AuthCtx);
  const loading = useFakeLoad(700);
  const [dynamicCases, setDynamicCases] = React.useState([]);
  const [total, setTotal] = React.useState(0);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [showNewCase, setShowNewCase] = React.useState(false);
  const [newDraft, setNewDraft] = React.useState({ site: '', applicant: '', score: 0.5 });
  const [stageOverrides, setStageOverrides] = React.useState({});

  var fetchCases = function(offset, append) {
    return fetch('/api/cases?limit=' + DOCKET_LIMIT + '&offset=' + offset)
      .then(function(r) { return r.json(); })
      .then(function(d) {
        var shaped = (d.cases || []).map(_shapeDynamic);
        setTotal(d.total || 0);
        if (append) { setDynamicCases(function(prev) { return prev.concat(shaped); }); }
        else { setDynamicCases(shaped); }
      });
  };

  React.useEffect(function() {
    if (demoActive) {
      fetch('/api/demo/cases')
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(d) {
          var shaped = (d ? (d.cases || []) : []).map(_shapeDynamic);
          setDynamicCases(shaped);
          setTotal(shaped.length);
        });
      return;
    }
    fetchCases(0, false);
    var detailIds = Object.keys(M.CASE_DETAIL_MAP || {});
    Promise.all(detailIds.map(function(cid) {
      return fetch('/api/case/' + cid + '/stage').then(function(r) { return r.json(); }).then(function(s) { return [cid, s]; });
    })).then(function(pairs) {
      var map = {};
      pairs.forEach(function(p) { if (p[1]) map[p[0]] = p[1]; });
      setStageOverrides(map);
    });
  }, [demoActive]);

  var loadMore = function() {
    setLoadingMore(true);
    fetchCases(dynamicCases.length, true).finally(function() { setLoadingMore(false); });
  };

  var createCase = function() {
    if (!newDraft.site.trim() || !newDraft.applicant.trim()) return;
    fetch('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newDraft)
    }).then(function(r) { return r.json(); }).then(function(res) {
      if (!res.ok) return;
      setDynamicCases(function(prev) {
        return prev.concat([{ id: res.case_id, site: newDraft.site, applicant: newDraft.applicant, score: newDraft.score, stage: 'Site Inquiry', dot: '#888', days: 0, parties: [], resolution: null, _dynamic: true }]);
      });
      setTotal(function(n) { return n + 1; });
      setNewDraft({ site: '', applicant: '', score: 0.5 });
      setShowNewCase(false);
    });
  };

  const demoCases = authUser ? [] : M.CASES.map(c => stageOverrides[c.id] ? Object.assign({}, c, { stage: stageOverrides[c.id] }) : c);
  const allCases = [...demoCases, ...dynamicCases];

  return (
    <div style={{ maxWidth: 1340, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Steward — Docket">
      {showNewCase && (
        <div onClick={() => setShowNewCase(false)}
          style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 800, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--mist)', borderRadius: 12, padding: '22px 24px', width: 420, maxWidth: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.5)', border: '1px solid var(--line)' }}>
            <b style={{ fontSize: 16 }}>New case file</b>
            <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
              <input placeholder="Site name" value={newDraft.site}
                onChange={e => setNewDraft(d => Object.assign({}, d, { site: e.target.value }))}
                style={{ padding: '8px 11px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--sand)', color: 'inherit', fontSize: 13, fontFamily: 'inherit' }} />
              <input placeholder="Applicant" value={newDraft.applicant}
                onChange={e => setNewDraft(d => Object.assign({}, d, { applicant: e.target.value }))}
                style={{ padding: '8px 11px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--sand)', color: 'inherit', fontSize: 13, fontFamily: 'inherit' }} />
              <div>
                <div style={{ fontSize: 12, color: 'var(--slate)', marginBottom: 4 }}>Site composite score: <span className="score-serif">{newDraft.score.toFixed(3)}</span></div>
                <input type="range" min="0" max="1" step="0.001" value={newDraft.score}
                  onChange={e => setNewDraft(d => Object.assign({}, d, { score: parseFloat(e.target.value) }))}
                  style={{ width: '100%' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button className="btn btn-primary btn-sm" onClick={createCase}>Create case</button>
                <button className="btn btn-quiet btn-sm" onClick={() => setShowNewCase(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <StewardSubNav active="docket" />
      {demoActive && (
        <div style={{ background: 'rgba(255,180,0,0.07)', border: '1.5px solid var(--amber)', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13.5, color: 'var(--amber)' }}>
          <b>Demo mode</b> — this is what your agency contact sees when you submit a site inquiry. <a href="#/login" style={{ color: 'var(--basalt)', fontWeight: 600 }}>Sign in</a> for a live account. Demo data resets every 20 minutes.
        </div>
      )}
      {readOnly && (
        <div style={{ marginBottom: 14, padding: '8px 14px', background: 'var(--sand)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, color: 'var(--slate)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="lock" size={14} color="var(--slate)" />
          <span>Admin view — read only. All agency cases are visible; no changes can be made.</span>
        </div>
      )}
      <PageHead title="The Docket"
        sub={<span><span className="score-serif">{allCases.length}</span>{total > dynamicCases.length ? ' of ' + (M.CASES.length + total) : ''} active cases · {demoActive ? 'Demo Agency' : readOnly ? 'All agencies' : _agencyLabel(authUser)} · findings versioned from intake.</span>}
        right={(demoActive || readOnly) ? null : <React.Fragment><button className="btn btn-ghost btn-sm" onClick={() => setShowNewCase(true)}>New case file</button><PromiseBadge /></React.Fragment>} />
      <div className="kanban">
        {M.STAGES.map(function(stage) {
          var cards = allCases.filter(function(c) { return c.stage === stage; });
          return (
            <div key={stage} className="kcol">
              <h4>{stage} <span className="score-serif" style={{ color: 'var(--slate)' }}>{cards.length}</span></h4>
              {loading ? <div className="shimmer" style={{ height: 110 }}></div>
                : cards.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--slate)', textAlign: 'center', padding: '26px 8px', border: '1.5px dashed var(--line)', borderRadius: 8 }}>No cases in {stage.toLowerCase()}.</div>
                : cards.map(function(k) { return <CaseCard key={k.id} k={k} />; })}
            </div>
          );
        })}
      </div>
      {dynamicCases.length < total && (
        <div style={{ textAlign: 'center', padding: '18px 0 4px' }}>
          <button className="btn btn-quiet btn-sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading...' : 'Load more (' + (total - dynamicCases.length) + ' remaining)'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── full case file ── */
function StageStepper({ current, onStageClick }) {
  const M = window.MERA;
  const idx = M.STAGES.indexOf(current);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap', margin: '10px 0 2px' }}>
      {M.STAGES.map((s, i) => (
        <React.Fragment key={s}>
          <span onClick={() => onStageClick && onStageClick(s)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: i === idx ? 'var(--basalt)' : i < idx ? 'var(--evergreen)' : 'var(--slate)', whiteSpace: 'nowrap', cursor: onStageClick ? 'pointer' : 'default' }}>
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
  const isDynamic = !(M.CASE_DETAIL_MAP && M.CASE_DETAIL_MAP[id]);
  const C = isDynamic ? M.CASE_DETAIL : M.CASE_DETAIL_MAP[id];
  const { ramp } = React.useContext(MeraCtx);
  const { role, partyKey, authUser, readOnly } = React.useContext(AuthCtx);
  const isLead = role === 'steward' && !readOnly;
  const isCoParty = role === 'co-party';

  const partyName = (() => {
    if (!isCoParty || !partyKey) return null;
    const found = (window.DEMO_CO_PARTIES || []).find(p => p.key === partyKey);
    return found ? found.name : partyKey;
  })();

  const [conditions, setConditions] = React.useState([]);
  const [showForm, setShowForm] = React.useState(false);
  const [draft, setDraft] = React.useState({ text: '', type: 'Water' });
  const [toast, setToast] = React.useState(null);
  const [showInvite, setShowInvite] = React.useState(false);
  const [dirSearch, setDirSearch] = React.useState('');
  const [dirType, setDirType] = React.useState('all');
  const [dirState, setDirState] = React.useState('all');
  const [serverInvited, setServerInvited] = React.useState([]);
  const [serverDocs, setServerDocs] = React.useState([]);
  const [deadline, setDeadline] = React.useState(null);
  const fileInputRef = React.useRef(null);
  const [caseStage, setCaseStage] = React.useState(C.stage);
  const [serverRebuttals, setServerRebuttals] = React.useState([]);
  const [dynCase, setDynCase] = React.useState(null);
  const [dynLoading, setDynLoading] = React.useState(isDynamic);
  const [trackingInput, setTrackingInput] = React.useState('');
  const [confirming, setConfirming] = React.useState(false);
  const [caseStudies, setCaseStudies] = React.useState([]);
  const [mandateForm, setMandateForm] = React.useState(false);
  const [mandateTemplate, setMandateTemplate] = React.useState('Water-availability assessment');
  const MANDATE_TEMPLATES = ['Moratorium impact study — NY-style', 'Application review scorecard', 'Water-availability assessment', 'Rate-impact memorandum'];

  var handleConfirm = function() {
    setConfirming(true);
    fetch('/api/builder/case/' + id + '/confirm', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agency_tracking_id: trackingInput.trim() }),
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.ok) {
          setDynCase(function(prev) {
            return Object.assign({}, prev, {
              agency_tracking_id: data.agency_tracking_id,
              confirmed_at: data.confirmed_at,
              stage: 'Intake'
            });
          });
          setToast('Case confirmed. Record is now active.');
        }
      })
      .finally(function() { setConfirming(false); });
  };

  const notify = msg => { setToast(msg); };

  const refreshDocs = () =>
    fetch('/api/case/' + id + '/docs').then(r => r.json()).then(setServerDocs);

  const uploadDoc = e => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fetch('/api/case/' + id + '/docs', { method: 'POST', body: fd })
      .then(r => r.json())
      .then(() => { refreshDocs(); notify('Document uploaded'); });
    e.target.value = '';
  };

  const setRebuttalDeadline = due => {
    fetch('/api/case/' + id + '/deadline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ due_date: due, cycle: deadline ? deadline.cycle : 1, max_cycles: 3 })
    }).then(() =>
      fetch('/api/case/' + id + '/deadline').then(r => r.json()).then(d => { if (d) setDeadline(d); })
    );
  };

  const advanceStage = stage => {
    var stageUrl = isDemo ? '/api/demo/case/' + id + '/stage' : '/api/case/' + id + '/stage';
    fetch(stageUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage })
    });
    setCaseStage(stage);
    notify('Stage updated to ' + stage);
  };

  React.useEffect(() => {
    setShowForm(false);
    setDraft({ text: '', type: 'Water' });
    setServerInvited([]);
    setServerDocs([]);
    setDeadline(null);
    setCaseStage(C.stage);
    setServerRebuttals([]);

    if ((id || '').startsWith('demo-')) return;

    fetch('/api/case/' + id + '/conditions')
      .then(r => r.json())
      .then(list => {
        if (!isDynamic && list.length === 0 && C.conditions.length > 0) {
          return Promise.all(C.conditions.map(c =>
            fetch('/api/case/' + id + '/conditions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: c.text, by: c.by, type: c.type, status: c.status,
                submitted_by_role: c.submittedByRole || 'lead',
                pending_approval: c.pendingApproval ? 1 : 0
              })
            }).then(r => r.json())
          )).then(results =>
            C.conditions.map((c, i) => Object.assign({}, c, { id: results[i].id, pendingApproval: !!c.pendingApproval }))
          );
        }
        return list.map(r => Object.assign({}, r, { pendingApproval: !!r.pending_approval }));
      })
      .then(setConditions);

    fetch('/api/case/' + id + '/invites').then(r => r.json()).then(setServerInvited);
    fetch('/api/case/' + id + '/docs').then(r => r.json()).then(setServerDocs);
    fetch('/api/case/' + id + '/deadline').then(r => r.json()).then(d => { if (d) setDeadline(d); });
    fetch('/api/case/' + id + '/stage').then(r => r.json()).then(s => { if (s) setCaseStage(s); });
    fetch('/api/case/' + id + '/rebuttals').then(r => r.json()).then(setServerRebuttals);
    fetch('/api/studies?case_id=' + id).then(r => r.json()).then(setCaseStudies);
  }, [id]);

  React.useEffect(() => {
    if (!isDynamic) return;
    setDynLoading(true);
    var url = (id || '').startsWith('demo-') ? '/api/demo/case/' + id : '/api/builder/case/' + id;
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setDynCase(data && data.case_id ? data : null); })
      .finally(() => setDynLoading(false));
  }, [id]);

  const submitCondition = () => {
    if (!draft.text.trim()) return;
    const by = isCoParty ? (partyName || 'Co-party') : _agencyLabel(authUser);
    const payload = {
      text: draft.text.trim(), by, type: draft.type, status: 'Proposed',
      submitted_by_role: isCoParty ? 'co-party' : 'lead',
      pending_approval: isCoParty ? 1 : 0
    };
    fetch('/api/case/' + id + '/conditions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(r => r.json()).then(res => {
      setConditions(prev => [...prev, Object.assign({}, payload, { id: res.id, pendingApproval: isCoParty })]);
      setDraft({ text: '', type: 'Water' });
      setShowForm(false);
      notify(isCoParty ? 'Sent to lead agency for review' : 'Co-parties notified');
    });
  };

  const mandateStudy = function() {
    const due = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
    fetch('/api/studies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: mandateTemplate, case_id: id, body: 'Mandated', due })
    }).then(r => r.json()).then(function(res) {
      if (res.ok) {
        setCaseStudies(ss => [...ss, { id: res.id, name: mandateTemplate, body: 'Mandated', due }]);
        setMandateForm(false);
        notify('Study mandated — 180-day deadline set.');
      }
    });
  };

  const approvePending = (condId) => {
    fetch('/api/case/' + id + '/conditions/' + condId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approve: true })
    });
    setConditions(prev => prev.map(c => c.id === condId ? Object.assign({}, c, { pendingApproval: false, status: 'Proposed' }) : c));
    notify('Condition approved — co-parties notified');
  };

  const rejectPending = (condId) => {
    fetch('/api/case/' + id + '/conditions/' + condId, { method: 'DELETE' });
    setConditions(prev => prev.filter(c => c.id !== condId));
    notify('Condition returned to co-party');
  };

  const changeStatus = (condId, status) => {
    fetch('/api/case/' + id + '/conditions/' + condId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    setConditions(prev => prev.map(c => c.id === condId ? Object.assign({}, c, { status }) : c));
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
  const isInvited = key => (C.invitedParties || []).includes(key) || serverInvited.includes(key);
  const inviteFromDir = agency => {
    if (isInvited(agency.key)) return;
    fetch('/api/case/' + id + '/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agency_key: agency.key })
    });
    setServerInvited(prev => [...prev, agency.key]);
    notify('Invite sent to ' + agency.name);
  };
  const dirQ = dirSearch.trim().toLowerCase();
  const filteredDir = (M.AGENCY_DIRECTORY || []).filter(function(a) {
    if (dirType !== 'all' && a.type !== dirType) return false;
    if (dirState !== 'all' && a.type !== 'federal' && a.state !== dirState) return false;
    if (dirQ && a.name.toLowerCase().indexOf(dirQ) === -1) return false;
    return true;
  });
  var ALL_STATES = ['AL','AR','AZ','CA','CO','CT','DE','FL','GA','IA','ID','IL','IN','KS','KY','LA','MA','MD','ME','MI','MN','MO','MS','MT','NC','ND','NE','NH','NJ','NM','NV','NY','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VA','VT','WA','WI','WV','WY'];
  const onCaseNames = [
    ...(C.invitedParties || []).map(k => {
      const d = (M.AGENCY_DIRECTORY || []).find(a => a.key === k);
      return d ? d.name : (M.PARTY_NAMES[k] || k);
    }),
    ...serverInvited.map(k => {
      const d = (M.AGENCY_DIRECTORY || []).find(a => a.key === k);
      return d ? d.name : k;
    })
  ];
  const allInvited = [...new Set([...(C.invitedParties || []), ...serverInvited])];
  const coParties = allInvited.length > 0
    ? allInvited.map(key => {
        const agency = (M.AGENCY_DIRECTORY || []).find(a => a.key === key);
        const name = agency ? agency.name : (M.PARTY_NAMES[key] || key);
        const theirConds = conditions.filter(c => c.by === name);
        const pending = theirConds.filter(c => c.pendingApproval).length;
        const total = theirConds.length;
        let status, tone;
        if (pending > 0) { status = pending + ' condition' + (pending > 1 ? 's' : '') + ' pending approval'; tone = 'med'; }
        else if (total > 0) { status = total + ' condition' + (total > 1 ? 's' : '') + ' proposed'; tone = 'lo'; }
        else { status = 'Invited'; tone = 'slate'; }
        return [name, status, tone];
      })
    : (C.coParties || []);
  const backHref = isCoParty ? '#/co-party' : '#/steward';
  const backLabel = isCoParty ? 'Back to My Cases' : 'Back to the Docket';

  /* ── dynamic (builder-submitted) case intake view ── */
  if (isDynamic) {
    if (dynLoading) {
      return (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px', color: 'var(--slate)' }}>
          Loading case...
        </div>
      );
    }
    if (!dynCase) {
      return (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>
          <a href="#/steward" className="btn btn-quiet btn-sm">Back to Docket</a>
          <h2 style={{ marginTop: 20 }}>Case not found</h2>
          <p style={{ color: 'var(--slate)' }}>No record found for case ID {id}.</p>
        </div>
      );
    }
    const dc = dynCase;
    const isDemo = (id || '').startsWith('demo-');
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Steward -- Intake case">
        {toast && <NotifyToast message={toast} onDone={() => setToast(null)} />}
        <a href="#/steward" className="btn btn-quiet btn-sm" style={{ marginBottom: 16, display: 'inline-block' }}>Back to Docket</a>

        {isDemo ? (
          <div className="callout" style={{ padding: '12px 16px', marginBottom: 16, background: 'rgba(255,180,0,0.07)', border: '1.5px solid var(--amber)', borderRadius: 8 }}>
            <div style={{ fontSize: 13.5, color: 'var(--amber)' }}>
              <b>Demo mode</b> — this is your agency's view of the submission. No record was created. <a href="#/login" style={{ color: 'var(--basalt)', fontWeight: 600 }}>Sign in</a> to file a real inquiry.
            </div>
          </div>
        ) : (
          <div className="callout" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--med-bg)', border: '1px solid var(--med-tx)' }}>
            <div style={{ fontSize: 13.5, color: 'var(--med-tx)' }}>
              {dc.imported
                ? <span><b>Builder-registered permit.</b> The applicant has brought an existing permitting pipeline into Merascope. Review their documents and advance the stage to formally open the case.</span>
                : <span><b>New site inquiry received.</b> Review the submission and advance the stage to formally open the case.</span>}
            </div>
          </div>
        )}

        <div className="card" style={{ padding: '18px 22px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div className="eyebrow">Case {dc.case_id}</div>
              <h2 style={{ fontSize: 22 }}>{dc.site}</h2>
              <div className="microcopy">
                Applicant: {dc.applicant}
                {dc.lead_agency ? ' · Lead agency: ' + (_agencyLabel({ agency_key: dc.lead_agency })) : ''}
                {' · Stage: '}<b>{dc.stage || 'Site Inquiry'}</b>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="score-badge" style={{ background: M.rampColor(dc.score || 0.5, ramp), color: M.rampText(dc.score || 0.5, ramp), fontSize: 22, padding: '4px 13px' }}>{(dc.score || 0.5).toFixed(3)}</span>
              <div className="microcopy" style={{ marginTop: 3 }}>composite score</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }}>
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>Contact</div>
            <div style={{ fontWeight: 650 }}>{dc.contact_name || '—'}</div>
            <div style={{ fontSize: 12.5, color: 'var(--slate)' }}>{dc.contact_email || ''}</div>
          </div>
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>Submitted</div>
            <div style={{ fontWeight: 650 }}>{dc.ts ? dc.ts.substring(0, 10) : '—'}</div>
          </div>
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>Location</div>
            <div style={{ fontWeight: 650 }}>{dc.state_code || '—'}</div>
            {dc.lat != null && <div style={{ fontSize: 12, color: 'var(--slate)', fontFamily: 'monospace' }}>{Number(dc.lat).toFixed(3) + 'N ' + Math.abs(Number(dc.lon)).toFixed(3) + 'W'}</div>}
          </div>
        </div>

        {dc.notes && (
          <div className="card" style={{ padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>Notes from builder</div>
            <div style={{ fontSize: 13.5 }}>{dc.notes}</div>
          </div>
        )}

        {dc.external_permit_id && (
          <div className="card" style={{ padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>External permit / application ID</div>
            <div style={{ fontWeight: 650, fontSize: 14, fontFamily: 'monospace' }}>{dc.external_permit_id}</div>
          </div>
        )}

        <DocSection caseId={dc.case_id} />

        <div style={{ marginTop: 20, display: 'grid', gap: 12 }}>
          {!isDemo && (dc.confirmed_at ? (
            <div className="card" style={{ padding: '14px 16px', background: 'var(--lo-bg)', border: '1px solid var(--lo-tx)' }}>
              <div style={{ fontSize: 11, color: 'var(--lo-tx)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4, fontWeight: 700 }}>Case confirmed</div>
              {dc.agency_tracking_id && (
                <div style={{ fontWeight: 650, fontSize: 14, fontFamily: 'monospace', color: 'var(--ink)' }}>{dc.agency_tracking_id}</div>
              )}
              <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 2 }}>{dc.confirmed_at ? dc.confirmed_at.substring(0, 10) : ''}</div>
            </div>
          ) : (
            <div className="card" style={{ padding: '16px 20px' }}>
              <b style={{ fontSize: 14 }}>Confirm case &amp; assign tracking number</b>
              <p className="microcopy" style={{ margin: '4px 0 12px', lineHeight: 1.5 }}>
                Confirming formally opens the record and moves the case to Intake. The applicant will see your agency tracking number in their case view.
              </p>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="text" value={trackingInput}
                  placeholder="Your agency tracking number (optional)"
                  onChange={function(e) { setTrackingInput(e.target.value); }}
                  style={{ flex: 1, minWidth: 220, padding: '8px 10px', borderRadius: 7, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 13.5, fontFamily: 'inherit' }} />
                <button className="btn btn-primary" onClick={handleConfirm} disabled={confirming}>
                  {confirming ? 'Confirming...' : 'Confirm case'}
                </button>
              </div>
            </div>
          ))}

          <div className="card" style={{ padding: '16px 20px' }}>
            <b style={{ fontSize: 14 }}>Advance stage</b>
            <p className="microcopy" style={{ margin: '4px 0 10px' }}>Each stage advance updates the case record and notifies all parties.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {M.STAGES.filter(function(s) { return s !== (dc.stage || 'Site Inquiry'); }).map(function(s) {
                return (
                  <button key={s} className="btn btn-quiet btn-sm" onClick={() => advanceStage(s)}>Move to {s}</button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

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
              <select value={dirState} onChange={e => setDirState(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--sand)', fontSize: 13, fontFamily: 'inherit', color: 'inherit', cursor: 'pointer' }}>
                <option value="all">All states</option>
                {ALL_STATES.map(function(s) { return <option key={s} value={s}>{s}</option>; })}
              </select>
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
            <div className="microcopy">Applicant: {C.applicant} · Lead agency: {C.leadParty || _agencyLabel(authUser)}
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
        <StageStepper current={caseStage} onStageClick={isLead ? advanceStage : null} />
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
                  <a href={"#/evidence?case=" + C.id} style={{ fontSize: 12, marginLeft: 'auto', fontWeight: 650 }}>Evidence</a>
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
                  <tr key={c.id || i} style={{ background: c.pendingApproval ? 'rgba(180,95,29,0.05)' : undefined }}>
                    <td style={{ fontWeight: 600, fontSize: 13.5, maxWidth: 300 }}>{c.text}</td>
                    <td style={{ fontSize: 13 }}>{c.by}</td>
                    <td><Chip tone="mist">{c.type}</Chip></td>
                    <td>
                      {c.pendingApproval
                        ? <Chip tone="med">Pending lead approval</Chip>
                        : isLead
                          ? <select value={c.status} onChange={e => changeStatus(c.id, e.target.value)}
                              style={{ fontSize: 12.5, padding: '3px 6px', borderRadius: 5, border: '1px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontFamily: 'inherit' }}>
                              {['Proposed', 'Under review', 'Countered', 'Accepted', 'Impasse'].map(s => <option key={s}>{s}</option>)}
                            </select>
                          : <Chip tone={COND_TONE[c.status] || 'slate'}>{c.status}</Chip>}
                    </td>
                    {isLead && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {c.pendingApproval && (
                          <span style={{ display: 'inline-flex', gap: 5 }}>
                            <button className="btn btn-primary btn-xs" onClick={() => approvePending(c.id)}>Approve</button>
                            <button className="btn btn-quiet btn-xs" onClick={() => rejectPending(c.id)}>Reject</button>
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
                style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={draft.type} onChange={e => { const v = e.target.value; setDraft(d => Object.assign({}, d, { type: v })); }}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 13 }}>
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
            {!readOnly && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowForm(s => !s)}>
                {showForm ? 'Cancel' : 'Propose condition'}
              </button>
            )}
            <button className="btn btn-quiet btn-sm" onClick={exportConditions}>Export conditions record</button>
          </div>
        </div>

        {/* right rail */}
        <div style={{ flex: '1 1 260px', minWidth: 250, display: 'grid', gap: 12 }}>
          {(deadline != null || C.daysToRebuttal != null || isLead) && (
            <div className="callout" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <Icon name="clock" size={17} color="var(--basalt)" />
                <b style={{ fontSize: 13, letterSpacing: '.06em', textTransform: 'uppercase' }}>Rebuttal clock</b>
              </div>
              {(deadline != null || C.daysToRebuttal != null) ? (
                <React.Fragment>
                  <div style={{ fontSize: 14 }}>Applicant response due in <span className="score-serif" style={{ fontSize: 22, color: 'var(--basalt)' }}>{deadline ? deadline.days : C.daysToRebuttal}</span> days</div>
                  <div className="microcopy" style={{ marginTop: 3 }}>Cycle {deadline ? deadline.cycle : 2} of {deadline ? deadline.max_cycles : 3} · time-boxed by rule · applicant can see this</div>
                </React.Fragment>
              ) : (
                <div className="microcopy">No deadline set.</div>
              )}
              {isLead && (
                <div style={{ marginTop: 8 }}>
                  <input type="date" onChange={e => e.target.value && setRebuttalDeadline(e.target.value)}
                    style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--sand)', color: 'inherit', fontSize: 12, fontFamily: 'inherit' }} />
                  <div className="microcopy" style={{ marginTop: 3 }}>Set or update deadline</div>
                </div>
              )}
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
              {[...C.docs, ...serverDocs].map((d, i) => (
                <div key={d.id || d.name || i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <Icon name="doc" size={14} color="var(--slate)" />
                  {d.filename
                    ? <a href={'/api/case/' + id + '/docs/' + d.filename} target="_blank" style={{ flex: 1, color: 'inherit' }}>{d.name}</a>
                    : <span style={{ flex: 1 }}>{d.name}</span>}
                  <span className="microcopy">{d.date}</span>
                </div>
              ))}
            </div>
            {serverRebuttals.map(r => (
              <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
                <Icon name="doc" size={14} color="var(--slate)" />
                <span style={{ flex: 1, fontStyle: 'italic' }} title={r.text}>Applicant rebuttal</span>
                <span className="microcopy">{r.ts ? r.ts.slice(0, 10) : ''}</span>
              </div>
            ))}
            {isLead && (
              <React.Fragment>
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={uploadDoc} />
                <button className="btn btn-quiet btn-xs" style={{ marginTop: 8, width: '100%' }}
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}>
                  Upload document
                </button>
              </React.Fragment>
            )}
            <button className="btn btn-quiet btn-xs" style={{ marginTop: 6, width: '100%' }} onClick={exportEvidentiary}>Export evidentiary record</button>
          </div>

          {isLead && !isDemo && (
            <div className="panel" style={{ padding: '14px 16px' }}>
              <b style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--slate)' }}>Mandated studies</b>
              {caseStudies.length > 0 && (
                <div style={{ display: 'grid', gap: 8, marginTop: 9 }}>
                  {caseStudies.map(function(s) {
                    var days = Math.round((new Date(s.due) - Date.now()) / 86400000);
                    return (
                      <div key={s.id}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                        <div className="microcopy" style={{ color: days < 30 ? '#C0392B' : 'var(--slate)' }}>{days} days to deadline</div>
                      </div>
                    );
                  })}
                </div>
              )}
              {mandateForm ? (
                <div style={{ marginTop: 10, display: 'grid', gap: 7 }}>
                  <select value={mandateTemplate} onChange={e => setMandateTemplate(e.target.value)}
                    style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--sand)', color: 'inherit', fontSize: 12, fontFamily: 'inherit' }}>
                    {MANDATE_TEMPLATES.map(t => <option key={t}>{t}</option>)}
                  </select>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-primary btn-xs" onClick={mandateStudy}>Mandate</button>
                    <button className="btn btn-quiet btn-xs" onClick={() => setMandateForm(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-quiet btn-xs" style={{ marginTop: caseStudies.length > 0 ? 10 : 9, width: '100%' }} onClick={() => setMandateForm(true)}>+ Mandate a study</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DocketPage, CaseFilePage, StewardSubNav, StageStepper });
