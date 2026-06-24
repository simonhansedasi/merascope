/* ── Merascope landing page ── */

function EngineVisual() {
  const M = window.MERA;

  const SOURCES = [
    { label: 'EPA TRI', sub: 'toxic release inventory' },
    { label: 'USGS NWIS', sub: 'well + aquifer data' },
    { label: 'FEMA NFHL', sub: 'flood hazard layer' },
    { label: 'PRISM Climate', sub: '30-yr precip normals' },
    { label: 'SSURGO', sub: 'soil hydraulics' },
    { label: 'SRTM 1 arc-sec', sub: 'terrain elevation' },
    { label: 'OSM Power', sub: 'transmission network' },
  ];

  const INDS = [
    { label: 'Water availability', v: 0.78 },
    { label: 'Grid proximity', v: 0.91 },
    { label: 'Seismic safety', v: 0.74 },
    { label: 'Flood exposure', v: 0.86 },
    { label: 'Contamination dist.', v: 0.82 },
    { label: 'Aquifer depth', v: 0.65 },
    { label: 'Soil permeability', v: 0.71 },
  ];

  const composite = 0.791;

  const Arrow = () => (
    <div style={{ display: 'flex', alignItems: 'center', padding: '0 2px', flexShrink: 0 }}>
      <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true">
        <path d="M0 6 H18 M12 1 L18 6 L12 11" fill="none" stroke="var(--line)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );

  return (
    <div style={{ background: 'var(--mist)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1.5fr auto 1fr', alignItems: 'stretch' }}>

        <div style={{ padding: '20px 20px', borderRight: '1px solid var(--line-soft)' }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Public data sources</div>
          {SOURCES.map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 7 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--evergreen)', display: 'inline-block', flexShrink: 0, position: 'relative', top: 1 }}></span>
              <span style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 }}>{s.label}</span>
              <span style={{ fontSize: 11, color: 'var(--slate)' }}>{s.sub}</span>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: 'var(--slate)', marginTop: 5 }}>+ 14 more · all public domain</div>
        </div>

        <Arrow />

        <div style={{ padding: '20px 20px', borderRight: '1px solid var(--line-soft)' }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>22 indicators · 0-1 normalized</div>
          {INDS.map(ind => (
            <div key={ind.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <span style={{ width: 132, color: 'var(--slate)', fontSize: 12, flexShrink: 0 }}>{ind.label}</span>
              <span className="mb-track" style={{ flex: 1 }}>
                <span className="mb-fill" style={{ width: (ind.v * 100) + '%', background: M.rampColor(ind.v, 'field') }}></span>
              </span>
              <span className="score-serif" style={{ fontSize: 12, width: 32, textAlign: 'right', color: 'var(--ink)' }}>{ind.v.toFixed(2)}</span>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: 'var(--slate)', marginTop: 5 }}>+ 15 more indicators</div>
        </div>

        <Arrow />

        <div style={{ padding: '20px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, textAlign: 'center' }}>
          <div className="eyebrow">Composite score</div>
          <div className="score-serif" style={{ fontSize: 52, lineHeight: 1, color: M.rampColor(composite, 'field') }}>{composite.toFixed(3)}</div>
          <div className="microcopy">per 0.15 degree cell</div>
          <div style={{ height: 1, background: 'var(--line-soft)', width: '75%' }}></div>
          <div style={{ fontSize: 12, color: 'var(--evergreen)', fontWeight: 650, lineHeight: 1.45 }}>◈ Same number<br />for every user</div>
          <div className="microcopy" style={{ fontSize: 11 }}>Builder · Regulator · Press · Public</div>
        </div>

      </div>
      <div style={{ borderTop: '1px solid var(--line-soft)', padding: '9px 20px', display: 'flex', gap: 14, alignItems: 'center', background: 'var(--sand)' }}>
        <span style={{ fontSize: 11.5, color: 'var(--slate)' }}>All sources are public · methodology is published · weights are adjustable · scores are not</span>
        <a href="#/methodology" style={{ fontSize: 11.5, fontWeight: 650, marginLeft: 'auto', whiteSpace: 'nowrap' }}>Read the methodology →</a>
      </div>
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
      <section style={{ padding: '72px 24px 52px' }}>
        <div style={{ maxWidth: 1060, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', maxWidth: 660, margin: '0 auto 44px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}><AnimatedGlyph size={60} /></div>
            <h1 style={{ fontSize: 'clamp(28px, 3.8vw, 44px)', lineHeight: 1.12, fontWeight: 700 }}>
              One engine. One score.<br />For everyone.
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--slate)', margin: '18px auto 28px', maxWidth: 560 }}>
              Twenty-one public sources. Twenty-two normalized indicators. One composite score per cell; methodology published, weights adjustable, scores identical for everyone in the room.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a className="btn btn-primary" href="#/explorer" style={{ fontSize: 15, padding: '11px 22px' }}>Explore the live map — free</a>
              <a className="btn btn-ghost" href="#/methodology" style={{ fontSize: 15, padding: '11px 22px' }}>Read the methodology</a>
            </div>
            <p className="microcopy" style={{ marginTop: 14 }}>
              Public data · Published methodology · Reproducible end to end
            </p>
          </div>
          <EngineVisual />
        </div>
      </section>

      {/* DUAL-PATH — two equal doors */}
      <section style={{ padding: '30px 24px 0', maxWidth: 980, margin: '0 auto' }}>
        <div className="dual-doors" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
          <Door icon="gavel" h3="I review and approve projects"
            body="You're staffing a moratorium study, reviewing an application, or writing the bill. The applicant arrives with consultants. You should arrive with more. Independent scoring, mandated-study workbenches, and a case system that turns hearings into records; built for agencies, counties, commissions, and tribal governments."
            bullets={['Statewide atlases & report cards', 'The Docket: findings, conditions, rebuttals, versioned', 'Expert testimony backed by a scientific bench']}
            cta="Enter the Steward console" ctaHref="#/steward"
            micro="Entra ID single sign-on · procurement-friendly contracting" />
          <Door icon="pylon" h3="I site and build projects"
            body="A siting mistake is a nine-figure mistake. Browse land the way Zillow browses homes: every parcel scored for water rights, grid access, hazard and insurance posture, community sentiment, and heat-reuse upside. The fastest path to power is the site nobody has to fight about."
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
            ['1', 'SCORE', 'Twenty-two indicators, normalized 0–1, weighted your way. Two hard gates no slider can override: FEMA flood zones and protected or sovereign land.'],
            ['2', 'SEE', 'From state report cards down to the parcel. Existing, proposed, and recommended sites on one continuous surface.'],
            ['3', 'DECIDE', 'Dossiers for builders. Dockets for stewards. Fact sheets for everyone at the hearing; same numbers on every page.']
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
              Our public report cards grade each state's data-center footprint on water durability, hazard exposure, grid posture, and community burden, and compare what companies claim against where they actually build. When a fleet advertises record water efficiency while its newest campuses cluster in the driest cells of the state, the map says so. Quotably.
            </p>
            <a className="btn btn-ghost" href="#/explorer">See Washington's report card</a>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ textAlign: 'center', background: 'var(--mist)', border: '1px solid var(--line)', borderRadius: 12, padding: '20px 30px' }}>
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
            A data center is a furnace that happens to compute. Sited well, the heat warms greenhouses, drives carbon capture, and comes back as value instead of grievance. We score the upside too: energy additionality, heat-reuse radius, sequestration suitability; the map of where a data center makes its host community better off.
          </p>
          <a className="btn btn-quiet" href="#/explorer">Explore the opportunity layers</a>
        </div>
      </section>

      {/* FREE TIER STRIP */}
      <section style={{ background: 'var(--evergreen)', color: '#fff', padding: '44px 24px', textAlign: 'center' }}>
        <h3 style={{ fontSize: 24 }}>Start with the public map. It's free, and it stays free.</h3>
        <p style={{ maxWidth: 620, margin: '12px auto 22px', fontSize: 14.5, lineHeight: 1.6, opacity: 0.92 }}>
          The explorer, the indicators, the report cards, and the methodology are public; they are the point. Accounts add resolution, parcels, alerts, and workflow when you need them.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a className="btn" href="#/explorer" style={{ background: '#fff', color: 'var(--evergreen)' }}>Open the Explorer</a>
          <a className="btn" href="#/pricing" style={{ border: '1px solid rgba(255,255,255,.55)', color: '#fff' }}>Compare plans</a>
        </div>
      </section>
    </div>
  );
}

Object.assign(window, { LandingPage });
