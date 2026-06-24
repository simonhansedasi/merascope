/* ── Merascope app shell: router + auth + tweaks ── */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "rampStyle": "Field palette",
  "accent": "#B45F1D",
  "uiFont": "Source Sans",
  "theme": "Light"
}/*EDITMODE-END*/;

const RAMP_MAP = { 'Field palette': 'field', 'Colorblind-safe': 'cb' };
const FONT_MAP = { 'Source Sans': "'Source Sans 3', system-ui, sans-serif", 'Helvetica': "Helvetica, Arial, sans-serif", 'IBM Plex': "'IBM Plex Sans', system-ui, sans-serif" };

function useHashRoute() {
  const get = () => {
    const h = location.hash.replace(/^#/, '') || '/';
    const [path, qs] = h.split('?');
    const query = {};
    if (qs) qs.split('&').forEach(p => { const [k, v] = p.split('='); query[k] = decodeURIComponent(v || ''); });
    return { path: path === '' ? '/' : path, query };
  };
  const [route, setRoute] = React.useState(get);
  React.useEffect(() => {
    const fn = () => { setRoute(get()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  return route;
}

/* sign-in wall for gated surfaces */
function AuthWall({ need, setRole }) {
  if (need === 'co-party') {
    return (
      <div style={{ maxWidth: 520, margin: '64px auto 80px', padding: '0 24px', textAlign: 'center' }} data-screen-label="Sign-in wall — co-party">
        <span style={{ width: 54, height: 54, borderRadius: '50%', background: 'var(--mist)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="lock" size={24} color="var(--evergreen)" />
        </span>
        <h2 style={{ fontSize: 24, marginTop: 14 }}>Co-party sign-in</h2>
        <p style={{ color: 'var(--slate)', fontSize: 14.5, lineHeight: 1.6, margin: '10px 0 22px' }}>
          The lead agency has added your organization to a case. Sign in to access it.
        </p>
        <a className="btn btn-primary" href="#/login">Sign in</a>
        <p className="microcopy" style={{ marginTop: 16 }}>Your views are scoped to cases where your agency is listed.</p>
      </div>
    );
  }
  const label = need === 'builder' ? 'Builder workspace' : 'Steward console';
  return (
    <div style={{ maxWidth: 480, margin: '64px auto 80px', padding: '0 24px', textAlign: 'center' }} data-screen-label="Sign-in wall">
      <span style={{ width: 54, height: 54, borderRadius: '50%', background: 'var(--mist)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="lock" size={24} color="var(--evergreen)" />
      </span>
      <h2 style={{ fontSize: 24, marginTop: 14 }}>Sign in to open the {label}.</h2>
      <p style={{ color: 'var(--slate)', fontSize: 14.5, lineHeight: 1.6, margin: '10px 0 22px' }}>
        The map is public. Your workspace is not.
      </p>
      <a className="btn btn-primary" href="#/login">Sign in</a>
      <p className="microcopy" style={{ marginTop: 16 }}>Views and permissions are organization-scoped. Scores are not.</p>
    </div>
  );
}

function App() {
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
  const route = useHashRoute();
  const path = route.path;
  const [role, setRoleState] = React.useState(function() { try { return localStorage.getItem('mera_role') || 'public'; } catch (e) { return 'public'; } });
  const setRole = function(r) { setRoleState(r); try { localStorage.setItem('mera_role', r); } catch (e) { } };
  const partyKey = (function() { try { return localStorage.getItem('mera_party_key') || ''; } catch (e) { return ''; } })();

  const DEMO_TTL_MS = 20 * 60 * 1000;
  const [demoActive, setDemoActive] = React.useState(function() {
    try {
      var ts = parseInt(localStorage.getItem('mera_demo_ts') || '0');
      if (ts > 0 && (Date.now() - ts) < DEMO_TTL_MS) return true;
      if (ts > 0) {
        ['mera_demo_ts','mera_saved_v1','mera_crm_v1','mera_tour_done','mera_steward_tour_done'].forEach(function(k) { localStorage.removeItem(k); });
      }
      return false;
    } catch (e) { return false; }
  });
  React.useEffect(function() { window._setDemoActive = setDemoActive; }, []);

  const [authUser, setAuthUser] = React.useState(null);
  React.useEffect(function() {
    window.refreshActiveZones = function() {
      fetch('/api/zones/active')
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(zones) {
          window.ACTIVE_ZONES = zones || [];
          if (window._recolorMap) window._recolorMap();
        })
        .catch(function() { window.ACTIVE_ZONES = []; });
    };
    window.refreshActiveZones();
  }, []);
  React.useEffect(function() {
    fetch('/api/auth/me')
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(u) {
        if (u && u.email) {
          setAuthUser(u);
          setRole(u.role || 'builder');
        }
      })
      .catch(function() {});
  }, []);
  var logout = function() {
    fetch('/api/auth/logout', { method: 'POST' })
      .then(function() { setAuthUser(null); setRole('public'); });
  };

  const [tourStep, setTourStep] = React.useState(() => {
    try { return localStorage.getItem('mera_tour_done') ? null : 0; } catch (e) { return null; }
  });
  React.useEffect(function() { window._inTour = function() { return tourStep !== null; }; }, [tourStep]);
  const applyTourStep = step => {
    if (step.role === 'public') setRole('public');
    else if (step.role) setRole(step.role);
    if (step.partyKey) { try { localStorage.setItem('mera_party_key', step.partyKey); } catch (e) { } }
    if (step.nav) location.hash = step.nav;
  };
  const startTour = () => { applyTourStep(TOUR_STEPS[0]); setTourStep(1); };
  const nextTour = () => {
    const cur = TOUR_STEPS[tourStep - 1];
    if (cur && cur.done) { skipTour(); return; }
    const next = TOUR_STEPS[tourStep];
    if (next) applyTourStep(next);
    setTourStep(s => Math.min(s + 1, TOUR_STEPS.length));
  };
  const backTour = () => {
    if (tourStep <= 1) return;
    const prev = TOUR_STEPS[tourStep - 2];
    if (prev) applyTourStep(prev);
    setTourStep(s => s - 1);
  };
  const skipTour = () => {
    try { localStorage.setItem('mera_tour_done', '1'); } catch (e) { }
    setTourStep(null);
  };

  const [stewardTourStep, setStewardTourStep] = React.useState(null);
  React.useEffect(function() {
    if (role === 'steward' && authUser && tourStep === null) {
      try {
        if (!localStorage.getItem('mera_steward_tour_done')) setStewardTourStep(0);
      } catch (e) {}
    }
  }, [role, tourStep]);
  const applySTourStep = function(step) {
    if (step.role) setRole(step.role);
    if (step.nav) location.hash = step.nav;
  };
  const startStewardTour = function() { applySTourStep(STEWARD_TOUR_STEPS[0]); setStewardTourStep(1); };
  const nextStewardTour = function() {
    const cur = STEWARD_TOUR_STEPS[stewardTourStep - 1];
    if (cur && cur.done) { skipStewardTour(); return; }
    const next = STEWARD_TOUR_STEPS[stewardTourStep];
    if (next) applySTourStep(next);
    setStewardTourStep(function(s) { return Math.min(s + 1, STEWARD_TOUR_STEPS.length); });
  };
  const backStewardTour = function() {
    if (stewardTourStep <= 1) return;
    const prev = STEWARD_TOUR_STEPS[stewardTourStep - 2];
    if (prev) applySTourStep(prev);
    setStewardTourStep(function(s) { return s - 1; });
  };
  const skipStewardTour = function() {
    try { localStorage.setItem('mera_steward_tour_done', '1'); } catch (e) {}
    setStewardTourStep(null);
  };

  React.useEffect(() => {
    document.documentElement.style.setProperty('--basalt', t.accent);
    document.documentElement.style.setProperty('--sans', FONT_MAP[t.uiFont] || FONT_MAP['Source Sans']);
    document.documentElement.setAttribute('data-theme', t.theme === 'Dark' ? 'dark' : '');
  }, [t.accent, t.uiFont, t.theme]);

  let page;
  if (path === '/') page = <LandingPage />;
  else if (path.startsWith('/explorer')) page = <ExplorerPage query={route.query} />;
  else if (path.startsWith('/builder/case/')) page = <BuilderCaseView id={path.split('/')[3]} />;
  else if (path.startsWith('/builder/site/')) page = <SiteProfile id={path.split('/')[3]} />;
  else if (path === '/builder/status') page = <StatusPage />;
  else if (path === '/builder/portfolio') page = <PortfolioPage />;
  else if (path.startsWith('/builder')) page = <BuilderSearch />;
  else if (path.startsWith('/steward/case/')) page = <CaseFilePage id={path.split('/')[3]} />;
  else if (path === '/steward/impasse') page = <ImpassePage />;
  else if (path === '/steward/litigation') page = <LitigationPage />;
  else if (path === '/steward/studies') page = <StudiesPage />;
  else if (path === '/steward/templates') page = <StewardTemplatesPage />;
  else if (path.startsWith('/steward')) page = <DocketPage />;
  else if (path.startsWith('/co-party/case/')) page = <CaseFilePage id={path.split('/')[3]} />;
  else if (path.startsWith('/co-party')) page = <CoDocketPage />;
  else if (path.startsWith('/factsheets')) page = <FactSheetsPage which={path.split('/')[2]} />;
  else if (path.startsWith('/pricing')) page = <PricingPage />;
  else if (path.startsWith('/tracker')) page = <TokenTrackerPage />;
  else if (path.startsWith('/login')) page = <LoginPage />;
  else if (path.startsWith('/methodology')) page = <MethodologyPage />;
  else if (path.startsWith('/evidence')) page = <EvidencePage caseId={route.query.case} />;
  else page = <LandingPage />;

  /* auth gate */
  const need = path.startsWith('/builder') ? 'builder'
    : path.startsWith('/steward') ? 'steward'
    : path.startsWith('/co-party') ? 'co-party'
    : null;
  if (need && role !== need) {
    if (!(need === 'steward' && demoActive)) {
      page = <AuthWall need={need} setRole={setRole} />;
    }
  }

  return (
    <MeraCtx.Provider value={{ ramp: RAMP_MAP[t.rampStyle] || 'field' }}>
      <AuthCtx.Provider value={{ role, setRole, partyKey, authUser, logout, demoActive, setDemoActive }}>
        <TopNav route={path} role={role} />
        {page}
        {path !== '/login' && <FooterMain />}
        <TweaksPanel>
          <TweakSection label="Appearance" />
          <TweakRadio label="Mode" value={t.theme} options={['Light', 'Dark']} onChange={v => setTweak('theme', v)} />
          <TweakSection label="Score ramp" />
          <TweakRadio label="Palette" value={t.rampStyle} options={['Field palette', 'Colorblind-safe']} onChange={v => setTweak('rampStyle', v)} />
          <TweakSection label="Brand" />
          <TweakColor label="Accent (basalt)" value={t.accent} options={['#B45F1D', '#9C3E1E', '#5C6B1F', '#44546A']} onChange={v => setTweak('accent', v)} />
          <TweakSelect label="UI font" value={t.uiFont} options={['Source Sans', 'Helvetica', 'IBM Plex']} onChange={v => setTweak('uiFont', v)} />
          <TweakSection label="Tour" />
          <button className="btn btn-quiet btn-sm" style={{ margin: '4px 8px 8px' }} onClick={() => { try { localStorage.removeItem('mera_tour_done'); } catch (e) { } setTourStep(0); }}>Replay guided tour</button>
          <button className="btn btn-quiet btn-sm" style={{ margin: '0 8px 8px' }} onClick={() => { try { localStorage.removeItem('mera_steward_tour_done'); } catch (e) { } setStewardTourStep(0); }}>Replay steward tour</button>
        </TweaksPanel>
        <TourOverlay tourStep={tourStep} onStart={startTour} onNext={nextTour} onBack={backTour} onSkip={skipTour} />
        <StewardTourOverlay tourStep={stewardTourStep} onStart={startStewardTour} onNext={nextStewardTour} onBack={backStewardTour} onSkip={skipStewardTour} />
      </AuthCtx.Provider>
    </MeraCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
