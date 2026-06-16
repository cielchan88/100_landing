/* Swarm — Day 36. A GPGPU particle system: ~1M particles whose positions
 * and velocities live in float textures on the GPU and are updated each
 * frame by two fragment shaders (GPUComputationRenderer). The CPU never
 * touches the state. Motion comes from the CURL of a 3D simplex noise
 * field — divergence-free, so the swarm flows like smoke instead of
 * jittering. Cursor adds a local force; a "morph" mode springs every
 * particle toward a target position sampled from a shape or a word, holds
 * the form, then releases it back into the flow. Drawn as glowing additive
 * points with bloom on near-black.
 *
 * Architecturally simpler than a fluid solver, but failures are silent
 * (a black screen with no error), so it's built stage by stage. The wow
 * comes from scale + motion + bloom. */
(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Boot guards. Three.js + GPUComputationRenderer are both mandatory.
  // ---------------------------------------------------------------------
  function fatal(msg) {
    var d = document.createElement('div');
    d.className = 'sw-fatal';
    d.textContent = msg;
    document.body.appendChild(d);
  }
  if (typeof THREE === 'undefined') { fatal('Three.js failed to load. Check your connection and reload.'); return; }
  if (typeof THREE.GPUComputationRenderer === 'undefined') {
    fatal('GPUComputationRenderer failed to load. Check your connection and reload.');
    return;
  }

  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------------
  // CFG.
  // ---------------------------------------------------------------------
  var CFG = {
    // Texture size — N x N = particle count. 1024 = ~1.05M; 512 = ~262k.
    texSize: 1024,
    // Domain extents — particles live in a roughly cube-ish volume.
    domain: 24,
    // Motion
    flowFreq: 0.10,
    flowStrength: 1.0,
    flowEvolve: 0.18,            // how fast the noise field changes over time
    damping: 0.86,
    maxSpeed: 9.0,
    // Cursor force
    cursorStrength: 28.0,
    cursorRadius: 4.0,
    // Morph
    morphSpring: 14.0,
    morphDamping: 4.5,
    morphHoldSec: 4.0,
    morphReleaseSec: 0.5,
    // Look
    pointSize: 1.6,              // baseline; scaled by speed + bloom tier
    pointSizeMin: 0.6,
    bgColor: 0x05060a,
    bloom: { strength: 0.85, radius: 0.65, threshold: 0.10 },
  };

  // ---------------------------------------------------------------------
  // Tier detection. Mobile/weak: smaller texture, no bloom, capped DPR.
  // ---------------------------------------------------------------------
  var isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  var smallScreen = Math.min(window.innerWidth, window.innerHeight) < 720;
  var TIER = (isCoarse || smallScreen) ? 'mobile' : 'desktop';
  if (TIER === 'mobile') {
    CFG.texSize = 384;
    CFG.pointSize = 1.4;
  }

  // ---------------------------------------------------------------------
  // Renderer + scene + camera.
  // ---------------------------------------------------------------------
  var canvas = document.getElementById('sw-canvas');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(TIER === 'mobile' ? 1.5 : 2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(CFG.bgColor, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.autoClear = false;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(CFG.bgColor);
  var camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 800);
  camera.position.set(0, 0, 60);
  camera.lookAt(0, 0, 0);

  // Float-texture support: GPUComputationRenderer requires renderable float
  // (or half-float) textures. If neither is available, drop the texture
  // size hard so a smaller swarm at least runs. WebGL2 (covered by EXT_color_buffer_float)
  // and WebGL1 (OES_texture_float / OES_texture_half_float) are both checked.
  var gl = renderer.getContext();
  var canHalf = !!(gl.getExtension('OES_texture_half_float') || gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float'));
  var canFull = !!gl.getExtension('OES_texture_float');
  if (!canHalf && !canFull) {
    CFG.texSize = Math.min(CFG.texSize, 192);
  }

  // ---------------------------------------------------------------------
  // GLSL — the heart of the build. Each shader is small, commented.
  // ---------------------------------------------------------------------

  // Stefan Gustavson / Ashima Arts 3D simplex noise (public-domain GLSL).
  // Compact and battle-tested; used here as the scalar field whose curl
  // gives the flow's divergence-free velocity.
  var GLSL_SIMPLEX_3D = [
    'vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}',
    'vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}',
    'float snoise(vec3 v){',
    '  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);',
    '  vec3 i=floor(v+dot(v,C.yyy));',
    '  vec3 x0=v-i+dot(i,C.xxx);',
    '  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g;',
    '  vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);',
    '  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;',
    '  i=mod289(i);',
    '  vec4 p=permute(permute(permute(',
    '    i.z+vec4(0.0,i1.z,i2.z,1.0))',
    '    +i.y+vec4(0.0,i1.y,i2.y,1.0))',
    '    +i.x+vec4(0.0,i1.x,i2.x,1.0));',
    '  float n_=0.142857142857;',
    '  vec3 ns=n_*D.wyz-D.xzx;',
    '  vec4 j=p-49.0*floor(p*ns.z*ns.z);',
    '  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);',
    '  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy;',
    '  vec4 h=1.0-abs(x)-abs(y);',
    '  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);',
    '  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0;',
    '  vec4 sh=-step(h,vec4(0.0));',
    '  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;',
    '  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y);',
    '  vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);',
    '  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));',
    '  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;',
    '  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);',
    '  m=m*m;',
    '  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));',
    '}',
  ].join('\n');

  // Curl of three independent scalar noise fields (one per axis), computed
  // via central differences. This is the canonical "curl-noise" recipe —
  // divergence-free output that reads as smoke/starlings, not jitter.
  var GLSL_CURL = [
    'vec3 curlNoise(vec3 p) {',
    '  const float e = 0.10;',
    '  const vec3 off1 = vec3( 0.0,  0.0,  0.0);',
    '  const vec3 off2 = vec3(31.4, 47.8, 12.7);',
    '  const vec3 off3 = vec3( 7.1, 53.9, 91.7);',
    '  float Ax_dy = snoise(p + off1 + vec3(0.0, e, 0.0)) - snoise(p + off1 - vec3(0.0, e, 0.0));',
    '  float Ax_dz = snoise(p + off1 + vec3(0.0, 0.0, e)) - snoise(p + off1 - vec3(0.0, 0.0, e));',
    '  float Ay_dx = snoise(p + off2 + vec3(e, 0.0, 0.0)) - snoise(p + off2 - vec3(e, 0.0, 0.0));',
    '  float Ay_dz = snoise(p + off2 + vec3(0.0, 0.0, e)) - snoise(p + off2 - vec3(0.0, 0.0, e));',
    '  float Az_dx = snoise(p + off3 + vec3(e, 0.0, 0.0)) - snoise(p + off3 - vec3(e, 0.0, 0.0));',
    '  float Az_dy = snoise(p + off3 + vec3(0.0, e, 0.0)) - snoise(p + off3 - vec3(0.0, e, 0.0));',
    '  return vec3(Az_dy - Ay_dz, Ax_dz - Az_dx, Ay_dx - Ax_dy) / (2.0 * e);',
    '}',
  ].join('\n');

  // Velocity update — texturePosition + textureVelocity are auto-provided
  // by GPUComputationRenderer once we declare them as dependencies.
  var SHADER_VELOCITY = GLSL_SIMPLEX_3D + '\n' + GLSL_CURL + '\n' + [
    'uniform float uTime;',
    'uniform float uDt;',
    'uniform float uFlowFreq;',
    'uniform float uFlowStrength;',
    'uniform float uFlowEvolve;',
    'uniform float uDamping;',
    'uniform float uMaxSpeed;',
    'uniform vec3  uCursorPos;',
    'uniform float uCursorActive;',
    'uniform float uCursorStrength;',
    'uniform float uCursorRadius;',
    'uniform float uMorphActive;',
    'uniform float uMorphSpring;',
    'uniform float uMorphDamping;',
    'uniform sampler2D uTargets;',
    '',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / resolution.xy;',
    '  vec3 pos = texture2D(texturePosition, uv).xyz;',
    '  vec3 vel = texture2D(textureVelocity, uv).xyz;',
    '',
    '  // 1) Curl-noise flow (the headline motion). Field evolves with time.',
    '  vec3 nP = pos * uFlowFreq + vec3(0.0, 0.0, uTime * uFlowEvolve);',
    '  vec3 flow = curlNoise(nP) * uFlowStrength;',
    '  vel += flow * uDt;',
    '',
    '  // 2) Cursor force: smooth attract within radius (sign for repel).',
    '  if (uCursorActive > 0.5) {',
    '    vec3 toC = uCursorPos - pos;',
    '    float d = length(toC);',
    '    if (d < uCursorRadius && d > 0.001) {',
    '      float falloff = 1.0 - smoothstep(0.0, uCursorRadius, d);',
    '      vel += normalize(toC) * uCursorStrength * falloff * uDt;',
    '    }',
    '  }',
    '',
    '  // 3) Morph spring toward the target position texture. When active the',
    '  //    flow is dominated by this critically-damped spring so particles',
    '  //    converge crisply; release simply turns this off and the curl-',
    '  //    noise reclaims the cloud.',
    '  if (uMorphActive > 0.0) {',
    '    vec3 target = texture2D(uTargets, uv).xyz;',
    '    vec3 toT = target - pos;',
    '    vel += toT * uMorphSpring * uMorphActive * uDt;',
    '    vel -= vel * uMorphDamping * uMorphActive * uDt;',
    '  }',
    '',
    '  // 4) Global damping + speed clamp keep the flow stable.',
    '  vel *= max(0.0, 1.0 - uDamping * uDt);',
    '  float sp = length(vel);',
    '  if (sp > uMaxSpeed) vel *= uMaxSpeed / sp;',
    '',
    '  gl_FragColor = vec4(vel, 1.0);',
    '}',
  ].join('\n');

  // Position update — straightforward integration + a soft pull back to the
  // origin if particles drift past the domain so the swarm stays framed.
  var SHADER_POSITION = [
    'uniform float uDt;',
    'uniform float uDomain;',
    '',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / resolution.xy;',
    '  vec3 pos = texture2D(texturePosition, uv).xyz;',
    '  vec3 vel = texture2D(textureVelocity, uv).xyz;',
    '  pos += vel * uDt;',
    '  // Soft bounds: spring back when outside the domain box.',
    '  vec3 over = max(abs(pos) - uDomain, 0.0);',
    '  pos -= sign(pos) * over * 0.04;',
    '  gl_FragColor = vec4(pos, 1.0);',
    '}',
  ].join('\n');

  // ---------------------------------------------------------------------
  // GPUComputationRenderer setup.
  // ---------------------------------------------------------------------
  var gpu = new THREE.GPUComputationRenderer(CFG.texSize, CFG.texSize, renderer);
  // Force a renderable float type — GPUComputationRenderer defaults to
  // half-float if available; respect that but fall through to RGBA8 only
  // if absolutely nothing else works (the swarm will look chunky then but
  // it will still run instead of black-screening).
  if (!canHalf && !canFull) gpu.setDataType(THREE.UnsignedByteType);
  else if (canHalf) gpu.setDataType(THREE.HalfFloatType);
  else gpu.setDataType(THREE.FloatType);

  var posTex = gpu.createTexture();
  var velTex = gpu.createTexture();
  var targetTex = gpu.createTexture();

  // Seed positions: a hollow-ish sphere of radius ~10 (looks alive on load).
  (function seed() {
    var data = posTex.image.data;
    var n = CFG.texSize * CFG.texSize;
    for (var i = 0; i < n; i++) {
      var phi = Math.acos(2 * Math.random() - 1);
      var theta = Math.random() * Math.PI * 2;
      var r = 6 + Math.random() * 6;
      var idx = i * 4;
      data[idx]     = r * Math.sin(phi) * Math.cos(theta);
      data[idx + 1] = r * Math.sin(phi) * Math.sin(theta);
      data[idx + 2] = r * Math.cos(phi);
      data[idx + 3] = 1;
    }
    // Velocities start small + random so the flow has something to grip.
    var vd = velTex.image.data;
    for (var j = 0; j < n; j++) {
      var k = j * 4;
      vd[k]     = (Math.random() - 0.5) * 0.4;
      vd[k + 1] = (Math.random() - 0.5) * 0.4;
      vd[k + 2] = (Math.random() - 0.5) * 0.4;
      vd[k + 3] = 1;
    }
  })();

  var posVar = gpu.addVariable('texturePosition', SHADER_POSITION, posTex);
  var velVar = gpu.addVariable('textureVelocity', SHADER_VELOCITY, velTex);
  gpu.setVariableDependencies(posVar, [posVar, velVar]);
  gpu.setVariableDependencies(velVar, [posVar, velVar]);

  posVar.material.uniforms.uDt = { value: 1 / 60 };
  posVar.material.uniforms.uDomain = { value: CFG.domain };

  velVar.material.uniforms.uTime = { value: 0 };
  velVar.material.uniforms.uDt = { value: 1 / 60 };
  velVar.material.uniforms.uFlowFreq = { value: CFG.flowFreq };
  velVar.material.uniforms.uFlowStrength = { value: CFG.flowStrength };
  velVar.material.uniforms.uFlowEvolve = { value: CFG.flowEvolve };
  velVar.material.uniforms.uDamping = { value: CFG.damping };
  velVar.material.uniforms.uMaxSpeed = { value: CFG.maxSpeed };
  velVar.material.uniforms.uCursorPos = { value: new THREE.Vector3() };
  velVar.material.uniforms.uCursorActive = { value: 0 };
  velVar.material.uniforms.uCursorStrength = { value: CFG.cursorStrength };
  velVar.material.uniforms.uCursorRadius = { value: CFG.cursorRadius };
  velVar.material.uniforms.uMorphActive = { value: 0 };
  velVar.material.uniforms.uMorphSpring = { value: CFG.morphSpring };
  velVar.material.uniforms.uMorphDamping = { value: CFG.morphDamping };
  velVar.material.uniforms.uTargets = { value: targetTex };

  // Wrap mode: clamp so particles past the edge don't read garbage.
  [posVar, velVar].forEach(function (v) {
    v.wrapS = THREE.ClampToEdgeWrapping;
    v.wrapT = THREE.ClampToEdgeWrapping;
  });

  var gpuErr = gpu.init();
  if (gpuErr !== null) { fatal('GPGPU init failed: ' + gpuErr); return; }

  // ---------------------------------------------------------------------
  // Render: a THREE.Points geometry whose only attribute is the UV into
  // the position texture. The vertex shader reads the position from the
  // texture; the fragment shader is an additive soft disc colored by speed.
  // ---------------------------------------------------------------------
  var geo = new THREE.BufferGeometry();
  var uvs = new Float32Array(CFG.texSize * CFG.texSize * 2);
  var k = 0;
  for (var y = 0; y < CFG.texSize; y++) {
    for (var x = 0; x < CFG.texSize; x++) {
      uvs[k++] = (x + 0.5) / CFG.texSize;
      uvs[k++] = (y + 0.5) / CFG.texSize;
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CFG.texSize * CFG.texSize * 3), 3));
  geo.setAttribute('aUv', new THREE.BufferAttribute(uvs, 2));

  var renderMat = new THREE.ShaderMaterial({
    uniforms: {
      uPositions: { value: null },
      uVelocities: { value: null },
      uPointSize: { value: CFG.pointSize * (window.devicePixelRatio || 1) },
      uColorA: { value: new THREE.Color(0x40c8ff) }, // cool (slow)
      uColorB: { value: new THREE.Color(0xff7adb) }, // warm (medium)
      uColorC: { value: new THREE.Color(0xfff2c4) }, // white-hot (fast)
    },
    vertexShader: [
      'attribute vec2 aUv;',
      'uniform sampler2D uPositions;',
      'uniform sampler2D uVelocities;',
      'uniform float uPointSize;',
      'varying float vSpeed;',
      'void main() {',
      '  vec3 pos = texture2D(uPositions, aUv).xyz;',
      '  vec3 vel = texture2D(uVelocities, aUv).xyz;',
      '  vSpeed = length(vel);',
      '  vec4 mv = modelViewMatrix * vec4(pos, 1.0);',
      '  // Distance-attenuated point size; clamped so distant particles do not vanish.',
      '  gl_PointSize = max(0.6, uPointSize * 320.0 / -mv.z);',
      '  gl_Position = projectionMatrix * mv;',
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uColorA;',
      'uniform vec3 uColorB;',
      'uniform vec3 uColorC;',
      'varying float vSpeed;',
      'void main() {',
      '  // Soft round additive disc (cheap in-shader, no texture).',
      '  vec2 c = gl_PointCoord - 0.5;',
      '  float r = length(c) * 2.0;',
      '  if (r > 1.0) discard;',
      '  float a = exp(-r * r * 4.0);',
      '  // Color by speed: A -> B -> C as it accelerates. Bright cores bloom.',
      '  float s = clamp(vSpeed / 6.0, 0.0, 1.0);',
      '  vec3 col = mix(uColorA, uColorB, smoothstep(0.0, 0.55, s));',
      '  col = mix(col, uColorC, smoothstep(0.55, 1.0, s));',
      '  gl_FragColor = vec4(col, a);',
      '}',
    ].join('\n'),
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });

  var points = new THREE.Points(geo, renderMat);
  points.frustumCulled = false;
  scene.add(points);

  // ---------------------------------------------------------------------
  // Bloom: tier-gated. Failure to load any addon disables only bloom.
  // ---------------------------------------------------------------------
  var composer = null, bloomOn = false;
  function tryInitBloom() {
    if (TIER !== 'desktop') return;
    try {
      if (!THREE.EffectComposer || !THREE.RenderPass || !THREE.UnrealBloomPass) return;
      composer = new THREE.EffectComposer(renderer);
      composer.addPass(new THREE.RenderPass(scene, camera));
      composer.addPass(new THREE.UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        CFG.bloom.strength, CFG.bloom.radius, CFG.bloom.threshold
      ));
      bloomOn = true;
    } catch (e) { composer = null; bloomOn = false; }
  }
  tryInitBloom();

  // ---------------------------------------------------------------------
  // Targets — sample shape/text into the targetTex. Particles are mapped
  // to targets 1:1 by texel index, with the targets repeated cyclically
  // if the shape produces fewer points than there are particles.
  // ---------------------------------------------------------------------
  function uploadTargets(points3) {
    var n = CFG.texSize * CFG.texSize;
    var data = targetTex.image.data;
    var src = points3;
    var srcN = src.length;
    for (var i = 0; i < n; i++) {
      var s = src[i % srcN];
      var off = i * 4;
      data[off]     = s.x;
      data[off + 1] = s.y;
      data[off + 2] = s.z;
      data[off + 3] = 1;
    }
    targetTex.needsUpdate = true;
  }

  function targetSphere(radius) {
    radius = radius || 11;
    var n = CFG.texSize * CFG.texSize;
    var out = new Array(n);
    // Fibonacci sphere — uniform coverage with no clumping at the poles.
    var ga = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < n; i++) {
      var y = 1 - (i / (n - 1)) * 2;
      var rA = Math.sqrt(1 - y * y);
      var th = ga * i;
      out[i] = { x: Math.cos(th) * rA * radius, y: y * radius, z: Math.sin(th) * rA * radius };
    }
    return out;
  }

  function targetTorus(R, r) {
    R = R || 9; r = r || 3;
    var n = CFG.texSize * CFG.texSize;
    var out = new Array(n);
    for (var i = 0; i < n; i++) {
      var u = Math.random() * Math.PI * 2;
      var v = Math.random() * Math.PI * 2;
      out[i] = {
        x: (R + r * Math.cos(v)) * Math.cos(u),
        y: r * Math.sin(v),
        z: (R + r * Math.cos(v)) * Math.sin(u),
      };
    }
    return out;
  }

  // Sample the non-transparent pixels of text rendered to a 2D canvas.
  // The list is shuffled so adjacent particles don't map to adjacent
  // pixels (a sweep across the canvas reads as a wipe; a random map
  // reads as the word materialising).
  function targetText(text) {
    var fontSize = 220;
    var pad = 40;
    var probe = document.createElement('canvas').getContext('2d');
    probe.font = 'bold ' + fontSize + 'px JetBrains Mono, ui-monospace, monospace';
    var w = Math.ceil(probe.measureText(text).width) + pad * 2;
    var h = fontSize + pad * 2;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + fontSize + 'px JetBrains Mono, ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(text, w / 2, h / 2);
    var img = ctx.getImageData(0, 0, w, h).data;
    var hits = [];
    // Step by 2 so we sample roughly w*h/4 pixels — plenty for ~1M points
    // (we just cycle through them).
    for (var y = 0; y < h; y += 2) {
      for (var x = 0; x < w; x += 2) {
        if (img[(y * w + x) * 4] > 128) hits.push([x, y]);
      }
    }
    // Fisher–Yates shuffle.
    for (var i = hits.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = hits[i]; hits[i] = hits[j]; hits[j] = t;
    }
    // Map canvas-pixel coords to world XY centred on the origin.
    var scale = 20 / w;
    var out = new Array(hits.length);
    for (var ii = 0; ii < hits.length; ii++) {
      out[ii] = {
        x: (hits[ii][0] - w / 2) * scale,
        y: -(hits[ii][1] - h / 2) * scale,
        z: (Math.random() - 0.5) * 0.6,
      };
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // Morph state machine: idle -> assembling -> holding -> releasing.
  // ---------------------------------------------------------------------
  var morph = { state: 'idle', t: 0, target: null };
  function startMorph(targetName) {
    var pts;
    if (targetName === 'sphere') pts = targetSphere(11);
    else if (targetName === 'torus') pts = targetTorus(9, 3);
    else if (targetName === '36') pts = targetText('36');
    else pts = targetText(targetName);
    uploadTargets(pts);
    morph.state = 'assembling';
    morph.t = 0;
    morph.target = targetName;
    velVar.material.uniforms.uMorphActive.value = 1.0;
    var hint = document.getElementById('sw-hint');
    if (hint) hint.classList.add('gone');
  }

  function updateMorph(dt) {
    if (morph.state === 'idle') return;
    morph.t += dt;
    if (morph.state === 'assembling' && morph.t > 1.4) {
      morph.state = 'holding';
      morph.t = 0;
    } else if (morph.state === 'holding' && morph.t > CFG.morphHoldSec) {
      morph.state = 'releasing';
      morph.t = 0;
    } else if (morph.state === 'releasing') {
      // Linearly fade the spring out so the curl-noise reclaims the cloud.
      var k2 = Math.max(0, 1 - morph.t / CFG.morphReleaseSec);
      velVar.material.uniforms.uMorphActive.value = k2;
      if (k2 <= 0) { morph.state = 'idle'; }
    }
  }

  // ---------------------------------------------------------------------
  // Input: pointer projects into the z=0 plane to set the cursor force.
  // ---------------------------------------------------------------------
  var pointer = { active: false, sx: 0, sy: 0 };
  var raycaster = new THREE.Raycaster();
  var plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  var planeHit = new THREE.Vector3();

  function setPointer(e) {
    pointer.active = true;
    var rect = canvas.getBoundingClientRect();
    pointer.sx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.sy = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    var hint = document.getElementById('sw-hint');
    if (hint) hint.classList.add('gone');
  }
  canvas.addEventListener('pointermove', setPointer);
  canvas.addEventListener('pointerdown', setPointer);
  canvas.addEventListener('pointerleave', function () { pointer.active = false; });

  // ---------------------------------------------------------------------
  // UI — settings popover with morph triggers, palette, count slider.
  // ---------------------------------------------------------------------
  var PALETTES = {
    'cyan-magenta': { a: 0x40c8ff, b: 0xff7adb, c: 0xfff2c4 },
    'ember':        { a: 0x4a1f0a, b: 0xff8542, c: 0xfff0c0 },
    'mint':         { a: 0x1a4d5a, b: 0x4adea0, c: 0xeaffe0 },
    'monochrome':   { a: 0x202428, b: 0x7a8898, c: 0xffffff },
  };

  function setPalette(name) {
    var p = PALETTES[name] || PALETTES['cyan-magenta'];
    renderMat.uniforms.uColorA.value.setHex(p.a);
    renderMat.uniforms.uColorB.value.setHex(p.b);
    renderMat.uniforms.uColorC.value.setHex(p.c);
  }

  (function bindUI() {
    function $(id) { return document.getElementById(id); }
    var gear = $('sw-gear');
    var pop = $('sw-settings');
    if (gear && pop) gear.addEventListener('click', function () { pop.classList.toggle('open'); });

    var sphereBtn = $('sw-morph-sphere');
    var torusBtn = $('sw-morph-torus');
    var numBtn = $('sw-morph-36');
    var customInput = $('sw-morph-text');
    var customBtn = $('sw-morph-text-go');
    var bloomCB = $('sw-bloom');
    var palette = $('sw-palette');
    var countEl = $('sw-count');

    if (sphereBtn) sphereBtn.addEventListener('click', function () { startMorph('sphere'); });
    if (torusBtn)  torusBtn.addEventListener('click', function () { startMorph('torus'); });
    if (numBtn)    numBtn.addEventListener('click', function () { startMorph('36'); });
    if (customBtn && customInput) customBtn.addEventListener('click', function () {
      var t = (customInput.value || '').trim().slice(0, 18);
      if (t) startMorph(t);
    });
    if (bloomCB) {
      bloomCB.checked = !!bloomOn;
      bloomCB.disabled = !composer;
      bloomCB.addEventListener('change', function () { bloomOn = bloomCB.checked && !!composer; });
    }
    if (palette) {
      palette.addEventListener('change', function () { setPalette(palette.value); });
    }
    if (countEl) {
      countEl.textContent = (CFG.texSize * CFG.texSize).toLocaleString() + ' particles · tier ' + TIER;
    }
  })();

  // ---------------------------------------------------------------------
  // Adaptive perf: if frame time slips, drop bloom first, then DPR.
  // ---------------------------------------------------------------------
  var perfSamples = [], perfStep = 0;
  function tunePerf(ms) {
    perfSamples.push(ms);
    if (perfSamples.length < 90) return;
    var avg = perfSamples.reduce(function (a, b) { return a + b; }) / perfSamples.length;
    perfSamples.length = 0;
    if (avg > 26 && perfStep < 2) {
      perfStep++;
      if (perfStep === 1) bloomOn = false;
      else if (perfStep === 2) renderer.setPixelRatio(Math.min(1.3, window.devicePixelRatio || 1));
    }
  }

  // ---------------------------------------------------------------------
  // Resize.
  // ---------------------------------------------------------------------
  window.addEventListener('resize', function () {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------------------------------------------------------------------
  // Optional gentle auto-morph cycle (skipped under reduced-motion).
  // ---------------------------------------------------------------------
  var autoSeq = ['sphere', 'torus', '36'];
  var autoIdx = 0, autoT = 0, autoInterval = 18; // seconds between auto morphs
  function autoMorph(dt) {
    if (reducedMotion) return;
    autoT += dt;
    if (autoT > autoInterval && morph.state === 'idle') {
      autoT = 0;
      startMorph(autoSeq[autoIdx % autoSeq.length]);
      autoIdx++;
    }
  }

  // ---------------------------------------------------------------------
  // Main loop.
  // ---------------------------------------------------------------------
  var last = performance.now();
  var clockTime = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    var frameStart = performance.now();
    var dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    clockTime += dt;

    // Cursor: project the screen pointer onto z=0 each frame so the force
    // tracks the camera (the camera doesn't move here, but this lets us
    // animate it later without rewiring).
    if (pointer.active) {
      raycaster.setFromCamera({ x: pointer.sx, y: pointer.sy }, camera);
      if (raycaster.ray.intersectPlane(plane, planeHit)) {
        velVar.material.uniforms.uCursorPos.value.copy(planeHit);
        velVar.material.uniforms.uCursorActive.value = 1;
      }
    } else {
      velVar.material.uniforms.uCursorActive.value = 0;
    }

    posVar.material.uniforms.uDt.value = dt;
    velVar.material.uniforms.uDt.value = dt;
    velVar.material.uniforms.uTime.value = clockTime;

    updateMorph(dt);
    autoMorph(dt);

    // Step the simulation, then plug the latest textures into the render
    // material and draw the points.
    gpu.compute();
    renderMat.uniforms.uPositions.value = gpu.getCurrentRenderTarget(posVar).texture;
    renderMat.uniforms.uVelocities.value = gpu.getCurrentRenderTarget(velVar).texture;

    renderer.clear();
    if (composer && bloomOn) composer.render();
    else renderer.render(scene, camera);

    tunePerf(performance.now() - frameStart);
  }

  // Seed an initial palette so the colors are deliberate, not default.
  setPalette('cyan-magenta');
  requestAnimationFrame(loop);
})();
