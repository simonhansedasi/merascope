/* ── Merascope data layer: synthetic-but-plausible WA suitability model ── */

/* ── session ID + server-side event log ── */
window.MERA_SESSION = (function() {
  var k = 'mera_session_v1';
  var id = localStorage.getItem(k);
  if (!id) { id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8); localStorage.setItem(k, id); }
  return id;
})();

window.cellLabel = function(p) {
  var state = (window.STATE_NAMES ? window.STATE_NAMES[p._state] : null) || p._state || '';
  var num   = p.cell_id != null ? ' #' + (p.cell_id + 1) : '';
  return state + num;
};

window.serverLog = function(eventType, fid, payload) {
  try {
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: window.MERA_SESSION, fid: fid, event_type: eventType, payload: payload || {} })
    }).catch(function() {});
  } catch(e) {}
};

/* ── builder workspace: saved cells (localStorage) ── */
(function() {
  var KEY = 'mera_saved_v1';
  var GEO_KEY = 'mera_geo_v1';
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch(e) { return []; } }
  function store(cells) { try { localStorage.setItem(KEY, JSON.stringify(cells)); } catch(e) {} }
  function loadGeo() { try { return JSON.parse(localStorage.getItem(GEO_KEY) || '{}'); } catch(e) { return {}; } }
  function storeGeo(g) { try { localStorage.setItem(GEO_KEY, JSON.stringify(g)); } catch(e) {} }

  window.getSavedCells = function() { return load(); };

  window.saveCellToBuilder = function(feat) {
    var fid = feat.properties._fid;
    if (fid == null) return;
    var cells = load();
    if (cells.find(function(c) { return c.fid === fid; })) return;
    var coords = feat.geometry && feat.geometry.coordinates && feat.geometry.coordinates[0];
    var lat = null, lon = null;
    if (coords && coords.length) {
      lat = coords.reduce(function(s,c){return s+c[1];},0) / coords.length;
      lon = coords.reduce(function(s,c){return s+c[0];},0) / coords.length;
    }
    var stateRank = null;
    if (window.computeCellRank && window.propsToInd && window.MERA) {
      var ind = window.propsToInd(feat.properties, false);
      var comp = window.MERA.composite(ind, window.MERA.DEFAULT_WEIGHTS);
      stateRank = window.computeCellRank(comp, feat.properties._state);
    }
    var natComp = null, stateComp = null;
    if (window.propsToInd && window.MERA) {
      natComp   = window.MERA.composite(window.propsToInd(feat.properties, true),  window.MERA.DEFAULT_WEIGHTS);
      stateComp = window.MERA.composite(window.propsToInd(feat.properties, false), window.MERA.DEFAULT_WEIGHTS);
    }
    cells.push({ fid: fid, properties: feat.properties, lat: lat, lon: lon, stateRank: stateRank });
    store(cells);
    var logPayload = { props: feat.properties, lat: lat, lon: lon, state_rank: stateRank, nat_composite: natComp, state_composite: stateComp };
    if (lat != null) {
      window.fetchMunicipality(fid, lat, lon).then(function(geo) {
        if (geo) logPayload.municipality = geo.display;
        window.serverLog('save_cell', fid, logPayload);
      });
    } else {
      window.serverLog('save_cell', fid, logPayload);
    }
  };

  window.removeSavedCell = function(fid) {
    store(load().filter(function(c){return c.fid !== fid;}));
    window.serverLog('remove_cell', fid, {});
  };
  window.isCellSaved = function(fid) { return load().some(function(c){return c.fid === fid;}); };

  /* returns cached municipality or fetches+caches from Nominatim */
  window.fetchMunicipality = function(fid, lat, lon) {
    var geo = loadGeo();
    if (geo[fid]) return Promise.resolve(geo[fid]);
    return fetch(
      'https://nominatim.openstreetmap.org/reverse?lat=' + lat + '&lon=' + lon + '&format=json&zoom=10',
      { headers: { 'User-Agent': 'Merascope/1.0 (datacenter-siting research; contact: research@merascope.io)' } }
    ).then(function(r) { return r.json(); }).then(function(d) {
      var a = d.address || {};
      var county = a.county || a.administrative || null;
      var city = a.city || a.town || a.village || a.hamlet || a.suburb || null;
      var result = { county: county, city: city, state: a.state || null };
      if (city && county) result.display = city + ', ' + county;
      else if (county) result.display = 'Unincorporated ' + county;
      else result.display = a.state || null;
      geo[fid] = result;
      storeGeo(geo);
      return result;
    }).catch(function() { return null; });
  };

  window.getCachedMunicipality = function(fid) {
    return loadGeo()[fid] || null;
  };
})();

/* ── CRM tracker (localStorage) ── */
(function() {
  var KEY = 'mera_crm_v1';
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch(e) { return {}; } }
  function store(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch(e) {} }
  function blank() { return { status: 'researching', contacts: [], events: [], notes: '' }; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  window.getCrm = function(fid) { var d = load(); return d[fid] || blank(); };
  window.getAllCrm = function() { return load(); };

  window.setCrmStatus = function(fid, status) {
    var d = load(); if (!d[fid]) d[fid] = blank(); d[fid].status = status; store(d);
    window.serverLog('status_change', fid, { status: status });
  };
  window.setCrmNotes = function(fid, notes) {
    var d = load(); if (!d[fid]) d[fid] = blank(); d[fid].notes = notes; store(d);
    window.serverLog('note_update', fid, { notes: notes });
  };
  window.addCrmContact = function(fid, contact) {
    var d = load(); if (!d[fid]) d[fid] = blank();
    var c = Object.assign({ id: uid() }, contact);
    d[fid].contacts.push(c); store(d);
    window.serverLog('contact_add', fid, c);
    return d[fid];
  };
  window.removeCrmContact = function(fid, contactId) {
    var d = load(); if (!d[fid]) return;
    d[fid].contacts = d[fid].contacts.filter(function(c) { return c.id !== contactId; }); store(d);
    window.serverLog('contact_remove', fid, { contact_id: contactId });
  };
  window.addCrmEvent = function(fid, ev) {
    var d = load(); if (!d[fid]) d[fid] = blank();
    var e = Object.assign({ id: uid(), date: new Date().toISOString().slice(0, 10) }, ev);
    d[fid].events.unshift(e); store(d);
    window.serverLog('activity_log', fid, e);
    return d[fid];
  };
  window.removeCrmEvent = function(fid, evId) {
    var d = load(); if (!d[fid]) return;
    d[fid].events = d[fid].events.filter(function(e) { return e.id !== evId; }); store(d);
    window.serverLog('activity_remove', fid, { event_id: evId });
  };
})();

(function () {
  'use strict';
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  /* ── color ramps ── */
  var RAMPS = {
    field: ['#C0392B', '#E67E22', '#F1C40F', '#7DBB6C', '#1F8A4C'],
    cb: ['#440154', '#414487', '#2A788E', '#7AD151', '#FDE725']
  };
  function hex2rgb(h) { h = h.slice(1); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function rampColor(t, variant) {
    var stops = RAMPS[variant || 'field'] || RAMPS.field;
    t = clamp(t, 0, 1);
    var seg = t * (stops.length - 1), i = Math.min(Math.floor(seg), stops.length - 2), f = seg - i;
    var a = hex2rgb(stops[i]), b = hex2rgb(stops[i + 1]);
    return 'rgb(' + Math.round(lerp(a[0], b[0], f)) + ',' + Math.round(lerp(a[1], b[1], f)) + ',' + Math.round(lerp(a[2], b[2], f)) + ')';
  }
  function rampText(t, variant) {
    if ((variant || 'field') === 'cb') return (t > 0.55) ? '#2B2B0A' : '#fff';
    return (t > 0.32 && t < 0.80) ? '#3A3214' : '#fff';
  }

  /* ── deterministic value noise ── */
  function n2(x, y) { var s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
  function smoothN(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(n2(xi, yi), n2(xi + 1, yi), u), lerp(n2(xi, yi + 1), n2(xi + 1, yi + 1), u), v);
  }
  function fbm(x, y) { return 0.62 * smoothN(x, y) + 0.27 * smoothN(x * 2.13 + 7, y * 2.13 + 3) + 0.11 * smoothN(x * 4.31 + 13, y * 4.31 + 5); }

  /* ── WA boundary (simplified) ── */
  var WA = [
    [-124.73, 48.39], [-124.55, 47.95], [-124.35, 47.55], [-124.18, 47.15], [-124.10, 46.80],
    [-124.07, 46.40], [-124.05, 46.25], [-123.70, 46.20], [-123.40, 46.22], [-123.12, 46.15],
    [-122.90, 46.10], [-122.78, 45.90], [-122.60, 45.62], [-122.33, 45.56], [-121.90, 45.65],
    [-121.40, 45.69], [-121.08, 45.65], [-120.65, 45.74], [-120.20, 45.76], [-119.85, 45.83],
    [-119.55, 45.92], [-119.25, 45.93], [-118.98, 46.00], [-116.95, 46.00], [-117.03, 49.00],
    [-122.76, 49.00], [-122.80, 48.75], [-123.00, 48.70], [-123.15, 48.55], [-123.30, 48.45],
    [-124.00, 48.35], [-124.73, 48.39]
  ];
  function inWA(lon, lat) {
    var inside = false;
    for (var i = 0, j = WA.length - 1; i < WA.length; j = i++) {
      var xi = WA[i][0], yi = WA[i][1], xj = WA[j][0], yj = WA[j][1];
      if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function dist(lon, lat, LON, LAT) { var dx = (lon - LON) * 0.72, dy = lat - LAT; return Math.sqrt(dx * dx + dy * dy); }
  function minDistTo(pts, lon, lat) { var m = 99; for (var i = 0; i < pts.length; i++) { var d = dist(lon, lat, pts[i][0], pts[i][1]); if (d < m) m = d; } return m; }

  /* ── geography features ── */
  var TX = [ /* transmission corridors [lon,lat,strength] */
    [-118.98, 47.96, 1.0], [-119.85, 47.23, 0.92], [-120.31, 47.42, 0.85], [-119.20, 46.22, 0.9],
    [-122.30, 47.50, 0.95], [-122.40, 47.25, 0.9], [-122.62, 45.70, 0.95], [-117.40, 47.66, 0.85],
    [-122.90, 46.72, 0.92], [-120.82, 45.95, 0.8], [-118.34, 46.07, 0.7], [-119.0, 47.0, 0.8]
  ];
  var RIVER = [ /* Columbia path */
    [-119.0, 48.9], [-119.5, 48.4], [-119.9, 48.1], [-119.6, 47.9], [-120.0, 47.6], [-120.3, 47.4],
    [-120.0, 47.0], [-119.9, 46.7], [-119.3, 46.3], [-118.95, 46.05], [-119.6, 45.93], [-120.5, 45.73],
    [-121.4, 45.7], [-122.3, 45.57], [-122.78, 45.9], [-123.4, 46.2], [-124.0, 46.25]
  ];
  var URB = [
    [-122.33, 47.61, 0.95], [-122.44, 47.25, 0.6], [-122.66, 45.63, 0.55], [-117.43, 47.66, 0.55],
    [-122.20, 48.05, 0.5], [-119.28, 46.21, 0.35], [-120.31, 47.42, 0.3], [-122.90, 46.15, 0.25]
  ];
  var CONTAM = [[-119.45, 46.55], [-122.43, 47.25], [-122.30, 47.58], [-117.36, 47.70]];
  var PROT = [
    { c: [-123.55, 47.85], r: 0.52 }, { c: [-121.75, 46.86], r: 0.27 }, { c: [-121.20, 48.70], r: 0.52 },
    { c: [-121.10, 48.15], r: 0.30 }, { c: [-121.95, 46.15], r: 0.32 }, { c: [-121.45, 46.20], r: 0.24 }
  ];

  function indicatorsAt(lon, lat) {
    var nA = fbm(lon * 2.6, lat * 2.6), nB = fbm(lon * 2.6 + 31, lat * 2.6 + 17), nC = fbm(lon * 4.1 + 53, lat * 4.1 + 7);
    var riverProx = Math.exp(-minDistTo(RIVER, lon, lat) * 3.2);
    /* transmission */
    var tx = 0;
    for (var i = 0; i < TX.length; i++) { var v = TX[i][2] * Math.exp(-dist(lon, lat, TX[i][0], TX[i][1]) * 1.7); if (v > tx) tx = v; }
    var transmission = clamp(0.12 + tx * 0.85 + (nA - 0.5) * 0.14, 0.02, 1);
    /* water */
    var water;
    if (lon < -121.8) water = 0.70 + (nB - 0.5) * 0.34;
    else water = 0.46 - ((lon + 121.8) / 5.0) * 0.52 + riverProx * 0.30 + (nB - 0.5) * 0.22;
    if (lat < 46.9 && lon > -120.2 && lon < -118.0) water -= 0.22; /* lower-basin dryness */
    water = clamp(water, 0.0, 1);
    /* community (1 = low burden) */
    var burden = 0;
    for (i = 0; i < URB.length; i++) burden += URB[i][2] * Math.exp(-dist(lon, lat, URB[i][0], URB[i][1]) * 4.5);
    var community = clamp(0.82 - clamp(burden, 0, 0.8) + (nC - 0.5) * 0.22, 0.05, 1);
    /* seismic (east safer) */
    var e = (lon + 124.85) / 8.0;
    var seismic = clamp(0.16 + e * 0.74 + (nA - 0.5) * 0.12, 0.05, 1);
    /* flood */
    var coast = (lat < 48.5) ? Math.exp(-Math.abs(lon + 124.0) * 2.4) : 0;
    var flood = clamp(0.86 - riverProx * 0.5 - coast * 0.4 + (nB - 0.5) * 0.12, 0.05, 1);
    /* contamination distance */
    var cont = 1;
    for (i = 0; i < CONTAM.length; i++) { var cv = 1 - Math.exp(-dist(lon, lat, CONTAM[i][0], CONTAM[i][1]) * 2.1); if (cv < cont) cont = cv; }
    var contamination = clamp(cont + (nC - 0.5) * 0.06, 0.0, 1);
    /* waterway sensitivity */
    var sound = (lat > 47.0 && lat < 48.6) ? Math.exp(-Math.abs(lon + 122.45) * 3.6) : 0;
    var waterway = clamp(0.88 - riverProx * 0.72 - sound * 0.5 + (nA - 0.5) * 0.1, 0.0, 1);
    /* geothermal (Cascade arc) */
    var arc = Math.exp(-Math.pow((lon + 121.7) / 0.55, 2));
    var geothermal = clamp(arc * 0.72 + nB * 0.2, 0.02, 1);
    /* terrain flatness */
    var f;
    if (lon > -120.6 && lat < 48.3 && lat > 45.9) f = 0.70 + nA * 0.30;            /* Columbia basin */
    else if (lon <= -120.6 && lon > -122.1) f = 0.06 + nA * 0.34;                  /* Cascades */
    else if (lon <= -122.1 && lon > -123.1) f = 0.44 + nA * 0.40;                  /* Puget lowland */
    else if (lon <= -123.1 && lon > -124.05 && lat > 47.1) f = 0.08 + nA * 0.30;   /* Olympics */
    else f = 0.34 + nA * 0.36;                                                     /* SW hills / coast */
    if (lat > 48.3 && lon > -122.2 && lon < -119.8) f = 0.05 + nA * 0.28;          /* North Cascades */
    if (lat > 47.8 && lon > -119.8 && lon < -117.5) f = 0.28 + nA * 0.36;          /* Okanogan highlands */
    if (lat < 46.45 && lon > -118.4) f = Math.min(f, 0.26 + nA * 0.3);             /* Blue Mts */
    var flatness = clamp(f, 0.01, 1);
    return { transmission: transmission, water: water, community: community, seismic: seismic, flood: flood, contamination: contamination, waterway: waterway, geothermal: geothermal, flatness: flatness };
  }

  /* ── grid ── */
  var lonMin = -124.85, latMax = 49.05, D = 0.15;
  var cols = 53, rows = 24;
  var cells = [], cellIndex = {};
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      var lat = latMax - (r + 0.5) * D, lon = lonMin + (c + 0.5) * D;
      if (!inWA(lon, lat)) continue;
      var ind = indicatorsAt(lon, lat);
      var gate = null;
      if (ind.flatness < 0.16) gate = 'terrain';
      for (var p = 0; p < PROT.length; p++) if (dist(lon, lat, PROT[p].c[0], PROT[p].c[1]) < PROT[p].r) { gate = 'protected'; break; }
      var cell = { id: r + '-' + c, r: r, c: c, lat: lat, lon: lon, ind: ind, gate: gate };
      cells.push(cell); cellIndex[cell.id] = cell;
    }
  }
  function cellAt(lat, lon) {
    var r2 = Math.floor((latMax - lat) / D), c2 = Math.floor((lon - lonMin) / D);
    return cellIndex[r2 + '-' + c2] || null;
  }

  var INDICATORS = [
    { k: 'transmission', label: 'Transmission proximity', def: 40, icon: 'pylon' },
    { k: 'water', label: 'Water availability', def: 35, icon: 'droplet' },
    { k: 'community', label: 'Community burden', def: 25, icon: 'rings' },
    { k: 'seismic', label: 'Seismic safety', def: 0, icon: 'wave' },
    { k: 'flood', label: 'Flood safety', def: 0, icon: 'flood' },
    { k: 'contamination', label: 'Contamination distance', def: 0, icon: 'borehole' },
    { k: 'waterway', label: 'Waterway sensitivity', def: 0, icon: 'river' },
    { k: 'geothermal', label: 'Geothermal opportunity', def: 0, icon: 'thermal' },
    { k: 'flatness', label: 'Terrain flatness', def: 0, icon: 'contour' },
    { k: 'aquifer', label: 'Aquifer depth', def: 0, icon: 'borehole' },
    { k: 'soil', label: 'Soil suitability', def: 0, icon: 'parcel' },
    { k: 'slope', label: 'Slope suitability', def: 0, icon: 'wave' },
    { k: 'pop_exposure', label: 'Population exposure', def: 0, icon: 'pin' },
    { k: 'soil_profile', label: 'Soil profile chemistry', def: 0, icon: 'plumb' },
    { k: 'ksat', label: 'Hydraulic K-sat', def: 0, icon: 'borehole' },
    { k: 'substation', label: 'Substation proximity', def: 0, icon: 'pylon' },
    { k: 'superfund', label: 'Superfund distance', def: 0, icon: 'borehole' },
    { k: 'rcra', label: 'RCRA site distance', def: 0, icon: 'borehole' },
    { k: 'air_quality', label: 'Air quality (NAAQS)', def: 0, icon: 'wave' },
    { k: 'fiber', label: 'Fiber connectivity', def: 0, icon: 'pylon' },
    { k: 'water_stress', label: 'Water stress', def: 0, icon: 'droplet' },
    { k: 'grid_capacity', label: 'Grid capacity', def: 0, icon: 'pylon' }
  ];
  var DEFAULT_WEIGHTS = {};
  INDICATORS.forEach(function (m) { DEFAULT_WEIGHTS[m.k] = m.def; });
  function composite(ind, w) {
    var s = 0, tot = 0;
    for (var i = 0; i < INDICATORS.length; i++) {
      var k = INDICATORS[i].k, wt = w[k] || 0;
      s += wt * (ind[k] || 0); tot += wt;
    }
    return tot > 0 ? s / tot : 0;
  }

  /* ── clusters (real composites from the published model) ── */
  var CLUSTERS = [
    { name: 'Quincy', lat: 47.23, lon: -119.85, status: 'existing', composite: 0.599, ind: { transmission: 0.85, water: 0.35, community: 0.55, seismic: 0.86, flood: 0.78, contamination: 0.74, waterway: 0.62, geothermal: 0.12, flatness: 0.769 } },
    { name: 'Malaga–East Wenatchee', lat: 47.37, lon: -120.26, status: 'existing', composite: 0.656, ind: { transmission: 0.78, water: 0.60, community: 0.52, seismic: 0.80, flood: 0.66, contamination: 0.82, waterway: 0.40, geothermal: 0.18, flatness: 0.479 } },
    { name: 'Seattle downtown', lat: 47.60, lon: -122.33, status: 'existing', composite: 0.783, ind: { transmission: 0.95, water: 0.75, community: 0.56, seismic: 0.22, flood: 0.70, contamination: 0.55, waterway: 0.35, geothermal: 0.10, flatness: 0.62 } },
    { name: 'Tukwila', lat: 47.47, lon: -122.26, status: 'existing', composite: 0.683, ind: { transmission: 0.95, water: 0.80, community: 0.109, seismic: 0.24, flood: 0.55, contamination: 0.50, waterway: 0.38, geothermal: 0.10, flatness: 0.828 } },
    { name: 'Liberty Lake', lat: 47.65, lon: -117.08, status: 'existing', composite: 0.703, ind: { transmission: 0.80, water: 0.65, community: 0.62, seismic: 0.88, flood: 0.72, contamination: 0.78, waterway: 0.55, geothermal: 0.08, flatness: 0.66 } },
    { name: 'Digital Realty (proposed)', lat: 47.14, lon: -119.28, status: 'proposed', composite: 0.783, ind: { transmission: 0.90, water: 0.70, community: 0.71, seismic: 0.85, flood: 0.80, contamination: 0.72, waterway: 0.66, geothermal: 0.10, flatness: 0.91 } },
    { name: 'Wallula Gap–Burbank (proposed)', lat: 46.06, lon: -118.93, status: 'proposed', composite: 0.506, ind: { transmission: 0.90, water: 0.000, community: 0.58, seismic: 0.82, flood: 0.60, contamination: 0.014, waterway: 0.015, geothermal: 0.06, flatness: 1.0 } },
    { name: 'Richland–Horn Rapids (proposed)', lat: 46.35, lon: -119.32, status: 'proposed', composite: 0.583, ind: { transmission: 0.85, water: 0.35, community: 0.48, seismic: 0.83, flood: 0.65, contamination: 0.20, waterway: 0.30, geothermal: 0.06, flatness: 1.0 } },
    { name: 'West Richland–Lewis & Clark (proposed)', lat: 46.30, lon: -119.42, status: 'proposed', composite: 0.556, ind: { transmission: 0.84, water: 0.32, community: 0.45, seismic: 0.83, flood: 0.68, contamination: 0.25, waterway: 0.34, geothermal: 0.06, flatness: 1.0 } }
  ];
  CLUSTERS.forEach(function (cl) { var cell = cellAt(cl.lat, cl.lon); if (cell) { cell.ind = cl.ind; cell.gate = null; cell.cluster = cl.name; } });

  /* ── top unclaimed cells (pinned: identical indicator vector ⇒ weight-invariant) ── */
  var RECOMMENDED = [
    { lat: 46.07, lon: -122.22, score: 0.996, label: 'Cell 46.07N / 122.22W' },
    { lat: 45.77, lon: -122.67, score: 0.953, label: 'Cell 45.77N / 122.67W' },
    { lat: 46.52, lon: -124.02, score: 0.952, label: 'Cell 46.52N / 124.02W' }
  ];
  RECOMMENDED.forEach(function (rc) {
    var cell = cellAt(rc.lat, rc.lon);
    if (cell) { var ind2 = {}; INDICATORS.forEach(function (m) { ind2[m.k] = rc.score; }); cell.ind = ind2; cell.gate = null; cell.pinned = rc.score; }
  });

  function nearestCluster(lat, lon) {
    var best = null, bd = 99;
    CLUSTERS.forEach(function (cl) { var d = dist(lon, lat, cl.lon, cl.lat); if (d < bd) { bd = d; best = cl; } });
    return bd < 0.5 ? best : null;
  }

  var GATE_COUNTS = { terrain: 61, protected: 82, total: 124, scored: 974, viable: 850 };

  /* ── builder site listings ── */
  var SITES = [
    { id: 'kittitas', title: 'Kittitas Corridor', cell: 'Cell 46.97N / 120.54W', lat: 46.97, lon: -120.54, composite: 0.81, acres: 412, kv: 345, kvDist: 3.1, zcta: '98926', pop: 21400, parcels: 14,
      bars: { Water: 0.71, Grid: 0.88, Community: 0.74, Hazard: 0.69, 'Heat-reuse': 0.55 },
      flags: [{ t: 'Insurance: Moderate (wind)', tone: 'med' }, { t: 'Water rights: available', tone: 'lo' }, { t: 'No Superfund within 40 km', tone: 'lo' }],
      county: 'Kittitas', waterRights: 'Available', blurb: 'Flat shrub-steppe bench east of the Cascade crest. Two existing 345 kV circuits cross the corridor; municipal water district holds unallocated industrial rights.' },
    { id: 'woodland', title: 'Woodland Foothills', cell: 'Cell 46.07N / 122.22W', lat: 46.07, lon: -122.22, composite: 0.996, acres: 268, kv: 500, kvDist: 2.4, zcta: '98674', pop: 12800, parcels: 9,
      bars: { Water: 0.95, Grid: 0.97, Community: 0.92, Hazard: 0.81, 'Heat-reuse': 0.66 },
      flags: [{ t: 'Insurance: Low', tone: 'lo' }, { t: 'Water rights: adjudicated', tone: 'lo' }, { t: 'No Superfund within 40 km', tone: 'lo' }],
      county: 'Cowlitz', waterRights: 'Adjudicated', blurb: 'The highest-scoring unclaimed cell in the state. Westside water durability with eastside-grade transmission access off the lower Columbia 500 kV path.' },
    { id: 'vancouver', title: 'Vancouver North — Salmon Creek', cell: 'Cell 45.77N / 122.67W', lat: 45.77, lon: -122.67, composite: 0.953, acres: 188, kv: 500, kvDist: 1.8, zcta: '98685', pop: 34100, parcels: 7,
      bars: { Water: 0.9, Grid: 0.96, Community: 0.7, Hazard: 0.78, 'Heat-reuse': 0.82 },
      flags: [{ t: 'Insurance: Low', tone: 'lo' }, { t: 'Water rights: adjudicated', tone: 'lo' }, { t: 'Heat-reuse demand < 5 km', tone: 'lo' }],
      county: 'Clark', waterRights: 'Adjudicated', blurb: 'Urban-edge cell with district-heat offtake potential and the shortest line distance to 500 kV in the portfolio.' },
    { id: 'willapa', title: 'Willapa Coast Bench', cell: 'Cell 46.52N / 124.02W', lat: 46.52, lon: -124.02, composite: 0.952, acres: 530, kv: 230, kvDist: 6.7, zcta: '98631', pop: 4900, parcels: 11,
      bars: { Water: 0.93, Grid: 0.74, Community: 0.9, Hazard: 0.62, 'Heat-reuse': 0.4 },
      flags: [{ t: 'Insurance: Moderate (wind)', tone: 'med' }, { t: 'Water rights: available', tone: 'lo' }, { t: 'Tsunami zone 4 km west', tone: 'med' }],
      county: 'Pacific', waterRights: 'Available', blurb: 'Coastal terrace above the inundation line. Exceptional water durability; transmission is the constraint to engineer around.' },
    { id: 'centralia', title: 'Centralia Transition Site', cell: 'Cell 46.72N / 122.95W', lat: 46.72, lon: -122.95, composite: 0.77, acres: 960, kv: 500, kvDist: 0.9, zcta: '98531', pop: 18200, parcels: 22,
      bars: { Water: 0.72, Grid: 0.98, Community: 0.68, Hazard: 0.7, 'Heat-reuse': 0.88 },
      flags: [{ t: 'Interconnection rights: legacy thermal', tone: 'lo' }, { t: 'Water rights: adjudicated', tone: 'lo' }, { t: 'Heat-reuse demand < 5 km', tone: 'lo' }],
      county: 'Lewis', waterRights: 'Adjudicated', blurb: 'Retiring thermal plant with existing switchyard and water infrastructure. Greenhouse co-op and district-heat studies already on file.' },
    { id: 'creston', title: 'Creston Ridge', cell: 'Cell 47.76N / 118.52W', lat: 47.76, lon: -118.52, composite: 0.72, acres: 1240, kv: 500, kvDist: 4.2, zcta: '99117', pop: 2300, parcels: 18,
      bars: { Water: 0.48, Grid: 0.92, Community: 0.88, Hazard: 0.83, 'Heat-reuse': 0.2 },
      flags: [{ t: 'Insurance: Low', tone: 'lo' }, { t: 'Water rights: constrained', tone: 'med' }, { t: 'No Superfund within 40 km', tone: 'lo' }],
      county: 'Lincoln', waterRights: 'Constrained', blurb: 'Wheat-country plateau on the Grand Coulee 500 kV path. Grid access is elite; water strategy must be closed-loop from day one.' },
    { id: 'moses', title: 'Moses Lake North', cell: 'Cell 47.19N / 119.32W', lat: 47.19, lon: -119.32, composite: 0.64, acres: 720, kv: 230, kvDist: 2.2, zcta: '98837', pop: 25900, parcels: 26,
      bars: { Water: 0.31, Grid: 0.86, Community: 0.61, Hazard: 0.84, 'Heat-reuse': 0.35 },
      flags: [{ t: 'Water rights: constrained', tone: 'med' }, { t: 'Aquifer decline zone', tone: 'hi' }, { t: 'Insurance: Low', tone: 'lo' }],
      county: 'Grant', waterRights: 'Constrained', blurb: 'Industrial-zoned and shovel-flat, but it sits over the declining Odessa aquifer. The score says what the brochure won\u2019t.' },
    { id: 'goldendale', title: 'Goldendale Plateau', cell: 'Cell 45.86N / 120.70W', lat: 45.86, lon: -120.70, composite: 0.69, acres: 840, kv: 500, kvDist: 5.5, zcta: '98620', pop: 3500, parcels: 12,
      bars: { Water: 0.52, Grid: 0.84, Community: 0.79, Hazard: 0.8, 'Heat-reuse': 0.25 },
      flags: [{ t: 'Waterway: Columbia 4 km', tone: 'med' }, { t: 'Water rights: available', tone: 'lo' }, { t: 'Insurance: Low', tone: 'lo' }],
      county: 'Klickitat', waterRights: 'Available', blurb: 'Wind-belt plateau south of the Simcoes. Strong grid posture; cultural-resource survey required before any parcel motion.' }
  ];

  /* ── watchlist + alerts ── */
  var ALERTS = [
    { kind: 'bill', icon: '⚠', title: 'New bill filed: WA HB — data center water reporting', detail: 'Affects 3 watched sites (Kittitas Corridor, Moses Lake North, Creston Ridge). Disclosure of consumptive use above 50k gal/day.', age: '2h ago', tone: 'med' },
    { kind: 'rate', icon: '▲', title: 'Rate case opened — Grant PUD', detail: 'New large-load tariff class proposed. Filing 26-UE-0388; comment window 30 days.', age: '1d ago', tone: 'med' },
    { kind: 'moratorium', icon: '●', title: 'Moratorium expired — Frederick Co, MD', detail: 'Out-of-state comparable you follow. County resumed application intake with new substation setback rules.', age: '3d ago', tone: 'lo' },
    { kind: 'score', icon: '◆', title: 'Score change: Moses Lake North 0.66 → 0.64', detail: 'USGS spring aquifer survey lowered the water indicator from 0.35 to 0.31.', age: '5d ago', tone: 'hi' }
  ];
  var WATCHED = ['kittitas', 'moses', 'creston', 'centralia'];

  /* ── portfolio screening ── */
  var PORTFOLIO = [
    { name: 'Candidate A — Wallula bench', cell: '46.06N / 118.93W', composite: 0.506, fail: true, why: 'Water 0.000 — would have flagged like all 2025 WA cancellations.' },
    { name: 'Candidate B — Kittitas Corridor', cell: '46.97N / 120.54W', composite: 0.81, fail: false, why: '' },
    { name: 'Candidate C — Horn Rapids annex', cell: '46.35N / 119.32W', composite: 0.583, fail: true, why: 'Contamination distance 0.20 (Hanford-adjacent); insurer pre-screen declined.' },
    { name: 'Candidate D — Centralia Transition', cell: '46.72N / 122.95W', composite: 0.77, fail: false, why: '' },
    { name: 'Candidate E — Odessa flats', cell: '47.33N / 118.69W', composite: 0.61, fail: true, why: 'Water 0.04 over declining aquifer; rights queue closed since 2023.' },
    { name: 'Candidate F — Woodland Foothills', cell: '46.07N / 122.22W', composite: 0.996, fail: false, why: '' },
    { name: 'Candidate G — North Cascades shelf', cell: '48.42N / 121.34W', composite: 0, fail: true, why: 'Hard gate: protected land. Gates apply regardless of weights.' }
  ];

  /* ── steward docket ── */
  var STAGES = ['Site Inquiry', 'Intake', 'Analysis', 'Findings Exchange', 'Negotiation', 'Rebuttal Cycle', 'Mediation', 'Resolution'];
  var CASES = [];
  var PARTY_NAMES = { KC: 'Klickitat County', YN: 'Yakama Nation', PUD: 'Public Utility District', GC: 'Grant County', BC: 'Benton County', AG: 'Attorney General', CT: 'CTUIR', WW: 'Walla Walla County', UT: 'Serving utility', SC: 'Spokane County' };

  var CASE_DETAIL = {};
  var CASE_DETAIL_MAP = {};

  var IMPASSES = [];
  var IMPASSE_UNLOCKS = {};
  var LITIGATION = [];
  var STUDIES = [];

  /* ── shared context ── */
  var STATS = [
    { n: '300+', t: 'state data-center bills filed in the first six weeks of 2026' },
    { n: '7+ yrs', t: 'average wait from interconnection queue to power' },
    { n: '$11.3M', t: 'construction cost per megawatt, and rising' },
    { n: '2 of 3', t: 'recent U.S. data centers sit in water-stressed areas' },
    { n: '>40%', t: 'of 2025\u2019s canceled projects cited water' }
  ];
  var GRADES = [
    { k: 'Water Durability', g: 'B-', why: 'Mixed water picture. Strengths: Groundwater access is favorable (0.85). Long-term supply stress is low (0.88). Watch: Waterway proximity is weak (0.14) — cooling and process water options are limited.' },
    { k: 'Grid Access', g: 'B-', why: 'Strong grid position. High-voltage transmission proximity is strong (0.87). Substation density is favorable (0.80). Fiber interconnect density is strong (0.79). ISO interconnection queue headroom is favorable (0.71).' },
    { k: 'Hazard Exposure', g: 'D', why: 'Mixed hazard profile. Strengths: Flood exposure is minimal across viable cells (1.00). Air quality attainment is strong (0.99) — CAA permitting friction is low. Watch: Seismic exposure is above the national median (0.57) — structural requirements may apply in some viable cells.' },
    { k: 'Community Burden', g: 'C+', why: 'Low community burden. EJ burden is low across viable cells (0.68). Population exposure is low (0.96). Opposition risk is below average.' },
    { k: 'Contamination Distance', g: 'B', why: 'Contamination is a meaningful constraint. Contamination proximity is constrained (0.16) — legacy industrial presence affects viable inventory. NPL Superfund proximity is elevated (0.11) — Phase I and II ESAs are essential. RCRA corrective action site density is high (0.15) — legacy hazardous waste handling adds due diligence burden.' },
  ];
  var STATE_GRADE = 'C+';
  var DATA_SOURCES = 'OSM (ODbL) · Census ACS · PRISM Climate Group · USGS NWIS + ASCE 7-22 · FEMA NFHL · EPA TRI + Envirofacts NPL + RCRA · EPA Green Book · SSURGO SDM · IHFC 2024 GHFDB · SRTM1 · EIA Form 860 + 860M · WRI Aqueduct 3.0 · PeeringDB';
  var PROMISE = {
    short: 'Same Score Promise',
    long: 'Our methodology, weights, and sources are public and identical for every user. Subscriptions buy resolution and workflow. They have never bought a friendlier number, and they never will; a flattering score on a failing site bankrupts everyone who trusted it. The aquifer doesn\u2019t read press releases.'
  };
  var VERSION = 'v2026.06.23';

  /* ── additional states: synthetic aggregate models (public high-level layer) ── */
  function pip(poly, lon, lat) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function genCells(cfg) {
    var lo = 999, hi = -999, la = 999, ha = -999;
    cfg.poly.forEach(function (p) { if (p[0] < lo) lo = p[0]; if (p[0] > hi) hi = p[0]; if (p[1] < la) la = p[1]; if (p[1] > ha) ha = p[1]; });
    var sLonMin = lo - 0.04, sLatMax = ha + 0.04;
    var sCols = Math.ceil((hi - lo + 0.08) / D), sRows = Math.ceil((ha - la + 0.08) / D);
    var out = [];
    for (var r = 0; r < sRows; r++) {
      for (var c = 0; c < sCols; c++) {
        var lat = sLatMax - (r + 0.5) * D, lon = sLonMin + (c + 0.5) * D;
        if (!pip(cfg.poly, lon, lat)) continue;
        var nA = fbm(lon * 2.6, lat * 2.6), nB = fbm(lon * 2.6 + 31, lat * 2.6 + 17), nC = fbm(lon * 4.1 + 53, lat * 4.1 + 7);
        var riverProx = cfg.river.length ? Math.exp(-minDistTo(cfg.river, lon, lat) * 3.2) : 0;
        var tx = 0;
        for (var i = 0; i < cfg.tx.length; i++) { var v = cfg.tx[i][2] * Math.exp(-dist(lon, lat, cfg.tx[i][0], cfg.tx[i][1]) * 1.7); if (v > tx) tx = v; }
        var burden = 0;
        for (i = 0; i < cfg.urban.length; i++) burden += cfg.urban[i][2] * Math.exp(-dist(lon, lat, cfg.urban[i][0], cfg.urban[i][1]) * 4.5);
        var cont = 1;
        for (i = 0; i < cfg.contam.length; i++) { var cv = 1 - Math.exp(-dist(lon, lat, cfg.contam[i][0], cfg.contam[i][1]) * 2.1); if (cv < cont) cont = cv; }
        var ind = {
          transmission: clamp(0.12 + tx * 0.85 + (nA - 0.5) * 0.14, 0.02, 1),
          water: clamp(cfg.water(lon, lat) + riverProx * 0.28 + (nB - 0.5) * 0.2, 0, 1),
          community: clamp(0.82 - clamp(burden, 0, 0.8) + (nC - 0.5) * 0.22, 0.05, 1),
          seismic: clamp(cfg.seismic(lon, lat) + (nA - 0.5) * 0.12, 0.05, 1),
          flood: clamp(0.86 - riverProx * 0.5 + (nB - 0.5) * 0.12, 0.05, 1),
          contamination: clamp(cont + (nC - 0.5) * 0.06, 0, 1),
          waterway: clamp(0.88 - riverProx * 0.72 + (nA - 0.5) * 0.1, 0, 1),
          geothermal: clamp(cfg.geo(lon, lat) + nB * 0.2, 0.02, 1),
          flatness: clamp(cfg.flat(lon, lat, nA), 0.01, 1)
        };
        var gate = null;
        if (ind.flatness < 0.16) gate = 'terrain';
        for (i = 0; i < cfg.prot.length; i++) if (dist(lon, lat, cfg.prot[i].c[0], cfg.prot[i].c[1]) < cfg.prot[i].r) { gate = 'protected'; break; }
        out.push({ id: r + '-' + c, r: r, c: c, lat: lat, lon: lon, ind: ind, gate: gate });
      }
    }
    return { cells: out, cols: sCols, rows: sRows, lonMin: sLonMin, latMax: sLatMax, D: D };
  }
  function mkState(key, name, cfg, grade, grades) {
    var G = genCells(cfg);
    var viable = 0; G.cells.forEach(function (x) { if (!x.gate) viable++; });
    return { key: key, name: name, GRID: G, CLUSTERS: [], RECOMMENDED: [], isWA: false, grade: grade, grades: grades, scored: G.cells.length, viable: viable };
  }

  var STATES = {
    WA: { key: 'WA', name: 'Washington', GRID: { cells: cells, cols: cols, rows: rows, lonMin: lonMin, latMax: latMax, D: D }, CLUSTERS: CLUSTERS, RECOMMENDED: RECOMMENDED, isWA: true, grade: STATE_GRADE, grades: GRADES, scored: 974, viable: 850 },
    ID: mkState('ID', 'Idaho', {
      poly: [[-117.04, 49], [-116.05, 49], [-116.05, 46.7], [-115.0, 45.7], [-113.45, 44.9], [-111.05, 44.55], [-111.05, 42.0], [-117.03, 42.0], [-117.03, 44.3], [-116.45, 45.5], [-117.04, 46.0]],
      tx: [[-116.2, 43.6, 1.0], [-112.04, 43.5, 0.85], [-114.46, 42.56, 0.8], [-116.78, 47.7, 0.85], [-112.45, 42.87, 0.7], [-116.7, 45.0, 0.75]],
      urban: [[-116.2, 43.61, 0.7], [-116.78, 47.7, 0.35], [-112.03, 43.49, 0.3], [-112.45, 42.87, 0.25]],
      river: [[-117.0, 43.9], [-116.4, 43.55], [-115.4, 43.3], [-114.4, 42.6], [-113.2, 42.7], [-112.2, 43.2], [-111.5, 43.7]],
      contam: [[-112.85, 43.6]],
      prot: [{ c: [-115.2, 45.2], r: 0.6 }, { c: [-114.3, 44.2], r: 0.45 }, { c: [-116.6, 45.4], r: 0.3 }],
      water: function (lon, lat) { return lat > 46 ? 0.6 : (lat > 44.2 ? 0.35 : 0.24); },
      seismic: function (lon, lat) { return 0.72 - Math.exp(-dist(lon, lat, -111.3, 44.3) * 1.2) * 0.45; },
      geo: function (lon, lat) { return 0.3 + Math.exp(-dist(lon, lat, -111.6, 44.0) * 1.0) * 0.45; },
      flat: function (lon, lat, n) { return (lat < 44.0 && lat > 42.2) ? 0.68 + n * 0.3 : (lat < 46.3 && lat >= 44.0) ? 0.07 + n * 0.3 : 0.28 + n * 0.32; }
    }, 'C', [
      { k: 'Water Durability', g: 'D+', why: 'Mixed water picture. Strengths: Groundwater access is favorable (0.84). Long-term supply stress is low (0.74). Watch: Water availability is constrained (0.27) — paper rights exceed wet-year supply in key corridors. Waterway proximity is weak (0.17) — cooling and process water options are limited.' },
      { k: 'Grid Access', g: 'D+', why: 'Strong grid position. High-voltage transmission proximity is strong (0.72). Substation density is favorable (0.67). ISO interconnection queue headroom is favorable (0.70).' },
      { k: 'Hazard Exposure', g: 'C-', why: 'Low hazard profile. Seismic risk is low (0.76). Flood exposure is minimal across viable cells (1.00). Air quality attainment is strong (0.96) — CAA permitting friction is low.' },
      { k: 'Community Burden', g: 'C', why: 'Low community burden. Population exposure is low (0.99). Opposition risk is below average.' },
      { k: 'Contamination Distance', g: 'B+', why: 'Contamination is a meaningful constraint. Contamination proximity is constrained (0.29) — legacy industrial presence affects viable inventory. NPL Superfund proximity is elevated (0.16) — Phase I and II ESAs are essential. RCRA corrective action site density is high (0.16) — legacy hazardous waste handling adds due diligence burden.' }
    ]),
    OR: mkState('OR', 'Oregon', {
      poly: [[-124.55, 42.0], [-124.1, 43.4], [-123.9, 45.5], [-123.95, 46.2], [-123.4, 46.2], [-122.78, 45.9], [-122.6, 45.62], [-122.33, 45.56], [-121.9, 45.65], [-121.08, 45.65], [-120.65, 45.74], [-119.85, 45.83], [-119.25, 45.93], [-118.98, 46.0], [-116.92, 46.0], [-117.03, 44.25], [-117.03, 42.0]],
      tx: [[-122.62, 45.55, 0.95], [-119.6, 45.85, 0.95], [-121.3, 44.05, 0.8], [-123.1, 44.05, 0.8], [-122.9, 42.35, 0.7], [-121.78, 42.2, 0.7], [-117.85, 44.8, 0.6]],
      urban: [[-122.65, 45.5, 0.85], [-123.03, 44.94, 0.4], [-123.1, 44.05, 0.45], [-121.3, 44.06, 0.3], [-122.87, 42.33, 0.3]],
      river: [[-123.9, 46.2], [-123.0, 46.15], [-122.4, 45.6], [-121.2, 45.65], [-120.0, 45.75], [-119.0, 45.95], [-122.7, 45.4], [-123.0, 44.8], [-123.1, 44.0]],
      contam: [[-122.7, 45.6]],
      prot: [{ c: [-122.12, 42.93], r: 0.2 }, { c: [-121.8, 44.15], r: 0.3 }, { c: [-117.3, 45.25], r: 0.35 }, { c: [-122.15, 45.35], r: 0.2 }],
      water: function (lon) { return lon < -122.2 ? 0.68 : 0.3; },
      seismic: function (lon) { return 0.18 + Math.min(1, (lon + 124.6) / 4) * 0.62; },
      geo: function (lon) { return Math.exp(-Math.pow((lon + 121.9) / 0.55, 2)) * 0.7 + 0.12; },
      flat: function (lon, lat, n) { return (lon > -123.35 && lon < -122.45 && lat < 45.4) ? 0.5 + n * 0.35 : (lon >= -122.45 && lon < -121.2) ? 0.08 + n * 0.3 : (lon >= -121.2) ? 0.6 + n * 0.32 : 0.15 + n * 0.3; }
    }, 'C+', [
      { k: 'Water Durability', g: 'C-', why: 'Mixed water picture. Strengths: Groundwater access is favorable (0.89). Long-term supply stress is low (0.69). Watch: Waterway proximity is weak (0.19) — cooling and process water options are limited.' },
      { k: 'Grid Access', g: 'D', why: 'Mixed grid picture. Strengths: High-voltage transmission proximity is strong (0.79). Substation density is favorable (0.69). Fiber interconnect density is strong (0.66). Watch: ISO queue is congested (0.13) — new large-load additions face above-average wait times.' },
      { k: 'Hazard Exposure', g: 'D', why: 'Mixed hazard profile. Strengths: Flood exposure is minimal across viable cells (1.00). Air quality attainment is strong (1.00) — CAA permitting friction is low. Watch: Seismic exposure is above the national median (0.62) — structural requirements may apply in some viable cells.' },
      { k: 'Community Burden', g: 'B+', why: 'Low community burden. EJ burden is low across viable cells (0.71). Population exposure is low (0.99). Opposition risk is below average.' },
      { k: 'Contamination Distance', g: 'A', why: 'Contamination is a meaningful constraint. Contamination proximity is constrained (0.34) — legacy industrial presence affects viable inventory. NPL Superfund proximity is elevated (0.22) — Phase I and II ESAs are essential. RCRA corrective action site density is high (0.28) — legacy hazardous waste handling adds due diligence burden.' }
    ]),
    UT: mkState('UT', 'Utah', {
      poly: [[-114.05, 42.0], [-111.05, 42.0], [-111.05, 41.0], [-109.05, 41.0], [-109.05, 37.0], [-114.05, 37.0]],
      tx: [[-111.9, 40.76, 1.0], [-112.58, 39.38, 0.9], [-111.66, 40.23, 0.8], [-111.97, 41.22, 0.8], [-113.58, 37.1, 0.6], [-109.55, 40.45, 0.5]],
      urban: [[-111.9, 40.76, 0.8], [-111.66, 40.23, 0.5], [-111.97, 41.22, 0.45], [-113.57, 37.1, 0.3]],
      river: [[-109.6, 40.6], [-110.0, 39.6], [-110.2, 38.9], [-109.4, 38.6], [-110.1, 37.9], [-110.9, 37.3]],
      contam: [[-112.2, 40.73], [-112.35, 40.55]],
      prot: [{ c: [-110.45, 40.75], r: 0.45 }, { c: [-113.05, 37.25], r: 0.2 }, { c: [-109.9, 38.2], r: 0.3 }, { c: [-112.5, 41.15], r: 0.35 }],
      water: function (lon, lat) { return 0.2 + (lat > 39.6 ? Math.exp(-Math.abs(lon + 111.6) * 2.2) * 0.3 : 0); },
      seismic: function (lon) { return 0.72 - Math.exp(-Math.abs(lon + 111.85) * 4.5) * 0.42; },
      geo: function () { return 0.34; },
      flat: function (lon, lat, n) { return (lon < -112.3) ? 0.66 + n * 0.3 : (Math.abs(lon + 111.75) < 0.45) ? 0.1 + n * 0.3 : (lat > 40.4 && lon > -111.0) ? 0.08 + n * 0.3 : 0.34 + n * 0.34; }
    }, 'C+', [
      { k: 'Water Durability', g: 'C-', why: 'Mixed water picture. Strengths: Groundwater access is favorable (0.85). Long-term supply stress is low (0.78). Watch: Water availability is constrained (0.12) — paper rights exceed wet-year supply in key corridors. Waterway proximity is weak (0.29) — cooling and process water options are limited.' },
      { k: 'Grid Access', g: 'D-', why: 'Mixed grid picture. Strengths: High-voltage transmission proximity is strong (0.72). Substation density is favorable (0.68). Watch: ISO queue is congested (0.08) — new large-load additions face above-average wait times.' },
      { k: 'Hazard Exposure', g: 'D+', why: 'Low hazard profile. Seismic risk is low (0.74). Flood exposure is minimal across viable cells (1.00). Air quality attainment is strong (0.91) — CAA permitting friction is low.' },
      { k: 'Community Burden', g: 'A', why: 'Low community burden. EJ burden is low across viable cells (0.84). Population exposure is low (0.98). Opposition risk is below average.' },
      { k: 'Contamination Distance', g: 'A', why: 'Contamination is a meaningful constraint. NPL Superfund proximity is elevated (0.28) — Phase I and II ESAs are essential. RCRA corrective action site density is high (0.24) — legacy hazardous waste handling adds due diligence burden.' }
    ]),
    NV: mkState('NV', 'Nevada', {
      poly: [[-120.0, 42.0], [-114.04, 42.0], [-114.04, 36.1], [-114.74, 36.1], [-114.63, 35.0], [-120.0, 39.0]],
      tx: [[-115.14, 36.17, 1.0], [-119.8, 39.5, 0.9], [-114.74, 36.02, 0.95], [-114.88, 39.25, 0.6], [-117.15, 40.8, 0.75], [-115.0, 36.35, 0.9]],
      urban: [[-115.14, 36.17, 0.85], [-119.81, 39.53, 0.55], [-119.77, 39.16, 0.3]],
      river: [[-114.7, 36.1], [-114.6, 35.6], [-119.2, 39.5], [-118.7, 40.0], [-117.7, 40.9], [-116.6, 40.7]],
      contam: [[-116.1, 37.1]],
      prot: [{ c: [-116.0, 37.25], r: 0.55 }, { c: [-119.95, 39.05], r: 0.18 }, { c: [-115.4, 38.9], r: 0.3 }],
      water: function () { return 0.13; },
      seismic: function (lon) { return 0.3 + Math.min(1, (lon + 120) / 5.5) * 0.55; },
      geo: function (lon, lat) { return lat > 38.5 ? 0.55 : 0.35; },
      flat: function (lon, lat, n) { return 0.55 + Math.sin(lon * 9.0) * 0.22 + (n - 0.5) * 0.3; }
    }, 'C+', [
      { k: 'Water Durability', g: 'D', why: 'Mixed water picture. Strengths: Groundwater access is favorable (0.85). Watch: Water availability is constrained (0.08) — paper rights exceed wet-year supply in key corridors.' },
      { k: 'Grid Access', g: 'D-', why: 'Mixed grid picture. Strengths: High-voltage transmission proximity is strong (0.71). Watch: ISO queue is congested (0.15) — new large-load additions face above-average wait times.' },
      { k: 'Hazard Exposure', g: 'D+', why: 'Mixed hazard profile. Strengths: Flood exposure is minimal across viable cells (1.00). Air quality attainment is strong (0.99) — CAA permitting friction is low. Watch: Seismic exposure is above the national median (0.65) — structural requirements may apply in some viable cells.' },
      { k: 'Community Burden', g: 'B+', why: 'Low community burden. EJ burden is low across viable cells (0.72). Population exposure is low (0.99). Opposition risk is below average.' },
      { k: 'Contamination Distance', g: 'A+', why: 'NV sits near the national median on contamination indicators. Phase I findings are unlikely to be material in most viable cells.' }
    ])
  };

  var AGENCY_DIRECTORY = [
    /* WA state + city */
    { key: 'OPCD',   name: 'Seattle OPCD',                             type: 'city',    state: 'WA' },
    { key: 'ECO',    name: 'WA Dept. of Ecology',                     type: 'state',   state: 'WA' },
    { key: 'AG',     name: 'WA Attorney General',                      type: 'state',   state: 'WA' },
    { key: 'DNR',    name: 'WA Dept. of Natural Resources',            type: 'state',   state: 'WA' },
    { key: 'EFSEC',  name: 'Energy Facility Site Evaluation Council',  type: 'state',   state: 'WA' },
    { key: 'WDFW',   name: 'WA Dept. of Fish and Wildlife',            type: 'state',   state: 'WA' },
    { key: 'COM',    name: 'WA Dept. of Commerce',                     type: 'state',   state: 'WA' },
    { key: 'DOH',    name: 'WA Dept. of Health',                       type: 'state',   state: 'WA' },
    { key: 'SHPO',   name: 'WA State Historic Preservation Office',    type: 'state',   state: 'WA' },
    /* federal — all states */
    { key: 'EPA-R1',  name: 'EPA Region 1 — New England',             type: 'federal' },
    { key: 'EPA-R2',  name: 'EPA Region 2 — New York / New Jersey',   type: 'federal' },
    { key: 'EPA-R3',  name: 'EPA Region 3 — Mid-Atlantic',            type: 'federal' },
    { key: 'EPA-R4',  name: 'EPA Region 4 — Southeast',               type: 'federal' },
    { key: 'EPA-R5',  name: 'EPA Region 5 — Great Lakes',             type: 'federal' },
    { key: 'EPA-R6',  name: 'EPA Region 6 — South Central',           type: 'federal' },
    { key: 'EPA-R7',  name: 'EPA Region 7 — Central',                 type: 'federal' },
    { key: 'EPA-R8',  name: 'EPA Region 8 — Mountain',                type: 'federal' },
    { key: 'EPA-R9',  name: 'EPA Region 9 — Pacific',                 type: 'federal' },
    { key: 'EPA-R10', name: 'EPA Region 10 — Pacific Northwest',      type: 'federal' },
    { key: 'ACOE',   name: 'US Army Corps of Engineers',               type: 'federal' },
    { key: 'USFWS',  name: 'US Fish and Wildlife Service',             type: 'federal' },
    { key: 'BLM',    name: 'Bureau of Land Management',                type: 'federal' },
    { key: 'USBR',   name: 'Bureau of Reclamation',                    type: 'federal' },
    /* AL */
    { key: 'AL-ENV', name: 'AL Dept. of Environmental Management',              type: 'state', state: 'AL' },
    { key: 'AL-AG',  name: 'AL Attorney General',                               type: 'state', state: 'AL' },
    { key: 'AL-SHP', name: 'AL State Historic Preservation Office',             type: 'state', state: 'AL' },
    { key: 'AL-DNR', name: 'AL Dept. of Conservation and Natural Resources',    type: 'state', state: 'AL' },
    /* AR */
    { key: 'AR-ENV', name: 'AR Dept. of Environmental Quality',                 type: 'state', state: 'AR' },
    { key: 'AR-AG',  name: 'AR Attorney General',                               type: 'state', state: 'AR' },
    { key: 'AR-SHP', name: 'AR Historic Preservation Program',                  type: 'state', state: 'AR' },
    { key: 'AR-DNR', name: 'AR Natural Resources Commission',                   type: 'state', state: 'AR' },
    /* AZ */
    { key: 'AZ-ENV', name: 'AZ Dept. of Environmental Quality',                 type: 'state', state: 'AZ' },
    { key: 'AZ-AG',  name: 'AZ Attorney General',                               type: 'state', state: 'AZ' },
    { key: 'AZ-SHP', name: 'AZ State Historic Preservation Office',             type: 'state', state: 'AZ' },
    { key: 'AZ-DWR', name: 'AZ Dept. of Water Resources',                       type: 'state', state: 'AZ' },
    /* CA */
    { key: 'CA-ARB', name: 'CA Air Resources Board',                            type: 'state', state: 'CA' },
    { key: 'CA-SWR', name: 'CA State Water Resources Control Board',            type: 'state', state: 'CA' },
    { key: 'CA-AG',  name: 'CA Attorney General',                               type: 'state', state: 'CA' },
    { key: 'CA-SHP', name: 'CA State Historic Preservation Office',             type: 'state', state: 'CA' },
    { key: 'CA-PUC', name: 'CA Public Utilities Commission',                    type: 'state', state: 'CA' },
    /* CO */
    { key: 'CO-ENV', name: 'CO Dept. of Public Health and Environment',         type: 'state', state: 'CO' },
    { key: 'CO-AG',  name: 'CO Attorney General',                               type: 'state', state: 'CO' },
    { key: 'CO-SHP', name: 'CO State Historic Preservation Office',             type: 'state', state: 'CO' },
    { key: 'CO-DNR', name: 'CO Dept. of Natural Resources',                     type: 'state', state: 'CO' },
    /* CT */
    { key: 'CT-ENV', name: 'CT Dept. of Energy and Environmental Protection',   type: 'state', state: 'CT' },
    { key: 'CT-AG',  name: 'CT Attorney General',                               type: 'state', state: 'CT' },
    { key: 'CT-SHP', name: 'CT State Historic Preservation Office',             type: 'state', state: 'CT' },
    /* DE */
    { key: 'DE-ENV', name: 'DE Dept. of Natural Resources and Environmental Control', type: 'state', state: 'DE' },
    { key: 'DE-AG',  name: 'DE Attorney General',                               type: 'state', state: 'DE' },
    { key: 'DE-SHP', name: 'DE State Historic Preservation Office',             type: 'state', state: 'DE' },
    /* FL */
    { key: 'FL-ENV', name: 'FL Dept. of Environmental Protection',              type: 'state', state: 'FL' },
    { key: 'FL-AG',  name: 'FL Attorney General',                               type: 'state', state: 'FL' },
    { key: 'FL-SHP', name: 'FL State Historic Preservation Office',             type: 'state', state: 'FL' },
    { key: 'FL-PSC', name: 'FL Public Service Commission',                      type: 'state', state: 'FL' },
    /* GA */
    { key: 'GA-ENV', name: 'GA Environmental Protection Division',              type: 'state', state: 'GA' },
    { key: 'GA-AG',  name: 'GA Attorney General',                               type: 'state', state: 'GA' },
    { key: 'GA-SHP', name: 'GA State Historic Preservation Office',             type: 'state', state: 'GA' },
    { key: 'GA-DNR', name: 'GA Dept. of Natural Resources',                     type: 'state', state: 'GA' },
    /* IA */
    { key: 'IA-ENV', name: 'IA Dept. of Natural Resources',                     type: 'state', state: 'IA' },
    { key: 'IA-AG',  name: 'IA Attorney General',                               type: 'state', state: 'IA' },
    { key: 'IA-SHP', name: 'IA State Historic Preservation Office',             type: 'state', state: 'IA' },
    /* ID */
    { key: 'ID-ENV', name: 'ID Dept. of Environmental Quality',                 type: 'state', state: 'ID' },
    { key: 'ID-AG',  name: 'ID Attorney General',                               type: 'state', state: 'ID' },
    { key: 'ID-SHP', name: 'ID State Historic Preservation Office',             type: 'state', state: 'ID' },
    { key: 'ID-DWR', name: 'ID Dept. of Water Resources',                       type: 'state', state: 'ID' },
    /* IL */
    { key: 'IL-ENV', name: 'IL Environmental Protection Agency',                type: 'state', state: 'IL' },
    { key: 'IL-AG',  name: 'IL Attorney General',                               type: 'state', state: 'IL' },
    { key: 'IL-SHP', name: 'IL Historic Preservation Agency',                   type: 'state', state: 'IL' },
    { key: 'IL-DNR', name: 'IL Dept. of Natural Resources',                     type: 'state', state: 'IL' },
    /* IN */
    { key: 'IN-ENV', name: 'IN Dept. of Environmental Management',              type: 'state', state: 'IN' },
    { key: 'IN-AG',  name: 'IN Attorney General',                               type: 'state', state: 'IN' },
    { key: 'IN-SHP', name: 'IN Dept. of Natural Resources — SHPO',              type: 'state', state: 'IN' },
    /* KS */
    { key: 'KS-ENV', name: 'KS Dept. of Health and Environment',                type: 'state', state: 'KS' },
    { key: 'KS-AG',  name: 'KS Attorney General',                               type: 'state', state: 'KS' },
    { key: 'KS-SHP', name: 'KS State Historic Preservation Office',             type: 'state', state: 'KS' },
    /* KY */
    { key: 'KY-ENV', name: 'KY Energy and Environment Cabinet',                 type: 'state', state: 'KY' },
    { key: 'KY-AG',  name: 'KY Attorney General',                               type: 'state', state: 'KY' },
    { key: 'KY-SHP', name: 'KY Heritage Council — SHPO',                        type: 'state', state: 'KY' },
    /* LA */
    { key: 'LA-ENV', name: 'LA Dept. of Environmental Quality',                 type: 'state', state: 'LA' },
    { key: 'LA-AG',  name: 'LA Attorney General',                               type: 'state', state: 'LA' },
    { key: 'LA-SHP', name: 'LA Division of Archaeology — SHPO',                 type: 'state', state: 'LA' },
    { key: 'LA-DNR', name: 'LA Dept. of Natural Resources',                     type: 'state', state: 'LA' },
    /* MA */
    { key: 'MA-ENV', name: 'MA Dept. of Environmental Protection',              type: 'state', state: 'MA' },
    { key: 'MA-AG',  name: 'MA Attorney General',                               type: 'state', state: 'MA' },
    { key: 'MA-SHP', name: 'MA Historical Commission — SHPO',                   type: 'state', state: 'MA' },
    /* MD */
    { key: 'MD-ENV', name: 'MD Dept. of the Environment',                       type: 'state', state: 'MD' },
    { key: 'MD-AG',  name: 'MD Attorney General',                               type: 'state', state: 'MD' },
    { key: 'MD-SHP', name: 'MD Historical Trust — SHPO',                        type: 'state', state: 'MD' },
    { key: 'MD-DNR', name: 'MD Dept. of Natural Resources',                     type: 'state', state: 'MD' },
    /* ME */
    { key: 'ME-ENV', name: 'ME Dept. of Environmental Protection',              type: 'state', state: 'ME' },
    { key: 'ME-AG',  name: 'ME Attorney General',                               type: 'state', state: 'ME' },
    { key: 'ME-SHP', name: 'ME Historic Preservation Commission',               type: 'state', state: 'ME' },
    /* MI */
    { key: 'MI-ENV', name: 'MI Dept. of Environment, Great Lakes, and Energy',  type: 'state', state: 'MI' },
    { key: 'MI-AG',  name: 'MI Attorney General',                               type: 'state', state: 'MI' },
    { key: 'MI-SHP', name: 'MI State Historic Preservation Office',             type: 'state', state: 'MI' },
    /* MN */
    { key: 'MN-ENV', name: 'MN Pollution Control Agency',                       type: 'state', state: 'MN' },
    { key: 'MN-AG',  name: 'MN Attorney General',                               type: 'state', state: 'MN' },
    { key: 'MN-SHP', name: 'MN State Historic Preservation Office',             type: 'state', state: 'MN' },
    { key: 'MN-DNR', name: 'MN Dept. of Natural Resources',                     type: 'state', state: 'MN' },
    /* MO */
    { key: 'MO-ENV', name: 'MO Dept. of Natural Resources',                     type: 'state', state: 'MO' },
    { key: 'MO-AG',  name: 'MO Attorney General',                               type: 'state', state: 'MO' },
    { key: 'MO-SHP', name: 'MO State Historic Preservation Office',             type: 'state', state: 'MO' },
    /* MS */
    { key: 'MS-ENV', name: 'MS Dept. of Environmental Quality',                 type: 'state', state: 'MS' },
    { key: 'MS-AG',  name: 'MS Attorney General',                               type: 'state', state: 'MS' },
    { key: 'MS-SHP', name: 'MS Dept. of Archives and History — SHPO',           type: 'state', state: 'MS' },
    /* MT */
    { key: 'MT-ENV', name: 'MT Dept. of Environmental Quality',                 type: 'state', state: 'MT' },
    { key: 'MT-AG',  name: 'MT Attorney General',                               type: 'state', state: 'MT' },
    { key: 'MT-SHP', name: 'MT State Historic Preservation Office',             type: 'state', state: 'MT' },
    { key: 'MT-DNR', name: 'MT Dept. of Natural Resources and Conservation',    type: 'state', state: 'MT' },
    /* NC */
    { key: 'NC-ENV', name: 'NC Dept. of Environmental Quality',                 type: 'state', state: 'NC' },
    { key: 'NC-AG',  name: 'NC Attorney General',                               type: 'state', state: 'NC' },
    { key: 'NC-SHP', name: 'NC State Historic Preservation Office',             type: 'state', state: 'NC' },
    /* ND */
    { key: 'ND-ENV', name: 'ND Dept. of Environmental Quality',                 type: 'state', state: 'ND' },
    { key: 'ND-AG',  name: 'ND Attorney General',                               type: 'state', state: 'ND' },
    { key: 'ND-SHP', name: 'ND State Historical Society — SHPO',                type: 'state', state: 'ND' },
    /* NE */
    { key: 'NE-ENV', name: 'NE Dept. of Environment and Energy',                type: 'state', state: 'NE' },
    { key: 'NE-AG',  name: 'NE Attorney General',                               type: 'state', state: 'NE' },
    { key: 'NE-SHP', name: 'NE State Historical Society — SHPO',                type: 'state', state: 'NE' },
    /* NH */
    { key: 'NH-ENV', name: 'NH Dept. of Environmental Services',                type: 'state', state: 'NH' },
    { key: 'NH-AG',  name: 'NH Attorney General',                               type: 'state', state: 'NH' },
    { key: 'NH-SHP', name: 'NH Division of Historical Resources — SHPO',        type: 'state', state: 'NH' },
    /* NJ */
    { key: 'NJ-ENV', name: 'NJ Dept. of Environmental Protection',              type: 'state', state: 'NJ' },
    { key: 'NJ-AG',  name: 'NJ Attorney General',                               type: 'state', state: 'NJ' },
    { key: 'NJ-SHP', name: 'NJ State Historic Preservation Office',             type: 'state', state: 'NJ' },
    /* NM */
    { key: 'NM-ENV', name: 'NM Environment Dept.',                              type: 'state', state: 'NM' },
    { key: 'NM-AG',  name: 'NM Attorney General',                               type: 'state', state: 'NM' },
    { key: 'NM-SHP', name: 'NM Historic Preservation Division',                 type: 'state', state: 'NM' },
    { key: 'NM-SLO', name: 'NM State Land Office',                              type: 'state', state: 'NM' },
    /* NV */
    { key: 'NV-ENV', name: 'NV Division of Environmental Protection',           type: 'state', state: 'NV' },
    { key: 'NV-AG',  name: 'NV Attorney General',                               type: 'state', state: 'NV' },
    { key: 'NV-SHP', name: 'NV State Historic Preservation Office',             type: 'state', state: 'NV' },
    { key: 'NV-DNR', name: 'NV Dept. of Conservation and Natural Resources',    type: 'state', state: 'NV' },
    /* NY */
    { key: 'NY-ENV', name: 'NY Dept. of Environmental Conservation',            type: 'state', state: 'NY' },
    { key: 'NY-AG',  name: 'NY Attorney General',                               type: 'state', state: 'NY' },
    { key: 'NY-SHP', name: 'NY State Historic Preservation Office',             type: 'state', state: 'NY' },
    { key: 'NY-PSC', name: 'NY Public Service Commission',                      type: 'state', state: 'NY' },
    /* OH */
    { key: 'OH-ENV', name: 'OH Environmental Protection Agency',                type: 'state', state: 'OH' },
    { key: 'OH-AG',  name: 'OH Attorney General',                               type: 'state', state: 'OH' },
    { key: 'OH-SHP', name: 'OH State Historic Preservation Office',             type: 'state', state: 'OH' },
    { key: 'OH-DNR', name: 'OH Dept. of Natural Resources',                     type: 'state', state: 'OH' },
    /* OK */
    { key: 'OK-ENV', name: 'OK Dept. of Environmental Quality',                 type: 'state', state: 'OK' },
    { key: 'OK-AG',  name: 'OK Attorney General',                               type: 'state', state: 'OK' },
    { key: 'OK-SHP', name: 'OK State Historic Preservation Office',             type: 'state', state: 'OK' },
    { key: 'OK-WRB', name: 'OK Water Resources Board',                          type: 'state', state: 'OK' },
    /* OR */
    { key: 'OR-ENV', name: 'OR Dept. of Environmental Quality',                 type: 'state', state: 'OR' },
    { key: 'OR-AG',  name: 'OR Attorney General',                               type: 'state', state: 'OR' },
    { key: 'OR-SHP', name: 'OR State Historic Preservation Office',             type: 'state', state: 'OR' },
    { key: 'OR-DSL', name: 'OR Dept. of State Lands',                           type: 'state', state: 'OR' },
    /* PA */
    { key: 'PA-ENV', name: 'PA Dept. of Environmental Protection',              type: 'state', state: 'PA' },
    { key: 'PA-AG',  name: 'PA Attorney General',                               type: 'state', state: 'PA' },
    { key: 'PA-SHP', name: 'PA State Historic Preservation Office',             type: 'state', state: 'PA' },
    { key: 'PA-DNR', name: 'PA Dept. of Conservation and Natural Resources',    type: 'state', state: 'PA' },
    /* RI */
    { key: 'RI-ENV', name: 'RI Dept. of Environmental Management',              type: 'state', state: 'RI' },
    { key: 'RI-AG',  name: 'RI Attorney General',                               type: 'state', state: 'RI' },
    { key: 'RI-SHP', name: 'RI Historic Preservation and Heritage Commission',  type: 'state', state: 'RI' },
    /* SC */
    { key: 'SC-ENV', name: 'SC Dept. of Environmental Services',                type: 'state', state: 'SC' },
    { key: 'SC-AG',  name: 'SC Attorney General',                               type: 'state', state: 'SC' },
    { key: 'SC-SHP', name: 'SC State Historic Preservation Office',             type: 'state', state: 'SC' },
    { key: 'SC-DNR', name: 'SC Dept. of Natural Resources',                     type: 'state', state: 'SC' },
    /* SD */
    { key: 'SD-ENV', name: 'SD Dept. of Agriculture and Natural Resources',     type: 'state', state: 'SD' },
    { key: 'SD-AG',  name: 'SD Attorney General',                               type: 'state', state: 'SD' },
    { key: 'SD-SHP', name: 'SD State Historic Preservation Office',             type: 'state', state: 'SD' },
    /* TN */
    { key: 'TN-ENV', name: 'TN Dept. of Environment and Conservation',          type: 'state', state: 'TN' },
    { key: 'TN-AG',  name: 'TN Attorney General',                               type: 'state', state: 'TN' },
    { key: 'TN-SHP', name: 'TN State Historic Preservation Office',             type: 'state', state: 'TN' },
    /* TX */
    { key: 'TX-ENV', name: 'TX Commission on Environmental Quality',            type: 'state', state: 'TX' },
    { key: 'TX-AG',  name: 'TX Attorney General',                               type: 'state', state: 'TX' },
    { key: 'TX-SHP', name: 'TX Historical Commission — SHPO',                   type: 'state', state: 'TX' },
    { key: 'TX-GLO', name: 'TX General Land Office',                            type: 'state', state: 'TX' },
    { key: 'TX-PUC', name: 'TX Public Utility Commission',                      type: 'state', state: 'TX' },
    /* UT */
    { key: 'UT-ENV', name: 'UT Dept. of Environmental Quality',                 type: 'state', state: 'UT' },
    { key: 'UT-AG',  name: 'UT Attorney General',                               type: 'state', state: 'UT' },
    { key: 'UT-SHP', name: 'UT State Historic Preservation Office',             type: 'state', state: 'UT' },
    { key: 'UT-DNR', name: 'UT School and Institutional Trust Lands Administration', type: 'state', state: 'UT' },
    /* VA */
    { key: 'VA-ENV', name: 'VA Dept. of Environmental Quality',                 type: 'state', state: 'VA' },
    { key: 'VA-AG',  name: 'VA Attorney General',                               type: 'state', state: 'VA' },
    { key: 'VA-SHP', name: 'VA Dept. of Historic Resources — SHPO',             type: 'state', state: 'VA' },
    { key: 'VA-DOE', name: 'VA Dept. of Energy',                                type: 'state', state: 'VA' },
    /* VT */
    { key: 'VT-ENV', name: 'VT Agency of Natural Resources',                    type: 'state', state: 'VT' },
    { key: 'VT-AG',  name: 'VT Attorney General',                               type: 'state', state: 'VT' },
    { key: 'VT-SHP', name: 'VT State Historic Preservation Office',             type: 'state', state: 'VT' },
    /* WI */
    { key: 'WI-ENV', name: 'WI Dept. of Natural Resources',                     type: 'state', state: 'WI' },
    { key: 'WI-AG',  name: 'WI Attorney General',                               type: 'state', state: 'WI' },
    { key: 'WI-SHP', name: 'WI State Historic Preservation Office',             type: 'state', state: 'WI' },
    { key: 'WI-PSC', name: 'WI Public Service Commission',                      type: 'state', state: 'WI' },
    /* WV */
    { key: 'WV-ENV', name: 'WV Dept. of Environmental Protection',              type: 'state', state: 'WV' },
    { key: 'WV-AG',  name: 'WV Attorney General',                               type: 'state', state: 'WV' },
    { key: 'WV-SHP', name: 'WV State Historic Preservation Office',             type: 'state', state: 'WV' },
    { key: 'WV-DNR', name: 'WV Dept. of Natural Resources',                     type: 'state', state: 'WV' },
    /* WY */
    { key: 'WY-ENV', name: 'WY Dept. of Environmental Quality',                 type: 'state', state: 'WY' },
    { key: 'WY-AG',  name: 'WY Attorney General',                               type: 'state', state: 'WY' },
    { key: 'WY-SHP', name: 'WY State Historic Preservation Office',             type: 'state', state: 'WY' },
    { key: 'WY-SLO', name: 'WY Office of State Lands and Investments',          type: 'state', state: 'WY' },
    /* WA counties */
    { key: 'ADA',  name: 'Adams County',        type: 'county', state: 'WA' },
    { key: 'ASO',  name: 'Asotin County',       type: 'county', state: 'WA' },
    { key: 'BEN',  name: 'Benton County',       type: 'county', state: 'WA' },
    { key: 'CHE',  name: 'Chelan County',       type: 'county', state: 'WA' },
    { key: 'CLA',  name: 'Clallam County',      type: 'county', state: 'WA' },
    { key: 'CLK',  name: 'Clark County',        type: 'county', state: 'WA' },
    { key: 'COL',  name: 'Columbia County',     type: 'county', state: 'WA' },
    { key: 'COW',  name: 'Cowlitz County',      type: 'county', state: 'WA' },
    { key: 'DOU',  name: 'Douglas County',      type: 'county', state: 'WA' },
    { key: 'FER',  name: 'Ferry County',        type: 'county', state: 'WA' },
    { key: 'FRA',  name: 'Franklin County',     type: 'county', state: 'WA' },
    { key: 'GAR',  name: 'Garfield County',     type: 'county', state: 'WA' },
    { key: 'GRA',  name: 'Grant County',        type: 'county', state: 'WA' },
    { key: 'GHC',  name: 'Grays Harbor County', type: 'county', state: 'WA' },
    { key: 'ISL',  name: 'Island County',       type: 'county', state: 'WA' },
    { key: 'JEF',  name: 'Jefferson County',    type: 'county', state: 'WA' },
    { key: 'KIN',  name: 'King County',         type: 'county', state: 'WA' },
    { key: 'KIS',  name: 'Kitsap County',       type: 'county', state: 'WA' },
    { key: 'KTT',  name: 'Kittitas County',     type: 'county', state: 'WA' },
    { key: 'KLI',  name: 'Klickitat County',    type: 'county', state: 'WA' },
    { key: 'LEW',  name: 'Lewis County',        type: 'county', state: 'WA' },
    { key: 'LIN',  name: 'Lincoln County',      type: 'county', state: 'WA' },
    { key: 'MAS',  name: 'Mason County',        type: 'county', state: 'WA' },
    { key: 'OKA',  name: 'Okanogan County',     type: 'county', state: 'WA' },
    { key: 'PAC',  name: 'Pacific County',      type: 'county', state: 'WA' },
    { key: 'PEO',  name: 'Pend Oreille County', type: 'county', state: 'WA' },
    { key: 'PIE',  name: 'Pierce County',       type: 'county', state: 'WA' },
    { key: 'SJI',  name: 'San Juan County',     type: 'county', state: 'WA' },
    { key: 'SKA',  name: 'Skagit County',       type: 'county', state: 'WA' },
    { key: 'SKM',  name: 'Skamania County',     type: 'county', state: 'WA' },
    { key: 'SNO',  name: 'Snohomish County',    type: 'county', state: 'WA' },
    { key: 'SPO',  name: 'Spokane County',      type: 'county', state: 'WA' },
    { key: 'STE',  name: 'Stevens County',      type: 'county', state: 'WA' },
    { key: 'THU',  name: 'Thurston County',     type: 'county', state: 'WA' },
    { key: 'WAH',  name: 'Wahkiakum County',    type: 'county', state: 'WA' },
    { key: 'WW',   name: 'Walla Walla County',  type: 'county', state: 'WA' },
    { key: 'WHA',  name: 'Whatcom County',      type: 'county', state: 'WA' },
    { key: 'WHI',  name: 'Whitman County',      type: 'county', state: 'WA' },
    { key: 'YAK',  name: 'Yakima County',       type: 'county', state: 'WA' },
    /* WA tribes */
    { key: 'CHT',  name: 'Chehalis Tribe',                    type: 'tribe', state: 'WA' },
    { key: 'COLV', name: 'Colville Confederated Tribes',       type: 'tribe', state: 'WA' },
    { key: 'CWT',  name: 'Cowlitz Indian Tribe',               type: 'tribe', state: 'WA' },
    { key: 'CT',   name: 'CTUIR',                              type: 'tribe', state: 'WA' },
    { key: 'HOH',  name: 'Hoh Indian Tribe',                   type: 'tribe', state: 'WA' },
    { key: 'JSK',  name: "Jamestown S'Klallam Tribe",          type: 'tribe', state: 'WA' },
    { key: 'KAL',  name: 'Kalispel Tribe of Indians',          type: 'tribe', state: 'WA' },
    { key: 'LEK',  name: 'Lower Elwha Klallam Tribe',          type: 'tribe', state: 'WA' },
    { key: 'LUM',  name: 'Lummi Nation',                       type: 'tribe', state: 'WA' },
    { key: 'MAK',  name: 'Makah Tribe',                        type: 'tribe', state: 'WA' },
    { key: 'MCK',  name: 'Muckleshoot Indian Tribe',           type: 'tribe', state: 'WA' },
    { key: 'NIS',  name: 'Nisqually Indian Tribe',             type: 'tribe', state: 'WA' },
    { key: 'NOK',  name: 'Nooksack Indian Tribe',              type: 'tribe', state: 'WA' },
    { key: 'NEZ',  name: 'Nez Perce Tribe',                    type: 'tribe', state: 'WA' },
    { key: 'PGS',  name: "Port Gamble S'Klallam Tribe",        type: 'tribe', state: 'WA' },
    { key: 'PUY',  name: 'Puyallup Tribe',                     type: 'tribe', state: 'WA' },
    { key: 'QUI',  name: 'Quileute Tribe',                     type: 'tribe', state: 'WA' },
    { key: 'QUN',  name: 'Quinault Indian Nation',             type: 'tribe', state: 'WA' },
    { key: 'SAM',  name: 'Samish Indian Nation',               type: 'tribe', state: 'WA' },
    { key: 'SST',  name: 'Sauk-Suiattle Indian Tribe',         type: 'tribe', state: 'WA' },
    { key: 'SHB',  name: 'Shoalwater Bay Tribe',               type: 'tribe', state: 'WA' },
    { key: 'SKO',  name: 'Skokomish Indian Tribe',             type: 'tribe', state: 'WA' },
    { key: 'SNQ',  name: 'Snoqualmie Indian Tribe',            type: 'tribe', state: 'WA' },
    { key: 'SPT',  name: 'Spokane Tribe of Indians',           type: 'tribe', state: 'WA' },
    { key: 'SQI',  name: 'Squaxin Island Tribe',               type: 'tribe', state: 'WA' },
    { key: 'STL',  name: 'Stillaguamish Tribe',                type: 'tribe', state: 'WA' },
    { key: 'SUQ',  name: 'Suquamish Tribe',                    type: 'tribe', state: 'WA' },
    { key: 'SWI',  name: 'Swinomish Indian Tribal Community',  type: 'tribe', state: 'WA' },
    { key: 'TUL',  name: 'Tulalip Tribes',                     type: 'tribe', state: 'WA' },
    { key: 'USK',  name: 'Upper Skagit Indian Tribe',          type: 'tribe', state: 'WA' },
    { key: 'YN',   name: 'Yakama Nation',                      type: 'tribe', state: 'WA' },
    /* WA utilities */
    { key: 'BPA',    name: 'Bonneville Power Administration', type: 'utility', state: 'WA' },
    { key: 'PSE',    name: 'Puget Sound Energy',              type: 'utility', state: 'WA' },
    { key: 'GCPUD',  name: 'Grant County PUD',                type: 'utility', state: 'WA' },
    { key: 'FCPUD',  name: 'Franklin County PUD',             type: 'utility', state: 'WA' },
    { key: 'BCPUD',  name: 'Benton County PUD',               type: 'utility', state: 'WA' },
    { key: 'CHPUD',  name: 'Chelan County PUD',               type: 'utility', state: 'WA' },
    { key: 'DCPUD',  name: 'Douglas County PUD',              type: 'utility', state: 'WA' },
    { key: 'CPU',    name: 'Clark Public Utilities',          type: 'utility', state: 'WA' },
    { key: 'SCPUD',  name: 'Snohomish County PUD',            type: 'utility', state: 'WA' },
    { key: 'TPU',    name: 'Tacoma Public Utilities',         type: 'utility', state: 'WA' },
    { key: 'AVA',    name: 'Avista Utilities',                type: 'utility', state: 'WA' },
    { key: 'PPCORP', name: 'Pacific Power',                   type: 'utility', state: 'WA' }
  ];

  window.MERA = {
    RAMPS: RAMPS, rampColor: rampColor, rampText: rampText, clamp: clamp,
    GRID: { cells: cells, cols: cols, rows: rows, lonMin: lonMin, latMax: latMax, D: D },
    cellAt: cellAt, nearestCluster: nearestCluster,
    INDICATORS: INDICATORS, DEFAULT_WEIGHTS: DEFAULT_WEIGHTS, composite: composite,
    CLUSTERS: CLUSTERS, RECOMMENDED: RECOMMENDED, GATE_COUNTS: GATE_COUNTS, STATES: STATES,
    SITES: SITES, ALERTS: ALERTS, WATCHED: WATCHED, PORTFOLIO: PORTFOLIO,
    STAGES: STAGES, CASES: CASES, PARTY_NAMES: PARTY_NAMES, CASE_DETAIL: CASE_DETAIL, CASE_DETAIL_MAP: CASE_DETAIL_MAP,
    AGENCY_DIRECTORY: AGENCY_DIRECTORY,
    IMPASSES: IMPASSES, IMPASSE_UNLOCKS: IMPASSE_UNLOCKS, LITIGATION: LITIGATION, STUDIES: STUDIES,
    STATS: STATS, GRADES: GRADES, STATE_GRADE: STATE_GRADE, DATA_SOURCES: DATA_SOURCES,
    PROMISE: PROMISE, VERSION: VERSION, fbm: fbm
  };
})();
