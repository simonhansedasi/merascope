/* ── Token Tracker: free browser plug-in (mock) ── */

const TT_REGIONS = [
  { id: 'wa', name: 'Washington — Mid-Columbia (hydro)', co2: 92, water: 0.18 },
  { id: 'or', name: 'Oregon — Northwest blend', co2: 156, water: 0.31 },
  { id: 'ca', name: 'California — CAISO', co2: 239, water: 0.45 },
  { id: 'va', name: 'Virginia — PJM', co2: 388, water: 0.62 },
  { id: 'tx', name: 'Texas — ERCOT', co2: 412, water: 0.84 }
];
const TT_SERVICES = [
  { id: 'claude', name: 'Claude', wh: 2.6 },
  { id: 'gpt', name: 'ChatGPT', wh: 3.0 },
  { id: 'gemini', name: 'Gemini', wh: 2.4 },
  { id: 'copilot', name: 'Copilot', wh: 1.8 }
];

function TrackerPopup() {
  const [region, setRegion] = React.useState('wa');
  const [counts, setCounts] = React.useState({ claude: 162, gpt: 204, gemini: 41, copilot: 58 });
  const [enabled, setEnabled] = React.useState({ claude: true, gpt: true, gemini: true, copilot: true });
  React.useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => {
      setCounts(c => {
        const ks = TT_SERVICES.map(s => s.id);
        const k = ks[Math.floor(Math.random() * ks.length)];
        return { ...c, [k]: c[k] + 1 };
      });
    }, 2300);
    return () => clearInterval(t);
  }, []);
  const reg = TT_REGIONS.find(r => r.id === region);
  const rows = TT_SERVICES.map(s => {
    const wml = s.wh * reg.water;            /* mL water per request */
    const co2 = s.wh * reg.co2 / 1000;       /* g CO2e per request */
    return { ...s, n: counts[s.id], wml, co2, on: enabled[s.id] };
  });
  const on = rows.filter(r => r.on);
  const totReq = on.reduce((a, r) => a + r.n, 0);
  const totWater = on.reduce((a, r) => a + r.n * r.wml, 0) / 1000;   /* L */
  const totCO2 = on.reduce((a, r) => a + r.n * r.co2, 0);            /* g */
  const maxLoad = Math.max(...rows.map(r => r.n * r.wml), 1);
  const dW = useCountUp(totWater, 300), dC = useCountUp(totCO2, 300), dR = useCountUp(totReq, 300);

  return (
    <div style={{ width: 348, background: '#fff', border: '1px solid var(--line)', borderRadius: 14, boxShadow: '0 14px 44px rgba(26,26,26,.20)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 15px', background: 'var(--evergreen)', color: '#fff' }}>
        <Glyph size={20} tone="#fff" accent="var(--basalt)" />
        <b style={{ fontSize: 13.5, letterSpacing: '.03em' }}>Token Tracker</b>
        <span style={{ marginLeft: 'auto', fontSize: 10.5, opacity: 0.8, border: '1px solid rgba(255,255,255,.4)', borderRadius: 4, padding: '1px 6px' }}>v0.4 · today</span>
      </div>
      <div style={{ padding: '12px 15px 14px' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11.5, color: 'var(--slate)', fontWeight: 650 }}>
          Your grid region
          <select value={region} onChange={e => setRegion(e.target.value)} style={{ padding: '6px 9px', border: '1px solid var(--line)', borderRadius: 7, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
            {TT_REGIONS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, margin: '12px 0' }}>
          {[[dR.toFixed(0), 'requests'], [dW.toFixed(2) + ' L', 'water'], [dC.toFixed(1) + ' g', 'CO₂e']].map(([v, l]) => (
            <div key={l} style={{ background: 'var(--mist)', borderRadius: 8, padding: '8px 6px', textAlign: 'center' }}>
              <div className="score-serif" style={{ fontSize: 17, color: 'var(--evergreen)' }}>{v}</div>
              <div style={{ fontSize: 10.5, color: 'var(--slate)' }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map(r => (
            <div key={r.id} style={{ opacity: r.on ? 1 : 0.4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
                <input type="checkbox" checked={r.on} onChange={() => setEnabled(e => ({ ...e, [r.id]: !e[r.id] }))} aria-label={'Track ' + r.name} />
                <b style={{ width: 64 }}>{r.name}</b>
                <span className="microcopy"><span className="score-serif">{r.n}</span> req</span>
                <span className="microcopy" style={{ marginLeft: 'auto' }}><span className="score-serif">{(r.n * r.wml / 1000).toFixed(2)}</span> L · <span className="score-serif">{(r.n * r.co2).toFixed(0)}</span> g</span>
              </div>
              <div className="mb-track" style={{ marginTop: 3 }}>
                <div className="mb-fill" style={{ width: (r.n * r.wml / maxLoad * 100) + '%', background: 'var(--basalt)' }}></div>
              </div>
            </div>
          ))}
        </div>
        <p className="microcopy" style={{ margin: '12px 0 0', fontSize: 10.5 }}>
          Counts stay on your device. Intensity factors are public ({window.MERA.VERSION}). Per-request energy is a modeled default — adjustable in settings.
        </p>
      </div>
    </div>
  );
}

function TokenTrackerPage() {
  return (
    <div style={{ maxWidth: 1060, margin: '0 auto', padding: '36px 24px 60px' }} data-screen-label="Token Tracker">
      <div style={{ display: 'flex', gap: 44, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 440px', minWidth: 320 }}>
          <PageHead eyebrow="Free browser plug-in" title="Your prompts have a watershed."
            sub="Token Tracker estimates the water and carbon behind every AI request you make — based on where you live, which services you use, and where their data centers actually sit." />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '4px 0 24px' }}>
            <button className="btn btn-primary">Add to Chrome — free</button>
            <button className="btn btn-quiet">Edge</button>
            <button className="btn btn-quiet">Firefox</button>
          </div>
          <div style={{ display: 'grid', gap: 16 }}>
            {[
              ['1 · Detect', 'The plug-in counts requests to AI services in your browser. Nothing leaves your device — no prompt content is read, ever.'],
              ['2 · Locate', 'Each service maps to the grid regions where its inference actually runs, using public disclosures and our siting data — the same cells on the public map.'],
              ['3 · Score', 'Water and carbon intensity come from the published methodology. The same engine that grades a 1 GW campus grades your Tuesday.']
            ].map(([t, b]) => (
              <div key={t} style={{ display: 'flex', gap: 14 }}>
                <b style={{ color: 'var(--basalt)', whiteSpace: 'nowrap', fontSize: 14 }}>{t}</b>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--slate)' }}>{b}</p>
              </div>
            ))}
          </div>
          <div className="callout" style={{ marginTop: 24, padding: '14px 18px', fontSize: 13.5, lineHeight: 1.6 }}>
            <b style={{ color: 'var(--evergreen)' }}>Why it exists.</b> The public can't weigh in on data centers they can't see — and can't see their own footprint either. The tracker closes the loop: same scores, all the way down to one request.
          </div>
          <p className="microcopy" style={{ marginTop: 14 }}>◈ Same Score Promise applies: the intensity factors in the plug-in are the published ones — identical for every user, every tier.</p>
        </div>
        <div style={{ flex: '0 1 360px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingTop: 14 }}>
          <TrackerPopup />
          <span className="microcopy">The plug-in popup — live demo, ticking as you read.</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { TokenTrackerPage, TrackerPopup });
