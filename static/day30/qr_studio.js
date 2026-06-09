/* QR Studio — Day 30. Matrix from qrcode-generator (CDN); rendering by us. */
(function () {
  'use strict';

  if (typeof qrcode === 'undefined') {
    // The CDN script failed; we can't continue.
    const preview = document.getElementById('qrs-canvas');
    if (preview) {
      const c = preview.getContext('2d');
      c.fillStyle = '#1A1816'; c.fillRect(0, 0, preview.width, preview.height);
      c.fillStyle = '#FF6B47'; c.font = '16px monospace'; c.textAlign = 'center';
      c.fillText('QR library failed to load', preview.width / 2, preview.height / 2 - 6);
      c.fillStyle = '#A8A29E'; c.font = '12px monospace';
      c.fillText('Check your network and refresh.', preview.width / 2, preview.height / 2 + 16);
    }
    return;
  }

  // ===== Constants =====
  const SHAPES = [
    { id: 'square',  label: 'Square' },
    { id: 'rounded', label: 'Rounded' },
    { id: 'dots',    label: 'Dots' },
    { id: 'classy',  label: 'Classy' },
  ];
  const EYE_SHAPES = [
    { id: 'square',  label: 'Square' },
    { id: 'rounded', label: 'Rounded' },
    { id: 'circle',  label: 'Circle' },
  ];
  const EC_LEVELS = ['L', 'M', 'Q', 'H'];

  const PRESETS = [
    { id: 'mono',    label: 'Mono',    state: { shape: 'square',  fgMode: 'solid',    fg1: '#0F0F0E', bg: '#FFFFFF', eyeShape: 'square',  eyeColor: '#0F0F0E' } },
    { id: 'ember',   label: 'Ember',   state: { shape: 'rounded', fgMode: 'gradient', fg1: '#1A0F0A', fg2: '#D97757', angle: 135, bg: '#FFFFFF', eyeShape: 'rounded', eyeColor: '#D97757' } },
    { id: 'ocean',   label: 'Ocean',   state: { shape: 'classy',  fgMode: 'gradient', fg1: '#0B2538', fg2: '#7BA7CC', angle: 110, bg: '#FFFFFF', eyeShape: 'rounded', eyeColor: '#7BA7CC' } },
    { id: 'mint',    label: 'Mint',    state: { shape: 'dots',    fgMode: 'gradient', fg1: '#0F3B2E', fg2: '#5BAE6F', angle: 90,  bg: '#FAFFFE', eyeShape: 'circle',  eyeColor: '#5BAE6F' } },
    { id: 'glass',   label: 'Glass',   state: { shape: 'rounded', fgMode: 'solid',    fg1: '#1F2937', bg: '#FFFFFF', eyeShape: 'rounded', eyeColor: '#D97757' } },
  ];

  // ===== State =====
  const state = {
    contentType: 'url',
    url: 'https://100dayswithclaude.pythonanywhere.com',
    text: 'Hello from QR Studio.',
    wifi: { ssid: '', pass: '', enc: 'WPA', hidden: false },

    shape: 'rounded',
    fgMode: 'solid',
    fg1: '#0F0F0E', fg2: '#D97757', angle: 135,
    bg: '#FFFFFF', bgTransparent: false,
    eyeShape: 'rounded', eyeColor: '#0F0F0E',
    quietZone: 4,
    ecLevel: 'M',

    logoImg: null,    // HTMLImageElement
    logoSize: 0.20,   // fraction of code

    pngRes: 1024,

    matrix: null,     // 2D boolean array
    matrixN: 0,       // module count

    // last successful render state to detect when we need a matrix rebuild
    lastContent: '',
    lastEC: '',
  };

  // ===== Helpers =====
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.from((r || document).querySelectorAll(s)); }

  function escapeWifi(s) {
    // Standard escape: \, ;, , : "
    return String(s).replace(/([\\;,:"])/g, '\\$1');
  }

  function buildContentString() {
    if (state.contentType === 'url') {
      let u = state.url.trim();
      if (!u) return '';
      if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'https://' + u;
      return u;
    }
    if (state.contentType === 'text') return state.text || '';
    if (state.contentType === 'wifi') {
      const { ssid, pass, enc, hidden } = state.wifi;
      const auth = enc === 'nopass' ? 'nopass' : enc; // WPA / WEP / nopass
      const hStr = hidden ? 'true' : 'false';
      const ssidEsc = escapeWifi(ssid || '');
      const passPart = auth === 'nopass' ? '' : 'P:' + escapeWifi(pass || '') + ';';
      return `WIFI:T:${auth};S:${ssidEsc};${passPart}H:${hStr};;`;
    }
    return '';
  }

  function effectiveEC() {
    // Logo forces H
    return state.logoImg ? 'H' : state.ecLevel;
  }

  function ensureMatrix() {
    const content = buildContentString();
    const ec = effectiveEC();
    if (content === state.lastContent && ec === state.lastEC && state.matrix) return true;
    if (!content) { state.matrix = null; state.matrixN = 0; return false; }
    try {
      const q = qrcode(0, ec);
      q.addData(content);
      q.make();
      const n = q.getModuleCount();
      const m = new Array(n);
      for (let r = 0; r < n; r++) {
        m[r] = new Array(n);
        for (let c = 0; c < n; c++) m[r][c] = q.isDark(r, c);
      }
      state.matrix = m;
      state.matrixN = n;
      state.lastContent = content;
      state.lastEC = ec;
      return true;
    } catch (e) {
      state.matrix = null; state.matrixN = 0;
      return false;
    }
  }

  function isInEye(r, c, n) {
    // Returns 'tl' | 'tr' | 'bl' | null
    if (r < 7 && c < 7) return 'tl';
    if (r < 7 && c >= n - 7) return 'tr';
    if (r >= n - 7 && c < 7) return 'bl';
    return null;
  }
  function eyeOriginCol(eye, n) {
    return (eye === 'tr') ? n - 7 : 0;
  }
  function eyeOriginRow(eye, n) {
    return (eye === 'bl') ? n - 7 : 0;
  }

  function neighborDark(r, c) {
    if (r < 0 || c < 0 || r >= state.matrixN || c >= state.matrixN) return false;
    if (isInEye(r, c, state.matrixN)) return false; // treat eye modules separately for connections
    return !!(state.matrix && state.matrix[r] && state.matrix[r][c]);
  }

  // ===== Rendering =====
  function fillStyleAt(ctx, codePx, codeOffset) {
    if (state.fgMode === 'gradient') {
      const a = state.angle * Math.PI / 180;
      const ax = Math.cos(a), ay = Math.sin(a);
      // Project gradient across the code area
      const cx = codeOffset + codePx / 2, cy = codeOffset + codePx / 2;
      const half = codePx / 2;
      const x0 = cx - ax * half, y0 = cy - ay * half;
      const x1 = cx + ax * half, y1 = cy + ay * half;
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, state.fg1);
      g.addColorStop(1, state.fg2);
      return g;
    }
    return state.fg1;
  }

  function renderToCanvas(canvas, targetPx) {
    if (!ensureMatrix()) {
      const ctx = canvas.getContext('2d');
      canvas.width = targetPx; canvas.height = targetPx;
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, targetPx, targetPx);
      ctx.fillStyle = '#999'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Enter some content', targetPx / 2, targetPx / 2);
      return;
    }
    const n = state.matrixN;
    const totalModules = n + 2 * state.quietZone;
    const cell = Math.floor(targetPx / totalModules);
    const renderPx = cell * totalModules;
    canvas.width = renderPx; canvas.height = renderPx;
    const ctx = canvas.getContext('2d');

    // Background
    if (state.bgTransparent) ctx.clearRect(0, 0, renderPx, renderPx);
    else { ctx.fillStyle = state.bg; ctx.fillRect(0, 0, renderPx, renderPx); }

    const codeOffset = state.quietZone * cell;
    const codePx = n * cell;

    // FG fill (gradient or solid)
    const fg = fillStyleAt(ctx, codePx, codeOffset);

    ctx.fillStyle = fg;

    // Pass 1: regular (non-eye) modules
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!state.matrix[r][c]) continue;
        if (isInEye(r, c, n)) continue;
        const x = codeOffset + c * cell;
        const y = codeOffset + r * cell;
        drawModule(ctx, x, y, cell, state.shape, r, c);
      }
    }

    // Pass 2: eyes
    const eyeFill = state.eyeColor || fg;
    drawEye(ctx, 0, 0, cell, codeOffset, state.eyeShape, eyeFill);
    drawEye(ctx, 0, n - 7, cell, codeOffset, state.eyeShape, eyeFill);
    drawEye(ctx, n - 7, 0, cell, codeOffset, state.eyeShape, eyeFill);

    // Logo
    if (state.logoImg) {
      drawLogo(ctx, renderPx, codeOffset, codePx);
    }
  }

  function drawModule(ctx, x, y, cell, shape, r, c) {
    if (shape === 'square') {
      ctx.fillRect(x, y, cell, cell);
    } else if (shape === 'dots') {
      const cx = x + cell / 2, cy = y + cell / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.42, 0, Math.PI * 2);
      ctx.fill();
    } else if (shape === 'rounded') {
      roundRect(ctx, x + cell * 0.08, y + cell * 0.08, cell * 0.84, cell * 0.84, cell * 0.28);
      ctx.fill();
    } else if (shape === 'classy') {
      // Squircle that "connects" toward orthogonal neighbors
      const t = neighborDark(r - 1, c);
      const b = neighborDark(r + 1, c);
      const l = neighborDark(r, c - 1);
      const rr = neighborDark(r, c + 1);
      const inset = cell * 0.06;
      const rd = cell * 0.32;
      const x0 = x + inset, y0 = y + inset, w = cell - inset * 2, h = cell - inset * 2;
      // Each corner is rounded only if BOTH adjacent edges are without neighbors.
      const tl = (!t && !l) ? rd : 0;
      const tr = (!t && !rr) ? rd : 0;
      const br = (!b && !rr) ? rd : 0;
      const bl = (!b && !l) ? rd : 0;
      roundRectAsym(ctx, x0, y0, w, h, tl, tr, br, bl);
      ctx.fill();
      // Bridge gaps to neighbors
      ctx.fillRect(x, y + inset, inset + 0.5, cell - inset * 2); // left bridge always
      ctx.fillRect(x + cell - inset - 0.5, y + inset, inset + 0.5, cell - inset * 2);
      ctx.fillRect(x + inset, y, cell - inset * 2, inset + 0.5);
      ctx.fillRect(x + inset, y + cell - inset - 0.5, cell - inset * 2, inset + 0.5);
    }
  }

  function drawEye(ctx, rRow, cCol, cell, codeOffset, eyeShape, fill) {
    const px = codeOffset + cCol * cell;
    const py = codeOffset + rRow * cell;
    const size = 7 * cell;
    const innerSize = 3 * cell;
    const innerX = px + 2 * cell;
    const innerY = py + 2 * cell;
    const prev = ctx.fillStyle;
    ctx.fillStyle = fill;
    if (eyeShape === 'square') {
      // Outer ring (frame) using even-odd
      ctx.beginPath();
      ctx.rect(px, py, size, size);
      ctx.rect(px + cell, py + cell, 5 * cell, 5 * cell);
      ctx.fill('evenodd');
      // Inner
      ctx.fillRect(innerX, innerY, innerSize, innerSize);
    } else if (eyeShape === 'rounded') {
      const r1 = cell * 1.8, r2 = cell * 1.0;
      ctx.beginPath();
      pathRoundRect(ctx, px, py, size, size, r1);
      pathRoundRect(ctx, px + cell, py + cell, 5 * cell, 5 * cell, r1 - cell * 0.4);
      ctx.fill('evenodd');
      ctx.beginPath();
      pathRoundRect(ctx, innerX, innerY, innerSize, innerSize, r2);
      ctx.fill();
    } else if (eyeShape === 'circle') {
      const cx = px + size / 2, cy = py + size / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
      ctx.arc(cx, cy, 5 * cell / 2, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
      ctx.beginPath();
      ctx.arc(cx, cy, innerSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = prev;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    pathRoundRect(ctx, x, y, w, h, r);
  }
  function pathRoundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.arcTo(x + w, y, x + w, y + rr, rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
    ctx.lineTo(x + rr, y + h);
    ctx.arcTo(x, y + h, x, y + h - rr, rr);
    ctx.lineTo(x, y + rr);
    ctx.arcTo(x, y, x + rr, y, rr);
    ctx.closePath();
  }
  function roundRectAsym(ctx, x, y, w, h, tl, tr, br, bl) {
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y);
    if (tr > 0) ctx.arcTo(x + w, y, x + w, y + tr, tr); else ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - br);
    if (br > 0) ctx.arcTo(x + w, y + h, x + w - br, y + h, br); else ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + bl, y + h);
    if (bl > 0) ctx.arcTo(x, y + h, x, y + h - bl, bl); else ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + tl);
    if (tl > 0) ctx.arcTo(x, y, x + tl, y, tl); else ctx.lineTo(x, y);
    ctx.closePath();
  }

  function drawLogo(ctx, renderPx, codeOffset, codePx) {
    const target = codePx * state.logoSize;
    const img = state.logoImg;
    let lw = target, lh = target;
    if (img.naturalWidth && img.naturalHeight) {
      const ar = img.naturalWidth / img.naturalHeight;
      if (ar > 1) { lw = target; lh = target / ar; }
      else { lh = target; lw = target * ar; }
    }
    const lx = (renderPx - lw) / 2;
    const ly = (renderPx - lh) / 2;
    const pad = Math.max(6, codePx * 0.02);
    // Padded background
    const px = lx - pad, py = ly - pad, pw = lw + pad * 2, ph = lh + pad * 2;
    ctx.save();
    ctx.fillStyle = state.bgTransparent ? '#FFFFFF' : state.bg;
    roundRect(ctx, px, py, pw, ph, Math.min(pw, ph) * 0.12);
    ctx.fill();
    ctx.drawImage(img, lx, ly, lw, lh);
    ctx.restore();
  }

  // ===== SVG export =====
  function renderToSVG() {
    if (!ensureMatrix()) return null;
    const n = state.matrixN;
    const totalModules = n + 2 * state.quietZone;
    const cell = 20; // arbitrary unit (SVG is scalable)
    const renderPx = totalModules * cell;
    const codeOffset = state.quietZone * cell;
    const codePx = n * cell;

    let defs = '';
    let fgRef = state.fg1;
    if (state.fgMode === 'gradient') {
      const a = state.angle * Math.PI / 180;
      const ax = Math.cos(a), ay = Math.sin(a);
      const cx = codeOffset + codePx / 2, cy = codeOffset + codePx / 2;
      const half = codePx / 2;
      const x0 = (cx - ax * half).toFixed(2), y0 = (cy - ay * half).toFixed(2);
      const x1 = (cx + ax * half).toFixed(2), y1 = (cy + ay * half).toFixed(2);
      defs += `<linearGradient id="qrsFg" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" gradientUnits="userSpaceOnUse">` +
              `<stop offset="0" stop-color="${state.fg1}"/>` +
              `<stop offset="1" stop-color="${state.fg2}"/>` +
              `</linearGradient>`;
      fgRef = 'url(#qrsFg)';
    }

    let bgRect = '';
    if (!state.bgTransparent) {
      bgRect = `<rect width="${renderPx}" height="${renderPx}" fill="${state.bg}"/>`;
    }

    // Modules pass (non-eye)
    let modulesPath = '';
    let dotsPath = '';
    let classyPath = '';
    let pathD = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!state.matrix[r][c]) continue;
        if (isInEye(r, c, n)) continue;
        const x = codeOffset + c * cell;
        const y = codeOffset + r * cell;
        modulesPath += svgModule(state.shape, x, y, cell, r, c);
      }
    }

    // Eyes
    const eyeFill = state.eyeColor || (state.fgMode === 'solid' ? state.fg1 : fgRef);
    const eyes = [
      svgEye(state.eyeShape, codeOffset + 0 * cell, codeOffset + 0 * cell, cell, eyeFill),
      svgEye(state.eyeShape, codeOffset + (n - 7) * cell, codeOffset + 0 * cell, cell, eyeFill),
      svgEye(state.eyeShape, codeOffset + 0 * cell, codeOffset + (n - 7) * cell, cell, eyeFill),
    ].join('');

    // Logo
    let logoSvg = '';
    if (state.logoImg) {
      const img = state.logoImg;
      const target = codePx * state.logoSize;
      let lw = target, lh = target;
      if (img.naturalWidth && img.naturalHeight) {
        const ar = img.naturalWidth / img.naturalHeight;
        if (ar > 1) { lw = target; lh = target / ar; }
        else { lh = target; lw = target * ar; }
      }
      const lx = (renderPx - lw) / 2;
      const ly = (renderPx - lh) / 2;
      const pad = Math.max(6, codePx * 0.02);
      const px = lx - pad, py = ly - pad, pw = lw + pad * 2, ph = lh + pad * 2;
      const padFill = state.bgTransparent ? '#FFFFFF' : state.bg;
      logoSvg = `<rect x="${px.toFixed(2)}" y="${py.toFixed(2)}" width="${pw.toFixed(2)}" height="${ph.toFixed(2)}" rx="${(Math.min(pw,ph)*0.12).toFixed(2)}" fill="${padFill}"/>` +
                `<image href="${img.src}" x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" width="${lw.toFixed(2)}" height="${lh.toFixed(2)}"/>`;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${renderPx} ${renderPx}" width="${renderPx}" height="${renderPx}">` +
           `<defs>${defs}</defs>` +
           bgRect +
           `<g fill="${fgRef}">${modulesPath}</g>` +
           eyes +
           logoSvg +
           `</svg>`;
  }

  function svgModule(shape, x, y, cell, r, c) {
    if (shape === 'square') {
      return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}"/>`;
    }
    if (shape === 'dots') {
      return `<circle cx="${x + cell / 2}" cy="${y + cell / 2}" r="${(cell * 0.42).toFixed(2)}"/>`;
    }
    if (shape === 'rounded') {
      return `<rect x="${x + cell * 0.08}" y="${y + cell * 0.08}" width="${cell * 0.84}" height="${cell * 0.84}" rx="${(cell * 0.28).toFixed(2)}"/>`;
    }
    if (shape === 'classy') {
      const t = neighborDark(r - 1, c), b = neighborDark(r + 1, c), l = neighborDark(r, c - 1), rr = neighborDark(r, c + 1);
      const inset = cell * 0.06, rd = cell * 0.32;
      const x0 = x + inset, y0 = y + inset, w = cell - inset * 2, h = cell - inset * 2;
      const tl = (!t && !l) ? rd : 0;
      const tr = (!t && !rr) ? rd : 0;
      const br = (!b && !rr) ? rd : 0;
      const bl = (!b && !l) ? rd : 0;
      let out = svgRoundRectAsym(x0, y0, w, h, tl, tr, br, bl);
      // Bridges (rect filler), so adjacent classy cells connect visually
      out += `<rect x="${x.toFixed(2)}" y="${(y+inset).toFixed(2)}" width="${(inset+0.5).toFixed(2)}" height="${(cell-inset*2).toFixed(2)}"/>`;
      out += `<rect x="${(x+cell-inset-0.5).toFixed(2)}" y="${(y+inset).toFixed(2)}" width="${(inset+0.5).toFixed(2)}" height="${(cell-inset*2).toFixed(2)}"/>`;
      out += `<rect x="${(x+inset).toFixed(2)}" y="${y.toFixed(2)}" width="${(cell-inset*2).toFixed(2)}" height="${(inset+0.5).toFixed(2)}"/>`;
      out += `<rect x="${(x+inset).toFixed(2)}" y="${(y+cell-inset-0.5).toFixed(2)}" width="${(cell-inset*2).toFixed(2)}" height="${(inset+0.5).toFixed(2)}"/>`;
      return out;
    }
    return '';
  }
  function svgRoundRectAsym(x, y, w, h, tl, tr, br, bl) {
    let d = `M${(x+tl).toFixed(2)},${y.toFixed(2)}`;
    d += `L${(x+w-tr).toFixed(2)},${y.toFixed(2)}`;
    if (tr > 0) d += `Q${(x+w).toFixed(2)},${y.toFixed(2)} ${(x+w).toFixed(2)},${(y+tr).toFixed(2)}`;
    d += `L${(x+w).toFixed(2)},${(y+h-br).toFixed(2)}`;
    if (br > 0) d += `Q${(x+w).toFixed(2)},${(y+h).toFixed(2)} ${(x+w-br).toFixed(2)},${(y+h).toFixed(2)}`;
    d += `L${(x+bl).toFixed(2)},${(y+h).toFixed(2)}`;
    if (bl > 0) d += `Q${x.toFixed(2)},${(y+h).toFixed(2)} ${x.toFixed(2)},${(y+h-bl).toFixed(2)}`;
    d += `L${x.toFixed(2)},${(y+tl).toFixed(2)}`;
    if (tl > 0) d += `Q${x.toFixed(2)},${y.toFixed(2)} ${(x+tl).toFixed(2)},${y.toFixed(2)}`;
    d += 'Z';
    return `<path d="${d}"/>`;
  }
  function svgEye(eyeShape, x, y, cell, fill) {
    const size = 7 * cell;
    const innerX = x + 2 * cell, innerY = y + 2 * cell, innerSize = 3 * cell;
    if (eyeShape === 'square') {
      return `<g fill="${fill}">` +
             `<path fill-rule="evenodd" d="M${x},${y}h${size}v${size}h${-size}z M${x+cell},${y+cell}h${5*cell}v${5*cell}h${-5*cell}z"/>` +
             `<rect x="${innerX}" y="${innerY}" width="${innerSize}" height="${innerSize}"/>` +
             `</g>`;
    }
    if (eyeShape === 'rounded') {
      const r1 = cell * 1.8, r2 = cell * 1.0;
      return `<g fill="${fill}">` +
             `<path fill-rule="evenodd" d="${pathRoundRectStr(x, y, size, size, r1)} ${pathRoundRectStr(x+cell, y+cell, 5*cell, 5*cell, r1-cell*0.4)}"/>` +
             `<rect x="${innerX}" y="${innerY}" width="${innerSize}" height="${innerSize}" rx="${r2}"/>` +
             `</g>`;
    }
    if (eyeShape === 'circle') {
      const cx = x + size / 2, cy = y + size / 2;
      return `<g fill="${fill}">` +
             `<path fill-rule="evenodd" d="M${cx-size/2},${cy} a${size/2},${size/2} 0 1,0 ${size},0 a${size/2},${size/2} 0 1,0 ${-size},0 M${cx-5*cell/2},${cy} a${5*cell/2},${5*cell/2} 0 1,0 ${5*cell},0 a${5*cell/2},${5*cell/2} 0 1,0 ${-5*cell},0"/>` +
             `<circle cx="${cx}" cy="${cy}" r="${innerSize/2}"/>` +
             `</g>`;
    }
    return '';
  }
  function pathRoundRectStr(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    return `M${x+rr},${y} L${x+w-rr},${y} Q${x+w},${y} ${x+w},${y+rr} L${x+w},${y+h-rr} Q${x+w},${y+h} ${x+w-rr},${y+h} L${x+rr},${y+h} Q${x},${y+h} ${x},${y+h-rr} L${x},${y+rr} Q${x},${y} ${x+rr},${y} Z`;
  }

  // ===== Scannability warnings =====
  function checkScannability() {
    const w = $('#qrs-warning');
    const reasons = [];
    if (state.shape === 'dots' && state.ecLevel === 'L' && !state.logoImg) {
      reasons.push('Dots + EC L is risky — raise EC to M or H for reliable scanning.');
    }
    // Low contrast estimate
    const fgL = relLuminance(state.fg1);
    const bgL = state.bgTransparent ? 1 : relLuminance(state.bg);
    const ratio = (Math.max(fgL, bgL) + 0.05) / (Math.min(fgL, bgL) + 0.05);
    if (ratio < 2.5) reasons.push('Low contrast between foreground and background may fail to scan.');
    // Logo size
    if (state.logoImg && state.logoSize > 0.25) {
      reasons.push('Large logo — keep it ≤ 22% of the code.');
    }
    if (reasons.length === 0) { w.classList.add('is-hidden'); w.textContent = ''; }
    else { w.classList.remove('is-hidden'); w.textContent = reasons.join(' '); }
  }
  function relLuminance(hex) {
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16) / 255;
    const g = parseInt(c.substring(2, 4), 16) / 255;
    const b = parseInt(c.substring(4, 6), 16) / 255;
    function ch(x) { return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
  }

  // ===== UI binding =====
  function rerender() {
    state.lastContent = ''; // force matrix rebuild on next ensure if content changed
    renderToCanvas($('#qrs-canvas'), 640);
    checkScannability();
  }
  function rerenderStyleOnly() {
    renderToCanvas($('#qrs-canvas'), 640);
    checkScannability();
  }

  function bindTabs() {
    const tabs = $$('.qrs-tab');
    function activate(name) {
      state.contentType = name;
      tabs.forEach(t => t.setAttribute('aria-selected', t.dataset.tab === name ? 'true' : 'false'));
      $$('.qrs-tab-body').forEach(b => b.classList.toggle('is-hidden', b.id !== 'qrs-tab-' + name));
      rerender();
    }
    tabs.forEach(t => t.addEventListener('click', () => activate(t.dataset.tab)));
  }
  function bindContentFields() {
    $('#qrs-url').addEventListener('input', (e) => { state.url = e.target.value; rerender(); });
    $('#qrs-text').addEventListener('input', (e) => { state.text = e.target.value; rerender(); });
    $('#qrs-wifi-ssid').addEventListener('input', (e) => { state.wifi.ssid = e.target.value; rerender(); });
    $('#qrs-wifi-pass').addEventListener('input', (e) => { state.wifi.pass = e.target.value; rerender(); });
    $('#qrs-wifi-enc').addEventListener('change', (e) => { state.wifi.enc = e.target.value; rerender(); });
    $('#qrs-wifi-hidden').addEventListener('change', (e) => { state.wifi.hidden = e.target.checked; rerender(); });
  }
  function bindStyleChips() {
    const sR = $('#qrs-shape-chips');
    SHAPES.forEach(s => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'qrs-chip'; b.textContent = s.label;
      b.dataset.id = s.id;
      b.addEventListener('click', () => {
        state.shape = s.id; markActive(sR, s.id);
        rerenderStyleOnly(); persist();
      });
      sR.appendChild(b);
    });
    markActive(sR, state.shape);

    const eR = $('#qrs-eye-chips');
    EYE_SHAPES.forEach(s => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'qrs-chip'; b.textContent = s.label;
      b.dataset.id = s.id;
      b.addEventListener('click', () => {
        state.eyeShape = s.id; markActive(eR, s.id);
        rerenderStyleOnly(); persist();
      });
      eR.appendChild(b);
    });
    markActive(eR, state.eyeShape);

    const ecR = $('#qrs-ec-chips');
    EC_LEVELS.forEach(lev => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'qrs-ec-chip'; b.textContent = lev;
      b.dataset.id = lev;
      b.addEventListener('click', () => {
        state.ecLevel = lev; markActive(ecR, lev, 'qrs-ec-chip');
        rerender(); persist();
      });
      ecR.appendChild(b);
    });
    markActive(ecR, state.ecLevel, 'qrs-ec-chip');

    const pR = $('#qrs-preset-chips');
    PRESETS.forEach(p => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'qrs-chip'; b.textContent = p.label;
      b.addEventListener('click', () => applyPreset(p));
      pR.appendChild(b);
    });
  }
  function markActive(root, id, className) {
    const cls = className || 'qrs-chip';
    $$('.' + cls, root).forEach(c => c.dataset.active = (c.dataset.id === id) ? 'true' : 'false');
  }

  function bindStyleControls() {
    document.querySelectorAll('input[name="qrs-fg-mode"]').forEach(r => r.addEventListener('change', () => {
      const v = document.querySelector('input[name="qrs-fg-mode"]:checked').value;
      state.fgMode = v;
      $$('.qrs-fg-color2').forEach(el => el.classList.toggle('is-hidden', v !== 'gradient'));
      rerenderStyleOnly(); persist();
    }));
    $$('.qrs-fg-color2').forEach(el => el.classList.toggle('is-hidden', state.fgMode !== 'gradient'));

    $('#qrs-fg-color1').addEventListener('input', (e) => { state.fg1 = e.target.value; rerenderStyleOnly(); persist(); });
    $('#qrs-fg-color2').addEventListener('input', (e) => { state.fg2 = e.target.value; rerenderStyleOnly(); persist(); });
    $('#qrs-fg-angle').addEventListener('input', (e) => { state.angle = parseInt(e.target.value, 10); rerenderStyleOnly(); });
    $('#qrs-bg-color').addEventListener('input', (e) => { state.bg = e.target.value; rerenderStyleOnly(); persist(); });
    $('#qrs-bg-transparent').addEventListener('change', (e) => { state.bgTransparent = e.target.checked; rerenderStyleOnly(); persist(); });
    $('#qrs-eye-color').addEventListener('input', (e) => { state.eyeColor = e.target.value; rerenderStyleOnly(); persist(); });

    const qz = $('#qrs-quiet');
    qz.addEventListener('input', () => { state.quietZone = parseInt(qz.value, 10); $('#qrs-quiet-val').textContent = state.quietZone; rerenderStyleOnly(); persist(); });
  }

  function bindLogo() {
    const input = $('#qrs-logo-input');
    const remove = $('#qrs-logo-remove');
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          state.logoImg = img;
          remove.disabled = false;
          // Force EC=H visually
          markActive($('#qrs-ec-chips'), 'H', 'qrs-ec-chip');
          rerender();
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
    remove.addEventListener('click', () => {
      state.logoImg = null;
      input.value = '';
      remove.disabled = true;
      markActive($('#qrs-ec-chips'), state.ecLevel, 'qrs-ec-chip');
      rerender();
    });
  }

  function applyPreset(p) {
    const s = p.state;
    Object.keys(s).forEach(k => { if (k in state) state[k] = s[k]; });
    // Sync controls
    document.querySelector(`input[name="qrs-fg-mode"][value="${state.fgMode}"]`).checked = true;
    $$('.qrs-fg-color2').forEach(el => el.classList.toggle('is-hidden', state.fgMode !== 'gradient'));
    $('#qrs-fg-color1').value = state.fg1;
    if (state.fg2) $('#qrs-fg-color2').value = state.fg2;
    if (state.angle != null) $('#qrs-fg-angle').value = state.angle;
    $('#qrs-bg-color').value = state.bg;
    $('#qrs-eye-color').value = state.eyeColor;
    markActive($('#qrs-shape-chips'), state.shape);
    markActive($('#qrs-eye-chips'), state.eyeShape);
    rerenderStyleOnly();
    persist();
  }

  function bindExports() {
    $('#qrs-png-res').addEventListener('change', (e) => { state.pngRes = parseInt(e.target.value, 10); });
    $('#qrs-export-png').addEventListener('click', () => {
      const c = document.createElement('canvas');
      renderToCanvas(c, state.pngRes);
      c.toBlob((blob) => {
        if (!blob) return;
        download(URL.createObjectURL(blob), 'qr.png');
      }, 'image/png');
    });
    $('#qrs-export-svg').addEventListener('click', () => {
      const svg = renderToSVG();
      if (!svg) return;
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      download(URL.createObjectURL(blob), 'qr.svg');
    });
  }
  function download(href, name) {
    const a = document.createElement('a');
    a.href = href; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1500);
  }

  // ===== Persistence =====
  function persist() {
    try {
      localStorage.setItem('qrs_v1', JSON.stringify({
        shape: state.shape, fgMode: state.fgMode, fg1: state.fg1, fg2: state.fg2, angle: state.angle,
        bg: state.bg, bgTransparent: state.bgTransparent,
        eyeShape: state.eyeShape, eyeColor: state.eyeColor,
        quietZone: state.quietZone, ecLevel: state.ecLevel,
      }));
    } catch (e) {}
  }
  function loadPersisted() {
    try {
      const raw = localStorage.getItem('qrs_v1');
      if (!raw) return;
      const s = JSON.parse(raw);
      ['shape', 'fgMode', 'fg1', 'fg2', 'bg', 'eyeShape', 'eyeColor'].forEach(k => { if (typeof s[k] === 'string') state[k] = s[k]; });
      if (typeof s.angle === 'number') state.angle = s.angle;
      if (typeof s.bgTransparent === 'boolean') state.bgTransparent = s.bgTransparent;
      if (Number.isInteger(s.quietZone) && s.quietZone >= 0 && s.quietZone <= 10) state.quietZone = s.quietZone;
      if (EC_LEVELS.includes(s.ecLevel)) state.ecLevel = s.ecLevel;
    } catch (e) {}
  }

  // ===== Boot =====
  function init() {
    loadPersisted();
    // Sync controls
    $('#qrs-url').value = state.url;
    $('#qrs-text').value = state.text;
    $('#qrs-fg-color1').value = state.fg1;
    $('#qrs-fg-color2').value = state.fg2;
    $('#qrs-fg-angle').value = state.angle;
    $('#qrs-bg-color').value = state.bg;
    $('#qrs-bg-transparent').checked = state.bgTransparent;
    $('#qrs-eye-color').value = state.eyeColor;
    $('#qrs-quiet').value = state.quietZone;
    $('#qrs-quiet-val').textContent = state.quietZone;
    document.querySelector(`input[name="qrs-fg-mode"][value="${state.fgMode}"]`).checked = true;

    bindTabs();
    bindContentFields();
    bindStyleChips();
    bindStyleControls();
    bindLogo();
    bindExports();

    rerender();
  }

  // Expose internals for headless testing.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { escapeWifi };
  }

  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})();
