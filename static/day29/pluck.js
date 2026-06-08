/* Pluck — Day 29. Karplus-Strong via AudioBuffer pre-render. */
(function () {
  'use strict';

  // ===== Config / data =====
  const SCALES = {
    majorPenta: [0, 2, 4, 7, 9],
    minorPenta: [0, 3, 5, 7, 10],
    major:      [0, 2, 4, 5, 7, 9, 11],
    dorian:     [0, 2, 3, 5, 7, 9, 10],
  };
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  // MIDI note number for C2 = 36. We'll start strings from rootNote at octave 3 (middle-ish).
  const BASE_OCTAVE = 3;

  const reducedMotion = (typeof window !== 'undefined') && window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ===== State =====
  const state = {
    ctx: null,
    master: null,
    compressor: null,
    reverbNode: null, // a feedback-delay 'verb' chain end
    dryGain: null, wetGain: null,
    scaleId: 'majorPenta',
    rootIdx: 0, // C
    stringCount: 8,
    decay: 0.995,        // feedback factor per sample (closer to 1 = longer)
    brightness: 0.50,    // averaging weight (0.5 = avg of two; higher = brighter)
    reverbOn: false,
    strings: [],         // { freq, name, y, plucks: [{ at: timeSec, amp: 0..1 }] }
    started: false,
    canvas: null, cctx: null,
    cssW: 0, cssH: 0, dpr: 1,
    pointer: { active: false, lastY: -1 },
  };

  // ===== Audio setup =====
  function ensureAudio() {
    if (state.started) return;
    state.started = true;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    state.ctx = new Ctx();
    if (state.ctx.state === 'suspended') state.ctx.resume();

    state.master = state.ctx.createGain();
    state.master.gain.value = 0.85;

    state.compressor = state.ctx.createDynamicsCompressor();
    state.compressor.threshold.value = -16;
    state.compressor.knee.value = 12;
    state.compressor.ratio.value = 5;
    state.compressor.attack.value = 0.003;
    state.compressor.release.value = 0.25;

    // Build dry / wet for optional reverb
    state.dryGain = state.ctx.createGain(); state.dryGain.gain.value = 1.0;
    state.wetGain = state.ctx.createGain(); state.wetGain.gain.value = 0.0;
    state.master.connect(state.compressor);
    state.compressor.connect(state.dryGain).connect(state.ctx.destination);

    // Cheap feedback-delay reverb
    const delay = state.ctx.createDelay(2.0);
    delay.delayTime.value = 0.18;
    const fb = state.ctx.createGain(); fb.gain.value = 0.45;
    const lp = state.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2800;
    state.compressor.connect(delay);
    delay.connect(lp).connect(fb).connect(delay);
    lp.connect(state.wetGain).connect(state.ctx.destination);

    document.getElementById('plk-overlay').classList.remove('is-visible');
  }

  // ===== Karplus-Strong: pre-render a buffer for one pluck =====
  function pluckBuffer(freq, decay, brightness, durSec) {
    const sr = state.ctx.sampleRate;
    const N = Math.max(2, Math.round(sr / freq));
    const totalSamples = Math.max(N + 16, Math.floor(durSec * sr));
    const buffer = state.ctx.createBuffer(1, totalSamples, sr);
    const out = buffer.getChannelData(0);

    // Init delay line with white noise. A short raised window keeps the
    // attack rounded (less 'click').
    const delayLine = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const w = i < 4 ? i / 4 : (i > N - 5 ? (N - 1 - i) / 4 : 1);
      delayLine[i] = (Math.random() * 2 - 1) * w;
    }

    let idx = 0;
    const b = brightness; // 0.30..0.65 (0.5 = simple avg)
    const c = 1 - b;
    const d = decay;      // 0.97..0.999
    for (let n = 0; n < totalSamples; n++) {
      const cur = delayLine[idx];
      out[n] = cur;
      const next = delayLine[(idx + 1) % N];
      // Lowpass-ish weighted average + feedback decay.
      const newSample = (b * cur + c * next) * d;
      delayLine[idx] = newSample;
      idx = (idx + 1) % N;
    }
    return buffer;
  }

  function pluck(stringIdx, vel) {
    if (!state.started) return;
    const s = state.strings[stringIdx];
    if (!s) return;
    const durSec = computeDurationFor(state.decay);
    const buf = pluckBuffer(s.freq, state.decay, state.brightness, durSec);
    const src = state.ctx.createBufferSource();
    src.buffer = buf;
    const g = state.ctx.createGain();
    g.gain.value = (vel != null ? vel : 0.8);
    src.connect(g).connect(state.master);
    src.start();
    src.onended = () => { try { src.disconnect(); g.disconnect(); } catch (e) {} };
    // Animation pluck timestamp (audio context time for sync)
    s.plucks.push({ at: state.ctx.currentTime, amp: 1.0, durSec });
    if (s.plucks.length > 6) s.plucks.shift();
  }

  function computeDurationFor(decay) {
    // Solve for time when amplitude factor decay^(n*samplesPerPeriod)
    // reaches ~1/1000. n_periods = ln(0.001)/ln(decay) — duration in samples ~ N * n_periods.
    // Simpler: longer with bigger decay; clamp.
    const t = Math.log(0.001) / Math.log(Math.max(0.001, decay));
    // t is iterations in "samples advanced in delay line"; rough wall time ~ t / sampleRate; clamp.
    const sec = t / 44100;
    return Math.min(6, Math.max(0.4, sec));
  }

  // ===== Tuning =====
  function buildStrings() {
    const scale = SCALES[state.scaleId];
    const count = state.stringCount;
    const strings = [];
    for (let i = 0; i < count; i++) {
      const degreeIdx = i % scale.length;
      const octave = Math.floor(i / scale.length);
      const semitonesFromC = scale[degreeIdx] + state.rootIdx + (BASE_OCTAVE + octave) * 12;
      // MIDI 60 = C4 = 261.63 Hz; MIDI = semitonesFromC if semitonesFromC = 60 means... wait
      // semitonesFromC is a count from C0 (since we treat C as 0). Frequency: 16.35 * 2^(n/12)
      // where 16.35 Hz is C0. Then C4 (n=48) = 16.35 * 2^4 = 261.6. ✓
      const freq = 16.3516 * Math.pow(2, semitonesFromC / 12);
      const note = NOTE_NAMES[(scale[degreeIdx] + state.rootIdx) % 12];
      strings.push({
        freq, name: note + (BASE_OCTAVE + octave),
        y: 0, // assigned in layout
        plucks: [],
      });
    }
    state.strings = strings;
    layoutStrings();
  }

  function layoutStrings() {
    const top = 40, bottom = 40;
    const n = state.strings.length;
    const avail = state.cssH - top - bottom;
    for (let i = 0; i < n; i++) {
      state.strings[i].y = top + (i + 0.5) * (avail / n);
    }
  }

  // ===== Rendering =====
  function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.dpr = dpr;
    const rect = state.canvas.getBoundingClientRect();
    state.cssW = Math.max(320, Math.floor(rect.width));
    state.cssH = Math.max(240, Math.floor(rect.height));
    state.canvas.width = Math.floor(state.cssW * dpr);
    state.canvas.height = Math.floor(state.cssH * dpr);
    state.cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layoutStrings();
  }

  function render() {
    const ctx = state.cctx;
    const W = state.cssW, H = state.cssH;
    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#16110D');
    grad.addColorStop(1, '#0B0907');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const now = state.started ? state.ctx.currentTime : 0;
    const padX = 60;
    const stringStartX = padX, stringEndX = W - padX;
    const L = stringEndX - stringStartX;

    for (let i = 0; i < state.strings.length; i++) {
      const s = state.strings[i];
      // Compute current visual amplitude from all active plucks
      let amp = 0;
      let visFreq = 5.5; // visual wobble freq (Hz) — slow so eyes can see
      let phase = 0;
      for (const p of s.plucks) {
        const dt = now - p.at;
        if (dt < 0 || dt > p.durSec + 0.5) continue;
        const env = Math.exp(-dt * 2.2); // decay envelope (visual)
        amp += env * p.amp;
        phase = dt * visFreq * Math.PI * 2;
      }
      amp = Math.min(1, amp);
      const maxOffset = reducedMotion ? 0 : 10; // px

      // Color: slight shift on pluck
      const sat = 0.55 + amp * 0.45;
      const stringColor = amp > 0.02 ? `rgba(217, 119, 87, ${sat})` : 'rgba(168, 162, 158, 0.72)';
      ctx.strokeStyle = stringColor;
      ctx.lineWidth = 1.5 + amp * 1.0;

      // Draw the string as a polyline with sinusoidal offset
      ctx.beginPath();
      const steps = 48;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const x = stringStartX + L * t;
        const shape = Math.sin(t * Math.PI); // pinned ends
        const off = amp * maxOffset * shape * Math.sin(phase + t * Math.PI * 2);
        const y = s.y + off;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Note label (left)
      ctx.fillStyle = amp > 0.02 ? 'rgba(217, 119, 87, 0.9)' : 'rgba(168, 162, 158, 0.6)';
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.name, stringStartX - 10, s.y);
      // Endpoint pegs
      ctx.fillStyle = 'rgba(217, 119, 87, 0.5)';
      ctx.beginPath(); ctx.arc(stringStartX, s.y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(stringEndX, s.y, 3, 0, Math.PI * 2); ctx.fill();
    }

    requestAnimationFrame(render);
  }

  // ===== Interaction =====
  function stringAtY(yCss) {
    if (!state.strings.length) return -1;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < state.strings.length; i++) {
      const d = Math.abs(state.strings[i].y - yCss);
      if (d < bestD) { bestD = d; best = i; }
    }
    // Only accept if within half a string-spacing
    const spacing = (state.cssH - 80) / state.strings.length;
    return bestD < spacing * 0.55 ? best : -1;
  }

  function bindPointer() {
    const c = state.canvas;
    function getPos(clientX, clientY) {
      const r = c.getBoundingClientRect();
      return { x: clientX - r.left, y: clientY - r.top };
    }
    function pluckAtPos(x, y) {
      const idx = stringAtY(y);
      if (idx >= 0) pluck(idx, 0.85);
    }
    function strumFromTo(prevY, curY) {
      if (prevY < 0) return;
      const a = Math.min(prevY, curY), b = Math.max(prevY, curY);
      // Pluck any string whose y lies strictly between prevY and curY (exclusive of the start band)
      const ascending = curY >= prevY;
      const order = ascending ? state.strings.map((_, i) => i) : state.strings.map((_, i) => i).reverse();
      for (const i of order) {
        const sy = state.strings[i].y;
        if (sy > a && sy < b) pluck(i, 0.6 + Math.random() * 0.25);
      }
    }
    function down(clientX, clientY) {
      ensureAudio();
      const p = getPos(clientX, clientY);
      state.pointer.active = true;
      state.pointer.lastY = p.y;
      pluckAtPos(p.x, p.y);
    }
    function move(clientX, clientY) {
      if (!state.pointer.active) return;
      const p = getPos(clientX, clientY);
      strumFromTo(state.pointer.lastY, p.y);
      state.pointer.lastY = p.y;
    }
    function up() { state.pointer.active = false; state.pointer.lastY = -1; }

    c.addEventListener('mousedown', (e) => { e.preventDefault(); down(e.clientX, e.clientY); });
    window.addEventListener('mousemove', (e) => { if (state.pointer.active) move(e.clientX, e.clientY); });
    window.addEventListener('mouseup', up);
    c.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) down(t.clientX, t.clientY);
    }, { passive: false });
    c.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) move(t.clientX, t.clientY);
    }, { passive: false });
    c.addEventListener('touchend', up);
    c.addEventListener('touchcancel', up);
  }

  // ===== Controls =====
  function bindControls() {
    const scaleSel = document.getElementById('plk-scale');
    const rootSel = document.getElementById('plk-root');
    NOTE_NAMES.forEach((n, i) => {
      const o = document.createElement('option'); o.value = i; o.textContent = n; rootSel.appendChild(o);
    });
    rootSel.value = state.rootIdx;
    scaleSel.value = state.scaleId;
    scaleSel.addEventListener('change', () => { state.scaleId = scaleSel.value; buildStrings(); persist(); });
    rootSel.addEventListener('change', () => { state.rootIdx = parseInt(rootSel.value, 10); buildStrings(); persist(); });

    const cnt = document.getElementById('plk-count');
    const cntVal = document.getElementById('plk-count-val');
    cnt.addEventListener('input', () => {
      state.stringCount = parseInt(cnt.value, 10);
      cntVal.textContent = state.stringCount;
      buildStrings(); persist();
    });

    const dec = document.getElementById('plk-decay');
    const decVal = document.getElementById('plk-decay-val');
    dec.addEventListener('input', () => {
      state.decay = parseFloat(dec.value);
      decVal.textContent = state.decay.toFixed(3);
      persist();
    });

    const br = document.getElementById('plk-bright');
    const brVal = document.getElementById('plk-bright-val');
    br.addEventListener('input', () => {
      state.brightness = parseFloat(br.value);
      brVal.textContent = state.brightness.toFixed(2);
      persist();
    });

    const rv = document.getElementById('plk-reverb');
    rv.addEventListener('change', () => {
      state.reverbOn = rv.checked;
      if (state.wetGain) state.wetGain.gain.value = state.reverbOn ? 0.45 : 0.0;
      if (state.dryGain) state.dryGain.gain.value = state.reverbOn ? 0.75 : 1.0;
      persist();
    });
  }

  function persist() {
    try {
      localStorage.setItem('plk_v1', JSON.stringify({
        scaleId: state.scaleId, rootIdx: state.rootIdx,
        stringCount: state.stringCount,
        decay: state.decay, brightness: state.brightness,
        reverbOn: state.reverbOn,
      }));
    } catch (e) {}
  }
  function loadPersisted() {
    try {
      const raw = localStorage.getItem('plk_v1');
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.scaleId && SCALES[s.scaleId]) state.scaleId = s.scaleId;
      if (Number.isInteger(s.rootIdx) && s.rootIdx >= 0 && s.rootIdx < 12) state.rootIdx = s.rootIdx;
      if (Number.isInteger(s.stringCount) && s.stringCount >= 5 && s.stringCount <= 12) state.stringCount = s.stringCount;
      if (typeof s.decay === 'number' && s.decay >= 0.97 && s.decay <= 0.9999) state.decay = s.decay;
      if (typeof s.brightness === 'number' && s.brightness >= 0.3 && s.brightness <= 0.65) state.brightness = s.brightness;
      if (typeof s.reverbOn === 'boolean') state.reverbOn = s.reverbOn;
    } catch (e) {}
  }

  // ===== Boot =====
  function init() {
    state.canvas = document.getElementById('plk-stage');
    if (!state.canvas) return;
    state.cctx = state.canvas.getContext('2d');

    loadPersisted();
    sizeCanvas();
    buildStrings();
    bindControls();
    bindPointer();

    // Sync control display with loaded state
    document.getElementById('plk-count').value = state.stringCount;
    document.getElementById('plk-count-val').textContent = state.stringCount;
    document.getElementById('plk-decay').value = state.decay;
    document.getElementById('plk-decay-val').textContent = state.decay.toFixed(3);
    document.getElementById('plk-bright').value = state.brightness;
    document.getElementById('plk-bright-val').textContent = state.brightness.toFixed(2);
    document.getElementById('plk-reverb').checked = state.reverbOn;

    // Overlay click = audio init
    document.getElementById('plk-overlay').addEventListener('click', ensureAudio);

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(sizeCanvas, 120);
    });

    requestAnimationFrame(render);
  }

  // Expose for headless testing
  if (typeof module !== 'undefined' && module.exports) {
    // Pure KS sample generator (no Web Audio); returns the rendered samples.
    module.exports = {
      renderKS(freq, decay, brightness, durSec, sampleRate) {
        sampleRate = sampleRate || 44100;
        const N = Math.max(2, Math.round(sampleRate / freq));
        const total = Math.max(N + 16, Math.floor(durSec * sampleRate));
        const out = new Float32Array(total);
        const dl = new Float32Array(N);
        // Deterministic seed for tests
        let seed = 12345;
        const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
        for (let i = 0; i < N; i++) dl[i] = rand() * 2 - 1;
        let idx = 0;
        const b = brightness, c = 1 - b, d = decay;
        for (let n = 0; n < total; n++) {
          const cur = dl[idx];
          out[n] = cur;
          const next = dl[(idx + 1) % N];
          dl[idx] = (b * cur + c * next) * d;
          idx = (idx + 1) % N;
        }
        return { out, N, total };
      },
    };
  }

  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})();
