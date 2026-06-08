/* Antipodes — Day 28. */
(function () {
  'use strict';

  // ===== Config =====
  const MAP_W = 720, MAP_H = 360; // internal canvas resolution (2:1, equirectangular)
  const CITIES = [
    { name: 'Jakarta',         lat: -6.21,   lon: 106.85 },
    { name: 'New York',        lat: 40.71,   lon: -74.00 },
    { name: 'London',          lat: 51.51,   lon: -0.13 },
    { name: 'Tokyo',           lat: 35.69,   lon: 139.69 },
    { name: 'Sydney',          lat: -33.87,  lon: 151.21 },
    { name: 'Rio de Janeiro',  lat: -22.91,  lon: -43.20 },
    { name: 'Cairo',           lat: 30.04,   lon: 31.24 },
    { name: 'Buenos Aires',    lat: -34.61,  lon: -58.38 },
  ];

  // Approximate ocean naming by lat/lon bands. Order matters (poles first).
  function oceanFor(lat, lon) {
    if (lat > 66) return 'Arctic Ocean';
    if (lat < -60) return 'Southern Ocean';
    // Pacific: roughly lon ≥ 140 or lon ≤ -70
    if (lon >= 140 || lon <= -70) return 'Pacific Ocean';
    // Atlantic: roughly lon ∈ (-70, 20]
    if (lon > -70 && lon <= 20) return 'Atlantic Ocean';
    // Indian: lon ∈ (20, 140] and southern-ish
    if (lon > 20 && lon < 140) return 'Indian Ocean';
    return 'Ocean';
  }

  // ===== State =====
  const state = {
    world: null,
    here: { lat: null, lon: null },
    anti: { lat: null, lon: null },
    guessMode: false,
    awaitingGuess: false,
    guessTarget: null, // {lat, lon}
    bestScoreKm: null,
    baseMapHere: null, // offscreen canvas
    baseMapAnti: null,
  };

  // ===== Math =====
  function project(lat, lon, w, h) {
    return {
      x: (lon + 180) / 360 * w,
      y: (90 - lat) / 180 * h,
    };
  }
  function unproject(x, y, w, h) {
    return {
      lon: x / w * 360 - 180,
      lat: 90 - y / h * 180,
    };
  }
  function antipode(lat, lon) {
    let aLon = lon + 180;
    if (aLon > 180) aLon -= 360;
    else if (aLon < -180) aLon += 360;
    return { lat: -lat, lon: aLon };
  }
  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  function fmtCoord(lat, lon) {
    const ns = lat >= 0 ? 'N' : 'S';
    const ew = lon >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`;
  }

  // ===== Point-in-polygon (ray casting) =====
  // ring is array of [lon, lat]
  function pointInRing(lon, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = ((yi > lat) !== (yj > lat)) &&
        (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
  // polygon = [outerRing, hole1, hole2, ...]
  function pointInPolygon(lon, lat, polygon) {
    if (!pointInRing(lon, lat, polygon[0])) return false;
    for (let i = 1; i < polygon.length; i++) {
      if (pointInRing(lon, lat, polygon[i])) return false; // inside a hole
    }
    return true;
  }
  function countryAt(lon, lat) {
    if (!state.world) return null;
    for (const feature of state.world.features) {
      const g = feature.geometry;
      if (!g) continue;
      if (g.type === 'Polygon') {
        if (pointInPolygon(lon, lat, g.coordinates)) return feature.properties.name;
      } else if (g.type === 'MultiPolygon') {
        for (const poly of g.coordinates) {
          if (pointInPolygon(lon, lat, poly)) return feature.properties.name;
        }
      }
    }
    return null;
  }

  // ===== Rendering =====
  function makeBaseMap() {
    const c = document.createElement('canvas');
    c.width = MAP_W; c.height = MAP_H;
    const ctx = c.getContext('2d');
    // Ocean background
    ctx.fillStyle = '#0E1B26';
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    // Equator and prime meridian (subtle)
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, MAP_H / 2); ctx.lineTo(MAP_W, MAP_H / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(MAP_W / 2, 0); ctx.lineTo(MAP_W / 2, MAP_H); ctx.stroke();
    // Countries (fill)
    ctx.fillStyle = '#3A4A4F';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.5;
    for (const f of state.world.features) {
      const g = f.geometry;
      if (!g) continue;
      if (g.type === 'Polygon') drawPolygon(ctx, g.coordinates);
      else if (g.type === 'MultiPolygon') for (const poly of g.coordinates) drawPolygon(ctx, poly);
    }
    return c;
  }
  function drawPolygon(ctx, polygon) {
    // polygon = [outerRing, hole1, ...]. Even-odd fill auto-handles holes.
    ctx.beginPath();
    for (const ring of polygon) {
      for (let i = 0; i < ring.length; i++) {
        const [lon, lat] = ring[i];
        const { x, y } = project(lat, lon, MAP_W, MAP_H);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
    ctx.fill('evenodd');
    ctx.stroke();
  }

  function renderMap(canvasId, base, marker, isAntipode) {
    const c = document.getElementById(canvasId);
    if (c.width !== MAP_W) { c.width = MAP_W; c.height = MAP_H; }
    const ctx = c.getContext('2d');
    ctx.drawImage(base, 0, 0);
    if (marker && isFinite(marker.lat) && isFinite(marker.lon)) {
      const p = project(marker.lat, marker.lon, MAP_W, MAP_H);
      drawMarker(ctx, p.x, p.y, isAntipode ? '#7BA7CC' : '#D97757');
    }
    // In game mode awaiting guess, draw a faint "target" hint? No — that'd give it away.
  }
  function drawMarker(ctx, x, y, color) {
    // Outer ring
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke();
    // Inner dot
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    // Crosshair tick (top)
    ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x, y - 18); ctx.stroke();
  }

  // ===== Interaction =====
  function clientToLatLon(canvas, clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const x = (clientX - r.left) / r.width * MAP_W;
    const y = (clientY - r.top) / r.height * MAP_H;
    return unproject(x, y, MAP_W, MAP_H);
  }

  function setHere(lat, lon, fromGameMode) {
    state.here.lat = lat;
    state.here.lon = lon;
    const a = antipode(lat, lon);
    state.anti.lat = a.lat;
    state.anti.lon = a.lon;

    if (state.guessMode && !fromGameMode) {
      // Entering a guess round: hide the antipode marker until guess submitted.
      state.guessTarget = a;
      state.awaitingGuess = true;
      // Render here marker only; antipode map shows no marker.
      renderMap('ap-map-here', state.baseMapHere, state.here, false);
      renderMap('ap-map-anti', state.baseMapAnti, null, true);
      updateReadoutForGuess(lat, lon);
    } else {
      renderMap('ap-map-here', state.baseMapHere, state.here, false);
      renderMap('ap-map-anti', state.baseMapAnti, state.anti, true);
      updateReadout(lat, lon, a.lat, a.lon);
    }
  }

  function submitGuess(gLat, gLon) {
    if (!state.awaitingGuess || !state.guessTarget) return;
    const t = state.guessTarget;
    const km = haversineKm(gLat, gLon, t.lat, t.lon);
    state.awaitingGuess = false;
    // Reveal: show true antipode + guess marker; render true on antipode map.
    const c = document.getElementById('ap-map-anti');
    const ctx = c.getContext('2d');
    ctx.drawImage(state.baseMapAnti, 0, 0);
    // True antipode
    const pt = project(t.lat, t.lon, MAP_W, MAP_H);
    drawMarker(ctx, pt.x, pt.y, '#7BA7CC');
    // Guess
    const pg = project(gLat, gLon, MAP_W, MAP_H);
    drawMarker(ctx, pg.x, pg.y, '#E8916F');
    // Line between
    ctx.strokeStyle = 'rgba(232,145,111,0.7)';
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(pg.x, pg.y); ctx.stroke();
    ctx.setLineDash([]);

    // Update best
    if (state.bestScoreKm === null || km < state.bestScoreKm) {
      state.bestScoreKm = km;
      try { localStorage.setItem('ap_best_km', String(km)); } catch (e) {}
    }
    updateReadoutForGuessResult(km, t.lat, t.lon);
    updateGameStatus();
  }

  function updateReadout(hLat, hLon, aLat, aLon) {
    document.getElementById('ap-here-coord').textContent = fmtCoord(hLat, hLon);
    document.getElementById('ap-anti-coord').textContent = fmtCoord(aLat, aLon);
    const country = countryAt(aLon, aLat);
    const what = country ? `<strong>${escapeHTML(country)}</strong>` : `<strong>${oceanFor(aLat, aLon)}</strong>`;
    const whatEl = document.getElementById('ap-readout-what');
    whatEl.innerHTML = `What's there: ${what}`;
    // Fun fact
    const hereCountry = countryAt(hLon, hLat);
    let fun = '';
    if (country && hereCountry) {
      fun = `Rare! Land on both sides — you'd surface in ${country}, having started in ${hereCountry}.`;
    } else if (country) {
      fun = `You'd surface on land — most antipodes don't.`;
    } else if (hereCountry) {
      fun = `Like most land on Earth, this one comes out in open water.`;
    } else {
      fun = `Both sides are ocean — true of most random tap pairs.`;
    }
    document.getElementById('ap-readout-fun').textContent = fun;
  }
  function updateReadoutForGuess(hLat, hLon) {
    document.getElementById('ap-here-coord').textContent = fmtCoord(hLat, hLon);
    document.getElementById('ap-anti-coord').textContent = '— guess it —';
    document.getElementById('ap-readout-what').innerHTML = `Tap the antipode map to place your guess.`;
    document.getElementById('ap-readout-fun').textContent = '';
  }
  function updateReadoutForGuessResult(km, aLat, aLon) {
    document.getElementById('ap-anti-coord').textContent = fmtCoord(aLat, aLon);
    const country = countryAt(aLon, aLat);
    const what = country ? `<strong>${escapeHTML(country)}</strong>` : `<strong>${oceanFor(aLat, aLon)}</strong>`;
    document.getElementById('ap-readout-what').innerHTML =
      `You were <strong>${Math.round(km).toLocaleString()} km</strong> off. The true antipode: ${what}.`;
    document.getElementById('ap-readout-fun').textContent =
      km < 500 ? 'Sharp eye.' :
      km < 2000 ? 'Solid guess.' :
      km < 6000 ? 'Halfway there.' : 'Worth another go.';
  }
  function updateGameStatus() {
    const el = document.getElementById('ap-game-status');
    if (state.bestScoreKm === null) { el.innerHTML = ''; return; }
    el.innerHTML = `Best: <strong>${Math.round(state.bestScoreKm).toLocaleString()} km</strong>`;
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ===== Boot =====
  async function init() {
    // Load world
    try {
      const resp = await fetch('/static/day28/world.geojson');
      if (!resp.ok) throw new Error('world fetch ' + resp.status);
      state.world = await resp.json();
    } catch (e) {
      document.getElementById('ap-readout-what').textContent = 'Could not load world map.';
      return;
    }

    // Render base maps once
    state.baseMapHere = makeBaseMap();
    state.baseMapAnti = makeBaseMap();
    renderMap('ap-map-here', state.baseMapHere, null, false);
    renderMap('ap-map-anti', state.baseMapAnti, null, true);

    // City chips
    const row = document.getElementById('ap-cities-row');
    for (const c of CITIES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ap-city-chip';
      b.textContent = c.name;
      b.addEventListener('click', () => setHere(c.lat, c.lon, false));
      row.appendChild(b);
    }

    // Tap handlers
    function bindMap(side) {
      const c = document.getElementById(side === 'here' ? 'ap-map-here' : 'ap-map-anti');
      function onTap(clientX, clientY) {
        const p = clientToLatLon(c, clientX, clientY);
        if (side === 'here') {
          setHere(p.lat, p.lon, false);
        } else {
          if (state.guessMode && state.awaitingGuess) {
            submitGuess(p.lat, p.lon);
          } else {
            // Tapping antipode map directly = treat as setting here to its antipode
            const inv = antipode(p.lat, p.lon);
            setHere(inv.lat, inv.lon, false);
          }
        }
      }
      c.addEventListener('click', (e) => onTap(e.clientX, e.clientY));
      c.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const t = e.changedTouches[0]; if (t) onTap(t.clientX, t.clientY);
      }, { passive: false });
    }
    bindMap('here');
    bindMap('anti');

    // Game toggle
    const gToggle = document.getElementById('ap-game-toggle');
    gToggle.addEventListener('change', () => {
      state.guessMode = gToggle.checked;
      state.awaitingGuess = false;
      state.guessTarget = null;
      // Reset to a clean state — pick the prior here as a guess prompt
      if (state.here.lat != null) setHere(state.here.lat, state.here.lon, false);
    });

    // Load best
    try {
      const best = parseFloat(localStorage.getItem('ap_best_km'));
      if (isFinite(best)) { state.bestScoreKm = best; updateGameStatus(); }
    } catch (e) {}

    // Default starting tap — Jakarta (the project's locale)
    setHere(CITIES[0].lat, CITIES[0].lon, false);
  }

  // Expose for headless testing
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { antipode, haversineKm, pointInRing, pointInPolygon, project, unproject };
  }

  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})();
