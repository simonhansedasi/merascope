/* ── Merascope landing page — copy is verbatim from brand spec ── */

function HeroMapBackdrop() {
  const M = window.MERA;
  const [w, setW] = React.useState({ ...M.DEFAULT_WEIGHTS });
  React.useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let flip = false;
    const t = setInterval(() => {
      flip = !flip;
      setW(normalizeWeights({ ...M.DEFAULT_WEIGHTS }, 'water', flip ? 18 : 35));
    }, 2600);
    return () => clearInterval(t);
  }, []);
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '118%', maxWidth: 1500, opacity: 0.34, filter: 'saturate(.92)' }}>
        <WAMap weights={w} interactive={false} markers={false} />
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(250,248,244,.55), rgba(250,248,244,.86) 70%, var(--paper))' }}></div>
    </div>
  );
}

function Door({ icon, h3, body, bullets, cta, ctaHref, micro }) {
  return (
    <div className="card" style={{ padding: '26px 28px', display: 'flex', flexDirection: 'column', gap: 13 }}>
      <span style={{ width: 40, height: 40, borderRadius: 9, background: 'var(--mist)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={21} color="var(--evergreen)" />
      </span>
      <h3 style={{ fontSize: 20 }}>{h3}</h3>
      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink)' }}>{body}</p>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
        {bullets.map(b => (
          <li key={b} style={{ display: 'flex', gap: 9, fontSize: 14, color: 'var(--slate)' }}>
            <span style={{ color: 'var(--basalt)', lineHeight: 1.5 }}>·</span><span>{b}</span>
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 'auto', paddingTop: 8 }}>
        <a className="btn btn-primary" href={ctaHref} style={{ width: '100%' }}>{cta}</a>
        <div className="microcopy" style={{ textAlign: 'center', marginTop: 8 }}>{micro}</div>
      </div>
    </div>
  );
}

function LandingPage() {
  const M = window.MERA;
  return (
    <div data-screen-label="Landing">
      {/* HERO */}
      <section style={{ position: 'relative', padding: '86px 24px 70px', textAlign: 'center', overflow: 'hidden' }}>
        <HeroMapBackdrop />
        <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}><AnimatedGlyph size={76} /></div>
          <div className="eyebrow" style={{ marginBottom: 16 }}>Site-selection intelligence for the data center era</div>
          <div style={{ fontSize: 13, letterSpacing: '.18em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--slate)', marginBottom: 8 }}>Our goal</div>
          <h1 style={{ fontSize: 'clamp(30px, 4.6vw, 48px)', lineHeight: 1.12, fontWeight: 700 }}>
            Approve more data centers,<br />but eliminate environmental harm.
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.55, color: 'var(--slate)', maxWidth: 620, margin: '20px auto 26px' }}>
            The build-out is coming either way. One scoring engine. Nine indicators. Two hard gates. The same map for the people who approve data centers and the people who build them.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a className="btn btn-primary" href="#/explorer" style={{ fontSize: 16, padding: '12px 24px' }}>Explore the live map — free</a>
            <a className="btn btn-ghost" href="#/methodology" style={{ fontSize: 16, padding: '12px 24px' }}>See the methodology</a>
          </div>
          <p className="microcopy" style={{ marginTop: 18 }}>
            Public data. Published methodology. Reproducible end to end.<br />As featured in statewide press coverage of the 2026 moratorium.
          </p>
        </div>
      </section>

      {/* DUAL-PATH — two equal doors */}
      <section style={{ padding: '30px 24px 0', maxWidth: 980, margin: '0 auto' }}>
        <div className="dual-doors" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
          <Door icon="gavel" h3="I review and approve projects"
            body="You’re staffing a moratorium study, reviewing an application, or writing the bill. The applicant arrives with consultants. You should arrive with more. Independent scoring, mandated-study workbenches, and a case system that turns hearings into records — built for agencies, counties, commissions, and tribal governments."
            bullets={['Statewide atlases & report cards', 'The Docket: findings, conditions, rebuttals — versioned', 'Expert testimony backed by a scientific bench']}
            cta="Enter the Steward console" ctaHref="#/steward"
            micro="Entra ID single sign-on · procurement-friendly contracting" />
          <Door icon="pylon" h3="I site and build projects"
            body="A siting mistake is a nine-figure mistake. Browse land the way Zillow browses homes — every parcel scored for water rights, grid access, hazard and insurance posture, community sentiment, and heat-reuse upside. The fastest path to power is the site nobody has to fight about."
            bullets={['Parcel-grade listing cards & comparables', 'Watchlists with bill, rate-case & moratorium alerts', 'One-click board-ready dossiers']}
            cta="Enter the Builder workspace" ctaHref="#/builder"
            micro="Portfolio screening · field surveys proctored & tracked" />
        </div>
        {/* connector to one engine */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 0 }}>
          <svg width="320" height="58" viewBox="0 0 320 58" aria-hidden="true">
            <path d="M70 0 V22 Q70 34 92 34 H148" fill="none" stroke="var(--line)" strokeWidth="1.6" />
            <path d="M250 0 V22 Q250 34 228 34 H172" fill="none" stroke="var(--line)" strokeWidth="1.6" />
            <line x1="160" y1="34" x2="160" y2="52" stroke="var(--line)" strokeWidth="1.6" />
          </svg>
          <Glyph size={34} />
          <div style={{ fontSize: 14.5, fontWeight: 650, color: 'var(--evergreen)', marginTop: 8 }}>One engine. One score. No thumb on the scale.</div>
          <div style={{ fontSize: 15.5, marginTop: 16, fontWeight: 600 }}>Both doors open onto the same map.</div>
          <div className="callout" style={{ maxWidth: 660, margin: '14px 0 6px', padding: '16px 20px', fontSize: 13.5, lineHeight: 1.6, textAlign: 'left' }}>
            <b style={{ color: 'var(--evergreen)' }}>◈ THE SAME SCORE PROMISE</b> — {M.PROMISE.long}
          </div>
          <a href="#/methodology" style={{ fontSize: 13.5, fontWeight: 650 }}>Read the full methodology →</a>
        </div>
      </section>

      {/* STAT BAND */}
      <section style={{ background: 'var(--slate)', color: '#fff', marginTop: 54, padding: '34px 24px' }}>
        <div className="statband" style={{ display: 'flex', gap: 26, justifyContent: 'space-between', maxWidth: 1080, margin: '0 auto' }}>
          {M.STATS.map(st => (
            <div key={st.n} style={{ minWidth: 150, flex: 1 }} title="Sources: see methodology">
              <div className="score-serif" style={{ fontSize: 34, lineHeight: 1.1 }}>{st.n}</div>
              <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>{st.t}</div>
            </div>
          ))}
        </div>
        <p style={{ maxWidth: 1080, margin: '24px auto 0', fontSize: 13.5, opacity: 0.75, borderTop: '1px solid rgba(255,255,255,.18)', paddingTop: 16 }}>
          Bad siting now has four failure modes: stranded capital, stranded time, stranded trust, stranded water. Every one of them was visible on a map first.
        </p>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ padding: '58px 24px 10px', maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 26 }}>
          {[
            ['1', 'SCORE', 'Nine indicators, normalized 0–1, weighted your way. Two hard gates no slider can override: unbuildable terrain and protected or sovereign land.'],
            ['2', 'SEE', 'From state report cards down to the parcel. Existing, proposed, and recommended sites on one continuous surface.'],
            ['3', 'DECIDE', 'Dossiers for builders. Dockets for stewards. Fact sheets for everyone at the hearing — same numbers on every page.']
          ].map(([n, t, b]) => (
            <div key={n}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span className="score-serif" style={{ fontSize: 30, color: 'var(--basalt)' }}>{n}</span>
                <h3 style={{ fontSize: 15, letterSpacing: '.12em' }}>{t}</h3>
              </div>
              <p style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--slate)', marginTop: 8 }}>{b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* REPORT CARD TEASER */}
      <section style={{ padding: '48px 24px', maxWidth: 1000, margin: '0 auto' }}>
        <div className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: 30, padding: '30px 34px', alignItems: 'center' }}>
          <div style={{ flex: '1 1 380px' }}>
            <h3 style={{ fontSize: 22 }}>Every state gets a grade. Every claim gets checked.</h3>
            <p style={{ fontSize: 14.5, lineHeight: 1.65, color: 'var(--ink)', margin: '12px 0 16px' }}>
              Our public report cards grade each state’s data-center footprint on water durability, hazard exposure, grid posture, and community burden — and compare what companies claim against where they actually build. When a fleet advertises record water efficiency while its newest campuses cluster in the driest cells of the state, the map says so. Quotably.
            </p>
            <a className="btn btn-ghost" href="#/explorer">See Washington’s report card</a>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ textAlign: 'center', background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '20px 30px' }}>
              <div className="microcopy" style={{ letterSpacing: '.1em', textTransform: 'uppercase' }}>Washington</div>
              <div className="score-serif" style={{ fontSize: 64, lineHeight: 1, color: 'var(--basalt)' }}>{M.STATE_GRADE}</div>
              <div className="microcopy">composite grade · {M.VERSION}</div>
            </div>
          </div>
        </div>
      </section>

      {/* NET-BENEFIT TEASER */}
      <section style={{ padding: '0 24px 48px', maxWidth: 1000, margin: '0 auto' }}>
        <div className="callout" style={{ padding: '30px 34px' }}>
          <h3 style={{ fontSize: 22 }}>Not just where to avoid. Where it actually works.</h3>
          <p style={{ fontSize: 14.5, lineHeight: 1.65, margin: '12px 0 16px', maxWidth: 720 }}>
            A data center is a furnace that happens to compute. Sited well, the heat warms greenhouses, drives carbon capture, and comes back as value instead of grievance. We score the upside too: energy additionality, heat-reuse radius, sequestration suitability — the map of where a data center makes its host community better off.
          </p>
          <a className="btn btn-quiet" href="#/explorer">Explore the opportunity layers</a>
        </div>
      </section>

      {/* FREE TIER STRIP */}
      <section style={{ background: 'var(--evergreen)', color: '#fff', padding: '44px 24px', textAlign: 'center' }}>
        <h3 style={{ fontSize: 24 }}>Start with the public map. It’s free, and it stays free.</h3>
        <p style={{ maxWidth: 620, margin: '12px auto 22px', fontSize: 14.5, lineHeight: 1.6, opacity: 0.92 }}>
          The explorer, the indicators, the report cards, and the methodology are public — they’re the point. So is the Token Tracker plug-in: your own prompts’ water and carbon, per request. Accounts add resolution, parcels, alerts, and workflow when you need them.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a className="btn" href="#/explorer" style={{ background: '#fff', color: 'var(--evergreen)' }}>Open the Explorer</a>
          <a className="btn" href="#/tracker" style={{ border: '1px solid rgba(255,255,255,.55)', color: '#fff' }}>Get the Token Tracker</a>
          <a className="btn" href="#/pricing" style={{ border: '1px solid rgba(255,255,255,.55)', color: '#fff' }}>Compare plans</a>
        </div>
      </section>
    </div>
  );
}

Object.assign(window, { LandingPage });
