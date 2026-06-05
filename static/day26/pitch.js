/* Pitch — Day 26. 3v3 arcade soccer on Three.js (r128). */
(function () {
  'use strict';

  if (typeof THREE === 'undefined') {
    document.getElementById('ptch-menu').innerHTML =
      '<div class="ptch-overlay-card"><div class="ptch-title">Three.js failed to load</div><p style="color:var(--muted)">Check your network and refresh.</p></div>';
    return;
  }

  // ===== Module: Config =====
  const CFG = {
    pitchW: 30, pitchH: 20, // X width, Z length
    goalW: 6, goalH: 2.5, goalD: 1.5,
    playerRadius: 0.5, playerHeight: 1.6,
    ballRadius: 0.28,
    playerSpeed: 6.0,            // units/sec max
    playerAccel: 25.0,
    aiSpeed: 5.4,
    ballFriction: 1.6,           // /sec linear damping on ground
    bounceDamping: 0.55,
    gravity: -16.0,
    passSpeed: 13.0,
    minShotPower: 9.0,
    maxShotPower: 20.0,
    shotArc: 7.0,                // upward velocity at full power
    chargeTime: 0.9,             // seconds to full charge
    matchDuration: 90,           // seconds
    cameraHeight: 14,
    cameraDistZ: 18,
    homeColor: 0xD97757,
    awayColor: 0x7BA7CC,
    skinColor: 0xF5C9A6,
    aiAggression: 0.65,          // 0..1, higher = harder
  };

  // ===== Module: State =====
  const game = {
    scene: null, camera: null, renderer: null, hemi: null, dir: null,
    pitchGroup: null,
    players: [],    // array of player objects, both teams
    ball: null,     // ball object
    controlledIdx: 0, // index in players for the player you control
    possession: null, // player object currently in possession (or null)
    score: { home: 0, away: 0 },
    timer: CFG.matchDuration,
    state: 'menu',  // menu | kickoff | playing | goal | fulltime
    kickoffTeam: 'home',
    goalFor: null,
    shooting: { active: false, charge: 0 },
    input: { mx: 0, my: 0, pass: false, shoot: false, shootDown: false },
    keyboardActive: false,
    perfSamples: [],
    perfEvaluated: false,
    raf: 0, lastTime: 0,
  };

  // ===== Module: Scene setup =====
  function buildScene() {
    const canvas = document.getElementById('ptch-canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    const stage = canvas.parentElement;
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setClearColor(0x9DC2D8); // pleasant sky

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x9DC2D8, 40, 90);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.5, 200);
    camera.position.set(0, CFG.cameraHeight, CFG.cameraDistZ);
    camera.lookAt(0, 0, 0);

    // Lights
    const hemi = new THREE.HemisphereLight(0xb8d8e6, 0x3f6a3b, 0.65);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(10, 22, 12);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 1024;
    dir.shadow.mapSize.height = 1024;
    const sc = dir.shadow.camera;
    sc.left = -22; sc.right = 22; sc.top = 18; sc.bottom = -18;
    sc.near = 1; sc.far = 60;
    scene.add(dir);

    // Pitch group
    const pitchGroup = new THREE.Group();
    pitchGroup.add(makePitchGround());
    pitchGroup.add(makeGoal(+1));
    pitchGroup.add(makeGoal(-1));
    scene.add(pitchGroup);

    // Skybox-ish ring (cheap stadium feel): a low ring of dark stands around the pitch
    pitchGroup.add(makeStandsRing());

    // Sky: ambient gradient is done via clear color + fog.

    game.scene = scene; game.camera = camera; game.renderer = renderer;
    game.hemi = hemi; game.dir = dir; game.pitchGroup = pitchGroup;

    window.addEventListener('resize', onResize);
  }

  function onResize() {
    const stage = game.renderer.domElement.parentElement;
    const w = stage.clientWidth, h = stage.clientHeight;
    game.renderer.setSize(w, h, false);
    game.camera.aspect = w / h;
    game.camera.updateProjectionMatrix();
  }

  function makePitchTexture() {
    const w = 1024, h = Math.floor(w * (CFG.pitchH / CFG.pitchW)); // matches pitch ratio
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    // Stripes along Z (parallel to goal lines): bands of green
    const stripes = 8;
    const band = h / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#3f8a4a' : '#4a9e58';
      ctx.fillRect(0, i * band, w, band);
    }
    // White lines: boundary, center line, center circle
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 6;
    ctx.strokeRect(20, 20, w - 40, h - 40);
    // Center line
    ctx.beginPath(); ctx.moveTo(20, h / 2); ctx.lineTo(w - 20, h / 2); ctx.stroke();
    // Center circle
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.075, 0, Math.PI * 2); ctx.stroke();
    // Goal areas (small rectangles at both ends)
    const gaW = w * 0.25, gaH = h * 0.08;
    ctx.strokeRect((w - gaW) / 2, 20, gaW, gaH);
    ctx.strokeRect((w - gaW) / 2, h - 20 - gaH, gaW, gaH);

    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  function makePitchGround() {
    const geom = new THREE.PlaneGeometry(CFG.pitchW + 4, CFG.pitchH + 4);
    geom.rotateX(-Math.PI / 2);
    const tex = makePitchTexture();
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const m = new THREE.Mesh(geom, mat);
    m.receiveShadow = true;
    return m;
  }

  function makeGoal(side) {
    // side = +1 (away goal, +Z end) or -1 (home goal, -Z end)
    const group = new THREE.Group();
    const postR = 0.08, postH = CFG.goalH;
    const matPost = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const postL = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, postH, 8), matPost);
    const postR2 = postL.clone();
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, CFG.goalW, 8), matPost);
    bar.rotation.z = Math.PI / 2;
    postL.castShadow = true; postR2.castShadow = true; bar.castShadow = true;

    const z = side * (CFG.pitchH / 2);
    postL.position.set(-CFG.goalW / 2, postH / 2, z);
    postR2.position.set(CFG.goalW / 2, postH / 2, z);
    bar.position.set(0, postH, z);
    group.add(postL, postR2, bar);

    // Back posts + side bars to form a small box behind the goal line
    const backL = postL.clone(); backL.position.z = z + side * CFG.goalD;
    const backR = postR2.clone(); backR.position.z = z + side * CFG.goalD;
    const backBar = bar.clone(); backBar.position.set(0, postH, z + side * CFG.goalD);
    const topL = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, CFG.goalD, 8), matPost);
    topL.rotation.x = Math.PI / 2;
    topL.position.set(-CFG.goalW / 2, postH, z + side * CFG.goalD / 2);
    const topR = topL.clone(); topR.position.x = CFG.goalW / 2;
    group.add(backL, backR, backBar, topL, topR);

    // Net plane (semi-transparent grid)
    const netGeom = new THREE.PlaneGeometry(CFG.goalW, CFG.goalH);
    netGeom.translate(0, CFG.goalH / 2, z + side * CFG.goalD);
    const netMat = new THREE.MeshLambertMaterial({
      color: 0xffffff, transparent: true, opacity: 0.18,
      side: THREE.DoubleSide,
    });
    const net = new THREE.Mesh(netGeom, netMat);
    if (side === -1) net.rotation.y = Math.PI;
    group.add(net);

    return group;
  }

  function makeStandsRing() {
    // A cheap stadium feel: a low ring of dark blocks around the pitch.
    const group = new THREE.Group();
    const dist = 22;
    const colors = [0x33363a, 0x2b2e32];
    for (let i = 0; i < 28; i++) {
      const angle = (i / 28) * Math.PI * 2;
      const w = 5, h = 1.5 + (i % 3) * 0.4, d = 2.2;
      const g = new THREE.BoxGeometry(w, h, d);
      const m = new THREE.MeshLambertMaterial({ color: colors[i % 2] });
      const block = new THREE.Mesh(g, m);
      block.position.set(Math.cos(angle) * dist, h / 2, Math.sin(angle) * dist);
      block.lookAt(0, h / 2, 0);
      block.castShadow = false;
      block.receiveShadow = false;
      group.add(block);
    }
    return group;
  }

  // ===== Module: Entities =====
  function makePlayer(team) {
    const group = new THREE.Group();
    const kitColor = team === 'home' ? CFG.homeColor : CFG.awayColor;

    const bodyH = 1.0;
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.38, bodyH, 12),
      new THREE.MeshLambertMaterial({ color: kitColor })
    );
    body.position.y = 0.55;
    body.castShadow = true;

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 16, 16),
      new THREE.MeshLambertMaterial({ color: CFG.skinColor })
    );
    head.position.y = 1.25;
    head.castShadow = true;

    // Small "nose" cone indicating facing direction
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.07, 0.16, 8),
      new THREE.MeshLambertMaterial({ color: 0x222222 })
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 1.25, 0.28);

    group.add(body, head, nose);
    group.userData = {
      team,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      facing: 0,            // radians around Y
      bobPhase: Math.random() * Math.PI * 2,
      isControlled: false,
      role: 'mid',
    };
    return group;
  }

  function makeBall() {
    const g = new THREE.Group();
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(CFG.ballRadius, 18, 18),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    ball.castShadow = true;
    // Subtle dark hex patches for a soccer-ball hint
    const patchMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(CFG.ballRadius * 0.34, 6, 4), patchMat);
      const phi = Math.random() * Math.PI * 2;
      const theta = Math.acos(2 * Math.random() - 1);
      p.position.setFromSphericalCoords(CFG.ballRadius * 0.95, theta, phi);
      ball.add(p);
    }
    g.add(ball);
    g.userData = {
      pos: new THREE.Vector3(0, CFG.ballRadius, 0),
      vel: new THREE.Vector3(),
      lastTouch: null,
      lastTouchTeam: null,
    };
    return g;
  }

  function makeControlMarker() {
    const geom = new THREE.RingGeometry(0.55, 0.7, 24);
    geom.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd44a, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geom, mat);
    m.position.y = 0.05;
    return m;
  }

  // ===== Module: Match init =====
  function placeFormation() {
    // Home defends -Z, attacks +Z. Away opposite.
    const home = [
      { x: 0, z: -8, role: 'def' },
      { x: -5, z: -3, role: 'mid' },
      { x: 5, z: -3, role: 'mid' },
    ];
    const away = [
      { x: 0, z: 8, role: 'def' },
      { x: -5, z: 3, role: 'mid' },
      { x: 5, z: 3, role: 'mid' },
    ];
    let pi = 0;
    for (const p of home) {
      const player = game.players[pi];
      player.userData.pos.set(p.x, 0, p.z);
      player.userData.vel.set(0, 0, 0);
      player.userData.facing = 0; // face +Z
      player.userData.role = p.role;
      pi++;
    }
    for (const p of away) {
      const player = game.players[pi];
      player.userData.pos.set(p.x, 0, p.z);
      player.userData.vel.set(0, 0, 0);
      player.userData.facing = Math.PI; // face -Z
      player.userData.role = p.role;
      pi++;
    }
    syncPlayerVisuals();

    game.ball.userData.pos.set(0, CFG.ballRadius, 0);
    game.ball.userData.vel.set(0, 0, 0);
    game.ball.userData.lastTouch = null;
    game.possession = null;
    game.controlledIdx = 1; // a mid by default
  }

  function syncPlayerVisuals() {
    for (const p of game.players) {
      p.position.copy(p.userData.pos);
      p.rotation.y = p.userData.facing;
    }
    game.ball.position.copy(game.ball.userData.pos);
  }

  function initEntities() {
    game.players = [];
    for (let i = 0; i < 3; i++) {
      const p = makePlayer('home');
      game.players.push(p);
      game.scene.add(p);
    }
    for (let i = 0; i < 3; i++) {
      const p = makePlayer('away');
      game.players.push(p);
      game.scene.add(p);
    }
    game.ball = makeBall();
    game.scene.add(game.ball);

    game.controlMarker = makeControlMarker();
    game.scene.add(game.controlMarker);
  }

  // ===== Module: Input =====
  const keys = {};
  function bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (game.state === 'menu' || game.state === 'fulltime') return;
      keys[e.key.toLowerCase()] = true;
      game.keyboardActive = true;
      if (e.key === ' ' || e.key.toLowerCase() === 'j') game.input.pass = true;
      if (e.key.toLowerCase() === 'k') {
        if (!game.input.shootDown) { game.shooting.active = true; game.shooting.charge = 0; }
        game.input.shootDown = true;
      }
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'j', 'k'].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    });
    document.addEventListener('keyup', (e) => {
      keys[e.key.toLowerCase()] = false;
      if (e.key.toLowerCase() === 'k') {
        game.input.shootDown = false;
        if (game.shooting.active) { game.input.shoot = true; game.shooting.active = false; }
      }
    });
  }

  function readKeyboardMovement() {
    let mx = 0, my = 0;
    if (keys['w'] || keys['arrowup']) my -= 1;
    if (keys['s'] || keys['arrowdown']) my += 1;
    if (keys['a'] || keys['arrowleft']) mx -= 1;
    if (keys['d'] || keys['arrowright']) mx += 1;
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      mx /= len; my /= len;
    }
    return { mx, my };
  }

  function bindJoystick() {
    const stick = document.getElementById('ptch-joystick');
    const thumb = document.getElementById('ptch-joystick-thumb');
    let touching = false;
    let touchId = null;
    const radius = 55;
    function setVec(x, y) {
      const len = Math.hypot(x, y);
      const scale = len > radius ? radius / len : 1;
      thumb.style.left = (50 + (x * scale) / radius * 50) + '%';
      thumb.style.top = (50 + (y * scale) / radius * 50) + '%';
      game.joystick = { x: (x * scale) / radius, y: (y * scale) / radius };
    }
    function reset() {
      thumb.style.left = '50%'; thumb.style.top = '50%';
      game.joystick = { x: 0, y: 0 };
    }
    reset();

    stick.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      touchId = t.identifier; touching = true;
      const r = stick.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      setVec(t.clientX - cx, t.clientY - cy);
    }, { passive: false });
    stick.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!touching) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== touchId) continue;
        const r = stick.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        setVec(t.clientX - cx, t.clientY - cy);
      }
    }, { passive: false });
    function endTouch(e) {
      for (const t of e.changedTouches) if (t.identifier === touchId) { touching = false; reset(); }
    }
    stick.addEventListener('touchend', endTouch);
    stick.addEventListener('touchcancel', endTouch);

    document.getElementById('ptch-pass-btn').addEventListener('touchstart', (e) => {
      e.preventDefault(); game.input.pass = true;
    }, { passive: false });
    const shootBtn = document.getElementById('ptch-shoot-btn');
    shootBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (!game.input.shootDown) { game.shooting.active = true; game.shooting.charge = 0; }
      game.input.shootDown = true;
    }, { passive: false });
    function endShoot(e) {
      e.preventDefault();
      game.input.shootDown = false;
      if (game.shooting.active) { game.input.shoot = true; game.shooting.active = false; }
    }
    shootBtn.addEventListener('touchend', endShoot);
    shootBtn.addEventListener('touchcancel', endShoot);
  }

  function readInputVector() {
    const k = readKeyboardMovement();
    if (k.mx !== 0 || k.my !== 0) return k;
    if (game.joystick && (game.joystick.x !== 0 || game.joystick.y !== 0)) {
      return { mx: game.joystick.x, my: game.joystick.y };
    }
    return { mx: 0, my: 0 };
  }

  // ===== Module: Helpers =====
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function dist2XZ(a, b) {
    const dx = a.x - b.x, dz = a.z - b.z;
    return dx * dx + dz * dz;
  }

  // ===== Module: Player & ball logic =====
  function findControlledPlayer() {
    // If a home player has possession -> control them.
    if (game.possession && game.possession.userData.team === 'home') {
      return game.players.indexOf(game.possession);
    }
    // Else: nearest home player to the ball.
    const ballPos = game.ball.userData.pos;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < game.players.length; i++) {
      const p = game.players[i];
      if (p.userData.team !== 'home') continue;
      const d = dist2XZ(p.userData.pos, ballPos);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function controlPlayer(dt) {
    const idx = findControlledPlayer();
    game.controlledIdx = idx;
    for (let i = 0; i < game.players.length; i++) {
      game.players[i].userData.isControlled = (i === idx);
    }
    const player = game.players[idx];
    const inp = readInputVector();
    const targetVx = inp.mx * CFG.playerSpeed;
    const targetVz = inp.my * CFG.playerSpeed;
    // Accelerate toward target velocity
    const vel = player.userData.vel;
    vel.x += clamp(targetVx - vel.x, -CFG.playerAccel * dt, CFG.playerAccel * dt);
    vel.z += clamp(targetVz - vel.z, -CFG.playerAccel * dt, CFG.playerAccel * dt);
    // Face movement direction (if moving)
    if (Math.abs(vel.x) + Math.abs(vel.z) > 0.5) {
      player.userData.facing = Math.atan2(vel.x, vel.z);
    }

    // Shoot charging
    if (game.shooting.active) {
      game.shooting.charge = Math.min(1, game.shooting.charge + dt / CFG.chargeTime);
      const bar = document.getElementById('ptch-power-bar');
      const wrap = document.getElementById('ptch-power-wrap');
      wrap.classList.add('is-visible');
      bar.style.width = (game.shooting.charge * 100) + '%';
    } else {
      document.getElementById('ptch-power-wrap').classList.remove('is-visible');
    }

    // Pass / shoot actions only if you have the ball
    if (game.possession === player) {
      if (game.input.pass) {
        doPass(player);
      }
      if (game.input.shoot) {
        const power = CFG.minShotPower + (CFG.maxShotPower - CFG.minShotPower) * game.shooting.charge;
        doShoot(player, power);
        game.shooting.charge = 0;
      }
    }
    game.input.pass = false;
    game.input.shoot = false;
  }

  function doPass(player) {
    // Find nearest teammate within a forward cone.
    const team = player.userData.team;
    const facingVec = new THREE.Vector3(Math.sin(player.userData.facing), 0, Math.cos(player.userData.facing));
    let best = null, bestScore = -Infinity;
    for (const other of game.players) {
      if (other === player) continue;
      if (other.userData.team !== team) continue;
      const to = new THREE.Vector3().subVectors(other.userData.pos, player.userData.pos);
      const dist = to.length();
      if (dist < 0.5) continue;
      to.normalize();
      const dot = to.dot(facingVec);
      // Score: forward + close
      const score = dot * 1.5 - dist * 0.06;
      if (score > bestScore) { bestScore = score; best = other; }
    }
    if (!best) return;
    // Velocity toward best (lead slightly)
    const target = best.userData.pos.clone().add(best.userData.vel.clone().multiplyScalar(0.3));
    const dir = target.clone().sub(player.userData.pos);
    const distXZ = Math.hypot(dir.x, dir.z) || 1;
    const v = new THREE.Vector3(dir.x / distXZ * CFG.passSpeed, 1.2, dir.z / distXZ * CFG.passSpeed);
    game.ball.userData.pos.copy(player.userData.pos).add(facingVec.clone().multiplyScalar(0.7));
    game.ball.userData.pos.y = CFG.ballRadius + 0.4;
    game.ball.userData.vel.copy(v);
    game.ball.userData.lastTouch = player;
    game.ball.userData.lastTouchTeam = team;
    game.possession = null;
  }

  function doShoot(player, power) {
    const facingVec = new THREE.Vector3(Math.sin(player.userData.facing), 0, Math.cos(player.userData.facing));
    const v = facingVec.clone().multiplyScalar(power);
    v.y = CFG.shotArc * (0.4 + 0.6 * game.shooting.charge);
    game.ball.userData.pos.copy(player.userData.pos).add(facingVec.clone().multiplyScalar(0.8));
    game.ball.userData.pos.y = CFG.ballRadius + 0.3;
    game.ball.userData.vel.copy(v);
    game.ball.userData.lastTouch = player;
    game.ball.userData.lastTouchTeam = player.userData.team;
    game.possession = null;
  }

  // ===== Module: AI =====
  function updateAI(dt) {
    const ballPos = game.ball.userData.pos;
    const ballOwner = game.possession;
    const ballOwnerTeam = ballOwner ? ballOwner.userData.team : null;

    for (let i = 0; i < game.players.length; i++) {
      const p = game.players[i];
      if (p.userData.isControlled) continue;
      const team = p.userData.team;
      const myGoalZ = team === 'home' ? -CFG.pitchH / 2 : CFG.pitchH / 2;
      const oppGoalZ = -myGoalZ;
      let targetX = p.userData.pos.x, targetZ = p.userData.pos.z;
      let maxSp = CFG.aiSpeed;

      const hasBall = (ballOwner === p);

      if (hasBall) {
        // Carry toward opponent goal; shoot if in range and central; otherwise dribble.
        targetX = clamp(ballPos.x + (Math.random() - 0.5) * 0.8, -CFG.pitchW / 2 + 1, CFG.pitchW / 2 - 1);
        targetZ = oppGoalZ;
        // Shoot decision
        const distToGoal = Math.abs(p.userData.pos.z - oppGoalZ);
        if (distToGoal < 7 + Math.random() * 3 && Math.abs(p.userData.pos.x) < CFG.goalW / 2 + 2.5) {
          // shoot
          const facingVec = new THREE.Vector3(0, 0, team === 'home' ? 1 : -1);
          p.userData.facing = Math.atan2(facingVec.x, facingVec.z);
          const power = CFG.minShotPower + Math.random() * (CFG.maxShotPower - CFG.minShotPower) * 0.7;
          const v = facingVec.clone().multiplyScalar(power);
          v.y = CFG.shotArc * 0.75;
          // Aim slightly toward goal center
          v.x += -p.userData.pos.x * 0.4;
          game.ball.userData.pos.copy(p.userData.pos).add(facingVec.clone().multiplyScalar(0.7));
          game.ball.userData.pos.y = CFG.ballRadius + 0.3;
          game.ball.userData.vel.copy(v);
          game.ball.userData.lastTouch = p;
          game.ball.userData.lastTouchTeam = team;
          game.possession = null;
        }
      } else if (ballOwnerTeam === team) {
        // Support: position ahead of carrier toward goal, offset laterally.
        const carrier = ballOwner;
        const dir = team === 'home' ? 1 : -1;
        targetX = clamp(carrier.userData.pos.x + (i % 2 === 0 ? 4 : -4), -CFG.pitchW / 2 + 2, CFG.pitchW / 2 - 2);
        targetZ = carrier.userData.pos.z + dir * 4;
      } else {
        // Defend: nearest teammate chases the ball; others hold formation.
        const teammates = game.players.filter(x => x.userData.team === team);
        let nearest = teammates[0], nearestD = Infinity;
        for (const t of teammates) {
          const d = dist2XZ(t.userData.pos, ballPos);
          if (d < nearestD) { nearestD = d; nearest = t; }
        }
        if (nearest === p) {
          // chase ball with intercept lead
          targetX = ballPos.x + game.ball.userData.vel.x * 0.2;
          targetZ = ballPos.z + game.ball.userData.vel.z * 0.2;
          maxSp = CFG.aiSpeed * (0.95 + CFG.aiAggression * 0.4);
        } else {
          // hold a defensive line between ball and own goal
          targetX = ballPos.x * 0.5 + p.userData.pos.x * 0.5;
          targetZ = (ballPos.z + myGoalZ) * 0.5;
        }
      }

      // Move toward target with simple accel
      const dx = targetX - p.userData.pos.x;
      const dz = targetZ - p.userData.pos.z;
      const dlen = Math.hypot(dx, dz);
      let vx = 0, vz = 0;
      if (dlen > 0.2) { vx = dx / dlen * maxSp; vz = dz / dlen * maxSp; }
      const vel = p.userData.vel;
      vel.x += clamp(vx - vel.x, -CFG.playerAccel * dt, CFG.playerAccel * dt);
      vel.z += clamp(vz - vel.z, -CFG.playerAccel * dt, CFG.playerAccel * dt);
      if (Math.abs(vel.x) + Math.abs(vel.z) > 0.3) {
        p.userData.facing = Math.atan2(vel.x, vel.z);
      }
    }
  }

  // ===== Module: Physics integration =====
  function updatePlayers(dt) {
    for (const p of game.players) {
      const d = p.userData;
      // Apply velocity to position
      d.pos.x += d.vel.x * dt;
      d.pos.z += d.vel.z * dt;
      // Friction-ish damping
      const decay = 5.0 * dt;
      d.vel.x -= d.vel.x * Math.min(1, decay);
      d.vel.z -= d.vel.z * Math.min(1, decay);
      // Bound to pitch
      d.pos.x = clamp(d.pos.x, -CFG.pitchW / 2 + 0.4, CFG.pitchW / 2 - 0.4);
      d.pos.z = clamp(d.pos.z, -CFG.pitchH / 2 - CFG.goalD + 0.4, CFG.pitchH / 2 + CFG.goalD - 0.4);
      // Visual: position + facing + bob
      p.position.set(d.pos.x, 0, d.pos.z);
      const sp = Math.hypot(d.vel.x, d.vel.z);
      d.bobPhase += dt * (4 + sp * 1.0);
      p.position.y = Math.max(0, Math.sin(d.bobPhase) * 0.05 * Math.min(1, sp / CFG.playerSpeed));
      // Lean
      const lean = clamp(sp / CFG.playerSpeed, 0, 1) * 0.18;
      p.rotation.y = d.facing;
      p.rotation.x = lean;
    }
  }

  function updateBall(dt) {
    const b = game.ball.userData;
    // Gravity
    b.vel.y += CFG.gravity * dt;
    // Position
    b.pos.x += b.vel.x * dt;
    b.pos.y += b.vel.y * dt;
    b.pos.z += b.vel.z * dt;

    // Ground bounce
    if (b.pos.y < CFG.ballRadius) {
      b.pos.y = CFG.ballRadius;
      if (b.vel.y < 0) {
        b.vel.y = -b.vel.y * CFG.bounceDamping;
        if (b.vel.y < 1) b.vel.y = 0;
      }
      // Friction on ground
      const decay = CFG.ballFriction * dt;
      b.vel.x -= b.vel.x * Math.min(1, decay);
      b.vel.z -= b.vel.z * Math.min(1, decay);
      if (Math.hypot(b.vel.x, b.vel.z) < 0.15) { b.vel.x = 0; b.vel.z = 0; }
    }

    // Possession / collision with players
    let possessionThisFrame = null;
    const ballRadius = CFG.ballRadius;
    for (const p of game.players) {
      const dx = b.pos.x - p.userData.pos.x;
      const dz = b.pos.z - p.userData.pos.z;
      const d2 = dx * dx + dz * dz;
      const r = CFG.playerRadius + ballRadius;
      if (d2 < r * r && b.pos.y < 1.3) {
        // Determine touch result based on who arrives / who already has it
        if (game.possession && game.possession !== p) {
          // Tackle: small chance to steal if attacking, else just deflect
          if (Math.random() < 0.18) {
            possessionThisFrame = p;
          } else {
            // Deflect ball backwards
            const len = Math.sqrt(d2) || 1;
            b.vel.x = (dx / len) * 4 + p.userData.vel.x * 0.5;
            b.vel.z = (dz / len) * 4 + p.userData.vel.z * 0.5;
          }
        } else if (!game.possession) {
          possessionThisFrame = p;
        }
      }
    }
    if (possessionThisFrame) {
      const p = possessionThisFrame;
      game.possession = p;
      game.ball.userData.lastTouch = p;
      game.ball.userData.lastTouchTeam = p.userData.team;
    }

    // If a player has possession, glue ball ahead of them
    if (game.possession) {
      const p = game.possession;
      const facingVec = new THREE.Vector3(Math.sin(p.userData.facing), 0, Math.cos(p.userData.facing));
      const aheadX = p.userData.pos.x + facingVec.x * 0.7;
      const aheadZ = p.userData.pos.z + facingVec.z * 0.7;
      // Move ball smoothly toward there
      b.pos.x += (aheadX - b.pos.x) * Math.min(1, 18 * dt);
      b.pos.z += (aheadZ - b.pos.z) * Math.min(1, 18 * dt);
      b.pos.y = CFG.ballRadius + 0.05;
      b.vel.set(p.userData.vel.x, 0, p.userData.vel.z);
    }

    // Visuals
    game.ball.position.copy(b.pos);
    game.ball.rotation.x += b.vel.z * dt * 0.5;
    game.ball.rotation.z -= b.vel.x * dt * 0.5;

    // Goal / out of bounds detection
    checkGoalAndBounds();
  }

  function checkGoalAndBounds() {
    if (game.state !== 'playing') return;
    const b = game.ball.userData;
    const halfW = CFG.pitchW / 2;
    const halfH = CFG.pitchH / 2;

    // Goals (z = +halfH = away goal -> home scores; z = -halfH = home goal -> away scores)
    if (b.pos.z > halfH) {
      const inGoal = Math.abs(b.pos.x) < CFG.goalW / 2 - 0.1 && b.pos.y < CFG.goalH - 0.1;
      if (inGoal) {
        game.score.home += 1;
        game.kickoffTeam = 'away';
        game.goalFor = 'home';
        startGoalSequence();
        return;
      }
      // Out of bounds behind goal -> kickoff to the conceding team
      resetForKickoff(b.pos.x < 0 ? 'home' : 'home'); // just kickoff
      return;
    }
    if (b.pos.z < -halfH) {
      const inGoal = Math.abs(b.pos.x) < CFG.goalW / 2 - 0.1 && b.pos.y < CFG.goalH - 0.1;
      if (inGoal) {
        game.score.away += 1;
        game.kickoffTeam = 'home';
        game.goalFor = 'away';
        startGoalSequence();
        return;
      }
      resetForKickoff('away');
      return;
    }
    // Side out of bounds
    if (Math.abs(b.pos.x) > halfW + 0.5) {
      resetForKickoff(b.userData ? 'home' : 'home');
    }
  }

  function startGoalSequence() {
    game.state = 'goal';
    updateScoreboard();
    const flash = document.getElementById('ptch-goal-flash');
    flash.classList.remove('is-hidden');
    flash.style.animation = 'none';
    // force reflow then restart animation
    void flash.offsetWidth;
    flash.style.animation = '';
    setTimeout(() => {
      flash.classList.add('is-hidden');
      if (game.state === 'goal') {
        placeFormation();
        // Brief kickoff pause
        game.state = 'playing';
      }
    }, 1300);
  }

  function resetForKickoff(team) {
    game.kickoffTeam = team;
    placeFormation();
  }

  // ===== Module: HUD + view =====
  function updateScoreboard() {
    document.getElementById('ptch-score-home').textContent = game.score.home;
    document.getElementById('ptch-score-away').textContent = game.score.away;
  }
  function updateTimer() {
    const t = Math.max(0, game.timer);
    const mm = Math.floor(t / 60);
    const ss = Math.floor(t - mm * 60);
    document.getElementById('ptch-timer').textContent = mm + ':' + String(ss).padStart(2, '0');
  }

  function updateCamera(dt) {
    const ballPos = game.ball.userData.pos;
    // Target somewhere between ball and center, biased toward ball
    const tx = ballPos.x * 0.7;
    const tz = ballPos.z * 0.65;
    const desired = new THREE.Vector3(tx * 0.4, CFG.cameraHeight, tz + CFG.cameraDistZ);
    game.camera.position.lerp(desired, Math.min(1, 2.2 * dt));
    const look = new THREE.Vector3(tx, 0, tz);
    const cur = new THREE.Vector3();
    game.camera.getWorldDirection(cur);
    // Smooth lookAt
    const targetLook = look.clone();
    game.camera.lookAt(targetLook);
  }

  function updateControlMarker() {
    const p = game.players[game.controlledIdx];
    if (!p) return;
    game.controlMarker.visible = (game.state === 'playing' || game.state === 'goal');
    game.controlMarker.position.set(p.userData.pos.x, 0.04, p.userData.pos.z);
  }

  // ===== Match flow =====
  function startMatch() {
    game.score.home = 0; game.score.away = 0;
    game.timer = CFG.matchDuration;
    placeFormation();
    updateScoreboard();
    updateTimer();
    document.getElementById('ptch-menu').classList.remove('is-visible');
    document.getElementById('ptch-result').classList.remove('is-visible');
    game.state = 'playing';
  }

  function endMatch() {
    game.state = 'fulltime';
    const r = document.getElementById('ptch-result');
    const title = document.getElementById('ptch-result-title');
    const score = document.getElementById('ptch-result-score');
    const msg = document.getElementById('ptch-result-msg');
    score.textContent = `${game.score.home} — ${game.score.away}`;
    if (game.score.home > game.score.away) {
      title.textContent = 'Victory'; title.style.color = '#D97757';
      msg.textContent = 'Winner stays on.';
      try {
        const wins = parseInt(localStorage.getItem('ptch_wins') || '0', 10) + 1;
        localStorage.setItem('ptch_wins', String(wins));
      } catch (e) {}
    } else if (game.score.home < game.score.away) {
      title.textContent = 'Defeat'; title.style.color = '#7BA7CC';
      msg.textContent = 'Try again — different opponent next time.';
    } else {
      title.textContent = 'Draw'; title.style.color = 'var(--accent)';
      msg.textContent = 'Honours even. Rematch?';
    }
    r.classList.add('is-visible');
  }

  function showMenuBest() {
    try {
      const wins = localStorage.getItem('ptch_wins');
      if (wins) document.getElementById('ptch-best').textContent = 'Wins: ' + wins;
    } catch (e) {}
  }

  // ===== Adaptive perf =====
  function evaluatePerf() {
    if (game.perfEvaluated || game.perfSamples.length < 60) return;
    const avg = game.perfSamples.reduce((a, b) => a + b, 0) / game.perfSamples.length;
    if (avg > 24) {
      // Reduce pixel ratio first
      const pr = game.renderer.getPixelRatio();
      if (pr > 1.2) game.renderer.setPixelRatio(1);
      else {
        // Drop shadow size
        game.dir.shadow.mapSize.width = 512;
        game.dir.shadow.mapSize.height = 512;
        game.dir.shadow.map && game.dir.shadow.map.dispose();
        game.dir.shadow.map = null;
        if (avg > 30) game.renderer.shadowMap.enabled = false;
      }
    }
    game.perfEvaluated = true;
  }

  // ===== Main loop =====
  function loop(ts) {
    game.raf = requestAnimationFrame(loop);
    if (!game.lastTime) game.lastTime = ts;
    const dtMs = ts - game.lastTime;
    game.lastTime = ts;
    game.perfSamples.push(dtMs);
    if (game.perfSamples.length > 120) game.perfSamples.shift();

    let dt = clamp(dtMs / 1000, 0.005, 0.05);

    if (game.state === 'playing' || game.state === 'goal') {
      controlPlayer(dt);
      updateAI(dt);
      updatePlayers(dt);
      updateBall(dt);
      updateControlMarker();
      if (game.state === 'playing') {
        game.timer -= dt;
        updateTimer();
        if (game.timer <= 0) endMatch();
      }
    }
    updateCamera(dt);
    game.renderer.render(game.scene, game.camera);

    if (!game.perfEvaluated) evaluatePerf();
  }

  // ===== Boot =====
  function init() {
    buildScene();
    initEntities();
    placeFormation();
    bindKeyboard();
    bindJoystick();

    document.getElementById('ptch-kickoff-btn').addEventListener('click', startMatch);
    document.getElementById('ptch-rematch-btn').addEventListener('click', startMatch);
    showMenuBest();

    game.lastTime = 0;
    game.raf = requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
