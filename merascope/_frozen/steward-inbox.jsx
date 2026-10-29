/* ── Surface C (cont.): Permitter Inbox — triage view for a large caseload ── */

/*
 * steward-inbox.jsx — the Permitter Inbox (added 2026-07-03).
 *
 * The docket (DocketPage in steward.jsx) renders every case in every stage as a
 * kanban board — fine for a handful of cases, unusable once a lead agency has
 * dozens of open site inquiries scattered across stages. This file is a second,
 * much smaller "view" of the same case data: instead of "show me everything,"
 * it answers "what needs my attention today?" by fetching GET /api/steward/inbox
 * (server-scoped to the caller's lead_agency exactly like the docket) and
 * sorting the results into four priority buckets. It reuses CaseCard from
 * steward.jsx so the cards look identical to the docket, and StewardSubNav
 * (also steward.jsx) shows an urgent-count badge on the Inbox tab sourced from
 * this same endpoint. Routed at #/steward/inbox.
 */

// Adapts one raw case row from the inbox API into the shape CaseCard expects
// (see _shapeDynamic in steward.jsx, which this wraps). Inbox rows carry extra
// deadline-tracking fields (days_until_due, days_in_stage) that plain docket
// cases don't — this overlays a "days" + "dayLabel" pair on top of the shared
// shape only when the caller tells it which field to surface, so the same
// CaseCard component can show "3d overdue" on one bucket and "3d in stage" on
// another without CaseCard itself knowing about buckets.
function _shapeInboxRow(c, dayField, dayLabel) {
  var shaped = _shapeDynamic(c);
  if (dayField && typeof c[dayField] === 'number') {
    shaped.days = c[dayField];
    shaped.dayLabel = dayLabel;
  }
  return shaped;
}

// One priority section of the inbox (e.g. "Overdue", "Stuck") — a heading with a
// live row count, a dashed empty-state box when the bucket has nothing in it,
// and a responsive card grid otherwise. dayField/dayLabel pass through to
// _shapeInboxRow to control which deadline metric each card displays; "New
// inquiries" omits both since those cards don't have a countdown, just recency.
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

// Top-level page for #/steward/inbox — the triage landing view a steward should
// use instead of scrolling the full kanban Docket once their caseload gets
// large. Fetches all four buckets once on mount from /api/steward/inbox (the
// route already scopes to the signed-in steward's agency server-side, same as
// the docket — no client-side filtering needed here) and renders one
// InboxBucket per bucket in a fixed priority order: Overdue, Due soon, New
// inquiries, Stuck.
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

// No bundler module system here — every .jsx file is Babel-compiled and
// concatenated into one script (see dist/bundle.js), so components are shared
// across files by hanging them off `window`. app.jsx's router looks up
// InboxPage this way to wire the #/steward/inbox route.
Object.assign(window, { InboxPage });
