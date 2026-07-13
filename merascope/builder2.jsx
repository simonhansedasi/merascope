/*
 * builder2.jsx — Builder surface, part 2: Status (CRM) tab + Portfolio screening tab.
 * Continues builder.jsx (Workspace + My Inquiry); together the two files implement all four Builder
 * sub-nav tabs (BuilderSubNav lives in builder.jsx and is shared by both files).
 *
 * This file renders:
 *   - SiteProfile: a legacy/demo detail page driven by mock M.SITES data (see the "kept for legacy
 *     refs" note on SiteCard in builder.jsx) — not part of the live saved-cell workflow.
 *   - StatusPage (#/builder/status): per-saved-cell CRM tracker — status pipeline, contacts, activity
 *     log, notes — built from CrmPanel.
 *   - PortfolioPage (#/builder/portfolio): CSV upload of candidate site coordinates, client-side
 *     nearest-cell matching against the loaded grid, hard-gate + composite-score screening, and a
 *     PASS/FAIL results table with CSV export.
 *
 * Like builder.jsx, this is plain Babel-compiled JSX with no bundler — components are attached to
 * `window` at the bottom so app.jsx's router can reach them, and shared state/helpers (composite(),
 * propsToInd(), cellLabel(), findNearestCell(), CRM getters/setters, serverLog(), MERA_SESSION) come
 * from data.js globals.
 */

// Tab labels for the legacy SiteProfile detail page (below).
const PROFILE_TABS = ['Overview', 'Water & Rights', 'Grid & Queue', 'Hazard & Insurance', 'Community & Permitting Posture', 'Heat-Reuse & Carbon Upside', 'Field Truth', 'Comparables'];

/* Legacy/demo site-detail page keyed by a mock site id (M.SITES, not real saved-cell/case data).
   Renders a tabbed deep-dive (water rights, grid queue, hazard/insurance, community posture,
   heat-reuse upside, field-truth surveys, comparable sites) with mostly illustrative/placeholder
   copy and derived numbers rather than live pipeline scores. Predates the real Workspace/My Inquiry
   flow; kept around for its UI patterns and linked from SiteCard's "Open full profile" button. */
function SiteProfile({ id }) {
  const M = window.MERA;
  const site = M.SITES.find(s => s.id === id) || M.SITES[0];
  const [tab, setTab] = React.useState('Overview');
  const cell = M.cellAt(site.lat, site.lon);
  const ind = cell ? cell.ind : null;

  const tabBody = {
    'Overview': (
      <div style={{ display: 'grid', gap: 14 }}>
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.65 }}>{site.blurb}</p>
        <div style={{ display: 'grid', gap: 6, maxWidth: 460 }}>
          {ind && M.INDICATORS.map(m => <BarRow key={m.k} label={m.label} value={ind[m.k]} width={170} />)}
        </div>
      </div>
    ),
    'Water & Rights': (
      <div style={{ display: 'grid', gap: 4, maxWidth: 560 }}>
        <div className="kv"><span>Water-rights status</span><b>{site.waterRights}</b></div>
        <div className="kv"><span>Consumptive-use ceiling (modeled)</span><b><span className="score-serif">412</span> ac-ft/yr</b></div>
        <div className="kv"><span>Basin adjudication</span><b>{site.waterRights === 'Adjudicated' ? 'Complete — senior rights mapped' : 'Open — junior rights at curtailment risk'}</b></div>
        <div className="kv"><span>Closed-loop feasibility</span><b>Yes — ~0.12 L/kWh design basis</b></div>
        <p className="microcopy" style={{ marginTop: 8 }}>Rights, not rainfall. The indicator scores legal availability under drought-year curtailment, not average precipitation.</p>
      </div>
    ),
    'Grid & Queue': (
      <div style={{ display: 'grid', gap: 4, maxWidth: 560 }}>
        <div className="kv"><span>Nearest line</span><b><span className="score-serif">{site.kvDist}</span> km to {site.kv} kV</b></div>
        <div className="kv"><span>Serving utility</span><b>{site.county} PUD</b></div>
        <div className="kv"><span>Queue position (modeled)</span><b>Cluster study 2027-Q2 window</b></div>
        <div className="kv"><span>Estimated queue-to-power</span><b><span className="score-serif">{site.kv >= 500 ? '4.5' : '6.5'}</span> yrs vs 7+ national avg</b></div>
      </div>
    ),
    'Hazard & Insurance': (
      <div style={{ display: 'grid', gap: 4, maxWidth: 560 }}>
        <div className="kv"><span>Seismic (PGA 10%/50 yr)</span><b className="score-serif">{ind ? (0.5 - ind.seismic * 0.4).toFixed(2) : '—'}g</b></div>
        <div className="kv"><span>SFHA flood overlap</span><b>None mapped</b></div>
        <div className="kv"><span>Wildfire interface</span><b>{site.lon < -121 ? 'Low' : 'Moderate'}</b></div>
        <div className="kv"><span>Insurer pre-screen</span><b>{site.flags[0].t.replace('Insurance: ', '')}</b></div>
      </div>
    ),
    'Community & Permitting Posture': (
      <div style={{ maxWidth: 560 }}>
        <div className="kv"><span>ZCTA {site.zcta} population</span><b className="score-serif">{site.pop.toLocaleString()}</b></div>
        <div className="kv"><span>EJ burden indicator</span><b className="score-serif">{ind ? ind.community.toFixed(3) : '—'}</b></div>
        <div className="kv"><span>Prior large-project hearings</span><b>2 — both approved with conditions</b></div>
        <p className="microcopy" style={{ marginTop: 8 }}>Posture is observed behavior — median approval time, moratorium history, condition patterns — not sentiment polling.</p>
      </div>
    ),
    'Heat-Reuse & Carbon Upside': (
      <div style={{ maxWidth: 560 }}>
        <div className="kv"><span>Heat-reuse demand within 5 km</span><b>{site.bars['Heat-reuse'] >= 0.55 ? 'Yes — district / greenhouse offtake' : 'Limited'}</b></div>
        <div className="kv"><span>Geothermal opportunity</span><b className="score-serif">{ind ? ind.geothermal.toFixed(3) : '—'}</b></div>
        <div className="kv"><span>Waste-heat DAC suitability</span><b>{site.bars['Heat-reuse'] >= 0.5 ? 'Screen-positive' : 'Not screened'}</b></div>
        <p className="microcopy" style={{ marginTop: 8 }}>Purchased offsets are scored as the weakest claim tier. On-site reuse and additionality score highest.</p>
      </div>
    ),
    'Field Truth': (
      <div style={{ maxWidth: 560 }}>
        <div className="card" style={{ padding: '13px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
          <Icon name="borehole" size={22} color="var(--basalt)" />
          <div>
            <b style={{ fontSize: 14 }}>Geotech: ordered via partner — in progress</b>
            <div className="microcopy">Chain-of-custody #4471 · proctored survey · results post to this profile and version the score.</div>
          </div>
          <Chip tone="med" style={{ marginLeft: 'auto' }}>In progress</Chip>
        </div>
        <div className="card" style={{ padding: '13px 16px', display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
          <Icon name="droplet" size={22} color="var(--slate)" />
          <div>
            <b style={{ fontSize: 14 }}>Hydrogeology survey</b>
            <div className="microcopy">Not yet ordered. Partner bench: 3 qualified firms in-state.</div>
          </div>
          <button className="btn btn-quiet btn-xs" style={{ marginLeft: 'auto' }}>Order survey</button>
        </div>
      </div>
    ),
    'Comparables': (
      <div style={{ display: 'grid', gap: 10 }}>
        <p className="microcopy" style={{ margin: 0 }}>Sites like this — matched on grid class, water posture, and acreage band.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {M.SITES.filter(s => s.id !== site.id && Math.abs(s.composite - site.composite) < 0.16).slice(0, 3).map(s => (
            <div key={s.id} className="card" style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }} onClick={() => { location.hash = '#/builder/site/' + s.id; }}>
              <SiteThumb site={s} w={70} h={52} />
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 13.5, display: 'block' }}>{s.title}</b>
                <span className="microcopy">{s.cell}</span>
              </div>
              <ScoreBadge value={s.composite} size={13} decimals={2} style={{ marginLeft: 'auto' }} />
            </div>
          ))}
        </div>
      </div>
    )
  };

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Builder — Site profile">
      <a href="#/builder" style={{ fontSize: 13, fontWeight: 650, textDecoration: 'none' }}>← Back to search</a>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginTop: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 640px', minWidth: 0 }}>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
              <div>
                <h2 style={{ fontSize: 23 }}>{site.title}</h2>
                <div className="microcopy">{site.cell} · {site.county} County, WA · ZCTA {site.zcta}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <ScoreBadge value={site.composite} size={24} decimals={2} style={{ padding: '4px 13px' }} />
                <div className="microcopy" style={{ marginTop: 3 }}>composite · default weights</div>
              </div>
            </div>
            {/* Active site_type's default weights (see M.weightsForSiteType), not always datacenter. */}
            <WAMap weights={window.MERA.weightsForSiteType(window.getCurrentSiteType())} markers={false} highlight={site} pins={[site]} />
          </div>
          <div className="card" style={{ marginTop: 14, padding: '0 16px 18px' }}>
            <div className="tabs" style={{ margin: '0 -16px 16px', padding: '0 16px' }}>
              {PROFILE_TABS.map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}
            </div>
            {tabBody[tab]}
          </div>
        </div>
        <div style={{ width: 300, flexShrink: 0, display: 'grid', gap: 12 }}>
          <div className="panel" style={{ padding: '15px 17px' }}>
            <div style={{ fontSize: 11.5, letterSpacing: '.09em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--slate)', marginBottom: 8 }}>Permitting posture</div>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
              <b>{site.county} County</b> — median large-project approval <span className="score-serif">14</span> mo, no active moratorium, 1 prior DC approved w/ conditions.
            </p>
          </div>
          <div className="card" style={{ padding: '15px 17px' }}>
            <div style={{ fontSize: 11.5, letterSpacing: '.09em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--slate)', marginBottom: 8 }}>Key facts</div>
            <div className="kv"><span>Buildable acres</span><b className="score-serif">{site.acres}</b></div>
            <div className="kv"><span>Line distance</span><b><span className="score-serif">{site.kvDist}</span> km · {site.kv} kV</b></div>
            <div className="kv"><span>Qualifying parcels</span><b className="score-serif">{site.parcels}</b></div>
            <div className="kv" style={{ borderBottom: 'none' }}><span>Water rights</span><b>{site.waterRights}</b></div>
          </div>
          <button className="btn btn-accent" style={{ width: '100%' }}>Export board-ready dossier (PDF)</button>
          <a className="btn btn-quiet" href="#/factsheets/site" style={{ width: '100%' }}>Site fact sheet</a>
          <div style={{ textAlign: 'center' }}><PromiseBadge compact /></div>
        </div>
      </div>
    </div>
  );
}

// The 5-stage CRM pipeline a builder can move a saved site through (per-cell, not per-case — this is
// the builder's own outreach tracker, separate from the formal case/docket stage machine in M.STAGES).
var CRM_STATUSES = [
  { k: 'researching',  label: 'Researching',   bg: 'var(--gate)',   color: 'var(--slate)' },
  { k: 'contacted',    label: 'Contacted',      bg: 'var(--med-bg)', color: 'var(--med-tx)' },
  { k: 'in_diligence', label: 'In diligence',   bg: 'var(--sand)',   color: 'var(--basalt)' },
  { k: 'negotiating',  label: 'Negotiating',    bg: 'var(--lo-bg)',  color: 'var(--lo-tx)' },
  { k: 'dead',         label: 'Dead',           bg: 'var(--hi-bg)',  color: 'var(--hi-tx)' },
];
// Fixed set of activity-log entry types offered in CrmPanel's "+ Log activity" form.
var EVENT_TYPES = ['Call', 'Email', 'Meeting', 'Site visit', 'Note'];

/* Small colored pill showing a saved cell's current CRM status; falls back to the first status
   (Researching) if the stored status key doesn't match anything in CRM_STATUSES. */
function CrmStatusBadge({ status }) {
  var s = CRM_STATUSES.find(function(x) { return x.k === status; }) || CRM_STATUSES[0];
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

/* CRM detail panel for one saved cell (right-hand pane of StatusPage) — status pipeline buttons,
   contacts list + add-contact form, activity log + add-event form, and a notes textarea. All
   mutations write through to both localStorage (window.set/add/removeCrm* helpers from data.js, for
   instant offline-tolerant UI) and the server (saveToServer, POST /api/crm/<fid>) so CRM data
   survives across devices/sessions when signed in. `fid` is the cell's feature id, the CRM record's
   join key alongside the session id (crm_state is keyed on (session_id, fid) server-side — see
   CONTEXT.md session-scoping invariants). */
function CrmPanel({ fid, cell, geo }) {
  var [crm, setCrm] = React.useState(function() { return window.getCrm ? window.getCrm(fid) : { status: 'researching', contacts: [], events: [], notes: '' }; });

  // Fire-and-forget: persist the full CRM state blob for this cell to the server, scoped to the
  // browser session id (never omitted — a missing session_id would otherwise mean "all sessions").
  var saveToServer = function(state) {
    fetch('/api/crm/' + fid, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ session_id: window.MERA_SESSION || '' }, state))
    });
  };

  // On mount, pull the server's copy of this cell's CRM record (source of truth) and mirror it into
  // the local mera_crm_v1 cache so other components reading from localStorage (e.g. StatusPage's list)
  // stay in sync without needing their own fetch.
  React.useEffect(function() {
    fetch('/api/crm/' + fid + '?session_id=' + (window.MERA_SESSION || '')).then(function(r) { return r.json(); }).then(function(data) {
      if (!data) return;
      setCrm(data);
      try {
        var all = JSON.parse(localStorage.getItem('mera_crm_v1') || '{}');
        all[fid] = data;
        localStorage.setItem('mera_crm_v1', JSON.stringify(all));
      } catch(e) {}
    });
  }, [fid]);

  // Every mutation follows the same pattern: update the local helper (data.js's IIFE-backed
  // localStorage store) for other components' benefit, merge into local component state for instant
  // re-render, then push the merged state to the server.
  var setStatus = function(k) {
    window.setCrmStatus && window.setCrmStatus(fid, k);
    var next = Object.assign({}, crm, { status: k });
    setCrm(next);
    saveToServer(next);
  };
  var saveNotes = function(notes) {
    window.setCrmNotes && window.setCrmNotes(fid, notes);
    var next = Object.assign({}, crm, { notes: notes });
    setCrm(next);
    saveToServer(next);
  };

  /* contact form — a name is the only required field; the draft resets and the form collapses on
     successful save. */
  var [showContactForm, setShowContactForm] = React.useState(false);
  var [contactDraft, setContactDraft] = React.useState({ name: '', title: '', org: '', email: '', phone: '' });
  var submitContact = function() {
    if (!contactDraft.name.trim()) return;
    var updated = window.addCrmContact && window.addCrmContact(fid, contactDraft);
    if (updated) {
      var next = Object.assign({}, crm, { contacts: updated.contacts });
      setCrm(next);
      saveToServer(next);
    }
    setContactDraft({ name: '', title: '', org: '', email: '', phone: '' });
    setShowContactForm(false);
  };

  /* event form — activity log entry; date defaults to today (ISO yyyy-mm-dd), summary is required. */
  var [showEventForm, setShowEventForm] = React.useState(false);
  var [eventDraft, setEventDraft] = React.useState({ type: 'Call', date: new Date().toISOString().slice(0, 10), summary: '' });
  var submitEvent = function() {
    if (!eventDraft.summary.trim()) return;
    var updated = window.addCrmEvent && window.addCrmEvent(fid, eventDraft);
    if (updated) {
      var next = Object.assign({}, crm, { events: updated.events });
      setCrm(next);
      saveToServer(next);
    }
    setEventDraft({ type: 'Call', date: new Date().toISOString().slice(0, 10), summary: '' });
    setShowEventForm(false);
  };

  var removeContact = function(contactId) {
    window.removeCrmContact && window.removeCrmContact(fid, contactId);
    var next = Object.assign({}, crm, { contacts: crm.contacts.filter(function(x) { return x.id !== contactId; }) });
    setCrm(next);
    saveToServer(next);
  };
  var removeEvent = function(evId) {
    window.removeCrmEvent && window.removeCrmEvent(fid, evId);
    var next = Object.assign({}, crm, { events: crm.events.filter(function(x) { return x.id !== evId; }) });
    setCrm(next);
    saveToServer(next);
  };

  var label = window.cellLabel ? window.cellLabel(cell.properties) : (cell.properties._state || '');
  var coords = cell.lat != null ? cell.lat.toFixed(3) + 'N, ' + Math.abs(cell.lon).toFixed(3) + 'W' : null;

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {/* header */}
      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{label}</div>
            {geo && geo.display
              ? <div style={{ fontSize: 13, color: 'var(--slate)', marginTop: 2 }}>{geo.display}</div>
              : coords && <div className="microcopy" style={{ fontFamily: 'monospace', fontSize: 11 }}>{coords}</div>}
          </div>
          <div>
            <div className="microcopy" style={{ marginBottom: 5 }}>Status</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CRM_STATUSES.map(function(s) {
                var active = crm.status === s.k;
                return (
                  <button key={s.k} onClick={function() { setStatus(s.k); }}
                    style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, cursor: 'pointer', border: 'none',
                      background: active ? s.bg : 'var(--gate)', color: active ? s.color : 'var(--slate)',
                      outline: active ? ('2px solid ' + s.color) : '1px solid var(--line)', outlineOffset: active ? 1 : 0 }}>
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* contacts */}
      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Contacts</div>
          <button className="btn btn-quiet btn-sm" onClick={function() { setShowContactForm(!showContactForm); }}>
            {showContactForm ? 'Cancel' : '+ Add contact'}
          </button>
        </div>

        {showContactForm && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12, padding: '12px 14px', background: 'var(--sand)', borderRadius: 8 }}>
            {[['name', 'Name *'], ['title', 'Title'], ['org', 'Organization'], ['email', 'Email'], ['phone', 'Phone']].map(function(pair) {
              return (
                <input key={pair[0]} placeholder={pair[1]} value={contactDraft[pair[0]]}
                  onChange={function(e) { var v = e.target.value; setContactDraft(function(d) { var n = Object.assign({}, d); n[pair[0]] = v; return n; }); }}
                  style={{ gridColumn: pair[0] === 'name' ? 'span 2' : undefined, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 13 }} />
              );
            })}
            <button className="btn btn-primary btn-sm" style={{ gridColumn: 'span 2' }} onClick={submitContact}>Save contact</button>
          </div>
        )}

        {crm.contacts.length === 0 && !showContactForm && (
          <div className="microcopy" style={{ padding: '8px 0' }}>No contacts yet. Add someone from planning, utilities, or legal.</div>
        )}
        <div style={{ display: 'grid', gap: 8 }}>
          {crm.contacts.map(function(c) {
            return (
              <div key={c.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 8, background: 'var(--sand)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 650, fontSize: 13.5 }}>{c.name}</div>
                  {(c.title || c.org) && <div style={{ fontSize: 12, color: 'var(--slate)' }}>{[c.title, c.org].filter(Boolean).join(' · ')}</div>}
                  <div style={{ display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
                    {c.email && <a href={'mailto:' + c.email} style={{ fontSize: 12, color: 'var(--basalt)' }}>{c.email}</a>}
                    {c.phone && <span style={{ fontSize: 12, color: 'var(--slate)' }}>{c.phone}</span>}
                  </div>
                </div>
                <button onClick={function() { removeContact(c.id); }} style={{ background: 'none', border: 'none', color: 'var(--slate)', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>x</button>
              </div>
            );
          })}
        </div>
      </div>

      {/* activity log */}
      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Activity log</div>
          <button className="btn btn-quiet btn-sm" onClick={function() { setShowEventForm(!showEventForm); }}>
            {showEventForm ? 'Cancel' : '+ Log activity'}
          </button>
        </div>

        {showEventForm && (
          <div style={{ display: 'grid', gap: 8, marginBottom: 12, padding: '12px 14px', background: 'var(--sand)', borderRadius: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={eventDraft.type}
                onChange={function(e) { var v = e.target.value; setEventDraft(function(d) { return Object.assign({}, d, { type: v }); }); }}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 13 }}>
                {EVENT_TYPES.map(function(t) { return <option key={t}>{t}</option>; })}
              </select>
              <input type="date" value={eventDraft.date}
                onChange={function(e) { var v = e.target.value; setEventDraft(function(d) { return Object.assign({}, d, { date: v }); }); }}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 13, flex: 1 }} />
            </div>
            <textarea placeholder="What happened? Who was involved? What are the next steps?" value={eventDraft.summary} rows={3}
              onChange={function(e) { var v = e.target.value; setEventDraft(function(d) { return Object.assign({}, d, { summary: v }); }); }}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
            <button className="btn btn-primary btn-sm" onClick={submitEvent}>Save</button>
          </div>
        )}

        {crm.events.length === 0 && !showEventForm && (
          <div className="microcopy" style={{ padding: '8px 0' }}>No activity logged yet.</div>
        )}
        <div style={{ display: 'grid', gap: 6 }}>
          {crm.events.map(function(ev) {
            return (
              <div key={ev.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 8, background: 'var(--sand)', borderLeft: '3px solid var(--line)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--basalt)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{ev.type}</span>
                    <span className="microcopy">{ev.date}</span>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.5 }}>{ev.summary}</div>
                </div>
                <button onClick={function() { removeEvent(ev.id); }} style={{ background: 'none', border: 'none', color: 'var(--slate)', cursor: 'pointer', fontSize: 14, padding: '0 4px', flexShrink: 0 }}>x</button>
              </div>
            );
          })}
        </div>
      </div>

      {/* notes */}
      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Notes</div>
        <textarea
          defaultValue={crm.notes}
          placeholder="Site notes, open questions, context for the team..."
          rows={5}
          onBlur={function(e) { saveNotes(e.target.value); }}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--sand)', color: 'inherit', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        <div className="microcopy" style={{ marginTop: 4 }}>Auto-saves on blur.</div>
      </div>
    </div>
  );
}

/* Top-level component for the Status tab (#/builder/status) — a master/detail layout: left column
   lists every saved cell with a status badge + most recent activity-log entry, right column shows
   the full CrmPanel for whichever cell is selected. Defaults to selecting the first saved cell. */
function StatusPage() {
  var savedCells = window.getSavedCells ? window.getSavedCells() : [];
  var allCrm = window.getAllCrm ? window.getAllCrm() : {};
  var [selectedFid, setSelectedFid] = React.useState(savedCells.length ? savedCells[0].fid : null);
  var [geos, setGeos] = React.useState(function() {
    var out = {};
    savedCells.forEach(function(c) {
      if (window.getCachedMunicipality) out[c.fid] = window.getCachedMunicipality(c.fid);
    });
    return out;
  });

  React.useEffect(function() {
    savedCells.forEach(function(c) {
      if (geos[c.fid] || c.lat == null) return;
      window.fetchMunicipality && window.fetchMunicipality(c.fid, c.lat, c.lon).then(function(r) {
        if (r) setGeos(function(g) { var n = Object.assign({}, g); n[c.fid] = r; return n; });
      });
    });
  }, []);

  var selectedCell = savedCells.find(function(c) { return c.fid === selectedFid; }) || null;

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Builder — Status">
      <BuilderSubNav active="status" />
      {savedCells.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 24px', color: 'var(--slate)' }}>
          <div style={{ fontSize: 52, lineHeight: 1 }}>&#9711;</div>
          <h3 style={{ fontSize: 18, marginTop: 12 }}>No saved sites yet.</h3>
          <p className="microcopy" style={{ maxWidth: 360, margin: '8px auto 20px', fontSize: 13.5, lineHeight: 1.6 }}>
            Save cells from the Explorer workspace to start tracking site progress.
          </p>
          <a className="btn btn-primary" href="#/builder">Open Workspace</a>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          {/* left: cell list */}
          <div style={{ width: 260, flexShrink: 0, display: 'grid', gap: 8, maxHeight: '80vh', overflowY: 'auto', paddingRight: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <a className="btn btn-ghost btn-sm"
                href={'/api/export/status?session_id=' + (window.MERA_SESSION || '')}
                download="merascope_status.csv"
                title="Export activity log to CSV">
                Export CSV
              </a>
            </div>
            {savedCells.map(function(cell) {
              var crm = allCrm[cell.fid] || { status: 'researching', events: [] };
              var lastEv = crm.events && crm.events[0];
              var cellLbl = window.cellLabel ? window.cellLabel(cell.properties) : (cell.properties._state || '');
              var geo = geos[cell.fid];
              var active = cell.fid === selectedFid;
              return (
                <div key={cell.fid} className="card" onClick={function() { setSelectedFid(cell.fid); }}
                  style={{ padding: '10px 13px', cursor: 'pointer',
                    boxShadow: active ? '0 0 0 2px var(--basalt)' : undefined,
                    borderColor: active ? 'var(--basalt)' : undefined }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, minWidth: 0 }}>{cellLbl}</div>
                    <CrmStatusBadge status={crm.status} />
                  </div>
                  {geo && geo.display
                    ? <div style={{ fontSize: 11.5, color: 'var(--slate)' }}>{geo.display}</div>
                    : <div className="microcopy">{cell.properties._state || ''}</div>}
                  {lastEv && (
                    <div style={{ fontSize: 11, color: 'var(--slate)', marginTop: 5, borderTop: '1px solid var(--line-soft)', paddingTop: 5 }}>
                      <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: '.05em', marginRight: 5 }}>{lastEv.type}</span>
                      {lastEv.date} — {lastEv.summary.slice(0, 60)}{lastEv.summary.length > 60 ? '...' : ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* right: CRM panel */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {selectedCell
              ? <CrmPanel key={selectedFid} fid={selectedFid} cell={selectedCell} geo={geos[selectedFid] || null} />
              : <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--slate)' }}>Select a site on the left.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Portfolio Screening helpers ──
   Pure functions (no React) used by PortfolioPage below to turn an uploaded CSV into scored,
   gate-checked results — kept outside the component so they're easy to reason about independently. */

/* Minimal CSV parser: splits on commas (no quoted-comma support), trims whitespace and surrounding
   quote characters from every cell. First line is always treated as the header row. Returns null if
   there isn't at least one data row after the header. */
function parsePortfolioCSV(text) {
  var lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  var headers = lines[0].split(',').map(function(h) { return h.trim().replace(/^["']+|["']+$/g, ''); });
  var rows = [];
  for (var i = 1; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var vals = line.split(',').map(function(v) { return v.trim().replace(/^["']+|["']+$/g, ''); });
    var row = {};
    headers.forEach(function(h, j) { row[h] = vals[j] != null ? vals[j] : ''; });
    rows.push(row);
  }
  return { headers: headers, rows: rows };
}

/* Guesses which uploaded columns are name/lat/lon by matching lower-cased header text against a list
   of common aliases (e.g. 'lng' or 'long' for longitude). Returns '' for any column the user needs to
   pick manually in the mapping step. */
function autoDetectPortfolioCols(headers) {
  var lc = headers.map(function(h) { return h.toLowerCase(); });
  var find = function(candidates) {
    for (var i = 0; i < candidates.length; i++) {
      var idx = lc.indexOf(candidates[i]);
      if (idx !== -1) return headers[idx];
    }
    return '';
  };
  return {
    nameCol: find(['name','label','site','candidate','project','id','site_name']),
    latCol:  find(['lat','latitude','y','lat_dd']),
    lonCol:  find(['lon','lng','longitude','long','x','lon_dd']),
  };
}

/* Core screening engine: for every uploaded row, finds the nearest grid cell (client-side, via
   window.findNearestCell — brute-force lat/lon search against the already-loaded _gridCache, no
   server round-trip), scores it, checks both hard gates, and decides PASS/FAIL against the given
   score threshold. A row can fail for three distinct reasons that are NOT mutually exclusive with a
   found cell: bad coordinates, no nearby cell at all, or a found cell that fails a gate/threshold —
   each produces a different `error`/`reasons` shape so the results table can explain exactly why.
   Terrain is computed (`terrainOk`) but — matching the rest of the app — is not a hard gate here
   either; only `protected` and `flood` feed into `gatesOk`/`pass`. */
function screenPortfolioRows(rows, colMap, threshold) {
  var M   = window.MERA;
  var pi  = window.propsToInd;
  var clf = window.cellLabel;
  var fnc = window.findNearestCell;
  var out = [];
  rows.forEach(function(row, idx) {
    var name = (colMap.nameCol && row[colMap.nameCol]) ? row[colMap.nameCol] : ('Site ' + (idx + 1));
    var lat  = parseFloat(row[colMap.latCol]);
    var lon  = parseFloat(row[colMap.lonCol]);
    if (isNaN(lat) || isNaN(lon)) {
      out.push({ name: name, error: 'Invalid coordinates' });
      return;
    }
    var match = fnc ? fnc(lat, lon) : null;
    if (!match || !match.feature) {
      out.push({ name: name, lat: lat, lon: lon, error: 'No cell found' });
      return;
    }
    var feat = match.feature;
    var p    = feat.properties;
    // Always scored at the active site_type's default weights (national scale) — portfolio screening
    // is a bulk/objective pass, not tied to any one user's tuned Explorer weights. See M.weightsForSiteType.
    var _dw = M ? M.weightsForSiteType(window.getCurrentSiteType()) : null;
    var natComp   = (pi && M) ? M.composite(pi(p, true),  _dw) : null;
    var stateComp = (pi && M) ? M.composite(pi(p, false), _dw) : null;
    // Same "missing property fails safe" defaults as SavedCellCard's viability check.
    var flat  = p.flat_frac      != null ? p.flat_frac      : 0;
    var prot  = p.protected_frac != null ? p.protected_frac : 1;
    var flood = p.flood_score    != null ? p.flood_score    : 0;
    var terrainOk   = flat  >= 0.03;
    var protectedOk = prot  <= 0.25;
    var floodOk     = flood  > 0;
    var gatesOk     = protectedOk && floodOk;
    var scoreOk     = natComp != null && natComp >= threshold;
    var reasons     = [];
    if (!protectedOk)            reasons.push('Protected: ' + (prot*100).toFixed(0) + '% (need <=25%)');
    if (!floodOk)                reasons.push('Flood: SFHA overlap');
    // Score-threshold reason is only reported once the gates already pass — a gate failure is the
    // more actionable/primary reason and we don't want to bury it under a secondary score complaint.
    if (gatesOk && !scoreOk)     reasons.push('Score ' + (natComp||0).toFixed(3) + ' below threshold ' + threshold.toFixed(2));
    out.push({
      name: name, lat: lat, lon: lon, feature: feat,
      label: clf ? clf(p) : (p._state || ''),
      distKm: match.distDeg * 111,
      natComp: natComp, stateComp: stateComp,
      terrainOk: terrainOk, protectedOk: protectedOk, floodOk: floodOk,
      pass: gatesOk && scoreOk, reasons: reasons,
    });
  });
  return out;
}

/* Top-level component for the Portfolio screening tab (#/builder/portfolio). A wizard with four
   stages tracked in `stage` state: 'upload' (drop a CSV) -> 'mapping' (confirm which columns are
   name/lat/lon + set the pass threshold) -> 'running' (loads the full 48-state grid into memory if
   not already cached, then screens every row) -> 'results' (sortable/exportable PASS/FAIL table). */
function PortfolioPage() {
  var M   = window.MERA;
  var ctx = React.useContext(MeraCtx);
  var ramp = ctx ? ctx.ramp : null;

  var [stage,     setStage]     = React.useState('upload');
  var [parsed,    setParsed]    = React.useState(null);
  var [colMap,    setColMap]    = React.useState({ nameCol: '', latCol: '', lonCol: '' });
  var [threshold, setThreshold] = React.useState(0.50);
  var [results,   setResults]   = React.useState([]);
  var [killOnly,  setKillOnly]  = React.useState(false);
  var [err,       setErr]       = React.useState(null);

  var handleFile = function(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
      var p = parsePortfolioCSV(e.target.result);
      if (!p || !p.rows.length) {
        setErr('Could not parse file. Make sure it is a CSV with headers in the first row.');
        return;
      }
      setParsed(p);
      setColMap(autoDetectPortfolioCols(p.headers));
      setStage('mapping');
      setErr(null);
    };
    reader.readAsText(file);
  };

  // Ensures the full national grid is loaded (loadGridCache() is idempotent/cached — a second
  // portfolio run in the same session is near-instant) before running screenPortfolioRows, then logs
  // a summary event (pass/fail counts + threshold) for usage analytics.
  var runScreening = function() {
    if (!colMap.latCol || !colMap.lonCol) { setErr('Select latitude and longitude columns.'); return; }
    setStage('running');
    window.loadGridCache().then(function() {
      var res = screenPortfolioRows(parsed.rows, colMap, threshold);
      setResults(res);
      setStage('results');
      var passCount = res.filter(function(r) { return r.pass; }).length;
      window.serverLog && window.serverLog('portfolio_run', null, {
        total: res.length, pass: passCount, fail: res.length - passCount, threshold: threshold
      });
    }).catch(function(e) {
      setErr('Error loading grid: ' + (e && e.message ? e.message : String(e)));
      setStage('mapping');
    });
  };

  // Client-side CSV export (no server round-trip) — builds a data: URI and triggers a synthetic
  // click on a hidden <a download> to save the file, then removes the element.
  var exportResults = function() {
    var hdr  = ['name','cell','lat_input','lon_input','dist_km','nat_composite','state_composite','protected','flood','result','failure_reasons'];
    var body = results.map(function(r) {
      return [
        r.name, r.label || '',
        r.lat != null ? r.lat : '', r.lon != null ? r.lon : '',
        r.distKm != null ? r.distKm.toFixed(1) : '',
        r.natComp   != null ? r.natComp.toFixed(4)   : '',
        r.stateComp != null ? r.stateComp.toFixed(4) : '',
        r.protectedOk != null ? (r.protectedOk ? 'PASS' : 'FAIL') : '',
        r.floodOk     != null ? (r.floodOk     ? 'PASS' : 'FAIL') : '',
        r.error ? 'ERROR' : (r.pass ? 'PASS' : 'FAIL'),
        r.error || (r.reasons && r.reasons.join('; ')) || ''
      ].map(function(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
    });
    var csv = [hdr.join(',')].concat(body).join('\n');
    var a   = document.createElement('a');
    a.href  = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'merascope_portfolio.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  var setColVal = function(key, val) {
    setColMap(function(m) { var n = Object.assign({}, m); n[key] = val; return n; });
  };

  var displayRows = killOnly ? results.filter(function(r) { return !r.pass; }) : results;
  var passCount   = results.filter(function(r) { return r.pass; }).length;
  var failCount   = results.length - passCount;

  var GatePill = function(ok) {
    return ok
      ? React.createElement('span', { style: { fontSize: 11, fontWeight: 700, color: 'var(--lo-tx)' } }, 'PASS')
      : React.createElement('span', { style: { fontSize: 11, fontWeight: 700, color: 'var(--hi-tx)' } }, 'FAIL');
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Builder -- Portfolio screening">
      <BuilderSubNav active="portfolio" />

      {stage === 'upload' && (
        <div>
          <div style={{ maxWidth: 560, marginBottom: 24 }}>
            <h3 style={{ fontSize: 17, marginBottom: 6 }}>Portfolio screening</h3>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--slate)', margin: 0 }}>
              Upload a CSV of candidate sites. Merascope will match each coordinate to the nearest grid cell, apply all hard gates, and score it against the national dataset.
            </p>
          </div>
          {err && <div style={{ padding: '10px 14px', background: '#fde8e8', color: '#c0392b', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{err}</div>}
          <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '44px 24px', border: '2px dashed var(--line)', borderRadius: 14, cursor: 'pointer', textAlign: 'center', maxWidth: 460 }}>
            <div style={{ fontSize: 42, lineHeight: 1 }}>+</div>
            <div style={{ fontSize: 15, fontWeight: 650 }}>Upload CSV</div>
            <div className="microcopy" style={{ maxWidth: 320 }}>First row must be headers. Needs at least latitude and longitude columns. A name column becomes the site label.</div>
            <div className="microcopy" style={{ marginTop: 2 }}>Recognized column names: <code>lat</code>, <code>latitude</code>, <code>lon</code>, <code>lng</code>, <code>longitude</code>, <code>name</code></div>
            <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={function(e) { handleFile(e.target.files[0]); }} />
          </label>
        </div>
      )}

      {stage === 'mapping' && parsed && (
        <div style={{ maxWidth: 580 }}>
          <h3 style={{ fontSize: 17, marginBottom: 4 }}>Column mapping</h3>
          <p className="microcopy" style={{ marginBottom: 18 }}>
            Found <span className="score-serif">{parsed.rows.length}</span> rows across <span className="score-serif">{parsed.headers.length}</span> columns.
          </p>
          {err && <div style={{ padding: '10px 14px', background: '#fde8e8', color: '#c0392b', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{err}</div>}

          {[['nameCol','Site name (optional)'],['latCol','Latitude *'],['lonCol','Longitude *']].map(function(pair) {
            return (
              <div key={pair[0]} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 650, display: 'block', marginBottom: 4 }}>{pair[1]}</label>
                <select value={colMap[pair[0]]} onChange={function(e) { setColVal(pair[0], e.target.value); }}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 13 }}>
                  <option value="">{pair[0] === 'nameCol' ? '-- use row number --' : '-- select --'}</option>
                  {parsed.headers.map(function(h) { return <option key={h} value={h}>{h}</option>; })}
                </select>
              </div>
            );
          })}

          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 13, fontWeight: 650, display: 'block', marginBottom: 4 }}>
              Minimum composite score to PASS: <span className="score-serif">{threshold.toFixed(2)}</span>
            </label>
            <input type="range" min="0" max="1" step="0.05" value={threshold}
              onChange={function(e) { setThreshold(parseFloat(e.target.value)); }}
              style={{ width: '100%' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--slate)', marginTop: 3 }}>
              <span>0.00 (any)</span><span>0.50 (default)</span><span>1.00 (max)</span>
            </div>
          </div>

          <div className="card" style={{ overflow: 'auto', marginBottom: 18, maxHeight: 190 }}>
            <table className="mtable">
              <thead><tr>{parsed.headers.map(function(h) { return <th key={h}>{h}</th>; })}</tr></thead>
              <tbody>
                {parsed.rows.slice(0, 5).map(function(row, i) {
                  return <tr key={i}>{parsed.headers.map(function(h) { return <td key={h} style={{ fontSize: 12 }}>{row[h]}</td>; })}</tr>;
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={runScreening}>Run screening</button>
            <button className="btn btn-quiet" onClick={function() { setStage('upload'); setParsed(null); setErr(null); }}>Back</button>
          </div>
        </div>
      )}

      {stage === 'running' && (
        <div style={{ textAlign: 'center', padding: '80px 24px', color: 'var(--slate)' }}>
          <div className="shimmer" style={{ height: 4, borderRadius: 2, maxWidth: 320, margin: '0 auto 20px' }} />
          <div style={{ fontSize: 15 }}>Loading grid and scoring {parsed ? parsed.rows.length : ''} candidates...</div>
          <div className="microcopy" style={{ marginTop: 6 }}>The first run loads all 48 states into memory. Subsequent runs are instant.</div>
        </div>
      )}

      {stage === 'results' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            <div>
              <h3 style={{ fontSize: 17, margin: 0 }}>Screening results</h3>
              <p className="microcopy" style={{ margin: '4px 0 0' }}>
                <span className="score-serif">{results.length}</span> candidates &middot;
                <span className="score-serif" style={{ color: 'var(--lo-tx)', margin: '0 3px' }}>{passCount}</span> pass &middot;
                <span className="score-serif" style={{ color: 'var(--hi-tx)', margin: '0 3px' }}>{failCount}</span> fail &middot;
                threshold {threshold.toFixed(2)}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 650 }}>
                <input type="checkbox" checked={killOnly} onChange={function(e) { setKillOnly(e.target.checked); }} /> Failures only
              </label>
              <button className="btn btn-quiet btn-sm" onClick={exportResults}>Export CSV</button>
              <button className="btn btn-ghost btn-sm" onClick={function() { setStage('upload'); setParsed(null); setResults([]); setErr(null); }}>New upload</button>
            </div>
          </div>

          <div className="card" style={{ overflow: 'auto' }}>
            <table className="mtable">
              <thead>
                <tr>
                  <th style={{ minWidth: 140 }}>Name</th>
                  <th style={{ minWidth: 130 }}>Cell</th>
                  <th style={{ minWidth: 72 }}>Dist.</th>
                  <th style={{ minWidth: 90 }}>National</th>
                  <th style={{ minWidth: 90 }}>In-state</th>
                  <th>Protected</th>
                  <th>Flood</th>
                  <th style={{ minWidth: 68 }}>Result</th>
                  <th style={{ minWidth: 220 }}>Why</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map(function(r, i) {
                  if (r.error) {
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 650 }}>{r.name}</td>
                        <td colSpan={8} style={{ fontSize: 12, color: '#c0392b' }}>{r.error}</td>
                      </tr>
                    );
                  }
                  var poorMatch = r.distKm > 25;
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 650 }}>{r.name}</td>
                      <td style={{ fontSize: 12 }}>{r.label}</td>
                      <td style={{ fontSize: 12, color: poorMatch ? '#c0392b' : 'var(--slate)', whiteSpace: 'nowrap' }}>
                        {r.distKm.toFixed(1)} km{poorMatch ? ' !' : ''}
                      </td>
                      <td>{r.natComp != null && M
                        ? <span className="score-badge" style={{ background: M.rampColor(r.natComp, ramp), color: M.rampText(r.natComp, ramp), fontSize: 12 }}>{r.natComp.toFixed(3)}</span>
                        : <span className="microcopy">--</span>}</td>
                      <td>{r.stateComp != null && M
                        ? <span className="score-badge" style={{ background: M.rampColor(r.stateComp, ramp), color: M.rampText(r.stateComp, ramp), fontSize: 12 }}>{r.stateComp.toFixed(3)}</span>
                        : <span className="microcopy">--</span>}</td>
                      <td>{GatePill(r.protectedOk)}</td>
                      <td>{GatePill(r.floodOk)}</td>
                      <td>{r.pass ? <Chip tone="lo">PASS</Chip> : <Chip tone="hi">FAIL</Chip>}</td>
                      <td style={{ fontSize: 12, color: 'var(--slate)', maxWidth: 260 }}>
                        {r.reasons && r.reasons.length ? r.reasons.join(' | ') : '--'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="microcopy" style={{ marginTop: 10 }}>
            Dist. = km from your coordinate to the nearest cell centroid. Values above 25 km (!) may indicate a point outside the covered grid (coast, border, reservation).
            Hard gates: Protected land and Flood only. Rugged terrain is penalized in the composite score but does not block a PASS.
          </p>
        </div>
      )}
    </div>
  );
}

// Expose these page components on window for app.jsx's router (no bundler/module system — see the
// file header note).
Object.assign(window, { SiteProfile, StatusPage, PortfolioPage });
