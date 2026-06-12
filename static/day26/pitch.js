/* Pitch — Day 26. A full 11 vs 11 soccer match in Three.js (r128).
 *
 * The headline problem with 22 players is the swarm: every player chasing
 * the ball turns it into ants on sugar. The whole illusion of football is
 * shape, so the make-or-break system here is the formation+pressing AI:
 *   - Every outfield player has a home position from a 4-3-3.
 *   - The home shifts with the ball (team block pushes up to attack, drops
 *     to defend, slides toward the ball's side).
 *   - On each side, only the SINGLE closest player to the ball leaves
 *     shape to press it. Everyone else moves toward their (shifted) home.
 *   - The goalkeeper tracks the ball laterally inside its box and rushes
 *     the angle when a shot threatens, so a goal feels defended.
 * Around that core sits the cinematic floor — ACES tonemapping, sRGB,
 * PMREM env map from the sky, striped pitch, simple stadium silhouette,
 * a directional shadow light on desktop / blob shadows on mobile, a CSS
 * vignette overlay. Tier-gated so 22 players + shadows don't sink mobile. */
(function () {
  'use strict';

  if (typeof THREE === 'undefined') {
    var m = document.getElementById('ptch-menu');
    if (m) m.innerHTML = '<div class="ptch-overlay-card"><div class="ptch-title">Three.js failed to load</div><p style="color:var(--muted)">Check your network and refresh.</p></div>';
    return;
  }

  // =====================================================================
  // CFG — every tunable.
  // =====================================================================
  var CFG = {
    pitch: { w: 84, l: 56 },          // X width, Z length (3:2-ish)
    goal: { w: 8, h: 3, d: 1.6 },
    penaltyBox: { w: 32, d: 12 },
    goalBox: { w: 14, d: 4.5 },
    centerCircle: 6.5,
    teamSize: 11,

    // Player/ball physics
    playerR: 0.55, playerH: 1.8,
    ballR: 0.32,
    playerSpeed: 7.2,
    playerAccel: 30,
    aiSpeed: 6.4,
    pressBoost: 1.15,
    homeArrive: 0.85,                // how aggressively non-pressers arrive at home
    ballFriction: 1.5,
    bounceDamping: 0.55,
    gravity: -16,
    passSpeed: 14,
    minShot: 11, maxShot: 24,
    shotArc: 9,
    chargeTime: 0.85,
    matchDuration: 120,              // seconds
    possessionR: 1.1,                // takes the ball within this radius
    tackleSlow: 0.35,                // possession swap when defender closer

    // 4-3-3 formation (HOME team coords, +z toward opponent goal).
    // Mirror x and z for the AWAY team.
    formation: [
      { role: 'GK',  x:   0, z: -25 },
      { role: 'LB',  x: -11, z: -17 },
      { role: 'LCB', x:  -4, z: -19 },
      { role: 'RCB', x:   4, z: -19 },
      { role: 'RB',  x:  11, z: -17 },
      { role: 'LM',  x: -10, z:  -6 },
      { role: 'CM',  x:   0, z:  -8 },
      { role: 'RM',  x:  10, z:  -6 },
      { role: 'LW',  x: -13, z:   4 },
      { role: 'CF',  x:   0, z:   6 },
      { role: 'RW',  x:  13, z:   4 },
    ],
    teamShiftZ: 0.35,                // block pushes/drops with ball.z
    teamShiftX: 0.20,                // block slides with ball.x
    teamShiftZMax: 12,
    teamShiftXMax: 8,
    presserSupportRange: 6,          // a second presser may join only inside this

    // Camera (broadcast follow). Wider than 3v3 to read the 11v11 shape.
    cam: { height: 26, distZ: 30, lerp: 4, lookahead: 0.5 },

    // Colors
    homeColor:  0xD97757,
    awayColor:  0x4C7AB8,
    homeGK:     0x2FA86B,
    awayGK:     0xFFC34D,
    refKit:     0x0e0e0e,
    refAccent:  0xFFD24C,
    skin:       0xE9C5A3,
    pitchGreen: 0x3a8741,
    pitchDark:  0x2d6b35,
    lineColor:  0xfafaf6,
    skyColor:   0x88a6c4,
    sunColor:   0xfff0d8,
    fogColor:   0xb5cadd,
    stadiumColor: 0x16181c,
    crowdColor: 0x2a2e36,
  };

  // =====================================================================
  // Tier detection: desktop gets real shadow maps, mobile gets blob shadows.
  // Tier step-down also drops shadowMap if frame time is too slow.
  // =====================================================================
  var TIER = (function () {
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    var small = Math.min(window.innerWidth, window.innerHeight) < 720;
    return (coarse || small) ? 'mobile' : 'desktop';
  })();
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // =====================================================================
  // Game state.
  // =====================================================================
  var game = {
    renderer: null, scene: null, camera: null, hemi: null, dir: null,
    players: [],                     // 22 player objects
    referee: null,
    ball: null,
    possession: null,                // player obj currently in possession or null
    lastTouch: null,                 // who last touched (for own-goal credit, restart)
    controlledIdx: 0,                // index in players (always a home outfield)
    controlMarker: null,
    score: { home: 0, away: 0 },
    timer: CFG.matchDuration,
    state: 'menu',                   // menu | kickoff | playing | goal | fulltime
    kickoffTeam: 'home',
    shoot: { active: false, charge: 0 },
    whistle: 0,                      // pulses on ref whistle
    perfSamples: [], perfTier: 0,
    useShadowMap: TIER === 'desktop',
    pixelRatio: TIER === 'mobile' ? 1.2 : Math.min(2, window.devicePixelRatio || 1),
  };

  // =====================================================================
  // Scene + cinematic floor.
  // =====================================================================
  function buildScene() {
    var canvas = document.getElementById('ptch-canvas');
    game.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    game.renderer.setPixelRatio(game.pixelRatio);
    game.renderer.setSize(window.innerWidth, window.innerHeight, false);
    game.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    game.renderer.toneMappingExposure = 1.0;
    game.renderer.outputEncoding = THREE.sRGBEncoding;
    if (game.useShadowMap) {
      game.renderer.shadowMap.enabled = true;
      game.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    game.scene = new THREE.Scene();
    game.scene.background = new THREE.Color(CFG.skyColor);
    game.scene.fog = new THREE.Fog(CFG.fogColor, 70, 200);

    game.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.5, 320);
    game.camera.position.set(0, CFG.cam.height, -CFG.cam.distZ);
    game.camera.lookAt(0, 0, 0);

    // Lights re-tuned for ACES: directional and hemisphere are warmer + brighter.
    game.hemi = new THREE.HemisphereLight(0xfff0d8, 0x4a5260, 0.7);
    game.scene.add(game.hemi);
    game.dir = new THREE.DirectionalLight(CFG.sunColor, 2.3);
    game.dir.position.set(-30, 50, 20);
    if (game.useShadowMap) {
      game.dir.castShadow = true;
      game.dir.shadow.mapSize.set(1024, 1024);
      var s = 55;
      game.dir.shadow.camera.left = -s;
      game.dir.shadow.camera.right = s;
      game.dir.shadow.camera.top = s;
      game.dir.shadow.camera.bottom = -s;
      game.dir.shadow.camera.near = 1;
      game.dir.shadow.camera.far = 160;
      game.dir.shadow.bias = -0.0006;
    }
    game.scene.add(game.dir);

    // PMREM env from a sky-color scene so MeshStandardMaterials catch a soft
    // hemisphere reflection. Best-effort: fall through silently if it fails.
    try {
      var pmrem = new THREE.PMREMGenerator(game.renderer);
      pmrem.compileEquirectangularShader();
      var skyScene = new THREE.Scene();
      skyScene.background = new THREE.Color(CFG.skyColor);
      var envRT = pmrem.fromScene(skyScene, 0.04);
      game.scene.environment = envRT.texture;
      pmrem.dispose();
    } catch (e) { /* env IBL is a nice-to-have */ }

    buildPitch();
    buildGoals();
    buildStadium();
    if (!game.useShadowMap) buildBlobShadows();
  }

  function makeStripedPitchTexture() {
    var size = 1024;
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var ctx = c.getContext('2d');
    var bands = 16;
    var bandH = size / bands;
    for (var i = 0; i < bands; i++) {
      ctx.fillStyle = (i % 2 === 0) ? '#3a8741' : '#2d6b35';
      ctx.fillRect(0, i * bandH, size, bandH);
    }
    // A subtle noise pass on top for texture.
    var img = ctx.getImageData(0, 0, size, size);
    var d = img.data;
    for (var p = 0; p < d.length; p += 4) {
      var n = ((Math.random() - 0.5) * 14) | 0;
      d[p]   = Math.max(0, Math.min(255, d[p]   + n));
      d[p+1] = Math.max(0, Math.min(255, d[p+1] + n));
      d[p+2] = Math.max(0, Math.min(255, d[p+2] + n));
    }
    ctx.putImageData(img, 0, 0);
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  function buildPitch() {
    var grp = new THREE.Group();
    var pitchTex = makeStripedPitchTexture();
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CFG.pitch.w + 12, CFG.pitch.l + 12),
      new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.95, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    if (game.useShadowMap) ground.receiveShadow = true;
    grp.add(ground);

    // White line meshes — flat boxes laid on top of the grass.
    var lineMat = new THREE.MeshBasicMaterial({ color: CFG.lineColor, toneMapped: false });
    function addLineXZ(x1, z1, x2, z2, t) {
      t = t || 0.18;
      var len = Math.hypot(x2 - x1, z2 - z1);
      var g = new THREE.PlaneGeometry(len, t);
      var m = new THREE.Mesh(g, lineMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set((x1 + x2) / 2, 0.01, (z1 + z2) / 2);
      m.rotation.z = -Math.atan2(z2 - z1, x2 - x1);
      grp.add(m);
    }
    function addBox(cx, cz, w, d) {
      addLineXZ(cx - w / 2, cz - d / 2, cx + w / 2, cz - d / 2);
      addLineXZ(cx + w / 2, cz - d / 2, cx + w / 2, cz + d / 2);
      addLineXZ(cx + w / 2, cz + d / 2, cx - w / 2, cz + d / 2);
      addLineXZ(cx - w / 2, cz + d / 2, cx - w / 2, cz - d / 2);
    }
    function addCircle(cx, cz, r, segs) {
      segs = segs || 56;
      var pts = [];
      for (var i = 0; i <= segs; i++) {
        var a = (i / segs) * Math.PI * 2;
        pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
      }
      for (var i = 0; i < pts.length - 1; i++) addLineXZ(pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1]);
    }

    var W = CFG.pitch.w, L = CFG.pitch.l;
    // Outer touchlines + goal lines
    addBox(0, 0, W, L);
    // Halfway line
    addLineXZ(-W / 2, 0, W / 2, 0);
    // Center circle + spot
    addCircle(0, 0, CFG.centerCircle, 64);
    var cs = new THREE.Mesh(new THREE.CircleGeometry(0.25, 18), lineMat);
    cs.rotation.x = -Math.PI / 2; cs.position.set(0, 0.011, 0); grp.add(cs);
    // Penalty + goal boxes (home end at -z, away end at +z)
    addBox(0, -L / 2 + CFG.penaltyBox.d / 2, CFG.penaltyBox.w, CFG.penaltyBox.d);
    addBox(0,  L / 2 - CFG.penaltyBox.d / 2, CFG.penaltyBox.w, CFG.penaltyBox.d);
    addBox(0, -L / 2 + CFG.goalBox.d / 2, CFG.goalBox.w, CFG.goalBox.d);
    addBox(0,  L / 2 - CFG.goalBox.d / 2, CFG.goalBox.w, CFG.goalBox.d);
    // Corner arcs
    [[-W/2, -L/2], [W/2, -L/2], [-W/2, L/2], [W/2, L/2]].forEach(function (c) {
      var segs = 12;
      var pts = [];
      for (var i = 0; i <= segs; i++) {
        var a = (i / segs) * (Math.PI / 2);
        var sx = c[0] < 0 ? 1 : -1;
        var sz = c[1] < 0 ? 1 : -1;
        pts.push([c[0] + sx * Math.cos(a) * 0.9, c[1] + sz * Math.sin(a) * 0.9]);
      }
      for (var i = 0; i < pts.length - 1; i++) addLineXZ(pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1]);
    });

    game.scene.add(grp);
  }

  function buildGoals() {
    var matWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.2 });
    var netMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
    [-1, 1].forEach(function (sign) {
      var g = new THREE.Group();
      var halfW = CFG.goal.w / 2;
      // Posts
      [-halfW, halfW].forEach(function (px) {
        var post = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, CFG.goal.h, 8), matWhite);
        post.position.set(px, CFG.goal.h / 2, sign * (CFG.pitch.l / 2));
        if (game.useShadowMap) post.castShadow = true;
        g.add(post);
      });
      // Crossbar
      var bar = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, CFG.goal.w + 0.2, 8), matWhite);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, CFG.goal.h, sign * (CFG.pitch.l / 2));
      if (game.useShadowMap) bar.castShadow = true;
      g.add(bar);
      // Net (back + sides)
      var back = new THREE.Mesh(new THREE.PlaneGeometry(CFG.goal.w, CFG.goal.h), netMat);
      back.position.set(0, CFG.goal.h / 2, sign * (CFG.pitch.l / 2 + CFG.goal.d));
      g.add(back);
      var top = new THREE.Mesh(new THREE.PlaneGeometry(CFG.goal.w, CFG.goal.d), netMat);
      top.rotation.x = -Math.PI / 2;
      top.position.set(0, CFG.goal.h, sign * (CFG.pitch.l / 2 + CFG.goal.d / 2));
      g.add(top);
      [-halfW, halfW].forEach(function (px) {
        var sideNet = new THREE.Mesh(new THREE.PlaneGeometry(CFG.goal.d, CFG.goal.h), netMat);
        sideNet.rotation.y = Math.PI / 2;
        sideNet.position.set(px, CFG.goal.h / 2, sign * (CFG.pitch.l / 2 + CFG.goal.d / 2));
        g.add(sideNet);
      });
      game.scene.add(g);
    });
  }

  function buildStadium() {
    // A simple ring of dark boxes ~30u from the centre, suggesting stands +
    // crowd. Cheap, but it kills the "void around the pitch" look.
    var W = CFG.pitch.w, L = CFG.pitch.l;
    var stadMat = new THREE.MeshStandardMaterial({ color: CFG.stadiumColor, roughness: 0.85 });
    var crowdMat = new THREE.MeshStandardMaterial({ color: CFG.crowdColor, roughness: 0.95 });
    function band(side, isLong) {
      var len = isLong ? (W + 30) : (L + 30);
      var depth = 18;
      var baseH = 3;
      var seatH = 5;
      var base = new THREE.Mesh(new THREE.BoxGeometry(isLong ? len : depth, baseH, isLong ? depth : len), stadMat);
      base.position.set(isLong ? 0 : side * (W / 2 + 14), baseH / 2, isLong ? side * (L / 2 + 14) : 0);
      game.scene.add(base);
      var seats = new THREE.Mesh(new THREE.BoxGeometry(isLong ? len * 0.96 : depth * 0.96, seatH, isLong ? depth * 0.85 : len * 0.96), crowdMat);
      seats.position.set(base.position.x, baseH + seatH / 2, base.position.z);
      game.scene.add(seats);
    }
    band(1, true); band(-1, true); band(1, false); band(-1, false);

    // Subtle "sky board" so the silhouette doesn't lose itself in the fog.
    var sky = new THREE.Mesh(
      new THREE.SphereGeometry(180, 16, 12),
      new THREE.MeshBasicMaterial({ color: CFG.skyColor, side: THREE.BackSide, fog: false })
    );
    game.scene.add(sky);
  }

  // =====================================================================
  // Mobile blob shadows: a textured disc under each player when there's no
  // shadow map. Cheap; keeps the perceived-quality jump that shadows give.
  // =====================================================================
  var blobTex = null;
  function makeBlobTexture() {
    if (blobTex) return blobTex;
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.78)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.32)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    blobTex = new THREE.CanvasTexture(c);
    return blobTex;
  }
  function buildBlobShadows() { /* attached per player in makePlayer */ }

  // =====================================================================
  // Entities.
  // =====================================================================
  function makePlayer(team, role, idx) {
    var isGK = role === 'GK';
    var kit = isGK ? (team === 'home' ? CFG.homeGK : CFG.awayGK)
                   : (team === 'home' ? CFG.homeColor : CFG.awayColor);
    var grp = new THREE.Group();
    var bodyMat = new THREE.MeshStandardMaterial({ color: kit, roughness: 0.75, metalness: 0.0 });
    var skinMat = new THREE.MeshStandardMaterial({ color: CFG.skin, roughness: 0.7 });
    var shortsMat = new THREE.MeshStandardMaterial({ color: 0x1d2330, roughness: 0.75 });

    // Torso
    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.50, 1.10, 10), bodyMat);
    body.position.y = 0.95;
    if (game.useShadowMap) body.castShadow = true;
    grp.add(body);

    // Shorts
    var shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.42, 0.5, 10), shortsMat);
    shorts.position.y = 0.30;
    if (game.useShadowMap) shorts.castShadow = true;
    grp.add(shorts);

    // Head
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.30, 14, 10), skinMat);
    head.position.y = 1.78;
    if (game.useShadowMap) head.castShadow = true;
    grp.add(head);

    // Facing arrow on the chest (a small bright wedge)
    var arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.30, 4),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
    );
    arrow.rotation.x = Math.PI / 2;
    arrow.position.set(0, 1.10, 0.45);
    grp.add(arrow);

    // Blob shadow (only used when shadow map is off).
    if (!game.useShadowMap) {
      var blob = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 1.4),
        new THREE.MeshBasicMaterial({ map: makeBlobTexture(), color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false, fog: false })
      );
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 0.015;
      grp.add(blob);
    }

    return {
      grp: grp, team: team, role: role, isGK: isGK, idx: idx,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      facing: new THREE.Vector3(0, 0, team === 'home' ? 1 : -1),
      homeBase: new THREE.Vector2(0, 0),
      isPresser: false,
      isControlled: false,
      lean: 0,
      bob: Math.random() * 6.28,
    };
  }

  function makeReferee() {
    var grp = new THREE.Group();
    var kitMat = new THREE.MeshStandardMaterial({ color: CFG.refKit, roughness: 0.6 });
    var accMat = new THREE.MeshStandardMaterial({ color: CFG.refAccent, roughness: 0.4, emissive: 0x554000, emissiveIntensity: 0.3 });
    var skinMat = new THREE.MeshStandardMaterial({ color: CFG.skin, roughness: 0.7 });
    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.50, 1.10, 10), kitMat);
    body.position.y = 0.95;
    if (game.useShadowMap) body.castShadow = true;
    grp.add(body);
    // accent band
    var band = new THREE.Mesh(new THREE.CylinderGeometry(0.51, 0.51, 0.16, 10), accMat);
    band.position.y = 1.20;
    grp.add(band);
    var shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.42, 0.5, 10), kitMat);
    shorts.position.y = 0.30;
    if (game.useShadowMap) shorts.castShadow = true;
    grp.add(shorts);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.30, 14, 10), skinMat);
    head.position.y = 1.78;
    if (game.useShadowMap) head.castShadow = true;
    grp.add(head);
    if (!game.useShadowMap) {
      var blob = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 1.4),
        new THREE.MeshBasicMaterial({ map: makeBlobTexture(), color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false, fog: false })
      );
      blob.rotation.x = -Math.PI / 2; blob.position.y = 0.015;
      grp.add(blob);
    }
    return {
      grp: grp,
      pos: new THREE.Vector3(8, 0, 0),
      vel: new THREE.Vector3(),
      bob: 0,
    };
  }

  function makeBall() {
    var mat = new THREE.MeshStandardMaterial({ color: 0xfafaf6, roughness: 0.45, metalness: 0.1, envMapIntensity: 1.0 });
    var mesh = new THREE.Mesh(new THREE.SphereGeometry(CFG.ballR, 16, 12), mat);
    mesh.position.y = CFG.ballR;
    if (game.useShadowMap) mesh.castShadow = true;
    var blob = null;
    if (!game.useShadowMap) {
      blob = new THREE.Mesh(
        new THREE.PlaneGeometry(0.7, 0.7),
        new THREE.MeshBasicMaterial({ map: makeBlobTexture(), color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false, fog: false })
      );
      blob.rotation.x = -Math.PI / 2; blob.position.y = 0.012;
      game.scene.add(blob);
    }
    return {
      mesh: mesh, blob: blob,
      pos: new THREE.Vector3(0, CFG.ballR, 0),
      vel: new THREE.Vector3(),
    };
  }

  function makeControlMarker() {
    var ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.05, 28),
      new THREE.MeshBasicMaterial({ color: 0xfafaf6, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    game.scene.add(ring);
    return ring;
  }

  function placeFormation() {
    game.players = [];
    CFG.formation.forEach(function (slot, i) {
      var h = makePlayer('home', slot.role, i);
      h.homeBase.set(slot.x, slot.z);
      h.pos.set(slot.x, 0, slot.z);
      h.grp.position.copy(h.pos);
      game.scene.add(h.grp);
      game.players.push(h);
      var a = makePlayer('away', slot.role, i + CFG.teamSize);
      a.homeBase.set(-slot.x, -slot.z);
      a.pos.set(-slot.x, 0, -slot.z);
      a.facing.set(0, 0, -1);
      a.grp.position.copy(a.pos);
      game.scene.add(a.grp);
      game.players.push(a);
    });
  }

  // =====================================================================
  // Helpers.
  // =====================================================================
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function dist2XZ(a, b) {
    var dx = a.x - b.x, dz = a.z - b.z;
    return dx * dx + dz * dz;
  }
  function distXZ(a, b) { return Math.sqrt(dist2XZ(a, b)); }

  // Move a unit toward a target on the XZ plane at the given speed, with a
  // bit of acceleration so it doesn't instant-snap. `arrive` is 0..1 — the
  // fraction of full speed when far away; smaller = drift toward the target.
  function steerToward(unit, tx, tz, dt, speed, arrive) {
    if (arrive == null) arrive = 1.0;
    var dx = tx - unit.pos.x, dz = tz - unit.pos.z;
    var d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.05) { unit.vel.x = 0; unit.vel.z = 0; return; }
    // arrival ramp: full speed beyond 4u, ease in close.
    var s = speed * Math.min(1, d / 4) * arrive;
    var ux = dx / d, uz = dz / d;
    unit.vel.x += (ux * s - unit.vel.x) * Math.min(1, dt * 6);
    unit.vel.z += (uz * s - unit.vel.z) * Math.min(1, dt * 6);
    unit.pos.x += unit.vel.x * dt;
    unit.pos.z += unit.vel.z * dt;
    // Facing follows velocity when moving.
    var vlen = Math.hypot(unit.vel.x, unit.vel.z);
    if (vlen > 0.6 && unit.facing) {
      unit.facing.x = unit.vel.x / vlen;
      unit.facing.z = unit.vel.z / vlen;
    }
    // Clamp to pitch with a margin.
    unit.pos.x = clamp(unit.pos.x, -CFG.pitch.w / 2 - 2, CFG.pitch.w / 2 + 2);
    unit.pos.z = clamp(unit.pos.z, -CFG.pitch.l / 2 - 4, CFG.pitch.l / 2 + 4);
  }

  // =====================================================================
  // The formation + pressing AI. THE gate for an 11v11 game.
  // =====================================================================
  function findNearestTeammate(team, ball, excludeGK) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < game.players.length; i++) {
      var p = game.players[i];
      if (p.team !== team) continue;
      if (excludeGK && p.isGK) continue;
      var d = dist2XZ(p.pos, ball.pos);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  function markPressers() {
    var hp = findNearestTeammate('home', game.ball, true);
    var ap = findNearestTeammate('away', game.ball, true);
    for (var i = 0; i < game.players.length; i++) game.players[i].isPresser = false;
    if (hp) hp.isPresser = true;
    if (ap) ap.isPresser = true;
    return { home: hp, away: ap };
  }

  function teamShift(team) {
    var bx = game.ball.pos.x, bz = game.ball.pos.z;
    var sign = team === 'home' ? 1 : -1;
    var zS = clamp(bz * CFG.teamShiftZ * sign, -CFG.teamShiftZMax, CFG.teamShiftZMax) * sign;
    var xS = clamp(bx * CFG.teamShiftX, -CFG.teamShiftXMax, CFG.teamShiftXMax);
    return { x: xS, z: zS };
  }

  function updateFormation(dt) {
    var pressers = markPressers();
    var hShift = teamShift('home');
    var aShift = teamShift('away');
    var controlled = game.players[game.controlledIdx];

    for (var i = 0; i < game.players.length; i++) {
      var p = game.players[i];
      if (p === controlled) continue;            // human input handles this one
      if (p.isGK) { updateGK(p, dt); continue; }
      if (p.isPresser) {
        // Closest player on the team presses the ball directly.
        var sp = (p.team === 'home' ? CFG.aiSpeed : CFG.aiSpeed) * CFG.pressBoost;
        steerToward(p, game.ball.pos.x, game.ball.pos.z, dt, sp, 1.0);
        // If presser has the ball, try a simple attack action.
        if (game.possession === p) tryAttackAction(p, dt);
      } else {
        // Everyone else moves toward their (ball-shifted) home position.
        var shift = p.team === 'home' ? hShift : aShift;
        var tx = p.homeBase.x + shift.x;
        var tz = p.homeBase.y + shift.z;
        // Small per-player noise so the line isn't a rigid grid.
        tx += Math.sin(performance.now() * 0.0003 + p.idx * 1.7) * 0.7;
        tz += Math.cos(performance.now() * 0.0004 + p.idx * 1.3) * 0.7;
        steerToward(p, tx, tz, dt, CFG.aiSpeed * 0.75, CFG.homeArrive);
      }
    }
  }

  // Attack micro-AI for the player who has possession (AI side): walk toward
  // opponent goal; if a teammate ahead has a better angle, pass; if close
  // enough to goal, shoot.
  function tryAttackAction(p, dt) {
    var oppGoalZ = p.team === 'home' ? CFG.pitch.l / 2 : -CFG.pitch.l / 2;
    var dz = oppGoalZ - p.pos.z;
    var distToGoal = Math.abs(dz);
    // In shooting range and lined up: shoot.
    if (distToGoal < 22 && Math.abs(p.pos.x) < CFG.penaltyBox.w / 2 + 6 && Math.random() < 0.012) {
      var dirX = -p.pos.x * 0.04;
      var dirZ = (oppGoalZ > p.pos.z ? 1 : -1);
      var len = Math.hypot(dirX, dirZ);
      var power = clamp(CFG.minShot + Math.random() * (CFG.maxShot - CFG.minShot), CFG.minShot, CFG.maxShot);
      game.ball.vel.set((dirX / len) * power, CFG.shotArc * 0.85, (dirZ / len) * power);
      game.possession = null;
      game.lastTouch = p;
      return;
    }
    // Sometimes pass to a teammate further ahead.
    if (Math.random() < 0.025) {
      var best = null, bestScore = -Infinity;
      for (var i = 0; i < game.players.length; i++) {
        var t = game.players[i];
        if (t === p || t.team !== p.team || t.isGK) continue;
        var fwd = (t.pos.z - p.pos.z) * (p.team === 'home' ? 1 : -1);
        if (fwd < 3) continue;
        var d = distXZ(p.pos, t.pos);
        var score = fwd - d * 0.4;
        if (score > bestScore) { bestScore = score; best = t; }
      }
      if (best) {
        var dx = best.pos.x - p.pos.x, dzp = best.pos.z - p.pos.z;
        var len2 = Math.hypot(dx, dzp);
        game.ball.vel.set((dx / len2) * CFG.passSpeed, 1.6, (dzp / len2) * CFG.passSpeed);
        game.possession = null;
        game.lastTouch = p;
        return;
      }
    }
  }

  // =====================================================================
  // Goalkeeper. The keeper makes a goal feel defended.
  // =====================================================================
  function updateGK(gk, dt) {
    var ownGoalZ = gk.team === 'home' ? -CFG.pitch.l / 2 : CFG.pitch.l / 2;
    var sign = gk.team === 'home' ? 1 : -1;       // step forward direction
    var ball = game.ball;
    // Lateral tracking, clamped to the goalmouth so we can't be lobbed past.
    var goalmouth = CFG.goal.w / 2 - 0.4;
    var trackX = clamp(ball.pos.x, -goalmouth, goalmouth);
    // Start 1.2u in front of the goal line.
    var trackZ = ownGoalZ + sign * 1.2;

    // Step out to narrow the angle when the ball gets close (linear ramp).
    var distZ = Math.abs(ball.pos.z - ownGoalZ);
    if (distZ < 18) {
      var stepOut = (18 - distZ) * 0.35;
      trackZ = ownGoalZ + sign * (1.2 + stepOut);
      // Bias toward the ball X more aggressively the closer the ball is.
      var bias = clamp(1 - distZ / 18, 0, 1);
      trackX = trackX * (1 - bias * 0.5) + ball.pos.x * (bias * 0.5);
      trackX = clamp(trackX, -CFG.penaltyBox.w / 2 + 1, CFG.penaltyBox.w / 2 - 1);
    }

    // Rush the ball if it's inside our penalty box.
    var inOwnBox = Math.abs(ball.pos.x) < CFG.penaltyBox.w / 2
                && Math.abs(ball.pos.z - ownGoalZ) < CFG.penaltyBox.d;
    if (inOwnBox) {
      trackX = ball.pos.x;
      trackZ = ball.pos.z + sign * 0.4;
    }

    steerToward(gk, trackX, trackZ, dt, CFG.aiSpeed * (inOwnBox ? 1.05 : 0.85));
    // Face the ball.
    var dx = ball.pos.x - gk.pos.x, dz = ball.pos.z - gk.pos.z;
    var dl = Math.hypot(dx, dz);
    if (dl > 0.2) { gk.facing.set(dx / dl, 0, dz / dl); }
  }

  // =====================================================================
  // Referee — follows play and runs the kickoff/goal ceremony.
  // =====================================================================
  function updateReferee(dt) {
    if (!game.referee) return;
    // Follow at an offset perpendicular to the ball's motion direction so
    // the ref stays out of the play. Falls back to a static side offset.
    var v = Math.hypot(game.ball.vel.x, game.ball.vel.z);
    var ox = 6, oz = 0;
    if (v > 1) {
      var px = -game.ball.vel.z / v, pz = game.ball.vel.x / v;
      ox = px * 7; oz = pz * 7;
    }
    var tx = clamp(game.ball.pos.x + ox, -CFG.pitch.w / 2 + 3, CFG.pitch.w / 2 - 3);
    var tz = clamp(game.ball.pos.z + oz, -CFG.pitch.l / 2 + 3, CFG.pitch.l / 2 - 3);
    steerToward(game.referee, tx, tz, dt, 5.4);
    // Soft avoidance: if the ref is within a unit of the ball, nudge sideways.
    var d = distXZ(game.referee.pos, game.ball.pos);
    if (d < 1.2) {
      var dx = game.referee.pos.x - game.ball.pos.x;
      var dz = game.referee.pos.z - game.ball.pos.z;
      var dl = Math.hypot(dx, dz) || 1;
      game.referee.pos.x += (dx / dl) * (1.2 - d);
      game.referee.pos.z += (dz / dl) * (1.2 - d);
    }
  }

  function refWhistle() {
    game.whistle = 1.0;
    var el = document.getElementById('ptch-whistle');
    if (el) { el.classList.add('show'); setTimeout(function () { el.classList.remove('show'); }, 380); }
  }

  // =====================================================================
  // Input.
  // =====================================================================
  var keys = {};
  function bindKeyboard() {
    window.addEventListener('keydown', function (e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      keys[e.code] = true;
      if (e.code === 'KeyJ') tryPass();
      if (e.code === 'KeyK') { if (!game.shoot.active) { game.shoot.active = true; game.shoot.charge = 0; } }
      if (e.code === 'Tab') { e.preventDefault(); manualSwitch(); }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].indexOf(e.code) >= 0) e.preventDefault();
    });
    window.addEventListener('keyup', function (e) {
      keys[e.code] = false;
      if (e.code === 'KeyK' && game.shoot.active) { tryShoot(game.shoot.charge); game.shoot.active = false; game.shoot.charge = 0; }
    });
  }
  function readKeyboardMovement() {
    var x = 0, z = 0;
    if (keys.KeyW || keys.ArrowUp) z += 1;
    if (keys.KeyS || keys.ArrowDown) z -= 1;
    if (keys.KeyA || keys.ArrowLeft) x -= 1;
    if (keys.KeyD || keys.ArrowRight) x += 1;
    var l = Math.hypot(x, z);
    return l > 0 ? { x: x / l, z: z / l } : { x: 0, z: 0 };
  }

  // Virtual joystick (touch).
  var stick = { x: 0, z: 0, active: false };
  function bindJoystick() {
    var root = document.getElementById('ptch-joystick');
    var thumb = document.getElementById('ptch-joystick-thumb');
    if (!root) return;
    function move(e) {
      if (!stick.active) return;
      var t = e.touches ? e.touches[0] : e;
      var r = root.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = (t.clientX - cx) / (r.width / 2);
      var dy = (t.clientY - cy) / (r.height / 2);
      var L = Math.hypot(dx, dy);
      if (L > 1) { dx /= L; dy /= L; }
      stick.x = dx; stick.z = -dy;
      thumb.style.transform = 'translate(' + (dx * r.width * 0.32) + 'px,' + (dy * r.height * 0.32) + 'px)';
      e.preventDefault();
    }
    root.addEventListener('pointerdown', function (e) { stick.active = true; move(e); });
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', function () { stick.active = false; stick.x = 0; stick.z = 0; thumb.style.transform = 'translate(0,0)'; });
    window.addEventListener('pointercancel', function () { stick.active = false; stick.x = 0; stick.z = 0; thumb.style.transform = 'translate(0,0)'; });
  }
  function readInputVector() {
    if (stick.active) return { x: stick.x, z: stick.z };
    return readKeyboardMovement();
  }
  function bindButtons() {
    var pass = document.getElementById('ptch-pass-btn');
    var shoot = document.getElementById('ptch-shoot-btn');
    var sw = document.getElementById('ptch-switch-btn');
    if (pass) pass.addEventListener('pointerdown', function (e) { e.preventDefault(); tryPass(); });
    if (sw) sw.addEventListener('pointerdown', function (e) { e.preventDefault(); manualSwitch(); });
    if (shoot) {
      shoot.addEventListener('pointerdown', function (e) { e.preventDefault(); game.shoot.active = true; game.shoot.charge = 0; });
      shoot.addEventListener('pointerup', function (e) { if (game.shoot.active) { tryShoot(game.shoot.charge); game.shoot.active = false; game.shoot.charge = 0; } });
      shoot.addEventListener('pointercancel', function () { if (game.shoot.active) { game.shoot.active = false; game.shoot.charge = 0; } });
    }
  }

  // =====================================================================
  // Control + switching.
  // =====================================================================
  function pickControlled() {
    // If a HOME player has possession, that's the controlled player.
    if (game.possession && game.possession.team === 'home' && !game.possession.isGK) {
      game.controlledIdx = game.players.indexOf(game.possession);
      return;
    }
    // Otherwise switch to the nearest HOME outfield player to the ball.
    var best = -1, bestD = Infinity;
    for (var i = 0; i < game.players.length; i++) {
      var p = game.players[i];
      if (p.team !== 'home' || p.isGK) continue;
      var d = dist2XZ(p.pos, game.ball.pos);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) game.controlledIdx = best;
  }

  function manualSwitch() {
    // Cycle to the next-nearest HOME outfield player to the ball.
    var ranked = game.players
      .map(function (p, i) { return { p: p, i: i, d: dist2XZ(p.pos, game.ball.pos) }; })
      .filter(function (r) { return r.p.team === 'home' && !r.p.isGK; })
      .sort(function (a, b) { return a.d - b.d; });
    for (var k = 0; k < ranked.length; k++) {
      if (ranked[k].i === game.controlledIdx) {
        game.controlledIdx = ranked[(k + 1) % ranked.length].i;
        return;
      }
    }
    if (ranked.length) game.controlledIdx = ranked[0].i;
  }

  function controlPlayer(dt) {
    var p = game.players[game.controlledIdx];
    if (!p) return;
    var inp = readInputVector();
    var mag = Math.hypot(inp.x, inp.z);
    if (mag > 0.05) {
      p.vel.x += (inp.x * CFG.playerSpeed - p.vel.x) * Math.min(1, dt * 8);
      p.vel.z += (inp.z * CFG.playerSpeed - p.vel.z) * Math.min(1, dt * 8);
      p.facing.x = inp.x; p.facing.z = inp.z;
      var fl = Math.hypot(p.facing.x, p.facing.z);
      if (fl > 0) { p.facing.x /= fl; p.facing.z /= fl; }
    } else {
      p.vel.x *= Math.max(0, 1 - dt * 7);
      p.vel.z *= Math.max(0, 1 - dt * 7);
    }
    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.z * dt;
    p.pos.x = clamp(p.pos.x, -CFG.pitch.w / 2 - 2, CFG.pitch.w / 2 + 2);
    p.pos.z = clamp(p.pos.z, -CFG.pitch.l / 2 - 4, CFG.pitch.l / 2 + 4);
    // Dribble: if we have possession, the ball sits just ahead.
    if (game.possession === p) {
      var dribX = p.pos.x + p.facing.x * 0.9;
      var dribZ = p.pos.z + p.facing.z * 0.9;
      game.ball.pos.x = dribX;
      game.ball.pos.z = dribZ;
      game.ball.pos.y = CFG.ballR;
      game.ball.vel.set(0, 0, 0);
    }
    // Charge the shot meter while the button/key is held.
    if (game.shoot.active) {
      game.shoot.charge = Math.min(1, game.shoot.charge + dt / CFG.chargeTime);
    }
  }

  function tryPass() {
    var p = game.players[game.controlledIdx];
    if (!p || game.possession !== p) return;
    // Lead to the best teammate within a ~70° facing cone.
    var best = null, bestScore = -Infinity;
    var fx = p.facing.x, fz = p.facing.z;
    for (var i = 0; i < game.players.length; i++) {
      var t = game.players[i];
      if (t === p || t.team !== 'home' || t.isGK) continue;
      var dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z;
      var d = Math.hypot(dx, dz);
      if (d < 2) continue;
      var dot = (dx * fx + dz * fz) / d;
      if (dot < 0.4) continue;       // outside cone
      var score = dot * 2 - d * 0.05;
      if (score > bestScore) { bestScore = score; best = t; }
    }
    if (!best) return;
    var dxp = best.pos.x - p.pos.x, dzp = best.pos.z - p.pos.z;
    var dl = Math.hypot(dxp, dzp);
    // Lead the pass slightly.
    var lead = clamp(dl * 0.08, 0, 3);
    dxp += best.vel.x * lead * 0.1;
    dzp += best.vel.z * lead * 0.1;
    dl = Math.hypot(dxp, dzp);
    game.ball.vel.set((dxp / dl) * CFG.passSpeed, 1.4, (dzp / dl) * CFG.passSpeed);
    game.possession = null;
    game.lastTouch = p;
  }

  function tryShoot(charge) {
    var p = game.players[game.controlledIdx];
    if (!p || game.possession !== p) return;
    var power = CFG.minShot + (CFG.maxShot - CFG.minShot) * Math.max(0.15, charge);
    var fx = p.facing.x, fz = p.facing.z;
    var fl = Math.hypot(fx, fz);
    if (fl < 0.1) { fz = 1; fl = 1; }
    fx /= fl; fz /= fl;
    var arc = CFG.shotArc * (0.55 + charge * 0.65);
    game.ball.vel.set(fx * power, arc, fz * power);
    game.possession = null;
    game.lastTouch = p;
  }

  // =====================================================================
  // Ball physics + possession + goal detection.
  // =====================================================================
  function updateBall(dt) {
    var b = game.ball;
    // Gravity + ground friction.
    b.vel.y += CFG.gravity * dt;
    b.pos.x += b.vel.x * dt;
    b.pos.y += b.vel.y * dt;
    b.pos.z += b.vel.z * dt;
    if (b.pos.y <= CFG.ballR) {
      b.pos.y = CFG.ballR;
      if (b.vel.y < 0) b.vel.y = -b.vel.y * CFG.bounceDamping;
      if (Math.abs(b.vel.y) < 0.6) b.vel.y = 0;
      // Ground friction.
      var hv = Math.hypot(b.vel.x, b.vel.z);
      if (hv > 0) {
        var newHv = Math.max(0, hv - CFG.ballFriction * dt);
        b.vel.x *= newHv / hv;
        b.vel.z *= newHv / hv;
      }
    }
    // Touch-line / goal-line containment (kickoff-style restart for now).
    var halfW = CFG.pitch.w / 2 + 0.6;
    var halfL = CFG.pitch.l / 2 + 0.6;
    if (Math.abs(b.pos.x) > halfW + 5 || Math.abs(b.pos.z) > halfL + 8) {
      // Out of bounds far enough that nobody's chasing — quick reset.
      restartFromCenter('out');
      return;
    }
    // Possession check: any player within possessionR while the ball is on
    // the ground takes/keeps the ball. The closest player wins ties.
    if (b.pos.y < CFG.ballR + 0.3 && Math.abs(b.vel.y) < 1.5) {
      var nearest = null, nearestD = Infinity;
      for (var i = 0; i < game.players.length; i++) {
        var p = game.players[i];
        var d = distXZ(p.pos, b.pos);
        if (d < nearestD) { nearestD = d; nearest = p; }
      }
      if (nearest && nearestD < CFG.possessionR) {
        // Tackle: if a different team's player is now closer, swap.
        if (game.possession !== nearest) {
          game.possession = nearest;
          game.lastTouch = nearest;
          // give a slight backward kick to settle
          b.vel.set(0, 0, 0);
        }
      } else if (game.possession && distXZ(game.possession.pos, b.pos) > CFG.possessionR * 1.4) {
        game.possession = null;
      }
    }
  }

  function checkGoal() {
    var b = game.ball;
    var halfW = CFG.goal.w / 2;
    // Home goal sits at -L/2, away goal at +L/2. Ball crosses the line if
    // |x| < halfW, y < goal.h, and z past the line.
    if (b.pos.x > -halfW && b.pos.x < halfW && b.pos.y < CFG.goal.h) {
      if (b.pos.z < -CFG.pitch.l / 2) {
        // home conceded -> away scores
        game.score.away++;
        startGoalSequence('away');
        return true;
      }
      if (b.pos.z > CFG.pitch.l / 2) {
        game.score.home++;
        startGoalSequence('home');
        return true;
      }
    }
    return false;
  }

  function startGoalSequence(scorer) {
    refWhistle();
    game.state = 'goal';
    var flash = document.getElementById('ptch-goal-flash');
    if (flash) { flash.classList.remove('is-hidden'); setTimeout(function () { flash.classList.add('is-hidden'); }, 1400); }
    updateScoreboard();
    setTimeout(function () {
      // Kickoff goes to the conceding team.
      resetForKickoff(scorer === 'home' ? 'away' : 'home');
      game.state = 'playing';
    }, 1500);
  }

  function restartFromCenter(reason) {
    game.ball.pos.set(0, CFG.ballR, 0);
    game.ball.vel.set(0, 0, 0);
    game.possession = null;
  }

  function resetForKickoff(team) {
    // Re-lay both formations and place the ball at centre.
    for (var i = 0; i < game.players.length; i++) {
      var slot = CFG.formation[i % CFG.teamSize];
      var sign = i < CFG.teamSize ? 1 : -1;
      game.players[i].pos.set(slot.x * sign, 0, slot.z * sign);
      game.players[i].vel.set(0, 0, 0);
      game.players[i].facing.set(0, 0, sign);
    }
    game.referee.pos.set(8, 0, 0);
    game.ball.pos.set(0, CFG.ballR, 0);
    game.ball.vel.set(0, 0, 0);
    game.possession = null;
    game.lastTouch = null;
    game.kickoffTeam = team;
    refWhistle();
  }

  function updateScoreboard() {
    var hs = document.getElementById('ptch-score-home');
    var as = document.getElementById('ptch-score-away');
    if (hs) hs.textContent = game.score.home;
    if (as) as.textContent = game.score.away;
  }

  function updateTimer(dt) {
    if (game.state !== 'playing') return;
    game.timer -= dt;
    if (game.timer < 0) game.timer = 0;
    var m = Math.floor(game.timer / 60);
    var s = Math.floor(game.timer % 60);
    var el = document.getElementById('ptch-timer');
    if (el) el.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    if (game.timer <= 0) endMatch();
  }

  // =====================================================================
  // Camera (broadcast follow). Wide enough to read the 11v11 shape.
  // =====================================================================
  function updateCamera(dt) {
    var b = game.ball;
    // Aim at a point between the ball and the centre of the pitch, with
    // a small lookahead toward the ball's movement.
    var aim = new THREE.Vector3(
      b.pos.x * 0.65 + b.vel.x * CFG.cam.lookahead,
      0,
      b.pos.z * 0.7 + b.vel.z * CFG.cam.lookahead
    );
    var camTarget = new THREE.Vector3(aim.x, CFG.cam.height, aim.z - CFG.cam.distZ);
    var t = 1 - Math.pow(1 - 0.06, dt * 60);
    game.camera.position.lerp(camTarget, t);
    game.camera.lookAt(aim);
  }

  function updateControlMarker() {
    var p = game.players[game.controlledIdx];
    if (!p || !game.controlMarker) return;
    game.controlMarker.position.set(p.pos.x, 0.022, p.pos.z);
  }

  // =====================================================================
  // Visuals: sync all groups from game state each frame.
  // =====================================================================
  function syncVisuals(dt) {
    for (var i = 0; i < game.players.length; i++) {
      var p = game.players[i];
      p.grp.position.set(p.pos.x, 0, p.pos.z);
      // Face the way we're moving (or the ball, for the GK).
      var fa = Math.atan2(p.facing.x, p.facing.z);
      p.grp.rotation.y = fa;
      // Subtle running bob + lean toward velocity.
      var v = Math.hypot(p.vel.x, p.vel.z);
      p.bob += dt * (4 + v * 1.2);
      var bobY = v > 0.5 ? Math.abs(Math.sin(p.bob)) * 0.12 : 0;
      p.grp.position.y = bobY;
      // Lean: tilt forward in the direction of velocity.
      var leanT = clamp(v / CFG.playerSpeed, 0, 1) * 0.18;
      p.grp.rotation.x = -leanT;
    }
    if (game.referee) {
      var r = game.referee;
      r.grp.position.set(r.pos.x, 0, r.pos.z);
      var rv = Math.hypot(r.vel.x, r.vel.z);
      r.bob += dt * (3 + rv * 1.0);
      r.grp.position.y = rv > 0.5 ? Math.abs(Math.sin(r.bob)) * 0.10 : 0;
      var rfa = Math.atan2(r.vel.x || 0.01, r.vel.z || 0.01);
      r.grp.rotation.y = rfa;
    }
    game.ball.mesh.position.copy(game.ball.pos);
    if (game.ball.blob) {
      game.ball.blob.position.set(game.ball.pos.x, 0.012, game.ball.pos.z);
      game.ball.blob.material.opacity = clamp(0.55 - game.ball.pos.y * 0.04, 0.05, 0.55);
    }
    // Rolling ball spin.
    var sv = Math.hypot(game.ball.vel.x, game.ball.vel.z);
    if (sv > 0.1) {
      var axis = new THREE.Vector3(-game.ball.vel.z, 0, game.ball.vel.x).normalize();
      game.ball.mesh.rotateOnWorldAxis(axis, sv * dt / CFG.ballR);
    }
    // Marker opacity pulse so it's clearly the controlled player.
    if (game.controlMarker) {
      game.controlMarker.material.opacity = 0.7 + Math.sin(performance.now() * 0.006) * 0.2;
    }
    // Power meter.
    var pw = document.getElementById('ptch-power-bar');
    var pwrap = document.getElementById('ptch-power-wrap');
    if (pw && pwrap) {
      if (game.shoot.active) {
        pwrap.style.opacity = 1;
        pw.style.width = (game.shoot.charge * 100) + '%';
      } else {
        pwrap.style.opacity = 0;
      }
    }
  }

  // =====================================================================
  // Match flow.
  // =====================================================================
  function startMatch() {
    game.score.home = 0; game.score.away = 0;
    game.timer = CFG.matchDuration;
    game.state = 'kickoff';
    resetForKickoff(Math.random() < 0.5 ? 'home' : 'away');
    updateScoreboard();
    var menu = document.getElementById('ptch-menu');
    if (menu) menu.classList.remove('is-visible');
    var result = document.getElementById('ptch-result');
    if (result) result.classList.remove('is-visible');
    setTimeout(function () { game.state = 'playing'; }, 500);
  }

  function endMatch() {
    game.state = 'fulltime';
    refWhistle();
    var result = document.getElementById('ptch-result');
    var title = document.getElementById('ptch-result-title');
    var score = document.getElementById('ptch-result-score');
    var msg = document.getElementById('ptch-result-msg');
    if (title) title.textContent = 'Full time';
    if (score) score.textContent = game.score.home + ' — ' + game.score.away;
    if (msg) msg.textContent = game.score.home > game.score.away ? 'You win!' : (game.score.home < game.score.away ? 'AI wins.' : 'A draw.');
    if (result) result.classList.add('is-visible');
    // Save the best result.
    try {
      var raw = JSON.parse(localStorage.getItem('ptch_best_v1') || '{}');
      var diff = game.score.home - game.score.away;
      var bestDiff = raw.bestDiff != null ? raw.bestDiff : -999;
      if (diff > bestDiff) {
        raw.bestDiff = diff;
        raw.bestScore = game.score.home + '-' + game.score.away;
        localStorage.setItem('ptch_best_v1', JSON.stringify(raw));
      }
    } catch (e) {}
  }

  // =====================================================================
  // Adaptive perf.
  // =====================================================================
  function tunePerf(frameMs) {
    game.perfSamples.push(frameMs);
    if (game.perfSamples.length < 90) return;
    var avg = game.perfSamples.reduce(function (a, b) { return a + b; }) / game.perfSamples.length;
    game.perfSamples.length = 0;
    if (avg > 28 && game.perfTier < 2) {
      game.perfTier++;
      if (game.perfTier === 1) game.renderer.setPixelRatio(Math.min(1.4, game.pixelRatio));
      else if (game.perfTier === 2 && game.useShadowMap) {
        // Disable shadows live and switch every entity to blob shadows.
        game.renderer.shadowMap.enabled = false;
        game.useShadowMap = false;
      }
    }
  }

  // =====================================================================
  // Main loop.
  // =====================================================================
  var last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    var frameStart = performance.now();

    if (game.state === 'playing') {
      pickControlled();
      controlPlayer(dt);
      updateFormation(dt);
      updateReferee(dt);
      updateBall(dt);
      checkGoal();
      updateTimer(dt);
    } else if (game.state === 'kickoff' || game.state === 'goal') {
      updateFormation(dt);
      updateReferee(dt);
      updateBall(dt);
    }

    updateCamera(dt);
    updateControlMarker();
    syncVisuals(dt);
    game.renderer.render(game.scene, game.camera);

    if (game.state === 'playing') tunePerf(performance.now() - frameStart);
  }

  // =====================================================================
  // Boot.
  // =====================================================================
  function onResize() {
    game.renderer.setSize(window.innerWidth, window.innerHeight, false);
    game.camera.aspect = window.innerWidth / window.innerHeight;
    game.camera.updateProjectionMatrix();
  }

  function showMenuBest() {
    try {
      var raw = JSON.parse(localStorage.getItem('ptch_best_v1') || '{}');
      if (raw.bestScore) {
        var el = document.getElementById('ptch-best');
        if (el) el.textContent = 'Best result: ' + raw.bestScore;
      }
    } catch (e) {}
  }

  function init() {
    buildScene();
    placeFormation();
    game.referee = makeReferee();
    game.scene.add(game.referee.grp);
    game.ball = makeBall();
    game.scene.add(game.ball.mesh);
    game.controlMarker = makeControlMarker();
    bindKeyboard();
    bindJoystick();
    bindButtons();
    window.addEventListener('resize', onResize);
    var btn = document.getElementById('ptch-kickoff-btn');
    if (btn) btn.addEventListener('click', startMatch);
    var rematch = document.getElementById('ptch-rematch-btn');
    if (rematch) rematch.addEventListener('click', startMatch);
    showMenuBest();
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
