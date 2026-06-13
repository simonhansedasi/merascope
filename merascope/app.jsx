/* ── Merascope app shell: router + auth + tweaks ── */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "rampStyle": "Field palette",
  "accent": "#B45F1D",
  "uiFont": "Source Sans"
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
  const label = need === 'builder' ? 'Builder workspace' : 'Steward console';
  const persona = need === 'builder' ? 'Sarah Chen — Skyline Infrastructure Partners' : 'Dept. of Ecology — reviewer';
  return (
    <div style={{ maxWidth: 480, margin: '64px auto 80px', padding: '0 24px', textAlign: 'center' }} data-screen-label="Sign-in wall">
      <span style={{ width: 54, height: 54, borderRadius: '50%', background: 'var(--mist)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="lock" size={24} color="var(--evergreen)" />
      </span>
      <h2 style={{ fontSize: 24, marginTop: 14 }}>The {label} is behind sign-in.</h2>
      <p style={{ color: 'var(--slate)', fontSize: 14.5, lineHeight: 1.6, margin: '10px 0 22px' }}>
        The map is public. The workspace on top of it is yours. Sign in — or use the mocked SSO to demo this surface.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <a className="btn btn-primary" href="#/login">Sign in</a>
        <button className="btn btn-ghost" onClick={() => setRole(need)}>⊞ Demo SSO — {persona}</button>
      </div>
      <p className="microcopy" style={{ marginTop: 16 }}>Your views and permissions are scoped by your organization — your scores are not.</p>
    </div>
  );
}

function App() {
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
  const route = useHashRoute();
  const path = route.path;
  const [role, setRoleState] = React.useState(() => { try { return localStorage.getItem('mera_role') || 'public'; } catch (e) { return 'public'; } });
  const setRole = r => { setRoleState(r); try { localStorage.setItem('mera_role', r); } catch (e) { } };

  React.useEffect(() => {
    document.documentElement.style.setProperty('--basalt', t.accent);
    document.documentElement.style.setProperty('--sans', FONT_MAP[t.uiFont] || FONT_MAP['Source Sans']);
  }, [t.accent, t.uiFont]);

  let page;
  if (path === '/') page = <LandingPage />;
  else if (path.startsWith('/explorer')) page = <ExplorerPage query={route.query} />;
  else if (path === '/builder/sitelab') page = <SiteLabPage />;
  else if (path.startsWith('/builder/site/')) page = <SiteProfile id={path.split('/')[3]} />;
  else if (path === '/builder/watchlist') page = <WatchlistPage />;
  else if (path === '/builder/portfolio') page = <PortfolioPage />;
  else if (path.startsWith('/builder')) page = <BuilderSearch />;
  else if (path.startsWith('/steward/case/')) page = <CaseFilePage />;
  else if (path === '/steward/impasse') page = <ImpassePage />;
  else if (path === '/steward/litigation') page = <LitigationPage />;
  else if (path === '/steward/studies') page = <StudiesPage />;
  else if (path.startsWith('/steward')) page = <DocketPage />;
  else if (path.startsWith('/factsheets')) page = <FactSheetsPage which={path.split('/')[2]} />;
  else if (path.startsWith('/pricing')) page = <PricingPage />;
  else if (path.startsWith('/tracker')) page = <TokenTrackerPage />;
  else if (path.startsWith('/login')) page = <LoginPage />;
  else if (path.startsWith('/methodology')) page = <MethodologyPage />;
  else page = <LandingPage />;

  /* auth gate: Builder & Steward surfaces require the matching role */
  const need = path.startsWith('/builder') ? 'builder' : path.startsWith('/steward') ? 'steward' : null;
  if (need && role !== need) page = <AuthWall need={need} setRole={setRole} />;

  return (
    <MeraCtx.Provider value={{ ramp: RAMP_MAP[t.rampStyle] || 'field' }}>
      <AuthCtx.Provider value={{ role, setRole }}>
        <TopNav route={path} role={role} />
        {page}
        {path !== '/login' && <FooterMain />}
        <TweaksPanel>
          <TweakSection label="Score ramp" />
          <TweakRadio label="Palette" value={t.rampStyle} options={['Field palette', 'Colorblind-safe']} onChange={v => setTweak('rampStyle', v)} />
          <TweakSection label="Brand" />
          <TweakColor label="Accent (basalt)" value={t.accent} options={['#B45F1D', '#9C3E1E', '#5C6B1F', '#44546A']} onChange={v => setTweak('accent', v)} />
          <TweakSelect label="UI font" value={t.uiFont} options={['Source Sans', 'Helvetica', 'IBM Plex']} onChange={v => setTweak('uiFont', v)} />
        </TweaksPanel>
      </AuthCtx.Provider>
    </MeraCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
