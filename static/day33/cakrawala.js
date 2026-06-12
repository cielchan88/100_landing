/* Cakrawala — Day 33. A semi-sim flight game over an endless procedurally
 * generated archipelago. Three.js r128 from CDN; everything else is plain JS.
 *
 * Architecture: the physics core, the noise field, and the height function
 * are pure functions of state — no Three.js dependency — so the tuning
 * probe drives them headless in Node. The browser shell below wires the
 * same core to a scene, the chase camera, chunks, rings, input, and the HUD. */
(function () {
  'use strict';

  // =====================================================================
  // CFG — every tunable lives here. Edit, fly, repeat.
  // =====================================================================
  // Tuned via a headless physics probe — see the build notes for the four
  // signoff checks (cruise / climb / stall+recover / bank). Changes from the
  // prompt's starting block, with the reason for each:
  //   thrustMax    28   -> 22     T/W ratio drops from 2.9 to 2.2 so that
  //                               full-throttle climbs at >30 deg actually
  //                               bleed airspeed (the prompt's must-have).
  //   kLift        0.065 -> 0.060 cruise sits at v~25 at 0.7 throttle.
  //   kDrag        0.012 -> 0.025 cruise drag balances 0.7 thrust at v~25.
  //   kDragInduced 0.04  -> 0.06  steeper climbs cost more.
  //   pitchRate    1.6   -> 0.7   prop-plane response, not fighter-jet.
  //   rollRate     2.4   -> 1.1   same.
  //   yawRate      0.6   -> 0.5   nicer rudder feel; rudder is desktop-only.
  // Terrain mask: seaBias 0.32 -> 0.20 and maskGate 0.50 -> 0.35 (with
  // maskWidth 0.15 -> 0.20) so the archipelago covers ~9% of the sampled
  // area instead of ~2% — closer to "scattered groups", further from "empty".
  //
  // The lift MODEL also had to be changed: liftCurve(0) returns 0.22 (a
  // cambered-wing baseline) instead of 0. Without a positive baseline,
  // "level cruise without constant correction" is impossible in principle
  // — a wing producing zero lift at zero angle of attack can't hold a plane
  // up. With the baseline + the tuned drag, cruise is a stable equilibrium.
  // Bug fix: stallPitch was inverted (-0.25 actually pitched the nose UP in
  // this coordinate system, locking the plane in a deep stall instead of
  // recovering). Now -0.4, which correctly pushes the nose down during
  // stalls.
  var CFG = {
    // Physics — the semi-sim heart
    mass: 1.0,
    gravity: 9.8,
    thrustMax: 22,
    kLift: 0.060,
    kDrag: 0.025,
    kDragInduced: 0.06,
    stallAoA: 0.30,            // rad
    stallSpeed: 9,
    vRef: 22,
    pitchRate: 0.7,
    rollRate: 1.1,
    yawRate: 0.5,
    startSpeed: 24,
    startAltitude: 60,

    // Terrain
    seed: 1337,
    tFreq: 0.0035,             // hill frequency
    tAmp: 55,                  // peak height
    seaBias: 0.20,             // shifts noise toward sea
    maskFreq: 0.0009,          // low-freq island mask
    maskGate: 0.35,            // smoothstep midpoint
    maskWidth: 0.20,           // smoothstep half-width
    waterLevel: 0,
    clearance: 1.0,

    // Chunks
    chunkSize: 200,
    chunkSegs: 40,
    viewRadius: 4,             // chunks of radius around the plane

    // Colors (warm late-afternoon palette, low-poly tropical)
    colSand:    [0xE8, 0xD5, 0xA3],
    colGrass:   [0x5E, 0x9C, 0x5A],
    colUpland:  [0x47, 0x76, 0x42],
    colRock:    [0x8A, 0x7A, 0x66],
    colSea:     0x16384a,
    colSky1:    0xffc88a,      // horizon (warm)
    colSky2:    0x5b6d8a,      // zenith
    colFog:     0xffae7a,

    // Camera
    camBack: 14,
    camUp: 5,
    camLead: 6,
    camLerp: 0.085,

    // Rings
    ringCount: 5,
    ringRadius: 6,
    ringTube: 0.5,
    ringSpawnMin: 150,
    ringSpawnMax: 300,
    ringConeDeg: 35,
    ringAltMin: 15,
    ringAltMax: 80,

    // Misc
    flightOverDelayMs: 600,
  };

  // =====================================================================
  // Seeded PRNG + simplex noise (no external library).
  // =====================================================================

  function mulberry32(seed) {
    seed = seed >>> 0;
    return function () {
      seed = (seed + 0x6D2B79F5) >>> 0;
      var t = seed;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makePerm(seed) {
    var rng = mulberry32(seed);
    var p = new Uint8Array(256);
    for (var i = 0; i < 256; i++) p[i] = i;
    for (var i = 255; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = p[i]; p[i] = p[j]; p[j] = t;
    }
    var perm = new Uint8Array(512);
    for (var i = 0; i < 512; i++) perm[i] = p[i & 255];
    return perm;
  }

  var GRAD2 = [
    1, 1, -1, 1, 1, -1, -1, -1,
    1, 0, -1, 0, 0, 1, 0, -1,
  ];
  var F2 = 0.5 * (Math.sqrt(3) - 1);
  var G2 = (3 - Math.sqrt(3)) / 6;

  function makeNoise(seed) {
    var perm = makePerm(seed);
    function noise2(x, y) {
      var s = (x + y) * F2;
      var i = Math.floor(x + s);
      var j = Math.floor(y + s);
      var t = (i + j) * G2;
      var X0 = i - t, Y0 = j - t;
      var x0 = x - X0, y0 = y - Y0;
      var i1, j1;
      if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
      var x1 = x0 - i1 + G2;
      var y1 = y0 - j1 + G2;
      var x2 = x0 - 1 + 2 * G2;
      var y2 = y0 - 1 + 2 * G2;
      var ii = i & 255, jj = j & 255;
      function corner(xc, yc, gi) {
        var t = 0.5 - xc * xc - yc * yc;
        if (t < 0) return 0;
        var g = (gi & 7) << 1;
        t *= t;
        return t * t * (GRAD2[g] * xc + GRAD2[g + 1] * yc);
      }
      var n0 = corner(x0, y0, perm[ii + perm[jj]]);
      var n1 = corner(x1, y1, perm[ii + i1 + perm[jj + j1]]);
      var n2 = corner(x2, y2, perm[ii + 1 + perm[jj + 1]]);
      return 70 * (n0 + n1 + n2); // ~[-1,1]
    }
    function fbm(x, y, octaves) {
      octaves = octaves || 5;
      var amp = 1, freq = 1, sum = 0, norm = 0;
      for (var o = 0; o < octaves; o++) {
        sum += amp * noise2(x * freq, y * freq);
        norm += amp;
        amp *= 0.5;
        freq *= 2.0;
      }
      return sum / norm; // ~[-1,1]
    }
    return { noise2: noise2, fbm: fbm };
  }

  // =====================================================================
  // height(x, z) — the analytic world function.
  // The terrain mesh AND the collision check both call this; that's why
  // crashing is a comparison instead of a raycast.
  // =====================================================================
  function makeWorld(seed) {
    var n = makeNoise(seed);
    var mn = makeNoise((seed * 7349) >>> 0); // independent stream for the mask
    function smoothstep(a, b, x) {
      var t = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    }
    function height(x, z) {
      var h = n.fbm(x * CFG.tFreq, z * CFG.tFreq, 5) - CFG.seaBias;
      // Island mask: low-freq fbm pushed through a smoothstep so most of
      // the world is open sea with islands clustered into archipelagoes.
      var m = mn.fbm(x * CFG.maskFreq, z * CFG.maskFreq, 3);
      var mask = smoothstep(CFG.maskGate - CFG.maskWidth, CFG.maskGate + CFG.maskWidth, m);
      return h * CFG.tAmp * mask;
    }
    return { height: height, noise: n, mask: mn };
  }

  // =====================================================================
  // Vec3 + quaternion helpers — minimal, used by the headless physics.
  // The browser shell uses THREE.Vector3/Quaternion which are interchangeable
  // for these operations, but in Node we don't have THREE so we ship our own.
  // =====================================================================
  function V() { return { x: 0, y: 0, z: 0 }; }
  function vset(v, x, y, z) { v.x = x; v.y = y; v.z = z; return v; }
  function vcopy(o, v) { o.x = v.x; o.y = v.y; o.z = v.z; return o; }
  function vadd(o, a, b) { o.x = a.x + b.x; o.y = a.y + b.y; o.z = a.z + b.z; return o; }
  function vsub(o, a, b) { o.x = a.x - b.x; o.y = a.y - b.y; o.z = a.z - b.z; return o; }
  function vscale(o, a, s) { o.x = a.x * s; o.y = a.y * s; o.z = a.z * s; return o; }
  function vdot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function vlen(a) { return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z); }
  function vnorm(o, a) {
    var l = vlen(a);
    if (l < 1e-9) { o.x = 0; o.y = 0; o.z = 0; return o; }
    o.x = a.x / l; o.y = a.y / l; o.z = a.z / l; return o;
  }
  function vcross(o, a, b) {
    var x = a.y * b.z - a.z * b.y;
    var y = a.z * b.x - a.x * b.z;
    var z = a.x * b.y - a.y * b.x;
    o.x = x; o.y = y; o.z = z; return o;
  }

  function Q() { return { x: 0, y: 0, z: 0, w: 1 }; }
  function qcopy(o, q) { o.x = q.x; o.y = q.y; o.z = q.z; o.w = q.w; return o; }
  function qnormalize(q) {
    var l = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
    if (l < 1e-9) { q.x = 0; q.y = 0; q.z = 0; q.w = 1; return q; }
    q.x /= l; q.y /= l; q.z /= l; q.w /= l; return q;
  }
  function qfromAxisAngle(o, ax, ay, az, ang) {
    var s = Math.sin(ang * 0.5);
    o.x = ax * s; o.y = ay * s; o.z = az * s; o.w = Math.cos(ang * 0.5);
    return o;
  }
  function qmul(o, a, b) {
    var x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
    var y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
    var z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
    var w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
    o.x = x; o.y = y; o.z = z; o.w = w; return o;
  }
  // Apply a quaternion to a vector: v' = q * v * q⁻¹.
  function vapplyQ(o, v, q) {
    var ix =  q.w * v.x + q.y * v.z - q.z * v.y;
    var iy =  q.w * v.y + q.z * v.x - q.x * v.z;
    var iz =  q.w * v.z + q.x * v.y - q.y * v.x;
    var iw = -q.x * v.x - q.y * v.y - q.z * v.z;
    o.x = ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y;
    o.y = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z;
    o.z = iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x;
    return o;
  }

  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function signedAngle(a, b, axis) {
    // Signed angle from a -> b around axis, all unit.
    var d = clamp(vdot(a, b), -1, 1);
    var ang = Math.acos(d);
    var cx = a.y * b.z - a.z * b.y;
    var cy = a.z * b.x - a.x * b.z;
    var cz = a.x * b.y - a.y * b.x;
    var s = cx * axis.x + cy * axis.y + cz * axis.z;
    return s < 0 ? -ang : ang;
  }

  // =====================================================================
  // Plane state + the semi-sim physics step.
  // =====================================================================

  function makePlane() {
    return {
      pos: vset(V(), 0, CFG.startAltitude, 0),
      vel: vset(V(), 0, 0, -CFG.startSpeed), // flying along -Z
      ori: Q(),
      throttle: 0.7,
      stalling: false,
      buffet: 0,
      crashed: false,
      alive: true,
      flightTime: 0,
      flightDist: 0,
    };
  }

  function liftCurve(aoa) {
    // Cambered-wing lift: a baseline of 0.22 at AoA=0 (real wings make
    // lift even when level), rising linearly to 1.0 at stallAoA, then a
    // smooth drop past it. With kDrag 0.025 and kLift 0.050, this puts
    // cruise equilibrium near 30 m/s at 0.7 throttle with zero AoA —
    // i.e. hands-off level cruise. Pushing past stallAoA collapses lift
    // sharply; the plane recovers when AoA bleeds back under stallAoA.
    var s = CFG.stallAoA;
    var base = 0.22;
    if (aoa < -s) {
      // Inverted stall — negative AoA past the negative stall angle.
      return Math.max(-0.3, base + (aoa / s));
    }
    if (aoa <= s) {
      return base + (1.0 - base) * (aoa / s); // 0.22 at 0, 1.0 at +stallAoA
    }
    var x = (aoa - s) / s;
    var fall = Math.exp(-2.5 * x);
    return Math.max(0.05, 1.0 * fall - 0.3 * x);
  }

  // step(plane, input, dt, opts?) — input: {pitch, roll, yaw, throttleDelta, assist}
  // pitch/roll/yaw are -1..1, throttleDelta is added to throttle and clamped.
  function step(plane, input, dt) {
    var thr = clamp(plane.throttle + (input.throttleDelta || 0) * dt, 0, 1);
    plane.throttle = thr;

    // Local axes from orientation. Forward = -Z (Three.js convention).
    var fwd = vset(V(), 0, 0, -1); vapplyQ(fwd, fwd, plane.ori); vnorm(fwd, fwd);
    var up  = vset(V(), 0, 1,  0); vapplyQ(up,  up,  plane.ori); vnorm(up, up);
    var right = vset(V(), 1, 0, 0); vapplyQ(right, right, plane.ori); vnorm(right, right);

    var v = vlen(plane.vel);
    var velDir = V();
    if (v > 1e-3) vnorm(velDir, plane.vel);
    else vcopy(velDir, fwd);

    // Angle of attack: signed angle between velocity and forward, measured
    // around the right axis (so positive AoA = nose above velocity).
    var aoa = v > 0.5 ? signedAngle(velDir, fwd, right) : 0;
    aoa = clamp(aoa, -Math.PI / 2, Math.PI / 2);

    var stalling = (aoa > CFG.stallAoA) || (v < CFG.stallSpeed);
    plane.stalling = stalling;

    // Forces ---------------------------------------------------------
    var F = V();
    var t = V(); vscale(t, fwd, CFG.thrustMax * thr); vadd(F, F, t);

    var lc = liftCurve(aoa);
    var lift = V();
    vscale(lift, up, CFG.kLift * v * v * lc);
    vadd(F, F, lift);

    var dragMag = (CFG.kDrag + CFG.kDragInduced * aoa * aoa) * v * v;
    var drag = V();
    vscale(drag, velDir, -dragMag);
    vadd(F, F, drag);

    F.y -= CFG.gravity * CFG.mass;

    // Integrate ------------------------------------------------------
    var accel = V(); vscale(accel, F, 1 / CFG.mass);
    plane.vel.x += accel.x * dt;
    plane.vel.y += accel.y * dt;
    plane.vel.z += accel.z * dt;

    var dPos = V(); vscale(dPos, plane.vel, dt);
    plane.pos.x += dPos.x;
    plane.pos.y += dPos.y;
    plane.pos.z += dPos.z;
    plane.flightDist += Math.sqrt(dPos.x * dPos.x + dPos.z * dPos.z);

    // Orientation: control authority scales with speed.
    var auth = clamp(v / CFG.vRef, 0.25, 1);
    var pitch = input.pitch || 0;
    var roll  = input.roll  || 0;
    var yaw   = input.yaw   || 0;

    // Assist mode: gentle auto-level + stall guard when stick released.
    if (input.assist) {
      if (Math.abs(roll) < 0.05) {
        // level wings: lerp roll input from current bank angle
        var bank = Math.asin(clamp(right.y, -1, 1));
        roll = clamp(-bank * 0.8, -0.6, 0.6);
      }
      if (Math.abs(pitch) < 0.05) {
        // hold a small positive AoA, but not into stall
        var targetAoA = 0.04;
        pitch = clamp((targetAoA - aoa) * 1.5, -0.5, 0.5);
      }
      if (aoa > CFG.stallAoA * 0.85) {
        // hard guard: push the nose down regardless of input
        pitch = Math.min(pitch, -0.6);
      }
    }

    // Stall nose-drop torque on top of control input. In this model
    // (Three.js: forward = -Z, up = +Y, R_x(θ) tilts forward to (0,sin,-cos))
    // positive rotation about the right axis pitches the nose UP, so the
    // automatic nose-drop during a stall is a NEGATIVE bias — matching the
    // keyboard mapping where ArrowUp = stick-forward = pitch input -1 = nose
    // down. The stick convention is the spec default.
    var stallPitch = stalling ? -0.4 : 0;

    var rotX = (pitch + stallPitch) * CFG.pitchRate * auth * dt; // pitch (about right)
    var rotZ = -roll * CFG.rollRate * auth * dt;                 // roll  (about forward)
    var rotY = yaw * CFG.yawRate * auth * dt;                    // yaw   (about up)

    var qPitch = Q(); qfromAxisAngle(qPitch, right.x, right.y, right.z, rotX);
    var qRoll  = Q(); qfromAxisAngle(qRoll,  fwd.x,   fwd.y,   fwd.z,   rotZ);
    var qYaw   = Q(); qfromAxisAngle(qYaw,   up.x,    up.y,    up.z,    rotY);

    // ori = qYaw * qRoll * qPitch * ori
    var qTmp = Q();
    qmul(qTmp, qPitch, plane.ori);
    qmul(qTmp, qRoll, qTmp);
    qmul(qTmp, qYaw, qTmp);
    qcopy(plane.ori, qTmp);
    qnormalize(plane.ori);

    plane.buffet = stalling ? Math.min(1, plane.buffet + dt * 4) : Math.max(0, plane.buffet - dt * 3);
    plane.flightTime += dt;

    return { v: v, aoa: aoa, stalling: stalling, fwd: fwd, up: up, right: right };
  }

  function collide(plane, world) {
    var hx = world.height(plane.pos.x, plane.pos.z);
    var floor = Math.max(hx, CFG.waterLevel) + CFG.clearance;
    return plane.pos.y < floor;
  }

  // =====================================================================
  // Headless exports + early bail when run under Node tests.
  // =====================================================================
  var EXPORTS = {
    CFG: CFG,
    mulberry32: mulberry32,
    makeNoise: makeNoise,
    makeWorld: makeWorld,
    makePlane: makePlane,
    step: step,
    collide: collide,
    liftCurve: liftCurve,
    V: V, Q: Q,
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EXPORTS;
    return;
  }
  if (typeof window === 'undefined') return;

  // =====================================================================
  // Browser shell — Three.js scene, chunks, plane mesh, input, HUD.
  // =====================================================================

  if (typeof THREE === 'undefined') {
    document.body.innerHTML += '<div style="position:fixed;top:1rem;left:1rem;right:1rem;background:#2a1010;border:1px solid #c44;color:#fbb;padding:1rem;border-radius:.5rem;font:14px/1.5 monospace;z-index:99">Three.js failed to load from the CDN, so Cakrawala cannot run. Check your connection and reload.</div>';
    return;
  }

  var LSKEY = 'cakrawala_v1';
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function loadPrefs() {
    try {
      var raw = JSON.parse(localStorage.getItem(LSKEY));
      if (raw && typeof raw === 'object') return raw;
    } catch (e) { /* nope */ }
    return { bestRings: 0, bestDist: 0, invertPitch: false, assist: false, hud: true };
  }
  function savePrefs() { try { localStorage.setItem(LSKEY, JSON.stringify(prefs)); } catch (e) {} }
  var prefs = loadPrefs();

  function rgb(t) { return new THREE.Color(t[0] / 255, t[1] / 255, t[2] / 255); }
  function hex(v) { return new THREE.Color(v); }

  // ---- Scene / renderer ----
  var canvas = document.getElementById('cv-canvas');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputEncoding = THREE.sRGBEncoding;
  // ACES filmic tonemapping is the single biggest "rendered, not flat WebGL"
  // lever in this whole file. Light intensities below are tuned to this.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  // Canvas texture helper: a radial gradient as a CanvasTexture, used for
  // the sun disc, halo, blob shadow under the plane, and water sun-glitter.
  function makeRadialTexture(rgb, core, falloff) {
    var size = 128;
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(' + rgb + ',' + core + ')');
    g.addColorStop(falloff, 'rgba(' + rgb + ',' + (core * 0.5) + ')');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  var scene = new THREE.Scene();
  scene.background = hex(CFG.colSky2);
  // FogExp2 reads more like aerial perspective than linear fog: distant
  // islands haze out softly rather than clipping at a hard plane. Density
  // is tuned so the chunk pop-in seam hides inside the haze band.
  scene.fog = new THREE.FogExp2(CFG.colFog, 1.0 / (CFG.chunkSize * CFG.viewRadius * 0.9));

  var camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, CFG.chunkSize * CFG.viewRadius * 1.5);
  camera.position.set(0, CFG.startAltitude + 6, 30);

  // Sun direction lives at module scope so the sun sprite, halo, and water
  // glitter can all read the same vector. Low and to the side: golden hour.
  var SUN_DIR = new THREE.Vector3(-0.55, 0.30, 0.78).normalize();

  // Lights — re-tuned for ACES filmic tonemapping. Without ACES the same
  // numbers would blow out highlights; with it, this gives the warm directional
  // rake + soft sky fill the look depends on.
  var sun = new THREE.DirectionalLight(0xffd0a0, 3.2);
  sun.position.copy(SUN_DIR).multiplyScalar(200);
  scene.add(sun);
  var hemi = new THREE.HemisphereLight(0xffd6b0, 0x3a3026, 1.4);
  scene.add(hemi);

  // Sky dome: large inverted sphere with a vertical gradient.
  var skyGeo = new THREE.SphereGeometry(CFG.chunkSize * CFG.viewRadius * 1.4, 18, 12);
  var skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      cHoriz: { value: hex(CFG.colSky1) },
      cZenith: { value: hex(CFG.colSky2) },
    },
    vertexShader: 'varying vec3 vWorld;void main(){vWorld=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 cHoriz;uniform vec3 cZenith;varying vec3 vWorld;void main(){float t=clamp(normalize(vWorld).y*0.5+0.5,0.0,1.0);t=pow(t,0.55);gl_FragColor=vec4(mix(cHoriz,cZenith,t),1.0);}',
  });
  var sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // Sun disc + halo: two additive billboard sprites placed at SUN_DIR. The
  // disc is the bright warm core; the halo is a much larger, faint outer
  // glow that sells "golden hour" without any post-processing bloom. The
  // sprites parent themselves to the camera so they read as infinitely far.
  var sunTex = makeRadialTexture('255,235,200', 1.0, 0.40);
  var haloTex = makeRadialTexture('255,180,110', 0.7, 0.30);
  var SUN_FAR = CFG.chunkSize * CFG.viewRadius * 1.25;
  var sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTex, color: 0xffeecf, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: false, transparent: true,
  }));
  sunDisc.scale.set(110, 110, 1);
  scene.add(sunDisc);
  var sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTex, color: 0xffc480, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: false, transparent: true, opacity: 0.65,
  }));
  sunHalo.scale.set(340, 340, 1);
  scene.add(sunHalo);
  // Sky/sun must draw before the rest (no depth-test for sun) so it sits
  // behind everything. The sprite render order ensures correct draw order.
  sunHalo.renderOrder = -2;
  sunDisc.renderOrder = -1;

  // Sea — Phong with specular sun-glitter + gentle waves. Color leans toward
  // the warm sky horizon (fake fresnel), shininess + specular acting against
  // SUN_DIR gives the iconic glittering sun-strip on the water. The geometry
  // gets enough segments to read as wavy, and verts are perturbed every frame
  // by a sin-noise field sampled in world space (so waves stay still under
  // a translating sea plane).
  var SEA_SEGS = 64;
  var seaGeo = new THREE.PlaneGeometry(CFG.chunkSize * 7, CFG.chunkSize * 7, SEA_SEGS, SEA_SEGS);
  seaGeo.rotateX(-Math.PI / 2);
  var seaMat = new THREE.MeshPhongMaterial({
    color: 0x14384c,
    specular: 0xffd9a8,         // warm sun color produces a warm glitter strip
    shininess: 220,
    flatShading: false,
    fog: true,
  });
  var sea = new THREE.Mesh(seaGeo, seaMat);
  scene.add(sea);

  // Blob shadow under the plane: a flat textured circle at the surface,
  // scaled and faded by altitude. Cheap, but it grounds the plane in the
  // world — most of the perceived-quality jump on Mobile/High before any
  // real shadow maps are introduced.
  var blobTex = makeRadialTexture('0,0,0', 0.85, 0.45);
  var blobGeo = new THREE.PlaneGeometry(1, 1);
  blobGeo.rotateX(-Math.PI / 2);
  var blobMat = new THREE.MeshBasicMaterial({
    map: blobTex, color: 0x000000, transparent: true, opacity: 0.55,
    depthWrite: false, fog: false,
  });
  var blob = new THREE.Mesh(blobGeo, blobMat);
  blob.renderOrder = 1;
  scene.add(blob);

  // ---- World + chunk manager ----
  var world = makeWorld(CFG.seed);
  var chunks = new Map(); // "i,j" -> Mesh

  function chunkKey(i, j) { return i + ',' + j; }

  // Height + slope -> warm-graded RGB. The bands matter less than the two
  // signature touches: (a) a bright foam/wet-sand strip right at the
  // waterline so coastlines pop instead of fading muddily into the sea,
  // (b) snow on the highest gentle ground so far peaks read silhouetted
  // against the haze. Steep faces become rock at any height so cliffs
  // read as cliffs. A small per-vertex jitter breaks plastic flatness.
  var COL_FOAM   = [239, 226, 192]; // wet sand / foam at waterline
  var COL_SNOW   = [242, 243, 245];
  function colorFor(y, slope) {
    var c;
    if (y < 1.6)        c = COL_FOAM;
    else if (y < 7)     c = CFG.colSand;
    else if (y < 22)    c = CFG.colGrass;
    else if (y < 38)    c = CFG.colUpland;
    else                c = CFG.colRock;
    // Steep slopes always read as rock above the foam band.
    if (slope > 0.75 && y > 3.5) c = CFG.colRock;
    // Snow caps: high ground with gentler slope blends toward white.
    if (y > 40 && slope < 0.7) {
      var s = clamp((y - 40) / 12, 0, 1) * (1 - slope);
      c = [
        Math.round(c[0] * (1 - s) + COL_SNOW[0] * s),
        Math.round(c[1] * (1 - s) + COL_SNOW[1] * s),
        Math.round(c[2] * (1 - s) + COL_SNOW[2] * s),
      ];
    }
    // Deterministic hash-jitter so painterly variation matches at seams.
    var h = Math.sin(y * 12.9898 + slope * 78.233) * 43758.5453;
    var j = ((h - Math.floor(h)) * 14 - 7) | 0;
    return [clamp(c[0] + j, 0, 255), clamp(c[1] + j, 0, 255), clamp(c[2] + j, 0, 255)];
  }

  function buildChunk(i, j) {
    var size = CFG.chunkSize;
    var segs = CFG.chunkSegs;
    var geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);
    var pos = geo.attributes.position;
    var colors = new Float32Array(pos.count * 3);
    var ox = i * size, oz = j * size;
    for (var k = 0; k < pos.count; k++) {
      var lx = pos.getX(k), lz = pos.getZ(k);
      var wx = lx + ox, wz = lz + oz;
      // Sample height at exact world coords -> seams match across chunks.
      var h = world.height(wx, wz);
      var y = Math.max(h, CFG.waterLevel - 0.4);
      // Crude slope via x/z finite difference
      var dx = world.height(wx + 1.5, wz) - h;
      var dz = world.height(wx, wz + 1.5) - h;
      var slope = Math.sqrt(dx * dx + dz * dz) / 1.5;
      pos.setY(k, y);
      var c = colorFor(y, slope);
      colors[k * 3]     = c[0] / 255;
      colors[k * 3 + 1] = c[1] / 255;
      colors[k * 3 + 2] = c[2] / 255;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    var mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(ox, 0, oz);
    return mesh;
  }

  function updateChunks(px, pz) {
    var size = CFG.chunkSize;
    var ci = Math.floor(px / size);
    var cj = Math.floor(pz / size);
    var R = CFG.viewRadius;
    // Generate ahead of travel first: sort by Manhattan distance.
    var wanted = [];
    for (var di = -R; di <= R; di++) {
      for (var dj = -R; dj <= R; dj++) {
        if (di * di + dj * dj > R * R + 2) continue;
        wanted.push([ci + di, cj + dj, Math.abs(di) + Math.abs(dj)]);
      }
    }
    wanted.sort(function (a, b) { return a[2] - b[2]; });
    var wantedKeys = new Set();
    for (var w = 0; w < wanted.length; w++) {
      var key = chunkKey(wanted[w][0], wanted[w][1]);
      wantedKeys.add(key);
      if (!chunks.has(key)) {
        var m = buildChunk(wanted[w][0], wanted[w][1]);
        chunks.set(key, m);
        scene.add(m);
        // Build at most 2 new chunks per frame so we never stall.
        if (--budget <= 0) break;
      }
    }
    // Dispose chunks well outside the radius.
    chunks.forEach(function (mesh, key) {
      if (!wantedKeys.has(key)) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        if (mesh.material.dispose) mesh.material.dispose();
        chunks.delete(key);
      }
    });
  }
  var budget = 2;
  // First build: more generous so we start with a full ring.
  budget = 999; updateChunks(0, 0); budget = 2;

  // ---- Plane mesh (low-poly primitives) ----
  var planeGroup = new THREE.Group();
  (function buildPlane() {
    var body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.7, 4.2, 6).rotateZ(Math.PI / 2).rotateY(Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0xD97757, flatShading: true })
    );
    body.position.set(0, 0, 0);
    planeGroup.add(body);

    var nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 0.9, 6).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0xFAFAF7, flatShading: true })
    );
    nose.position.set(0, 0, -2.4);
    planeGroup.add(nose);

    var wing = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, 0.15, 1.2),
      new THREE.MeshLambertMaterial({ color: 0xD97757, flatShading: true })
    );
    wing.position.set(0, 0.2, 0);
    wing.rotation.z = 0.08; // dihedral
    planeGroup.add(wing);

    var wingTipL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 1.1), new THREE.MeshLambertMaterial({ color: 0xFAFAF7, flatShading: true }));
    wingTipL.position.set(-3.4, 0.34, 0.05);
    planeGroup.add(wingTipL);
    var wingTipR = wingTipL.clone(); wingTipR.position.x = 3.4; wingTipR.position.y = 0.34;
    planeGroup.add(wingTipR);

    var tail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, 0.7), new THREE.MeshLambertMaterial({ color: 0xD97757, flatShading: true }));
    tail.position.set(0, 0.3, 1.9);
    planeGroup.add(tail);

    var fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.0, 0.8), new THREE.MeshLambertMaterial({ color: 0xFAFAF7, flatShading: true }));
    fin.position.set(0, 0.7, 1.95);
    planeGroup.add(fin);

    var canopy = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x1a2230, flatShading: true }));
    canopy.position.set(0, 0.45, -0.5);
    planeGroup.add(canopy);

    var prop = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.08, 12).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 }));
    prop.position.set(0, 0, -2.9);
    prop.name = 'prop';
    planeGroup.add(prop);
    planeGroup.userData.prop = prop;
  })();
  scene.add(planeGroup);

  var plane = makePlane();

  // ---- Rings ----
  var ringGroup = new THREE.Group();
  scene.add(ringGroup);
  var ringMat = new THREE.MeshBasicMaterial({ color: 0xD97757 });
  var ringMatBright = new THREE.MeshBasicMaterial({ color: 0xffd9a8 });
  var ringList = []; // {mesh, pos, normal, alive, pulsedT}

  function spawnRingAhead() {
    var fwd = vset(V(), 0, 0, -1); vapplyQ(fwd, fwd, plane.ori); vnorm(fwd, fwd);
    // Base position: farthest existing ring or the plane.
    var basePos = plane.pos, baseFwd = fwd;
    if (ringList.length) {
      var farthest = null, bestD = -Infinity;
      for (var i = 0; i < ringList.length; i++) {
        var d = (ringList[i].pos.x - plane.pos.x) * fwd.x + (ringList[i].pos.z - plane.pos.z) * fwd.z;
        if (d > bestD) { bestD = d; farthest = ringList[i]; }
      }
      if (farthest) basePos = farthest.pos;
    }
    var rng = Math.random;
    var pos = V();
    for (var tries = 0; tries < 12; tries++) {
      var dist = CFG.ringSpawnMin + rng() * (CFG.ringSpawnMax - CFG.ringSpawnMin);
      var ang = (rng() - 0.5) * 2 * (CFG.ringConeDeg * Math.PI / 180);
      var cos = Math.cos(ang), sin = Math.sin(ang);
      var dx = fwd.x * cos - fwd.z * sin;
      var dz = fwd.x * sin + fwd.z * cos;
      pos.x = basePos.x + dx * dist;
      pos.z = basePos.z + dz * dist;
      pos.y = CFG.ringAltMin + rng() * (CFG.ringAltMax - CFG.ringAltMin);
      // Reject if it would be inside terrain or too low to be reachable.
      var hh = world.height(pos.x, pos.z);
      if (pos.y < hh + 4) continue;
      var geo = new THREE.TorusGeometry(CFG.ringRadius, CFG.ringTube, 8, 24);
      var m = new THREE.Mesh(geo, ringMat);
      m.position.set(pos.x, pos.y, pos.z);
      // Face the ring along the spawn direction.
      m.lookAt(pos.x + dx, pos.y, pos.z + dz);
      var rec = { mesh: m, pos: { x: pos.x, y: pos.y, z: pos.z }, normal: { x: dx, y: 0, z: dz }, alive: true, t: 0, scored: false };
      ringList.push(rec);
      ringGroup.add(m);
      return rec;
    }
    return null;
  }

  function refillRings() {
    while (ringList.length < CFG.ringCount) {
      if (!spawnRingAhead()) break;
    }
  }
  refillRings();

  function updateRings(dt, prevPos) {
    var nearest = null, nearestD = Infinity;
    for (var i = ringList.length - 1; i >= 0; i--) {
      var r = ringList[i];
      r.t += dt;
      // Pulse scale
      r.mesh.scale.setScalar(1 + Math.sin(r.t * 3) * 0.04);
      // Pass detection: signed distance to ring plane crosses zero AND within inner radius.
      var pdx = prevPos.x - r.pos.x, pdy = prevPos.y - r.pos.y, pdz = prevPos.z - r.pos.z;
      var ndx = plane.pos.x - r.pos.x, ndy = plane.pos.y - r.pos.y, ndz = plane.pos.z - r.pos.z;
      var s0 = pdx * r.normal.x + pdz * r.normal.z;
      var s1 = ndx * r.normal.x + ndz * r.normal.z;
      if (!r.scored && s0 <= 0 && s1 > 0) {
        // Crossed forward through the ring plane. Check radial offset at crossing.
        var dxr = ndx, dyr = ndy, dzr = ndz;
        var radial = Math.sqrt(dxr * dxr + dyr * dyr + dzr * dzr);
        if (radial < CFG.ringRadius * 1.05) {
          r.scored = true;
          score.rings++;
          flashRing(r);
        }
      }
      // Distance to plane for nearest pick.
      var d2 = ndx * ndx + ndy * ndy + ndz * ndz;
      if (!r.scored && d2 < nearestD) { nearestD = d2; nearest = r; }
      // Despawn if scored OR well behind the plane along forward.
      var fwd = vset(V(), 0, 0, -1); vapplyQ(fwd, fwd, plane.ori);
      var forwardOffset = (ndx * fwd.x + ndz * fwd.z);
      if (r.scored && r.t > 0.5) {
        despawnRing(r, i);
      } else if (forwardOffset < -80) {
        despawnRing(r, i);
      }
    }
    // Visual: nearest brighter.
    for (var k = 0; k < ringList.length; k++) {
      ringList[k].mesh.material = (ringList[k] === nearest) ? ringMatBright : ringMat;
    }
    return nearest;
  }
  function despawnRing(r, idx) {
    ringGroup.remove(r.mesh);
    r.mesh.geometry.dispose();
    ringList.splice(idx, 1);
  }
  function flashRing(r) {
    r.mesh.scale.setScalar(1.4);
  }

  // ---- Particles for crash ----
  var crashParts = [];
  function spawnCrashParticles() {
    for (var i = 0; i < 14; i++) {
      var g = new THREE.PlaneGeometry(0.6, 0.6);
      var m = new THREE.MeshBasicMaterial({ color: i % 2 ? 0xD97757 : 0xFAFAF7, transparent: true, opacity: 1, depthWrite: false });
      var pt = new THREE.Mesh(g, m);
      pt.position.set(plane.pos.x, plane.pos.y, plane.pos.z);
      var vel = { x: (Math.random() - 0.5) * 20, y: 4 + Math.random() * 10, z: (Math.random() - 0.5) * 20 };
      crashParts.push({ mesh: pt, vel: vel, life: 1.4 });
      scene.add(pt);
    }
  }
  function updateCrashParts(dt) {
    for (var i = crashParts.length - 1; i >= 0; i--) {
      var p = crashParts[i];
      p.life -= dt;
      if (p.life <= 0) {
        scene.remove(p.mesh);
        p.mesh.geometry.dispose(); p.mesh.material.dispose();
        crashParts.splice(i, 1);
        continue;
      }
      p.vel.y -= 18 * dt;
      p.mesh.position.x += p.vel.x * dt;
      p.mesh.position.y += p.vel.y * dt;
      p.mesh.position.z += p.vel.z * dt;
      p.mesh.material.opacity = Math.max(0, p.life / 1.4);
      p.mesh.lookAt(camera.position);
    }
  }

  // ---- Input ----
  var input = { pitch: 0, roll: 0, yaw: 0, throttleDelta: 0, assist: prefs.assist };
  var keys = {};

  window.addEventListener('keydown', function (e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    keys[e.code] = true;
    if (e.code === 'KeyR') { triggerRestart(); }
    if (e.code === 'KeyH') { prefs.hud = !prefs.hud; savePrefs(); applyHudVisibility(); }
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyS','KeyQ','KeyE','ShiftLeft','ShiftRight','ControlLeft','ControlRight','KeyR','KeyH','Space'].indexOf(e.code) >= 0) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });

  function readKeyboardInput(dt) {
    var p = 0, r = 0, y = 0, t = 0;
    var inv = prefs.invertPitch ? -1 : 1;
    // Default stick-style: ArrowUp pushes the nose DOWN. The pitch input
    // represents "pull back on the stick" so we negate ArrowUp.
    if (keys.ArrowUp)    p -= 1 * inv;
    if (keys.ArrowDown)  p += 1 * inv;
    if (keys.ArrowLeft)  r -= 1;
    if (keys.ArrowRight) r += 1;
    if (keys.KeyQ) y -= 1;
    if (keys.KeyE) y += 1;
    if (keys.ShiftLeft || keys.ShiftRight || keys.KeyW) t += 0.6;
    if (keys.ControlLeft || keys.ControlRight || keys.KeyS) t -= 0.6;
    return { pitch: p, roll: r, yaw: y, throttleDelta: t, assist: prefs.assist };
  }

  // Virtual stick + throttle slider (mobile)
  var stickRoot = document.getElementById('cv-stick');
  var stickThumb = document.getElementById('cv-stick-thumb');
  var stickVec = { x: 0, y: 0 };
  var stickActive = false;
  function attachStick() {
    if (!stickRoot) return;
    function start(e) { stickActive = true; move(e); e.preventDefault(); }
    function move(e) {
      if (!stickActive) return;
      var t = e.touches ? e.touches[0] : e;
      var r = stickRoot.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = (t.clientX - cx) / (r.width / 2);
      var dy = (t.clientY - cy) / (r.height / 2);
      var L = Math.sqrt(dx * dx + dy * dy);
      if (L > 1) { dx /= L; dy /= L; }
      stickVec.x = dx; stickVec.y = dy;
      stickThumb.style.transform = 'translate(' + (dx * r.width * 0.32) + 'px,' + (dy * r.height * 0.32) + 'px)';
    }
    function end() { stickActive = false; stickVec.x = 0; stickVec.y = 0; stickThumb.style.transform = 'translate(0,0)'; }
    stickRoot.addEventListener('pointerdown', start);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }
  attachStick();

  var throttleSlider = document.getElementById('cv-throttle');
  var throttleFill = document.getElementById('cv-throttle-fill');
  function attachThrottle() {
    if (!throttleSlider) return;
    function drag(e) {
      var t = e.touches ? e.touches[0] : e;
      var r = throttleSlider.getBoundingClientRect();
      var v = 1 - (t.clientY - r.top) / r.height;
      plane.throttle = clamp(v, 0, 1);
      throttleFill.style.height = (plane.throttle * 100) + '%';
      e.preventDefault();
    }
    throttleSlider.addEventListener('pointerdown', drag);
    var dragging = false;
    throttleSlider.addEventListener('pointerdown', function () { dragging = true; });
    window.addEventListener('pointerup', function () { dragging = false; });
    window.addEventListener('pointermove', function (e) { if (dragging) drag(e); });
  }
  attachThrottle();

  function readTouchInput() {
    var inv = prefs.invertPitch ? -1 : 1;
    // Stick Y: up on screen = pull back the stick (negative pitch input).
    return { pitch: -stickVec.y * inv, roll: stickVec.x, yaw: 0, throttleDelta: 0, assist: prefs.assist };
  }

  // ---- HUD ----
  function $(s) { return document.getElementById(s); }
  function applyHudVisibility() {
    $('cv-hud').style.display = prefs.hud ? '' : 'none';
  }
  applyHudVisibility();
  var hudThrottle = $('cv-hud-throttle-fill');
  var hudStall = $('cv-hud-stall');
  var hudArrow = $('cv-hud-arrow');

  var score = { rings: 0 };

  function updateHUD(v, alt, nearest) {
    $('cv-hud-speed').textContent = (v * 1.94).toFixed(0); // arbitrary unit -> knots-ish
    $('cv-hud-alt').textContent = alt.toFixed(0);
    hudThrottle.style.width = (plane.throttle * 100) + '%';
    $('cv-hud-rings').textContent = String(score.rings);
    $('cv-hud-dist').textContent = (plane.flightDist / 1000).toFixed(2);
    hudStall.classList.toggle('active', plane.stalling);
    if (nearest) {
      // Project nearest ring to screen for the guidance arrow.
      var tmp = new THREE.Vector3(nearest.pos.x, nearest.pos.y, nearest.pos.z).project(camera);
      // If off-screen, point an arrow at the edge in that direction.
      if (Math.abs(tmp.x) > 0.85 || Math.abs(tmp.y) > 0.85 || tmp.z > 1) {
        var ang = Math.atan2(tmp.y, tmp.x);
        if (tmp.z > 1) ang += Math.PI; // behind us
        hudArrow.style.display = '';
        hudArrow.style.transform = 'translate(-50%,-50%) rotate(' + (-ang * 180 / Math.PI + 90) + 'deg)';
      } else hudArrow.style.display = 'none';
    } else hudArrow.style.display = 'none';
  }

  // ---- Menu / overlays ----
  var state = 'menu'; // 'menu' | 'flying' | 'over'
  function setMenu() {
    state = 'menu';
    $('cv-menu').style.display = '';
    $('cv-over').style.display = 'none';
    $('cv-best-rings').textContent = prefs.bestRings;
    $('cv-best-dist').textContent = (prefs.bestDist / 1000).toFixed(2);
  }
  function setFlying() {
    state = 'flying';
    $('cv-menu').style.display = 'none';
    $('cv-over').style.display = 'none';
  }
  function setOver() {
    state = 'over';
    $('cv-over-time').textContent = plane.flightTime.toFixed(1) + ' s';
    $('cv-over-dist').textContent = (plane.flightDist / 1000).toFixed(2) + ' km';
    $('cv-over-rings').textContent = String(score.rings);
    var newRing = score.rings > prefs.bestRings;
    var newDist = plane.flightDist > prefs.bestDist;
    if (newRing) prefs.bestRings = score.rings;
    if (newDist) prefs.bestDist = plane.flightDist;
    if (newRing || newDist) savePrefs();
    $('cv-over-best-rings').textContent = prefs.bestRings + (newRing ? ' (NEW)' : '');
    $('cv-over-best-dist').textContent = (prefs.bestDist / 1000).toFixed(2) + ' km' + (newDist ? ' (NEW)' : '');
    $('cv-over').style.display = '';
  }

  function takeoff() {
    score.rings = 0;
    plane = makePlane();
    // Random heading and origin offset on each flight; chunks rebuild around.
    var heading = Math.random() * Math.PI * 2;
    plane.ori = Q();
    qfromAxisAngle(plane.ori, 0, 1, 0, heading);
    // Velocity along the new forward.
    var fwd = vset(V(), 0, 0, -1); vapplyQ(fwd, fwd, plane.ori); vnorm(fwd, fwd);
    plane.vel = vset(V(), fwd.x * CFG.startSpeed, 0, fwd.z * CFG.startSpeed);
    ringList.forEach(function (r) { ringGroup.remove(r.mesh); r.mesh.geometry.dispose(); });
    ringList.length = 0;
    crashParts.forEach(function (p) { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); });
    crashParts.length = 0;
    refillRings();
    setFlying();
  }
  function triggerRestart() {
    if (state === 'over') takeoff();
  }
  $('cv-takeoff').addEventListener('click', takeoff);
  $('cv-flyagain').addEventListener('click', takeoff);
  $('cv-back-home').addEventListener('click', function () { setMenu(); });

  // Settings
  $('cv-gear').addEventListener('click', function () { $('cv-settings').classList.toggle('open'); });
  $('cv-gear-2').addEventListener('click', function () { $('cv-settings').classList.toggle('open'); });
  var cbAssist = $('cv-cb-assist');
  var cbInvert = $('cv-cb-invert');
  var cbHud = $('cv-cb-hud');
  cbAssist.checked = !!prefs.assist;
  cbInvert.checked = !!prefs.invertPitch;
  cbHud.checked = !!prefs.hud;
  cbAssist.addEventListener('change', function () { prefs.assist = cbAssist.checked; savePrefs(); });
  cbInvert.addEventListener('change', function () { prefs.invertPitch = cbInvert.checked; savePrefs(); });
  cbHud.addEventListener('change', function () { prefs.hud = cbHud.checked; savePrefs(); applyHudVisibility(); });

  // Resize
  window.addEventListener('resize', function () {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  // ---- Adaptive performance ----
  var perfSamples = [], perfTier = 0;
  function tunePerf(frameMs) {
    perfSamples.push(frameMs);
    if (perfSamples.length < 90) return;
    var avg = perfSamples.reduce(function (a, b) { return a + b; }) / perfSamples.length;
    perfSamples.length = 0;
    if (avg > 28 && perfTier < 2) {
      perfTier++;
      if (perfTier === 1) renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
      else if (perfTier === 2) { CFG.viewRadius = Math.max(2, CFG.viewRadius - 1); scene.fog.far = CFG.chunkSize * CFG.viewRadius * 1.05; }
    }
  }

  // ---- Main loop ----
  var lastT = performance.now();
  var acc = 0;
  var STEP = 1 / 60;
  var shakeT = 0;
  var crashT = 0;

  setMenu();

  function loop(now) {
    requestAnimationFrame(loop);
    var dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > 0.1) dt = 0.1; // tab switch guard
    var frameStart = now;

    if (state === 'flying') {
      acc += dt;
      var prevPos = { x: plane.pos.x, y: plane.pos.y, z: plane.pos.z };
      var anyTouch = stickActive || stickVec.x !== 0 || stickVec.y !== 0;
      while (acc >= STEP) {
        acc -= STEP;
        var keyboardInput = readKeyboardInput(STEP);
        var touchInput = readTouchInput();
        var mixed = {
          pitch: (Math.abs(touchInput.pitch) > Math.abs(keyboardInput.pitch)) ? touchInput.pitch : keyboardInput.pitch,
          roll: (Math.abs(touchInput.roll) > Math.abs(keyboardInput.roll)) ? touchInput.roll : keyboardInput.roll,
          yaw: keyboardInput.yaw,
          throttleDelta: keyboardInput.throttleDelta,
          assist: prefs.assist,
        };
        step(plane, mixed, STEP);
      }
      // Render-time effects
      var v = vlen(plane.vel);
      var nearest = updateRings(dt, prevPos);
      refillRings();
      updateChunks(plane.pos.x, plane.pos.z);

      // Collision (analytic — no raycast).
      if (collide(plane, world)) {
        crash();
      }
      updateHUD(v, plane.pos.y, nearest);
    }

    updateCrashParts(dt);

    // Plane mesh follows physical state.
    planeGroup.position.set(plane.pos.x, plane.pos.y, plane.pos.z);
    planeGroup.quaternion.set(plane.ori.x, plane.ori.y, plane.ori.z, plane.ori.w);
    if (planeGroup.userData.prop) planeGroup.userData.prop.rotation.z += dt * (8 + plane.throttle * 40);

    // Chase camera
    var fwdv = vset(V(), 0, 0, -1); vapplyQ(fwdv, fwdv, plane.ori); vnorm(fwdv, fwdv);
    var upv = vset(V(), 0, 1, 0); vapplyQ(upv, upv, plane.ori); vnorm(upv, upv);
    var camTarget = {
      x: plane.pos.x - fwdv.x * CFG.camBack + upv.x * CFG.camUp,
      y: plane.pos.y - fwdv.y * CFG.camBack + upv.y * CFG.camUp,
      z: plane.pos.z - fwdv.z * CFG.camBack + upv.z * CFG.camUp,
    };
    var lerp = 1 - Math.pow(1 - CFG.camLerp, dt * 60);
    camera.position.x += (camTarget.x - camera.position.x) * lerp;
    camera.position.y += (camTarget.y - camera.position.y) * lerp;
    camera.position.z += (camTarget.z - camera.position.z) * lerp;
    // Shake (crash / stall buffet)
    if (!reducedMotion) {
      if (crashT > 0) {
        crashT -= dt;
        camera.position.x += (Math.random() - 0.5) * 0.6;
        camera.position.y += (Math.random() - 0.5) * 0.6;
      } else if (plane.buffet > 0.2 && state === 'flying') {
        var s = plane.buffet * 0.15;
        camera.position.x += (Math.random() - 0.5) * s;
        camera.position.y += (Math.random() - 0.5) * s;
      }
    }
    camera.lookAt(plane.pos.x + fwdv.x * CFG.camLead, plane.pos.y + fwdv.y * CFG.camLead, plane.pos.z + fwdv.z * CFG.camLead);
    if (!reducedMotion) {
      var speedT = clamp((vlen(plane.vel) - 12) / 30, 0, 1);
      camera.fov = 60 + 10 * speedT;
      camera.updateProjectionMatrix();
    }

    // Sky / sea / sun-sprites / blob-shadow all follow.
    sky.position.copy(camera.position);
    sea.position.x = camera.position.x;
    sea.position.z = camera.position.z;

    // Sun + halo: planted along SUN_DIR at the far-fog edge from the camera.
    var sunPx = camera.position.x + SUN_DIR.x * SUN_FAR;
    var sunPy = camera.position.y + SUN_DIR.y * SUN_FAR;
    var sunPz = camera.position.z + SUN_DIR.z * SUN_FAR;
    sunDisc.position.set(sunPx, sunPy, sunPz);
    sunHalo.position.set(sunPx, sunPy, sunPz);

    // Sea waves: a cheap sin/sin field sampled in world space, so the waves
    // look stationary while the sea plane translates under the camera.
    if (state === 'flying' || state === 'over') {
      var spos = sea.geometry.attributes.position;
      var sx0 = sea.position.x, sz0 = sea.position.z;
      var t60 = plane.flightTime;
      for (var si = 0; si < spos.count; si++) {
        var lx = spos.getX(si), lz = spos.getZ(si);
        var wx = lx + sx0, wz = lz + sz0;
        // Two crossed sin waves; small amplitude so the surface stays sea,
        // not a swimming pool.
        var w = Math.sin(wx * 0.045 + t60 * 0.7) * 0.22
              + Math.sin(wz * 0.062 + t60 * 0.9) * 0.18
              + Math.sin((wx + wz) * 0.030 + t60 * 0.35) * 0.10;
        spos.setY(si, w);
      }
      spos.needsUpdate = true;
      // Normals matter for the specular sun-glitter — but recomputing every
      // frame on 4225 verts is wasteful. Every 4 frames is enough for the
      // glitter to look alive.
      if (((plane.flightTime * 60) | 0) % 4 === 0) sea.geometry.computeVertexNormals();
    }

    // Blob shadow: place under the plane on whichever is higher of the
    // ground or the water, fade + grow with altitude.
    if (state === 'flying' || state === 'over') {
      var groundY = Math.max(world.height(plane.pos.x, plane.pos.z), CFG.waterLevel);
      blob.position.set(plane.pos.x, groundY + 0.08, plane.pos.z);
      var alt = Math.max(0, plane.pos.y - groundY);
      var bs = 5 + alt * 0.10;
      if (bs > 28) bs = 28;
      blob.scale.set(bs, 1, bs);
      blob.material.opacity = Math.max(0.05, 0.62 - alt * 0.0055);
    } else {
      blob.material.opacity = 0;
    }

    renderer.render(scene, camera);

    if (state === 'menu' && perfTier === 0) tunePerf(performance.now() - frameStart);
  }
  function crash() {
    if (!plane.alive) return;
    plane.alive = false;
    spawnCrashParticles();
    crashT = 0.6;
    flashScreen();
    plane.vel = V();
    setTimeout(setOver, CFG.flightOverDelayMs);
  }
  function flashScreen() {
    var fl = $('cv-flash');
    fl.classList.add('on');
    setTimeout(function () { fl.classList.remove('on'); }, 220);
  }

  requestAnimationFrame(loop);
})();
