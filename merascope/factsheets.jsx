/* ── Fact sheets: print-styled US Letter previews ── */

function QRPlaceholder({ seed = 7, size = 64 }) {
  const n = 17, mods = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const inFinder = (x < 5 && y < 5) || (x > n - 6 && y < 5) || (x < 5 && y > n - 6);
    if (inFinder) continue;
    const v = Math.sin(x * 127.1 + y * 311.7 + seed * 53.7) * 43758.5453;
    if (v - Math.floor(v) > 0.52) mods.push(<rect key={x + '-' + y} x={x} y={y} width="1" height="1" />);
  }
  const finder = (fx, fy) => (
    <g key={fx + ',' + fy}><rect x={fx} y={fy} width="5" height="5" fill="none" stroke="#1A1A1A" strokeWidth="1" /><rect x={fx + 1.5} y={fy + 1.5} width="2" height="2" /></g>
  );
  return (
    <svg width={size} height={size} viewBox={`-0.5 -0.5 ${n + 1} ${n + 1}`} fill="#1A1A1A" aria-label="QR code linking to live page">
      {mods}{finder(0, 0)}{finder(n - 5, 0)}{finder(0, n - 5)}
    </svg>
  );
}

function SheetShell({ title, kicker, children, seed }) {
  const M = window.MERA;
  return (
    <div className="sheet" data-screen-label={'Fact sheet — ' + title}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <Wordmark size={13} />
        <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--slate)' }}>{M.VERSION} · June 11, 2026</div>
      </div>
      <div style={{ borderTop: '2.5px solid var(--evergreen)', paddingTop: 14, marginTop: 8 }}>
        <div className="eyebrow" style={{ fontSize: 10.5 }}>{kicker}</div>
        <h2 style={{ fontSize: 25, marginTop: 2 }}>{title}</h2>
      </div>
      <div style={{ marginTop: 16 }}>{children}</div>
      <div style={{ position: 'absolute', left: 58, right: 58, bottom: 38, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
        <div style={{ fontSize: 9.5, color: 'var(--slate)', maxWidth: 520, lineHeight: 1.5 }}>
          Methodology: 9 indicators normalized 0–1, 2 hard buildability gates, 0.15° grid. {M.DATA_SOURCES}. All scoring code reproducible.
          <div style={{ marginTop: 4, fontWeight: 700, color: 'var(--evergreen)' }}>◈ Same Score Promise — identical methodology, weights, and sources for every reader of this page.</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <QRPlaceholder seed={seed} />
          <div style={{ fontSize: 8.5, color: 'var(--slate)', marginTop: 2 }}>live page</div>
        </div>
      </div>
    </div>
  );
}

function SheetH({ children }) {
  return <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 750, color: 'var(--slate)', borderBottom: '1px solid var(--line)', paddingBottom: 4, marginBottom: 9 }}>{children}</div>;
}

/* ── 4a. State fact sheet ── */
function FactSheetState() {
  const M = window.MERA;
  return (
    <SheetShell kicker="State fact sheet" title="Washington — data center siting posture" seed={3}>
      <div style={{ display: 'grid', gridTemplateColumns: '215px 1fr', gap: 26 }}>
        <div>
          <div style={{ textAlign: 'center', background: 'var(--mist)', borderRadius: 10, padding: '18px 12px 14px' }}>
            <div className="score-serif" style={{ fontSize: 74, lineHeight: 1, color: 'var(--basalt)' }}>{M.STATE_GRADE}</div>
            <div style={{ fontSize: 11, color: 'var(--slate)', marginTop: 4 }}>composite grade</div>
          </div>
          <div style={{ marginTop: 12 }}>
            {M.GRADES.map(g => (
              <div key={g.k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 2px', borderBottom: '1px solid var(--line-soft)', fontSize: 12 }}>
                <span>{g.k}</span><span className="score-serif" style={{ fontSize: 14 }}>{g.g}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <WAMap weights={M.DEFAULT_WEIGHTS} interactive={false} markers={true} recommended={false} />
            <div style={{ fontSize: 9, color: 'var(--slate)', marginTop: 3 }}>Composite suitability at public default weights.</div>
          </div>
        </div>
        <div>
          <SheetH>The numbers</SheetH>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 18px', fontSize: 12.5 }}>
            <div className="kv"><span>Grid cells scored</span><b className="score-serif">974</b></div>
            <div className="kv"><span>Viable after hard gates</span><b className="score-serif">850</b></div>
            <div className="kv"><span>Terrain-gated</span><b className="score-serif">61</b></div>
            <div className="kv"><span>Protected-land-gated</span><b className="score-serif">82</b></div>
            <div className="kv"><span>Existing campuses tracked</span><b className="score-serif">5</b></div>
            <div className="kv"><span>Proposed campuses tracked</span><b className="score-serif">4</b></div>
          </div>
          <div style={{ marginTop: 16 }}>
            <SheetH>Active legislation</SheetH>
            <div style={{ display: 'grid', gap: 7, fontSize: 12 }}>
              {[['WA HB — data center water reporting', 'Hearing scheduled · comment closes Jun 30, 2026'],
                ['Moratorium impact study (Office of the Governor)', 'Statutory deadline Sep 1, 2026'],
                ['Grant PUD rate case 26-UE-0388', 'Large-load tariff class · comment window open']].map(([t, d]) => (
                <div key={t} style={{ display: 'flex', gap: 9 }}>
                  <span style={{ color: 'var(--basalt)', fontWeight: 700 }}>·</span>
                  <span><b style={{ fontWeight: 650 }}>{t}</b><span style={{ color: 'var(--slate)' }}> — {d}</span></span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <SheetH>Finding of record</SheetH>
            <p style={{ fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>
              Washington pairs elite grid access (A−) with the worst water posture of any indicator (D). The state’s largest proposed campuses — Wallula Gap (water <span className="score-serif">0.000</span>), Horn Rapids, West Richland — cluster in the driest scored cells, three of them Hanford-adjacent (contamination distance <span className="score-serif">0.014</span>–<span className="score-serif">0.25</span>). The highest-scoring unclaimed cells sit west and south, where no application is pending.
            </p>
          </div>
        </div>
      </div>
    </SheetShell>
  );
}

/* ── 4b. Company fact sheet ── */
function FactSheetCompany() {
  const hist = [2, 4, 7, 9, 5, 3, 1]; /* fleet siting-quality distribution */
  const bands = ['0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9'];
  return (
    <SheetShell kicker="Company fact sheet" title="Hyperion Compute — fleet siting record" seed={11}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 26 }}>
        <div>
          <SheetH>Fleet-wide siting quality</SheetH>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 110, padding: '0 6px' }}>
            {hist.map((h, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ height: h * 10, background: i < 3 ? 'var(--basalt)' : 'var(--evergreen)', borderRadius: '3px 3px 0 0' }}></div>
                <div style={{ fontSize: 9, color: 'var(--slate)', marginTop: 3 }} className="score-serif">{bands[i]}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--slate)', marginTop: 4 }}>31 operating + proposed sites, by composite band. Orange = below 0.6.</div>
          <div style={{ marginTop: 16 }}>
            <SheetH>Exposure</SheetH>
            <div className="kv" style={{ fontSize: 12.5 }}><span>% of fleet in water-stressed cells</span><b className="score-serif" style={{ color: 'var(--basalt)' }}>42%</b></div>
            <div className="kv" style={{ fontSize: 12.5 }}><span>Median composite, operating fleet</span><b className="score-serif">0.63</b></div>
            <div className="kv" style={{ fontSize: 12.5 }}><span>Median composite, 2025–26 proposals</span><b className="score-serif" style={{ color: 'var(--basalt)' }}>0.55</b></div>
          </div>
        </div>
        <div>
          <SheetH>Claims vs. scores</SheetH>
          <div className="callout" style={{ padding: '12px 14px', fontSize: 12.5, lineHeight: 1.6 }}>
            <b>Claimed:</b> “7× water efficiency across the fleet.”<br />
            <b>Observed:</b> the newest 3 proposals sit in the state’s driest cells (water <span className="score-serif">0.000</span>–<span className="score-serif">0.35</span>). Efficiency multiplies the denominator; the aquifer sets the numerator.
          </div>
          <div style={{ marginTop: 16 }}>
            <SheetH>Commitments</SheetH>
            <div style={{ display: 'grid', gap: 6, fontSize: 12.5 }}>
              {[['Closed-loop cooling at all new builds', 'kept', 'lo'], ['Public water telemetry, Quincy', 'kept', 'lo'],
                ['Heat-reuse offtake, Malaga', 'pending', 'med'], ['3:4 replenishment, Wallula', 'pending', 'med']].map(([t, s, tone]) => (
                <div key={t} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <span>{t}</span><Chip tone={tone}>{s}</Chip>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 12.5 }}>Tally: <b className="score-serif">2</b> kept · <b className="score-serif">2</b> pending · <b className="score-serif">0</b> broken</div>
          </div>
        </div>
      </div>
    </SheetShell>
  );
}

/* ── 4c. Site fact sheet ── */
function FactSheetSite() {
  const M = window.MERA;
  const site = M.SITES[0]; /* Kittitas */
  const cell = M.cellAt(site.lat, site.lon);
  return (
    <SheetShell kicker="Site fact sheet" title={site.title + ' — ' + site.cell} seed={5}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 26 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
            <span className="score-serif" style={{ fontSize: 44, color: 'var(--evergreen)' }}>{site.composite.toFixed(2)}</span>
            <span style={{ fontSize: 11, color: 'var(--slate)' }}>composite · public default weights</span>
          </div>
          <SheetH>All indicators</SheetH>
          <div style={{ display: 'grid', gap: 5 }}>
            {cell && M.INDICATORS.map(m => <BarRow key={m.k} label={m.label} value={cell.ind[m.k]} width={150} />)}
          </div>
          <div style={{ marginTop: 14 }}>
            <SheetH>Water rights</SheetH>
            <p style={{ fontSize: 12.5, margin: 0, lineHeight: 1.55 }}>Status: <b>{site.waterRights}</b> — municipal district holds unallocated industrial rights; drought-year curtailment risk modeled as low. Closed-loop design basis ~0.12 L/kWh.</p>
          </div>
        </div>
        <div>
          <SheetH>Hazard panel</SheetH>
          <div style={{ display: 'grid', gap: 4, fontSize: 12.5 }}>
            <div className="kv"><span>Seismic PGA (10%/50 yr)</span><b className="score-serif">0.18g</b></div>
            <div className="kv"><span>SFHA flood overlap</span><b>None</b></div>
            <div className="kv"><span>Wildfire interface</span><b>Moderate (wind-driven)</b></div>
            <div className="kv"><span>Insurance posture</span><b>Moderate (wind)</b></div>
          </div>
          <div style={{ marginTop: 14 }}>
            <SheetH>Community burden context</SheetH>
            <p style={{ fontSize: 12.5, margin: 0, lineHeight: 1.55 }}>ZCTA {site.zcta}, pop <span className="score-serif">{site.pop.toLocaleString()}</span>. EJ burden indicator <span className="score-serif">0.74</span> — above the state median; no prior contested hearings in this county.</p>
          </div>
          <div style={{ marginTop: 14 }}>
            <SheetH>Docket condition status</SheetH>
            <p style={{ fontSize: 12.5, margin: 0 }}>No active case file. Pre-application conference available.</p>
          </div>
          <div style={{ marginTop: 14 }}>
            <SheetH>What would change this score</SheetH>
            <div style={{ display: 'grid', gap: 5, fontSize: 12.5 }}>
              {['A 230→345 kV interconnection commitment letter would lift Grid 0.88 → 0.93.',
                'Executed water-rights transfer would lift Water 0.71 → 0.79 and the composite past 0.84.',
                'A wildfire-hardened design basis would move insurance posture to Low and clear two flags.'].map(t => (
                <div key={t} style={{ display: 'flex', gap: 8 }}><span style={{ color: 'var(--basalt)', fontWeight: 700 }}>·</span><span>{t}</span></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </SheetShell>
  );
}

function FactSheetsPage({ which }) {
  const tabs = [['state', 'State — Washington'], ['company', 'Company — Hyperion Compute'], ['site', 'Site — Kittitas Corridor']];
  const active = which || 'state';
  return (
    <div data-screen-label="Fact sheets">
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 24px 0' }}>
        <PageHead eyebrow="Fact sheets — print-grade, QR-coded, version-stamped" title="Same numbers on every page"
          sub="One page each, US Letter. Built to be handed across the table at a hearing."
          right={<button className="btn btn-ghost btn-sm" onClick={() => window.print()}>Print / Save as PDF</button>} />
        <div className="tabs">
          {tabs.map(([k, label]) => (
            <button key={k} className={active === k ? 'on' : ''} onClick={() => { location.hash = '#/factsheets/' + k; }}>{label}</button>
          ))}
        </div>
      </div>
      <div className="sheet-wrap" style={{ marginTop: 0 }}>
        {active === 'state' ? <FactSheetState /> : active === 'company' ? <FactSheetCompany /> : <FactSheetSite />}
      </div>
    </div>
  );
}

Object.assign(window, { FactSheetsPage, FactSheetState, FactSheetCompany, FactSheetSite, QRPlaceholder });
