/* ── Surface A: Public Explorer ── */

/* ── national grade computation ── */
const _GRADE_CATS = [
  { k: 'Water Durability',       cols: ['water_score_nat', 'aquifer_score_nat', 'waterway_score_nat', 'water_stress_score_nat'] },
  { k: 'Grid Access',            cols: ['tx_score_nat', 'substation_score_nat', 'fiber_score_nat', 'grid_capacity_score_nat'] },
  { k: 'Hazard Exposure',        cols: ['seismic_score_nat', 'flood_score_nat', 'air_quality_score_nat'] },
  { k: 'Community Burden',       cols: ['ej_score_nat', 'pop_exposure_score_nat'] },
  { k: 'Contamination Distance', cols: ['contamination_score_nat', 'superfund_score_nat', 'rcra_score_nat'] },
];

function _rankToGrade(rank, total) {
  // rank: 0 = best state, total-1 = worst state
  const pct = rank / Math.max(total - 1, 1);
  if (pct <= 0.08) return 'A+';
  if (pct <= 0.17) return 'A';
  if (pct <= 0.25) return 'A−';
  if (pct <= 0.33) return 'B+';
  if (pct <= 0.42) return 'B';
  if (pct <= 0.50) return 'B−';
  if (pct <= 0.58) return 'C+';
  if (pct <= 0.67) return 'C';
  if (pct <= 0.75) return 'C−';
  if (pct <= 0.83) return 'D+';
  if (pct <= 0.92) return 'D';
  return 'D−';
}

function _gradeColor(g) {
  const l = g[0];
  if (l === 'A') return 'var(--evergreen)';
  if (l === 'B') return '#5b8a3c';
  if (l === 'C') return '#b8860b';
  return 'var(--basalt)';
}

function _ordinal(n) {
  const s = ['th','st','nd','rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function _catWhy(cat, grade, name, rank, n) {
  const letter = grade[0];
  const tier = (letter === 'A' || letter === 'B') ? 'high' : letter === 'C' ? 'mid' : 'low';
  const rankStr = `${_ordinal(rank + 1)} of ${n} states`;
  const bank = {
    'Water Durability': {
      high: `${name} ranks ${rankStr} for water durability. Precipitation levels, aquifer access, river proximity, and watershed-level water stress (WRI Aqueduct) are all favorable relative to the contiguous 48. Chronic water shortage is not a structural constraint here.`,
      mid: `${name} ranks ${rankStr} for water durability — near the national median. Precipitation and aquifer depth are adequate in many cells, but watershed water stress or aquifer drawdown create seasonal or subregional limitations.`,
      low: `${name} ranks ${rankStr} for water durability. Precipitation deficits, over-appropriated water rights, or documented watershed water stress are the primary structural risks for data-center siting, and the constraint is worse here than in most states.`,
    },
    'Grid Access': {
      high: `${name} ranks ${rankStr} for grid access. Dense high-voltage transmission, favorable substation proximity, strong fiber interconnect density, and manageable interconnection queue pressure combine to make this one of the stronger grid environments in the contiguous 48.`,
      mid: `${name} ranks ${rankStr} for grid access — near the national median. Transmission distances and substation access are adequate in most corridors, but some cells face thin fiber infrastructure or above-average queue pressure.`,
      low: `${name} ranks ${rankStr} for grid access. Thin transmission build-out, limited substation density, constrained fiber infrastructure, or high interconnection queue pressure elevates cost and timeline risk compared to most competing markets.`,
    },
    'Hazard Exposure': {
      high: `${name} ranks ${rankStr} for hazard exposure (lower is better). Most viable cells face neither meaningful seismic risk, 100-year flood probability, nor air quality non-attainment — making it one of the safer permitting environments nationally.`,
      mid: `${name} ranks ${rankStr} for hazard exposure — near the national median. Seismic risk varies regionally, some alluvial areas carry elevated flood probability, and scattered non-attainment counties add diesel generator permitting complexity.`,
      low: `${name} ranks ${rankStr} for hazard exposure. Above-average seismic, flood, or air quality non-attainment risk relative to the lower 48 means site-level geotechnical and environmental review should be treated as mandatory, not optional.`,
    },
    'Community Burden': {
      high: `${name} ranks ${rankStr} for community burden (lower burden = higher rank). Environmental-justice scores and population-exposure indicators are favorable; new siting is less likely to compound existing community stress.`,
      mid: `${name} ranks ${rankStr} for community burden — near the national median. Some corridors overlap with overburdened ZCTAs or dense residential zones that warrant closer review.`,
      low: `${name} ranks ${rankStr} for community burden. Proposed campuses in this state are more likely than in most states to overlap with stressed communities or high-density residential areas.`,
    },
    'Contamination Distance': {
      high: `${name} ranks ${rankStr} for contamination distance. TRI facility density is low and buffer distances to EPA TRI, Superfund NPL, and RCRA corrective action sites are favorable across most viable cells.`,
      mid: `${name} ranks ${rankStr} for contamination distance — near the national median. Industrial corridors exist and some cells are proximate to Superfund or RCRA sites, but most viable cells maintain adequate buffers.`,
      low: `${name} ranks ${rankStr} for contamination distance. Proximity to TRI facilities, Superfund NPL sites, or active RCRA corrective action facilities is a meaningful constraint across a significant share of viable cells.`,
    },
  };
  return (bank[cat] || {})[tier] || '';
}

function _catMeans(feats) {
  return _GRADE_CATS.map(cat => {
    const colMeans = cat.cols.map(col => {
      let sum = 0, n = 0;
      feats.forEach(f => {
        const v = f.properties[col];
        if (v != null && !isNaN(v)) { sum += v; n++; }
      });
      return n > 0 ? sum / n : null;
    }).filter(v => v !== null);
    return colMeans.length ? colMeans.reduce((a, b) => a + b, 0) / colMeans.length : 0;
  });
}

function _weightedMean(feats, weights) {
  const M = window.MERA;
  const pi = window.propsToInd;
  if (!M || !pi || !weights) return 0;
  let sum = 0, n = 0;
  feats.forEach(f => { sum += M.composite(pi(f.properties, true), weights); n++; });
  return n > 0 ? sum / n : 0;
}

function _rankFeats(feats, label, weights) {
  if (!feats.length || !window.getStateFeatures || !window.STATE_NAMES) return null;
  const myCats = _catMeans(feats);
  const allStates = Object.keys(window.STATE_NAMES);
  const allScores = {};
  const allWeighted = {};
  for (const st of allStates) {
    const sf = window.getStateFeatures(st);
    if (sf.length) {
      allScores[st] = _catMeans(sf);
      if (weights) allWeighted[st] = _weightedMean(sf, weights);
    }
  }
  const loaded = Object.keys(allScores);
  const n = loaded.length;
  if (!n) return null;
  const grades = _GRADE_CATS.map((cat, i) => {
    const myScore = myCats[i];
    const rank = loaded.filter(s => allScores[s][i] > myScore).length;
    const g = _rankToGrade(rank, n);
    return { k: cat.k, g, rank, n, score: myScore, why: _catWhy(cat.k, g, label, rank, n) };
  });
  // Overall rank: weight-adjusted if weights provided, otherwise mean of categories
  let overallRank;
  if (weights && Object.keys(allWeighted).length) {
    const myW = _weightedMean(feats, weights);
    overallRank = loaded.filter(s => (allWeighted[s] || 0) > myW).length;
  } else {
    const myOverall = myCats.reduce((a, b) => a + b, 0) / myCats.length;
    overallRank = loaded.filter(s => {
      const ss = allScores[s];
      return ss.reduce((a, b) => a + b, 0) / ss.length > myOverall;
    }).length;
  }
  return { stateGrade: _rankToGrade(overallRank, n), overallRank, stateName: label, grades, stateCode: null };
}

function computeStateGrades(stateCode, weights) {
  if (!window.getStateFeatures || !window.STATE_NAMES) return null;
  const feats = window.getStateFeatures(stateCode);
  if (!feats.length) return null;
  const result = _rankFeats(feats, window.STATE_NAMES[stateCode], weights);
  if (result) result.stateCode = stateCode;
  return result;
}

/* All 48 states in ONE pass over the grid cache. Do NOT call
   computeStateGrades per state for a leaderboard — each call recomputes
   every state's category means, turning O(n) into O(n^2). */
function computeAllStateGrades() {
  if (!window.getStateFeatures || !window.STATE_NAMES) return null;
  const allStates = Object.keys(window.STATE_NAMES);
  const allScores = {};
  for (const st of allStates) {
    const sf = window.getStateFeatures(st);
    if (sf.length) allScores[st] = _catMeans(sf);
  }
  const loaded = Object.keys(allScores);
  const n = loaded.length;
  if (!n) return null;
  const overallOf = {};
  loaded.forEach(st => {
    const ss = allScores[st];
    overallOf[st] = ss.reduce((a, b) => a + b, 0) / ss.length;
  });
  const states = loaded.map(st => {
    const cats = _GRADE_CATS.map((cat, i) => {
      const myScore = allScores[st][i];
      const rank = loaded.filter(s => allScores[s][i] > myScore).length;
      return { k: cat.k, g: _rankToGrade(rank, n), rank };
    });
    const overallRank = loaded.filter(s => overallOf[s] > overallOf[st]).length;
    return { code: st, name: window.STATE_NAMES[st], overall: { g: _rankToGrade(overallRank, n), rank: overallRank }, cats };
  });
  states.sort((a, b) => a.overall.rank - b.overall.rank);
  return { states, n, cats: _GRADE_CATS.map(c => c.k) };
}

function GradeStrip({ grades, stateGrade, stateName, stateCode }) {
  const M = window.MERA;
  const gs = grades || M.GRADES;
  const sg = stateGrade;
  const sn = stateName;
  const [open, setOpen] = React.useState(null);
  return (
    <section style={{ marginTop: 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div className="score-serif" style={{ fontSize: 46, lineHeight: 1, color: _gradeColor(sg) }}>{sg}</div>
            <div className="microcopy">{sn}</div>
          </div>
          <div>
            <h3 style={{ fontSize: 18 }}>State report card</h3>
            <p className="microcopy" style={{ margin: 0 }}>Click a grade to read the plain-language finding. Scores relative to the lower 48. {M.VERSION}.</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="btn btn-ghost btn-sm" href="#/factsheets/rankings">All-state rankings</a>
          {stateCode && <a className="btn btn-ghost btn-sm" href={'#/factsheets/' + stateCode}>Print fact sheet</a>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {gs.map((g, i) => (
          <button key={g.k} className={'grade-chip' + (open === i ? ' open' : '')} onClick={() => setOpen(open === i ? null : i)} style={{ flex: '1 1 108px' }}>
            <span className="grade-letter" style={{ color: g.g[0] <= 'B' ? 'var(--evergreen)' : 'var(--basalt)' }}>{g.g}</span>
            <span style={{ fontSize: 12, color: 'var(--slate)', fontWeight: 650, textAlign: 'center' }}>{g.k}</span>
          </button>
        ))}
      </div>
      {open !== null && (
        <div className="card" style={{ marginTop: 10, padding: '14px 18px', fontSize: 14, lineHeight: 1.6 }}>
          <b style={{ color: _gradeColor(gs[open].g) }}>{gs[open].k} — {gs[open].g}.</b> {gs[open].why}
        </div>
      )}
    </section>
  );
}

function ClusterTable() {
  const M = window.MERA;
  const { ramp } = React.useContext(MeraCtx);
  const [sort, setSort] = React.useState({ k: 'composite', dir: -1 });
  const rows = [...M.CLUSTERS].sort((a, b) => {
    const va = sort.k === 'name' ? a.name : sort.k === 'status' ? a.status : a.composite;
    const vb = sort.k === 'name' ? b.name : sort.k === 'status' ? b.status : b.composite;
    return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
  });
  const th = (k, label) => (
    <th style={{ cursor: 'pointer' }} onClick={() => setSort({ k, dir: sort.k === k ? -sort.dir : -1 })}>
      {label}{sort.k === k ? (sort.dir < 0 ? ' ▾' : ' ▴') : ''}
    </th>
  );
  return (
    <section style={{ marginTop: 34 }}>
      <h3 style={{ fontSize: 18, marginBottom: 4 }}>Cluster scoreboard</h3>
      <p className="microcopy" style={{ margin: '0 0 12px' }}>Existing and proposed campuses, scored at default weights (Transmission 40 · Water 35 · Community 25). Sort any column.</p>
      <div className="card" style={{ overflow: 'auto' }}>
        <table className="mtable">
          <thead><tr>{th('name', 'Cluster')}{th('status', 'Status')}{th('composite', 'Composite')}<th>Water</th><th>Transmission</th><th>Flatness</th></tr></thead>
          <tbody>
            {rows.map(cl => (
              <tr key={cl.name}>
                <td style={{ fontWeight: 650 }}>{cl.name}</td>
                <td>{cl.status === 'existing' ? <Chip tone="mist">existing</Chip> : <Chip tone="slate">proposed</Chip>}</td>
                <td><span className="score-badge" style={{ background: M.rampColor(cl.composite, ramp), color: M.rampText(cl.composite, ramp), fontSize: 14 }}>{cl.composite.toFixed(3)}</span></td>
                <td className="score-serif">{cl.ind.water.toFixed(3)}</td>
                <td className="score-serif">{cl.ind.transmission.toFixed(3)}</td>
                <td className="score-serif">{cl.ind.flatness.toFixed(3)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan="6" style={{ fontSize: 12.5, color: 'var(--slate)', background: 'var(--sand)' }}>
                Wallula Gap water score: <span className="score-serif">0.000</span> — the floor of the state. Contamination distance: <span className="score-serif">0.014</span> (Hanford-adjacent).
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function NewsBand() {
  return (
    <section style={{ marginTop: 34 }}>
      <div className="card" style={{ display: 'flex', gap: 18, padding: '18px 22px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--slate)', border: '1px solid var(--line)', borderRadius: 5, padding: '3px 8px' }}>In the news</span>
        <blockquote style={{ margin: 0, flex: '1 1 380px', fontSize: 15, lineHeight: 1.55 }}>
          "An independent scoring model shows Washington's largest proposed data-center campuses clustering in the driest cells of the state — a finding now cited in the legislature's moratorium study."
          <div className="microcopy" style={{ marginTop: 5 }}>— Statewide technology press, February 2026</div>
        </blockquote>
        <a className="btn btn-quiet btn-sm" href="#/factsheets/state">Open the record</a>
      </div>
    </section>
  );
}

function StateFactSheet({ stateCode, feats: featsProp, gradeData }) {
  const feats = featsProp || (stateCode && window.getStateFeatures ? window.getStateFeatures(stateCode) : []);
  if (!feats.length || !gradeData) return null;

  const props = feats.map(f => f.properties);
  const med = col => {
    const vals = props.map(p => p[col]).filter(v => v != null && !isNaN(v)).sort((a,b)=>a-b);
    if (!vals.length) return null;
    const m = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[m] : (vals[m-1] + vals[m]) / 2;
  };
  const pct = (col, thresh, cmp) => {
    const vals = props.filter(p => p[col] != null);
    if (!vals.length) return null;
    const pass = vals.filter(p => cmp === '<' ? p[col] < thresh : p[col] >= thresh).length;
    return Math.round(100 * pass / vals.length);
  };

  const totalCells = props.length;
  const floodGated = props.filter(p => p.flood_score === 0).length;
  const protectedGated = props.filter(p => p.protected_score === 0).length;
  const viable = props.filter(p => p.flood_score > 0 && p.protected_score > 0).length;
  const medPrecip    = med('ann_precip_mm');
  const medAquifer   = med('aquifer_depth_ft');
  const medKsat      = med('ksat_mean_ums');
  const maxSeismic   = Math.max(...props.map(p => p.seismic_pga_g || 0).filter(v => !isNaN(v)));
  const medTxDist    = med('tx_dist_m');
  const medSubstDist = med('substation_dist_m');
  const medSfDist    = med('superfund_dist_m');

  const { grades, overallRank, stateGrade, stateName } = gradeData;
  const n = grades[0] ? grades[0].n : 48;

  const bestCat = [...grades].sort((a,b) => a.rank - b.rank)[0];
  const worstCat = [...grades].sort((a,b) => b.rank - a.rank)[0];

  const Stat = ({ label, value, unit }) => (
    <div style={{ padding: '7px 0', borderBottom: '1px solid var(--line-soft)' }}>
      <div style={{ fontSize: 11, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700 }}>{value != null ? value : 'n/a'}{unit && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--slate)', marginLeft: 4 }}>{unit}</span>}</div>
    </div>
  );

  return (
    <section style={{ marginTop: 20 }}>
      <div className="card" style={{ padding: '20px 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 17, margin: 0 }}>{stateName} — state fact sheet</h3>
            <div className="microcopy" style={{ marginTop: 3 }}>
              Ranked <b>{_ordinal(overallRank + 1)} of {n} states</b> overall · scores relative to the contiguous 48
            </div>
          </div>
          <a className="btn btn-ghost btn-sm" href={'#/factsheets/' + stateCode}>Print fact sheet</a>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>

          <div>
            <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--slate)', borderBottom: '1px solid var(--line)', paddingBottom: 4, marginBottom: 8 }}>Category rankings</div>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <tbody>
                {grades.map(g => (
                  <tr key={g.k} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    <td style={{ padding: '6px 0', color: 'var(--slate)' }}>{g.k}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: _gradeColor(g.g), width: 34 }}>{g.g}</td>
                    <td style={{ textAlign: 'right', color: 'var(--slate)', fontSize: 12 }}>#{g.rank + 1} of {g.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 110, background: 'var(--mist)', borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--slate)' }}>Top strength</div>
                <div style={{ fontWeight: 700, marginTop: 2 }}>{bestCat.k}</div>
                <div style={{ fontSize: 12, color: 'var(--slate)' }}>#{bestCat.rank + 1} of {bestCat.n}</div>
              </div>
              <div style={{ flex: 1, minWidth: 110, background: 'var(--sand)', borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--slate)' }}>Top challenge</div>
                <div style={{ fontWeight: 700, marginTop: 2 }}>{worstCat.k}</div>
                <div style={{ fontSize: 12, color: 'var(--slate)' }}>#{worstCat.rank + 1} of {worstCat.n}</div>
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--slate)', borderBottom: '1px solid var(--line)', paddingBottom: 4, marginBottom: 4 }}>Grid summary</div>
            <Stat label={stateCode ? 'Total cells scored' : 'Tiles selected'} value={stateCode ? totalCells.toLocaleString() : props.length} />
            {stateCode && <Stat label="Viable after hard gates" value={viable.toLocaleString()} />}
            {stateCode && <Stat label="Flood-gated" value={floodGated} />}
            {stateCode && <Stat label="Protected-gated" value={protectedGated} />}
          </div>

          <div>
            <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--slate)', borderBottom: '1px solid var(--line)', paddingBottom: 4, marginBottom: 4 }}>Physical indicators</div>
            {medPrecip    != null && <Stat label="Median annual precip"          value={Math.round(medPrecip)}             unit="mm"    />}
            {medAquifer   != null && <Stat label="Median aquifer depth"          value={Math.round(medAquifer)}            unit="ft"    />}
            {medKsat      != null && <Stat label="Median hydraulic conductivity" value={medKsat.toFixed(1)}                unit="um/s"  />}
            {maxSeismic   > 0     && <Stat label="Max seismic PGA"              value={maxSeismic.toFixed(3)}             unit="g"     />}
            {medTxDist    != null && <Stat label="Median tx distance"           value={(medTxDist / 1000).toFixed(1)}     unit="km"    />}
            {medSubstDist != null && <Stat label="Median substation distance"   value={(medSubstDist / 1000).toFixed(1)}  unit="km"    />}
            {medSfDist    != null && <Stat label="Median Superfund distance"    value={(medSfDist / 1000).toFixed(1)}     unit="km"    />}
          </div>

        </div>
      </div>
    </section>
  );
}

function TileCard({ feats, weights, selectedState }) {
  const M = window.MERA;
  const { ramp } = React.useContext(MeraCtx);
  const { role } = React.useContext(AuthCtx);
  if (!feats || !feats.length) return null;

  const n = feats.length;
  const props = feats.map(f => f.properties);

  const pi = window.propsToInd;
  let avgComposite = null;
  if (pi && M && weights) {
    const scores = feats.map(f => M.composite(pi(f.properties, !selectedState), weights));
    avgComposite = scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  const avg = col => {
    const vals = props.map(p => p[col]).filter(v => v != null && !isNaN(v));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const hasNat = props[0] && props[0].tx_score_nat != null;
  const useNat = !selectedState && hasNat;
  const sc = base => useNat ? base + '_nat' : base;

  const INDS_DISPLAY = [
    { k: 'Transmission',       base: 'tx_score',            raw: 'tx_dist_m',        rLabel: 'Tx distance',   rUnit: 'km',    rFmt: v => (v / 1000).toFixed(1) },
    { k: 'Water availability', base: 'water_score',         raw: 'ann_precip_mm',    rLabel: 'Annual precip', rUnit: 'mm',    rFmt: v => Math.round(v) + '' },
    { k: 'Community burden',   base: 'ej_score',            raw: null },
    { k: 'Pop. exposure',      base: 'pop_exposure_score',  raw: 'pop_density',      rLabel: 'Pop density',   rUnit: '/km2',  rFmt: v => v.toFixed(1) },
    { k: 'Seismic safety',     base: 'seismic_score',       raw: 'seismic_pga_g',    rLabel: 'PGA',           rUnit: 'g',     rFmt: v => v.toFixed(3) },
    { k: 'Flood safety',       base: 'flood_score',         raw: null },
    { k: 'Contamination',      base: 'contamination_score', raw: 'tri_dist_m',       rLabel: 'TRI distance',  rUnit: 'km',    rFmt: v => (v / 1000).toFixed(1) },
    { k: 'Waterway',           base: 'waterway_score',      raw: 'river_dist_m',     rLabel: 'River dist.',   rUnit: 'km',    rFmt: v => (v / 1000).toFixed(1) },
    { k: 'Geothermal',         base: 'geothermal_score',    raw: 'heatflow_mwm2',    rLabel: 'Heat flow',     rUnit: 'mW/m2', rFmt: v => v.toFixed(1) },
    { k: 'Terrain flatness',   base: 'flatness_score',      raw: 'flat_frac',        rLabel: 'Flat fraction', rUnit: '%',     rFmt: v => (v * 100).toFixed(0) + '' },
    { k: 'Mean slope',         base: 'slope_score',         raw: 'slope_mean_deg',   rLabel: 'Slope',         rUnit: 'deg',   rFmt: v => v.toFixed(1) },
    { k: 'Protected land',     base: 'protected_score',     raw: 'protected_frac',   rLabel: 'Protected',     rUnit: '%',     rFmt: v => (v * 100).toFixed(0) + '' },
    { k: 'Aquifer depth',      base: 'aquifer_score',       raw: 'aquifer_depth_ft', rLabel: 'Depth',         rUnit: 'ft',    rFmt: v => Math.round(v) + '' },
    { k: 'Soil permeability',  base: 'soil_score',          raw: null },
    { k: 'Soil chemistry',     base: 'soil_profile_score',  raw: null },
    { k: 'Hydraulic K-sat',    base: 'ksat_score',          raw: 'ksat_mean_ums',    rLabel: 'K-sat',         rUnit: 'um/s',  rFmt: v => v.toFixed(2) },
  ];

  const [allSaved, setAllSaved] = React.useState(() =>
    window.isCellSaved ? feats.every(f => window.isCellSaved(f.properties._fid)) : false
  );
  const handleSave = () => {
    if (allSaved) {
      feats.forEach(f => window.removeSavedCell && window.removeSavedCell(f.properties._fid));
      setAllSaved(false);
    } else {
      feats.forEach(f => window.saveCellToBuilder && window.saveCellToBuilder(f));
      setAllSaved(true);
    }
  };

  const terrainPass = props.every(p => (p.flat_frac || 0) >= 0.03);
  const protectedPass = props.every(p => (p.protected_frac || 1) <= 0.25);
  const floodPass = props.every(p => (p.flood_score || 0) > 0);

  const stateName = selectedState && window.STATE_NAMES ? window.STATE_NAMES[selectedState] : null;
  const scale = useNat ? 'national' : 'state';

  const Gate = ({ pass, label }) => (
    <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 10, fontWeight: 700,
      background: pass ? 'var(--mist)' : '#fde8e8',
      color: pass ? 'var(--evergreen)' : '#c0392b' }}>
      {pass ? 'PASS' : 'GATED'} {label}
    </span>
  );

  return (
    <section style={{ marginTop: 20 }}>
      <div className="card" style={{ padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            {avgComposite != null && (
              <div style={{ textAlign: 'center' }}>
                <div className="score-serif" style={{ fontSize: 44, lineHeight: 1, color: M.rampColor(avgComposite, ramp) }}>
                  {avgComposite.toFixed(3)}
                </div>
                <div className="microcopy">composite</div>
              </div>
            )}
            <div>
              <h3 style={{ fontSize: 16, margin: 0 }}>
                {n === 1 && window.cellLabel
                  ? window.cellLabel(feats[0].properties)
                  : n === 1 ? 'Cell report card' : `${n}-cell selection`}
              </h3>
              <div className="microcopy">{stateName ? stateName + ' · ' : ''}{scale}-scale indicator scores{n > 1 ? ' (cell averages)' : ''}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <Gate pass={terrainPass} label="terrain" />
            <Gate pass={protectedPass} label="protected" />
            <Gate pass={floodPass} label="flood" />
            <button className={'btn btn-sm ' + (allSaved ? 'btn-quiet' : 'btn-primary')} onClick={handleSave}>
              {allSaved
                ? (n > 1 ? `★ ${n} cells in workspace` : '★ In workspace')
                : (n > 1 ? `+ Save ${n} cells to workspace` : '+ Save to workspace')}
            </button>
            {allSaved && n === 1 && (
              <a className="btn btn-quiet btn-sm" href={'#/builder/case/?submit=' + feats[0].properties._fid}>Submit inquiry →</a>
            )}
          </div>
        </div>

        <div style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--slate)', borderBottom: '1px solid var(--line)', paddingBottom: 4, marginBottom: 10 }}>
          Indicator scores — {scale} scale
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2px 28px' }}>
          {INDS_DISPLAY.map(ind => {
            const v = avg(sc(ind.base));
            if (v == null) return null;
            const rawV = ind.raw ? avg(ind.raw) : null;
            const barColor = v > 0.6 ? 'var(--evergreen)' : v > 0.35 ? '#b8860b' : '#c0392b';
            return (
              <div key={ind.base} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--line-soft)' }}>
                <div style={{ width: 130, fontSize: 12, color: 'var(--slate)', flexShrink: 0 }}>{ind.k}</div>
                <div style={{ flex: 1, height: 6, background: 'var(--mist)', borderRadius: 3, overflow: 'hidden', minWidth: 40 }}>
                  <div style={{ height: '100%', width: Math.max(0, Math.min(100, v * 100)) + '%', background: barColor, borderRadius: 3 }} />
                </div>
                <div className="score-serif" style={{ width: 42, textAlign: 'right', fontSize: 13 }}>{v.toFixed(2)}</div>
                {rawV != null && ind.rFmt && (
                  <div style={{ width: 84, fontSize: 11, color: 'var(--slate)', textAlign: 'right', flexShrink: 0 }}>
                    {ind.rFmt(rawV)} <span style={{ opacity: 0.7 }}>{ind.rUnit}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ExplorerPage({ query }) {
  const M = window.MERA;
  const initial = React.useMemo(() => {
    if (query && query.w) {
      const parts = query.w.split(',').map(Number);
      if (parts.length === M.INDICATORS.length && parts.every(n => !isNaN(n))) {
        const w = {}; M.INDICATORS.forEach((m, i) => { w[m.k] = parts[i]; });
        return w;
      }
    }
    return { ...M.DEFAULT_WEIGHTS };
  }, []);
  const [weights, setWeights] = React.useState(initial);
  /* persist tuned weights so a submitted inquiry carries them (data.js shim) */
  React.useEffect(() => { if (window.setCurrentWeights) window.setCurrentWeights(weights); }, [weights]);
  const [selectedState, setSelectedState] = React.useState(null);
  const [gradeData, setGradeData] = React.useState(null);
  const [selectedCells, setSelectedCells] = React.useState(new Set());
  const [showGrid, setShowGrid] = React.useState(false);
  const [minScore, setMinScore] = React.useState(0);
  const [zipInput, setZipInput] = React.useState('');
  const [zipError, setZipError] = React.useState(null);
  const [zipTarget, setZipTarget] = React.useState(null);
  const isMobile = window.innerWidth < 900;

  const hasSelection = selectedCells.size > 0;

  function handleCellToggle(fid) {
    setSelectedCells(prev => {
      const next = new Set(prev);
      if (next.has(fid)) next.delete(fid); else next.add(fid);
      return next;
    });
  }

  function clearSelection() {
    setSelectedCells(new Set());
  }

  React.useEffect(() => { clearSelection(); }, [selectedState]);

  function handleZipSearch() {
    const zip = zipInput.trim();
    if (zip.length !== 5 || !/^\d{5}$/.test(zip)) { setZipError('Enter a 5-digit ZIP'); return; }
    if (!window.findZip) { setZipError('Map still loading'); return; }
    const feat = window.findZip(zip);
    if (!feat) { setZipError('ZIP not found'); return; }
    setZipError(null);
    setSelectedState(feat.properties._state);
    setZipTarget(zip + '_' + Date.now());
  }

  React.useEffect(() => {
    if (!selectedState) { setGradeData(null); return; }
    let attempts = 0;
    function tryCompute() {
      const result = computeStateGrades(selectedState, weights);
      if (result || attempts >= 10) { setGradeData(result); return; }
      attempts++;
      setTimeout(tryCompute, 500);
    }
    tryCompute();
  }, [selectedState, weights]);

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '26px 24px 60px' }} data-screen-label="Public Explorer">
      <PageHead eyebrow="Public Explorer — free, no login" title="U.S. data center suitability"
        sub={<span>ZIP code suitability across the contiguous 48 states · scores update live as you weight the indicators.</span>}
        right={<PromiseBadge />} />
      <div className="explorer-layout" style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <StateSelector selectedState={selectedState} onChange={setSelectedState} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="text"
                  maxLength={5}
                  placeholder="ZIP code"
                  value={zipInput}
                  onChange={e => { setZipInput(e.target.value.replace(/\D/g, '').slice(0, 5)); setZipError(null); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleZipSearch(); }}
                  style={{ width: 76, background: 'var(--mist)', border: '1px solid var(--line)', borderRadius: 7, color: 'var(--ink)', fontSize: 13, padding: '6px 9px' }}
                />
                <button className="btn btn-sm btn-ghost" onClick={handleZipSearch}>Find</button>
                {zipError && <span style={{ fontSize: 11.5, color: 'var(--clay, #b45f1d)' }}>{zipError}</span>}
              </div>
              {hasSelection && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--slate)' }}>
                  <span style={{ background: 'var(--evergreen)', color: '#fff', borderRadius: 12, padding: '2px 9px', fontWeight: 700, fontSize: 12 }}>{selectedCells.size} ZIP{selectedCells.size === 1 ? '' : 's'} selected</span>
                  <button className="btn btn-ghost btn-sm" onClick={clearSelection}>Clear</button>
                </div>
              )}
              {!hasSelection && selectedState && (
                <span className="microcopy" style={{ marginLeft: 4 }}>Click any ZIP code to compare and save to workspace</span>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 6 }}>
              <button className={'btn btn-sm ' + (showGrid ? 'btn-primary' : 'btn-ghost')}
                onClick={() => setShowGrid(g => !g)}>
                {showGrid ? 'Hide power grid' : 'Show power grid'}
              </button>
            </div>
            <WAMap weights={weights} selectedState={selectedState} selectedCells={selectedCells} onCellToggle={handleCellToggle} markers={false} pins={null} showGrid={showGrid} zipTarget={zipTarget} minScore={minScore} />
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line-soft)' }}>
              <MapLegend />
            </div>
          </div>
          {hasSelection && window.getFeaturesById && (
            <TileCard key={'tile-' + selectedCells.size}
              feats={window.getFeaturesById(selectedCells)}
              weights={weights}
              selectedState={selectedState} />
          )}
          {!hasSelection && gradeData && (
            <GradeStrip key={selectedState || 'national'}
              grades={gradeData.grades}
              stateGrade={gradeData.stateGrade}
              stateName={gradeData.stateName}
              stateCode={gradeData.stateCode} />
          )}
          {!hasSelection && gradeData && (
            <StateFactSheet key={(selectedState || 'national') + '-fs'}
              feats={null}
              stateCode={selectedState}
              gradeData={gradeData} />
          )}
        </div>
        <WeightPanel weights={weights} setWeights={setWeights} minScore={minScore} setMinScore={setMinScore} dock={isMobile} />
      </div>
    </div>
  );
}

Object.assign(window, { ExplorerPage, GradeStrip, ClusterTable, StateFactSheet, TileCard, computeStateGrades, computeAllStateGrades, _gradeColor });
