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
  'data/WA/zcta/grid_scores.geojson',
  'data/OR/zcta/grid_scores.geojson',
  'data/TX/zcta/grid_scores.geojson',
  'data/CA/zcta/grid_scores.geojson',
  'data/NV/zcta/grid_scores.geojson',
  'data/UT/zcta/grid_scores.geojson',
  'data/ID/zcta/grid_scores.geojson',
  'data/MT/zcta/grid_scores.geojson',
  'data/AZ/zcta/grid_scores.geojson',
  'data/CO/zcta/grid_scores.geojson',
  'data/WY/zcta/grid_scores.geojson',
  'data/NM/zcta/grid_scores.geojson',
  'data/ND/zcta/grid_scores.geojson',
  'data/SD/zcta/grid_scores.geojson',
  'data/NE/zcta/grid_scores.geojson',
  'data/KS/zcta/grid_scores.geojson',
  'data/OK/zcta/grid_scores.geojson',
  'data/MN/zcta/grid_scores.geojson',
  'data/IA/zcta/grid_scores.geojson',
  'data/MO/zcta/grid_scores.geojson',
  'data/AR/zcta/grid_scores.geojson',
  'data/LA/zcta/grid_scores.geojson',
  'data/MI/zcta/grid_scores.geojson',
  'data/WI/zcta/grid_scores.geojson',
  'data/IL/zcta/grid_scores.geojson',
  'data/IN/zcta/grid_scores.geojson',
  'data/KY/zcta/grid_scores.geojson',
  'data/TN/zcta/grid_scores.geojson',
  'data/MS/zcta/grid_scores.geojson',
  'data/GA/zcta/grid_scores.geojson',
  'data/OH/zcta/grid_scores.geojson',
  'data/AL/zcta/grid_scores.geojson',
  'data/FL/zcta/grid_scores.geojson',
  'data/SC/zcta/grid_scores.geojson',
  'data/NC/zcta/grid_scores.geojson',
  'data/VA/zcta/grid_scores.geojson',
  'data/WV/zcta/grid_scores.geojson',
  'data/PA/zcta/grid_scores.geojson',
  'data/NY/zcta/grid_scores.geojson',
  'data/NJ/zcta/grid_scores.geojson',
  'data/CT/zcta/grid_scores.geojson',
  'data/RI/zcta/grid_scores.geojson',
  'data/MA/zcta/grid_scores.geojson',
  'data/VT/zcta/grid_scores.geojson',
  'data/NH/zcta/grid_scores.geojson',
  'data/ME/zcta/grid_scores.geojson',
  'data/DE/zcta/grid_scores.geojson',
  'data/MD/zcta/grid_scores.geojson',
];
let _gridCache = null;
let _gridCachePromise = null;
let _txCache = null;
let _txCachePromise = null;
let _subCache = null;

function _geomStats(geom) {
  const rings = geom.type === 'MultiPolygon'
    ? geom.coordinates.flatMap(poly => poly[0])
    : geom.coordinates[0];
  let slat = 0, slon = 0, minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  const n = rings.length;
  for (let i = 0; i < n; i++) {
    slon += rings[i][0]; slat += rings[i][1];
    if (rings[i][0] < minLon) minLon = rings[i][0];
    if (rings[i][0] > maxLon) maxLon = rings[i][0];
    if (rings[i][1] < minLat) minLat = rings[i][1];
    if (rings[i][1] > maxLat) maxLat = rings[i][1];
  }
  return { lat: slat/n, lon: slon/n, bboxW: minLon, bboxE: maxLon, bboxS: minLat, bboxN: maxLat };
}

function loadTxCache() {
  if (_txCache) return Promise.resolve(_txCache);
  if (_txCachePromise) return _txCachePromise;
  _txCachePromise = fetch('data/shared/transmission_national.geojson')
    .then(r => r.json())
    .then(gj => { _txCache = gj; _txCachePromise = null; return gj; });
  return _txCachePromise;
}

function loadSubCache() {
  if (_subCache) return Promise.resolve(_subCache);
  return fetch('data/shared/substations.csv')
    .then(r => r.text())
    .then(text => {
      _subCache = text;
      return text;
    });
}

function loadGridCache() {
  if (_gridCache) return Promise.resolve(_gridCache);
  if (_gridCachePromise) return _gridCachePromise;
  let fid = 0;
  _gridCache = { type: 'FeatureCollection', features: [] };
  _gridCachePromise = Promise.all(GRID_URLS.map(url =>
    fetch(url).then(r => r.json()).then(d => {
      const st = url.split('/')[1];
      d.features = d.features.filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'));
      d.features.forEach(f => {
        const gs = _geomStats(f.geometry);
        f.properties._state = st;
        f.properties._fid = fid++;
        f.properties._lat = gs.lat;
        f.properties._lon = gs.lon;
        f.properties._bboxW = gs.bboxW; f.properties._bboxE = gs.bboxE;
        f.properties._bboxS = gs.bboxS; f.properties._bboxN = gs.bboxN;
      });
      _gridCache.features.push(...d.features);
      if (window._onStateZctaLoaded) window._onStateZctaLoaded(d);
      return d;
    }).catch(() => null)
  )).then(() => {
    _gridCachePromise = null;
    return _gridCache;
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

function WAMap({ weights, selectedState = null, selectedCells = null, onCellToggle = null, stateData = null, interactive = true, markers = true, pins = null, onPinClick = null, dimmed = false, highlight = null, onStewardLockIn = null, showGrid = false, zipTarget = null, minScore = 0, style }) {
  const M = window.MERA;
  const { ramp } = React.useContext(MeraCtx);
  const containerRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const gridLayerRef = React.useRef(null);
  const clusterLayerRef = React.useRef(null);
  const pinLayerRef = React.useRef(null);
  const tileLayerRef = React.useRef(null);
  const substationLayerRef = React.useRef(null);
  const weightsRef = React.useRef(weights);
  const rampRef = React.useRef(ramp);
  const minScoreRef = React.useRef(minScore);
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
  const highlightedZipRef = React.useRef(null);
  selectedCellsRef.current = selectedCells;
  onCellToggleRef.current = onCellToggle;
  weightsRef.current = weights;
  rampRef.current = ramp;
  minScoreRef.current = minScore;
  selectedStateRef.current = selectedState;

  function cellStyle(p, w, r) {
    const sel = selectedStateRef.current;
    const nat = !sel;
    if (sel && p._state && p._state !== sel) return { fillOpacity: 0, color: 'transparent', weight: 0, interactive: false };
    const isSelected = selectedCellsRef.current && selectedCellsRef.current.has(p._fid);
    if (p.protected_score === 0) return { fillColor: '#0d2b1a', fillOpacity: 0.72, color: isSelected ? '#fff' : 'transparent', weight: isSelected ? 2 : 0 };
    const ind = propsToInd(p, nat);
    const score = M.composite(ind, w);
    if (!isSelected && score < minScoreRef.current) return { fillOpacity: 0, color: 'transparent', weight: 0, interactive: false };
    const fill = M.rampColor(score, r);
    const zones = window.ACTIVE_ZONES || [];
    const stewarded = p._lat != null && zones.some(function(z) { return _inZone(p, z); });
    const isHighlighted = highlightedZipRef.current && p.zcta === highlightedZipRef.current;
    if (isSelected)    return { fillColor: fill, fillOpacity: 0.88, color: '#ffffff', weight: 2.5 };
    if (isHighlighted) return { fillColor: fill, fillOpacity: 0.88, color: '#ffffff', weight: 2.5, dashArray: '6 3' };
    if (stewarded)     return { fillColor: fill, fillOpacity: 0.55, color: '#b45f1d', weight: 2 };
    return { fillColor: fill, fillOpacity: 0.55, color: 'transparent', weight: 0 };
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

    const renderer = L.canvas({ padding: 0.5 });

    const txColor = v => v >= 500000 ? '#f59e0b' : v >= 345000 ? '#fb923c' : v >= 230000 ? '#6ee7b7' : '#94a3b8';

    clusterLayerRef.current = L.layerGroup().addTo(map);
    pinLayerRef.current     = L.layerGroup().addTo(map);
    mapRef.current = map;

    let cancelled = false;

    const layerOpts = () => ({
      renderer,
      style: feat => cellStyle(feat.properties, weightsRef.current, rampRef.current),
      onEachFeature: interactive ? (feat, lyr) => {
        lyr.on('mouseover', () => {
          const ctr = lyr.getBounds().getCenter();
          setHover(Object.assign({}, feat.properties, { _lat: ctr.lat, _lon: ctr.lng }));
        });
        lyr.on('mouseout', () => setHover(null));
        lyr.on('click', () => {
          if (onCellToggleRef.current) onCellToggleRef.current(feat.properties._fid, feat.properties);
        });
      } : undefined,
    });

    window._onStateZctaLoaded = (stateData) => {
      if (cancelled) return;
      if (!gridLayerRef.current) {
        gridLayerRef.current = L.geoJSON(stateData, layerOpts()).addTo(map);
      } else {
        gridLayerRef.current.addData(stateData);
      }
      applyColors(weightsRef.current, rampRef.current);
    };

    loadGridCache().then(() => {
      if (cancelled) return;
      window._onStateZctaLoaded = null;
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
        window._onStateZctaLoaded = null;
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
  React.useEffect(() => { applyColors(weightsRef.current, rampRef.current); }, [minScore]);
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
    const map = mapRef.current;
    if (!map) return;
    if (!showGrid) {
      if (substationLayerRef.current) { map.removeLayer(substationLayerRef.current); substationLayerRef.current = null; }
      return;
    }
    const renderer = L.canvas({ padding: 0.5 });
    const txColor = v => v >= 500000 ? '#f59e0b' : v >= 345000 ? '#fb923c' : v >= 230000 ? '#6ee7b7' : '#94a3b8';
    const group = L.layerGroup().addTo(map);
    substationLayerRef.current = group;
    loadTxCache().then(gj => {
      if (!substationLayerRef.current) return;
      L.geoJSON(gj, {
        renderer,
        style: feat => {
          const c = txColor(feat.properties.v || 0);
          return { color: c, weight: feat.properties.v >= 345000 ? 1.5 : 1, opacity: 0.7, interactive: false };
        },
        interactive: false,
      }).addTo(group);
    });
    loadSubCache().then(text => {
      if (!substationLayerRef.current) return;
      const lines = text.trim().split('\n').slice(1);
      lines.forEach(line => {
        const [lat, lon, kv] = line.split(',').map(Number);
        if (!lat || !lon || kv < 345) return;
        const color = kv >= 500 ? '#f59e0b' : '#fb923c';
        L.circleMarker([lat, lon], {
          renderer, radius: kv >= 345 ? 2.5 : 1.5, color, fillColor: color,
          fillOpacity: 0.9, weight: 0, interactive: false,
        }).addTo(group);
      });
    });
    return () => {
      if (substationLayerRef.current) { map.removeLayer(substationLayerRef.current); substationLayerRef.current = null; }
    };
  }, [showGrid]);

  React.useEffect(() => {
    if (!zipTarget || !mapRef.current || !gridLayerRef.current) return;
    const zip = zipTarget.split('_')[0];
    highlightedZipRef.current = zip;
    let found = null;
    gridLayerRef.current.eachLayer(lyr => {
      if (lyr.feature && lyr.feature.properties.zcta === zip) found = lyr;
    });
    if (!found) return;
    mapRef.current.fitBounds(found.getBounds(), { padding: [40, 40] });
    applyColors(weightsRef.current, rampRef.current);
  }, [zipTarget]);

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
    const ind = propsToInd(p, !selectedStateRef.current);
    const score = M.composite(ind, weights);
    const cw = containerRef.current ? containerRef.current.clientWidth  : 800;
    const ch = containerRef.current ? containerRef.current.clientHeight : 480;
    const flipX = mousePos.x > cw - 180;
    const flipY = mousePos.y > ch - 110;
    return (
      <div style={{ position: 'absolute', left: flipX ? mousePos.x - 172 : mousePos.x + 14, top: flipY ? mousePos.y - 90 : mousePos.y + 12, width: 158, background: 'var(--mist)', border: '1px solid var(--line)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.55)', padding: '10px 12px', zIndex: 40, pointerEvents: 'none' }}>
        {isGated ? (
          <div>
            <div className="score-serif" style={{ fontSize: 24, color: 'var(--slate)' }}>gated</div>
            <div style={{ fontSize: 11.5, color: 'var(--slate)', marginTop: 4 }}>Protected or sovereign land &gt;25%</div>
          </div>
        ) : (
          <div>
            {p.zcta && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 4, letterSpacing: '0.04em' }}>ZIP {p.zcta}</div>}
            <div className="score-serif" style={{ fontSize: 32, lineHeight: 1.1, color: M.rampColor(score, ramp) }}>{score.toFixed(3)}</div>
            <div className="microcopy">composite suitability</div>
            {stewardGates.length > 0 && stewardGates.map(function(g, i) {
              return (
                <div key={i} style={{ background: 'rgba(180,95,29,0.13)', border: '1px solid rgba(180,95,29,0.35)', borderRadius: 6, padding: '5px 7px', marginTop: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#b45f1d' }}>Steward gate: {g.zone.zone_name || g.zone.name}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--slate)', marginTop: 2 }}>
                    Min. {g.zone.min_score.toFixed(2)} — this cell: {g.score != null ? g.score.toFixed(3) : '—'}
                  </div>
                </div>
              );
            })}
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
function WeightPanel({ weights, setWeights, minScore = 0, setMinScore = null, dock = false }) {
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
          <p className="microcopy" style={{ margin: '0 0 8px' }}>22 indicators, equal weight by default. Percentages show each indicator's share of the total. The map recolors as you drag.</p>
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
          {setMinScore && (
            <div style={{ marginTop: 12, borderTop: '1px solid var(--line-soft)', paddingTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 2 }}>
                <span style={{ color: 'var(--ink)', fontWeight: 600 }}>Minimum site score</span>
                <span className="score-serif" style={{ color: 'var(--basalt)', fontWeight: 600 }}>{Math.round(minScore)}</span>
              </div>
              <input className="mslider" type="range" min="0" max="100" step="1" value={Math.round(minScore)} aria-label="Minimum site score"
                onChange={e => setMinScore(+e.target.value)} />
              <span className="microcopy">Cells below this score are hidden from the map.</span>
            </div>
          )}
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

function findNearestCell(lat, lon) {
  if (!_gridCache) return null;
  var best = null, bestD = Infinity;
  for (var i = 0; i < _gridCache.features.length; i++) {
    var p = _gridCache.features[i].properties;
    if (p._lat == null || p._lon == null) continue;
    var d = (lat - p._lat)*(lat - p._lat) + (lon - p._lon)*(lon - p._lon);
    if (d < bestD) { bestD = d; best = _gridCache.features[i]; }
  }
  if (!best) return null;
  return { feature: best, distDeg: Math.sqrt(bestD) };
}

function findZip(zip) {
  if (!_gridCache) return null;
  return _gridCache.features.find(f => f.properties.zcta === zip) || null;
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

Object.assign(window, { WAMap, MapLegend, WeightPanel, SiteThumb, StateSelector, normalizeWeights, CELL_PX, getStateFeatures, getFeaturesById, computeCellRank, findNearestCell, findZip, STATE_NAMES, propsToInd, loadGridCache });
