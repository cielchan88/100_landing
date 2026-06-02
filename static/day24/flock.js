/* Flock — Day 24. Boids, spatial hash grid, adaptive performance. */
(function () {
  'use strict';

  // ===== Module 1: Config & state =====
  const DEFAULTS = {
    boidCount: 500,
    maxSpeed: 3.2,
    maxForce: 0.08,
    visionRadius: 60,
    separationRadius: 24,
    wCohesion: 1.0,
    wSeparation: 1.4,
    wAlignment: 1.0,
    trailAlpha: 0.20,
    pointerRadiusAttract: 140,
    pointerRadiusRepel: 120,
    pointerRadiusPredator: 180,
    predatorStrength: 2.5,
    bloomEnabled: true,
    floorBoidCount: 120,
    minMobileCount: 220,
  };

  const STORAGE_KEY = 'flk_settings_v1';

  const reducedMotion = (typeof window !== 'undefined') && window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = {
    canvas: null,
    ctx: null,
    bgCanvas: null, // offscreen for cheap bloom (unused if shadowBlur path taken)
    width: 800, height: 540,
    dpr: 1,
    boids: [],
    boidCount: DEFAULTS.boidCount,
    maxSpeed: DEFAULTS.maxSpeed,
    visionRadius: DEFAULTS.visionRadius,
    wCohesion: DEFAULTS.wCohesion,
    wSeparation: DEFAULTS.wSeparation,
    wAlignment: DEFAULTS.wAlignment,
    trailAlpha: DEFAULTS.trailAlpha,
    bloomEnabled: DEFAULTS.bloomEnabled && !reducedMotion,
    mode: 'attract',
    pointer: { x: 0, y: 0, active: false },
    grid: null,
    // perf
    lastFrameTime: 0,
    frameSamples: [],
    frameCount: 0,
    perfEvaluated: false,
    perfFloorReached: false,
  };

  // ===== Module 2: Vector helpers (mutating ops to reduce GC) =====
  function len(vx, vy) { return Math.sqrt(vx * vx + vy * vy); }
  function limitMag(v, max) {
    const l = len(v.x, v.y);
    if (l > max && l > 0) { v.x = v.x / l * max; v.y = v.y / l * max; }
    return v;
  }
  function setMag(v, m) {
    const l = len(v.x, v.y);
    if (l > 0) { v.x = v.x / l * m; v.y = v.y / l * m; }
    return v;
  }

  // ===== Module 3: Spatial hash grid =====
  // Map "cx,cy" -> array of boid indices. No toroidal wrap in neighbor
  // queries: edge boids have fewer neighbors (clean and bug-free).
  const grid = {
    cellSize: DEFAULTS.visionRadius,
    cells: new Map(),
    clear() { this.cells.clear(); },
    setCellSize(s) { this.cellSize = Math.max(20, Math.min(160, s)); },
    insert(idx, x, y) {
      const cx = Math.floor(x / this.cellSize);
      const cy = Math.floor(y / this.cellSize);
      const key = cx + ',' + cy;
      let arr = this.cells.get(key);
      if (!arr) { arr = []; this.cells.set(key, arr); }
      arr.push(idx);
    },
    // visit boids in the 9 cells around (x,y)
    visit(x, y, fn) {
      const cx = Math.floor(x / this.cellSize);
      const cy = Math.floor(y / this.cellSize);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const arr = this.cells.get((cx + dx) + ',' + (cy + dy));
          if (arr) for (let k = 0; k < arr.length; k++) fn(arr[k]);
        }
      }
    },
  };

  // ===== Module 4: Seeding =====
  function seedBoids() {
    state.boids = new Array(state.boidCount);
    for (let i = 0; i < state.boidCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const sp = state.maxSpeed * (0.6 + Math.random() * 0.4);
      state.boids[i] = {
        x: Math.random() * state.width,
        y: Math.random() * state.height,
        vx: Math.cos(angle) * sp,
        vy: Math.sin(angle) * sp,
      };
    }
  }

  // ===== Module 5: Simulation step =====
  // Reused vectors to avoid GC pressure inside the hot loop.
  const _sep = { x: 0, y: 0 };
  const _ali = { x: 0, y: 0 };
  const _coh = { x: 0, y: 0 };
  const _ptr = { x: 0, y: 0 };
  const _accel = { x: 0, y: 0 };

  function step(dt) {
    const N = state.boids.length;
    if (N === 0) return;

    // Rebuild grid every frame (cheap and avoids stale references).
    grid.setCellSize(state.visionRadius);
    grid.clear();
    for (let i = 0; i < N; i++) {
      const b = state.boids[i];
      grid.insert(i, b.x, b.y);
    }

    const vis2 = state.visionRadius * state.visionRadius;
    const sep2 = DEFAULTS.separationRadius * DEFAULTS.separationRadius;
    const maxForce = DEFAULTS.maxForce;
    const maxSpeed = state.maxSpeed;
    const wC = state.wCohesion, wS = state.wSeparation, wA = state.wAlignment;
    const pointer = state.pointer;
    const mode = state.mode;

    const newVX = new Float32Array(N);
    const newVY = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      const b = state.boids[i];
      _sep.x = 0; _sep.y = 0;
      _ali.x = 0; _ali.y = 0;
      _coh.x = 0; _coh.y = 0;
      let sepN = 0, aliN = 0, cohN = 0;

      grid.visit(b.x, b.y, (j) => {
        if (j === i) return;
        const o = state.boids[j];
        const dx = o.x - b.x, dy = o.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > vis2 || d2 === 0) return;
        // cohesion: sum of neighbor positions
        _coh.x += o.x; _coh.y += o.y; cohN++;
        // alignment: sum of neighbor velocities
        _ali.x += o.vx; _ali.y += o.vy; aliN++;
        // separation: weighted by inverse distance, away from neighbor
        if (d2 < sep2) {
          const d = Math.sqrt(d2);
          _sep.x -= dx / d; _sep.y -= dy / d;
          sepN++;
        }
      });

      // Each rule: steering = desired - velocity, limited to maxForce.
      let ax = 0, ay = 0;
      if (sepN > 0) {
        _sep.x /= sepN; _sep.y /= sepN;
        setMag(_sep, maxSpeed);
        _sep.x -= b.vx; _sep.y -= b.vy;
        limitMag(_sep, maxForce);
        ax += _sep.x * wS; ay += _sep.y * wS;
      }
      if (aliN > 0) {
        _ali.x /= aliN; _ali.y /= aliN;
        setMag(_ali, maxSpeed);
        _ali.x -= b.vx; _ali.y -= b.vy;
        limitMag(_ali, maxForce);
        ax += _ali.x * wA; ay += _ali.y * wA;
      }
      if (cohN > 0) {
        _coh.x = _coh.x / cohN - b.x;
        _coh.y = _coh.y / cohN - b.y;
        setMag(_coh, maxSpeed);
        _coh.x -= b.vx; _coh.y -= b.vy;
        limitMag(_coh, maxForce);
        ax += _coh.x * wC; ay += _coh.y * wC;
      }

      // Pointer force.
      if (pointer.active) {
        const pdx = pointer.x - b.x, pdy = pointer.y - b.y;
        const pd2 = pdx * pdx + pdy * pdy;
        let r, strength = 1;
        if (mode === 'attract') { r = DEFAULTS.pointerRadiusAttract; }
        else if (mode === 'repel') { r = DEFAULTS.pointerRadiusRepel; }
        else { r = DEFAULTS.pointerRadiusPredator; strength = DEFAULTS.predatorStrength; }
        const r2 = r * r;
        if (pd2 < r2 && pd2 > 0) {
          const pd = Math.sqrt(pd2);
          const fall = 1 - pd / r; // strongest near pointer
          _ptr.x = pdx / pd; _ptr.y = pdy / pd;
          if (mode === 'attract') {
            _ptr.x *= maxSpeed; _ptr.y *= maxSpeed;
          } else {
            _ptr.x *= -maxSpeed; _ptr.y *= -maxSpeed;
          }
          _ptr.x -= b.vx; _ptr.y -= b.vy;
          limitMag(_ptr, maxForce * 4); // a bit stronger than steering cap
          ax += _ptr.x * fall * strength;
          ay += _ptr.y * fall * strength;
        }
      }

      // Integrate with dt scale.
      _accel.x = ax; _accel.y = ay;
      limitMag(_accel, maxForce * 6);

      let nvx = b.vx + _accel.x * dt;
      let nvy = b.vy + _accel.y * dt;
      const nl = len(nvx, nvy);
      if (nl > maxSpeed) { nvx = nvx / nl * maxSpeed; nvy = nvy / nl * maxSpeed; }
      // guarantee non-zero minimum to avoid stalls
      else if (nl < 0.5) {
        const a = Math.random() * Math.PI * 2;
        nvx += Math.cos(a) * 0.1; nvy += Math.sin(a) * 0.1;
      }

      newVX[i] = nvx; newVY[i] = nvy;
    }

    // Commit velocities + positions (with toroidal wrap).
    const W = state.width, H = state.height;
    for (let i = 0; i < N; i++) {
      const b = state.boids[i];
      b.vx = newVX[i]; b.vy = newVY[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < 0) b.x += W; else if (b.x >= W) b.x -= W;
      if (b.y < 0) b.y += H; else if (b.y >= H) b.y -= H;
    }
  }

  // ===== Module 6: Rendering =====
  const COLOR_LO = { r: 0x7B, g: 0xA7, b: 0xCC }; // #7BA7CC
  const COLOR_HI = { r: 0xD9, g: 0x77, b: 0x57 }; // #D97757

  function speedColor(speed, maxSpeed) {
    const t = Math.max(0, Math.min(1, speed / maxSpeed));
    const r = Math.round(COLOR_LO.r + (COLOR_HI.r - COLOR_LO.r) * t);
    const g = Math.round(COLOR_LO.g + (COLOR_HI.g - COLOR_LO.g) * t);
    const b = Math.round(COLOR_LO.b + (COLOR_HI.b - COLOR_LO.b) * t);
    return `rgb(${r},${g},${b})`;
  }

  function render() {
    const ctx = state.ctx;
    const W = state.width, H = state.height;
    // Trail: paint a near-bg rect at low alpha over the previous frame.
    ctx.fillStyle = `rgba(15, 15, 14, ${state.trailAlpha})`;
    ctx.fillRect(0, 0, W, H);

    const bloom = state.bloomEnabled;
    const maxSpeed = state.maxSpeed;

    for (let i = 0; i < state.boids.length; i++) {
      const b = state.boids[i];
      const sp = len(b.vx, b.vy);
      const color = speedColor(sp, maxSpeed);
      const angle = Math.atan2(b.vy, b.vx);

      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(angle);
      if (bloom) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      // Directional triangle pointing along +x (rotated above).
      ctx.moveTo(5, 0);
      ctx.lineTo(-3, 2.2);
      ctx.lineTo(-3, -2.2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    if (bloom) ctx.shadowBlur = 0;

    // Predator pointer indicator.
    if (state.pointer.active && state.mode === 'predator') {
      ctx.strokeStyle = 'rgba(196, 69, 105, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(state.pointer.x, state.pointer.y, DEFAULTS.pointerRadiusPredator, 0, Math.PI * 2);
      ctx.stroke();
    } else if (state.pointer.active) {
      ctx.strokeStyle = 'rgba(217, 119, 87, 0.25)';
      ctx.lineWidth = 1;
      const r = state.mode === 'attract' ? DEFAULTS.pointerRadiusAttract : DEFAULTS.pointerRadiusRepel;
      ctx.beginPath();
      ctx.arc(state.pointer.x, state.pointer.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ===== Module 7: Adaptive performance =====
  function evaluatePerf() {
    if (state.perfEvaluated || state.frameSamples.length < 60) return;
    const sum = state.frameSamples.reduce((a, b) => a + b, 0);
    const avg = sum / state.frameSamples.length;
    // Target ~16ms; act if regularly above ~22ms (below 45fps).
    if (avg > 22) {
      // Thin the flock down toward a target
      while (state.boidCount > DEFAULTS.floorBoidCount && avg > 22) {
        const step = Math.max(20, Math.floor(state.boidCount * 0.15));
        state.boidCount = Math.max(DEFAULTS.floorBoidCount, state.boidCount - step);
        state.boids.length = state.boidCount;
        // single pass — re-measure later
        break;
      }
      // If still struggling and bloom on, drop bloom next time.
      if (avg > 28 && state.bloomEnabled) {
        state.bloomEnabled = false;
      }
      // Allow one more measurement window
      state.frameSamples = [];
      state.frameCount = 0;
      if (state.boidCount <= DEFAULTS.floorBoidCount && !state.bloomEnabled) {
        state.perfEvaluated = true;
      }
    } else {
      state.perfEvaluated = true;
    }
    updatePerfBadge();
  }

  function updatePerfBadge() {
    const badge = document.getElementById('flk-perf-badge');
    if (!badge) return;
    badge.textContent = `${state.boidCount} boids${state.bloomEnabled ? '' : ' · bloom off'}`;
  }

  // ===== Module 8: Canvas sizing =====
  function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = state.canvas.getBoundingClientRect();
    state.width = Math.max(320, Math.floor(rect.width));
    state.height = Math.max(240, Math.floor(rect.height));
    state.dpr = dpr;
    state.canvas.width = Math.floor(state.width * dpr);
    state.canvas.height = Math.floor(state.height * dpr);
    state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Start with an opaque clear so the first trail frame doesn't smear from blank.
    state.ctx.fillStyle = '#0F0F0E';
    state.ctx.fillRect(0, 0, state.width, state.height);
  }

  function decideInitialCount() {
    // Heuristic: small viewport => start lower so the first second isn't wasted thinning.
    const area = window.innerWidth * window.innerHeight;
    const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (isCoarse || area < 600000) {
      state.boidCount = DEFAULTS.minMobileCount + Math.floor(Math.random() * 60);
    } else {
      state.boidCount = DEFAULTS.boidCount;
    }
  }

  // ===== Module 9: UI bindings =====
  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll('.flk-mode-btn').forEach(btn => {
      btn.setAttribute('aria-pressed', btn.dataset.mode === mode ? 'true' : 'false');
    });
    persistSettings();
  }

  function bindSlider(id, key, formatter) {
    const slider = document.getElementById(id);
    const label = document.getElementById(id + '-val');
    function update() {
      const v = parseFloat(slider.value);
      state[key] = v;
      if (key === 'wCohesion') state.wCohesion = v;
      label.textContent = formatter ? formatter(v) : v;
      persistSettings();
    }
    slider.addEventListener('input', update);
    update();
  }

  function persistSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        mode: state.mode,
        wCohesion: state.wCohesion,
        wSeparation: state.wSeparation,
        wAlignment: state.wAlignment,
        maxSpeed: state.maxSpeed,
        visionRadius: state.visionRadius,
      }));
    } catch (e) {}
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s && typeof s === 'object') {
        if (typeof s.mode === 'string' && ['attract', 'repel', 'predator'].includes(s.mode)) state.mode = s.mode;
        ['wCohesion', 'wSeparation', 'wAlignment', 'maxSpeed', 'visionRadius'].forEach(k => {
          if (typeof s[k] === 'number' && isFinite(s[k])) state[k] = s[k];
        });
      }
    } catch (e) {}
  }

  function applyLoadedToControls() {
    const map = [
      ['flk-cohesion', state.wCohesion, v => v.toFixed(2)],
      ['flk-separation', state.wSeparation, v => v.toFixed(2)],
      ['flk-alignment', state.wAlignment, v => v.toFixed(2)],
      ['flk-speed', state.maxSpeed, v => v.toFixed(2)],
      ['flk-vision', state.visionRadius, v => v.toFixed(0)],
    ];
    for (const [id, val, fmt] of map) {
      const slider = document.getElementById(id);
      const label = document.getElementById(id + '-val');
      slider.value = val;
      label.textContent = fmt(val);
    }
    setMode(state.mode);
  }

  function bindPointer() {
    const c = state.canvas;
    function toCanvas(clientX, clientY) {
      const r = c.getBoundingClientRect();
      return {
        x: (clientX - r.left) * (state.width / r.width),
        y: (clientY - r.top) * (state.height / r.height),
      };
    }
    function setActive(active, x, y) {
      state.pointer.active = active;
      if (x !== undefined) { state.pointer.x = x; state.pointer.y = y; }
    }
    c.addEventListener('mousemove', (e) => {
      const p = toCanvas(e.clientX, e.clientY);
      setActive(true, p.x, p.y);
    });
    c.addEventListener('mouseleave', () => setActive(false));
    c.addEventListener('mousedown', (e) => {
      const p = toCanvas(e.clientX, e.clientY);
      setActive(true, p.x, p.y);
    });
    c.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.touches[0]; if (!t) return;
      const p = toCanvas(t.clientX, t.clientY);
      setActive(true, p.x, p.y);
    }, { passive: false });
    c.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = e.touches[0]; if (!t) return;
      const p = toCanvas(t.clientX, t.clientY);
      setActive(true, p.x, p.y);
    }, { passive: false });
    c.addEventListener('touchend', () => setActive(false));
    c.addEventListener('touchcancel', () => setActive(false));
  }

  // ===== Capture + reset =====
  function captureMoment() {
    state.canvas.toBlob((blob) => {
      if (!blob) { showToast('Capture failed'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'flock-' + Date.now() + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('Captured');
    }, 'image/png');
  }

  function resetAll() {
    state.wCohesion = DEFAULTS.wCohesion;
    state.wSeparation = DEFAULTS.wSeparation;
    state.wAlignment = DEFAULTS.wAlignment;
    state.maxSpeed = DEFAULTS.maxSpeed;
    state.visionRadius = DEFAULTS.visionRadius;
    state.mode = 'attract';
    applyLoadedToControls();
    decideInitialCount();
    seedBoids();
    state.perfEvaluated = false;
    state.frameSamples = [];
    state.frameCount = 0;
    updatePerfBadge();
    persistSettings();
  }

  function showToast(msg) {
    const t = document.querySelector('.flk-toast');
    t.textContent = msg;
    t.classList.add('is-visible');
    setTimeout(() => t.classList.remove('is-visible'), 1600);
  }

  // ===== RAF loop =====
  function loop(ts) {
    if (state.lastFrameTime) {
      const dtMs = ts - state.lastFrameTime;
      state.frameSamples.push(dtMs);
      if (state.frameSamples.length > 120) state.frameSamples.shift();
      state.frameCount++;
      // dt scale (1.0 at 60fps), clamped to keep sim stable on long frames.
      const dt = Math.max(0.5, Math.min(2.5, dtMs / 16.667));
      step(dt);
      render();
      evaluatePerf();
    }
    state.lastFrameTime = ts;
    requestAnimationFrame(loop);
  }

  // ===== Boot =====
  function init() {
    state.canvas = document.getElementById('flk-canvas');
    if (!state.canvas) return;
    state.ctx = state.canvas.getContext('2d');

    loadSettings();

    // reducedMotion: gentler default
    if (reducedMotion) {
      state.trailAlpha = 0.4;
      state.bloomEnabled = false;
      if (state.maxSpeed > 2.5) state.maxSpeed = 2.5;
    }

    sizeCanvas();
    decideInitialCount();
    seedBoids();
    applyLoadedToControls();
    updatePerfBadge();

    bindPointer();

    document.querySelectorAll('.flk-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });
    bindSlider('flk-cohesion', 'wCohesion', v => v.toFixed(2));
    bindSlider('flk-separation', 'wSeparation', v => v.toFixed(2));
    bindSlider('flk-alignment', 'wAlignment', v => v.toFixed(2));
    bindSlider('flk-speed', 'maxSpeed', v => v.toFixed(2));
    bindSlider('flk-vision', 'visionRadius', v => v.toFixed(0));

    document.getElementById('flk-capture-btn').addEventListener('click', captureMoment);
    document.getElementById('flk-reset-btn').addEventListener('click', resetAll);

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        sizeCanvas();
      }, 150);
    });

    requestAnimationFrame(loop);
  }

  // Expose internals for headless testing without touching the global API.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      // Minimal headless harness: build a state, step many times, return final boids.
      headlessRun(opts) {
        const o = Object.assign({ N: 300, W: 800, H: 540, frames: 300, maxSpeed: 3.2 }, opts || {});
        const grid = {
          cellSize: 60, cells: new Map(),
          clear() { this.cells.clear(); },
          insert(idx, x, y) {
            const k = Math.floor(x / this.cellSize) + ',' + Math.floor(y / this.cellSize);
            let a = this.cells.get(k); if (!a) { a = []; this.cells.set(k, a); } a.push(idx);
          },
          visit(x, y, fn) {
            const cx = Math.floor(x / this.cellSize), cy = Math.floor(y / this.cellSize);
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
              const a = this.cells.get((cx + dx) + ',' + (cy + dy));
              if (a) for (let k = 0; k < a.length; k++) fn(a[k]);
            }
          },
        };
        const boids = [];
        for (let i = 0; i < o.N; i++) {
          const a = Math.random() * Math.PI * 2;
          boids.push({ x: Math.random() * o.W, y: Math.random() * o.H, vx: Math.cos(a) * o.maxSpeed, vy: Math.sin(a) * o.maxSpeed });
        }
        const wC = o.wCohesion != null ? o.wCohesion : 1.0;
        const wS = o.wSeparation != null ? o.wSeparation : 1.4;
        const wA = o.wAlignment != null ? o.wAlignment : 1.0;
        const visR = o.visionRadius || 60;
        const vis2 = visR * visR, sep2 = 24 * 24;
        const maxForce = 0.08;
        for (let f = 0; f < o.frames; f++) {
          grid.clear();
          for (let i = 0; i < boids.length; i++) grid.insert(i, boids[i].x, boids[i].y);
          const newV = new Float32Array(boids.length * 2);
          for (let i = 0; i < boids.length; i++) {
            const b = boids[i];
            let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, sn = 0, an = 0, cn = 0;
            grid.visit(b.x, b.y, (j) => {
              if (j === i) return;
              const od = boids[j];
              const dx = od.x - b.x, dy = od.y - b.y;
              const d2 = dx * dx + dy * dy;
              if (d2 > vis2 || d2 === 0) return;
              cx += od.x; cy += od.y; cn++;
              ax += od.vx; ay += od.vy; an++;
              if (d2 < sep2) {
                const d = Math.sqrt(d2);
                sx -= dx / d; sy -= dy / d; sn++;
              }
            });
            let axx = 0, ayy = 0;
            function steerToward(vx, vy, w) {
              const l = Math.hypot(vx, vy);
              if (l === 0) return;
              vx = vx / l * o.maxSpeed - b.vx;
              vy = vy / l * o.maxSpeed - b.vy;
              const m = Math.hypot(vx, vy);
              if (m > maxForce) { vx = vx / m * maxForce; vy = vy / m * maxForce; }
              axx += vx * w; ayy += vy * w;
            }
            if (sn > 0) steerToward(sx / sn, sy / sn, wS);
            if (an > 0) steerToward(ax / an, ay / an, wA);
            if (cn > 0) steerToward(cx / cn - b.x, cy / cn - b.y, wC);
            let nvx = b.vx + axx, nvy = b.vy + ayy;
            const nl = Math.hypot(nvx, nvy);
            if (nl > o.maxSpeed) { nvx = nvx / nl * o.maxSpeed; nvy = nvy / nl * o.maxSpeed; }
            newV[i * 2] = nvx; newV[i * 2 + 1] = nvy;
          }
          for (let i = 0; i < boids.length; i++) {
            const b = boids[i];
            b.vx = newV[i * 2]; b.vy = newV[i * 2 + 1];
            b.x += b.vx; b.y += b.vy;
            if (b.x < 0) b.x += o.W; else if (b.x >= o.W) b.x -= o.W;
            if (b.y < 0) b.y += o.H; else if (b.y >= o.H) b.y -= o.H;
          }
        }
        return boids;
      },
    };
  }

  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})();
