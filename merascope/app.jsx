/* ── Merascope app shell: router + auth + tweaks ── */
// This is the top-level file: it owns the hash-based router (which page component
// renders for a given #/path), the role/session state (public/builder/steward/
// co-party/admin), the guided-tour state machines, and the design "tweaks" panel
// (accent color, font, score-ramp palette, light/dark theme). Every other page
// component (LandingPage, ExplorerPage, BuilderCaseView, DocketPage, etc.) is
// rendered inside <App> based on the current route and the signed-in role.

// Design-tool "tweaks" defaults — editable live via the TweaksPanel UI and persisted
// to localStorage by useTweaks (ui.jsx). The EDITMODE markers let an external tool
// rewrite just this object in place without touching the rest of the file.
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "rampStyle": "Field palette",
  "accent": "#B45F1D",
  "uiFont": "Source Sans",
  "theme": "Light"
}/*EDITMODE-END*/;

// Maps the human-readable tweak labels above to the internal keys used by
// M.rampColor()/M.rampText() (data.js) and the CSS font-family stacks.
const RAMP_MAP = { 'Field palette': 'field', 'Colorblind-safe': 'cb' };
const FONT_MAP = { 'Source Sans': "'Source Sans 3', system-ui, sans-serif", 'Helvetica': "Helvetica, Arial, sans-serif", 'IBM Plex': "'IBM Plex Sans', system-ui, sans-serif" };

// Minimal hash-based router (no react-router). Reads location.hash on mount and on
// every 'hashchange' event, splitting "#/path?k=v&k2=v2" into a {path, query} pair
// that <App> uses to decide which page component to render.
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

/* Sign-in wall for gated surfaces (builder/steward/co-party). Rendered by <App>
   in place of the requested page whenever the caller's role doesn't match the
   surface they're trying to reach and they aren't in an active demo session. */
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

// The root component: mounted once at the bottom of this file. Holds all
// cross-cutting app state (route, role, demo/auth session, onboarding tours,
// design tweaks) and decides which page component to render for the current
// route, wrapping it in the context providers (MeraCtx, AuthCtx) that every
// page and shared component (ui.jsx) reads from.
function App() {
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
  const route = useHashRoute();
  const path = route.path;
  // `role` is the demo/session persona driving UI gating (public/builder/steward/
  // co-party/admin) — persisted to localStorage so a refresh doesn't bounce the
  // user back to signed-out. Real auth (authUser, below) can override it.
  const [role, setRoleState] = React.useState(function() { try { return localStorage.getItem('mera_role') || 'public'; } catch (e) { return 'public'; } });
  const setRole = function(r) { setRoleState(r); try { localStorage.setItem('mera_role', r); } catch (e) { } };
  const partyKey = (function() { try { return localStorage.getItem('mera_party_key') || ''; } catch (e) { return ''; } })();

  // Unauthenticated "demo mode": lets a visitor click through the steward docket
  // and demo builder submission flow without an account. Session persists for
  // 20 minutes via a timestamp in localStorage; once it expires, all demo-scoped
  // localStorage keys (saved cells, CRM state, tour flags) are wiped so a stale
  // demo session can't leak into a later real session.
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
  // Exposes the setter on window so other files (e.g. builder.jsx, after a demo
  // submission) can flip demoActive on without needing this component's props.
  React.useEffect(function() { window._setDemoActive = setDemoActive; }, []);

  const [authUser, setAuthUser] = React.useState(null);
  // Steward weight-template zone locks (steward-templates.jsx) are global and
  // affect map coloring for everyone, so they're fetched once on mount and
  // exposed on window rather than threaded through props/context.
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
  // Real magic-link session check (server.py /api/auth/me). If a session cookie
  // is present, this promotes the demo `role` state to the user's actual role.
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

  // Public guided-tour state machine (TOUR_STEPS, ui.jsx). tourStep === null means
  // no tour is running; tourStep is the index of the next step to apply. Starts
  // at step 0 automatically unless 'mera_tour_done' is already set.
  const [tourStep, setTourStep] = React.useState(() => {
    try { return localStorage.getItem('mera_tour_done') ? null : 0; } catch (e) { return null; }
  });
  // IMPORTANT ordering gotcha (see CLAUDE.md "window._inTour TDZ gotcha"): this
  // effect's dependency array closes over `tourStep`, so it MUST be declared
  // after the `tourStep` useState above. Babel here only transpiles JSX, not
  // let/const-to-var, so referencing `tourStep` before its declaration at
  // render time throws a ReferenceError (Temporal Dead Zone) and blanks the page.
  React.useEffect(function() { window._inTour = function() { return tourStep !== null; }; }, [tourStep]);
  const applyTourStep = step => {
    if (step.role === 'public') setRole('public');
    else if (step.role) setRole(step.role);
    if (step.partyKey) { try { localStorage.setItem('mera_party_key', step.partyKey); } catch (e) { } }
    if (step.nav) location.hash = step.nav;
  };
  const startTour = () => { applyTourStep(TOUR_STEPS[0]); setTourStep(1); };
  // Advances the tour by one step, applying that step's role/nav side effects.
  // If the *previous* step was flagged `done`, the tour ends instead of advancing
  // (lets the last step's "Finish" button reuse the same Next button/handler).
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

  // Second, separate tour for the Steward console (STEWARD_TOUR_STEPS, ui.jsx).
  // Auto-starts only for a *real* (authUser-backed) steward, and only once the
  // public tour (tourStep) has finished/been skipped — the two tours never overlap.
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

  // Pushes the current tweak values onto :root as CSS custom properties / a
  // data-theme attribute, so styles.css's [data-theme="dark"] overrides and the
  // --basalt/--sans variables used throughout the app pick them up live.
  React.useEffect(() => {
    document.documentElement.style.setProperty('--basalt', t.accent);
    document.documentElement.style.setProperty('--sans', FONT_MAP[t.uiFont] || FONT_MAP['Source Sans']);
    document.documentElement.setAttribute('data-theme', t.theme === 'Dark' ? 'dark' : '');
  }, [t.accent, t.uiFont, t.theme]);

  // Route table: matches route.path against each surface's URL prefixes and picks
  // the page component to render. Order matters — more specific prefixes (e.g.
  // '/builder/case/') are checked before their looser parents ('/builder').
  let page;
  if (path === '/') page = <LandingPage />;
  else if (path.startsWith('/explorer')) page = <ExplorerPage query={route.query} />;
  else if (path.startsWith('/builder/case/')) page = <BuilderCaseView id={path.split('/')[3]} query={route.query} />;
  else if (path.startsWith('/builder/site/')) page = <SiteProfile id={path.split('/')[3]} />;
  else if (path === '/builder/status') page = <StatusPage />;
  else if (path === '/builder/portfolio') page = <PortfolioPage />;
  else if (path.startsWith('/builder')) page = <BuilderSearch />;
  else if (path.startsWith('/steward/case/')) page = <CaseFilePage id={path.split('/')[3]} />;
  else if (path === '/steward/impasse') page = <ImpassePage />;
  else if (path === '/steward/litigation') page = <LitigationPage />;
  else if (path === '/steward/studies') page = <StudiesPage />;
  else if (path === '/steward/templates') page = <StewardTemplatesPage />;
  else if (path === '/steward/inbox') page = <InboxPage />;
  else if (path === '/steward/bulk-import') page = <BulkIntakePage />;
  else if (path.startsWith('/steward')) page = <DocketPage />;
  else if (path.startsWith('/co-party/case/')) page = <CaseFilePage id={path.split('/')[3]} />;
  else if (path.startsWith('/co-party')) page = <CoDocketPage />;
  else if (path.startsWith('/factsheets')) page = <FactSheetsPage which={path.split('/')[2]} />;
  else if (path.startsWith('/pricing')) page = <PricingPage />;
  else if (path.startsWith('/login')) page = <LoginPage />;
  else if (path.startsWith('/methodology')) page = <MethodologyPage />;
  else if (path.startsWith('/evidence')) page = <EvidencePage caseId={route.query.case} />;
  else page = <LandingPage />;

  /* Auth gate: if the route requires a persona (builder/steward/co-party) that
     doesn't match the current role, swap the resolved page out for AuthWall —
     unless the role is 'admin' (admins can view builder/steward surfaces), or
     the surface is 'steward' and an unauthenticated demo session is active
     (demo mode renders its own read-only docket, see steward.jsx DemoStewardDocket). */
  const need = path.startsWith('/builder') ? 'builder'
    : path.startsWith('/steward') ? 'steward'
    : path.startsWith('/co-party') ? 'co-party'
    : null;
  if (need && role !== need && !(role === 'admin' && (need === 'steward' || need === 'builder'))) {
    if (!(need === 'steward' && demoActive)) {
      page = <AuthWall need={need} setRole={setRole} />;
    }
  }

  return (
    <MeraCtx.Provider value={{ ramp: RAMP_MAP[t.rampStyle] || 'field' }}>
      <AuthCtx.Provider value={{ role, setRole, partyKey, authUser, logout, demoActive, setDemoActive, readOnly: !!(authUser && authUser.role === 'admin') }}>
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

// Mount point — index.html provides <div id="root">. This is the only
// ReactDOM.createRoot() call in the app; every page is a child of <App>.
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
