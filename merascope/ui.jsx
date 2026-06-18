/* ── Merascope shared UI kit ── */
const MeraCtx = React.createContext({ ramp: 'field' });

/* ── brand glyph: offset contour rings (a surveyed peak) ── */
function Glyph({ size = 26, tone = 'var(--evergreen)', accent = 'var(--basalt)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="12.5" fill="none" stroke={tone} strokeWidth="2.4"></circle>
      <circle cx="14.2" cy="17.2" r="7.4" fill="none" stroke={tone} strokeWidth="2.2"></circle>
      <circle cx="12.8" cy="18.4" r="2.8" fill={accent}></circle>
    </svg>
  );
}
function Wordmark({ size = 17, light = false }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
      <Glyph size={size + 8} tone={light ? '#fff' : 'var(--evergreen)'} />
      <span style={{ fontWeight: 750, fontSize: size, letterSpacing: '0.10em', color: light ? '#fff' : 'var(--ink)' }}>MERASCOPE</span>
    </span>
  );
}

/* ── animated glyph: rings orbit the surveyed peak ── */
function AnimatedGlyph({ size = 64 }) {
  return (
    <svg className="aglyph" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <g className="ag-r1"><circle cx="16" cy="16" r="12.5" fill="none" stroke="var(--evergreen)" strokeWidth="2.2" strokeDasharray="64 14.5" strokeLinecap="round"></circle></g>
      <g className="ag-r2"><circle cx="14.2" cy="17.2" r="7.4" fill="none" stroke="var(--evergreen)" strokeWidth="2" strokeDasharray="38 8.5" strokeLinecap="round"></circle></g>
      <circle className="ag-dot" cx="12.8" cy="18.4" r="2.8" fill="var(--basalt)"></circle>
    </svg>
  );
}

/* ── auth context (mock SSO) ── */
const AuthCtx = React.createContext({ role: 'public', setRole: () => {} });

/* ── thin-line icon set (geological / cartographic) ── */
function Icon({ name, size = 15, color = 'currentColor' }) {
  const s = { fill: 'none', stroke: color, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    pylon: <g {...s}><line x1="8" y1="2.5" x2="8" y2="14" /><line x1="8" y1="2.5" x2="3.5" y2="14" /><line x1="8" y1="2.5" x2="12.5" y2="14" /><line x1="3" y1="6" x2="13" y2="6" /><line x1="4" y1="10" x2="12" y2="10" /></g>,
    droplet: <g {...s}><path d="M8 2.5 C 5 6.5, 3.5 8.5, 3.5 10.5 a4.5 4.5 0 0 0 9 0 C 12.5 8.5, 11 6.5, 8 2.5 Z" /></g>,
    rings: <g {...s}><circle cx="8" cy="8" r="5.5" /><circle cx="8" cy="8" r="2" /></g>,
    wave: <g {...s}><path d="M2 8 q1.5 -4 3 0 q1.5 4 3 0 q1.5 -4 3 0 q1.5 4 3 0" /></g>,
    flood: <g {...s}><path d="M2 6 q2 -2 4 0 q2 2 4 0 q2 -2 4 0" /><path d="M2 10 q2 -2 4 0 q2 2 4 0 q2 -2 4 0" /></g>,
    borehole: <g {...s}><line x1="8" y1="2.5" x2="8" y2="13.5" /><circle cx="8" cy="13" r="1.4" /><line x1="4.5" y1="4" x2="11.5" y2="4" /></g>,
    river: <g {...s}><path d="M4 2.5 q4 3 0 6 q-3 2.5 2 5" /><path d="M10 2.5 q4 3 0 6 q-3 2.5 2 5" /></g>,
    thermal: <g {...s}><path d="M5 13.5 q-2 -3 0 -5 q2 -2 0 -4" /><path d="M9.5 13.5 q-2 -3 0 -5 q2 -2 0 -4" /></g>,
    contour: <g {...s}><ellipse cx="8" cy="8" rx="6" ry="4.5" /><ellipse cx="7.2" cy="8.5" rx="3.2" ry="2.2" /></g>,
    gavel: <g {...s}><rect x="6" y="2.5" width="5" height="3.6" rx="0.8" transform="rotate(40 8.5 4.3)" /><line x1="7.5" y1="7" x2="3" y2="11.5" /><line x1="2.5" y1="13.5" x2="9" y2="13.5" /></g>,
    lock: <g {...s}><rect x="4" y="7" width="8" height="6.5" rx="1.2" /><path d="M5.5 7 V5.2 a2.5 2.5 0 0 1 5 0 V7" /></g>,
    parcel: <g {...s}><rect x="3" y="3" width="10" height="10" rx="1" strokeDasharray="2.6 1.8" /><circle cx="8" cy="8" r="1.3" fill={color} stroke="none" /></g>,
    plumb: <g {...s}><line x1="8" y1="2" x2="8" y2="9" /><path d="M5.6 9 h4.8 L8 13.8 Z" /></g>,
    doc: <g {...s}><path d="M4.5 2.5 h5 l2.5 2.5 v8.5 h-7.5 Z" /><line x1="6.5" y1="8" x2="10" y2="8" /><line x1="6.5" y1="10.5" x2="10" y2="10.5" /></g>,
    check: <g {...s}><path d="M3 8.5 l3.2 3.2 L13 4.5" /></g>,
    alert: <g {...s}><path d="M8 2.8 L14 13.2 H2 Z" /><line x1="8" y1="6.5" x2="8" y2="9.5" /><circle cx="8" cy="11.4" r="0.5" fill={color} stroke="none" /></g>,
    clock: <g {...s}><circle cx="8" cy="8" r="5.5" /><path d="M8 5 V8 l2.3 1.6" /></g>,
    diamond: <g {...s}><rect x="4.8" y="4.8" width="6.4" height="6.4" transform="rotate(45 8 8)" /></g>,
    pin: <g {...s}><circle cx="8" cy="6.5" r="3.5" /><line x1="8" y1="10" x2="8" y2="14" /></g>
  };
  return <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">{paths[name] || paths.rings}</svg>;
}

/* ── count-up numeral ── */
function useCountUp(value, ms = 250) {
  const [disp, setDisp] = React.useState(value);
  const prev = React.useRef(value);
  React.useEffect(() => {
    const from = prev.current, to = value;
    if (from === to) return;
    prev.current = to;
    let raf, t0;
    const tick = (t) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / ms);
      setDisp(from + (to - from) * (1 - Math.pow(1 - p, 2)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return disp;
}
function ScoreNum({ value, decimals = 3, style }) {
  const d = useCountUp(value);
  return <span className="score-serif" style={style}>{d.toFixed(decimals)}</span>;
}
function ScoreBadge({ value, size = 15, decimals = 3, style }) {
  const { ramp } = React.useContext(MeraCtx);
  const M = window.MERA;
  return (
    <span className="score-badge" style={{ background: M.rampColor(value, ramp), color: M.rampText(value, ramp), fontSize: size, ...style }}>
      <ScoreNum value={value} decimals={decimals} />
    </span>
  );
}

/* ── chips & bars ── */
function Chip({ tone = 'slate', children, style }) {
  return <span className={'chip chip-' + tone} style={style}>{children}</span>;
}
function BarRow({ label, value, width = 64, color, mono = false }) {
  const { ramp } = React.useContext(MeraCtx);
  const M = window.MERA;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
      <span style={{ width: width, color: 'var(--slate)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <span className="mb-track"><span className="mb-fill" style={{ width: (value * 100) + '%', background: color || (mono ? 'var(--slate)' : M.rampColor(value, ramp)) }}></span></span>
      <span className="score-serif" style={{ width: 38, textAlign: 'right', fontSize: 12.5 }}>{value.toFixed(2)}</span>
    </div>
  );
}

/* ── Same Score Promise badge (persistent trust mark) ── */
function PromiseBadge({ compact = false, align = 'right' }) {
  const [open, setOpen] = React.useState(false);
  const M = window.MERA;
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen(!open)} title="Same Score Promise"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: open ? 'var(--mist)' : 'transparent', border: '1px solid var(--line)', borderRadius: 999, padding: compact ? '2px 9px' : '4px 12px', fontSize: compact ? 11.5 : 12.5, fontWeight: 650, color: 'var(--evergreen)' }}>
        <span style={{ color: 'var(--basalt)' }}>◈</span> {M.PROMISE.short}
      </button>
      {open && (
        <span style={{ position: 'absolute', top: 'calc(100% + 8px)', [align]: 0, width: 318, zIndex: 90, background: 'var(--mist)', border: '1px solid var(--line)', borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,.4)', padding: '14px 16px', display: 'block', textAlign: 'left' }}>
          <span style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 5, color: 'var(--evergreen)' }}>◈ The Same Score Promise</span>
          <span style={{ display: 'block', fontSize: 13, lineHeight: 1.55, color: 'var(--ink)' }}>{M.PROMISE.long}</span>
          <a href="#/methodology" onClick={() => setOpen(false)} style={{ display: 'inline-block', marginTop: 8, fontSize: 12.5, fontWeight: 650 }}>Read the full methodology →</a>
        </span>
      )}
    </span>
  );
}

/* ── persona context switcher ── */
function SurfaceSwitch({ surface }) {
  const opts = [['public', 'Public', '#/explorer'], ['builder', 'Builder', '#/builder'], ['steward', 'Steward', '#/steward']];
  return (
    <span className="seg" role="group" aria-label="Surface">
      {opts.map(([k, label, href]) => (
        <button key={k} className={surface === k ? 'on' : ''} onClick={() => { location.hash = href; }}>{label}</button>
      ))}
    </span>
  );
}

function PersonaBadge({ surface }) {
  if (surface === 'builder') return (
    <span className="hide-mobile" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
      <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--evergreen)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11.5 }}>SC</span>
      <span style={{ lineHeight: 1.2 }}><b style={{ display: 'block', fontWeight: 650 }}>Sarah Chen</b><span className="microcopy">Skyline Infrastructure · Enterprise</span></span>
    </span>
  );
  if (surface === 'steward') return (
    <span className="hide-mobile" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
      <span style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--slate)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 10.5 }}>WA</span>
      <span style={{ lineHeight: 1.2 }}><b style={{ display: 'block', fontWeight: 650 }}>Dept. of Ecology — reviewer</b><span className="microcopy">⊞ Entra ID SSO</span></span>
    </span>
  );
  if (surface === 'reporter') return (
    <span className="hide-mobile" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
      <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--basalt)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11.5 }}>PN</span>
      <span style={{ lineHeight: 1.2 }}><b style={{ display: 'block', fontWeight: 650 }}>Priya Nair</b><span className="microcopy">Verified press · read-only</span></span>
    </span>
  );
  return null;
}

/* demo-only role switcher — stands in for SSO; hidden in production builds */
function DemoSwitch() {
  const { role, setRole } = React.useContext(AuthCtx);
  return (
    <label title="Demo only — normally hidden. SSO is mocked." style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--basalt)', fontWeight: 650 }}>
      Demo:
      <select className="demo-select" value={role} onChange={e => {
        const r = e.target.value; setRole(r);
        location.hash = r === 'builder' ? '#/builder' : r === 'steward' ? '#/steward' : r === 'reporter' ? '#/factsheets' : '#/';
      }}>
        <option value="public">Public</option>
        <option value="builder">Builder</option>
        <option value="steward">Steward</option>
        <option value="reporter">Reporter</option>
      </select>
    </label>
  );
}

/* ── top navigation ── */
function TopNav({ route, role }) {
  const { authUser, logout } = React.useContext(AuthCtx);
  const pub = [['#/explorer', 'Explorer'], ['#/factsheets', 'Fact sheets'], ['#/methodology', 'Methodology']];
  var links = pub;
  if (role === 'builder') links = [pub[0], ['#/builder', 'Builder'], ...pub.slice(1)];
  if (role === 'steward') links = [pub[0], ['#/steward', 'Steward'], ...pub.slice(1)];
  return (
    <nav className="topnav">
      <a href="#/" style={{ textDecoration: 'none', display: 'inline-flex' }}><Wordmark size={15} /></a>
      <div className="topnav-links hide-mobile">
        {links.map(function([href, label]) {
          return <a key={href} href={href} className={'navlink' + (route.startsWith(href.slice(1)) ? ' active' : '')}>{label}</a>;
        })}
      </div>
      <div style={{ flex: 1 }}></div>
      <PersonaBadge surface={role} />
      <DemoSwitch />
      <span className="hide-mobile"><PromiseBadge compact /></span>
      {authUser ? (
        <button className="btn btn-quiet btn-sm hide-mobile" onClick={logout} title={'Signed in as ' + authUser.email}>Sign out</button>
      ) : (
        role === 'public' && <a className="btn btn-primary btn-sm hide-mobile" href="#/login">Sign in</a>
      )}
    </nav>
  );
}

/* ── footer ── */
function FooterMain() {
  const M = window.MERA;
  const col = (title, items) => (
    <div style={{ minWidth: 150 }}>
      <div style={{ fontSize: 11.5, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--slate)', marginBottom: 9 }}>{title}</div>
      {items.map(([t, h]) => <a key={t} href={h} style={{ display: 'block', fontSize: 13.5, color: 'var(--ink)', textDecoration: 'none', padding: '2.5px 0' }}>{t}</a>)}
    </div>
  );
  return (
    <footer style={{ background: 'var(--mist)', borderTop: '1px solid var(--line)', padding: '38px 26px 28px', marginTop: 0 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 38, justifyContent: 'space-between' }}>
          <div style={{ maxWidth: 280 }}>
            <Wordmark size={14} />
            <p className="microcopy" style={{ marginTop: 10 }}>The marked path for heavy infrastructure.</p>
            <PromiseBadge compact align="left" />
          </div>
          {col('Product', [['Explorer', '#/explorer'], ['Builder', '#/builder'], ['Steward', '#/steward'], ['Fact sheets', '#/factsheets']])}
          {col('Methodology', [['Indicators', '#/methodology'], ['Hard gates', '#/methodology'], ['Data sources', '#/methodology'], ['Reproducibility', '#/methodology'], ['Changelog', '#/methodology']])}
          {col('Company', [['About', '#/methodology'], ['Advisory bench', '#/methodology'], ['Press', '#/explorer'], ['Careers', '#/'], ['Contact', '#/login']])}
        </div>
        <hr className="hr-soft" style={{ margin: '26px 0 14px' }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="microcopy">{M.DATA_SOURCES} · All scoring code reproducible — see the public repository.</span>
          <span className="microcopy">© 2026 Merascope, Inc. · Delaware C Corp · {M.VERSION}</span>
        </div>
      </div>
    </footer>
  );
}

/* ── small helpers ── */
function PageHead({ eyebrow, title, sub, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', marginBottom: 18 }}>
      <div>
        {eyebrow && <div className="eyebrow" style={{ marginBottom: 4 }}>{eyebrow}</div>}
        <h2 style={{ fontSize: 24 }}>{title}</h2>
        {sub && <p style={{ margin: '4px 0 0', color: 'var(--slate)', fontSize: 14.5, maxWidth: 640 }}>{sub}</p>}
      </div>
      {right && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{right}</div>}
    </div>
  );
}

function useFakeLoad(ms = 700) {
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => { const t = setTimeout(() => setLoading(false), ms); return () => clearTimeout(t); }, []);
  return loading;
}

function NotifyToast({ message, onDone }) {
  React.useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 9999, background: 'var(--evergreen)', color: '#fff', borderRadius: 10, padding: '12px 20px', fontSize: 13.5, fontWeight: 650, boxShadow: '0 4px 18px rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', gap: 10, animation: 'fadeSlideUp .22s ease' }}>
      <Icon name="check" size={16} color="#fff" />
      {message}
    </div>
  );
}

var TOUR_STEPS = [
  {
    title: 'Welcome to Merascope',
    body: 'Site suitability intelligence and permitting coordination for data centers. Three roles: Builder (applicant), Steward (lead regulatory agency), and Co-party (invited agencies: tribes, counties, utilities, AG). All three surfaces show identical scores. This tour takes about 3 minutes.',
    action: null, nav: null, role: null
  },
  {
    title: 'Explorer — suitability map',
    body: 'Washington State is loaded. Each cell shows a composite score across 16 physical indicators. Use the weight sliders to shift what matters most — scores update live. Click any cell to see its full indicator breakdown. Save cells to your workspace with the star button.',
    action: 'Try adjusting a weight slider, then click a cell.',
    nav: '#/explorer', role: null
  },
  {
    title: 'Builder — application transparency',
    body: 'Applicants look up their assigned case ID to see a read-only view of their regulatory review — every condition proposed, every finding versioned, the rebuttal clock, and the full document chain. Same numbers the agency sees. This is case 26-0142.',
    action: 'Review the findings and conditions table.',
    nav: '#/builder/case/26-0142', role: 'builder'
  },
  {
    title: 'Steward — The Docket',
    body: 'Lead agency view. You are now logged in as Dept. of Ecology. The kanban shows all active case files by stage. New case files can be created from the top right. Cases advance when you click the stage labels in the case file.',
    action: 'Click the "26-0142" card to enter the case.',
    nav: '#/steward', role: 'steward'
  },
  {
    title: 'Case file — conditions and coordination',
    body: 'Versioned findings, a live conditions table with inline status editing, a rebuttal clock with a date picker, document upload, and a co-party tracker derived from invited agencies. Click any stage label to advance the case. "Invite co-parties" opens a searchable directory of 95 pre-registered WA agencies.',
    action: 'Try changing a condition status or clicking a stage label.',
    nav: '#/steward/case/26-0142', role: 'steward'
  },
  {
    title: 'Co-party view — CTUIR',
    body: 'You are now logged in as CTUIR, a tribal co-party on this case. The docket shows only cases where CTUIR is invited. Open case 26-0142 and propose a condition — it lands in the lead agency queue as "Pending lead approval." Switch back to steward to approve it.',
    action: 'Open the case and use "Propose condition."',
    nav: '#/co-party', role: 'co-party', partyKey: 'CT'
  },
  {
    title: 'Tour complete',
    body: "That's the full loop. Builder sees the process transparently. Co-parties propose conditions. Steward coordinates, negotiates, and advances the case through permitting stages. All three surfaces show the same score. No party gets a friendlier number.",
    action: null, nav: null, role: null, done: true
  }
];

function TourOverlay({ tourStep, onStart, onNext, onBack, onSkip }) {
  if (tourStep === null) return null;

  if (tourStep === 0) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: 'var(--sand)', borderRadius: 14, padding: '32px 36px', maxWidth: 480, width: '100%', boxShadow: '0 12px 60px rgba(0,0,0,0.6)', border: '1px solid var(--line)', textAlign: 'center' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--mist)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
            <Icon name="rings" size={26} color="var(--basalt)" />
          </div>
          <h2 style={{ fontSize: 22, marginBottom: 10 }}>Welcome to Merascope</h2>
          <p style={{ color: 'var(--slate)', fontSize: 14.5, lineHeight: 1.65, marginBottom: 26 }}>A guided 3-minute tour walks through all three surfaces — Builder, Steward, and Co-party — and the conditions negotiation loop that connects them.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={onStart}>Take the tour</button>
            <button className="btn btn-quiet" onClick={onSkip}>Explore on my own</button>
          </div>
        </div>
      </div>
    );
  }

  const step = TOUR_STEPS[tourStep - 1];
  if (!step) return null;
  const total = TOUR_STEPS.length;
  const isFirst = tourStep === 1;
  const isLast = !!step.done;

  return (
    <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 1100, width: 520, maxWidth: 'calc(100vw - 32px)' }}>
      <div style={{ background: 'var(--sand)', borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.55)', border: '1px solid var(--line)', overflow: 'hidden' }}>
        <div style={{ height: 3, background: 'var(--line)' }}>
          <div style={{ height: '100%', background: 'var(--basalt)', width: (tourStep / total * 100) + '%', transition: 'width 0.3s ease' }}></div>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 7 }}>
            <div>
              <span className="microcopy">Step {tourStep} of {total}</span>
              <div style={{ fontWeight: 700, fontSize: 15.5, marginTop: 2, lineHeight: 1.25 }}>{step.title}</div>
            </div>
            <button onClick={onSkip} className="btn btn-quiet btn-xs" style={{ flexShrink: 0, marginLeft: 12, marginTop: 2 }}>End tour</button>
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--slate)', margin: '0 0 8px' }}>{step.body}</p>
          {step.action && (
            <div style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--basalt)', marginBottom: 12, display: 'flex', gap: 5, alignItems: 'center' }}>
              <span>&#8594;</span> {step.action}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {!isFirst && <button className="btn btn-quiet btn-sm" onClick={onBack}>Back</button>}
            {isLast
              ? <button className="btn btn-primary btn-sm" onClick={onSkip}>Finish</button>
              : <button className="btn btn-primary btn-sm" onClick={onNext}>Next &#8594;</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { MeraCtx, AuthCtx, Glyph, AnimatedGlyph, Wordmark, Icon, useCountUp, ScoreNum, ScoreBadge, Chip, BarRow, PromiseBadge, SurfaceSwitch, DemoSwitch, PersonaBadge, TopNav, FooterMain, PageHead, useFakeLoad, NotifyToast, TourOverlay });
