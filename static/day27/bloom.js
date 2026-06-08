/* Bloom — Day 27. Gray-Scott reaction-diffusion. */
(function () {
  'use strict';

  // ===== Config =====
  const CFG = {
    Da: 1.0, Db: 0.5, dt: 1.0,
    initialSimW: 220, initialSimH: 220,
    minSimW: 140, minSimH: 140,
    initialStepsPerFrame: 8,
    brushRadiusSim: 6,
    perfWindow: 60,
  };

  const PRESETS = [
    { id: 'spots',   name: 'Spots',   f: 0.035,  k: 0.065 },
    { id: 'stripes', name: 'Stripes', f: 0.030,  k: 0.060 },
    { id: 'coral',   name: 'Coral',   f: 0.0545, k: 0.062 },
    { id: 'maze',    name: 'Maze',    f: 0.029,  k: 0.057 },
    { id: 'mitosis', name: 'Mitosis', f: 0.0367, k: 0.0649 },
    { id: 'worms',   name: 'Worms',   f: 0.046,  k: 0.063 },
  ];

  // Palettes: map value 0..1 to RGB.
  const PALETTES = {
    ember: (v) => {
      // Dark -> accent orange -> bright orange/cream
      const t = Math.max(0, Math.min(1, v));
      const r = Math.round(15 + t * (255 - 15));
      const g = Math.round(15 + t * t * (180 - 15));
      const b = Math.round(14 + t * t * t * (110 - 14));
      return [r, g, b];
    },
    ocean: (v) => {
      const t = Math.max(0, Math.min(1, v));
      const r = Math.round(8 + t * t * 50);
      const g = Math.round(20 + t * (160 - 20));
      const b = Math.round(30 + t * (230 - 30));
      return [r, g, b];
    },
    mono: (v) => {
      const t = Math.max(0, Math.min(1, v));
      const g = Math.round(20 + t * (235 - 20));
      return [g, g, g];
    },
    biolum: (v) => {
      // Dark teal -> bright cyan/green glow
      const t = Math.max(0, Math.min(1, v));
      const r = Math.round(5 + t * t * 90);
      const g = Math.round(15 + t * (235 - 15));
      const b = Math.round(20 + t * (200 - 20));
      return [r, g, b];
    },
  };

  // ===== State =====
  const state = {
    canvas: null, ctx: null,
    simCanvas: null, simCtx: null, // offscreen sim-sized canvas
    simImage: null,
    simW: CFG.initialSimW, simH: CFG.initialSimH,
    a: null, b: null, aNext: null, bNext: null,
    f: 0.0545, k: 0.062,
    stepsPerFrame: CFG.initialStepsPerFrame,
    palette: 'ember',
    paused: false,
    pointer: { active: false, x: 0, y: 0 },
    perfSamples: [],
    perfEvaluated: false,
    lastTime: 0,
    raf: 0,
  };

  // ===== Init buffers =====
  function allocate(simW, simH) {
    const N = simW * simH;
    state.a = new Float32Array(N);
    state.b = new Float32Array(N);
    state.aNext = new Float32Array(N);
    state.bNext = new Float32Array(N);
    for (let i = 0; i < N; i++) { state.a[i] = 1; state.b[i] = 0; }
  }

  function seedRandomBlobs(count) {
    const W = state.simW, H = state.simH;
    for (let i = 0; i < count; i++) {
      const cx = Math.floor(Math.random() * W);
      const cy = Math.floor(Math.random() * H);
      const r = 8 + Math.floor(Math.random() * 8);
      paintSeed(cx, cy, r);
    }
  }

  function paintSeed(cx, cy, radius) {
    const W = state.simW, H = state.simH;
    const r2 = radius * radius;
    const x0 = Math.max(0, cx - radius), x1 = Math.min(W - 1, cx + radius);
    const y0 = Math.max(0, cy - radius), y1 = Math.min(H - 1, cy + radius);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r2) {
          const i = y * W + x;
          state.b[i] = 1.0;
          state.a[i] = 0.3;
        }
      }
    }
  }

  function clearField() {
    const N = state.simW * state.simH;
    for (let i = 0; i < N; i++) { state.a[i] = 1; state.b[i] = 0; }
  }

  // ===== Simulation step =====
  // Discrete Laplacian kernel: center -1, orthogonal 0.2 (×4), diagonal 0.05 (×4). Sum = 0.
  function step() {
    const W = state.simW, H = state.simH;
    const a = state.a, b = state.b, aN = state.aNext, bN = state.bNext;
    const Da = CFG.Da, Db = CFG.Db, dt = CFG.dt, f = state.f, k = state.k;

    for (let y = 0; y < H; y++) {
      const ym = (y === 0 ? H - 1 : y - 1) * W;
      const yp = (y === H - 1 ? 0 : y + 1) * W;
      const yy = y * W;
      for (let x = 0; x < W; x++) {
        const xm = x === 0 ? W - 1 : x - 1;
        const xp = x === W - 1 ? 0 : x + 1;
        const i = yy + x;
        // Laplacian — typed array indexing is fast; inline the kernel.
        const la =
          a[i] * -1 +
          (a[yy + xm] + a[yy + xp] + a[ym + x] + a[yp + x]) * 0.2 +
          (a[ym + xm] + a[ym + xp] + a[yp + xm] + a[yp + xp]) * 0.05;
        const lb =
          b[i] * -1 +
          (b[yy + xm] + b[yy + xp] + b[ym + x] + b[yp + x]) * 0.2 +
          (b[ym + xm] + b[ym + xp] + b[yp + xm] + b[yp + xp]) * 0.05;
        const ai = a[i], bi = b[i];
        const reaction = ai * bi * bi;
        aN[i] = ai + (Da * la - reaction + f * (1 - ai)) * dt;
        bN[i] = bi + (Db * lb + reaction - (k + f) * bi) * dt;
      }
    }
    // Swap buffers.
    state.a = aN; state.aNext = a;
    state.b = bN; state.bNext = b;
  }

  // ===== Render =====
  function render() {
    const W = state.simW, H = state.simH;
    const data = state.simImage.data;
    const b = state.b;
    const pal = PALETTES[state.palette];
    // Map b in [0, ~1] to color. Values typically span 0..0.6 in a settled field;
    // boost a bit so the palette uses its range.
    for (let i = 0; i < W * H; i++) {
      const v = Math.min(1, b[i] * 2.2);
      const c = pal(v);
      const j = i * 4;
      data[j] = c[0]; data[j + 1] = c[1]; data[j + 2] = c[2]; data[j + 3] = 255;
    }
    state.simCtx.putImageData(state.simImage, 0, 0);
    // Draw scaled to display canvas.
    const dw = state.canvas.width, dh = state.canvas.height;
    state.ctx.imageSmoothingEnabled = true;
    state.ctx.drawImage(state.simCanvas, 0, 0, W, H, 0, 0, dw, dh);
  }

  // ===== Painting (pointer/touch) =====
  function clientToSim(clientX, clientY) {
    const r = state.canvas.getBoundingClientRect();
    const sx = (clientX - r.left) / r.width * state.simW;
    const sy = (clientY - r.top) / r.height * state.simH;
    return { x: Math.floor(sx), y: Math.floor(sy) };
  }

  function bindPointer() {
    const c = state.canvas;
    function setPaint(clientX, clientY) {
      const p = clientToSim(clientX, clientY);
      state.pointer.x = p.x; state.pointer.y = p.y;
      paintSeed(p.x, p.y, CFG.brushRadiusSim);
    }
    c.addEventListener('mousedown', (e) => { state.pointer.active = true; setPaint(e.clientX, e.clientY); });
    c.addEventListener('mousemove', (e) => { if (state.pointer.active) setPaint(e.clientX, e.clientY); });
    window.addEventListener('mouseup', () => { state.pointer.active = false; });
    c.addEventListener('touchstart', (e) => {
      e.preventDefault(); state.pointer.active = true;
      const t = e.touches[0]; if (t) setPaint(t.clientX, t.clientY);
    }, { passive: false });
    c.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = e.touches[0]; if (t && state.pointer.active) setPaint(t.clientX, t.clientY);
    }, { passive: false });
    c.addEventListener('touchend', () => { state.pointer.active = false; });
    c.addEventListener('touchcancel', () => { state.pointer.active = false; });
  }

  // ===== Canvas sizing =====
  function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = state.canvas.getBoundingClientRect();
    state.canvas.width = Math.max(320, Math.floor(rect.width * dpr));
    state.canvas.height = Math.max(240, Math.floor(rect.height * dpr));
    state.ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function rebuildSim(simW, simH) {
    state.simW = simW; state.simH = simH;
    state.simCanvas = document.createElement('canvas');
    state.simCanvas.width = simW; state.simCanvas.height = simH;
    state.simCtx = state.simCanvas.getContext('2d');
    state.simImage = state.simCtx.createImageData(simW, simH);
    allocate(simW, simH);
    seedRandomBlobs(5);
  }

  // ===== Adaptive perf =====
  function evaluatePerf() {
    if (state.perfEvaluated || state.perfSamples.length < CFG.perfWindow) return;
    const avg = state.perfSamples.reduce((a, b) => a + b, 0) / state.perfSamples.length;
    if (avg > 24) {
      if (state.stepsPerFrame > 4) {
        state.stepsPerFrame = Math.max(4, state.stepsPerFrame - 4);
        document.getElementById('blm-speed').value = state.stepsPerFrame;
        document.getElementById('blm-speed-val').textContent = state.stepsPerFrame;
      } else if (state.simW > CFG.minSimW) {
        // Shrink the grid
        const newW = Math.max(CFG.minSimW, Math.floor(state.simW * 0.8));
        const newH = Math.max(CFG.minSimH, Math.floor(state.simH * 0.8));
        rebuildSim(newW, newH);
      }
      // Reset window for another measurement pass
      state.perfSamples = [];
      if (state.simW <= CFG.minSimW && state.stepsPerFrame <= 4) state.perfEvaluated = true;
    } else {
      state.perfEvaluated = true;
    }
    updateBadge();
  }

  function updateBadge() {
    const b = document.getElementById('blm-perf-badge');
    if (!b) return;
    b.textContent = `${state.simW}×${state.simH} · ${state.stepsPerFrame}/frame`;
  }

  // ===== UI =====
  function renderPresetChips() {
    const root = document.getElementById('blm-preset-chips');
    root.innerHTML = '';
    for (const p of PRESETS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'blm-chip';
      b.textContent = p.name;
      b.dataset.id = p.id;
      b.addEventListener('click', () => applyPreset(p.id));
      root.appendChild(b);
    }
    markActivePreset(null);
  }

  function applyPreset(id) {
    const p = PRESETS.find(x => x.id === id);
    if (!p) return;
    state.f = p.f; state.k = p.k;
    document.getElementById('blm-feed').value = p.f;
    document.getElementById('blm-feed-val').textContent = p.f.toFixed(4);
    document.getElementById('blm-kill').value = p.k;
    document.getElementById('blm-kill-val').textContent = p.k.toFixed(4);
    clearField();
    seedRandomBlobs(5);
    markActivePreset(id);
    persist();
  }

  function markActivePreset(id) {
    document.querySelectorAll('#blm-preset-chips .blm-chip').forEach(c => {
      c.dataset.active = (c.dataset.id === id) ? 'true' : 'false';
    });
  }

  function renderPaletteChips() {
    const root = document.getElementById('blm-palette-chips');
    root.innerHTML = '';
    const names = [
      { id: 'ember', label: 'Ember' },
      { id: 'ocean', label: 'Ocean' },
      { id: 'mono', label: 'Mono' },
      { id: 'biolum', label: 'Bioluminescence' },
    ];
    for (const p of names) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'blm-chip';
      b.textContent = p.label;
      b.dataset.id = p.id;
      b.addEventListener('click', () => { state.palette = p.id; markActivePalette(p.id); persist(); });
      root.appendChild(b);
    }
    markActivePalette(state.palette);
  }
  function markActivePalette(id) {
    document.querySelectorAll('#blm-palette-chips .blm-chip').forEach(c => {
      c.dataset.active = (c.dataset.id === id) ? 'true' : 'false';
    });
  }

  function bindSliders() {
    const fSl = document.getElementById('blm-feed');
    const kSl = document.getElementById('blm-kill');
    const spSl = document.getElementById('blm-speed');
    fSl.addEventListener('input', () => {
      state.f = parseFloat(fSl.value);
      document.getElementById('blm-feed-val').textContent = state.f.toFixed(4);
      markActivePreset(null);
      persist();
    });
    kSl.addEventListener('input', () => {
      state.k = parseFloat(kSl.value);
      document.getElementById('blm-kill-val').textContent = state.k.toFixed(4);
      markActivePreset(null);
      persist();
    });
    spSl.addEventListener('input', () => {
      state.stepsPerFrame = parseInt(spSl.value, 10);
      document.getElementById('blm-speed-val').textContent = state.stepsPerFrame;
      updateBadge();
    });
  }

  function bindButtons() {
    document.getElementById('blm-playpause-btn').addEventListener('click', () => {
      state.paused = !state.paused;
      document.getElementById('blm-playpause-btn').textContent = state.paused ? 'Play' : 'Pause';
    });
    document.getElementById('blm-clear-btn').addEventListener('click', () => {
      clearField();
    });
    document.getElementById('blm-reseed-btn').addEventListener('click', () => {
      clearField();
      seedRandomBlobs(4);
    });
    document.getElementById('blm-capture-btn').addEventListener('click', () => {
      state.canvas.toBlob((blob) => {
        if (!blob) { toast('Capture failed'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'bloom-' + Date.now() + '.png';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('Captured');
      }, 'image/png');
    });
  }

  function toast(msg) {
    const t = document.querySelector('.blm-toast');
    t.textContent = msg;
    t.classList.add('is-visible');
    setTimeout(() => t.classList.remove('is-visible'), 1500);
  }

  // ===== Persistence (last preset/palette/sliders) =====
  function persist() {
    try {
      localStorage.setItem('blm_v1', JSON.stringify({
        f: state.f, k: state.k, palette: state.palette,
      }));
    } catch (e) {}
  }
  function loadPersisted() {
    try {
      const raw = localStorage.getItem('blm_v1');
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.f === 'number') state.f = s.f;
      if (typeof s.k === 'number') state.k = s.k;
      if (typeof s.palette === 'string' && PALETTES[s.palette]) state.palette = s.palette;
    } catch (e) {}
  }

  // ===== Main loop =====
  function loop(ts) {
    state.raf = requestAnimationFrame(loop);
    if (!state.lastTime) state.lastTime = ts;
    const dtMs = ts - state.lastTime;
    state.lastTime = ts;
    state.perfSamples.push(dtMs);
    if (state.perfSamples.length > 180) state.perfSamples.shift();

    if (!state.paused) {
      for (let s = 0; s < state.stepsPerFrame; s++) step();
    }
    render();

    if (!state.perfEvaluated) evaluatePerf();
  }

  // ===== Boot =====
  function init() {
    state.canvas = document.getElementById('blm-canvas');
    if (!state.canvas) return;
    state.ctx = state.canvas.getContext('2d');

    // Coarse-pointer / small-viewport: start lower so the first second isn't wasted thinning.
    const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (isCoarse || window.innerWidth < 720) {
      state.simW = 180; state.simH = 180;
      state.stepsPerFrame = 6;
    }

    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) state.stepsPerFrame = Math.max(3, Math.floor(state.stepsPerFrame / 2));

    loadPersisted();

    sizeCanvas();
    rebuildSim(state.simW, state.simH);

    // Sync sliders with state (if loaded persisted values, sync controls).
    document.getElementById('blm-feed').value = state.f;
    document.getElementById('blm-feed-val').textContent = state.f.toFixed(4);
    document.getElementById('blm-kill').value = state.k;
    document.getElementById('blm-kill-val').textContent = state.k.toFixed(4);
    document.getElementById('blm-speed').value = state.stepsPerFrame;
    document.getElementById('blm-speed-val').textContent = state.stepsPerFrame;

    renderPresetChips();
    renderPaletteChips();
    bindSliders();
    bindButtons();
    bindPointer();
    updateBadge();

    // Default preset on first load only (don't override persisted f/k).
    if (!localStorage.getItem('blm_v1')) applyPreset('coral');

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(sizeCanvas, 150);
    });

    state.lastTime = 0;
    state.raf = requestAnimationFrame(loop);
  }

  // Expose internals for headless testing.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      headlessRun(opts) {
        opts = opts || {};
        const W = opts.W || 96, H = opts.H || 96;
        const a = new Float32Array(W * H); a.fill(1);
        const b = new Float32Array(W * H);
        const aN = new Float32Array(W * H), bN = new Float32Array(W * H);
        // Seed center
        const cx = W >> 1, cy = H >> 1, r = 6;
        for (let y = cy - r; y <= cy + r; y++)
          for (let x = cx - r; x <= cx + r; x++)
            if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) { a[y * W + x] = 0.3; b[y * W + x] = 1.0; }
        const Da = 1.0, Db = 0.5, dt = 1.0;
        const f = opts.f != null ? opts.f : 0.0545;
        const k = opts.k != null ? opts.k : 0.062;
        const steps = opts.steps || 2000;
        let A = a, B = b, AN = aN, BN = bN;
        for (let s = 0; s < steps; s++) {
          for (let y = 0; y < H; y++) {
            const ym = (y === 0 ? H - 1 : y - 1) * W;
            const yp = (y === H - 1 ? 0 : y + 1) * W;
            const yy = y * W;
            for (let x = 0; x < W; x++) {
              const xm = x === 0 ? W - 1 : x - 1;
              const xp = x === W - 1 ? 0 : x + 1;
              const i = yy + x;
              const la = A[i] * -1 + (A[yy + xm] + A[yy + xp] + A[ym + x] + A[yp + x]) * 0.2 + (A[ym + xm] + A[ym + xp] + A[yp + xm] + A[yp + xp]) * 0.05;
              const lb = B[i] * -1 + (B[yy + xm] + B[yy + xp] + B[ym + x] + B[yp + x]) * 0.2 + (B[ym + xm] + B[ym + xp] + B[yp + xm] + B[yp + xp]) * 0.05;
              const ai = A[i], bi = B[i];
              const rx = ai * bi * bi;
              AN[i] = ai + (Da * la - rx + f * (1 - ai)) * dt;
              BN[i] = bi + (Db * lb + rx - (k + f) * bi) * dt;
            }
          }
          const tA = A; A = AN; AN = tA;
          const tB = B; B = BN; BN = tB;
        }
        // Stats
        let bmin = Infinity, bmax = -Infinity, bsum = 0, bad = 0, alive = 0;
        for (let i = 0; i < W * H; i++) {
          if (!isFinite(A[i]) || !isFinite(B[i])) bad++;
          if (B[i] < bmin) bmin = B[i];
          if (B[i] > bmax) bmax = B[i];
          bsum += B[i];
          if (B[i] > 0.05) alive++;
        }
        return { bad, bmin, bmax, bavg: bsum / (W * H), aliveFrac: alive / (W * H) };
      },
    };
  }

  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})();
