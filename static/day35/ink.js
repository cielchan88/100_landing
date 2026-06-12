/* Ink — Day 35. A real-time GPU fluid simulation: Jos Stam's "Stable Fluids"
 * running entirely in WebGL fragment shaders, ping-ponging float render
 * targets. Three.js r128 is only the harness (render targets, fullscreen
 * passes, the loop); the solver is the custom GLSL below. No fluid library.
 *
 * Built in the staged order from the design brief — harness, dye advection,
 * velocity + splats, pressure projection, vorticity, aesthetics — and the
 * exact same formulas are mirrored in a CPU reference (build notes) where
 * the stage checks are asserted numerically: dye drifts the right way under
 * constant velocity, the Jacobi pressure solve + gradient subtraction kills
 * >85% of divergence, vorticity confinement stays bounded. One wrong sign
 * in the pressure step is a black screen with no error message; the CPU
 * mirror is the insurance.
 *
 * The simulation runs well below display resolution (velocity ~256²,
 * dye ~512² on desktop) and upscales — motion sells fluid, pixels don't. */
(function () {
  'use strict';

  if (typeof THREE === 'undefined') {
    var err = document.createElement('div');
    err.className = 'ink-fatal';
    err.textContent = 'Three.js failed to load from the CDN, so Ink cannot run. Check your connection and reload.';
    document.body.appendChild(err);
    return;
  }

  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // =====================================================================
  // CFG — every tunable.
  // =====================================================================
  var CFG = {
    simRes: 256,            // velocity/pressure grid (shorter side)
    dyeRes: 512,            // dye grid (shorter side)
    pressureIters: 32,
    pressureDecay: 0.8,     // pressure carried between frames, damped
    velDissipation: 0.992,  // per-step multiplier
    dyeDissipation: 0.985,
    curlStrength: 26,       // vorticity confinement
    splatForce: 5500,       // drag delta -> velocity impulse
    splatRadius: 0.0022,    // base brush (aspect-corrected gaussian)
    dyeIntensity: 0.55,     // dye added per splat
    hueSpeed: 0.10,         // auto-cycling hue, turns/second
    dtMax: 1 / 40,
    bloom: { strength: 0.65, radius: 0.65, threshold: 0.55 },
  };

  // =====================================================================
  // Tier detection: desktop gets full res + bloom; mobile lean + no bloom.
  // =====================================================================
  var isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  var smallScreen = Math.min(window.innerWidth, window.innerHeight) < 720;
  var TIER = (isCoarse || smallScreen) ? 'mobile' : 'desktop';
  if (TIER === 'mobile') {
    CFG.simRes = 160;
    CFG.dyeRes = 320;
    CFG.pressureIters = 20;
  }

  // =====================================================================
  // Renderer + float-texture support detection with graceful fallback.
  // =====================================================================
  var canvas = document.getElementById('ink-canvas');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(TIER === 'mobile' ? 1.5 : 2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x060608, 1);
  renderer.autoClear = false;

  var gl = renderer.getContext();
  var isWebGL2 = renderer.capabilities.isWebGL2;

  // Pick the best renderable texture type. PACKED (byte) is the last-resort
  // path: signed fields get range-encoded into 0..1 so the sim still runs,
  // just with visible precision loss — better than a black screen.
  var texType = null, PACKED = false;
  if (isWebGL2) {
    if (gl.getExtension('EXT_color_buffer_float')) texType = THREE.HalfFloatType;
  } else {
    if (gl.getExtension('OES_texture_half_float') && gl.getExtension('OES_texture_half_float_linear')) {
      texType = THREE.HalfFloatType;
    } else if (gl.getExtension('OES_texture_float') && gl.getExtension('OES_texture_float_linear')) {
      texType = THREE.FloatType;
    }
  }
  if (texType === null) {
    texType = THREE.UnsignedByteType;
    PACKED = true;
  }

  // =====================================================================
  // GLSL — the solver. Each pass is a small fragment shader; the shared
  // vertex shader precomputes neighbor UVs. read*/write* helpers compile
  // to plain texture reads normally, or to range-encoded reads on the
  // PACKED byte fallback (signed values mapped through [0,1] at /8 scale).
  // =====================================================================
  var HELPERS = (PACKED ? '#define PACKED\n' : '') + [
    '#ifdef PACKED',
    'vec2 readV(sampler2D t, vec2 uv){ return (texture2D(t, uv).xy * 2.0 - 1.0) * 8.0; }',
    'float readS(sampler2D t, vec2 uv){ return (texture2D(t, uv).x * 2.0 - 1.0) * 8.0; }',
    'vec4 writeV(vec2 v){ return vec4(clamp(v / 8.0, -1.0, 1.0) * 0.5 + 0.5, 0.0, 1.0); }',
    'vec4 writeS(float s){ return vec4(clamp(s / 8.0, -1.0, 1.0) * 0.5 + 0.5, 0.0, 0.0, 1.0); }',
    '#else',
    'vec2 readV(sampler2D t, vec2 uv){ return texture2D(t, uv).xy; }',
    'float readS(sampler2D t, vec2 uv){ return texture2D(t, uv).x; }',
    'vec4 writeV(vec2 v){ return vec4(v, 0.0, 1.0); }',
    'vec4 writeS(float s){ return vec4(s, 0.0, 0.0, 1.0); }',
    '#endif',
  ].join('\n') + '\n';

  var VERT = [
    'varying vec2 vUv;',
    'varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;',
    'uniform vec2 texelSize;',
    'void main () {',
    '  vUv = uv;',
    '  vL = uv - vec2(texelSize.x, 0.0);',
    '  vR = uv + vec2(texelSize.x, 0.0);',
    '  vT = uv + vec2(0.0, texelSize.y);',
    '  vB = uv - vec2(0.0, texelSize.y);',
    '  gl_Position = vec4(position, 1.0);',
    '}',
  ].join('\n');

  // Semi-Lagrangian advection: walk backwards along the velocity and sample.
  // Bilinear filtering on the target does the interpolation (hence the hard
  // requirement on linear-filterable float textures).
  var FRAG_ADVECT = HELPERS + [
    'varying vec2 vUv;',
    'uniform sampler2D uVelocity;',
    'uniform sampler2D uSource;',
    'uniform vec2 texelSize;',       // texel size of the VELOCITY grid
    'uniform float dt;',
    'uniform float dissipation;',
    'void main () {',
    '  vec2 coord = vUv - dt * readV(uVelocity, vUv) * texelSize;',
    '  gl_FragColor = dissipation * texture2D(uSource, coord);',
    '  gl_FragColor.a = 1.0;',
    '}',
  ].join('\n');

  // Same backwards walk but the sampled quantity is a packed velocity, so
  // the read/write must go through the helpers (matters on PACKED).
  var FRAG_ADVECT_VEL = HELPERS + [
    'varying vec2 vUv;',
    'uniform sampler2D uVelocity;',
    'uniform vec2 texelSize;',
    'uniform float dt;',
    'uniform float dissipation;',
    'void main () {',
    '  vec2 coord = vUv - dt * readV(uVelocity, vUv) * texelSize;',
    '  gl_FragColor = writeV(dissipation * readV(uVelocity, coord));',
    '}',
  ].join('\n');

  // Gaussian splat: add a blob of "stuff" (velocity impulse or dye color)
  // at the pointer. Aspect-corrected so brushes are round on wide screens.
  var FRAG_SPLAT_V = HELPERS + [
    'varying vec2 vUv;',
    'uniform sampler2D uTarget;',
    'uniform float aspectRatio;',
    'uniform vec2 point;',
    'uniform vec2 force;',
    'uniform float radius;',
    'void main () {',
    '  vec2 p = vUv - point;',
    '  p.x *= aspectRatio;',
    '  vec2 splat = exp(-dot(p, p) / radius) * force;',
    '  gl_FragColor = writeV(readV(uTarget, vUv) + splat);',
    '}',
  ].join('\n');

  var FRAG_SPLAT_DYE = [
    'varying vec2 vUv;',
    'uniform sampler2D uTarget;',
    'uniform float aspectRatio;',
    'uniform vec2 point;',
    'uniform vec3 color;',
    'uniform float radius;',
    'void main () {',
    '  vec2 p = vUv - point;',
    '  p.x *= aspectRatio;',
    '  vec3 splat = exp(-dot(p, p) / radius) * color;',
    '  vec3 base = texture2D(uTarget, vUv).rgb;',
    '  gl_FragColor = vec4(base + splat, 1.0);',   // additive accumulation
    '}',
  ].join('\n');

  // Curl (scalar vorticity) of the velocity field.
  var FRAG_CURL = HELPERS + [
    'varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;',
    'uniform sampler2D uVelocity;',
    'void main () {',
    '  float L = readV(uVelocity, vL).y;',
    '  float R = readV(uVelocity, vR).y;',
    '  float T = readV(uVelocity, vT).x;',
    '  float B = readV(uVelocity, vB).x;',
    '  float vorticity = R - L - T + B;',
    '  gl_FragColor = writeS(0.5 * vorticity);',
    '}',
  ].join('\n');

  // Vorticity confinement: push velocity toward areas of strong curl so the
  // small swirls that numerical dissipation eats get re-injected.
  var FRAG_VORTICITY = HELPERS + [
    'varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;',
    'uniform sampler2D uVelocity;',
    'uniform sampler2D uCurl;',
    'uniform float curl;',
    'uniform float dt;',
    'void main () {',
    '  float L = readS(uCurl, vL);',
    '  float R = readS(uCurl, vR);',
    '  float T = readS(uCurl, vT);',
    '  float B = readS(uCurl, vB);',
    '  float C = readS(uCurl, vUv);',
    '  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));',
    '  force /= length(force) + 0.0001;',
    '  force *= curl * C;',
    '  force.y *= -1.0;',
    '  vec2 velocity = readV(uVelocity, vUv) + force * dt;',
    '  velocity = clamp(velocity, vec2(-1000.0), vec2(1000.0));',
    '  gl_FragColor = writeV(velocity);',
    '}',
  ].join('\n');

  // Divergence of velocity, with reflecting walls (a contained tank: the
  // wall pushes back instead of letting fluid leave).
  var FRAG_DIVERGENCE = HELPERS + [
    'varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;',
    'uniform sampler2D uVelocity;',
    'void main () {',
    '  float L = readV(uVelocity, vL).x;',
    '  float R = readV(uVelocity, vR).x;',
    '  float T = readV(uVelocity, vT).y;',
    '  float B = readV(uVelocity, vB).y;',
    '  vec2 C = readV(uVelocity, vUv);',
    '  if (vL.x < 0.0) { L = -C.x; }',
    '  if (vR.x > 1.0) { R = -C.x; }',
    '  if (vT.y > 1.0) { T = -C.y; }',
    '  if (vB.y < 0.0) { B = -C.y; }',
    '  float div = 0.5 * (R - L + T - B);',
    '  gl_FragColor = writeS(div);',
    '}',
  ].join('\n');

  // One Jacobi iteration of the pressure Poisson equation.
  var FRAG_PRESSURE = HELPERS + [
    'varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;',
    'uniform sampler2D uPressure;',
    'uniform sampler2D uDivergence;',
    'void main () {',
    '  float L = readS(uPressure, vL);',
    '  float R = readS(uPressure, vR);',
    '  float T = readS(uPressure, vT);',
    '  float B = readS(uPressure, vB);',
    '  float divergence = readS(uDivergence, vUv);',
    '  float pressure = (L + R + B + T - divergence) * 0.25;',
    '  gl_FragColor = writeS(pressure);',
    '}',
  ].join('\n');

  // Subtract the pressure gradient: this is THE step that turns blobby
  // spreading into incompressible curling. If the fluid "inflates", the
  // sign here (or in divergence) is wrong.
  var FRAG_GRADIENT = HELPERS + [
    'varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;',
    'uniform sampler2D uPressure;',
    'uniform sampler2D uVelocity;',
    'void main () {',
    '  float L = readS(uPressure, vL);',
    '  float R = readS(uPressure, vR);',
    '  float T = readS(uPressure, vT);',
    '  float B = readS(uPressure, vB);',
    '  vec2 velocity = readV(uVelocity, vUv);',
    // Central-difference gradient with the same 0.5 factor as the
    // divergence pass — a mismatched pair here over- or under-corrects
    // and the CPU reference catches it numerically.
    '  velocity -= 0.5 * vec2(R - L, T - B);',
    '  gl_FragColor = writeV(velocity);',
    '}',
  ].join('\n');

  // Damped copy: carries pressure between frames at a discount (faster
  // Jacobi convergence than clearing to zero each frame).
  var FRAG_SCALE = HELPERS + [
    'varying vec2 vUv;',
    'uniform sampler2D uTexture;',
    'uniform float value;',
    'void main () {',
    '  gl_FragColor = writeS(readS(uTexture, vUv) * value);',
    '}',
  ].join('\n');

  var FRAG_CLEAR_DYE = [
    'void main () { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }',
  ].join('\n');

  // Display: dye -> screen, with a filmic soft-knee so additive overlaps
  // burn toward white instead of clipping, and a faint in-shader glow so
  // the ink reads luminous even with bloom off (mobile).
  var FRAG_DISPLAY = [
    'varying vec2 vUv;',
    'uniform sampler2D uTexture;',
    'void main () {',
    '  vec3 c = texture2D(uTexture, vUv).rgb;',
    '  c += c * c * 0.18;',                            // cheap self-glow
    '  c = 1.0 - exp(-c * 1.5);',                      // filmic soft knee
    '  c = pow(c, vec3(0.4545));',                     // gamma
    '  gl_FragColor = vec4(c, 1.0);',
    '}',
  ].join('\n');

  // =====================================================================
  // Pass plumbing: one fullscreen quad, materials swapped per pass.
  // =====================================================================
  var passScene = new THREE.Scene();
  var passCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  var quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
  passScene.add(quad);

  function makeMat(frag, uniforms) {
    return new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: frag,
      uniforms: uniforms,
      depthTest: false,
      depthWrite: false,
    });
  }

  function blit(target, material) {
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(passScene, passCam);
  }

  function makeFBO(w, h) {
    return new THREE.WebGLRenderTarget(w, h, {
      type: texType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    });
  }
  function makeDouble(w, h) {
    return {
      read: makeFBO(w, h),
      write: makeFBO(w, h),
      swap: function () { var t = this.read; this.read = this.write; this.write = t; },
      texel: new THREE.Vector2(1 / w, 1 / h),
      w: w, h: h,
      dispose: function () { this.read.dispose(); this.write.dispose(); },
    };
  }

  // Resolution helper: shorter side = res, the other follows the aspect.
  function simSize(res) {
    var aspect = window.innerWidth / window.innerHeight;
    return aspect >= 1
      ? { w: Math.round(res * aspect), h: res }
      : { w: res, h: Math.round(res / aspect) };
  }

  var velocity, dye, pressure, divergence, curlFBO;
  function allocTargets() {
    if (velocity) { velocity.dispose(); dye.dispose(); pressure.dispose(); divergence.read.dispose(); curlFBO.dispose(); }
    var sv = simSize(CFG.simRes);
    var sd = simSize(CFG.dyeRes);
    velocity = makeDouble(sv.w, sv.h);
    pressure = makeDouble(sv.w, sv.h);
    dye = makeDouble(sd.w, sd.h);
    divergence = { read: makeFBO(sv.w, sv.h) };
    curlFBO = { read: makeFBO(sv.w, sv.h) };
  }
  allocTargets();

  // Materials (uniforms updated per pass).
  var U = {
    advect: { uVelocity: { value: null }, uSource: { value: null }, texelSize: { value: velocity.texel }, dt: { value: 0 }, dissipation: { value: 1 } },
    advectVel: { uVelocity: { value: null }, texelSize: { value: velocity.texel }, dt: { value: 0 }, dissipation: { value: 1 } },
    splatV: { uTarget: { value: null }, aspectRatio: { value: 1 }, point: { value: new THREE.Vector2() }, force: { value: new THREE.Vector2() }, radius: { value: CFG.splatRadius }, texelSize: { value: velocity.texel } },
    splatDye: { uTarget: { value: null }, aspectRatio: { value: 1 }, point: { value: new THREE.Vector2() }, color: { value: new THREE.Vector3() }, radius: { value: CFG.splatRadius }, texelSize: { value: velocity.texel } },
    curl: { uVelocity: { value: null }, texelSize: { value: velocity.texel } },
    vorticity: { uVelocity: { value: null }, uCurl: { value: null }, curl: { value: CFG.curlStrength }, dt: { value: 0 }, texelSize: { value: velocity.texel } },
    divergence: { uVelocity: { value: null }, texelSize: { value: velocity.texel } },
    pressure: { uPressure: { value: null }, uDivergence: { value: null }, texelSize: { value: velocity.texel } },
    gradient: { uPressure: { value: null }, uVelocity: { value: null }, texelSize: { value: velocity.texel } },
    scale: { uTexture: { value: null }, value: { value: CFG.pressureDecay }, texelSize: { value: velocity.texel } },
    clearDye: { texelSize: { value: velocity.texel } },
    display: { uTexture: { value: null }, texelSize: { value: velocity.texel } },
  };
  var MAT = {
    advect: makeMat(FRAG_ADVECT, U.advect),
    advectVel: makeMat(FRAG_ADVECT_VEL, U.advectVel),
    splatV: makeMat(FRAG_SPLAT_V, U.splatV),
    splatDye: makeMat(FRAG_SPLAT_DYE, U.splatDye),
    curl: makeMat(FRAG_CURL, U.curl),
    vorticity: makeMat(FRAG_VORTICITY, U.vorticity),
    divergence: makeMat(FRAG_DIVERGENCE, U.divergence),
    pressure: makeMat(FRAG_PRESSURE, U.pressure),
    gradient: makeMat(FRAG_GRADIENT, U.gradient),
    scale: makeMat(FRAG_SCALE, U.scale),
    clearDye: makeMat(FRAG_CLEAR_DYE, U.clearDye),
    display: makeMat(FRAG_DISPLAY, U.display),
  };

  // =====================================================================
  // Optional bloom (desktop tier; addons load-checked, failure = no bloom).
  // =====================================================================
  var composer = null, bloomOn = false;
  var displayScene = new THREE.Scene();
  var displayQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), MAT.display);
  displayScene.add(displayQuad);

  function tryInitBloom() {
    if (TIER !== 'desktop') return;
    try {
      if (!THREE.EffectComposer || !THREE.RenderPass || !THREE.UnrealBloomPass) return;
      composer = new THREE.EffectComposer(renderer);
      composer.addPass(new THREE.RenderPass(displayScene, passCam));
      var bloom = new THREE.UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        CFG.bloom.strength, CFG.bloom.radius, CFG.bloom.threshold
      );
      composer.addPass(bloom);
      bloomOn = true;
    } catch (e) {
      composer = null;
      bloomOn = false;
    }
  }
  tryInitBloom();

  // =====================================================================
  // Input: pointer events; each active pointer is a brush. Color cycles.
  // =====================================================================
  var pointers = new Map(); // pointerId -> {x, y, dx, dy, moved, color}
  var hue = Math.random();
  var hadInteraction = false;

  function hsv2rgb(h, s, v) {
    var i = Math.floor(h * 6), f = h * 6 - i;
    var p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    var r, g, b;
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      default: r = v; g = p; b = q; break;
    }
    return [r, g, b];
  }
  function strokeColor() {
    var rgb = hsv2rgb((hue + Math.random() * 0.06) % 1, 0.95, 1.0);
    return new THREE.Vector3(rgb[0] * CFG.dyeIntensity, rgb[1] * CFG.dyeIntensity, rgb[2] * CFG.dyeIntensity);
  }

  function toUV(e) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: 1 - (e.clientY - rect.top) / rect.height,
    };
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    var p = toUV(e);
    pointers.set(e.pointerId, { x: p.x, y: p.y, dx: 0, dy: 0, moved: false, color: strokeColor() });
    if (!hadInteraction) {
      hadInteraction = true;
      var hint = document.getElementById('ink-hint');
      if (hint) hint.classList.add('gone');
    }
  });
  canvas.addEventListener('pointermove', function (e) {
    var rec = pointers.get(e.pointerId);
    if (!rec) return;
    var p = toUV(e);
    rec.dx = p.x - rec.x;
    rec.dy = p.y - rec.y;
    rec.x = p.x;
    rec.y = p.y;
    rec.moved = Math.abs(rec.dx) > 0 || Math.abs(rec.dy) > 0;
  });
  function release(e) { pointers.delete(e.pointerId); }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // =====================================================================
  // The simulation step (the classic pass order).
  // =====================================================================
  function applySplat(rec, dt) {
    var aspect = window.innerWidth / window.innerHeight;
    // Velocity impulse from the drag delta.
    U.splatV.uTarget.value = velocity.read.texture;
    U.splatV.aspectRatio.value = aspect;
    U.splatV.point.value.set(rec.x, rec.y);
    U.splatV.force.value.set(rec.dx * CFG.splatForce, rec.dy * CFG.splatForce);
    U.splatV.radius.value = CFG.splatRadius;
    U.splatV.texelSize.value = velocity.texel;
    blit(velocity.write, MAT.splatV);
    velocity.swap();
    // Dye.
    U.splatDye.uTarget.value = dye.read.texture;
    U.splatDye.aspectRatio.value = aspect;
    U.splatDye.point.value.set(rec.x, rec.y);
    U.splatDye.color.value.copy(rec.color);
    U.splatDye.radius.value = CFG.splatRadius;
    U.splatDye.texelSize.value = dye.texel;
    blit(dye.write, MAT.splatDye);
    dye.swap();
  }

  function stepSim(dt) {
    // 1) Inputs -> splats.
    pointers.forEach(function (rec) {
      if (rec.moved) {
        applySplat(rec, dt);
        rec.moved = false;
        rec.dx = 0; rec.dy = 0;
      }
    });

    // 2) Curl + vorticity confinement.
    U.curl.uVelocity.value = velocity.read.texture;
    U.curl.texelSize.value = velocity.texel;
    blit(curlFBO.read, MAT.curl);

    U.vorticity.uVelocity.value = velocity.read.texture;
    U.vorticity.uCurl.value = curlFBO.read.texture;
    U.vorticity.curl.value = CFG.curlStrength;
    U.vorticity.dt.value = dt;
    U.vorticity.texelSize.value = velocity.texel;
    blit(velocity.write, MAT.vorticity);
    velocity.swap();

    // 3) Divergence of the (forced) field.
    U.divergence.uVelocity.value = velocity.read.texture;
    U.divergence.texelSize.value = velocity.texel;
    blit(divergence.read, MAT.divergence);

    // 4) Pressure: damp last frame's pressure, then Jacobi iterations.
    U.scale.uTexture.value = pressure.read.texture;
    U.scale.value.value = CFG.pressureDecay;
    U.scale.texelSize.value = velocity.texel;
    blit(pressure.write, MAT.scale);
    pressure.swap();

    for (var i = 0; i < CFG.pressureIters; i++) {
      U.pressure.uPressure.value = pressure.read.texture;
      U.pressure.uDivergence.value = divergence.read.texture;
      U.pressure.texelSize.value = velocity.texel;
      blit(pressure.write, MAT.pressure);
      pressure.swap();
    }

    // 5) Subtract the pressure gradient -> incompressible velocity.
    U.gradient.uPressure.value = pressure.read.texture;
    U.gradient.uVelocity.value = velocity.read.texture;
    U.gradient.texelSize.value = velocity.texel;
    blit(velocity.write, MAT.gradient);
    velocity.swap();

    // 6) Advect velocity along itself.
    U.advectVel.uVelocity.value = velocity.read.texture;
    U.advectVel.texelSize.value = velocity.texel;
    U.advectVel.dt.value = dt;
    U.advectVel.dissipation.value = CFG.velDissipation;
    blit(velocity.write, MAT.advectVel);
    velocity.swap();

    // 7) Advect dye along the velocity.
    U.advect.uVelocity.value = velocity.read.texture;
    U.advect.uSource.value = dye.read.texture;
    U.advect.texelSize.value = velocity.texel;
    U.advect.dt.value = dt;
    U.advect.dissipation.value = CFG.dyeDissipation;
    blit(dye.write, MAT.advect);
    dye.swap();
  }

  function draw() {
    U.display.uTexture.value = dye.read.texture;
    if (composer && bloomOn) {
      composer.render();
    } else {
      renderer.setRenderTarget(null);
      renderer.render(displayScene, passCam);
    }
  }

  // =====================================================================
  // Settings (minimal, behind the gear).
  // =====================================================================
  function $(id) { return document.getElementById(id); }
  var gear = $('ink-gear');
  var pop = $('ink-settings');
  if (gear && pop) {
    gear.addEventListener('click', function () { pop.classList.toggle('open'); });
    var sFade = $('ink-s-fade');
    var sSwirl = $('ink-s-swirl');
    var sBrush = $('ink-s-brush');
    var cbBloom = $('ink-cb-bloom');
    var btnClear = $('ink-clear');
    if (sFade) sFade.addEventListener('input', function () {
      // Slider 0..100 -> dissipation 0.999 (long) .. 0.94 (short)
      CFG.dyeDissipation = 0.999 - (sFade.value / 100) * 0.059;
    });
    if (sSwirl) sSwirl.addEventListener('input', function () {
      CFG.curlStrength = sSwirl.value * 0.5; // 0..50
    });
    if (sBrush) sBrush.addEventListener('input', function () {
      CFG.splatRadius = 0.0006 + (sBrush.value / 100) * 0.008;
    });
    if (cbBloom) {
      cbBloom.checked = bloomOn;
      cbBloom.disabled = !composer;
      cbBloom.addEventListener('change', function () { bloomOn = cbBloom.checked && !!composer; });
    }
    if (btnClear) btnClear.addEventListener('click', function () {
      U.clearDye.texelSize.value = velocity.texel;
      blit(dye.read, MAT.clearDye);
      blit(dye.write, MAT.clearDye);
      pop.classList.remove('open');
    });
  }

  // =====================================================================
  // Resize + adaptive performance.
  // =====================================================================
  window.addEventListener('resize', function () {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    allocTargets();
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
  });

  var perfSamples = [], perfStep = 0;
  function tunePerf(ms) {
    perfSamples.push(ms);
    if (perfSamples.length < 90) return;
    var avg = perfSamples.reduce(function (a, b) { return a + b; }) / perfSamples.length;
    perfSamples.length = 0;
    if (avg > 26 && perfStep < 3) {
      perfStep++;
      if (perfStep === 1) CFG.pressureIters = Math.max(18, CFG.pressureIters - 10);
      else if (perfStep === 2) { CFG.simRes = (CFG.simRes * 0.75) | 0; CFG.dyeRes = (CFG.dyeRes * 0.75) | 0; allocTargets(); }
      else if (perfStep === 3) bloomOn = false;
    }
  }

  // =====================================================================
  // Main loop.
  // =====================================================================
  var last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    var frameStart = performance.now();
    var dt = Math.min((now - last) / 1000, CFG.dtMax * 2.5);
    last = now;
    dt = Math.min(dt, CFG.dtMax);

    // Hue drifts forward so successive strokes differ.
    hue = (hue + CFG.hueSpeed * dt) % 1;
    pointers.forEach(function (rec) {
      // Active strokes also drift in hue mid-stroke (classic feel).
      if (Math.random() < 0.06) rec.color = strokeColor();
    });

    stepSim(dt);
    draw();
    tunePerf(performance.now() - frameStart);
  }

  // Boot: black canvas, hint visible, wait for the first drag.
  blit(dye.read, MAT.clearDye);
  blit(dye.write, MAT.clearDye);
  requestAnimationFrame(loop);
})();
