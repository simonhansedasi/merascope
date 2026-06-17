/* ── Co-party surface: filtered docket for invited agencies ── */

function CoDocketPage() {
  const M = window.MERA;
  const { ramp } = React.useContext(MeraCtx);
  const loading = useFakeLoad(600);

  const partyKey = (() => { try { return localStorage.getItem('mera_party_key') || ''; } catch (e) { return ''; } })();
  const partyName = (() => {
    const found = (window.DEMO_CO_PARTIES || []).find(p => p.key === partyKey);
    return found ? found.name : (partyKey || 'Your agency');
  })();

  const myCases = M.CASES.filter(c => c.parties && c.parties.includes(partyKey));
  const [livePending, setLivePending] = React.useState({});

  React.useEffect(() => {
    myCases.forEach(k => {
      if (!(M.CASE_DETAIL_MAP && M.CASE_DETAIL_MAP[k.id])) return;
      fetch('/api/case/' + k.id + '/conditions').then(r => r.json()).then(list => {
        const count = list.filter(c => c.pending_approval).length;
        setLivePending(prev => Object.assign({}, prev, { [k.id]: count }));
      });
    });
  }, []);

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
          <p className="microcopy">If you were forwarded a case, contact the lead agency to confirm your party code.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {myCases.map(k => {
            const C = M.CASE_DETAIL_MAP && M.CASE_DETAIL_MAP[k.id];
            const pendingCount = livePending[k.id] !== undefined
              ? livePending[k.id]
              : (C ? C.conditions.filter(c => c.pendingApproval).length : 0);
            return (
              <div key={k.id} className="card" style={{ padding: '18px 22px', cursor: C ? 'pointer' : 'default' }}
                onClick={() => { if (C) location.hash = '#/co-party/case/' + k.id; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 5 }}>
                      <span className="microcopy" style={{ fontWeight: 700 }}>Case {k.id}</span>
                      <Chip tone={k.stage === 'Negotiation' ? 'hi' : k.stage === 'Rebuttal Cycle' ? 'med' : 'slate'}>{k.stage}</Chip>
                      {pendingCount > 0 && <Chip tone="med">{pendingCount} pending</Chip>}
                    </div>
                    <b style={{ fontSize: 16 }}>{k.site}</b>
                    <div className="microcopy" style={{ marginTop: 3 }}>Applicant: {k.applicant} · Lead: {(C && C.leadParty) || 'Dept. of Ecology'}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span className="score-badge" style={{ background: M.rampColor(k.score, ramp), color: M.rampText(k.score, ramp), fontSize: 15 }}>{k.score.toFixed(3)}</span>
                    <div className="microcopy" style={{ marginTop: 3 }}>{k.days}d in stage</div>
                  </div>
                </div>
                {C
                  ? <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 650, color: 'var(--basalt)' }}>Open case file</div>
                  : <div style={{ marginTop: 8, fontSize: 12, color: 'var(--slate)' }}>Full record not available in this demo</div>}
              </div>
            );
          })}
        </div>
      )}

      <div className="panel" style={{ marginTop: 28, padding: '14px 18px' }}>
        <b style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--slate)' }}>Same Score Promise</b>
        <p className="microcopy" style={{ margin: '5px 0 0' }}>The scores and findings you see here are identical to what the lead agency and the applicant see. The methodology is public. No party receives a friendlier number.</p>
      </div>
    </div>
  );
}

Object.assign(window, { CoDocketPage });
