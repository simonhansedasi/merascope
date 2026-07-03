/* ── Surface C (cont.): Permitter Inbox — triage view for a large caseload ── */

function _shapeInboxRow(c, dayField, dayLabel) {
  var shaped = _shapeDynamic(c);
  if (dayField && typeof c[dayField] === 'number') {
    shaped.days = c[dayField];
    shaped.dayLabel = dayLabel;
  }
  return shaped;
}

function InboxBucket({ title, hint, rows, dayField, dayLabel, emptyText }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <h4 style={{ margin: 0 }}>{title} <span className="score-serif" style={{ color: 'var(--slate)' }}>{rows.length}</span></h4>
        {hint && <span className="microcopy">{hint}</span>}
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--slate)', textAlign: 'center', padding: '20px 8px', border: '1.5px dashed var(--line)', borderRadius: 8 }}>{emptyText}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(228px, 1fr))', gap: 12 }}>
          {rows.map(function(c) {
            var k = _shapeInboxRow(c, dayField, dayLabel);
            return <CaseCard key={(c.case_id || c.id) + '-' + (c.kind || '')} k={k} />;
          })}
        </div>
      )}
    </div>
  );
}

function InboxPage() {
  const [data, setData] = React.useState({ overdue: [], due_soon: [], new_inquiries: [], stuck: [] });
  const loading = useFakeLoad(400);

  React.useEffect(() => {
    fetch('/api/steward/inbox').then(r => r.json()).then(function(d) {
      setData({
        overdue: d.overdue || [],
        due_soon: d.due_soon || [],
        new_inquiries: d.new_inquiries || [],
        stuck: d.stuck || []
      });
    });
  }, []);

  return (
    <div style={{ maxWidth: 1140, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Steward — Inbox">
      <StewardSubNav active="inbox" />
      <PageHead title="Inbox" sub="Prioritized queue across your caseload — what needs attention first, not the full docket." />
      {loading ? (
        <div className="shimmer" style={{ height: 220 }}></div>
      ) : (
        <React.Fragment>
          <InboxBucket title="Overdue" hint="past a rebuttal or study deadline" rows={data.overdue}
            dayField="days_until_due" dayLabel="d overdue" emptyText="Nothing overdue." />
          <InboxBucket title="Due soon" hint="within 7 days" rows={data.due_soon}
            dayField="days_until_due" dayLabel="d until due" emptyText="Nothing due in the next 7 days." />
          <InboxBucket title="New inquiries" hint="oldest first" rows={data.new_inquiries}
            emptyText="No open site inquiries." />
          <InboxBucket title="Stuck" hint="over 21 days in current stage" rows={data.stuck}
            dayField="days_in_stage" dayLabel="d in stage" emptyText="Nothing stuck." />
        </React.Fragment>
      )}
    </div>
  );
}

Object.assign(window, { InboxPage });
