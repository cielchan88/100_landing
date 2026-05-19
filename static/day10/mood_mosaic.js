/* Mood Mosaic — Day 10 */
(function () {
  'use strict';

  // ===== Module 1: Constants & palette =====
  const STORAGE_KEY = 'mm_mode';
  const DEFAULT_MODE = 1;
  const TOTAL_MODES = 3;

  const REDUCED_MOTION =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const DAYS_PALETTE = [
    { day: 1, slug: 'play',                title: 'Scrabble',
      tagline: 'A clean, fast Scrabble training board.',
      url: '/days/day-01/play',
      primary: '#D97757', accents: ['#FAFAF7', '#1A1816', '#A8A29E'] },
    { day: 2, slug: 'title-doctor',        title: 'Title Doctor',
      tagline: 'Five strategies, brutal scoring.',
      url: '/day-02/title-doctor',
      primary: '#E8916F', accents: ['#D97757', '#FAFAF7', '#7BA7CC'] },
    { day: 3, slug: 'color-heist',         title: 'Color Heist',
      tagline: 'Steal a palette from any URL, image, or color.',
      url: '/day-03/color-heist',
      primary: '#9B59B6', accents: ['#3498DB', '#E74C3C', '#F39C12', '#1ABC9C'] },
    { day: 4, slug: 'reasoning-reps',      title: 'Reasoning Reps',
      tagline: "Five minutes of un-AI'd thinking, daily.",
      url: '/day-04/reasoning-reps',
      primary: '#7BA7CC', accents: ['#D97757', '#FAFAF7', '#5A6FA8'] },
    { day: 5, slug: 'restless-earth',      title: 'The Restless Earth',
      tagline: 'Every earthquake on Earth, in real time.',
      url: '/day-05/restless-earth',
      primary: '#FF6B47', accents: ['#D97757', '#7BA7CC', '#5A6FA8', '#0F0F0E'] },
    { day: 6, slug: 'shape-of-a-scam',     title: 'The Shape of a Scam',
      tagline: 'The math behind three income structures.',
      url: '/day-06/shape-of-a-scam',
      primary: '#C44569', accents: ['#D97757', '#FAFAF7', '#574B90'] },
    { day: 7, slug: 'distraction-inventory', title: 'Distraction Inventory',
      tagline: 'What you avoid, and what you turn to.',
      url: '/day-07/distraction-inventory',
      primary: '#5A6FA8', accents: ['#7BA7CC', '#D97757', '#FAFAF7'] },
    { day: 8, slug: 'snake',               title: 'Snake',
      tagline: 'An old game, made with care.',
      url: '/day-08/snake',
      primary: '#2ECC71', accents: ['#27AE60', '#FAFAF7', '#D97757'] },
    { day: 9, slug: 'read-time',           title: 'Read Time',
      tagline: 'How long it takes to read what you wrote.',
      url: '/day-09/read-time',
      primary: '#D97757', accents: ['#FAFAF7', '#A8A29E', '#1A1816'] },
  ];

  const REGIONS = [
    { day: 1, x: 0,    y: 0,   w: 400, h: 360 },
    { day: 2, x: 400,  y: 0,   w: 400, h: 360 },
    { day: 3, x: 800,  y: 0,   w: 400, h: 360 },
    { day: 4, x: 0,    y: 360, w: 180, h: 280 },
    { day: 5, x: 180,  y: 360, w: 520, h: 280 },
    { day: 6, x: 700,  y: 360, w: 220, h: 280 },
    { day: 7, x: 920,  y: 360, w: 280, h: 280 },
    { day: 8, x: 0,    y: 640, w: 500, h: 260 },
    { day: 9, x: 500,  y: 640, w: 700, h: 260 },
  ];

  // ===== Module 2: DOM refs =====
  const svg = document.getElementById('mm-svg');
  const defs = document.getElementById('mm-defs');
  const regionsG = document.getElementById('mm-regions');
  const canvas = document.getElementById('mm-canvas');
  const ctx = canvas.getContext('2d');
  const card = document.getElementById('mm-card');
  const stage = document.getElementById('mm-stage');

  // ===== Module 3: State =====
  let currentMode = parseInt(localStorage.getItem(STORAGE_KEY) || DEFAULT_MODE, 10);
  if (![1, 2, 3].includes(currentMode)) currentMode = DEFAULT_MODE;

  let particles = [];
  let particleAnimationActive = false;
  let hoveredDay = null;
  let cardDismissTimer = null;

  // ===== Module 4: Helpers =====
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function findPalette(day) {
    return DAYS_PALETTE.find(p => p.day === day);
  }
  function clearChildren(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  // ===== Module 5: Mode 1 — Soft fields =====
  function renderMode1() {
    clearChildren(defs);
    clearChildren(regionsG);

    const filter = document.createElementNS(SVG_NS, 'filter');
    filter.setAttribute('id', 'mm-blur');
    filter.setAttribute('x', '-20%');
    filter.setAttribute('y', '-20%');
    filter.setAttribute('width', '140%');
    filter.setAttribute('height', '140%');
    const blur = document.createElementNS(SVG_NS, 'feGaussianBlur');
    blur.setAttribute('stdDeviation', '32');
    filter.appendChild(blur);
    defs.appendChild(filter);

    REGIONS.forEach(r => {
      const palette = findPalette(r.day);
      const grad = createRadialGradient(r, palette);
      defs.appendChild(grad);

      const overdraw = 60;
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', r.x - overdraw);
      rect.setAttribute('y', r.y - overdraw);
      rect.setAttribute('width', r.w + overdraw * 2);
      rect.setAttribute('height', r.h + overdraw * 2);
      rect.setAttribute('fill', 'url(#mm-grad-' + r.day + ')');
      rect.setAttribute('filter', 'url(#mm-blur)');
      rect.dataset.day = r.day;
      rect.classList.add('mm-region');
      regionsG.appendChild(rect);
    });
  }

  function createRadialGradient(region, palette) {
    const grad = document.createElementNS(SVG_NS, 'radialGradient');
    grad.setAttribute('id', 'mm-grad-' + region.day);
    grad.setAttribute('cx', '50%');
    grad.setAttribute('cy', '50%');
    grad.setAttribute('r', '70%');
    const stop1 = document.createElementNS(SVG_NS, 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', palette.primary);
    stop1.setAttribute('stop-opacity', '1');
    grad.appendChild(stop1);
    const accent = palette.accents[0] || palette.primary;
    const stop2 = document.createElementNS(SVG_NS, 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', accent);
    stop2.setAttribute('stop-opacity', '0.88');
    grad.appendChild(stop2);
    return grad;
  }

  // ===== Module 6: Mode 2 — Architectural =====
  function renderMode2() {
    clearChildren(defs);
    clearChildren(regionsG);

    REGIONS.forEach(r => {
      const palette = findPalette(r.day);
      const grad = createLinearGradient(r, palette);
      defs.appendChild(grad);

      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', r.x);
      rect.setAttribute('y', r.y);
      rect.setAttribute('width', r.w);
      rect.setAttribute('height', r.h);
      rect.setAttribute('fill', 'url(#mm-grad-' + r.day + ')');
      rect.setAttribute('stroke', 'rgba(15,15,14,0.7)');
      rect.setAttribute('stroke-width', '2');
      rect.dataset.day = r.day;
      rect.classList.add('mm-region');
      regionsG.appendChild(rect);
    });
  }

  function createLinearGradient(region, palette) {
    const grad = document.createElementNS(SVG_NS, 'linearGradient');
    grad.setAttribute('id', 'mm-grad-' + region.day);
    grad.setAttribute('x1', '0%'); grad.setAttribute('y1', '0%');
    grad.setAttribute('x2', '0%'); grad.setAttribute('y2', '100%');
    const stop1 = document.createElementNS(SVG_NS, 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', palette.primary);
    stop1.setAttribute('stop-opacity', '1');
    grad.appendChild(stop1);
    const accent = palette.accents[0] || palette.primary;
    const stop2 = document.createElementNS(SVG_NS, 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', accent);
    stop2.setAttribute('stop-opacity', '0.95');
    grad.appendChild(stop2);
    return grad;
  }

  // ===== Module 7: Mode 3 — Particles =====
  const PARTICLE_COUNT_PER_REGION = 55;
  const PARTICLE_BASE_RADIUS = 4;
  const PARTICLE_DRIFT_SPEED = 0.28;

  function initParticles() {
    particles = [];
    REGIONS.forEach(r => {
      const palette = findPalette(r.day);
      const colors = [palette.primary].concat(palette.accents);
      for (let i = 0; i < PARTICLE_COUNT_PER_REGION; i++) {
        particles.push({
          regionDay: r.day,
          x: r.x + Math.random() * r.w,
          y: r.y + Math.random() * r.h,
          vx: REDUCED_MOTION ? 0 : (Math.random() - 0.5) * PARTICLE_DRIFT_SPEED,
          vy: REDUCED_MOTION ? 0 : (Math.random() - 0.5) * PARTICLE_DRIFT_SPEED,
          radius: PARTICLE_BASE_RADIUS + Math.random() * 5,
          color: colors[Math.floor(Math.random() * colors.length)],
          bounds: r,
          alpha: 0.45 + Math.random() * 0.45,
        });
      }
    });
  }

  function tickParticles() {
    if (REDUCED_MOTION) return;
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      const b = p.bounds;
      if (p.x < b.x)         { p.x = b.x;         p.vx = Math.abs(p.vx); }
      if (p.x > b.x + b.w)   { p.x = b.x + b.w;   p.vx = -Math.abs(p.vx); }
      if (p.y < b.y)         { p.y = b.y;         p.vy = Math.abs(p.vy); }
      if (p.y > b.y + b.h)   { p.y = b.y + b.h;   p.vy = -Math.abs(p.vy); }
    }
  }

  function renderParticles(hoveredDayLocal) {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    const scale = Math.max(w / 1200, h / 900);
    const offsetX = (w - 1200 * scale) / 2;
    const offsetY = (h - 900 * scale) / 2;

    for (const p of particles) {
      let alpha = p.alpha;
      if (hoveredDayLocal !== null) {
        alpha = (p.regionDay === hoveredDayLocal)
          ? Math.min(1, p.alpha + 0.25)
          : p.alpha * 0.4;
      }
      ctx.beginPath();
      const cx = p.x * scale + offsetX;
      const cy = p.y * scale + offsetY;
      const r = p.radius * scale * 0.9;
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function startParticleAnimation() {
    particleAnimationActive = true;
    function loop() {
      if (!particleAnimationActive || currentMode !== 3) {
        particleAnimationActive = false;
        return;
      }
      tickParticles();
      renderParticles(hoveredDay);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  // ===== Module 8: Card =====
  function showCard(day, x, y) {
    const palette = findPalette(day);
    if (!palette) return;
    card.querySelector('.mm-card-day').textContent = 'Day ' + String(day).padStart(2, '0');
    card.querySelector('.mm-card-title').textContent = palette.title;
    card.querySelector('.mm-card-tagline').textContent = palette.tagline;
    const link = card.querySelector('.mm-card-link');
    link.href = palette.url;

    if (window.innerWidth > 640 && typeof x === 'number') {
      const margin = 20;
      const cardW = 300;
      const cardH = 140;
      let left = x + margin;
      let top = y + margin;
      if (left + cardW > window.innerWidth - 12) left = x - cardW - margin;
      if (top + cardH > window.innerHeight - 12) top = y - cardH - margin;
      card.style.left = Math.max(12, left) + 'px';
      card.style.top = Math.max(12, top) + 'px';
    } else {
      card.style.left = '';
      card.style.top = '';
    }
    card.classList.remove('mm-card-hidden');
  }

  function hideCard() {
    card.classList.add('mm-card-hidden');
  }

  function highlightRegion(day) {
    document.querySelectorAll('.mm-region').forEach(el => {
      const elDay = parseInt(el.dataset.day, 10);
      if (elDay === day) {
        el.style.opacity = '1';
        el.style.filter = 'brightness(1.12)';
      } else {
        el.style.opacity = '0.78';
        el.style.filter = 'brightness(0.85)';
      }
    });
  }
  function clearHighlight() {
    document.querySelectorAll('.mm-region').forEach(el => {
      el.style.opacity = '';
      el.style.filter = '';
    });
  }

  // ===== Module 9: Mode cycling =====
  function setMode(mode) {
    currentMode = mode;
    try { localStorage.setItem(STORAGE_KEY, String(mode)); } catch (_) {}

    document.querySelectorAll('.mm-mode-dots span').forEach(d => {
      d.classList.toggle('is-active', parseInt(d.dataset.mode, 10) === mode);
    });

    const labels = ['soft', 'architectural', 'particles'];
    const captionEl = document.querySelector('.mm-mode-caption');
    if (captionEl) {
      captionEl.innerHTML = labels
        .map((l, i) => (i + 1 === mode ? '<strong>' + l + '</strong>' : l))
        .join(' · ');
    }

    if (mode === 3) {
      svg.classList.add('mm-canvas-hidden');
      canvas.classList.remove('mm-canvas-hidden');
      if (!particleAnimationActive) startParticleAnimation();
      else renderParticles(hoveredDay);
    } else {
      svg.classList.remove('mm-canvas-hidden');
      canvas.classList.add('mm-canvas-hidden');
      particleAnimationActive = false;
      if (mode === 1) renderMode1();
      else if (mode === 2) renderMode2();
      attachRegionHoverHandlers();
    }
    hideCard();
    clearHighlight();
  }

  function cycleMode() {
    setMode((currentMode % TOTAL_MODES) + 1);
  }

  // ===== Module 10: Event wiring =====
  function detectRegionFromCanvas(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    const scale = Math.max(w / 1200, h / 900);
    const offsetX = (w - 1200 * scale) / 2;
    const offsetY = (h - 900 * scale) / 2;
    const vx = (clientX - rect.left - offsetX) / scale;
    const vy = (clientY - rect.top - offsetY) / scale;
    return REGIONS.find(r => vx >= r.x && vx <= r.x + r.w && vy >= r.y && vy <= r.y + r.h);
  }

  function attachRegionHoverHandlers() {
    document.querySelectorAll('.mm-region').forEach(el => {
      el.addEventListener('mouseenter', onRegionEnter);
      el.addEventListener('mousemove', onRegionMove);
      el.addEventListener('mouseleave', onRegionLeave);
    });
  }
  function onRegionEnter(e) {
    const day = parseInt(e.currentTarget.dataset.day, 10);
    hoveredDay = day;
    showCard(day, e.clientX, e.clientY);
    highlightRegion(day);
  }
  function onRegionMove(e) {
    if (window.innerWidth > 640) {
      const day = parseInt(e.currentTarget.dataset.day, 10);
      showCard(day, e.clientX, e.clientY);
    }
  }
  function onRegionLeave() {
    hoveredDay = null;
    hideCard();
    clearHighlight();
  }

  function setupStageClick() {
    stage.addEventListener('click', (e) => {
      if (e.target.closest('.mm-card')) return;
      cycleMode();
    });
  }

  function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        cycleMode();
      }
    });
  }

  function setupCanvasHover() {
    canvas.addEventListener('mousemove', (e) => {
      if (currentMode !== 3) return;
      const region = detectRegionFromCanvas(e.clientX, e.clientY);
      if (region) {
        hoveredDay = region.day;
        showCard(region.day, e.clientX, e.clientY);
      } else {
        hoveredDay = null;
        hideCard();
      }
    });
    canvas.addEventListener('mouseleave', () => {
      hoveredDay = null;
      hideCard();
    });
  }

  function setupTouchHandlers() {
    if (!('ontouchstart' in window) && !navigator.maxTouchPoints) return;

    stage.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];

      let region = null;
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      if (target && target.classList && target.classList.contains('mm-region')) {
        region = REGIONS.find(r => r.day === parseInt(target.dataset.day, 10));
      } else if (currentMode === 3) {
        region = detectRegionFromCanvas(touch.clientX, touch.clientY);
      }

      if (region) {
        hoveredDay = region.day;
        if (currentMode !== 3) highlightRegion(region.day);
        showCard(region.day);
        if (cardDismissTimer) clearTimeout(cardDismissTimer);
        cardDismissTimer = setTimeout(() => {
          hoveredDay = null;
          hideCard();
          clearHighlight();
        }, 4000);
        e.preventDefault();
      } else {
        cycleMode();
      }
    }, { passive: false });
  }

  // ===== Module 11: Canvas sizing =====
  function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ===== Module 12: Boot =====
  function init() {
    setupCanvas();
    initParticles();
    setMode(currentMode);
    setupStageClick();
    setupKeyboard();
    setupCanvasHover();
    setupTouchHandlers();

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        setupCanvas();
        initParticles();
      }, 120);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
