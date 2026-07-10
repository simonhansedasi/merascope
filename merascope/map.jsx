/* ── Merascope map engine: multi-state choropleth (Leaflet) + weight sliders ──
 * This file owns the actual map rendering: fetching all 48 states' ZCTA
 * GeoJSON, building the module-level `_gridCache` that every other page
 * (Explorer, fact sheets, portfolio screening) reads from, drawing the
 * Leaflet choropleth layer with live-recoloring as weight sliders move,
 * the power-grid canvas overlay (transmission lines + substations), steward
 * "gate" zone overlays, and the WeightPanel slider UI itself.
 * No bundler/module system is in play (Babel-CLI transpiles JSX only,
 * straight to a single dist/bundle.js) — every top-level function/const
 * here is attached to `window` at the bottom of the file so other JSX
 * files (explorer.jsx, builder.jsx, etc) can call it directly.
 * IMPORTANT: no GDAL/rasterio anywhere — geometry math (centroids, bboxes,
 * point-in-polygon) is done by hand in plain JS below. */

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

// One GeoJSON URL per completed state (all 48 contiguous states, AK/HI
// excluded). Each file is data/{STATE}/zcta/grid_scores.geojson — the ZCTA-
// level scored grid produced by the pipeline (scripts/zcta/run_zcta_study.py).
// loadGridCache() below fetches all of these in parallel and merges them
// into one shared FeatureCollection.
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
// Module-level (not React state) caches, shared across every component and
// every re-render for the lifetime of the page load:
//   _gridCache     — merged FeatureCollection of all loaded states' ZCTA
//                     cells; the single source of truth every lookup
//                     function below (getStateFeatures, findZip, etc) reads.
//   _gridCachePromise — in-flight load, so concurrent callers await the
//                     same fetch instead of re-requesting all 48 files.
//   _txCache/_txCachePromise — national transmission-line overlay geometry.
//   _subCache      — substations CSV (power-grid overlay dots).
// Safe as module-level singletons because the GeoJSON data is immutable at
// runtime — nothing ever mutates a loaded feature's properties in place.
let _gridCache = null;
let _gridCachePromise = null;
let _txCache = null;
let _txCachePromise = null;
let _subCache = null;

// Computes a cell's centroid (simple average of ring vertices — good
// enough for ~14km ZCTA cells, not a true polygon centroid) and its
// lat/lon bounding box in one pass over the coordinates. Handles both
// Polygon and MultiPolygon by flattening to the outer ring(s) only (holes
// ignored). Called once per feature at grid-load time; results are cached
// on the feature's properties (_lat/_lon/_bboxN/S/E/W) so later lookups
// (findNearestCell, zone containment checks) never re-walk the geometry.
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

// Lazily fetches the national transmission-line overlay (shared across all
// states, one file) the first time the power-grid toggle is switched on;
// subsequent calls return the cached result instantly.
function loadTxCache() {
  if (_txCache) return Promise.resolve(_txCache);
  if (_txCachePromise) return _txCachePromise;
  _txCachePromise = fetch('data/shared/transmission_national.geojson')
    .then(r => r.json())
    .then(gj => { _txCache = gj; _txCachePromise = null; return gj; });
  return _txCachePromise;
}

// Same lazy-load pattern as loadTxCache, but for the substations CSV
// (parsed manually line-by-line where it's used, not via a CSV library).
function loadSubCache() {
  if (_subCache) return Promise.resolve(_subCache);
  return fetch('data/shared/substations.csv')
    .then(r => r.text())
    .then(text => {
      _subCache = text;
      return text;
    });
}

// Fetches and merges all 48 states' ZCTA GeoJSON files into the shared
// _gridCache. Each state's fetch is fired in parallel (Promise.all), and as
// EACH ONE resolves it immediately calls window._onStateZctaLoaded(d) if a
// map has registered that callback — this is what lets the first state
// render on screen in ~1s while the remaining 47 stream in behind it
// (README.md "Lazy loading"), rather than blocking on all 48 requests.
// Per feature, on first load: assigns a globally-unique incrementing _fid
// (used everywhere as the cell identity — selection sets, saved-cell
// storage, CRM keys), tags _state from the URL path, and precomputes
// centroid/bbox via _geomStats so later spatial lookups are O(1) reads
// instead of re-parsing geometry. A state whose fetch fails (e.g. 404) is
// silently swallowed via .catch(() => null) so one bad file doesn't break
// the other 47 states from loading.
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

// Translates a GeoJSON feature's raw `properties` object (which has columns
// like tx_score, tx_score_nat, water_score, ...) into the flat indicator-key
// object that M.composite() (data.js) expects for computing a weighted
// composite score. `nat` selects which normalization window to read: false
// = state-relative *_score columns, true = cross-state *_score_nat columns
// (see the multi-scale architecture note in README.md). Any missing/null
// column defaults to 0 rather than being omitted, so composite() never sees
// undefined. This is the single translation point between "pipeline column
// names" and "indicator keys used throughout the frontend" — if a new
// indicator is added to the pipeline, it must be added here too or it's
// invisible to every score computation.
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


// NOT used by WeightPanel itself below (those sliders move independently
// and just display each as % of total). Used by misc.jsx's animated demo
// visual to simulate a "sliders always sum to 100" rebalance: given a new
// value `val` for indicator `k`, rescales every OTHER indicator's weight
// proportionally
// so the whole set still sums to 100. If all other weights are currently
// zero (sumO ~ 0), falls back to splitting the remainder evenly across them
// (avoids a divide-by-zero that would otherwise NaN every other slider).
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
/* ── steward gate helpers ──
 * Stewards can define weight templates ("Water-First", "Grid Priority", …)
 * and lock one to a geographic zone (state / bbox / county / ZCTA) with a
 * minimum score. Builders hovering a cell inside a locked zone see an amber
 * warning if the cell scores below that steward's minimum under the
 * steward's OWN weights — even if the builder's own slider weights would
 * make the cell look fine. state/bbox zones are checked entirely client-
 * side (cheap, no round trip) using the functions below; county/zcta zones
 * require server-side point-in-polygon (see the useEffect in WAMap that
 * calls /api/gate_check) because their boundary files aren't loaded on the
 * client. No GDAL — this is a hand-rolled ray-casting point-in-polygon test. */
// Ray-casting point-in-polygon test for a single ring (standard even-odd
// crossing-number algorithm). Iterates each edge of the ring and flips
// `inside` every time a horizontal ray from the point crosses an edge.
function _ptInRing(lon, lat, ring) {
  var inside = false, n = ring.length, j = n - 1;
  for (var i = 0; i < n; i++) {
    var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
    j = i;
  }
  return inside;
}
// Extends _ptInRing to full GeoJSON geometries: for MultiPolygon, checks
// each polygon's outer ring (holes/inner rings ignored — fine for the
// coarse zone shapes this is used for).
function _ptInGeom(lon, lat, geom) {
  if (!geom) return false;
  if (geom.type === 'Polygon') return _ptInRing(lon, lat, geom.coordinates[0]);
  if (geom.type === 'MultiPolygon') return geom.coordinates.some(function(poly) { return _ptInRing(lon, lat, poly[0]); });
  return false;
}
// Client-side-only zone membership test, used for the amber "steward
// review zone" outline drawn on cells in cellStyle() below (not for the
// gate warning itself, which goes through _checkStewardGateLocal). `zcta`
// zones here are approximated by bbox overlap (polygon_bbox), not exact
// polygon containment — cheaper and sufficient for a visual outline.
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

// Checks a hovered cell against every locked zone in window.ACTIVE_ZONES
// (populated once on app mount from GET /api/zones/active) that can be
// resolved purely client-side (state or bbox zone types). For each zone the
// cell falls inside, recomputes that zone's composite score using the
// STEWARD'S weights (not the builder's current slider weights) and flags it
// if it's below the zone's min_score. County/zcta zones are NOT handled
// here — see the useEffect in WAMap that fires the async server gate check.
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

// The core Leaflet map component, used by ExplorerPage (interactive,
// selectable) and reused elsewhere in a read-only/decorative mode (e.g.
// smaller pins-only maps). Despite the name "WAMap" (a holdover from when
// this was Washington-only), it now renders all 48 loaded states, switching
// between "national" (no selectedState — shows *_score_nat colors) and
// "state" (selectedState set — shows *_score colors, other states hidden)
// modes purely via cellStyle() below.
// Owns: the Leaflet map instance + its layers (choropleth grid, cluster
// markers, pins, power-grid overlay), hover/tooltip state, and the steward
// gate check for whatever cell is currently hovered. Weight/selection state
// itself is owned by the caller (ExplorerPage) and passed in as props —
// this component re-colors in response but doesn't own the "what's
// selected" or "what are the weights" state.
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

  // Whenever the hovered cell changes: run the cheap client-side gate check
  // immediately (state/bbox zones), then, only if a county/zcta zone is
  // active, kick off an async /api/gate_check request for the exact
  // point-in-polygon test the client can't do without the boundary file.
  // `hoverRef` is a request-cancellation token, not a DOM ref: each new
  // hover creates a fresh `token` object and stores it in hoverRef.current;
  // when the fetch resolves it checks `hoverRef.current !== token` to
  // bail out if the user has already moved to hover a different cell
  // (prevents a slow, stale response from clobbering the current tooltip).
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
        // Merge server-found gates in alongside the client-found ones,
        // de-duping by zone_id so a zone isn't listed twice.
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

  // Leaflet's `style` and event-handler callbacks (see layerOpts() below)
  // are captured once when a layer is created and never re-created on
  // prop changes — Leaflet itself, not React, owns the layer lifecycle.
  // To let those closures always see the LATEST weights/selection/etc
  // without re-building the entire map on every render, every prop that
  // affects rendering is mirrored into a ref, updated on every render
  // (the plain assignments below, not inside useEffect), and read via
  // `.current` from inside Leaflet callbacks instead of the prop directly.
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

  // Computes the Leaflet path style (fill color, border, opacity) for one
  // cell. This is the single place all the map's visual rules live:
  //  1. If a state filter is active and this cell isn't in it, hide it
  //     entirely (opacity 0, non-interactive) rather than remove the layer
  //     — cheaper than adding/removing from the GeoJSON layer on every
  //     state switch.
  //  2. `nat` (use *_score_nat columns) is true only in national view (no
  //     state selected) — state view always shows state-relative scores.
  //  3. Protected/sovereign-land hard gate (protected_score === 0) always
  //     wins and renders as a dark solid fill regardless of composite score
  //     — this cell is excluded from siting consideration entirely.
  //  4. minScore filter: cells below the slider threshold are hidden
  //     UNLESS they're part of the current selection (so selecting a cell
  //     then raising the threshold doesn't make your own selection vanish).
  //  5. Selected / ZIP-search-highlighted / steward-zone-outlined cells
  //     each get a distinct border treatment, checked in priority order
  //     (selected white border wins over highlighted dashed border wins
  //     over the amber steward-zone outline).
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

  // Re-applies cellStyle() to every already-rendered cell without touching
  // geometry — this is the "recolor" step called whenever weights, ramp,
  // selection, or minScore change, and is what makes the map visibly react
  // live as sliders move (no re-fetch, no re-render of the GeoJSON layer).
  function applyColors(w, r) {
    if (!gridLayerRef.current) return;
    gridLayerRef.current.eachLayer(lyr => lyr.setStyle(cellStyle(lyr.feature.properties, w, r)));
  }

  // Draws the diamond markers for known/proposed clusters (M.CLUSTERS,
  // data.js) as a non-interactive Leaflet layer. Filled diamond = existing
  // campus, outline-only = proposed. Cleared and redrawn from scratch each
  // time (cheap — cluster count is small) rather than diffed.
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

  // Draws caller-supplied site pins (used by pages that pass explicit
  // `pins` coordinates rather than relying on cell selection, e.g. saved-
  // site review flows) as colored circle markers, colored by composite
  // score on the same ramp as the choropleth.
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
  // Creates the Leaflet map instance exactly once per mount (guarded by
  // `mapRef.current` already being set) and tears it down on unmount.
  // `interactive` (false for read-only/decorative embeds) disables zoom,
  // drag, scroll-zoom, and click handling all at once at map-construction
  // time — a non-interactive map is genuinely inert, not just visually.
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

    // CartoDB basemap tiles, swapped between light/dark variants based on
    // the current theme attribute (kept in sync afterward by the
    // MutationObserver effect further below, since the theme can change
    // after the map is already mounted).
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const tileUrl = isDark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    tileLayerRef.current = L.tileLayer(tileUrl, { maxZoom: 14, subdomains: 'abcd' }).addTo(map);

    // Canvas renderer (not SVG) — required at this feature count (tens of
    // thousands of ZCTA polygons across 48 states) for acceptable perf.
    const renderer = L.canvas({ padding: 0.5 });

    const txColor = v => v >= 500000 ? '#f59e0b' : v >= 345000 ? '#fb923c' : v >= 230000 ? '#6ee7b7' : '#94a3b8';

    clusterLayerRef.current = L.layerGroup().addTo(map);
    pinLayerRef.current     = L.layerGroup().addTo(map);
    mapRef.current = map;

    let cancelled = false;

    // Shared Leaflet GeoJSON layer options: style delegates to cellStyle()
    // (reading current weights/ramp via refs, per the note above), and for
    // interactive maps wires up hover (sets `hover` state -> drives the
    // tooltip + gate check) and click (delegates to the onCellToggle prop
    // via its ref) on every feature.
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

    // Progressive-load hook: loadGridCache() (map.jsx module scope) invokes
    // this for EACH state's data as soon as that state's fetch resolves —
    // so the first state appears on the map almost immediately instead of
    // waiting for all 48 fetches. First call creates the Leaflet GeoJSON
    // layer; every subsequent call just streams more features into it via
    // addData() rather than rebuilding the layer.
    window._onStateZctaLoaded = (stateData) => {
      if (cancelled) return;
      if (!gridLayerRef.current) {
        gridLayerRef.current = L.geoJSON(stateData, layerOpts()).addTo(map);
      } else {
        gridLayerRef.current.addData(stateData);
      }
      applyColors(weightsRef.current, rampRef.current);
    };

    // Kicks off (or joins, if already in flight) the full 48-state load.
    // Once ALL states have resolved, clear the progressive callback (so a
    // later remount doesn't call it against a torn-down map) and do a
    // final full recolor + marker draw to make sure nothing was missed.
    loadGridCache().then(() => {
      if (cancelled) return;
      window._onStateZctaLoaded = null;
      applyColors(weightsRef.current, rampRef.current);
      applyMarkers();
    });

    if (interactive) {
      const el = containerRef.current;
      // Tracks raw mouse position (container-relative) purely to position
      // the floating tooltip near the cursor — see the `tooltip` render
      // logic near the bottom of this component.
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

  // These five effects are the "live recolor" wiring: any prop that
  // cellStyle() depends on (weights, ramp/color scheme, selection, the
  // minScore filter) triggers a full recolor pass on change, without
  // touching the Leaflet layer's geometry. window._recolorMap is exposed so
  // OTHER components (outside this one's React tree) can also trigger a
  // recolor — e.g. after steward zones load asynchronously.
  React.useEffect(() => { applyColors(weights, ramp); }, [weights, ramp]);
  React.useEffect(() => { window._recolorMap = function() { applyColors(weightsRef.current, rampRef.current); }; return function() { window._recolorMap = null; }; }, []);
  React.useEffect(() => { applyColors(weightsRef.current, rampRef.current); }, [selectedCells]);
  React.useEffect(() => { applyColors(weightsRef.current, rampRef.current); }, [minScore]);
  React.useEffect(() => { applyPins(weights, ramp);   }, [pins, ramp]);
  React.useEffect(() => { applyMarkers();              }, [markers]);

  // Watches the <html data-theme="..."> attribute (set by the app's theme
  // toggle — see CONTEXT.md "Theme system") and swaps the basemap tile URL
  // to match, since Leaflet tile layers don't react to CSS theme changes on
  // their own (the tiles themselves are different PNGs, not styleable).
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

  // Power-grid overlay (transmission lines + substation dots), toggled by
  // the "Show power grid" button in ExplorerPage. Built as its own
  // layerGroup that's created fresh each time showGrid flips on and fully
  // removed when it flips off, rather than kept around and hidden — the
  // underlying data (34k transmission features) is large enough that it's
  // simpler to not keep an idle copy in memory when not shown. Lines are
  // colored by voltage tier (500kV+/345kV+/230kV+/lower); substation dots
  // are filtered to 345kV+ only.
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
      // Hand-rolled CSV parse (no library): drop the header row, split
      // each line on commas into [lat, lon, kv]. Sub-345kV substations are
      // skipped entirely — the overlay is meant to highlight major
      // interconnection points, not every distribution substation.
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

  // Reacts to the ZIP search box in ExplorerPage (`zipTarget` is set to
  // `zip + '_' + Date.now()` on each search — see handleZipSearch there).
  // Extracts just the ZIP portion, finds the matching Leaflet layer among
  // already-rendered features by scanning gridLayerRef, pans/zooms to it,
  // then recolors so the dashed highlight border (drawn by cellStyle via
  // highlightedZipRef) actually shows up.
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

  // On state selection change: recolor (cellStyle depends on selectedState
  // via the ref) and reframe the viewport — either back out to the full
  // national view (fixed center/zoom) or fit tightly to the selected
  // state's cell bounds. Reads directly from the module-level _gridCache
  // rather than props since by the time a user can select a state, the
  // cache is guaranteed to be populated for it.
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

  // Hover tooltip: shows the composite score (or "gated" if excluded by
  // the protected-land hard gate) plus any steward gate warnings for the
  // hovered cell. Positioned near the cursor via mousePos, but flips to the
  // opposite side (flipX/flipY) when close to the container's right/bottom
  // edge so the tooltip never renders off-screen or clipped.
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
      {/* isolation: 'isolate' is a known-necessary fix (CONTEXT.md gotcha)
          for the tooltip rendering behind Leaflet's internal z-indexed
          panes — without it, Leaflet's own stacking context can win
          against this component's tooltip div even though it's a later
          sibling in the DOM. */}
      <div ref={containerRef} style={{ width: '100%', height: 480, isolation: 'isolate' }} />
      {tooltip}
    </div>
  );
}

/* ── legend ── */
// Static legend strip shown under the map: the color ramp gradient (0-1
// suitability), a protected-land swatch, and a steward-review-zone outline
// swatch — mirrors the visual treatments cellStyle() actually applies.
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
// The collapsible sidebar/dock panel with one slider per indicator (22
// total). Each slider moves INDEPENDENTLY (not auto-rebalanced to sum to
// 100 — see normalizeWeights() above for why that function exists but
// isn't used here); the displayed percentage is just that indicator's
// share of the current total (weights[m.k] / totalW), recomputed on every
// render. `dock` switches to a bottom-docked layout for narrow/mobile
// viewports (see the `isMobile` check in ExplorerPage). Weight state itself
// lives in the parent (ExplorerPage) and is passed down/up via
// weights/setWeights, so dragging a slider here immediately triggers a
// map recolor via the effects in WAMap above.
function WeightPanel({ weights, setWeights, minScore = 0, setMinScore = null, dock = false }) {
  const M = window.MERA;
  const [collapsed, setCollapsed] = React.useState(false);
  const [shareUrl, setShareUrl] = React.useState(null);
  const isDefault = M.INDICATORS.every(m => Math.abs(weights[m.k] - m.def) < 0.5);
  const totalW = M.INDICATORS.reduce((s, m) => s + (weights[m.k] || 0), 0) || 1;

  // Encodes the current weights as a comma-joined list (in INDICATORS
  // order) into a `?w=` query param on a shareable Explorer URL, copies it
  // to the clipboard. ExplorerPage's `initial` useMemo (explorer.jsx)
  // decodes this same format back into a weights object on load — so the
  // two must stay in sync on ordering/format if either changes.
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
          <p className="microcopy" style={{ margin: '0 0 8px' }}>22 indicators. Defaults weight transmission, water, and community burden at 40 / 35 / 25; the other 19 start at zero. Percentages show each indicator's share of the total. The map recolors as you drag.</p>
          {/* One-click named weight presets (distinct from the steward-
              defined "weight templates" in steward-templates.jsx — these
              are hardcoded here, not stored server-side). Any indicator not
              listed in a preset's object defaults to 0 via `o[m.k] || 0`
              below, so presets only need to name the weights they care about. */}
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
// Decorative, non-geographic terrain texture for site cards: an 8x6 grid
// of shaded rectangles whose brightness comes from M.fbm() (fractal Brownian
// motion noise, data.js) seeded by the site's lat/lon so the same site
// always gets the same-looking "terrain," plus a dashed parcel outline and
// a center pin. This is NOT real elevation/imagery data — purely a visual
// motif to make site cards feel distinct from each other at a glance.
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
// Plain <select> dropdown for switching between "National — all states"
// (value '') and a specific state. Options are ordered by
// Object.keys(STATE_NAMES).sort() — that sorts on the 2-letter postal
// code, NOT the full state name, so the dropdown isn't quite in
// alphabetical-by-name order (e.g. Arkansas/AR lands before Arizona/AZ).
// Cosmetic quirk only, not a bug worth fixing here.
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

// ── grid-cache query helpers ──
// These all read the shared module-level _gridCache singleton (built by
// loadGridCache() above) rather than taking data as an argument — that's
// why every one of them bails to an empty/null result if the cache hasn't
// finished loading yet. They're exported on window below so other JSX
// files (explorer.jsx, misc.jsx, etc.) can query the grid without needing
// their own reference to the cache.

// Simple filter: all ZCTA cells belonging to one state. Used throughout
// explorer.jsx's grading engine (e.g. computeStateGrades) and here in
// computeCellRank below.
function getStateFeatures(st) {
  if (!_gridCache) return [];
  return _gridCache.features.filter(f => f.properties._state === st);
}

// Look up cells by their _fid (the globally-unique id assigned at
// grid-load time). Accepts either a Set or any iterable of ids. This is
// how explorer.jsx turns its selectedCells Set (just ids) back into full
// feature objects for TileCard.
function getFeaturesById(fids) {
  if (!_gridCache) return [];
  const s = fids instanceof Set ? fids : new Set(fids);
  return _gridCache.features.filter(f => s.has(f.properties._fid));
}

// Brute-force O(n) nearest-neighbor search over every cached cell's
// centroid, in plain lat/lon degrees (no projection). distDeg is
// straight-line degree distance, not meters — callers convert/threshold
// it themselves. Fine at this dataset's size (tens of thousands of ZCTAs)
// since it only runs on-demand (e.g. portfolio site screening), not per
// frame.
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

// Exact ZCTA-code lookup, used by the ZIP search box (handleZipSearch in
// explorer.jsx calls window.findZip to resolve the typed zip to a cell
// before panning the map to it).
function findZip(zip) {
  if (!_gridCache) return null;
  return _gridCache.features.find(f => f.properties.zcta === zip) || null;
}

// Ranks a single composite score against every other cell in the same
// state, always under M.DEFAULT_WEIGHTS — NOT the user's current slider
// weights — so this answers "how does this score compare under the
// platform's default weighting," independent of whatever the Builder has
// dragged the sliders to. Scores are sorted descending (best first), and
// rank is 1-based (1 = best cell in the state).
function computeCellRank(composite, stateCode) {
  if (!_gridCache) return null;
  const M = window.MERA;
  const stateFeats = _gridCache.features.filter(f => f.properties._state === stateCode);
  if (!stateFeats.length) return null;
  const scores = stateFeats.map(f => M.composite(propsToInd(f.properties, false), M.DEFAULT_WEIGHTS)).sort((a, b) => b - a);
  const rank = scores.findIndex(s => s <= composite) + 1;
  return { rank: rank > 0 ? rank : scores.length, total: scores.length };
}

// No-bundler export: since there's no ES-module import/export between
// these JSX files (each is transpiled independently by Babel and loaded
// as a plain <script>), everything this file wants other files to use
// gets hung off the global `window` object here at the bottom.
Object.assign(window, { WAMap, MapLegend, WeightPanel, SiteThumb, StateSelector, normalizeWeights, getStateFeatures, getFeaturesById, computeCellRank, findNearestCell, findZip, STATE_NAMES, propsToInd, loadGridCache });
