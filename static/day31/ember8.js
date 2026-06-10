/* Ember-8 — Day 31. A fantasy console: 128x128 pixels, 16 colors, 8x8 sprites,
 * cartridges in real Lua running on the Fengari VM (loaded from a pinned CDN).
 *
 * Architecture: createMachine() is the pure machine — framebuffer, palette,
 * drawing primitives, font, sprite sheet, input edges, clock. It has no DOM
 * dependencies so the whole runtime can be driven headless in Node for tests.
 * The browser shell below wires it to a canvas, the Fengari bridge, the
 * editors, and cart storage.
 *
 * The Fengari bridge runs every cart as three chunks in one persistent Lua
 * state: a prelude that binds the API to window.E8 (colon calls pass self),
 * the cart source, and an epilogue that exports _init/_update/_draw back to
 * JS. Accepted limitation, in the retro spirit: cart globals other than the
 * loop hooks persist across runs until the page is reloaded (the prelude
 * nils the hooks themselves). Per-call interop has a cost, so per-pixel Lua
 * loops are slow-ish; sprites and shapes are the intended workhorses. */
(function () {
  'use strict';

  var W = 128, H = 128;
  var SHEET_W = 128, SHEET_H = 64; // 16x8 slots of 8x8 = 128 sprites

  // The classic 16-color fantasy-console palette, index 0-15.
  var PALETTE = [
    '#000000', '#1D2B53', '#7E2553', '#008751',
    '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8',
    '#FF004D', '#FFA300', '#FFEC27', '#00E436',
    '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA',
  ];

  // 3x5 pixel font. Per glyph: 5 rows, 3 bits each (bit 4 = left pixel).
  var FONT = {
    'A': [2, 5, 7, 5, 5], 'B': [6, 5, 6, 5, 6], 'C': [3, 4, 4, 4, 3],
    'D': [6, 5, 5, 5, 6], 'E': [7, 4, 6, 4, 7], 'F': [7, 4, 6, 4, 4],
    'G': [3, 4, 5, 5, 3], 'H': [5, 5, 7, 5, 5], 'I': [7, 2, 2, 2, 7],
    'J': [1, 1, 1, 5, 2], 'K': [5, 5, 6, 5, 5], 'L': [4, 4, 4, 4, 7],
    'M': [5, 7, 7, 5, 5], 'N': [6, 5, 5, 5, 5], 'O': [2, 5, 5, 5, 2],
    'P': [6, 5, 6, 4, 4], 'Q': [2, 5, 5, 2, 1], 'R': [6, 5, 6, 5, 5],
    'S': [3, 4, 2, 1, 6], 'T': [7, 2, 2, 2, 2], 'U': [5, 5, 5, 5, 7],
    'V': [5, 5, 5, 5, 2], 'W': [5, 5, 7, 7, 5], 'X': [5, 5, 2, 5, 5],
    'Y': [5, 5, 2, 2, 2], 'Z': [7, 1, 2, 4, 7],
    '0': [7, 5, 5, 5, 7], '1': [2, 6, 2, 2, 7], '2': [6, 1, 2, 4, 7],
    '3': [7, 1, 3, 1, 7], '4': [5, 5, 7, 1, 1], '5': [7, 4, 6, 1, 6],
    '6': [3, 4, 7, 5, 7], '7': [7, 1, 1, 2, 2], '8': [7, 5, 7, 5, 7],
    '9': [7, 5, 7, 1, 6],
    '.': [0, 0, 0, 0, 2], ',': [0, 0, 0, 2, 4], ':': [0, 2, 0, 2, 0],
    ';': [0, 2, 0, 2, 4], '!': [2, 2, 2, 0, 2], '?': [6, 1, 2, 0, 2],
    '-': [0, 0, 7, 0, 0], '+': [0, 2, 7, 2, 0], '/': [1, 1, 2, 4, 4],
    '(': [1, 2, 2, 2, 1], ')': [4, 2, 2, 2, 4], ' ': [0, 0, 0, 0, 0],
  };

  function sheetFromHex(hex) {
    if (typeof hex !== 'string' || hex.length !== SHEET_W * SHEET_H) return null;
    if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
    var out = new Uint8Array(hex.length);
    for (var i = 0; i < hex.length; i++) out[i] = parseInt(hex.charAt(i), 16);
    return out;
  }

  function sheetToHex(sheet) {
    var out = new Array(sheet.length);
    for (var i = 0; i < sheet.length; i++) out[i] = sheet[i].toString(16);
    return out.join('');
  }

  function createMachine() {
    var fb = new Uint8Array(W * H);
    var sheet = new Uint8Array(SHEET_W * SHEET_H);
    var live = [false, false, false, false, false, false];
    var cur = [false, false, false, false, false, false];
    var prev = [false, false, false, false, false, false];
    var frame = 0;
    var fl = Math.floor;

    function col(c) {
      c = (c === null || c === undefined) ? 0 : fl(c);
      return ((c % 16) + 16) % 16;
    }
    function rawset(x, y, c) {
      if (x >= 0 && x < W && y >= 0 && y < H) fb[y * W + x] = c;
    }
    function hline(x0, x1, y, c) {
      if (y < 0 || y >= H) return;
      if (x0 > x1) { var t = x0; x0 = x1; x1 = t; }
      if (x0 < 0) x0 = 0;
      if (x1 > W - 1) x1 = W - 1;
      for (var x = x0; x <= x1; x++) fb[y * W + x] = c;
    }

    var M = {
      fb: fb,
      sheet: sheet,

      cls: function (c) { fb.fill(col(c)); },

      pset: function (x, y, c) { rawset(fl(x), fl(y), col(c)); },

      pget: function (x, y) {
        x = fl(x); y = fl(y);
        return (x >= 0 && x < W && y >= 0 && y < H) ? fb[y * W + x] : 0;
      },

      line: function (x0, y0, x1, y1, c) {
        c = col(c); x0 = fl(x0); y0 = fl(y0); x1 = fl(x1); y1 = fl(y1);
        var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
        var dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
        var err = dx + dy;
        for (;;) {
          rawset(x0, y0, c);
          if (x0 === x1 && y0 === y1) break;
          var e2 = 2 * err;
          if (e2 >= dy) { err += dy; x0 += sx; }
          if (e2 <= dx) { err += dx; y0 += sy; }
        }
      },

      rect: function (x0, y0, x1, y1, c) {
        c = col(c); x0 = fl(x0); y0 = fl(y0); x1 = fl(x1); y1 = fl(y1);
        var t;
        if (x0 > x1) { t = x0; x0 = x1; x1 = t; }
        if (y0 > y1) { t = y0; y0 = y1; y1 = t; }
        var x, y;
        for (x = x0; x <= x1; x++) { rawset(x, y0, c); rawset(x, y1, c); }
        for (y = y0; y <= y1; y++) { rawset(x0, y, c); rawset(x1, y, c); }
      },

      rectfill: function (x0, y0, x1, y1, c) {
        c = col(c); x0 = fl(x0); y0 = fl(y0); x1 = fl(x1); y1 = fl(y1);
        var t;
        if (x0 > x1) { t = x0; x0 = x1; x1 = t; }
        if (y0 > y1) { t = y0; y0 = y1; y1 = t; }
        for (var y = y0; y <= y1; y++) hline(x0, x1, y, c);
      },

      circ: function (xc, yc, r, c) {
        c = col(c); xc = fl(xc); yc = fl(yc); r = fl(r);
        if (r < 0) return;
        var x = r, y = 0, err = 1 - r;
        while (x >= y) {
          rawset(xc + x, yc + y, c); rawset(xc - x, yc + y, c);
          rawset(xc + x, yc - y, c); rawset(xc - x, yc - y, c);
          rawset(xc + y, yc + x, c); rawset(xc - y, yc + x, c);
          rawset(xc + y, yc - x, c); rawset(xc - y, yc - x, c);
          y++;
          if (err < 0) err += 2 * y + 1;
          else { x--; err += 2 * (y - x) + 1; }
        }
      },

      circfill: function (xc, yc, r, c) {
        c = col(c); xc = fl(xc); yc = fl(yc); r = fl(r);
        if (r < 0) return;
        for (var dy = -r; dy <= r; dy++) {
          var dx = fl(Math.sqrt(r * r - dy * dy));
          hline(xc - dx, xc + dx, yc + dy, c);
        }
      },

      spr: function (n, x, y, w, h, fx, fy) {
        n = fl(n || 0); x = fl(x); y = fl(y);
        w = Math.max(1, fl(w || 1)); h = Math.max(1, fl(h || 1));
        fx = !!fx; fy = !!fy;
        var BW = w * 8, BH = h * 8;
        for (var dy = 0; dy < BH; dy++) {
          for (var dx = 0; dx < BW; dx++) {
            var sx = fx ? (BW - 1 - dx) : dx;
            var sy = fy ? (BH - 1 - dy) : dy;
            var sn = (n + (sx >> 3) + (sy >> 3) * 16) % 128;
            var v = sheet[((sn >> 4) * 8 + (sy & 7)) * SHEET_W + (sn & 15) * 8 + (sx & 7)];
            if (v !== 0) rawset(x + dx, y + dy, v);
          }
        }
      },

      prnt: function (s, x, y, c) {
        s = String(s).toUpperCase();
        c = col(c === null || c === undefined ? 7 : c);
        var cx = fl(x), cy = fl(y), sx = cx;
        for (var i = 0; i < s.length; i++) {
          var ch = s.charAt(i);
          if (ch === '\n') { cx = sx; cy += 6; continue; }
          var g = FONT[ch];
          if (g) {
            for (var r = 0; r < 5; r++) {
              var bits = g[r];
              if (bits & 4) rawset(cx, cy + r, c);
              if (bits & 2) rawset(cx + 1, cy + r, c);
              if (bits & 1) rawset(cx + 2, cy + r, c);
            }
          }
          cx += 4;
        }
      },

      btn: function (i) { return !!cur[fl(i || 0)]; },
      btnp: function (i) { i = fl(i || 0); return !!cur[i] && !prev[i]; },

      time: function () { return frame / 30; },

      // Sound hook; the browser shell assigns onBeep (Web Audio). No-op headless.
      onBeep: null,
      beep: function (f, d, w) {
        if (M.onBeep) M.onBeep(Number(f) || 440, Number(d) || 0.1, fl(w || 0));
      },

      // Shell/test plumbing (not part of the Lua-facing API).
      setLive: function (i, v) { live[i] = !!v; },
      beginFrame: function () { prev = cur; cur = live.slice(); frame++; },
      getFrame: function () { return frame; },
      loadSheet: function (bytes) { sheet.set(bytes); },
      reset: function () {
        fb.fill(0);
        frame = 0;
        cur = [false, false, false, false, false, false];
        prev = [false, false, false, false, false, false];
      },
    };
    return M;
  }

  // ---- The Fengari bridge: exact three-chunk pattern ----

  var PRELUDE = [
    '_init, _update, _draw = nil, nil, nil',
    'local js = require "js"',
    'local E8 = js.global.E8',
    'function cls(c) E8:cls(c or 0) end',
    'function pset(x,y,c) E8:pset(x,y,c) end',
    'function pget(x,y) return E8:pget(x,y) end',
    'function line(x0,y0,x1,y1,c) E8:line(x0,y0,x1,y1,c) end',
    'function rect(x0,y0,x1,y1,c) E8:rect(x0,y0,x1,y1,c) end',
    'function rectfill(x0,y0,x1,y1,c) E8:rectfill(x0,y0,x1,y1,c) end',
    'function circ(x,y,r,c) E8:circ(x,y,r,c) end',
    'function circfill(x,y,r,c) E8:circfill(x,y,r,c) end',
    'function spr(n,x,y,w,h,fx,fy) E8:spr(n,x,y,w or 1,h or 1,fx or false,fy or false) end',
    'function print(s,x,y,c) E8:prnt(tostring(s), x or 0, y or 0, c or 7) end',
    'function btn(i) return E8:btn(i) end',
    'function btnp(i) return E8:btnp(i) end',
    'function flr(x) return math.floor(x) end',
    'function ceil(x) return math.ceil(x) end',
    'function rnd(n) return math.random() * (n or 1) end',
    'function mid(a,b,c) return math.max(math.min(a,b), math.min(math.max(a,b), c)) end',
    'function abs(x) return math.abs(x) end',
    'function min(a,b) return math.min(a,b) end',
    'function max(a,b) return math.max(a,b) end',
    'function sqrt(x) return math.sqrt(x) end',
    'function t() return E8:time() end',
    'function beep(f,d,w) E8:beep(f or 440, d or 0.1, w or 0) end',
  ].join('\n');

  var EPILOGUE = [
    'local js = require "js"',
    'js.global.__e8_init = _init',
    'js.global.__e8_update = _update',
    'js.global.__e8_draw = _draw',
  ].join('\n');

  // ---- Headless exports (Node tests drive the machine + bridge directly) ----
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      createMachine: createMachine,
      PRELUDE: PRELUDE,
      EPILOGUE: EPILOGUE,
      PALETTE: PALETTE,
      FONT: FONT,
      sheetFromHex: sheetFromHex,
      sheetToHex: sheetToHex,
    };
    return; // Node tests don't want the browser shell to auto-init
  }

  if (typeof window === 'undefined') return;

  // =====================================================================
  // Browser shell
  // =====================================================================

  var STEP = 1000 / 30;
  var LSKEY = 'e8_carts_v1';

  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }

  function init() {
    var machine = createMachine();
    window.E8 = machine;

    // Working cart (what the editors edit and Run runs).
    var working = null; // { name, code, sprites: Uint8Array }

    var screen = $('#e8-screen');
    var sctx = screen.getContext('2d');
    var img = sctx.createImageData(W, H);
    var u32 = new Uint32Array(img.data.buffer);
    var PAL32 = PALETTE.map(function (hex) {
      var n = parseInt(hex.slice(1), 16);
      var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      return (0xFF << 24) | (b << 16) | (g << 8) | r; // little-endian RGBA
    });

    var codeEl = $('#e8-code');
    var errEl = $('#e8-error');
    var statusEl = $('#e8-status');
    var nameEl = $('#e8-cart-name');
    var cartMsgEl = $('#e8-cart-msg');

    var running = false, raf = 0, last = 0, acc = 0;

    function blit() {
      var fb = machine.fb;
      for (var i = 0; i < fb.length; i++) u32[i] = PAL32[fb[i]];
      sctx.putImageData(img, 0, 0);
    }

    function fitScreen() {
      var wrap = $('#e8-screen-wrap');
      var availW = wrap.clientWidth - 16;
      var availH = Math.max(160, Math.min(window.innerHeight * 0.62, 640));
      var scale = Math.max(1, Math.floor(Math.min(availW, availH) / W));
      screen.style.width = (W * scale) + 'px';
      screen.style.height = (H * scale) + 'px';
    }

    function setStatus(s) {
      statusEl.textContent = (working ? working.name : '') + ' · ' + s;
    }

    function showError(e) {
      errEl.textContent = String((e && e.message) || e);
      errEl.classList.remove('is-hidden');
    }
    function hideError() {
      errEl.textContent = '';
      errEl.classList.add('is-hidden');
    }

    function tick() {
      machine.beginFrame();
      try {
        var u = window.__e8_update, d = window.__e8_draw;
        if (u) u();
        if (d) d();
      } catch (e) {
        stopCart(false);
        showError(e);
        setStatus('ERROR');
        switchTab('code');
      }
    }

    function loop(ts) {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      if (!last) last = ts;
      acc += ts - last;
      last = ts;
      var n = 0;
      while (acc >= STEP && n < 4 && running) { acc -= STEP; n++; tick(); }
      if (n === 4) acc = 0; // dropped frames after a long pause; don't spiral
      blit();
    }

    function stopCart(announce) {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0; last = 0; acc = 0;
      window.__e8_init = undefined;
      window.__e8_update = undefined;
      window.__e8_draw = undefined;
      if (announce !== false) setStatus('STOPPED');
    }

    function runCart() {
      if (!window.fengari) {
        showError('fengari-web failed to load from the CDN, so carts cannot run. Check your connection and reload the page.');
        return;
      }
      stopCart(false);
      hideError();
      working.code = codeEl.value;
      machine.reset();
      machine.loadSheet(working.sprites);
      try {
        window.fengari.load(PRELUDE, 'prelude')();
        window.fengari.load(working.code, 'cart')();
        window.fengari.load(EPILOGUE, 'epilogue')();
      } catch (e) {
        showError(e); setStatus('ERROR'); return;
      }
      try {
        if (window.__e8_init) window.__e8_init();
      } catch (e) {
        showError(e); setStatus('ERROR'); return;
      }
      running = true;
      raf = requestAnimationFrame(loop);
      setStatus('RUNNING');
    }

    // ---- Audio: a tiny beeper (Layer 3). Created on first user gesture. ----
    var actx = null;
    function ensureAudio() {
      if (!actx) {
        try { actx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch (e) { /* no audio available */ }
      }
      if (actx && actx.state === 'suspended') actx.resume();
    }
    window.addEventListener('pointerdown', ensureAudio, { passive: true });
    window.addEventListener('keydown', ensureAudio, { passive: true });

    machine.onBeep = function (freq, dur, wave) {
      if (!actx || actx.state !== 'running') return;
      dur = Math.min(Math.max(dur, 0.02), 1);
      freq = Math.min(Math.max(freq, 30), 4000);
      var t0 = actx.currentTime;
      var g = actx.createGain();
      g.gain.setValueAtTime(0.15, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      g.connect(actx.destination);
      if (wave === 2) {
        var len = Math.max(1, Math.floor(actx.sampleRate * dur));
        var buf = actx.createBuffer(1, len, actx.sampleRate);
        var ch = buf.getChannelData(0);
        for (var i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
        var src = actx.createBufferSource();
        src.buffer = buf;
        src.connect(g);
        src.start(t0);
      } else {
        var o = actx.createOscillator();
        o.type = wave === 1 ? 'triangle' : 'square';
        o.frequency.value = freq;
        o.connect(g);
        o.start(t0);
        o.stop(t0 + dur);
      }
    };

    // ---- Input ----
    var KEY = { ArrowLeft: 0, ArrowRight: 1, ArrowUp: 2, ArrowDown: 3, KeyZ: 4, KeyX: 5 };

    window.addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.code === 'Enter' && document.activeElement === codeEl) {
        e.preventDefault();
        runCart();
        return;
      }
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
      var b = KEY[e.code];
      if (b !== undefined) { machine.setLive(b, true); e.preventDefault(); }
    });
    window.addEventListener('keyup', function (e) {
      var b = KEY[e.code];
      if (b !== undefined) machine.setLive(b, false);
    });

    $$('.e8-tb').forEach(function (btn) {
      var i = parseInt(btn.dataset.btn, 10);
      function down(e) { e.preventDefault(); machine.setLive(i, true); btn.classList.add('on'); ensureAudio(); }
      function up() { machine.setLive(i, false); btn.classList.remove('on'); }
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointerleave', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });

    // ---- Tabs ----
    function switchTab(name) {
      $$('.e8-tab').forEach(function (b) {
        b.setAttribute('aria-selected', b.dataset.tab === name ? 'true' : 'false');
      });
      $$('.e8-view').forEach(function (v) {
        v.classList.toggle('is-hidden', v.id !== 'e8-view-' + name);
      });
      if (name === 'play') fitScreen();
      if (name === 'sprites') { drawNav(); drawEditor(); }
    }
    $$('.e8-tab').forEach(function (b) {
      b.addEventListener('click', function () { switchTab(b.dataset.tab); });
    });

    // ---- Sprite editor ----
    var selSprite = 1, selColor = 9;
    var nav = $('#e8-sheet-nav');
    var nctx = nav.getContext('2d');
    var nimg = nctx.createImageData(SHEET_W, SHEET_H);
    var nu32 = new Uint32Array(nimg.data.buffer);
    var edit = $('#e8-sprite-edit');
    var ectx = edit.getContext('2d');
    var CELL = 24;

    function drawNav() {
      var s = working.sprites;
      for (var i = 0; i < s.length; i++) nu32[i] = PAL32[s[i]];
      nctx.putImageData(nimg, 0, 0);
      nctx.strokeStyle = '#D97757';
      nctx.lineWidth = 1;
      nctx.strokeRect((selSprite % 16) * 8 + 0.5, (selSprite >> 4) * 8 + 0.5, 7, 7);
      $('#e8-sprite-idx').textContent = 'SPRITE ' + selSprite;
    }

    function drawEditor() {
      var s = working.sprites;
      var bx = (selSprite % 16) * 8, by = (selSprite >> 4) * 8;
      for (var y = 0; y < 8; y++) {
        for (var x = 0; x < 8; x++) {
          ectx.fillStyle = PALETTE[s[(by + y) * SHEET_W + bx + x]];
          ectx.fillRect(x * CELL, y * CELL, CELL, CELL);
        }
      }
      ectx.strokeStyle = 'rgba(255,255,255,0.08)';
      ectx.lineWidth = 1;
      for (var i = 0; i <= 8; i++) {
        ectx.beginPath(); ectx.moveTo(i * CELL + 0.5, 0); ectx.lineTo(i * CELL + 0.5, 8 * CELL); ectx.stroke();
        ectx.beginPath(); ectx.moveTo(0, i * CELL + 0.5); ectx.lineTo(8 * CELL, i * CELL + 0.5); ectx.stroke();
      }
    }

    nav.addEventListener('pointerdown', function (e) {
      var r = nav.getBoundingClientRect();
      var x = Math.floor((e.clientX - r.left) / r.width * SHEET_W);
      var y = Math.floor((e.clientY - r.top) / r.height * SHEET_H);
      x = Math.min(Math.max(x, 0), SHEET_W - 1);
      y = Math.min(Math.max(y, 0), SHEET_H - 1);
      selSprite = (y >> 3) * 16 + (x >> 3);
      drawNav(); drawEditor();
    });

    function paintAt(e) {
      var r = edit.getBoundingClientRect();
      var x = Math.floor((e.clientX - r.left) / r.width * 8);
      var y = Math.floor((e.clientY - r.top) / r.height * 8);
      if (x < 0 || x > 7 || y < 0 || y > 7) return;
      var bx = (selSprite % 16) * 8, by = (selSprite >> 4) * 8;
      working.sprites[(by + y) * SHEET_W + bx + x] = selColor;
      drawEditor(); drawNav();
    }
    edit.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      edit.setPointerCapture(e.pointerId);
      paintAt(e);
    });
    edit.addEventListener('pointermove', function (e) {
      if (e.buttons & 1) paintAt(e);
    });

    var palEl = $('#e8-palette');
    PALETTE.forEach(function (hex, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'e8-swatch';
      b.style.background = hex;
      b.title = 'Color ' + i + (i === 0 ? ' (transparent in spr)' : '');
      b.setAttribute('aria-label', 'Color ' + i);
      if (i === selColor) b.dataset.active = 'true';
      b.addEventListener('click', function () {
        selColor = i;
        $$('.e8-swatch').forEach(function (s) { delete s.dataset.active; });
        b.dataset.active = 'true';
      });
      palEl.appendChild(b);
    });

    // ---- Cart manager ----
    function loadStore() {
      try { return JSON.parse(localStorage.getItem(LSKEY)) || {}; }
      catch (e) { return {}; }
    }
    function saveStore(s) {
      try { localStorage.setItem(LSKEY, JSON.stringify(s)); return true; }
      catch (e) { cartMsg('Could not save (localStorage unavailable).'); return false; }
    }
    function cartMsg(m) {
      cartMsgEl.textContent = m;
      cartMsgEl.classList.toggle('is-hidden', !m);
    }

    function validCart(c) {
      return c && c.v === 1 &&
        typeof c.name === 'string' && c.name.length >= 1 && c.name.length <= 64 &&
        typeof c.code === 'string' && c.code.length <= 65536 &&
        typeof c.sprites === 'string' && /^[0-9a-fA-F]{8192}$/.test(c.sprites);
    }

    function setWorking(cart) {
      working = {
        name: cart.name,
        code: cart.code,
        sprites: sheetFromHex(cart.sprites),
      };
      nameEl.value = working.name;
      codeEl.value = working.code;
      selSprite = 1;
      drawNav(); drawEditor();
    }

    function loadAndRun(cart) {
      setWorking(cart);
      cartMsg('');
      runCart();
      switchTab('play');
    }

    function refreshCartList() {
      var listEl = $('#e8-cart-list');
      listEl.innerHTML = '';
      var store = loadStore();
      var names = Object.keys(store).sort();
      if (!names.length) {
        var empty = document.createElement('div');
        empty.className = 'e8-cart-empty';
        empty.textContent = 'No saved carts yet.';
        listEl.appendChild(empty);
        return;
      }
      names.forEach(function (name) {
        var row = document.createElement('div');
        row.className = 'e8-cart-row';
        var label = document.createElement('span');
        label.className = 'e8-cart-label';
        label.textContent = name;
        var loadBtn = document.createElement('button');
        loadBtn.type = 'button';
        loadBtn.className = 'e8-btn-sm';
        loadBtn.textContent = 'Load';
        loadBtn.addEventListener('click', function () {
          var c = loadStore()[name];
          if (validCart(c)) loadAndRun(c);
          else cartMsg('That cart is corrupted and cannot be loaded.');
        });
        var delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'e8-btn-sm e8-btn-danger';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', function () {
          var store2 = loadStore();
          delete store2[name];
          saveStore(store2);
          refreshCartList();
        });
        row.appendChild(label);
        row.appendChild(loadBtn);
        row.appendChild(delBtn);
        listEl.appendChild(row);
      });
    }

    function currentAsCart() {
      working.code = codeEl.value;
      var name = (nameEl.value.trim() || 'UNTITLED').toUpperCase().slice(0, 64);
      return { v: 1, name: name, code: working.code, sprites: sheetToHex(working.sprites) };
    }

    $('#e8-save').addEventListener('click', function () {
      var cart = currentAsCart();
      working.name = cart.name;
      nameEl.value = cart.name;
      var store = loadStore();
      store[cart.name] = cart;
      if (saveStore(store)) cartMsg('Saved "' + cart.name + '".');
      refreshCartList();
      setStatus(running ? 'RUNNING' : 'STOPPED');
    });

    $('#e8-new').addEventListener('click', function () {
      loadAndRun(window.E8_CARTS.TEMPLATE);
    });

    $('#e8-export').addEventListener('click', function () {
      var cart = currentAsCart();
      var blob = new Blob([JSON.stringify(cart)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = cart.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.e8.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    });

    $('#e8-import').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var cart = null;
        try { cart = JSON.parse(reader.result); } catch (err) { cart = null; }
        if (!validCart(cart)) {
          cartMsg('Import rejected: not a valid Ember-8 cart (.e8.json, v1).');
          return;
        }
        loadAndRun(cart);
      };
      reader.onerror = function () { cartMsg('Could not read that file.'); };
      reader.readAsText(f);
    });

    // Bundled examples (read-only originals; loading copies them).
    var exEl = $('#e8-examples');
    [window.E8_CARTS.EMBER_CATCH, window.E8_CARTS.STARFIELD].forEach(function (cart) {
      var row = document.createElement('div');
      row.className = 'e8-cart-row';
      var label = document.createElement('span');
      label.className = 'e8-cart-label';
      label.textContent = cart.name;
      var loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'e8-btn-sm';
      loadBtn.textContent = 'Load';
      loadBtn.addEventListener('click', function () { loadAndRun(cart); });
      row.appendChild(label);
      row.appendChild(loadBtn);
      exEl.appendChild(row);
    });

    // ---- Run/Stop buttons ----
    $('#e8-run').addEventListener('click', runCart);
    $('#e8-stop').addEventListener('click', function () { stopCart(); });

    window.addEventListener('resize', fitScreen);

    // ---- Boot: straight into the game ----
    refreshCartList();
    setWorking(window.E8_CARTS.EMBER_CATCH);
    fitScreen();
    if (window.fengari) {
      runCart();
    } else {
      setStatus('NO VM');
      showError('fengari-web failed to load from the CDN, so carts cannot run. Check your connection and reload the page.');
    }
    switchTab('play');
    blit();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
