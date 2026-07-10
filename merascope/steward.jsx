/* ── Surface C: Steward console — "The Docket" ── */

/*
 * steward.jsx — the core Steward-facing module: the case docket, the full
 * case-file record, and the conditions-negotiation workflow that runs inside
 * a case file. This is the largest and most central of the four steward.*
 * files, and the other three build on top of what's defined here:
 *   - steward-inbox.jsx reuses CaseCard and _shapeDynamic from this file to
 *     render a triage view over the same case data.
 *   - steward2.jsx (impasse register, litigation tracker, mandated studies)
 *     and steward-templates.jsx (weight templates/zone gating) are separate
 *     concerns that a steward navigates to via StewardSubNav, defined here.
 * A case moves through the stages listed in M.STAGES (Site Inquiry -> Intake
 * -> Analysis -> Findings Exchange -> Negotiation -> Rebuttal Cycle ->
 * Mediation -> Resolution); DocketPage shows the whole caseload as a kanban
 * board across those stages, and CaseFilePage is the drill-down record for
 * one case, including the conditions each party proposes/approves/appeals
 * during Negotiation. Cases here come in two flavors depending on whether
 * they're server-persisted rows (real cases, "_dynamic: true") or hardcoded
 * fixture/demo cases (M.CASES / M.CASE_DETAIL_MAP in data.js, including the
 * showcase EXAMPLE case demo-EX-0001) — most components below branch on that
 * distinction to decide whether to hit the API or read from static data.
 */

/* Inbox urgent-count cache — one fetch per steward page mount, 60s TTL */
// Module-level (not React state) so it survives across every steward page's
// mount/unmount as the user navigates the tabs in StewardSubNav — without this,
// switching from Docket to Templates and back would re-fetch the inbox count
// every time just to show a badge number. ts is a Date.now() timestamp; a
// fetch is only issued if more than 60s have elapsed since the last one.
var _inboxCountCache = { n: null, ts: 0 };

// Tab bar shown at the top of every steward page (Docket, Inbox, Impasse
// register, etc.) — renders the active tab highlighted and, for the Inbox
// tab specifically, a small red badge showing how many cases need urgent
// attention (overdue + brand-new inquiries), sourced from the same
// /api/steward/inbox endpoint InboxPage itself uses.
function StewardSubNav({ active }) {
  const tabs = [['inbox', 'Inbox', '#/steward/inbox'], ['docket', 'Docket', '#/steward'], ['bulk-import', 'Bulk import', '#/steward/bulk-import'], ['templates', 'Weight templates', '#/steward/templates'], ['impasse', 'Impasse register', '#/steward/impasse'], ['litigation', 'Litigation tracker', '#/steward/litigation'], ['studies', 'Mandated studies', '#/steward/studies']];
  const [inboxCount, setInboxCount] = React.useState(_inboxCountCache.n);
  React.useEffect(function() {
    // Cache hit: reuse the value from the last fetch (by any steward page)
    // instead of hitting the network again.
    if (Date.now() - _inboxCountCache.ts < 60000) { setInboxCount(_inboxCountCache.n); return; }
    fetch('/api/steward/inbox')
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(d) {
        var n = d ? ((d.overdue || []).length + (d.new_inquiries || []).length) : null;
        _inboxCountCache = { n: n, ts: Date.now() };
        setInboxCount(n);
      })
      .catch(function() {});
  }, []);
  return (
    <div className="tabs" style={{ marginBottom: 18 }}>
      {tabs.map(([k, label, href]) => (
        <button key={k} className={active === k ? 'on' : ''} onClick={() => { location.hash = href; }}>
          {label}
          {k === 'inbox' && inboxCount > 0 && (
            <span style={{ marginLeft: 6, padding: '1px 7px', borderRadius: 9, background: 'var(--basalt)', color: '#fff', fontSize: 11, fontWeight: 700 }}>{inboxCount}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// Small overlapping circular "avatar" chips, one per party abbreviation (e.g.
// lead agency, co-parties, builder) shown on a CaseCard so a steward can see
// at a glance who's involved without opening the case.
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

// A single case's kanban card — used by DocketPage (the full board) and
// steward-inbox.jsx's InboxBucket (the triage view). Takes a pre-shaped `k`
// object (see _shapeDynamic below for the dynamic-case version; fixture cases
// in data.js are already in this shape) rather than a raw case row, so this
// component doesn't need to know whether the underlying case is a real
// server row or a hardcoded demo/fixture.
function CaseCard({ k }) {
  const M = window.MERA;
  const { ramp } = React.useContext(MeraCtx);
  // Only cases with a full record available are clickable: either a fixture
  // case with an entry in CASE_DETAIL_MAP, or any dynamic (server-backed)
  // case, which always has a full record by definition. Non-openable cards
  // are demo placeholders — e.g. background "extra" cases shown for visual
  // density on the docket that don't correspond to a real record.
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
        <span className="microcopy"><span className="score-serif">{Math.abs(k.days)}</span>{k.dayLabel || 'd in stage'}</span>
        <PartyAvatars parties={k.parties} />
      </div>
      {k.is_example && <div style={{ marginTop: 7 }}><Chip tone="med">EXAMPLE</Chip></div>}
      {k.resolution && <div style={{ marginTop: 6 }}><Chip tone="lo">{k.resolution}</Chip></div>}
      {openable
        ? <div style={{ marginTop: 8, fontSize: 12, fontWeight: 650, color: 'var(--basalt)' }}>Open the record →</div>
        : <div style={{ marginTop: 8, fontSize: 11, color: 'var(--slate)' }}>Demo preview</div>}
    </div>
  );
}

// Page size for the paginated /api/cases fetch — DocketPage's "Load more"
// button requests another DOCKET_LIMIT rows starting at the current offset.
var DOCKET_LIMIT = 50;

// Converts one raw case row from the server (/api/cases, /api/demo/cases) into
// the flat shape CaseCard expects. Real case field names (case_id) get
// remapped to the fixture-case field names (id) so CaseCard can treat dynamic
// and fixture cases identically; parties/resolution aren't returned by the
// list endpoint so they're stubbed empty/null here (only the full case-file
// fetch in CaseFilePage has that detail). steward-inbox.jsx wraps this
// function directly for its own row shaping.
function _shapeDynamic(c) {
  return { id: c.case_id, site: c.site, applicant: c.applicant, score: c.score, stage: c.stage || 'Site Inquiry', dot: '#888', days: c.days || 0, parties: [], resolution: null, _dynamic: true };
}

// Resolves the signed-in steward's agency_key (e.g. "wa_ecy") to its
// human-readable name via M.AGENCY_DIRECTORY, for display in headers/labels.
// Falls back to the raw key if the agency isn't found in the directory, and
// to a generic "Lead Agency" if there's no authenticated user at all (demo mode).
function _agencyLabel(authUser) {
  const M = window.MERA;
  if (!authUser || !authUser.agency_key) return 'Lead Agency';
  var entry = (M.AGENCY_DIRECTORY || []).find(function(a) { return a.key === authUser.agency_key; });
  return entry ? entry.name : authUser.agency_key;
}

// The Docket — a kanban board of every case the signed-in steward's agency is
// the lead on, grouped by stage. Handles three overlapping data sources: (1)
// hardcoded EXAMPLE fixture cases from data.js (always shown unless the user
// dismisses them via hideExample), (2) hardcoded demo cases (shown only when
// there's no authenticated user), and (3) real server-persisted cases fetched
// from /api/cases with pagination. This is the landing page for the Steward
// persona, routed at #/steward.
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
  const [hideExample, setHideExample] = React.useState(function() { try { return !!localStorage.getItem('mera_hide_example'); } catch(e) { return false; } });

  // Fetches one page of real (server-persisted) cases. `append` distinguishes
  // the initial load (replace dynamicCases entirely) from "Load more" clicks
  // (append onto the existing list) — both share this one function so the
  // shaping/total-tracking logic isn't duplicated.
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
    // Demo mode (unauthenticated visitor clicking through a live demo, scoped
    // by a random browser session id) has its own endpoint and its own case
    // set entirely — skip the normal paginated fetch and stage-override fetch
    // below, since demo cases aren't part of any real agency's docket.
    if (demoActive) {
      fetch('/api/demo/cases?session=' + (window.MERA_SESSION || ''))
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(d) {
          var shaped = (d ? (d.cases || []) : []).map(_shapeDynamic);
          setDynamicCases(shaped);
          setTotal(shaped.length);
        });
      return;
    }
    fetchCases(0, false);
    // The hardcoded fixture cases in M.CASES ship with a fixed `stage` value,
    // but some of them (e.g. the EXAMPLE case) can actually be advanced by a
    // user clicking through the demo, with the real current stage tracked
    // server-side. This fetches the live stage for every fixture case with a
    // full detail record and stores overrides so the docket reflects reality
    // instead of the static default.
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

  // Creates a brand-new case via POST, then optimistically appends the new
  // card to dynamicCases locally (rather than re-fetching the whole page)
  // so it shows up in the board immediately.
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

  // The board's full case list is a merge of three sources: the EXAMPLE
  // showcase case(s) (hideable via the "hide example" toggle, persisted to
  // localStorage), other hardcoded demo cases (only shown to anonymous
  // visitors — once a real steward is signed in, `authUser` is set and these
  // are dropped since they'd be confusing clutter on a real agency's board),
  // and the real dynamicCases fetched from the server. Both fixture arrays
  // apply any live stageOverrides fetched above so an advanced EXAMPLE case
  // shows its true current stage rather than its static default.
  const exampleCases = hideExample ? [] : (M.CASES || []).filter(function(c) { return c.is_example; }).map(function(c) { return stageOverrides[c.id] ? Object.assign({}, c, { stage: stageOverrides[c.id] }) : c; });
  const demoCases = authUser ? [] : (M.CASES || []).filter(function(c) { return !c.is_example; }).map(function(c) { return stageOverrides[c.id] ? Object.assign({}, c, { stage: stageOverrides[c.id] }) : c; });
  const allCases = [...exampleCases, ...demoCases, ...dynamicCases];

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
      {!hideExample && exampleCases.length > 0 && (
        <div style={{ marginBottom: 14, padding: '10px 16px', background: 'rgba(255,200,0,0.07)', border: '1.5px solid #F0C040', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Chip tone="med">EXAMPLE</Chip>
          <span style={{ flex: 1, fontSize: 13.5 }}>An example completed case is shown in the <b>Resolution</b> column — use it as a reference for the full steward workflow.</span>
          <button className="btn btn-quiet btn-xs" onClick={() => location.hash = '#/steward/case/demo-EX-0001'}>Open record</button>
          <button className="btn btn-quiet btn-xs" onClick={() => { setHideExample(true); try { localStorage.setItem('mera_hide_example', '1'); } catch(e) {} }}>Hide example</button>
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
// Horizontal progress dots across the top of a case file showing every stage
// in M.STAGES, with the current stage highlighted, completed stages in
// evergreen, and future stages muted. If onStageClick is passed (lead
// steward only — see advanceStage below), clicking a dot jumps the case
// directly to that stage rather than only advancing one step at a time.
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

// Chip color ("tone") per condition status, used wherever a condition's
// status badge is rendered. 'hi' (high/alert) for Impasse deliberately stands
// out — those are the conditions that need routing to steward2.jsx's
// ImpassePage.
const COND_TONE = { 'Accepted': 'lo', 'Under review': 'med', 'Countered': 'med', 'Proposed': 'slate', 'Impasse': 'hi' };
// Fixed taxonomy of condition categories a party can attach to a proposed
// condition (water rights, grid capacity, community benefit, etc.) — purely a
// UI classification, not tied to the scoring indicators.
const COND_TYPES = ['Water', 'Grid', 'Community', 'Environmental', 'Heat reuse', 'Economic'];

// The full case-file record for one case — by far the largest component in
// the app. Renders differently depending on `isDynamic` (see below): a real,
// server-persisted case fetches its data live and supports the full
// negotiation workflow (propose/approve/counter conditions, invite co-parties,
// upload docs, advance stages, mandate studies, export evidentiary record); a
// static fixture/demo case (including the EXAMPLE case) reads from the
// hardcoded M.CASE_DETAIL_MAP and simulates most of the same interactions
// client-side without hitting real endpoints. Routed at #/steward/case/:id
// (and reused, read-only, for builder/co-party views of the same case).
function CaseFilePage({ id }) {
  const M = window.MERA;
  // isDynamic is true whenever `id` does NOT have a hardcoded fixture entry —
  // i.e. it's a real case created through the app rather than one of the
  // static demo/EXAMPLE records baked into data.js. This is the master
  // switch nearly every branch below keys off. Note this is distinct from
  // `isDemo` (declared further down): isDemo specifically flags the
  // EXAMPLE showcase case among the *static* ones, whereas isDynamic
  // separates static fixtures from real server data altogether.
  const isDynamic = !(M.CASE_DETAIL_MAP && M.CASE_DETAIL_MAP[id]);
  const C = isDynamic ? M.CASE_DETAIL : M.CASE_DETAIL_MAP[id];
  const { ramp } = React.useContext(MeraCtx);
  const { role, partyKey, authUser, readOnly } = React.useContext(AuthCtx);
  // Permission flags used throughout the render to gate which controls show:
  // only a signed-in lead steward (not a read-only admin view) gets full
  // write access; a co-party can propose but not unilaterally decide.
  const isLead = role === 'steward' && !readOnly;
  const isCoParty = role === 'co-party';

  // Resolves a co-party's display name from their partyKey (e.g. "wa_doe")
  // via the demo co-party directory, for display in headers/attributions.
  const partyName = (() => {
    if (!isCoParty || !partyKey) return null;
    const found = (window.DEMO_CO_PARTIES || []).find(p => p.key === partyKey);
    return found ? found.name : partyKey;
  })();

  // Seed conditions state from the static fixture ONLY for demo-prefixed
  // static cases (e.g. the EXAMPLE case) that ship with pre-populated
  // conditions — other static/dynamic cases start empty and get their real
  // conditions from the server fetch in the useEffect below.
  const [conditions, setConditions] = React.useState(function() { return (C && !isDynamic && (id || '').startsWith('demo-') && C.conditions) ? C.conditions : []; });
  const [showForm, setShowForm] = React.useState(false);
  const [draft, setDraft] = React.useState({ text: '', type: 'Water' });
  const [toast, setToast] = React.useState(null);
  const [showInvite, setShowInvite] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState('');
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
  const [caseStudies, setCaseStudies] = React.useState(function() { return (C && !isDynamic && (id || '').startsWith('demo-') && C.studies) ? C.studies : []; });
  const [nearbyCases, setNearbyCases] = React.useState([]);
  const [mandateForm, setMandateForm] = React.useState(false);
  const [mandateTemplate, setMandateTemplate] = React.useState('Water-availability assessment');
  const MANDATE_TEMPLATES = ['Moratorium impact study — NY-style', 'Application review scorecard', 'Water-availability assessment', 'Rate-impact memorandum'];

  // Builder-side action (despite living in this steward file — this component
  // is shared/reused for the builder's read view of their own case) that
  // confirms a Site Inquiry with an agency tracking id, which is what moves
  // the case from Site Inquiry into Intake.
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

  // Shared toast-message setter used by nearly every handler below to give
  // the user feedback after an async action completes (e.g. "Stage updated",
  // "Document uploaded").
  const notify = msg => { setToast(msg); };

  const refreshDocs = () =>
    fetch('/api/case/' + id + '/docs').then(r => r.json()).then(setServerDocs);

  // Uploads a single file (from the hidden file input, see fileInputRef) as
  // multipart form data, then re-fetches the doc list so the new upload shows
  // up immediately.
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

  // Sets (or updates) the deadline for the current rebuttal cycle. Caps at 3
  // cycles max (hardcoded here, mirrored server-side) — cycle number is
  // preserved from the existing deadline record if one is already set, since
  // this can be called again just to change the due date without starting a
  // new cycle. Re-fetches the deadline afterward rather than trusting the
  // POST's own response, to pick up any server-side normalization.
  const setRebuttalDeadline = due => {
    fetch('/api/case/' + id + '/deadline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ due_date: due, cycle: deadline ? deadline.cycle : 1, max_cycles: 3 })
    }).then(() =>
      fetch('/api/case/' + id + '/deadline').then(r => r.json()).then(d => { if (d) setDeadline(d); })
    );
  };

  // Lead-steward-only control (see isLead) that moves the case to a new
  // stage — either the next stage in sequence, or any stage directly via
  // StageStepper's clickable dots. `isDemo` here (declared later in this
  // function body via `const`, before any handler can actually be invoked by
  // a real click — see the note on isDynamic above; this is the same
  // pattern CLAUDE.md flags as a past bug source, so treat this ordering as
  // load-bearing, not incidental) picks a demo-scoped endpoint that doesn't
  // require auth, versus the real per-case endpoint. On reaching Resolution
  // for a dynamic case, re-fetches the full case record — that's when the
  // server computes and stores the record's cryptographic anchor hash, so the
  // UI needs the fresh data to show it.
  const advanceStage = stage => {
    var stageUrl = isDemo ? '/api/demo/case/' + id + '/stage' : '/api/case/' + id + '/stage';
    fetch(stageUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage })
    }).then(function() {
      if (stage === 'Resolution' && isDynamic) {
        var caseUrl = (id || '').startsWith('demo-') ? '/api/demo/case/' + id : '/api/builder/case/' + id;
        fetch(caseUrl).then(r => r.ok ? r.json() : null).then(data => {
          if (data && data.case_id) setDynCase(data);
        });
      }
    });
    setCaseStage(stage);
    notify('Stage updated to ' + stage);
  };

  // First of two data-loading effects, keyed on `id` so it re-runs whenever
  // the user navigates to a different case. Resets all per-case local state
  // first (important when navigating case A -> case B without a full page
  // reload, so B doesn't briefly show A's stale data), then — unless this is
  // a static demo-prefixed case, which has nothing to fetch — pulls nearby
  // cases, conditions, invites, docs, deadline, stage, rebuttals, and studies
  // from the server in parallel.
  React.useEffect(() => {
    setShowForm(false);
    setDraft({ text: '', type: 'Water' });
    setServerInvited([]);
    setServerDocs([]);
    setDeadline(null);
    setCaseStage(C.stage);
    setServerRebuttals([]);
    setNearbyCases([]);

    if ((id || '').startsWith('demo-')) return;

    fetch('/api/case/' + id + '/nearby').then(r => r.ok ? r.json() : []).then(setNearbyCases);

    fetch('/api/case/' + id + '/conditions')
      .then(r => r.json())
      .then(list => {
        // One-time seeding: if this is a static fixture case whose server-side
        // conditions table is still empty (first time anyone's opened this
        // case file since the DB was reset/created) but the hardcoded fixture
        // has starter conditions defined, POST each one to the server so it
        // becomes a real, persisted, editable record from here on — rather
        // than the fixture data staying purely client-side and un-actionable.
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

  // Second effect, only relevant for dynamic (real) cases: fetches the full
  // builder-facing case record (agency tracking id, confirmation status,
  // site metadata) separately from the conditions/docs/etc fetched above,
  // since this data comes from a different endpoint shape (demo vs builder
  // case endpoint depending on id prefix, same pattern as advanceStage).
  React.useEffect(() => {
    if (!isDynamic) return;
    setDynLoading(true);
    var url = (id || '').startsWith('demo-') ? '/api/demo/case/' + id : '/api/builder/case/' + id;
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setDynCase(data && data.case_id ? data : null); })
      .finally(() => setDynLoading(false));
  }, [id]);

  // Adds a new proposed condition. Who it's attributed to and whether it
  // needs approval both depend on the submitter's role: a co-party's
  // conditions are marked pending_approval and routed to the lead steward for
  // review before taking effect, while the lead steward's own conditions go
  // live immediately (no approval step needed — they ARE the approver).
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

  // Commissions a new mandated study attached to this case, using one of the
  // canned MANDATE_TEMPLATES as the study's name/starting checklist (see
  // STUDY_SECTIONS in steward2.jsx for what those checklists actually
  // contain). Always sets a fixed 180-day due date from today — there's no
  // custom deadline picker for mandated studies.
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

  // Lead-steward-only: approves a co-party's pending condition, flipping it
  // from pendingApproval to a normal 'Proposed' condition now visible/binding
  // like any lead-submitted one. Updates local state optimistically rather
  // than waiting on the PATCH response.
  const approvePending = (condId) => {
    fetch('/api/case/' + id + '/conditions/' + condId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approve: true })
    });
    setConditions(prev => prev.map(c => c.id === condId ? Object.assign({}, c, { pendingApproval: false, status: 'Proposed' }) : c));
    notify('Condition approved — co-parties notified');
  };

  // Rejects (deletes) a co-party's pending condition outright — it never
  // becomes visible to other parties, and disappears from the co-party's own
  // view too (there's no "rejected" status kept around, it's just removed).
  const rejectPending = (condId) => {
    fetch('/api/case/' + id + '/conditions/' + condId, { method: 'DELETE' });
    setConditions(prev => prev.filter(c => c.id !== condId));
    notify('Condition returned to co-party');
  };

  // Generic status transition (e.g. Proposed -> Accepted, Countered ->
  // Impasse) available to whoever has permission to change it in the render
  // below. An Impasse status is what makes a condition show up in
  // steward2.jsx's ImpassePage.
  const changeStatus = (condId, status) => {
    fetch('/api/case/' + id + '/conditions/' + condId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    setConditions(prev => prev.map(c => c.id === condId ? Object.assign({}, c, { status }) : c));
  };

  // Builds a CSV of just this case's conditions and triggers a client-side
  // download via a data: URI anchor click (no server round-trip — the CSV is
  // assembled entirely from already-loaded state).
  const exportConditions = () => {
    const rows = [
      ['condition', 'proposed_by', 'type', 'status', 'pending_approval'].join(','),
      ...conditions.map(c => [c.text, c.by, c.type, c.status, c.pendingApproval ? 'yes' : 'no'].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','))
    ];
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows.join('\n'));
    a.download = 'conditions_' + id + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // Builds the fuller "evidentiary record" export — findings (with their
  // evidence/version/contested flags), conditions, and the document chain
  // combined into one CSV-ish plaintext file. This is a client-side
  // convenience export distinct from the server-computed cryptographic
  // anchor (case_anchors table) — this file's contents are NOT what gets
  // hashed for anchoring, it's just a human-readable snapshot.
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

  // Display tone/label lookups for the agency-type badge shown next to each
  // party in the invite directory (state/county/tribe/utility/federal).
  const TYPE_TONE = { state: 'lo', county: 'slate', tribe: 'med', utility: 'mist', federal: 'hi' };
  const TYPE_LABEL = { state: 'State', county: 'County', tribe: 'Tribe', utility: 'Utility', federal: 'Federal' };
  /* Dynamic cases must not inherit the fixture's invited parties */
  const fixtureInvited = isDynamic ? [] : (C.invitedParties || []);
  const isInvited = key => fixtureInvited.includes(key) || serverInvited.includes(key);
  // Invites an agency picked from the directory list (as opposed to
  // inviteByEmail below, for ad-hoc invites outside the known directory).
  // Guards against re-inviting an already-invited party.
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
  // Ad-hoc invite by raw email address — for co-parties not in the known
  // AGENCY_DIRECTORY. Minimal client-side validation (just checks for an "@");
  // real validation happens server-side.
  const inviteByEmail = function() {
    var email = inviteEmail.trim().toLowerCase();
    if (!email || email.indexOf('@') === -1) { notify('Enter a valid email address'); return; }
    if (serverInvited.includes(email)) { notify('Already invited'); return; }
    fetch('/api/case/' + id + '/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email })
    }).then(function(r) { return r.json(); }).then(function(res) {
      if (res.ok) {
        setServerInvited(function(prev) { return [...prev, email]; });
        setInviteEmail('');
        notify('Invite sent to ' + email);
      } else {
        notify(res.err || 'Invite failed');
      }
    }).catch(function() { notify('Network error — invite not sent'); });
  };
  // Filters the full agency directory (used in the invite modal) by
  // free-text search, agency type, and state — federal agencies are exempt
  // from the state filter since they aren't state-scoped.
  const dirQ = dirSearch.trim().toLowerCase();
  const filteredDir = (M.AGENCY_DIRECTORY || []).filter(function(a) {
    if (dirType !== 'all' && a.type !== dirType) return false;
    if (dirState !== 'all' && a.type !== 'federal' && a.state !== dirState) return false;
    if (dirQ && a.name.toLowerCase().indexOf(dirQ) === -1) return false;
    return true;
  });
  var ALL_STATES = ['AL','AR','AZ','CA','CO','CT','DE','FL','GA','IA','ID','IL','IN','KS','KY','LA','MA','MD','ME','MI','MN','MO','MS','MT','NC','ND','NE','NH','NJ','NM','NV','NY','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VA','VT','WA','WI','WV','WY'];
  // Human-readable names for everyone currently on the case (fixture +
  // server-invited), resolved through the directory where possible.
  const onCaseNames = [
    ...fixtureInvited.map(k => {
      const d = (M.AGENCY_DIRECTORY || []).find(a => a.key === k);
      return d ? d.name : (M.PARTY_NAMES[k] || k);
    }),
    ...serverInvited.map(k => {
      const d = (M.AGENCY_DIRECTORY || []).find(a => a.key === k);
      return d ? d.name : k;
    })
  ];
  // De-duplicated combined invite list (a Set guards against the same key
  // appearing in both fixtureInvited and serverInvited), then each invited
  // party is enriched with a live status derived from their conditions: how
  // many are still pending lead approval vs. already proposed, or just
  // "Invited" if they haven't proposed anything yet.
  const allInvited = [...new Set([...fixtureInvited, ...serverInvited])];
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
    : (isDynamic ? [] : (C.coParties || []));
  const backHref = isCoParty ? '#/co-party' : '#/steward';
  const backLabel = isCoParty ? 'Back to My Cases' : 'Back to the Docket';
  // The demo-case flag referenced earlier by advanceStage (and used again
  // below) — true only for dynamic cases whose id is demo-prefixed, i.e.
  // cases created through the public, no-login demo flow rather than a real
  // authenticated agency's docket. Declared here, after its first use in
  // advanceStage above: safe only because `const` bindings in a function body
  // are all set before any user-triggered handler actually runs — see the
  // note on advanceStage. Do not rely on this ordering pattern elsewhere.
  const isDemo = isDynamic && (id || '').startsWith('demo-');
  const caseLinkPrefix = isCoParty ? '#/co-party/case/' : '#/steward/case/';
  const fallbackRebuttalDays = isDynamic ? null : C.daysToRebuttal;

  /* ── shared panels — rendered by BOTH the dynamic and fixture branches.
     Hoisted as JSX variables (not components) so they close over the same
     state/handlers with no props plumbing. ── */

  const nearbyPanel = nearbyCases.length > 0 && (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>
        Nearby cases <span className="score-serif">{nearbyCases.length}</span>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {nearbyCases.map(function(n) {
          return (
            <a key={n.case_id} href={caseLinkPrefix + n.case_id}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: 'inherit', textDecoration: 'none', padding: '6px 8px', borderRadius: 6, background: 'var(--mist)' }}>
              <span><b>{n.case_id}</b> — {n.site} <span style={{ color: 'var(--slate)' }}>({n.stage})</span></span>
              <span className="microcopy">{n.distance_km} km</span>
            </a>
          );
        })}
      </div>
    </div>
  );

  const inviteModal = showInvite && isLead && (
    <div onClick={() => setShowInvite(false)}
      style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 800, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'var(--mist)', borderRadius: 12, padding: '22px 24px', width: 560, maxWidth: '100%', maxHeight: '82vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.5)', border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <b style={{ fontSize: 16 }}>Invite co-parties</b>
            <div className="microcopy" style={{ marginTop: 2 }}>Case {id} - {onCaseNames.length} agenc{onCaseNames.length === 1 ? 'y' : 'ies'} currently on this case</div>
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
          <input type="email" placeholder="Not listed? Invite by email..." value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') inviteByEmail(); }}
            style={{ flex: 1, padding: '7px 11px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--sand)', fontSize: 13, fontFamily: 'inherit', color: 'inherit' }} />
          <button className="btn btn-ghost btn-xs" onClick={inviteByEmail}>Send</button>
        </div>
      </div>
    </div>
  );

  // The conditions table itself — the core of the Negotiation stage. Only
  // the lead steward sees the status <select> and Approve/Reject controls;
  // everyone else sees a read-only status Chip. Rows for pending co-party
  // conditions get a subtle highlight background to flag them as awaiting review.
  const conditionsPanel = (
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
            {conditions.length === 0 && (
              <tr><td colSpan={isLead ? 5 : 4} style={{ fontSize: 13, color: 'var(--slate)', padding: '14px 12px' }}>No conditions proposed yet.</td></tr>
            )}
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
            <span className="microcopy">Proposed by: <b>{isCoParty ? (partyName || 'Co-party') : _agencyLabel(authUser)}</b></span>
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
  );

  // Shows a countdown for the current rebuttal cycle. Prefers the live
  // server-tracked `deadline` state, falling back to the fixture's static
  // `daysToRebuttal` for demo/fixture cases with no real deadline record.
  // Visible if there's a deadline to show OR the viewer is the lead steward
  // (who needs to see the "set deadline" control even with none set yet).
  const rebuttalClockPanel = (deadline != null || fallbackRebuttalDays != null || isLead) && (
    <div className="callout" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
        <Icon name="clock" size={17} color="var(--basalt)" />
        <b style={{ fontSize: 13, letterSpacing: '.06em', textTransform: 'uppercase' }}>Rebuttal clock</b>
      </div>
      {(deadline != null || fallbackRebuttalDays != null) ? (
        <React.Fragment>
          <div style={{ fontSize: 14 }}>Applicant response due in <span className="score-serif" style={{ fontSize: 22, color: 'var(--basalt)' }}>{deadline ? deadline.days : fallbackRebuttalDays}</span> days</div>
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
  );

  // Sidebar summary of every co-party on the case with their live condition
  // status (see the coParties derivation above). The id === '26-0142' check
  // is a one-off hardcoded footnote specific to that particular fixture case
  // (which involves tribal consultation) — not a general rule applied to all cases.
  const coPartyTrackerPanel = coParties.length > 0 && (
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
      {id === '26-0142' && <p className="microcopy" style={{ margin: '9px 0 0' }}>Tribal governments are sovereign consultation parties, not stakeholders.</p>}
    </div>
  );

  // Visible to the lead steward on any case, or to anyone viewing the
  // EXAMPLE fixture case (so the showcase demonstrates the full workflow even
  // to non-lead visitors) — but never in demo mode, since mandating a study
  // isn't part of the public demo flow.
  const mandatedStudiesPanel = (isLead || (!isDynamic && C.is_example)) && !isDemo && (
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
                {s.body && <div className="microcopy" style={{ marginTop: 2, fontStyle: 'italic' }}>{s.body}</div>}
              </div>
            );
          })}
        </div>
      )}
      {isLead && (mandateForm ? (
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
      ))}
    </div>
  );

  /* ── dynamic (builder-submitted) case intake view ── */
  // This branch (and the fixture-case branch further below) are two
  // completely separate render paths for the same CaseFilePage component.
  // A real, server-backed case has its own richer intake header (confirm
  // button, agency tracking id, imported-permit banner) before falling
  // through to the same shared panels (conditionsPanel, rebuttalClockPanel,
  // etc.) hoisted above. dynLoading/!dynCase handle the async fetch-in-flight
  // and not-found states before any of this renders.
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
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Steward -- Intake case">
        {toast && <NotifyToast message={toast} onDone={() => setToast(null)} />}
        {inviteModal}
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
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {isLead && !isDemo && dc.confirmed_at && (
                <button className="btn btn-ghost btn-sm" onClick={() => setShowInvite(v => !v)}>Invite co-parties</button>
              )}
              <a className="btn btn-ghost btn-sm" href={'/report/' + dc.case_id} target="_blank" rel="noreferrer">Permit justification report →</a>
              <div style={{ textAlign: 'right' }}>
                <span className="score-badge" style={{ background: M.rampColor(dc.score || 0.5, ramp), color: M.rampText(dc.score || 0.5, ramp), fontSize: 22, padding: '4px 13px' }}>{(dc.score || 0.5).toFixed(3)}</span>
                <div className="microcopy" style={{ marginTop: 3 }}>composite score</div>
              </div>
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

        {nearbyPanel && <div style={{ marginBottom: 16 }}>{nearbyPanel}</div>}

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
            <p className="microcopy" style={{ margin: '4px 0 10px' }}>Each stage advance updates the case record and notifies all parties. Advancing to Resolution anchors the evidentiary record with a SHA-256 hash.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {M.STAGES.filter(function(s) { return s !== (dc.stage || 'Site Inquiry'); }).map(function(s) {
                return (
                  <button key={s} className="btn btn-quiet btn-sm" onClick={() => advanceStage(s)}>Move to {s}</button>
                );
              })}
            </div>
          </div>

          {dc.anchor && (
            <div className="card" style={{ padding: '14px 16px', borderColor: 'var(--evergreen)', borderWidth: 1.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--evergreen)' }}>Record anchored</span>
                <Chip tone="lo">SHA-256</Chip>
                <span style={{ fontSize: 11.5, color: 'var(--slate)', marginLeft: 'auto' }}>{dc.anchor.anchored_at.substring(0, 10)}</span>
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 11.5, wordBreak: 'break-all', color: 'var(--basalt)', marginBottom: 8 }}>{dc.anchor.hash}</div>
              <div className="microcopy" style={{ lineHeight: 1.5 }}>
                The evidentiary record — site, score, weights, conditions, rebuttals, and co-parties — was serialized to canonical JSON and hashed at this timestamp. Any modification to the record will produce a different hash. Verify independently at <a href={'/api/case/' + dc.case_id + '/anchor'} target="_blank" rel="noreferrer" style={{ fontWeight: 650 }}>/api/case/{dc.case_id}/anchor</a>.
              </div>
            </div>
          )}
        </div>

        {/* negotiation surface — unlocked once the case is confirmed */}
        {!isDemo && dc.confirmed_at && (
          <div style={{ display: 'flex', gap: 16, marginTop: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {conditionsPanel}
            <div style={{ flex: '1 1 260px', minWidth: 250, display: 'grid', gap: 12 }}>
              {rebuttalClockPanel}
              {coPartyTrackerPanel}
              {mandatedStudiesPanel}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── static / fixture case view (falls through when !isDynamic) ──
     Renders a case that has already progressed past intake — findings,
     conditions negotiation, stage stepper — sourced from the hardcoded
     M.CASE_DETAIL_MAP entry (`C`) rather than a live fetch. This is also the
     branch that renders the EXAMPLE showcase case, hence the extra EXAMPLE
     banner and localStorage hide/show controls below. */
  return (
    <div style={{ maxWidth: 1340, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Steward — Case file">
      {toast && <NotifyToast message={toast} onDone={() => setToast(null)} />}
      {inviteModal}
      <a href={backHref} style={{ fontSize: 13, fontWeight: 650, textDecoration: 'none' }}>{backLabel}</a>
      {C.is_example && (
        <div style={{ marginTop: 14, marginBottom: 0, padding: '10px 16px', background: 'rgba(255,200,0,0.07)', border: '1.5px solid #F0C040', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Chip tone="med">EXAMPLE</Chip>
          <span style={{ flex: 1, fontSize: 13.5 }}>This is a reference case showing the complete steward workflow from Site Inquiry through Resolution. Findings, conditions, and documents are illustrative.</span>
          <button className="btn btn-quiet btn-xs" onClick={() => { try { localStorage.setItem('mera_hide_example', '1'); } catch(e) {} location.hash = '#/steward'; }}>Hide &amp; return to docket</button>
          <button className="btn btn-quiet btn-xs" onClick={() => { try { localStorage.removeItem('mera_hide_example'); } catch(e) {} location.hash = '#/steward'; }}>Show in docket</button>
        </div>
      )}
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

        {conditionsPanel}

        {/* right rail */}
        <div style={{ flex: '1 1 260px', minWidth: 250, display: 'grid', gap: 12 }}>
          {rebuttalClockPanel}
          {coPartyTrackerPanel}
          {nearbyPanel}
          <div className="card" style={{ padding: '14px 16px' }}>
            <b style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--slate)' }}>Document chain</b>
            {/* Merges the fixture's hardcoded doc list with any real uploads
                (serverDocs, from refreshDocs/uploadDoc) so demo cases can show
                illustrative documents alongside ones actually uploaded during
                the session. Fixture docs have no `filename` so they render as
                plain text instead of a download link. */}
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

          {mandatedStudiesPanel}
        </div>
      </div>
    </div>
  );
}

// No bundler/module system in this app — every .jsx file is Babel-compiled
// and concatenated into dist/bundle.js, so components are shared across files
// by hanging them off `window`. steward-inbox.jsx, steward2.jsx, and app.jsx's
// router all reference these exports directly (e.g. CaseCard/_shapeDynamic
// are used by steward-inbox.jsx even though they aren't in this list, since
// plain top-level function declarations are already global — see the export
// note at the end of steward-templates.jsx for why only some files need this
// explicit block).
Object.assign(window, { DocketPage, CaseFilePage, StewardSubNav, StageStepper });
