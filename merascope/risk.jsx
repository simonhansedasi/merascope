/* ── Public ZIP exposure lookup ──
   The only ungated surface in the product. Anyone can search a ZIP and see how
   exposed it is to data-center siting.

   Wording rule, load-bearing: this page never states a probability. The model is
   not calibrated well enough to put a percentage next to somebody's ZIP (the
   0.2-0.3 band still reads 0.238 predicted against 0.174 observed). What it does
   state is the OBSERVED share of ZIPs in the same tier that host a facility,
   quoted against the lowest tier — the same statistic on both sides, so the claim
   holds regardless of calibration. Do not reintroduce "chance", "probability",
   "risk of", or "likely to be targeted" into this copy. */

function tierTone(t, n) {
  const f = t / n;
  if (f >= 0.9) return { bg: 'var(--hi-bg)', tx: 'var(--hi-tx)' };
  if (f >= 0.6) return { bg: 'var(--med-bg)', tx: 'var(--med-tx)' };
  return { bg: 'var(--lo-bg)', tx: 'var(--lo-tx)' };
}

const pct = v => (v == null ? '--' : (100 * v).toFixed(v < 0.01 ? 2 : 1) + '%');

function TierBadge({ tier, nTiers, caption }) {
  const tone = tierTone(tier, nTiers);
  return (
    <div style={{
      background: tone.bg, color: tone.tx, borderRadius: 10, padding: '18px 22px',
      textAlign: 'center', minWidth: 150
    }}>
      <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1 }}>{tier}</div>
      <div style={{ fontSize: 12, opacity: .85, marginTop: 4 }}>of {nTiers}</div>
      <div style={{ fontSize: 11, marginTop: 8, textTransform: 'uppercase', letterSpacing: .6 }}>
        {caption}
      </div>
    </div>
  );
}


/* The tier ladder. A bare "Tier 3" is meaningless on its own — this puts it on a
   scale so you can see both where the ZIP sits and how steep the climb is.

   Bars are LINEAR in the observed rate, deliberately. On a linear scale the bottom
   six tiers are nearly flat and only the top two really rise, which is the honest
   shape of the finding: exposure is not spread evenly across the country, it is
   concentrated. A log scale would flatter the low tiers into looking meaningful.
   The printed value on each bar carries the precision the bar height cannot. */
function TierLadder({ rows, mine }) {
  if (!rows || !rows.length) return null;
  const W = 100 / rows.length;
  const max = Math.max.apply(null, rows.map(r => r.observed)) || 1;
  const H = 128;

  return (
    <div style={{ marginTop: 22 }}>
      {/* "You are here" band. Anchored to the top of the plot, NOT to the bar
          height — the bottom six tiers are only a few pixels tall on a linear
          scale, so a marker riding the bar would be invisible for most ZIPs. */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
        {rows.map(r => (
          <div key={r.tier} style={{ width: W + '%', textAlign: 'center' }}>
            {r.tier === mine && (
              <div style={{
                background: 'var(--ink)', color: 'var(--paper)', borderRadius: 4,
                fontSize: 9, fontWeight: 700, letterSpacing: .5, padding: '3px 0',
                whiteSpace: 'nowrap'
              }}>THIS ZIP</div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', height: H, gap: 3 }}>
        {rows.map(r => {
          const isMine = r.tier === mine;
          const h = Math.max(3, Math.round((r.observed / max) * (H - 30)));
          const tone = tierTone(r.tier, rows.length);
          return (
            <div key={r.tier} style={{
              width: W + '%', textAlign: 'center', height: '100%',
              display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
              // A full-height tint marks the column even when its bar is 3px tall.
              background: isMine ? 'var(--mist)' : 'transparent',
              borderRadius: 4,
              outline: isMine ? '2px solid var(--ink)' : 'none'
            }}>
              <div style={{
                fontSize: 10, fontWeight: isMine ? 700 : 400, marginBottom: 3,
                color: isMine ? 'var(--ink)' : 'var(--slate)', whiteSpace: 'nowrap'
              }}>{pct(r.observed)}</div>
              <div style={{
                height: h, background: isMine ? tone.bg : 'var(--line-soft)',
                border: '1px solid ' + (isMine ? tone.tx : 'var(--line)'),
                borderRadius: '3px 3px 0 0', boxSizing: 'border-box',
                margin: '0 2px'
              }} />
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
        {rows.map(r => (
          <div key={r.tier} style={{
            width: W + '%', textAlign: 'center', fontSize: 11,
            fontWeight: r.tier === mine ? 700 : 400,
            color: r.tier === mine ? 'var(--ink)' : 'var(--slate)'
          }}>{r.tier}</div>
        ))}
      </div>

      <p style={{ fontSize: 12, color: 'var(--slate)', margin: '10px 0 0', lineHeight: 1.55 }}>
        Each bar is one <strong>exposure</strong> tier, holding the same number of ZIP
        codes; its height is how often those ZIPs host a data center. The bars stay flat until the last few
        &mdash; exposure is concentrated in a small part of the country, so most ZIP
        codes sit low on this scale.
      </p>
    </div>
  );
}

function RiskResult({ data, rows }) {
  const e = data.exposure;
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 24, background: 'var(--paper)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--serif)' }}>ZIP {data.zip}</h2>
        <span style={{ color: 'var(--slate)', fontSize: 14 }}>{data.state}</span>
      </div>

      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <TierBadge tier={e.tier} nTiers={e.n_tiers} caption="Exposure tier" />
        <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          <p style={{ margin: '0 0 10px', fontSize: 16, lineHeight: 1.5 }}>
            ZIP codes in this tier host a data center <strong>{pct(e.observed)}</strong> of
            the time, against <strong>{pct(e.lowest_tier_observed)}</strong> in the
            lowest tier.
          </p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)' }}>
            That is the measured rate across the {e.n_tiers === 10 ? '3,325' : ''} ZIPs
            that score similarly — not a forecast about this ZIP.
            {e.ci_lo != null && <> Range {pct(e.ci_lo)}&ndash;{pct(e.ci_hi)}.</>}
          </p>
        </div>
      </div>

      <TierLadder rows={rows} mine={e.tier} />

      {(data.built_facilities > 0 || data.pipeline_facilities > 0) && (
        <div style={{ marginTop: 18, padding: '12px 16px', background: 'var(--mist)', borderRadius: 8, fontSize: 14 }}>
          {data.built_facilities > 0 && (
            <div><strong>{data.built_facilities}</strong> data center
              {data.built_facilities === 1 ? '' : 's'} already mapped in this ZIP.</div>
          )}
          {data.pipeline_facilities > 0 && (
            <div style={{ marginTop: 4 }}><strong>{data.pipeline_facilities}</strong> proposed
              or permitted here.</div>
          )}
        </div>
      )}

      {data.factors && data.factors.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 13, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--slate)' }}>
            What puts it in this tier
          </h4>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.7 }}>
            {data.factors.map(f => <li key={f}>{f}</li>)}
          </ul>
        </div>
      )}

      {e.observed_pipeline != null && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line-soft)' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 13, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--slate)' }}>
            What is coming, in the same tier
          </h4>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
            Of the ZIP codes in tier <strong>{e.tier}</strong>, {pct(e.observed)} host a
            data center today and <strong>{pct(e.observed_pipeline)}</strong> have one
            proposed or permitted. Both figures describe the same group of ZIPs, so they
            can be compared directly.{' '}
            <span style={{ color: 'var(--slate)' }}>
              The pipeline number rests on 259 known projects nationally &mdash; far
              thinner evidence than the first, and coverage of proposals is patchier
              still.
            </span>
          </p>
        </div>
      )}

      {/* The case Simon named: nothing here yet, something on the way. Both are
          observed counts for this exact ZIP, not model output, so it can be stated
          flatly without any of the hedging the tier rates need. */}
      {data.divergence && (
        <div style={{
          marginTop: 16, padding: '14px 18px', borderRadius: 8,
          background: 'var(--mist)', borderLeft: '3px solid var(--gate)',
          fontSize: 14, lineHeight: 1.55
        }}>
          <strong>Nothing built here, {data.pipeline_facilities} proposed.</strong> This
          ZIP hosts no mapped data center but has {data.pipeline_facilities === 1
            ? 'a project' : 'projects'} in the pipeline. Nationally that is true of{' '}
          {data.divide && data.divide.n_divergent ? data.divide.n_divergent : 'a few hundred'}{' '}
          ZIP codes, and they are disproportionately rural.
        </div>
      )}
    </div>
  );
}

/* National exposure map.

   The grid layer is deliberately AGGREGATED to 0.25-degree cells. A per-ZCTA
   layer would ship the whole ranking to the browser, which is the bulk export
   this product declines to offer — so the map shows where exposure concentrates
   without handing anyone a ZIP-by-ZIP list. The facilities layer is different:
   those are real, already-public locations, and showing them is the most
   verifiable thing on the page. */

const GRID_BINS = [
  { max: 2.5, color: '#dfe7ec', label: '1.0-2.5' },
  { max: 4.5, color: '#b9d3e0', label: '2.5-4.5' },
  { max: 6.5, color: '#f6d9a0', label: '4.5-6.5' },
  { max: 8.0, color: '#ef9f5c', label: '6.5-8.0' },
  { max: 99,  color: '#cf4f3c', label: '8.0-10' },
];
const gridColor = t => (GRID_BINS.find(b => t <= b.max) || GRID_BINS[4]).color;

/* One table, two rates.

   There were two tables here, because there were two rankings — a ZIP had an
   exposure tier and a separate pipeline tier off a second model, and "tier 9"
   named a different set of ZIPs on each. They could not be read across, and
   quoting one next to the other produced visible contradictions.

   Now there is one binning. Every row is a single group of ZIP codes described
   twice: how many host a facility today, how many have one proposed. Same ZIPs,
   same statistic, so the columns compare directly.

   The pipeline column is optional on purpose — CI ships code without data/, so
   this renders against older JSON that has no `observed_pipeline` until the
   regenerated file is copied up. Absent means hide the column, not crash. */
function TierTable({ title, blurb, rows, mine }) {
  if (!rows || !rows.length) return null;
  const hasPipe = rows.some(r => r.observed_pipeline != null);
  return (
    <div style={{ marginTop: 26 }}>
      <h3 style={{ fontFamily: 'var(--serif)', marginBottom: 4 }}>{title}</h3>
      <p style={{ color: 'var(--slate)', fontSize: 14, marginTop: 0 }}>{blurb}</p>
      <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--line)' }}>
            <th style={{ padding: '8px 6px' }}>Tier</th>
            <th style={{ padding: '8px 6px' }}>ZIP codes</th>
            <th style={{ padding: '8px 6px' }}>Host a data center</th>
            {hasPipe && <th style={{ padding: '8px 6px' }}>Have something proposed</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.tier} style={{
              borderBottom: '1px solid var(--line-soft)',
              background: r.tier === mine ? 'var(--mist)' : 'transparent',
              fontWeight: r.tier === mine ? 700 : 400,
            }}>
              <td style={{ padding: '7px 6px' }}>{r.tier}</td>
              <td style={{ padding: '7px 6px', color: 'var(--slate)' }}>{r.n.toLocaleString()}</td>
              <td style={{ padding: '7px 6px' }}>{pct(r.observed)}</td>
              {hasPipe && <td style={{ padding: '7px 6px' }}>{pct(r.observed_pipeline)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function RiskMap({ focus }) {
  const boxRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const gridRef = React.useRef(null);
  const facRef = React.useRef(null);
  const pinRef = React.useRef(null);
  const [layer, setLayer] = React.useState('grid');
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (!boxRef.current || mapRef.current || typeof L === 'undefined') return;
    const map = L.map(boxRef.current, {
      center: [39.5, -97], zoom: 4, scrollWheelZoom: false,
      attributionControl: false, boxZoom: false, keyboard: false,
    });
    mapRef.current = map;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    L.tileLayer(isDark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=cb1_2n5a_1_898206fb108155e345cdba5c'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=cb1_2n5a_1_898206fb108155e345cdba5c',
      { maxZoom: 12, subdomains: 'abcd' }).addTo(map);

    // Canvas, not SVG — ~10k grid cells plus 2.3k facility dots.
    const renderer = L.canvas({ padding: 0.4 });
    gridRef.current = L.layerGroup().addTo(map);
    facRef.current = L.layerGroup();
    pinRef.current = L.layerGroup().addTo(map);

    fetch('/api/risk/grid').then(r => r.json()).then(d => {
      if (!d.ok) return;
      const c = d.cell;
      d.cells.forEach(row => {
        const gx = row[0], gy = row[1], mt = row[2];
        L.rectangle([[gy * c, gx * c], [(gy + 1) * c, (gx + 1) * c]], {
          renderer, stroke: false, fillColor: gridColor(mt), fillOpacity: 0.72,
        }).addTo(gridRef.current);
      });
      setReady(true);
    }).catch(() => {});

    fetch('/data/datacenters/facilities.geojson').then(r => r.json()).then(d => {
      (d.features || []).forEach(f => {
        const g = f.geometry; if (!g || !g.coordinates) return;
        const built = (f.properties || {}).status !== 'proposed'
          && (f.properties || {}).status !== 'cancelled';
        L.circleMarker([g.coordinates[1], g.coordinates[0]], {
          renderer, radius: 3, weight: 0.6, color: '#fff',
          fillColor: built ? '#1f4f3f' : '#cf4f3c', fillOpacity: 0.9,
        }).addTo(facRef.current);
      });
    }).catch(() => {});

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Toggle which layer is mounted.
  React.useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (layer === 'grid') {
      if (facRef.current) map.removeLayer(facRef.current);
      if (gridRef.current) gridRef.current.addTo(map);
    } else {
      if (gridRef.current) map.removeLayer(gridRef.current);
      if (facRef.current) facRef.current.addTo(map);
    }
  }, [layer, ready]);

  // Drop a pin on the searched ZIP and fly to it.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !pinRef.current || !focus || focus.lat == null) return;
    pinRef.current.clearLayers();
    L.circleMarker([focus.lat, focus.lon], {
      radius: 9, weight: 3, color: '#111', fillColor: '#ffd400', fillOpacity: 1,
    }).addTo(pinRef.current);
    map.setView([focus.lat, focus.lon], 8, { animate: true });
  }, [focus && focus.lat, focus && focus.lon]);

  const btn = k => ({
    padding: '5px 11px', fontSize: 12, cursor: 'pointer', borderRadius: 6,
    border: '1px solid var(--line)', fontFamily: 'var(--sans)',
    background: layer === k ? 'var(--ink)' : 'var(--paper)',
    color: layer === k ? 'var(--paper)' : 'var(--ink)',
  });

  return (
    <div style={{ marginTop: 30 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <h3 style={{ fontFamily: 'var(--serif)', margin: 0, flex: '1 1 auto' }}>Where exposure concentrates</h3>
        <button style={btn('grid')} onClick={() => setLayer('grid')}>Exposure</button>
        <button style={btn('fac')} onClick={() => setLayer('fac')}>Data centers</button>
      </div>

      <div ref={boxRef} style={{
        height: 420, borderRadius: 10, border: '1px solid var(--line)', overflow: 'hidden'
      }} />

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginTop: 10, fontSize: 11, color: 'var(--slate)' }}>
        {layer === 'grid' ? (
          <>
            <span>Mean exposure tier:</span>
            {GRID_BINS.map(b => (
              <span key={b.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 15, height: 11, background: b.color, borderRadius: 2, display: 'inline-block' }} />
                {b.label}
              </span>
            ))}
          </>
        ) : (
          <>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 9, height: 9, borderRadius: 9, background: '#1f4f3f', display: 'inline-block' }} />
              built or under construction
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 9, height: 9, borderRadius: 9, background: '#cf4f3c', display: 'inline-block' }} />
              proposed
            </span>
            <span>2,302 facilities from four sources</span>
          </>
        )}
      </div>

      <p style={{ fontSize: 12, color: 'var(--slate)', marginTop: 10, lineHeight: 1.55 }}>
        The exposure layer is averaged over roughly 28 km cells, not shown ZIP by ZIP
        &mdash; it is meant to show where exposure clusters, not to rank neighbourhoods
        against each other. Basemap &copy; OpenStreetMap contributors, &copy; CARTO.
      </p>
    </div>
  );
}

function RiskPage({ query }) {
  const [zip, setZip] = React.useState('');
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [stats, setStats] = React.useState(null);

  React.useEffect(() => {
    fetch('/api/risk/tiers').then(r => r.json())
      .then(d => { if (d.ok) setStats(d); }).catch(() => {});
  }, []);

  // Deep link: #/risk?zip=20147 looks the ZIP up on load, so a result can be
  // shared or bookmarked rather than only reached by typing.
  const deepZip = query && query.zip;
  React.useEffect(() => {
    if (!deepZip || !/^\d{5}$/.test(deepZip)) return;
    setZip(deepZip);
    setBusy(true);
    fetch('/api/risk/' + deepZip).then(r => r.json())
      .then(d => { if (d.ok) { setData(d); setErr(null); } else { setData(null); setErr(d.msg || d.err); } })
      .catch(() => setErr('Lookup failed. Try again.'))
      .finally(() => setBusy(false));
  }, [deepZip]);

  const rows = stats && stats.stats && stats.stats.exposure ? stats.stats.exposure.tiers : null;
  // Absent when the server is still serving pre-shared-bin data (CI ships code
  // without data/, so there is a window). The block below just does not render.
  const divide = stats && stats.divide;

  const search = e => {
    if (e) e.preventDefault();
    const z = zip.trim();
    if (!/^\d{5}$/.test(z)) { setErr('Enter a five-digit ZIP code.'); setData(null); return; }
    setBusy(true); setErr(null);
    if (location.hash !== '#/risk?zip=' + z) history.replaceState(null, '', '#/risk?zip=' + z);
    fetch('/api/risk/' + z).then(r => r.json())
      .then(d => { if (d.ok) { setData(d); setErr(null); } else { setData(null); setErr(d.msg || d.err); } })
      .catch(() => setErr('Lookup failed. Try again.'))
      .finally(() => setBusy(false));
  };



  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 20px 80px' }}>
      <h1 style={{ fontFamily: 'var(--serif)', marginBottom: 6 }}>Data center exposure by ZIP</h1>
      <p style={{ color: 'var(--slate)', marginTop: 0, fontSize: 15, lineHeight: 1.6 }}>
        How much does your ZIP code look like the places data centers get built? Enter a
        five-digit ZIP to see which of ten exposure tiers it falls in, and how often ZIPs
        in that tier actually host a facility.
      </p>

      <form onSubmit={search} style={{ display: 'flex', gap: 10, margin: '22px 0 26px' }}>
        <input
          value={zip} onChange={ev => setZip(ev.target.value)} placeholder="e.g. 20147"
          inputMode="numeric" maxLength={5} aria-label="ZIP code"
          style={{
            flex: '0 1 200px', padding: '11px 14px', fontSize: 17, borderRadius: 8,
            border: '1px solid var(--line)', fontFamily: 'var(--sans)'
          }} />
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Looking up...' : 'Look up'}
        </button>
      </form>

      {err && (
        <div style={{
          border: '1px solid var(--line)', borderLeft: '3px solid var(--gate)',
          borderRadius: 8, padding: '14px 18px', marginBottom: 24, fontSize: 14, lineHeight: 1.5
        }}>{err}</div>
      )}

      {data && <RiskResult data={data} rows={rows} />}

      <TierTable
        title="Exposure tiers"
        blurb="Ranked by how much a ZIP resembles places that already have data centers. Every tier holds the same number of ZIP codes, and both columns are measured on those same ZIPs — so they can be read across."
        rows={rows} mine={data && data.exposure.tier} />

      <RiskMap focus={data} />

      <div style={{ marginTop: 36, padding: '18px 20px', background: 'var(--mist)', borderRadius: 10, fontSize: 14, lineHeight: 1.65 }}>
        <h3 style={{ margin: '0 0 8px', fontFamily: 'var(--serif)', fontSize: 17 }}>
          Higher-burden communities are overrepresented
        </h3>
        <p style={{ margin: 0 }}>
          Exposure tiers track community burden. ZIPs in the top tier have a mean
          community-burden score of 0.52 against 0.81 in the bottom tier &mdash; that is,
          places with more poverty and a larger minority share sit systematically higher.
          Part of this is that data centers really do get built on industrial land near
          cities; part is that the indicators driving the model are themselves measures of
          density and industry. We cannot fully separate the two, and we would rather say
          so than let the pattern go unmentioned.{' '}
          <a href="#/methodology">Read the methodology</a>.
        </p>
      </div>

      {/* The built-vs-coming divide. Every number here comes from the `divide` block
          in tier_stats.json, computed by scripts/18_risk_tiers.py — none of it is
          typed in by hand.

          Two claims are deliberately NOT made. The pipeline rate still RISES with
          the tier (0.09% to 1.80%), so proposals are less concentrated than built
          stock, not rural in absolute terms — the claim stays relative. And nothing
          is said about whether these places can respond: divergence ZIPs actually
          score LOWER on community burden than hosting ZIPs, and the product has no
          measure of planning or permitting capacity at all. */}
      {divide && divide.top_tier_share_built != null && (
        <div style={{ marginTop: 20, padding: '18px 20px', background: 'var(--mist)', borderRadius: 10, fontSize: 14, lineHeight: 1.65 }}>
          <h3 style={{ margin: '0 0 8px', fontFamily: 'var(--serif)', fontSize: 17 }}>
            What is coming is less concentrated than what is built
          </h3>
          <p style={{ margin: 0 }}>
            The top tier holds <strong>{pct(divide.top_tier_share_built)}</strong> of every
            mapped data center in the country, but only{' '}
            <strong>{pct(divide.top_tier_share_pipeline)}</strong> of the proposed and
            permitted pipeline. Read down the table and the two columns converge: the
            places that already host are still the likeliest to gain more, but the
            pipeline is spread more widely than the built stock is.
            {divide.n_divergent != null && divide.divergent_rural_share != null && (
              <>{' '}<strong>{divide.n_divergent.toLocaleString()}</strong> ZIP codes host
              nothing today but have something proposed, and{' '}
              <strong>{pct(divide.divergent_rural_share)}</strong> of those are rural
              &mdash; against {pct(divide.hosting_rural_share)} of the ZIPs that
              already host one.</>
            )}{' '}
            <span style={{ color: 'var(--slate)' }}>
              Proposals are not rural in absolute terms; they are simply less
              concentrated than the existing build-out. Pipeline coverage is also the
              thinnest data on this page.
            </span>
          </p>
        </div>
      )}

      <div style={{ marginTop: 28, fontSize: 12, color: 'var(--slate)', lineHeight: 1.7 }}>
        <p style={{ marginBottom: 6 }}>
          <strong>What this is not.</strong> This is not a prediction that a data center
          will be built in your ZIP. It describes what existing sites have in common, from
          a model validated on spatially separated hold-out regions. Facility coverage is
          incomplete &mdash; a ZIP showing none may simply have one nobody has mapped.
        </p>
        {/* Separator below is a literal '·', not '&middot;'. Inside braces it is a
            JS string, so an HTML entity renders as its own characters — and this
            line is the attribution ODbL and CC BY 4.0 both require to be legible. */}
        {stats && stats.sources && (
          <p style={{ margin: 0 }}>Facility data: {stats.sources.join(' · ')}</p>
        )}
        {divide && divide.rural_threshold && (
          <p style={{ margin: '6px 0 0' }}>"Rural" uses the USDA's real ZIP-code
            RUCA classification ({divide.rural_threshold}), not a population-density
            proxy.</p>
        )}
      </div>
    </div>
  );
}

// Exposed on window for app.jsx's router (no module/import system in this build).
Object.assign(window, { RiskPage });
