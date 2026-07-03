/* ── Surface C (cont.): Bulk intake -- CSV of existing applications to cases ── */

function autoDetectBulkImportCols(headers) {
  var lc = headers.map(function(h) { return h.toLowerCase(); });
  var find = function(candidates) {
    for (var i = 0; i < candidates.length; i++) {
      var idx = lc.indexOf(candidates[i]);
      if (idx !== -1) return headers[idx];
    }
    return '';
  };
  return {
    nameCol:    find(['site','name','site_name','project']),
    latCol:     find(['lat','latitude','y','lat_dd']),
    lonCol:     find(['lon','lng','longitude','long','x','lon_dd']),
    applicantCol: find(['applicant','company','owner','developer']),
    contactNameCol:  find(['contact_name','contact','contact_person']),
    contactEmailCol: find(['contact_email','email']),
    permitIdCol:     find(['external_permit_id','permit_id','tracking_id','permit_no']),
  };
}

var BULK_COL_FIELDS = [
  ['nameCol', 'Site name *'],
  ['applicantCol', 'Applicant *'],
  ['latCol', 'Latitude *'],
  ['lonCol', 'Longitude *'],
  ['contactNameCol', 'Contact name (optional)'],
  ['contactEmailCol', 'Contact email (optional)'],
  ['permitIdCol', 'External permit ID (optional)'],
];

function BulkIntakePage() {
  var [stage,   setStage]   = React.useState('upload');
  var [parsed,  setParsed]  = React.useState(null);
  var [colMap,  setColMap]  = React.useState({});
  var [result,  setResult]  = React.useState(null);
  var [err,     setErr]     = React.useState(null);

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
      setColMap(autoDetectBulkImportCols(p.headers));
      setStage('mapping');
      setErr(null);
    };
    reader.readAsText(file);
  };

  var setColVal = function(key, val) {
    setColMap(function(m) { var n = Object.assign({}, m); n[key] = val; return n; });
  };

  var runImport = function() {
    if (!colMap.nameCol || !colMap.applicantCol || !colMap.latCol || !colMap.lonCol) {
      setErr('Site name, applicant, latitude, and longitude columns are all required.');
      return;
    }
    setErr(null);
    setStage('running');
    var rows = parsed.rows.map(function(row) {
      return {
        site: row[colMap.nameCol],
        applicant: row[colMap.applicantCol],
        lat: row[colMap.latCol],
        lon: row[colMap.lonCol],
        contact_name: colMap.contactNameCol ? row[colMap.contactNameCol] : '',
        contact_email: colMap.contactEmailCol ? row[colMap.contactEmailCol] : '',
        external_permit_id: colMap.permitIdCol ? row[colMap.permitIdCol] : '',
      };
    });
    fetch('/api/steward/bulk_import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: rows })
    }).then(function(r) { return r.json(); }).then(function(res) {
      setResult(res);
      setStage('results');
    }).catch(function(e) {
      setErr('Import failed: ' + (e && e.message ? e.message : String(e)));
      setStage('mapping');
    });
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '22px 24px 50px' }} data-screen-label="Steward -- Bulk import">
      <StewardSubNav active="bulk-import" />
      <PageHead title="Bulk import" sub="Upload a spreadsheet of existing applications to create case files in one pass, instead of entering each by hand." />

      {stage === 'upload' && (
        <div>
          {err && <div style={{ padding: '10px 14px', background: '#fde8e8', color: '#c0392b', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{err}</div>}
          <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '44px 24px', border: '2px dashed var(--line)', borderRadius: 14, cursor: 'pointer', textAlign: 'center', maxWidth: 460 }}>
            <div style={{ fontSize: 42, lineHeight: 1 }}>+</div>
            <div style={{ fontSize: 15, fontWeight: 650 }}>Upload CSV</div>
            <div className="microcopy" style={{ maxWidth: 320 }}>First row must be headers. Needs at least site name, applicant, latitude, and longitude columns.</div>
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

          {BULK_COL_FIELDS.map(function(pair) {
            return (
              <div key={pair[0]} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 650, display: 'block', marginBottom: 4 }}>{pair[1]}</label>
                <select value={colMap[pair[0]] || ''} onChange={function(e) { setColVal(pair[0], e.target.value); }}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--paper)', color: 'inherit', fontSize: 13 }}>
                  <option value="">-- select --</option>
                  {parsed.headers.map(function(h) { return <option key={h} value={h}>{h}</option>; })}
                </select>
              </div>
            );
          })}

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
            <button className="btn btn-primary" onClick={runImport}>Import {parsed.rows.length} cases</button>
            <button className="btn btn-quiet" onClick={function() { setStage('upload'); setParsed(null); setErr(null); }}>Back</button>
          </div>
        </div>
      )}

      {stage === 'running' && (
        <div style={{ textAlign: 'center', padding: '80px 24px', color: 'var(--slate)' }}>
          <div className="shimmer" style={{ height: 4, borderRadius: 2, maxWidth: 320, margin: '0 auto 20px' }} />
          <div style={{ fontSize: 15 }}>Creating {parsed ? parsed.rows.length : ''} case files...</div>
        </div>
      )}

      {stage === 'results' && result && (
        <div>
          <div style={{ marginBottom: 14 }}>
            <span className="score-serif" style={{ fontSize: 20 }}>{result.created}</span> case{result.created === 1 ? '' : 's'} created
            {result.errors.length > 0 && <span style={{ marginLeft: 10, color: 'var(--hi-tx)' }}>{result.errors.length} row{result.errors.length === 1 ? '' : 's'} skipped</span>}
          </div>
          {result.errors.length > 0 && (
            <div className="card" style={{ overflow: 'auto', marginBottom: 18, maxHeight: 220 }}>
              <table className="mtable">
                <thead><tr><th>Row</th><th>Error</th></tr></thead>
                <tbody>
                  {result.errors.map(function(e, i) {
                    return <tr key={i}><td>{e.row + 1}</td><td style={{ color: 'var(--hi-tx)' }}>{e.err}</td></tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={function() { location.hash = '#/steward'; }}>Go to docket</button>
            <button className="btn btn-quiet" onClick={function() { setStage('upload'); setParsed(null); setResult(null); }}>Import another file</button>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { BulkIntakePage });
