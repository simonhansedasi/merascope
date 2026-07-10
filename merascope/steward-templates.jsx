/* ── Steward template + zone management ── */

/*
 * steward-templates.jsx — the "Weight templates" surface (#/steward/templates),
 * added 2026-06-22. Separate concern from the rest of the steward files: where
 * steward.jsx/steward2.jsx manage individual cases, this file lets a lead
 * agency define reusable *scoring* policy and attach it to a geography.
 *
 * The core idea: a steward names a set of indicator weights (a "template",
 * e.g. "Water-First"), sets a minimum composite score under those weights, and
 * attaches the template to a "zone" (a state, county, ZCTA, or custom bounding
 * box). If the steward locks the template, any builder whose cell falls inside
 * that zone and scores below the minimum sees a gate warning in the Explorer
 * hover tooltip (implemented in map.jsx's _checkStewardGateLocal / gate_check
 * fetch — this file only manages the templates/zones, not the gating itself).
 * Five starter templates ship as server-side constants (PRESET_TEMPLATES in
 * server.py) and are offered via PresetPickerModal below; stewards can also
 * build a template from scratch with WeightEditor. Every save to a template
 * writes a history row server-side, browsable and revertible from
 * ZoneDetailPanel's "Change log".
 *
 * Top-level component is StewardTemplatesPage at the bottom of this file,
 * which composes ZoneListPanel (left rail) + ZoneDetailPanel (editor) and
 * hangs off the same StewardSubNav tab bar as steward.jsx/steward2.jsx.
 */

// Every US state as [code, full name] pairs, sorted alphabetically by name —
// feeds the state <select> dropdowns in ZoneDetailPanel's state/county/zcta
// zone-type forms below.
var STATE_LIST = Object.entries(window.STATE_NAMES || {}).sort((a, b) => a[1].localeCompare(b[1]));

/* ── mini weight bar used in preset cards and zone detail ── */
// Read-only horizontal bar chart of a weight set — one row per indicator that
// has a non-zero weight, sorted in whatever order M.INDICATORS defines. Used
// both to preview a preset before picking it (PresetPickerModal) and to show
// a selected template's current weights in the zone detail panel. Percentages
// are normalized against the sum of active weights, not against 100 directly,
// so partial/sparse weight sets (e.g. only 3 of 15 indicators set) still read
// as a sensible 0-100% breakdown.
function WeightBars({ weights }) {
  var M = window.MERA;
  var total = M.INDICATORS.reduce(function(s, m) { return s + (weights[m.k] || 0); }, 0) || 1;
  var active = M.INDICATORS.filter(function(m) { return (weights[m.k] || 0) > 0; });
  if (!active.length) return <span className="microcopy" style={{ color: 'var(--slate)' }}>No weights set</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {active.map(function(m) {
        var pct = Math.round((weights[m.k] || 0) / total * 100);
        return (
          <div key={m.k} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 11.5, color: 'var(--slate)', width: 130, flexShrink: 0 }}>{m.label}</span>
            <div style={{ flex: 1, height: 6, background: 'var(--line)', borderRadius: 3 }}>
              <div style={{ width: pct + '%', height: '100%', background: 'var(--evergreen)', borderRadius: 3 }} />
            </div>
            <span className="score-serif" style={{ fontSize: 11, width: 28, textAlign: 'right', color: 'var(--basalt)' }}>{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── weight editor: sliders + number inputs for all indicators ── */
// Full editable form for a weight template — one slider + linked number input
// per indicator in M.INDICATORS, all 0-100 raw values (not yet normalized;
// normalization to percentages is display-only, same math as WeightBars).
// Controlled from outside: this component holds no state of its own, it just
// calls onChange(nextWeightsObject) on every edit so the parent (ZoneDetailPanel)
// owns the draft until "Save template" is clicked.
function WeightEditor({ weights, onChange }) {
  var M = window.MERA;
  var total = M.INDICATORS.reduce(function(s, m) { return s + (weights[m.k] || 0); }, 0) || 1;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {M.INDICATORS.map(function(m) {
        var raw = Math.round(weights[m.k] || 0);
        var pct = Math.round(raw / total * 100);
        return (
          <div key={m.k}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 2 }}>
              <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', color: 'var(--ink)', fontWeight: 600 }}>
                <Icon name={m.icon} color="var(--slate)" size={12} /> {m.label}
              </span>
              <span className="score-serif" style={{ color: raw > 0 ? 'var(--basalt)' : 'var(--slate)', fontWeight: 600 }}>{pct}%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input className="mslider" type="range" min="0" max="100" step="1"
                style={{ flex: 1 }}
                value={raw} aria-label={m.label}
                onChange={function(e) {
                  var next = Object.assign({}, weights);
                  next[m.k] = +e.target.value;
                  onChange(next);
                }} />
              <input type="number" min="0" max="100" step="1"
                style={{ width: 52, padding: '3px 6px', borderRadius: 6, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 13, fontFamily: 'inherit', textAlign: 'right' }}
                value={raw}
                onChange={function(e) {
                  var v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                  var next = Object.assign({}, weights);
                  next[m.k] = v;
                  onChange(next);
                }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── preset picker modal ── */
// Full-screen overlay offering the 5 starter templates (PRESET_TEMPLATES,
// server-side constants — never stored in the DB, fetched fresh each time via
// GET /api/steward/presets) as a shortcut to creating a new named template.
// Picking a preset (either the card or its button) calls onPick(p); the
// caller (ZoneDetailPanel.applyPreset) is responsible for actually POSTing a
// new template row using this preset's weights/min_score as the starting values.
function PresetPickerModal({ presets, onPick, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
         onClick={onClose}>
      <div style={{ background: 'var(--paper)', borderRadius: 14, padding: '24px 28px', maxWidth: 700, width: '90vw', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,.25)' }}
           onClick={function(e) { e.stopPropagation(); }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Choose a preset template</h3>
          <button className="btn btn-quiet btn-sm" onClick={onClose}>Close</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {presets.map(function(p) {
            return (
              <div key={p.id} className="card" style={{ padding: 16, cursor: 'pointer', borderColor: 'transparent' }}
                   onClick={function() { onPick(p); }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{p.name}</div>
                <p className="microcopy" style={{ margin: '0 0 10px', lineHeight: 1.5 }}>{p.description}</p>
                <WeightBars weights={p.weights} />
                <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="microcopy">Min score</span>
                  <span className="score-serif" style={{ fontSize: 13, fontWeight: 700 }}>{p.min_score.toFixed(2)}</span>
                </div>
                <button className="btn btn-primary btn-sm" style={{ marginTop: 12, width: '100%' }}
                        onClick={function(e) { e.stopPropagation(); onPick(p); }}>Use this template</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── zone detail panel ── */
// The create/edit form for a single zone — the heart of this file. A zone
// pairs a geography (state / county / ZCTA / custom bbox, chosen via
// zone_type) with an optional weight template. Selecting a template pulls its
// weights/min_score into local editable state (localWeights/localMinScore) so
// changes can be previewed before "Save template" persists them; locking the
// template is what actually turns the zone into a binding gate — unlocked
// templates are advisory only, builders aren't blocked. Also surfaces the
// template's change history with per-entry rollback. Rendered by
// StewardTemplatesPage for both new zones (isNew, zone has no id) and
// existing ones (passed a real zone row with a `key` forcing remount on
// selection change, so this component's local state never leaks between zones).
function ZoneDetailPanel({ zone, templates, presets, onSave, onDelete, onClose, onTemplateCreated, onTemplateUpdated }) {
  var isNew = !zone.id;
  // draft holds the in-progress edits to the zone's own fields (name, geography,
  // which template_id it points to) — separate from localWeights/localMinScore,
  // which track edits to the *template itself* once one is selected.
  var [draft, setDraft] = React.useState(function() { return Object.assign({}, zone); });
  var [showWeightEditor, setShowWeightEditor] = React.useState(false);
  var [showPresets, setShowPresets] = React.useState(false);
  var [saving, setSaving] = React.useState(false);
  var [err, setErr] = React.useState(null);
  var [localWeights, setLocalWeights] = React.useState({});
  var [localMinScore, setLocalMinScore] = React.useState(0);
  var [history, setHistory] = React.useState([]);

  // Generic single-field updater for the draft object, used by every input below.
  function set(k, v) { setDraft(function(d) { return Object.assign({}, d, {[k]: v}); }); }

  // Look up the full template row (with its live weights/min_score/locked
  // state) that corresponds to whatever template_id is currently selected in
  // the draft — null if none chosen yet.
  var selectedTemplate = templates.find(function(t) { return t.id === draft.template_id; }) || null;

  // When the selected template changes (including on first mount if the zone
  // already has one), seed the local editable weight/min-score state from it
  // and fetch its change history. Keyed only on the template's id (not the
  // whole object) so this doesn't re-fire on every render.
  React.useEffect(function() {
    if (selectedTemplate) {
      setLocalWeights(selectedTemplate.weights || {});
      setLocalMinScore(selectedTemplate.min_score || 0);
      fetch('/api/steward/templates/' + selectedTemplate.id + '/history')
        .then(function(r) { return r.json(); })
        .then(function(d) { if (Array.isArray(d)) setHistory(d); });
    } else {
      setHistory([]);
    }
  }, [selectedTemplate ? selectedTemplate.id : null]);

  // Re-pull the change log after an action (rollback, lock toggle) that the
  // server logs as a new history entry, so the log stays current without a
  // full page reload.
  function refreshHistory(tmplId) {
    fetch('/api/steward/templates/' + tmplId + '/history')
      .then(function(r) { return r.json(); })
      .then(function(d) { if (Array.isArray(d)) setHistory(d); });
  }

  // Revert the template to a prior state recorded in its history (server does
  // the actual revert and returns the restored weights/min_score/locked);
  // mirror that result into local state and notify the parent list so other
  // views (e.g. the zone list's lock icon) stay in sync.
  function handleRollback(histId) {
    if (!selectedTemplate) return;
    fetch('/api/steward/templates/' + selectedTemplate.id + '/rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history_id: histId })
    }).then(function(r) { return r.json(); }).then(function(d) {
      if (d.ok) {
        if (onTemplateUpdated) onTemplateUpdated(selectedTemplate.id, { weights: d.weights, min_score: d.min_score, locked: d.locked });
        setLocalWeights(d.weights);
        setLocalMinScore(d.min_score);
        refreshHistory(selectedTemplate.id);
      }
    });
  }

  // Turn a chosen preset (from PresetPickerModal) into a real, persisted
  // template row via POST, then point this zone's draft at the newly created
  // template's id. Presets themselves are never mutated — this always creates
  // a fresh template so multiple zones can start from the same preset and
  // diverge independently.
  function applyPreset(p) {
    var name = p.name;
    fetch('/api/steward/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, weights: p.weights, min_score: p.min_score })
    })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.ok) {
          var newT = { id: d.id, name: name, weights: p.weights, min_score: p.min_score, locked: 0 };
          if (onTemplateCreated) onTemplateCreated(newT);
          setDraft(function(prev) { return Object.assign({}, prev, { template_id: d.id }); });
        }
        setShowPresets(false);
      });
  }

  // Persist the zone itself (its geography fields + which template it points
  // to — NOT the template's weights, which save separately via the "Save
  // template" button below). POST for a new zone, PATCH for an existing one.
  function handleSave() {
    setSaving(true); setErr(null);
    var payload = {
      name:        draft.name,
      zone_type:   draft.zone_type || 'state',
      state_code:  draft.state_code || null,
      bbox:        draft.bbox || null,
      county_fips: draft.county_fips || null,
      zcta_code:   draft.zcta_code || null,
      template_id: draft.template_id || null,
    };
    var url    = draft.id ? '/api/steward/zones/' + draft.id : '/api/steward/zones';
    var method = draft.id ? 'PATCH' : 'POST';
    fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        setSaving(false);
        if (d.ok) onSave();
        else setErr(d.err || 'Save failed');
      })
      .catch(function() { setSaving(false); setErr('Network error'); });
  }

  function handleDelete() {
    if (!draft.id || !confirm('Delete zone "' + draft.name + '"?')) return;
    fetch('/api/steward/zones/' + draft.id, { method: 'DELETE' })
      .then(function(r) { return r.json(); })
      .then(function(d) { if (d.ok) onDelete(); });
  }

  // Flip the selected template's locked flag. This is the switch that
  // actually turns a template from advisory into a binding gate — the
  // enforcement logic (blocking builders whose cell scores below min_score)
  // lives in map.jsx, not here; this just toggles the flag the server checks.
  function handleLockToggle() {
    if (!selectedTemplate) return;
    var newLocked = selectedTemplate.locked ? 0 : 1;
    fetch('/api/steward/templates/' + selectedTemplate.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locked: newLocked })
    })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.ok) {
          if (onTemplateUpdated) onTemplateUpdated(selectedTemplate.id, { locked: newLocked });
          refreshHistory(selectedTemplate.id);
          onSave();
        }
      });
  }

  var ztype = draft.zone_type || 'state';

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {showPresets && <PresetPickerModal presets={presets} onPick={applyPreset} onClose={function() { setShowPresets(false); }} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{isNew ? 'New zone' : 'Edit zone'}</h3>
        <button className="btn btn-quiet btn-sm" onClick={onClose}>Cancel</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Zone name */}
        <div>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: 5 }}>Zone name</label>
          <input style={{ padding: '8px 11px', borderRadius: 7, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} type="text"
            placeholder="e.g. King County, Seattle Moratorium Area"
            value={draft.name || ''} onChange={function(e) { set('name', e.target.value); }} />
        </div>

        {/* Zone type */}
        <div>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: 7 }}>Zone type</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[['state', 'State'], ['county', 'County'], ['zcta', 'ZCTA'], ['bbox', 'Custom bbox']].map(function(pair) {
              return (
                <button key={pair[0]} className={'btn btn-sm ' + (ztype === pair[0] ? 'btn-primary' : 'btn-ghost')}
                        onClick={function() { set('zone_type', pair[0]); }}>
                  {pair[1]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Conditional geography inputs */}
        {ztype === 'state' && (
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: 5 }}>State</label>
            <select style={{ padding: '8px 11px', borderRadius: 7, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} value={draft.state_code || ''} onChange={function(e) { set('state_code', e.target.value); }}>
              <option value="">-- pick a state --</option>
              {STATE_LIST.map(function(pair) {
                return <option key={pair[0]} value={pair[0]}>{pair[1]}</option>;
              })}
            </select>
          </div>
        )}

        {ztype === 'county' && (
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: 5 }}>State</label>
              <select style={{ padding: '8px 11px', borderRadius: 7, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} value={draft.state_code || ''} onChange={function(e) { set('state_code', e.target.value); }}>
                <option value="">-- state --</option>
                {STATE_LIST.map(function(pair) {
                  return <option key={pair[0]} value={pair[0]}>{pair[1]}</option>;
                })}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: 5 }}>County FIPS <span className="microcopy">(3-digit)</span></label>
              <input style={{ padding: '8px 11px', borderRadius: 7, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} type="text" maxLength={3} placeholder="033"
                value={draft.county_fips || ''} onChange={function(e) { set('county_fips', e.target.value.replace(/\D/g, '')); }} />
            </div>
          </div>
        )}

        {ztype === 'zcta' && (
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: 5 }}>State</label>
              <select style={{ padding: '8px 11px', borderRadius: 7, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} value={draft.state_code || ''} onChange={function(e) { set('state_code', e.target.value); }}>
                <option value="">-- state --</option>
                {STATE_LIST.map(function(pair) {
                  return <option key={pair[0]} value={pair[0]}>{pair[1]}</option>;
                })}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: 5 }}>ZCTA code <span className="microcopy">(5-digit)</span></label>
              <input style={{ padding: '8px 11px', borderRadius: 7, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} type="text" maxLength={5} placeholder="98104"
                value={draft.zcta_code || ''} onChange={function(e) { set('zcta_code', e.target.value.replace(/\D/g, '')); }} />
            </div>
          </div>
        )}

        {ztype === 'bbox' && (
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: 7 }}>Bounding box (decimal degrees)</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[['w', 'West (min lon)'], ['s', 'South (min lat)'], ['e', 'East (max lon)'], ['n', 'North (max lat)']].map(function(pair) {
                var bbox = draft.bbox || {};
                return (
                  <div key={pair[0]}>
                    <label style={{ fontSize: 11.5, color: 'var(--slate)', display: 'block', marginBottom: 3 }}>{pair[1]}</label>
                    <input style={{ padding: '8px 11px', borderRadius: 7, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} type="number" step="0.001" placeholder={pair[0]}
                      value={bbox[pair[0]] != null ? bbox[pair[0]] : ''}
                      onChange={function(e) {
                        var next = Object.assign({}, draft.bbox || {});
                        next[pair[0]] = parseFloat(e.target.value) || 0;
                        set('bbox', next);
                      }} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Template section */}
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--slate)' }}>Weight template</label>
            <button className="btn btn-ghost btn-xs" onClick={function() { setShowPresets(true); }}>Pick from presets</button>
          </div>

          <select style={{ padding: '8px 11px', borderRadius: 7, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} value={draft.template_id || ''} onChange={function(e) { set('template_id', e.target.value ? +e.target.value : null); }}>
            <option value="">-- no template --</option>
            {templates.map(function(t) {
              return <option key={t.id} value={t.id}>{t.name}{t.locked ? ' (locked)' : ''}</option>;
            })}
          </select>

          {selectedTemplate && (
            <div style={{ marginTop: 14, background: 'var(--mist)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{selectedTemplate.name}</div>
                  <div className="microcopy" style={{ marginTop: 2 }}>Min score: <span className="score-serif">{localMinScore.toFixed(2)}</span></div>
                </div>
                <button className={'btn btn-sm ' + (selectedTemplate.locked ? 'btn-primary' : 'btn-ghost')}
                        onClick={handleLockToggle}
                        title={selectedTemplate.locked ? 'Click to unlock — builders will no longer be gated by this template' : 'Lock this template — builders in this zone must meet the minimum score'}>
                  {selectedTemplate.locked ? '🔒 Locked' : '🔓 Unlocked'}
                </button>
              </div>

              <WeightBars weights={localWeights} />

              {history.length > 0 && (
                <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Change log</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {history.map(function(h) {
                      var dt = (h.changed_at || '').slice(2, 10).replace(/-/g, '');
                      var tm = (h.changed_at || '').slice(11, 16);
                      var who = (h.changed_by || '').replace('@merascope.com', '').replace('@', '') || 'unknown';
                      return (
                        <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '5px 8px', background: 'var(--paper)', borderRadius: 7, border: '1px solid var(--line)' }}>
                          <span className="score-serif" style={{ color: 'var(--slate)', flexShrink: 0 }}>{dt} {tm}</span>
                          <span style={{ color: 'var(--basalt)', flexShrink: 0, fontWeight: 600 }}>{who}</span>
                          <span style={{ color: 'var(--ink)', flex: 1 }}>{h.summary}</span>
                          <button className="btn btn-ghost btn-xs" style={{ flexShrink: 0 }}
                                  onClick={function() { handleRollback(h.id); }}
                                  title="Revert template to this state">Revert</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <button className="btn btn-quiet btn-xs" style={{ marginTop: 10 }}
                      onClick={function() { setShowWeightEditor(function(v) { return !v; }); }}>
                {showWeightEditor ? 'Hide weight editor' : 'Edit weights'}
              </button>

              {showWeightEditor && (
                <div style={{ marginTop: 12 }}>
                  <WeightEditor weights={localWeights} onChange={function(w) { setLocalWeights(w); }} />
                  <div style={{ marginTop: 14 }}>
                    <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: 5 }}>
                      Minimum score
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input className="mslider" type="range" min="0" max="1" step="0.01"
                        style={{ flex: 1 }}
                        value={localMinScore}
                        onChange={function(e) { setLocalMinScore(+e.target.value); }} />
                      <input type="number" min="0" max="1" step="0.01"
                        style={{ width: 62, padding: '3px 6px', borderRadius: 6, border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 13, fontFamily: 'inherit', textAlign: 'right' }}
                        value={localMinScore}
                        onChange={function(e) {
                          var v = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
                          setLocalMinScore(v);
                        }} />
                    </div>
                    <p className="microcopy" style={{ margin: '6px 0 0' }}>
                      Cells scoring below this threshold under these weights are gated for builders.
                    </p>
                  </div>
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 14 }}
                          onClick={function() {
                            var w = localWeights;
                            var ms = localMinScore;
                            fetch('/api/steward/templates/' + selectedTemplate.id, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ weights: w, min_score: ms })
                            }).then(function(r) { return r.json(); }).then(function(d) {
                              if (d.ok) {
                                if (onTemplateUpdated) onTemplateUpdated(selectedTemplate.id, { weights: w, min_score: ms });
                                refreshHistory(selectedTemplate.id);
                                if (window.refreshActiveZones) window.refreshActiveZones();
                              }
                            });
                          }}>
                    Save template
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {err && <div style={{ color: '#c0392b', fontSize: 13, fontWeight: 600 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : (isNew ? 'Create zone' : 'Save changes')}
          </button>
          {!isNew && (
            <button className="btn btn-ghost" style={{ color: '#c0392b' }} onClick={handleDelete}>Delete zone</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── zone list panel ── */
// Left-hand sidebar listing every zone the steward's agency has defined, with
// a compact geography label and (if attached) the template name + a lock
// icon. Purely a selector — clicking a row just tells the parent which zone
// id to show in ZoneDetailPanel; it holds no state of its own.
function ZoneListPanel({ zones, selectedId, onSelect, onNew }) {
  var M = window.MERA;
  // Renders a short human-readable geography string per zone_type, since raw
  // fields (county_fips, zcta_code) aren't meaningful on their own in the list.
  function zoneTypeLabel(z) {
    if (z.zone_type === 'state') return z.state_code || 'State';
    if (z.zone_type === 'county') return 'County ' + (z.county_fips || '');
    if (z.zone_type === 'zcta')   return 'ZCTA ' + (z.zcta_code || '');
    if (z.zone_type === 'bbox')   return 'Custom area';
    return z.zone_type;
  }
  return (
    <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--line)', paddingRight: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Zones</div>
        <button className="btn btn-primary btn-sm" onClick={onNew}>+ New zone</button>
      </div>
      {zones.length === 0 && (
        <p className="microcopy" style={{ color: 'var(--slate)', lineHeight: 1.6 }}>
          No zones yet. Create one to attach a weight template to a geographic jurisdiction.
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {zones.map(function(z) {
          var active = z.id === selectedId;
          return (
            <button key={z.id}
              onClick={function() { onSelect(z.id); }}
              style={{
                background: active ? 'var(--evergreen)' : 'var(--mist)',
                color: active ? '#fff' : 'var(--ink)',
                border: '1px solid ' + (active ? 'var(--evergreen)' : 'var(--line)'),
                borderRadius: 9, padding: '10px 12px', textAlign: 'left', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 3,
              }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{z.name}</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5, opacity: 0.8 }}>
                <span>{zoneTypeLabel(z)}</span>
                {z.template_name && <span style={{ fontWeight: 600 }}>· {z.template_name}</span>}
                {z.template_locked ? <span>🔒</span> : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── main page ── */
// Top-level component for #/steward/templates. Owns all the shared state
// (zones, templates, presets) and fetches it once; ZoneListPanel and
// ZoneDetailPanel are both pure display/edit surfaces over that state, with
// this component gluing selection (selectedId/showNew) to which zone
// ZoneDetailPanel currently edits. Note this manages *policy* (weights + gates
// per zone) rather than any individual case — a separate concern from the
// docket/case-file workflow in steward.jsx.
function StewardTemplatesPage() {
  var [zones, setZones]             = React.useState([]);
  var [templates, setTemplates]     = React.useState([]);
  var [presets, setPresets]         = React.useState([]);
  var [selectedId, setSelectedId]   = React.useState(null);
  // showNew toggles the detail panel into "create a new zone" mode; it's
  // mutually exclusive with selectedId (see handleNew/handleSelect) — only
  // one of "editing an existing zone" or "creating a new one" is active at a time.
  var [showNew, setShowNew]         = React.useState(false);
  var [loading, setLoading]         = React.useState(true);

  // Fetches all three data sets in parallel and replaces state wholesale —
  // called on mount and again after any save/delete so the list panel and
  // detail panel both see the latest server state (rather than trying to
  // patch local state piecemeal after every mutation).
  function reload() {
    setLoading(true);
    Promise.all([
      fetch('/api/steward/zones').then(function(r) { return r.json(); }),
      fetch('/api/steward/templates').then(function(r) { return r.json(); }),
      fetch('/api/steward/presets').then(function(r) { return r.json(); }),
    ]).then(function(results) {
      setZones(Array.isArray(results[0]) ? results[0] : []);
      setTemplates(Array.isArray(results[1]) ? results[1] : []);
      setPresets(Array.isArray(results[2]) ? results[2] : []);
      setLoading(false);
    }).catch(function() { setLoading(false); });
  }

  React.useEffect(function() { reload(); }, []);

  var selectedZone = zones.find(function(z) { return z.id === selectedId; }) || null;
  // panelZone is what actually gets handed to ZoneDetailPanel: either a blank
  // draft shape (new-zone mode) or the currently selected real zone.
  var panelZone = showNew ? { name: '', zone_type: 'state', state_code: '' } : selectedZone;

  // handleSave also pokes window.refreshActiveZones (defined in map.jsx) so
  // the builder-facing map picks up newly locked/updated gates immediately
  // rather than waiting for its own next poll/reload.
  function handleSave() { setShowNew(false); reload(); if (window.refreshActiveZones) window.refreshActiveZones(); }
  function handleDelete() { setSelectedId(null); setShowNew(false); reload(); }
  function handleNew() { setSelectedId(null); setShowNew(true); }
  function handleSelect(id) { setShowNew(false); setSelectedId(id); }
  function handleClose() { setShowNew(false); setSelectedId(null); }
  // Optimistic local updates so the list panel reflects a just-created/updated
  // template immediately, without waiting on a full reload() round-trip.
  function handleTemplateCreated(t) { setTemplates(function(prev) { return prev.concat(t); }); }
  function handleTemplateUpdated(id, patch) {
    setTemplates(function(prev) {
      return prev.map(function(t) { return t.id === id ? Object.assign({}, t, patch) : t; });
    });
  }

  // Zones and templates come back from the API as separate collections joined
  // only by template_id — enrich each zone with its template's display name
  // and lock state so ZoneListPanel/ZoneDetailPanel don't need to do their own
  // lookups against the templates array.
  var enrichedZones = zones.map(function(z) {
    var t = templates.find(function(t) { return t.id === z.template_id; });
    return Object.assign({}, z, {
      template_name:   t ? t.name : null,
      template_locked: t ? t.locked : 0,
    });
  });

  // Same enrichment applied to whichever single zone is currently open in the
  // detail panel (new-draft or existing) so it can show the attached
  // template's name/lock state too.
  var enrichedSelectedZone = panelZone ? (function() {
    var t = templates.find(function(t) { return t.id === panelZone.template_id; });
    return Object.assign({}, panelZone, {
      template_name:   t ? t.name : null,
      template_locked: t ? t.locked : 0,
    });
  })() : null;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '22px 24px 60px' }} data-screen-label="Steward -- Weight Templates">
      <StewardSubNav active="templates" />
      <PageHead title="Weight templates" sub="Define weight profiles and minimum-score gates for your jurisdiction zones. Locked templates are enforced as binding criteria for all builders viewing cells in the zone." />

      {loading ? (
        <div className="microcopy" style={{ color: 'var(--slate)', padding: '32px 0' }}>Loading...</div>
      ) : (
        <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>
          <ZoneListPanel
            zones={enrichedZones}
            selectedId={selectedId}
            onSelect={handleSelect}
            onNew={handleNew} />

          <div style={{ flex: 1, minWidth: 0 }}>
            {enrichedSelectedZone ? (
              <ZoneDetailPanel
                key={enrichedSelectedZone.id || 'new'}
                zone={enrichedSelectedZone}
                templates={templates}
                presets={presets}
                onSave={handleSave}
                onDelete={handleDelete}
                onClose={handleClose}
                onTemplateCreated={handleTemplateCreated}
                onTemplateUpdated={handleTemplateUpdated} />
            ) : (
              <div style={{ padding: '40px 0', color: 'var(--slate)', fontSize: 14, lineHeight: 1.7 }}>
                <p>Select a zone on the left to edit it, or click <b>+ New zone</b> to get started.</p>
                <p className="microcopy">Each zone maps a geographic area (state, county, ZCTA, or custom bounding box) to a weight template. Locking a template means builders viewing cells in that zone will see a steward gate if their cell scores below the minimum.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Note: unlike steward.jsx/steward2.jsx/steward-inbox.jsx, this file has no
// trailing Object.assign(window, {...}) block. It doesn't need one — these
// are plain top-level `function` declarations in a non-module script, so the
// browser already attaches them to `window` itself; app.jsx's router can
// reference StewardTemplatesPage directly. The explicit export blocks in the
// other steward files exist for readability/documentation of what's "public,"
// not because they're functionally required.
