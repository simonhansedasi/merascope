/* ── Merascope map engine: multi-state choropleth (Leaflet) + weight sliders ── */

const STATE_NAMES = {
  AL:'Alabama', AR:'Arkansas', AZ:'Arizona', CA:'California', CO:'Colorado',
  CT:'Connecticut', DE:'Delaware', FL:'Florida', GA:'Georgia', IA:'Iowa',
  ID:'Idaho', IL:'Illinois', IN:'Indiana', KS:'Kansas', KY:'Kentucky',
  LA:'Louisiana', MA:'Massachusetts', MD:'Maryland', ME:'Maine', MI:'Michigan',
  MN:'Minnesota', MO:'Missouri', MS:'Mississippi', MT:'Montana', NC:'North Carolina',
  ND:'North Dakota', NE:'Nebraska', NH:'New Hampshire', NJ:'New Jersey', NM:'New Mexico',
  NV:'Nevada', NY:'New York', OH:'Ohio', OK:'Oklahoma', OR:'Oregon', PA:'Pennsylvania',
  RI:'Rhode Island', SC:'South Carolina', SD:'South Dakota', TN:'Tennessee', TX:'Texas',
  UT:'Utah', VA:'Virginia', VT:'Vermont', WA:'Washington', WI:'Wisconsin',
  WV:'West Virginia', WY:'Wyoming',
};

const CELL_PX = 15; // kept for sitelab.jsx compat

const GRID_URLS = [
  'data/WA/grid_scores.geojson',
  'data/OR/grid_scores.geojson',
  'data/TX/grid_scores.geojson',
  'data/CA/grid_scores.geojson',
  'data/NV/grid_scores.geojson',
  'data/UT/grid_scores.geojson',
  'data/ID/grid_scores.geojson',
  'data/MT/grid_scores.geojson',
  'data/AZ/grid_scores.geojson',
  'data/CO/grid_scores.geojson',
  'data/WY/grid_scores.geojson',
  'data/NM/grid_scores.geojson',
  'data/ND/grid_scores.geojson',
  'data/SD/grid_scores.geojson',
  'data/NE/grid_scores.geojson',
  'data/KS/grid_scores.geojson',
  'data/OK/grid_scores.geojson',
  'data/MN/grid_scores.geojson',
  'data/IA/grid_scores.geojson',
  'data/MO/grid_scores.geojson',
  'data/AR/grid_scores.geojson',
  'data/LA/grid_scores.geojson',
  'data/MI/grid_scores.geojson',
  'data/WI/grid_scores.geojson',
  'data/IL/grid_scores.geojson',
  'data/IN/grid_scores.geojson',
  'data/KY/grid_scores.geojson',
  'data/TN/grid_scores.geojson',
  'data/MS/grid_scores.geojson',
  'data/GA/grid_scores.geojson',
  'data/OH/grid_scores.geojson',
  'data/AL/grid_scores.geojson',
  'data/FL/grid_scores.geojson',
  'data/SC/grid_scores.geojson',
  'data/NC/grid_scores.geojson',
  'data/VA/grid_scores.geojson',
  'data/WV/grid_scores.geojson',
  'data/PA/grid_scores.geojson',
  'data/NY/grid_scores.geojson',
  'data/NJ/grid_scores.geojson',
  'data/CT/grid_scores.geojson',
  'data/RI/grid_scores.geojson',
  'data/MA/grid_scores.geojson',
  'data/VT/grid_scores.geojson',
  'data/NH/grid_scores.geojson',
  'data/ME/grid_scores.geojson',
  'data/DE/grid_scores.geojson',
  'data/MD/grid_scores.geojson',
];
let _gridCache = null;
let _gridCachePromise = null;

function loadGridCache() {
  if (_gridCache) return Promise.resolve(_gridCache);
  if (_gridCachePromise) return _gridCachePromise;
  let fid = 0;
  _gridCachePromise = Promise.all(GRID_URLS.map(url =>
    fetch(url).then(r => r.json()).then(d => {
      const st = url.split('/')[1];
      d.features.forEach(f => {
        f.properties._state = st;
        f.properties._fid = fid++;
        const ring = f.geometry.coordinates[0];
        const n = ring.length;
        let slat = 0, slon = 0, minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
        for (let i = 0; i < n; i++) {
          slon += ring[i][0]; slat += ring[i][1];
          if (ring[i][0] < minLon) minLon = ring[i][0];
          if (ring[i][0] > maxLon) maxLon = ring[i][0];
          if (ring[i][1] < minLat) minLat = ring[i][1];
          if (ring[i][1] > maxLat) maxLat = ring[i][1];
        }
        f.properties._lon = slon / n;
        f.properties._lat = slat / n;
        f.properties._bboxW = minLon; f.properties._bboxE = maxLon;
        f.properties._bboxS = minLat; f.properties._bboxN = maxLat;
      });
      return d;
    })
  )).then(datasets => {
    const combined = { type: 'FeatureCollection', features: datasets.flatMap(d => d.features) };
    _gridCache = combined;
    _gridCachePromise = null;
    return combined;
  });
  return _gridCachePromise;
}

function propsToInd(p, nat = false) {
  const s = nat ? '_nat' : '';
  return {
    transmission:  p[`tx_score${s}`]            || 0,
    water:         p[`water_score${s}`]          || 0,
    community:     p[`ej_score${s}`]             || 0,
    seismic:       p[`seismic_score${s}`]        || 0,
    flood:         p[`flood_score${s}`]          || 0,
    contamination: p[`contamination_score${s}`]  || 0,
    waterway:      p[`waterway_score${s}`]       || 0,
    geothermal:    p[`geothermal_score${s}`]     || 0,
    flatness:      p[`flatness_score${s}`]       || 0,
    aquifer:       p[`aquifer_score${s}`]        || 0,
    soil:          p[`soil_score${s}`]           || 0,
    slope:         p[`slope_score${s}`]          || 0,
    pop_exposure:  p[`pop_exposure_score${s}`]   || 0,
    soil_profile:  p[`soil_profile_score${s}`]   || 0,
    ksat:          p[`ksat_score${s}`]           || 0,
    substation:    p[`substation_score${s}`]     || 0,
    superfund:     p[`superfund_score${s}`]      || 0,
    rcra:          p[`rcra_score${s}`]           || 0,
    air_quality:   p[`air_quality_score${s}`]    || 0,
    fiber:         p[`fiber_score${s}`]          || 0,
    water_stress:  p[`water_stress_score${s}`]   || 0,
    grid_capacity: p[`grid_capacity_score${s}`]  || 0,
  };
}


function normalizeWeights(w, k, val) {
  const M = window.MERA;
  const keys = M.INDICATORS.map(m => m.k);
  val = Math.max(0, Math.min(100, val));
  const others = keys.filter(x => x !== k);
  const sumO = others.reduce((s, x) => s + w[x], 0);
  const nw = { ...w, [k]: val };
  const rem = 100 - val;
  if (sumO <= 0.0001) others.forEach(x => { nw[x] = rem / others.length; });
  else others.forEach(x => { nw[x] = w[x] * rem / sumO; });
  return nw;
}

/* ── Leaflet multi-state suitability map ── */
/* ── steward gate helpers ── */
function _ptInRing(lon, lat, ring) {
  var inside = false, n = ring.length, j = n - 1;
  for (var i = 0; i < n; i++) {
    var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
    j = i;
  }
  return inside;
}
function _ptInGeom(lon, lat, geom) {
  if (!geom) return false;
  if (geom.type === 'Polygon') return _ptInRing(lon, lat, geom.coordinates[0]);
  if (geom.type === 'MultiPolygon') return geom.coordinates.some(function(poly) { return _ptInRing(lon, lat, poly[0]); });
  return false;
}
function _inZone(p, z) {
  if (z.zone_type === 'state') return p._state === z.state_code;
  if (z.zone_type === 'bbox' && z.bbox) {
    return p._lon >= z.bbox.w && p._lon <= z.bbox.e && p._lat >= z.bbox.s && p._lat <= z.bbox.n;
  }
  if (z.zone_type === 'zcta' && z.polygon_bbox) {
    var b = z.polygon_bbox;
    return p._bboxE > b.w && p._bboxW < b.e && p._bboxN > b.s && p._bboxS < b.n;
  }
  return false;
}

function _checkStewardGateLocal(p) {
  var zones = window.ACTIVE_ZONES || [];
  var M = window.MERA;
  if (!M) return [];
  var gates = [];
  for (var i = 0; i < zones.length; i++) {
    var z = zones[i];
    var inZone = false;
    if (z.zone_type === 'state') inZone = (p._state === z.state_code);
    else if (z.zone_type === 'bbox' && z.bbox) {
      var lat = p._lat, lon = p._lon;
      inZone = lat != null && lon != null && lon >= z.bbox.w && lon <= z.bbox.e && lat >= z.bbox.s && lat <= z.bbox.n;
    }
    if (!inZone) continue;
    var score = M.composite(propsToInd(p, true), z.weights);
    if (score < z.min_score) gates.push({ zone: z, score: score });
  }
  return gates;
}

function WAMap({ weights, selectedState = null, selectedCells = null, onCellToggle = null, stateData = null, interactive = true, markers = true, pins = null, onPinClick = null, dimmed = false, highlight = null, onStewardLockIn = null, style }) {
  const M = window.MERA;
  const { ramp } = React.useContext(MeraCtx);
  const containerRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const gridLayerRef = React.useRef(null);
  const clusterLayerRef = React.useRef(null);
  const pinLayerRef = React.useRef(null);
  const tileLayerRef = React.useRef(null);
  const weightsRef = React.useRef(weights);
  const rampRef = React.useRef(ramp);
  const [hover, setHover] = React.useState(null);
  const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 });
  const [stewardGates, setStewardGates] = React.useState([]);
  const hoverRef = React.useRef(null);

  React.useEffect(() => {
    if (!hover) { setStewardGates([]); return; }
    var local = _checkStewardGateLocal(hover);
    setStewardGates(local);
    var zones = window.ACTIVE_ZONES || [];
    var hasServerZone = zones.some(function(z) { return z.zone_type === 'county' || z.zone_type === 'zcta'; });
    if (!hasServerZone || !hover._state) return;
    var lat = hover._lat, lon = hover._lon;
    if (lat == null || lon == null) return;
    var token = {};
    hoverRef.current = token;
    fetch('/api/gate_check?lat=' + lat + '&lon=' + lon + '&state=' + hover._state)
      .then(function(r) { return r.json(); })
      .then(function(serverGates) {
        if (hoverRef.current !== token) return;
        setStewardGates(function(prev) {
          var combined = prev.slice();
          (serverGates || []).forEach(function(sg) {
            if (!combined.some(function(g) { return g.zone.zone_id === sg.zone_id; })) {
              combined.push({ zone: sg, score: null });
            }
          });
          return combined;
        });
      })
      .catch(function() {});
  }, [hover]);

  const selectedStateRef = React.useRef(selectedState);
  const selectedCellsRef = React.useRef(selectedCells);
  const onCellToggleRef = React.useRef(onCellToggle);
  selectedCellsRef.current = selectedCells;
  onCellToggleRef.current = onCellToggle;
  weightsRef.current = weights;
  rampRef.current = ramp;
  selectedStateRef.current = selectedState;

  function cellStyle(p, w, r) {
    const sel = selectedStateRef.current;
    const nat = !sel;
    if (sel && p._state !== sel) return { fillOpacity: 0, color: 'transparent', weight: 0, interactive: false };
    const isSelected = selectedCellsRef.current && selectedCellsRef.current.has(p._fid);
    if (p.protected_score === 0) return { fillColor: '#0d2b1a', fillOpacity: 0.88, color: isSelected ? '#fff' : 'transparent', weight: isSelected ? 2 : 0 };
    const fill = M.rampColor(M.composite(propsToInd(p, nat), w), r);
    const zones = window.ACTIVE_ZONES || [];
    const stewarded = p._lat != null && zones.some(function(z) { return _inZone(p, z); });
    if (isSelected) return { fillColor: fill, fillOpacity: 0.95, color: '#ffffff', weight: 2.5 };
    if (stewarded) return { fillColor: fill, fillOpacity: 0.72, color: '#b45f1d', weight: 2 };
    return { fillColor: fill, fillOpacity: 0.72, color: 'transparent', weight: 0 };
  }

  function applyColors(w, r) {
    if (!gridLayerRef.current) return;
    gridLayerRef.current.eachLayer(lyr => lyr.setStyle(cellStyle(lyr.feature.properties, w, r)));
  }

  function applyMarkers() {
    if (!clusterLayerRef.current) return;
    clusterLayerRef.current.clearLayers();
    if (!markers) return;
    M.CLUSTERS.forEach(cl => {
      const fill = cl.status === 'existing' ? '#e0e0f0' : 'none';
      const stroke = cl.status === 'existing' ? '#e0e0f0' : '#888';
      const icon = L.divIcon({
        className: '',
        html: `<svg width="16" height="16" viewBox="0 0 16 16" style="display:block"><rect x="3.5" y="3.5" width="9" height="9" transform="rotate(45 8 8)" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/></svg>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      L.marker([cl.lat, cl.lon], { icon, interactive: false }).addTo(clusterLayerRef.current);
    });
  }

  function applyPins(w, r) {
    if (!pinLayerRef.current) return;
    pinLayerRef.current.clearLayers();
    if (!pins) return;
    pins.forEach(site => {
      const m = L.circleMarker([site.lat, site.lon], {
        radius: 9, color: '#fff', weight: 2,
        fillColor: M.rampColor(site.composite, r), fillOpacity: 0.9,
      });
      if (onPinClick) m.on('click', () => onPinClick(site));
      m.addTo(pinLayerRef.current);
    });
  }

  // init Leaflet once
  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [38.0, -112.0],
      zoom: 5,
      zoomControl: interactive,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      boxZoom: false,
      keyboard: false,
      attributionControl: false,
      touchZoom: interactive,
    });

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const tileUrl = isDark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    tileLayerRef.current = L.tileLayer(tileUrl, { maxZoom: 14, subdomains: 'abcd' }).addTo(map);

    clusterLayerRef.current = L.layerGroup().addTo(map);
    pinLayerRef.current     = L.layerGroup().addTo(map);
    mapRef.current = map;

    let cancelled = false;
    const load = loadGridCache();

    load.then(data => {
      if (cancelled) return;
      const layer = L.geoJSON(data, {
        style: feat => cellStyle(feat.properties, weightsRef.current, rampRef.current),
        onEachFeature: interactive ? (feat, lyr) => {
          lyr.on('mouseover', () => {
            const ctr = lyr.getBounds().getCenter();
            setHover(Object.assign({}, feat.properties, { _lat: ctr.lat, _lon: ctr.lng }));
          });
          lyr.on('mouseout',  () => setHover(null));
          lyr.on('click', () => {
            if (onCellToggleRef.current) onCellToggleRef.current(feat.properties._fid, feat.properties);
          });
        } : undefined,
      }).addTo(map);
      gridLayerRef.current = layer;
      applyColors(weightsRef.current, rampRef.current);
      applyMarkers();
    });

    if (interactive) {
      const el = containerRef.current;
      const track = e => {
        const rect = el.getBoundingClientRect();
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      };
      el.addEventListener('mousemove', track);
      return () => {
        cancelled = true;
        el.removeEventListener('mousemove', track);
        map.remove();
        mapRef.current = null;
        gridLayerRef.current = null;
      };
    }

    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
      gridLayerRef.current = null;
    };
  }, []);

  React.useEffect(() => { applyColors(weights, ramp); }, [weights, ramp]);
  React.useEffect(() => { window._recolorMap = function() { applyColors(weightsRef.current, rampRef.current); }; return function() { window._recolorMap = null; }; }, []);
  React.useEffect(() => { applyColors(weightsRef.current, rampRef.current); }, [selectedCells]);
  React.useEffect(() => { applyPins(weights, ramp);   }, [pins, ramp]);
  React.useEffect(() => { applyMarkers();              }, [markers]);

  React.useEffect(() => {
    const obs = new MutationObserver(() => {
      if (!tileLayerRef.current) return;
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const url = isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
      tileLayerRef.current.setUrl(url);
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  React.useEffect(() => {
    applyColors(weightsRef.current, rampRef.current);
    if (!mapRef.current) return;
    if (!selectedState) {
      mapRef.current.setView([38.0, -97.0], 4);
    } else if (_gridCache) {
      const feats = _gridCache.features.filter(f => f.properties._state === selectedState);
      if (feats.length > 0) {
        const bounds = L.geoJSON({ type: 'FeatureCollection', features: feats }).getBounds();
        mapRef.current.fitBounds(bounds, { padding: [24, 24] });
      }
    }
  }, [selectedState]);

  const tooltip = hover && interactive && (() => {
    const p = hover;
    const isGated = p.protected_score === 0;
    const ind = propsToInd(p);
    const score = M.composite(ind, weights);
    const cw = containerRef.current ? containerRef.current.clientWidth  : 800;
    const ch = containerRef.current ? containerRef.current.clientHeight : 480;
    const flipX = mousePos.x > cw - 260;
    const flipY = mousePos.y > ch - 270;
    return (
      <div style={{ position: 'absolute', left: flipX ? mousePos.x - 252 : mousePos.x + 14, top: flipY ? mousePos.y - 248 : mousePos.y + 12, width: 238, background: 'var(--mist)', border: '1px solid var(--line)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.55)', padding: '11px 13px', zIndex: 40, pointerEvents: 'none' }}>
        <div style={{ marginBottom: 4 }}>
          <span className="microcopy">{p.cell_id || ''}</span>
        </div>
        {isGated ? (
          <div>
            <div className="score-serif" style={{ fontSize: 26, color: 'var(--slate)' }}>gated</div>
            <div style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 4 }}>
              Hard gate: protected or sovereign land exceeds 25%. Gate applies regardless of weights.
            </div>
          </div>
        ) : (
          <div>
            <div className="score-serif" style={{ fontSize: 30, lineHeight: 1.1, color: M.rampColor(score, ramp) }}>{score.toFixed(3)}</div>
            <div className="microcopy" style={{ marginBottom: 6 }}>composite suitability</div>
            {stewardGates.length > 0 && stewardGates.map(function(g, i) {
              return (
                <div key={i} style={{ background: 'rgba(180,95,29,0.13)', border: '1px solid rgba(180,95,29,0.35)', borderRadius: 6, padding: '5px 7px', marginBottom: 6 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: '#b45f1d', marginBottom: 2 }}>Steward gate: {g.zone.zone_name || g.zone.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--slate)', lineHeight: 1.5 }}>
                    {g.zone.agency_key} requires min. {g.zone.min_score.toFixed(2)} under {g.zone.template_name || 'steward'} weights.
                    {g.score != null ? (' This cell scores ' + g.score.toFixed(3) + '.') : ''}
                  </div>
                </div>
              );
            })}
            <div style={{ display: 'grid', gap: 3 }}>
              {M.INDICATORS.map(m => <BarRow key={m.k} label={m.label.replace(' proximity', '').replace(' availability', '').replace(' opportunity', '').replace(' sensitivity', '').replace(' distance', '')} value={ind[m.k]} width={92} />)}
            </div>
          </div>
        )}
      </div>
    );
  })();

  return (
    <div style={{ position: 'relative', opacity: dimmed ? 0.85 : 1, ...style }}>
      <div ref={containerRef} style={{ width: '100%', height: 480, isolation: 'isolate' }} />
      {tooltip}
    </div>
  );
}

/* ── legend ── */
function MapLegend() {
  const M = window.MERA;
  const { ramp } = React.useContext(MeraCtx);
  const grad = `linear-gradient(to right, ${M.RAMPS[ramp].join(',')})`;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center', fontSize: 12, color: 'var(--slate)' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
        <span className="score-serif">0.0</span>
        <span style={{ width: 110, height: 9, borderRadius: 5, background: grad, display: 'inline-block' }}></span>
        <span className="score-serif">1.0</span>
        <span>suitability</span>
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 13, height: 13, borderRadius: 3, background: '#0d2b1a', display: 'inline-block', border: '1px solid var(--line)' }}></span>
        protected land
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 13, height: 13, borderRadius: 3, background: 'transparent', display: 'inline-block', border: '2px solid #b45f1d' }}></span>
        steward review zone
      </span>
    </div>
  );
}

/* ── weight slider panel ── */
function WeightPanel({ weights, setWeights, dock = false }) {
  const M = window.MERA;
  const [collapsed, setCollapsed] = React.useState(false);
  const [shareUrl, setShareUrl] = React.useState(null);
  const isDefault = M.INDICATORS.every(m => Math.abs(weights[m.k] - m.def) < 0.5);
  const totalW = M.INDICATORS.reduce((s, m) => s + (weights[m.k] || 0), 0) || 1;

  function share() {
    const q = M.INDICATORS.map(m => Math.round(weights[m.k])).join(',');
    const url = location.origin + location.pathname + '#/explorer?w=' + q;
    setShareUrl(url);
    try { navigator.clipboard.writeText(url); } catch (e) { /* */ }
  }

  return (
    <div className={dock ? 'weight-dock' : ''} style={{ background: 'var(--mist)', border: '1px solid var(--line)', borderRadius: 12, width: dock ? undefined : 318, flexShrink: 0, overflow: 'hidden' }}>
      <button onClick={() => setCollapsed(!collapsed)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--sand)', border: 'none', borderBottom: collapsed ? 'none' : '1px solid var(--line-soft)', padding: '11px 15px', fontSize: 13.5, fontWeight: 700, color: 'var(--evergreen)' }}>
        <span style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}><Icon name="plumb" color="var(--evergreen)" /> Weight the indicators</span>
        <span style={{ color: 'var(--slate)', fontWeight: 400 }}>{collapsed ? '▴' : '▾'}</span>
      </button>
      {!collapsed && (
        <div style={{ padding: '12px 15px 14px' }}>
          <p className="microcopy" style={{ margin: '0 0 8px' }}>15 indicators, equal weight by default. Percentages show each indicator's share of the total. The map recolors as you drag.</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 11 }}>
            {[['Default', null],
              ['Builder lens', { transmission: 50, water: 20, community: 10, seismic: 5, flood: 5, contamination: 5, flatness: 5 }],
              ['Steward lens', { water: 40, community: 25, waterway: 15, contamination: 10, transmission: 10 }],
              ['Net benefit',  { geothermal: 25, water: 25, transmission: 20, community: 15, flatness: 15 }]].map(([name, o]) => (
              <button key={name} className="btn btn-quiet btn-xs" onClick={() => {
                if (!o) { setWeights({ ...M.DEFAULT_WEIGHTS }); return; }
                const w = {}; M.INDICATORS.forEach(m => { w[m.k] = o[m.k] || 0; });
                setWeights(w);
              }}>{name}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 9 }}>
            {M.INDICATORS.map(m => (
              <div key={m.k}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 2 }}>
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: 'var(--ink)', fontWeight: 600 }}><Icon name={m.icon} color="var(--slate)" size={13} /> {m.label}</span>
                  <span className="score-serif" style={{ color: weights[m.k] > 0.5 ? 'var(--basalt)' : 'var(--slate)', fontWeight: 600 }}>{Math.round(weights[m.k] / totalW * 100)}%</span>
                </div>
                <input className="mslider" type="range" min="0" max="100" step="1" value={Math.round(weights[m.k])} aria-label={m.label}
                  onChange={e => setWeights(prev => ({ ...prev, [m.k]: +e.target.value }))} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 13, background: 'var(--sand)', borderRadius: 8, padding: '9px 11px', fontSize: 12.5, color: 'var(--ink)' }}>
            <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
              <span style={{ marginTop: 1 }}><Icon name="lock" color="var(--slate)" /></span>
              <div>
                <b style={{ fontWeight: 700 }}>Hard gates are not sliders.</b><br />
                Protected land and flood zone gates exclude cells regardless of weights.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <button className="btn btn-quiet btn-xs" disabled={isDefault} style={{ opacity: isDefault ? 0.45 : 1 }} onClick={() => { setWeights({ ...M.DEFAULT_WEIGHTS }); setShareUrl(null); }}>Reset to defaults</button>
            <button className="btn btn-ghost btn-xs" onClick={share}>Share these weights</button>
          </div>
          {shareUrl && (
            <div style={{ marginTop: 8 }}>
              <input readOnly value={shareUrl} onFocus={e => e.target.select()} style={{ width: '100%', fontSize: 11.5, padding: '5px 8px', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--slate)', fontFamily: 'monospace', background: 'var(--sand)' }} />
              <span className="microcopy">Copied to clipboard — anyone opening this link sees your weights.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── mini terrain thumbnail for site cards ── */
function SiteThumb({ site, w = 116, h = 80 }) {
  const M = window.MERA;
  const n = 8, m = 6, cw = w / n, ch = h / m;
  const tiles = [];
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
    const v = M.fbm(site.lon * 3 + i * 0.55, site.lat * 3 + j * 0.55);
    const g = Math.round(214 - v * 52);
    tiles.push(<rect key={i + '-' + j} x={i * cw} y={j * ch} width={cw + 0.5} height={ch + 0.5} fill={`rgb(${g - 8},${g},${g - 18})`} />);
  }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ borderRadius: 7, display: 'block', flexShrink: 0 }} aria-hidden="true">
      {tiles}
      <polygon points={`${w * 0.28},${h * 0.3} ${w * 0.72},${h * 0.22} ${w * 0.8},${h * 0.68} ${w * 0.38},${h * 0.78}`} fill="rgba(212,112,31,0.14)" stroke="var(--basalt)" strokeWidth="1.6" strokeDasharray="4 2.5" />
      <circle cx={w * 0.54} cy={h * 0.5} r="3.2" fill="var(--basalt)" stroke="#0f0f1a" strokeWidth="1.2" />
    </svg>
  );
}

/* ── national / state selector ── */
function StateSelector({ selectedState, onChange, style }) {
  const states = Object.keys(STATE_NAMES).sort();
  return (
    <select
      value={selectedState || ''}
      onChange={e => onChange(e.target.value || null)}
      style={{ background: 'var(--mist)', border: '1px solid var(--line)', borderRadius: 7, color: 'var(--ink)', fontSize: 13, padding: '6px 10px', cursor: 'pointer', ...style }}
    >
      <option value=''>National — all states</option>
      {states.map(st => (
        <option key={st} value={st}>{STATE_NAMES[st]}</option>
      ))}
    </select>
  );
}

function getStateFeatures(st) {
  if (!_gridCache) return [];
  return _gridCache.features.filter(f => f.properties._state === st);
}

function getFeaturesById(fids) {
  if (!_gridCache) return [];
  const s = fids instanceof Set ? fids : new Set(fids);
  return _gridCache.features.filter(f => s.has(f.properties._fid));
}

var _centroids = null;
function findNearestCell(lat, lon) {
  if (!_gridCache) return null;
  if (!_centroids) {
    _centroids = _gridCache.features.map(function(f) {
      var c = f.geometry.coordinates[0];
      var cLat = c.reduce(function(s,p){return s+p[1];},0)/c.length;
      var cLon = c.reduce(function(s,p){return s+p[0];},0)/c.length;
      return { lat: cLat, lon: cLon, fid: f.properties._fid };
    });
  }
  var best = null, bestD = Infinity;
  for (var i = 0; i < _centroids.length; i++) {
    var ct = _centroids[i];
    var d = (lat - ct.lat)*(lat - ct.lat) + (lon - ct.lon)*(lon - ct.lon);
    if (d < bestD) { bestD = d; best = ct; }
  }
  if (!best) return null;
  var feat = _gridCache.features.find(function(f) { return f.properties._fid === best.fid; });
  return { feature: feat, distDeg: Math.sqrt(bestD) };
}

function computeCellRank(composite, stateCode) {
  if (!_gridCache) return null;
  const M = window.MERA;
  const stateFeats = _gridCache.features.filter(f => f.properties._state === stateCode);
  if (!stateFeats.length) return null;
  const scores = stateFeats.map(f => M.composite(propsToInd(f.properties, false), M.DEFAULT_WEIGHTS)).sort((a, b) => b - a);
  const rank = scores.findIndex(s => s <= composite) + 1;
  return { rank: rank > 0 ? rank : scores.length, total: scores.length };
}

Object.assign(window, { WAMap, MapLegend, WeightPanel, SiteThumb, StateSelector, normalizeWeights, CELL_PX, getStateFeatures, getFeaturesById, computeCellRank, findNearestCell, STATE_NAMES, propsToInd, loadGridCache });
