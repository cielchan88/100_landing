/* The Restless Earth — Day 5 */
(function () {
  'use strict';

  const REFRESH_MS = 5 * 60 * 1000;
  const KNOWN_IDS_CAP = 50000;

  const STATE = {
    window: '24h',
    minMag: 2.5,
    knownIds: new Set(),
    map: null,
    markersLayer: null,
    lastFetchTime: null,
    lastFeatures: [],
    refreshTimer: null,
    firstLoad: true,
  };

  function initMap() {
    STATE.map = L.map('re-map', {
      center: [10, 0],
      zoom: 2,
      worldCopyJump: true,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 11,
      subdomains: 'abcd',
    }).addTo(STATE.map);

    L.control.zoom({ position: 'topleft' }).addTo(STATE.map);

    STATE.markersLayer = L.layerGroup().addTo(STATE.map);
  }

  function colorForDepth(depthKm) {
    if (depthKm < 10) return '#FF6B47';
    if (depthKm < 70) return '#D97757';
    if (depthKm < 300) return '#7BA7CC';
    return '#5A6FA8';
  }

  function radiusForMag(mag) {
    return Math.max(3, Math.pow(1.6, mag));
  }

  function renderQuakes(features) {
    STATE.markersLayer.clearLayers();
    const filtered = features.filter(f => (f.mag || 0) >= STATE.minMag);

    filtered.forEach(q => {
      const [lng, lat] = q.coordinates;
      const isNew = !STATE.knownIds.has(q.id);
      const className = 're-marker' + (isNew && !STATE.firstLoad ? ' re-marker-new' : '');
      const marker = L.circleMarker([lat, lng], {
        radius: radiusForMag(q.mag),
        fillColor: colorForDepth(q.depth_km),
        color: 'rgba(255,255,255,0.3)',
        weight: 1,
        fillOpacity: 0.75,
        className,
      });
      marker.bindPopup(buildPopupHtml(q));
      marker.addTo(STATE.markersLayer);
      STATE.knownIds.add(q.id);
    });

    if (STATE.knownIds.size > KNOWN_IDS_CAP) {
      const trimmed = Array.from(STATE.knownIds).slice(-Math.floor(KNOWN_IDS_CAP / 2));
      STATE.knownIds = new Set(trimmed);
    }
    return filtered.length;
  }

  function buildPopupHtml(q) {
    const ago = timeAgo(q.time_ms);
    return (
      '<div>' +
        '<div class="re-popup-mag">M' + q.mag.toFixed(1) + '</div>' +
        '<div class="re-popup-place">' + escapeHtml(q.place) + '</div>' +
        '<div class="re-popup-meta">' + q.depth_km.toFixed(0) + ' km deep · ' + ago + '</div>' +
      '</div>'
    );
  }

  function timeAgo(timeMs) {
    if (!timeMs) return '';
    const diffSec = Math.floor((Date.now() - timeMs) / 1000);
    if (diffSec < 5) return 'just now';
    if (diffSec < 60) return diffSec + 's ago';
    if (diffSec < 3600) return Math.floor(diffSec / 60) + ' min ago';
    if (diffSec < 86400) return Math.floor(diffSec / 3600) + ' h ago';
    return Math.floor(diffSec / 86400) + ' days ago';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function renderStats(summary, totalShown) {
    const countEl = document.getElementById('re-count');
    if (countEl) countEl.textContent = Number(totalShown).toLocaleString();
    const biggestEl = document.getElementById('re-biggest');
    if (biggestEl) {
      if (summary && summary.biggest) {
        const b = summary.biggest;
        biggestEl.innerHTML = '<strong>M' + b.mag.toFixed(1) + '</strong> · ' +
          escapeHtml(b.place) + ' · ' + timeAgo(b.time_ms);
      } else {
        biggestEl.textContent = 'No data';
      }
    }
    const regionEl = document.getElementById('re-region');
    if (regionEl) {
      regionEl.textContent = (summary && summary.strongest_region)
        ? 'Most active: ' + summary.strongest_region
        : '';
    }
  }

  function renderLastUpdated() {
    const el = document.getElementById('re-last-updated');
    if (!el) return;
    el.textContent = STATE.lastFetchTime ? ('Last updated ' + timeAgo(STATE.lastFetchTime)) : '';
  }

  async function fetchAndRender() {
    try {
      const url = '/day-05/restless-earth/api/quakes?window=' + encodeURIComponent(STATE.window);
      const res = await fetch(url);
      if (res.status === 429) {
        showError('Rate limit reached. Will retry shortly.');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showError(data.message || 'USGS feed unavailable. Retrying in 5 minutes.');
        return;
      }
      const data = await res.json();
      STATE.lastFetchTime = data.fetched_at_ms || Date.now();
      STATE.lastFeatures = data.features || [];
      const shown = renderQuakes(STATE.lastFeatures);
      renderStats(data.summary || {}, shown);
      renderLastUpdated();
      hideError();
      STATE.firstLoad = false;
    } catch (e) {
      showError('Network error. Retrying in 5 minutes.');
    }
  }

  function rerenderFromCache() {
    if (!STATE.lastFeatures.length) return;
    const shown = renderQuakes(STATE.lastFeatures);
    const countEl = document.getElementById('re-count');
    if (countEl) countEl.textContent = Number(shown).toLocaleString();
  }

  function showError(msg) {
    const el = document.getElementById('re-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }
  function hideError() {
    const el = document.getElementById('re-error');
    if (el) el.style.display = 'none';
  }

  function wireControls() {
    document.querySelectorAll('.re-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const win = btn.dataset.window;
        if (win === STATE.window) return;
        STATE.window = win;
        STATE.knownIds.clear();
        STATE.firstLoad = true;
        document.querySelectorAll('.re-toggle-btn').forEach(b => {
          b.dataset.active = (b.dataset.window === win) ? 'true' : 'false';
        });
        fetchAndRender();
      });
    });

    const slider = document.getElementById('re-mag-slider');
    const valueEl = document.getElementById('re-mag-value');
    if (slider && valueEl) {
      slider.addEventListener('input', () => {
        STATE.minMag = parseFloat(slider.value);
        valueEl.textContent = 'M ≥ ' + STATE.minMag.toFixed(1);
        rerenderFromCache();
      });
    }
  }

  function init() {
    if (typeof L === 'undefined') {
      console.error('Leaflet not loaded');
      return;
    }
    initMap();
    wireControls();
    fetchAndRender();
    STATE.refreshTimer = setInterval(fetchAndRender, REFRESH_MS);
    setInterval(renderLastUpdated, 30 * 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
