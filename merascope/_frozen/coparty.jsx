/* ── Co-party surface: filtered docket for invited agencies ── */
// Co-parties are agencies (tribes, counties, utilities, AG) invited onto a
// specific case by the lead steward — they get propose-only permissions on
// conditions and a read-only view of findings. This file is their landing page:
// a "My Cases" list scoped to only the cases their agency was invited to.
// Clicking a card opens CaseFilePage (steward.jsx) with co-party role gating
// applied inside that shared component.

// "My Cases" list for the co-party persona. Route: #/co-party.
function CoDocketPage() {
  const M = window.MERA;
  const { ramp } = React.useContext(MeraCtx);
  const { authUser } = React.useContext(AuthCtx);
  const loading = useFakeLoad(600);

  /* Signed-in co-parties get their real invited cases from the server;
     the demo persona keeps filtering the static fixture by party key. */
  const isRealCoParty = !!(authUser && authUser.role === 'co-party');
  const [serverCases, setServerCases] = React.useState(null);

  // Demo persona identifies itself via a localStorage party key (no real auth);
  // partyName resolves a display label for either the real agency (from the
  // authenticated session) or the matching entry in the static DEMO_CO_PARTIES list.
  const partyKey = (() => { try { return localStorage.getItem('mera_party_key') || ''; } catch (e) { return ''; } })();
  const partyName = isRealCoParty
    ? (authUser.agency_key || authUser.email)
    : (() => {
        const found = (window.DEMO_CO_PARTIES || []).find(p => p.key === partyKey);
        return found ? found.name : (partyKey || 'Your agency');
      })();

  // Real co-parties: fetch /api/cases, which server-side joins case_invites on
  // the caller's agency_key (see CONTEXT.md "Real docket" — known limitation:
  // an email-invited co-party only sees cases once their account's agency_key
  // matches, not by email).
  React.useEffect(() => {
    if (!isRealCoParty) return;
    fetch('/api/cases?limit=50&offset=0')
      .then(r => r.ok ? r.json() : null)
      .then(d => { setServerCases(d && d.cases ? d.cases : []); })
      .catch(() => { setServerCases([]); });
  }, [isRealCoParty]);

  // Normalize server rows and demo-fixture rows to the same shape used below.
  // `_dynamic: true` flags a server-backed case (vs. a static CASE_DETAIL_MAP fixture).
  const myCases = isRealCoParty
    ? (serverCases || []).map(c => ({ id: c.case_id, site: c.site, applicant: c.applicant, score: c.score || 0.5, stage: c.stage || 'Site Inquiry', days: c.days || 0, _dynamic: true, _lead: c.lead_agency }))
    : M.CASES.filter(c => c.parties && c.parties.includes(partyKey));
  const [livePending, setLivePending] = React.useState({});

  // For every openable case (has a static fixture or is server-backed), fetch its
  // live conditions and count how many are still pending lead approval — shown as
  // a badge on the card. Re-runs when the server case list length changes (a crude
  // dependency, but avoids re-fetching on every render).
  React.useEffect(() => {
    myCases.forEach(k => {
      if (!k._dynamic && !(M.CASE_DETAIL_MAP && M.CASE_DETAIL_MAP[k.id])) return;
      fetch('/api/case/' + k.id + '/conditions').then(r => r.json()).then(list => {
        const count = list.filter(c => c.pending_approval).length;
        setLivePending(prev => Object.assign({}, prev, { [k.id]: count }));
      });
    });
  }, [isRealCoParty ? (serverCases || []).length : 0]);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Co-party — My Cases">
      <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Chip tone="med">{partyName}</Chip>
        <span style={{ fontSize: 13, color: 'var(--slate)' }}>Co-party view — cases where your agency is invited</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 750, margin: 0 }}>My Cases</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--slate)', fontSize: 14 }}>
            <span className="score-serif">{myCases.length}</span> active case{myCases.length !== 1 ? 's' : ''} where {partyName} is an invited co-party.
          </p>
        </div>
        <PromiseBadge />
      </div>

      {loading ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {[1, 2].map(i => <div key={i} className="shimmer" style={{ height: 110, borderRadius: 10 }}></div>)}
        </div>
      ) : myCases.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--slate)' }}>
          <Icon name="doc" size={32} color="var(--line)" />
          <p style={{ marginTop: 12, fontSize: 15 }}>No cases found for {partyName}.</p>
          {isRealCoParty
            ? <p className="microcopy">Cases appear here when a lead agency invites your agency key. If you expected a case, ask the lead agency to invite <b>{authUser.agency_key || 'your agency key'}</b> from the case file.</p>
            : <p className="microcopy">If you were invited to a case, ask the lead agency to confirm your party code.</p>}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {myCases.map(k => {
            const C = M.CASE_DETAIL_MAP && M.CASE_DETAIL_MAP[k.id];
            const openable = !!C || !!k._dynamic;
            // Prefer the live-fetched count; fall back to the static fixture's
            // baked-in pendingApproval flags until the live fetch resolves.
            const pendingCount = livePending[k.id] !== undefined
              ? livePending[k.id]
              : (C ? C.conditions.filter(c => c.pendingApproval).length : 0);
            return (
              <div key={k.id} className="card" style={{ padding: '18px 22px', cursor: openable ? 'pointer' : 'default' }}
                onClick={() => { if (openable) location.hash = '#/co-party/case/' + k.id; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 5 }}>
                      <span className="microcopy" style={{ fontWeight: 700 }}>Case {k.id}</span>
                      <Chip tone={k.stage === 'Negotiation' ? 'hi' : k.stage === 'Rebuttal Cycle' ? 'med' : 'slate'}>{k.stage}</Chip>
                      {pendingCount > 0 && <Chip tone="med">{pendingCount} pending</Chip>}
                    </div>
                    <b style={{ fontSize: 16 }}>{k.site}</b>
                    <div className="microcopy" style={{ marginTop: 3 }}>Applicant: {k.applicant} · Lead: {k._lead || (C && C.leadParty) || 'Dept. of Ecology'}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span className="score-badge" style={{ background: M.rampColor(k.score, ramp), color: M.rampText(k.score, ramp), fontSize: 15 }}>{k.score.toFixed(3)}</span>
                    <div className="microcopy" style={{ marginTop: 3 }}>{k.days}d in stage</div>
                  </div>
                </div>
                {openable
                  ? <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 650, color: 'var(--basalt)' }}>Open case file</div>
                  : <div style={{ marginTop: 8, fontSize: 12, color: 'var(--slate)' }}>Full record not available in this demo</div>}
              </div>
            );
          })}
        </div>
      )}

      <div className="panel" style={{ marginTop: 28, padding: '14px 18px' }}>
        <b style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--slate)' }}>Same Score Promise</b>
        <p className="microcopy" style={{ margin: '5px 0 0' }}>Every party sees the same scores. The methodology is public. No one gets a friendlier number.</p>
      </div>
    </div>
  );
}

// Exposed on window for app.jsx's router (no module/import system in this build).
Object.assign(window, { CoDocketPage });
