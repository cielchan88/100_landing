/* Singularity — Day 37. An orbitable black hole rendered as an artistic
 * approximation, NOT geodesic ray-tracing. The lensing is a screen-space
 * radial distortion around the hole's projected centre, plus a second
 * curved "top-arc" disk that fakes the over-the-top wrap that real
 * lensing would produce. Stated plainly in the about strip and here in
 * the comments because honesty is the point: every impressive web black
 * hole works this way.
 *
 * Built in six stages, each visually checked before the next:
 *   1. Scene: renderer + ACES + starfield + black sphere + OrbitControls
 *   2. Accretion disk: animated noise + temperature gradient + rotation
 *   3. Doppler beaming + photon ring
 *   4. Over-the-top arc (the faked-lensing wrap of the disk)
 *   5. Screen-space lensing post pass (the starfield bends around)
 *   6. Bloom + polish + tier scaling
 */
(function () {
  'use strict';

  function fatal(msg) {
    var d = document.createElement('div');
    d.className = 'sg-fatal';
    d.textContent = msg;
    document.body.appendChild(d);
  }
  if (typeof THREE === 'undefined') { fatal('Three.js failed to load. Reload to retry.'); return; }
  if (typeof THREE.OrbitControls === 'undefined') { fatal('OrbitControls failed to load. Reload to retry.'); return; }

  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------------
  // CFG.
  // ---------------------------------------------------------------------
  var CFG = {
    // Hole + disk geometry.
    horizonR: 1.0,           // event-horizon sphere radius
    diskInner: 1.4,          // inner edge of the disk (just past the photon ring)
    diskOuter: 4.5,
    diskTilt: 0.42,          // radians, equatorial tilt vs world
    photonR: 1.18,           // bright thin ring around the shadow
    photonThickness: 0.06,

    // Motion.
    diskSpeed: 0.55,
    autoOrbitSpeed: 0.06,    // rad/s when auto-orbit on

    // Look.
    bgColor: 0x05060a,
    starCount: 4000,
    bloom: { strength: 0.95, radius: 0.55, threshold: 0.18 },

    // Lensing.
    lensStrength: 0.45,      // radial pull near the hole
    lensFalloff: 1.8,        // higher = pull falls off faster with distance
  };

  // ---------------------------------------------------------------------
  // Tier detection.
  // ---------------------------------------------------------------------
  var isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  var smallScreen = Math.min(window.innerWidth, window.innerHeight) < 720;
  var TIER = (isCoarse || smallScreen) ? 'mobile' : 'desktop';
  if (TIER === 'mobile') {
    CFG.starCount = 1800;
    CFG.bloom.strength = 0.7;
  }

  // ---------------------------------------------------------------------
  // Renderer / scene / camera.
  // ---------------------------------------------------------------------
  var canvas = document.getElementById('sg-canvas');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(TIER === 'mobile' ? 1.5 : 2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(CFG.bgColor, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputEncoding = THREE.sRGBEncoding;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 200);
  camera.position.set(0, 1.6, 9);

  var controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3;
  controls.maxDistance = 28;
  controls.enablePan = false;
  controls.target.set(0, 0, 0);
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 0.6;

  // ---------------------------------------------------------------------
  // Stage 1 — starfield. A big point cloud on a sphere with varied
  // brightness. Detailed enough that the lensing distortion is visible
  // against it.
  // ---------------------------------------------------------------------
  function buildStarfield() {
    var n = CFG.starCount;
    var pos = new Float32Array(n * 3);
    var col = new Float32Array(n * 3);
    var sz  = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      // Uniform on a sphere via the standard recipe.
      var u = Math.random(), v = Math.random();
      var theta = 2 * Math.PI * u;
      var phi = Math.acos(2 * v - 1);
      var r = 80;
      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      // A handful of stars are clearly brighter / coloured.
      var bright = Math.pow(Math.random(), 6);
      var tint = Math.random();
      col[i * 3]     = 0.85 + bright * 0.15 + (tint < 0.10 ? 0.05 : 0);
      col[i * 3 + 1] = 0.88 + bright * 0.12;
      col[i * 3 + 2] = 0.95 + bright * 0.05 + (tint > 0.90 ? 0.05 : 0);
      sz[i] = 1.2 + bright * 5.2;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
    var m = new THREE.ShaderMaterial({
      uniforms: { uPixelRatio: { value: renderer.getPixelRatio() } },
      vertexShader: [
        'attribute float size;',
        'varying vec3 vColor;',
        'uniform float uPixelRatio;',
        'void main(){',
        '  vColor = color;',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  gl_PointSize = size * uPixelRatio;',
        '  gl_Position = projectionMatrix * mv;',
        '}',
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vColor;',
        'void main(){',
        '  vec2 c = gl_PointCoord - 0.5;',
        '  float r = length(c) * 2.0;',
        '  if (r > 1.0) discard;',
        '  float a = exp(-r * r * 3.2);',
        '  gl_FragColor = vec4(vColor, a);',
        '}',
      ].join('\n'),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    var stars = new THREE.Points(g, m);
    scene.add(stars);
    return stars;
  }
  buildStarfield();

  // ---------------------------------------------------------------------
  // Event horizon: a pure-black sphere. No lighting (MeshBasicMaterial),
  // so it reads as a pure shadow against everything.
  // ---------------------------------------------------------------------
  var horizon = new THREE.Mesh(
    new THREE.SphereGeometry(CFG.horizonR, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, fog: false })
  );
  scene.add(horizon);

  // ---------------------------------------------------------------------
  // Stage 2 + 3 — accretion disk shader. A flat annulus with:
  //   - scrolling fbm/curl noise as turbulent plasma,
  //   - a temperature gradient by radius (white-hot inside -> red out),
  //   - Doppler beaming (brighter on the side rotating toward camera),
  //   - HDR-bright so it survives ACES and blooms.
  // ---------------------------------------------------------------------
  var DISK_FRAG = [
    'precision highp float;',
    'varying vec3 vWorldPos;',
    'uniform float uTime;',
    'uniform float uInner;',
    'uniform float uOuter;',
    'uniform vec3  uCamPos;',
    'uniform float uDiskSpeed;',
    'uniform float uIntensity;',
    '',
    // Hash + simplex-ish 2D noise (cheap, plenty for animated plasma).
    'float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float vnoise(vec2 p){',
    '  vec2 i=floor(p), f=fract(p);',
    '  float a=hash21(i), b=hash21(i+vec2(1.0,0.0)), c=hash21(i+vec2(0.0,1.0)), d=hash21(i+vec2(1.0,1.0));',
    '  vec2 u=f*f*(3.0-2.0*f);',
    '  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);',
    '}',
    'float fbm(vec2 p){',
    '  float v=0.0, a=0.5;',
    '  for(int i=0;i<5;i++){ v += a*vnoise(p); p *= 2.0; a *= 0.5; }',
    '  return v;',
    '}',
    '',
    // Temperature -> color ramp: white-hot through yellow, orange, deep red.
    'vec3 plasma(float t){',
    '  t = clamp(t, 0.0, 1.0);',
    '  vec3 c0 = vec3(1.0, 1.0, 1.0);',  // white-hot
    '  vec3 c1 = vec3(1.0, 0.92, 0.60);', // yellow
    '  vec3 c2 = vec3(1.0, 0.55, 0.18);', // orange
    '  vec3 c3 = vec3(0.55, 0.10, 0.02);', // deep red
    '  vec3 col;',
    '  if (t < 0.33) col = mix(c0, c1, t / 0.33);',
    '  else if (t < 0.66) col = mix(c1, c2, (t - 0.33) / 0.33);',
    '  else col = mix(c2, c3, (t - 0.66) / 0.34);',
    '  return col;',
    '}',
    '',
    'void main(){',
    '  vec2 p = vWorldPos.xz;',
    '  float r = length(p);',
    '  if (r < uInner || r > uOuter) discard;',
    '  // Radial position normalized 0..1 across the disk band.',
    '  float rN = (r - uInner) / (uOuter - uInner);',
    '  float ang = atan(p.y, p.x);',
    '  // Polar->shifted-cartesian sample so streams curl along the orbit.',
    '  vec2 polar = vec2(ang * 6.0 + uTime * uDiskSpeed * 1.5, r * 1.6 - uTime * uDiskSpeed * 0.4);',
    '  float n = fbm(polar);',
    '  n = pow(n, 1.4);',
    '  // Temperature falls off outward, with the noise modulating the band.',
    '  float temp = (1.0 - rN) * 0.85 + n * 0.35;',
    '  vec3 col = plasma(temp);',
    '  // Doppler beaming: the side rotating toward the camera is brighter,',
    '  // the receding side dimmer/redder. Tangent to the disk circle is',
    '  // (-sin(ang), 0, cos(ang)) in disk-local coords; project the camera',
    '  // view direction onto that.',
    '  vec3 tang = vec3(-sin(ang), 0.0, cos(ang));',
    '  vec3 toCam = normalize(uCamPos - vWorldPos);',
    '  float beam = dot(tang, toCam);  // -1..1',
    '  // Beam factor: bright on approach, dim on recession. Asymmetric',
    '  // because real Doppler boost is roughly (1 - v/c)^-4.',
    '  float beamFactor = mix(0.55, 1.85, smoothstep(-1.0, 1.0, beam));',
    '  col *= beamFactor;',
    '  // HDR boost so the bright inner edge blooms.',
    '  col *= uIntensity * (1.0 + n * 0.6) * (0.6 + 1.4 * (1.0 - rN));',
    '  // Soft edges so the annulus does not have visible aliasing.',
    '  float edge = smoothstep(uInner, uInner + 0.10, r) * (1.0 - smoothstep(uOuter - 0.40, uOuter, r));',
    '  gl_FragColor = vec4(col * edge, 1.0);',
    '}',
  ].join('\n');

  var DISK_VERT = [
    'varying vec3 vWorldPos;',
    'void main(){',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vWorldPos = wp.xyz;',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}',
  ].join('\n');

  var diskMat = new THREE.ShaderMaterial({
    vertexShader: DISK_VERT,
    fragmentShader: DISK_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uInner: { value: CFG.diskInner },
      uOuter: { value: CFG.diskOuter },
      uCamPos: { value: new THREE.Vector3() },
      uDiskSpeed: { value: CFG.diskSpeed },
      uIntensity: { value: 2.6 },        // HDR-bright so the disk blooms
    },
    side: THREE.DoubleSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  var diskGeo = new THREE.RingGeometry(CFG.diskInner, CFG.diskOuter, 192, 4);
  var disk = new THREE.Mesh(diskGeo, diskMat);
  disk.rotation.x = -Math.PI / 2;        // lay flat in equatorial plane
  disk.rotation.z = 0;
  disk.rotation.x += CFG.diskTilt;
  scene.add(disk);

  // ---------------------------------------------------------------------
  // Stage 3 — photon ring. A bright HDR torus hugging the shadow's edge.
  // ---------------------------------------------------------------------
  var photonMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.8, 2.4, 1.6),  // > 1 = HDR, blooms strongly
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  var photonRing = new THREE.Mesh(
    new THREE.TorusGeometry(CFG.photonR, CFG.photonThickness, 14, 96),
    photonMat
  );
  photonRing.rotation.x = -Math.PI / 2 + CFG.diskTilt;
  scene.add(photonRing);

  // ---------------------------------------------------------------------
  // Stage 4 — the over-the-top arc. Faked lensing of the disk that makes
  // it wrap up over the shadow. Implementation: render a SECOND disk
  // tilted ~90 degrees from the equatorial disk (so its plane is vertical
  // facing the camera ring) at slightly smaller radii, with a vertical
  // mask that fades out below the shadow. The effect reads as a glowing
  // arc rising from behind the hole and curling forward over the top —
  // the Gargantua silhouette. NOT a true relativistic lensing render.
  // ---------------------------------------------------------------------
  var ARC_FRAG = [
    'precision highp float;',
    'varying vec3 vWorldPos;',
    'uniform float uTime;',
    'uniform float uInner;',
    'uniform float uOuter;',
    'uniform float uIntensity;',
    '',
    'float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float vnoise(vec2 p){',
    '  vec2 i=floor(p), f=fract(p);',
    '  float a=hash21(i), b=hash21(i+vec2(1.0,0.0)), c=hash21(i+vec2(0.0,1.0)), d=hash21(i+vec2(1.0,1.0));',
    '  vec2 u=f*f*(3.0-2.0*f);',
    '  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);',
    '}',
    'float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*vnoise(p); p*=2.0; a*=0.5; } return v; }',
    '',
    'vec3 plasma(float t){',
    '  t = clamp(t, 0.0, 1.0);',
    '  vec3 c0 = vec3(1.0, 1.0, 1.0);',
    '  vec3 c1 = vec3(1.0, 0.92, 0.60);',
    '  vec3 c2 = vec3(1.0, 0.55, 0.18);',
    '  vec3 c3 = vec3(0.55, 0.10, 0.02);',
    '  if (t < 0.33) return mix(c0, c1, t / 0.33);',
    '  if (t < 0.66) return mix(c1, c2, (t - 0.33) / 0.33);',
    '  return mix(c2, c3, (t - 0.66) / 0.34);',
    '}',
    '',
    'void main(){',
    '  vec2 p = vWorldPos.xy;',
    '  float r = length(p);',
    '  if (r < uInner || r > uOuter) discard;',
    '  float rN = (r - uInner) / (uOuter - uInner);',
    '  float ang = atan(p.y, p.x);',
    '  // Mask: keep only the UPPER half (the arc that wraps over the top).',
    '  // A small lower piece is allowed (so the wrap reads as a complete band).',
    '  float upper = smoothstep(-0.4, 0.4, sin(ang));',
    '  if (upper < 0.02) discard;',
    '  vec2 polar = vec2(ang * 6.0 + uTime * 0.9, r * 1.6 - uTime * 0.25);',
    '  float n = fbm(polar);',
    '  float temp = (1.0 - rN) * 0.85 + n * 0.35;',
    '  vec3 col = plasma(temp);',
    '  col *= uIntensity * (1.0 + n * 0.5);',
    '  float edge = smoothstep(uInner, uInner + 0.10, r) * (1.0 - smoothstep(uOuter - 0.4, uOuter, r));',
    '  gl_FragColor = vec4(col * edge * upper, 1.0);',
    '}',
  ].join('\n');

  var arcMat = new THREE.ShaderMaterial({
    vertexShader: DISK_VERT,
    fragmentShader: ARC_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uInner: { value: CFG.diskInner * 0.95 },
      uOuter: { value: CFG.diskOuter * 0.85 },
      uIntensity: { value: 2.2 },
    },
    side: THREE.DoubleSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });
  // The arc disk is a vertical ring (XY plane) that ALWAYS faces the
  // camera ring. We rotate it each frame so it's perpendicular to the
  // camera-to-hole line, which makes the wrap read from any orbit angle.
  var arc = new THREE.Mesh(
    new THREE.RingGeometry(CFG.diskInner * 0.95, CFG.diskOuter * 0.85, 192, 4),
    arcMat
  );
  scene.add(arc);

  // ---------------------------------------------------------------------
  // Stage 5 — screen-space lensing. A fullscreen post pass that distorts
  // the rendered frame around the hole's projected screen position with a
  // radial UV displacement that pulls inward as we approach the shadow.
  // This is the cheap-but-convincing approximation of gravitational
  // lensing — explicitly NOT a geodesic ray-trace.
  // ---------------------------------------------------------------------
  var LENS_FRAG = [
    'uniform sampler2D tDiffuse;',
    'uniform vec2  uHoleScreen;',   // hole centre in [0..1] screen UV
    'uniform float uAspect;',
    'uniform float uStrength;',
    'uniform float uFalloff;',
    'uniform float uShadowR;',      // photon-ring screen radius (approx)
    'varying vec2 vUv;',
    'void main(){',
    '  vec2 uv = vUv;',
    '  // Compute aspect-corrected delta from the hole centre so the lens',
    '  // is round on wide screens (otherwise it would be an oval).',
    '  vec2 d = uv - uHoleScreen;',
    '  d.x *= uAspect;',
    '  float r = length(d);',
    '  // Radial pull: strong near the shadow, falling off as 1/(r^falloff).',
    '  float pull = uStrength / pow(max(r, 0.001), uFalloff);',
    '  // Clamp so the centre doesnt go to infinity, and fade past ~1.0.',
    '  pull = clamp(pull, 0.0, 0.95);',
    '  pull *= 1.0 - smoothstep(0.55, 1.05, r);',
    '  vec2 dir = -normalize(d + vec2(1e-6));',
    '  dir.x /= uAspect;',
    '  vec2 sampleUv = uv + dir * pull * r;',
    '  // Inside the shadow disc, just sample black so the silhouette stays',
    '  // crisp instead of dragging stars across it.',
    '  if (r < uShadowR) {',
    '    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);',
    '    return;',
    '  }',
    '  gl_FragColor = texture2D(tDiffuse, sampleUv);',
    '}',
  ].join('\n');

  var lensShader = {
    uniforms: {
      tDiffuse: { value: null },
      uHoleScreen: { value: new THREE.Vector2(0.5, 0.5) },
      uAspect: { value: window.innerWidth / window.innerHeight },
      uStrength: { value: CFG.lensStrength },
      uFalloff: { value: CFG.lensFalloff },
      uShadowR: { value: 0.05 },
    },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: LENS_FRAG,
  };

  // ---------------------------------------------------------------------
  // Stage 6 — composer: render -> lensing -> bloom. Each addon is
  // optional; failure of any one disables only that effect.
  // ---------------------------------------------------------------------
  var composer = null, lensPass = null, bloomPass = null;
  function tryInitComposer() {
    try {
      if (!THREE.EffectComposer || !THREE.RenderPass || !THREE.ShaderPass) return;
      composer = new THREE.EffectComposer(renderer);
      composer.setSize(window.innerWidth, window.innerHeight);
      composer.addPass(new THREE.RenderPass(scene, camera));
      // Lensing is the headline effect; if we have ShaderPass at all we use it.
      lensPass = new THREE.ShaderPass(lensShader);
      composer.addPass(lensPass);
      // Bloom for the glow. Desktop only by default; mobile users can flip it on.
      if (THREE.UnrealBloomPass && TIER === 'desktop') {
        bloomPass = new THREE.UnrealBloomPass(
          new THREE.Vector2(window.innerWidth, window.innerHeight),
          CFG.bloom.strength, CFG.bloom.radius, CFG.bloom.threshold
        );
        composer.addPass(bloomPass);
      }
    } catch (e) {
      composer = null; lensPass = null; bloomPass = null;
    }
  }
  tryInitComposer();

  // ---------------------------------------------------------------------
  // Per-frame: spin the disk, update Doppler camera dir, keep the arc
  // perpendicular to the view, project the hole centre to screen for the
  // lens pass, and render.
  // ---------------------------------------------------------------------
  var holeWorld = new THREE.Vector3(0, 0, 0);
  var holeScreen = new THREE.Vector3();

  var last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;

    // Spin the disk + arc around the disk normal.
    disk.rotation.z += dt * CFG.diskSpeed;
    arc.material.uniforms.uTime.value += dt;
    diskMat.uniforms.uTime.value += dt;
    diskMat.uniforms.uCamPos.value.copy(camera.position);

    // Orient the over-the-top arc so its plane is perpendicular to the
    // camera-to-hole line — that's what makes the wrap read from every
    // orbit angle. Also tilt it slightly back so it doesn't visually
    // coincide with the photon ring.
    arc.position.set(0, 0, 0);
    arc.lookAt(camera.position);
    arc.rotation.x += -0.05;

    controls.update();

    // Project the hole's world centre to normalised screen coords for the
    // lens pass. The shadow's apparent screen radius shrinks with distance.
    holeScreen.copy(holeWorld).project(camera);
    var hsx = (holeScreen.x * 0.5) + 0.5;
    var hsy = (holeScreen.y * 0.5) + 0.5;
    if (lensPass) {
      lensPass.uniforms.uHoleScreen.value.set(hsx, hsy);
      lensPass.uniforms.uAspect.value = window.innerWidth / window.innerHeight;
      // Approximate the photon ring's screen radius from the camera-to-hole
      // distance and FOV. This is what the lens shader uses to know where
      // the black shadow disc ends.
      var camDist = camera.position.distanceTo(holeWorld);
      var halfV = Math.tan(camera.fov * Math.PI / 360);
      var ringScreen = (CFG.photonR / camDist) / halfV * 0.5;
      lensPass.uniforms.uShadowR.value = ringScreen * 0.92;
    }

    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  // ---------------------------------------------------------------------
  // Resize.
  // ---------------------------------------------------------------------
  window.addEventListener('resize', function () {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
    if (bloomPass) bloomPass.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------------------------------------------------------------------
  // UI — settings popover. Hint fades on first interaction.
  // ---------------------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  var hint = $('sg-hint');
  function killHint() { if (hint) hint.classList.add('gone'); }
  canvas.addEventListener('pointerdown', killHint, { once: true });
  canvas.addEventListener('touchstart', killHint, { once: true, passive: true });

  (function bindUI() {
    var gear = $('sg-gear'), pop = $('sg-settings');
    if (gear && pop) gear.addEventListener('click', function () { pop.classList.toggle('open'); });

    var cbAuto = $('sg-auto'), sSpeed = $('sg-speed'), sLens = $('sg-lens'), cbBloom = $('sg-bloom');
    if (cbAuto) {
      cbAuto.checked = controls.autoRotate;
      cbAuto.addEventListener('change', function () { controls.autoRotate = cbAuto.checked; });
    }
    if (sSpeed) sSpeed.addEventListener('input', function () {
      CFG.diskSpeed = sSpeed.value / 100 * 1.5;
      diskMat.uniforms.uDiskSpeed.value = CFG.diskSpeed;
    });
    if (sLens) sLens.addEventListener('input', function () {
      CFG.lensStrength = sLens.value / 100 * 0.9;
      if (lensPass) lensPass.uniforms.uStrength.value = CFG.lensStrength;
    });
    if (cbBloom) {
      cbBloom.checked = !!bloomPass;
      cbBloom.disabled = !bloomPass;
      cbBloom.addEventListener('change', function () {
        if (bloomPass) bloomPass.enabled = cbBloom.checked;
      });
    }
  })();

  requestAnimationFrame(loop);
})();
