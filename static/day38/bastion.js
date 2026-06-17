/* Bastion — Day 38. A grid tower defense where A* pathfinding IS the
 * mechanic: towers block cells, enemies recompute their shortest route
 * around your maze, so the path is something you author. Layer 1: three
 * towers (Gun / Cannon / Frost), three enemies (Grunt / Runner / Tank),
 * endless escalating waves, gold + lives + score + localStorage best.
 *
 * The two design traps the brief calls out are handled explicitly:
 *   (1) The base can never be sealed off — every placement is validated
 *       by running A* on the HYPOTHETICAL grid with the new tower added,
 *       and refused if no route survives. canPlace() is the gatekeeper.
 *   (2) In-flight enemies never get stuck — when the grid changes the
 *       shared path is recomputed, and any enemy whose current cell
 *       wouldn't reach the base re-paths from its own cell.
 *
 * Architecturally the A*, the grid, and canPlace() are pure functions
 * exported for Node so the make-or-break math can be asserted headless
 * (no DOM dependency). The render + input loop sits on top in the
 * browser. */

(function () {
  'use strict';

  // =====================================================================
  // CFG — every tunable.
  // =====================================================================
  var CFG = {
    grid: { w: 17, h: 11 },        // cells (width x height)
    cellPx: 44,                    // base cell size, scaled to fit viewport
    entrance: { x: 0, y: 5 },
    base:     { x: 16, y: 5 },
    startGold: 80,
    startLives: 20,
    waveBonus: 14,                 // gold awarded at wave clear (scaled by wave)
    spawnPeriod: 0.55,             // seconds between enemy spawns
    interWaveDelay: 0.6,           // small breather at wave start
    leakDamage: 1,                 // lives lost per leak (per enemy by default)

    // Tower defs (Layer 1 = 3). Each: cost, range (cells), dmg, fire (s
    // between shots), splash (cells), slow {mul, dur} optional, color.
    towers: {
      gun:    { name: 'Gun',    cost: 14, range: 3.1, dmg:  5, fire: 0.45, splash: 0, color: '#7BA7CC', glow: '#bcd6ec', shape: 'tri',  shotSpeed: 18, projColor: '#cfe4f7' },
      cannon: { name: 'Cannon', cost: 30, range: 2.7, dmg: 22, fire: 1.20, splash: 1.1, color: '#D97757', glow: '#ffb78a', shape: 'sq',  shotSpeed: 12, projColor: '#ffc890' },
      frost:  { name: 'Frost',  cost: 22, range: 2.7, dmg:  2, fire: 0.55, splash: 0, slow: { mul: 0.50, dur: 1.5 }, color: '#7AD0E6', glow: '#bff0ff', shape: 'hex', shotSpeed: 14, projColor: '#d8f5ff' },
    },

    // Enemy defs (Layer 1 = 3). Each: hp, speed (cells/sec), gold, score.
    enemies: {
      grunt:  { name: 'Grunt',  hp:  22, speed: 1.6, gold: 2, score:  3, radius: 0.30, color: '#bcd6ec' },
      runner: { name: 'Runner', hp:  12, speed: 3.2, gold: 2, score:  4, radius: 0.24, color: '#ff77a8' },
      tank:   { name: 'Tank',   hp: 110, speed: 0.85, gold: 6, score: 10, radius: 0.38, color: '#9b8aff' },
    },

    // Colors
    bg:        '#0F0F0E',
    grid:      'rgba(255,255,255,0.04)',
    pathGlow:  'rgba(123,167,204,0.18)',
    pathStroke: 'rgba(127,200,255,0.55)',
    entranceCol: '#7BA7CC',
    baseCol:    '#D97757',
    invalidCol: 'rgba(255,90,90,0.35)',
    validCol:   'rgba(127,230,170,0.30)',
  };

  // =====================================================================
  // Binary-min-heap priority queue. A 4-dir A* over ~187 cells doesn't
  // strictly need this, but the heap keeps canPlace() cheap even when
  // we run it many times per frame for the hover preview.
  // =====================================================================
  function heapPush(h, node) {
    h.push(node);
    var i = h.length - 1;
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (h[p].f <= h[i].f) break;
      var t = h[p]; h[p] = h[i]; h[i] = t;
      i = p;
    }
  }
  function heapPop(h) {
    var top = h[0];
    var last = h.pop();
    if (h.length) {
      h[0] = last;
      var i = 0, n = h.length;
      while (true) {
        var l = i * 2 + 1, r = i * 2 + 2, s = i;
        if (l < n && h[l].f < h[s].f) s = l;
        if (r < n && h[r].f < h[s].f) s = r;
        if (s === i) break;
        var t = h[s]; h[s] = h[i]; h[i] = t;
        i = s;
      }
    }
    return top;
  }

  // =====================================================================
  // A* — 4-directional, Manhattan heuristic, no corner-cutting (we never
  // step diagonally so corner-cutting isn't possible). Returns an array
  // of {x,y} from start to goal inclusive, or null if no route exists.
  // blocked is a flat Uint8Array of length W*H (1 = blocked).
  // =====================================================================
  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function findPath(W, H, blocked, start, goal) {
    var idx = function (x, y) { return y * W + x; };
    var sKey = idx(start.x, start.y), gKey = idx(goal.x, goal.y);
    if (sKey === gKey) return [{ x: start.x, y: start.y }];
    // The start and goal must themselves be walkable for a path to exist;
    // the placement validator guarantees this for normal inputs, but be
    // defensive here so a misuse doesn't burn CPU forever.
    if (blocked[sKey] || blocked[gKey]) return null;

    var came = new Int32Array(W * H);
    var gScore = new Float32Array(W * H);
    var seen = new Uint8Array(W * H);
    for (var i = 0; i < came.length; i++) came[i] = -1;
    gScore[sKey] = 0; seen[sKey] = 1;

    var open = [];
    heapPush(open, { x: start.x, y: start.y, f: Math.abs(start.x - goal.x) + Math.abs(start.y - goal.y) });

    while (open.length) {
      var cur = heapPop(open);
      var cKey = idx(cur.x, cur.y);
      if (cKey === gKey) {
        var path = [];
        var k = cKey;
        while (k !== -1) { path.push({ x: k % W, y: (k - k % W) / W }); k = came[k] === -1 ? -1 : came[k]; if (k === sKey) { path.push({ x: start.x, y: start.y }); break; } }
        path.reverse();
        return path;
      }
      var cg = gScore[cKey];
      for (var d = 0; d < 4; d++) {
        var nx = cur.x + DIRS[d][0], ny = cur.y + DIRS[d][1];
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        var nKey = idx(nx, ny);
        if (blocked[nKey]) continue;
        var tentG = cg + 1;
        if (seen[nKey] && tentG >= gScore[nKey]) continue;
        seen[nKey] = 1;
        gScore[nKey] = tentG;
        came[nKey] = cKey;
        heapPush(open, { x: nx, y: ny, f: tentG + Math.abs(nx - goal.x) + Math.abs(ny - goal.y) });
      }
    }
    return null;
  }

  // canPlace: would adding a tower at (x,y) leave at least one route from
  // entrance to base? This is the brief's hard rule #2 — never seal the
  // base off. The check runs A* on a *hypothetical* grid with the new
  // cell blocked, then restores it. It also rejects entrance/base/already-
  // blocked cells and (in the browser shell) cells with an enemy in them.
  function canPlace(W, H, blocked, entrance, base, x, y) {
    if (x < 0 || x >= W || y < 0 || y >= H) return false;
    if (x === entrance.x && y === entrance.y) return false;
    if (x === base.x && y === base.y) return false;
    var k = y * W + x;
    if (blocked[k]) return false;
    blocked[k] = 1;
    var path = findPath(W, H, blocked, entrance, base);
    blocked[k] = 0;
    return path !== null;
  }

  // =====================================================================
  // Headless exports: the pure-math half lives without any browser
  // bindings so it can be asserted in Node.
  // =====================================================================
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      CFG: CFG,
      findPath: findPath,
      canPlace: canPlace,
      heapPush: heapPush,
      heapPop: heapPop,
    };
    return; // skip the browser shell when required from Node
  }
  if (typeof window === 'undefined') return;

  // =====================================================================
  // Browser shell — state, render, input, loop.
  // =====================================================================

  var canvas = document.getElementById('bn-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  var W = CFG.grid.w, H = CFG.grid.h;
  var blocked = new Uint8Array(W * H);  // 1 = tower or other obstacle
  var entrance = { x: CFG.entrance.x, y: CFG.entrance.y };
  var base = { x: CFG.base.x, y: CFG.base.y };
  var cellPx = CFG.cellPx;

  // Game state
  var state = {
    phase: 'menu',          // menu | build | wave | gameover
    gold: CFG.startGold,
    lives: CFG.startLives,
    score: 0,
    wave: 0,
    best: 0,
    speed: 1,               // 1 or 2
    paused: false,
    selectedTower: null,    // tower key or null
    hover: null,            // {x, y} grid cell or null
    sharedPath: null,       // current A* route (cached)
    waveQueue: null,        // { spawns: [...], idx, t, hpMul }
    spawnTimer: 0,
    interWaveTimer: 0,
  };

  var towers = [];          // [{ kind, x, y, cd, level }]
  var enemies = [];         // [{ kind, hp, hpMax, speed, x, y, pathIdx, t, slowUntil, slowMul }]
  var projectiles = [];     // [{ x, y, tx, ty, target, dmg, splash, slow, kind, color, speed }]
  var pops = [];            // [{ x, y, text, color, t, dur }] floating numbers / hit markers

  // Initial path setup.
  function recomputeSharedPath() {
    var p = findPath(W, H, blocked, entrance, base);
    state.sharedPath = p;
    return p;
  }
  recomputeSharedPath();

  // Re-path any in-flight enemy whose current cell wouldn't reach the
  // base via the new shared path. We give each enemy its own cached path
  // computed from its current cell; recomputation only happens on grid
  // change, so cost is negligible.
  function rePathEnemies() {
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      // Snap to nearest cell (rounded). Grid is centered, so just floor+0.5.
      var cx = Math.max(0, Math.min(W - 1, Math.floor(e.x)));
      var cy = Math.max(0, Math.min(H - 1, Math.floor(e.y)));
      // If the cell the enemy is in just got blocked (shouldn't happen
      // since we forbid placing on a cell with an enemy), nudge it back
      // to its previous walkable cell.
      if (blocked[cy * W + cx]) {
        // Try neighbours.
        var fallback = null;
        for (var d = 0; d < 4; d++) {
          var nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
          if (nx >= 0 && nx < W && ny >= 0 && ny < H && !blocked[ny * W + nx]) {
            fallback = { x: nx, y: ny }; break;
          }
        }
        if (fallback) { cx = fallback.x; cy = fallback.y; }
      }
      var p = findPath(W, H, blocked, { x: cx, y: cy }, base);
      if (p && p.length) {
        e.path = p;
        e.pathIdx = 1;        // 0 is the cell the enemy is currently in
      } else {
        // No path from here — extremely unlikely after canPlace(), but
        // if it ever happens, hand the enemy the shared path so it at
        // least keeps moving toward the base.
        e.path = state.sharedPath ? state.sharedPath.slice() : [];
        e.pathIdx = 1;
      }
    }
  }

  // =====================================================================
  // Tower placement.
  // =====================================================================
  function tryPlace(cellX, cellY, kind) {
    var def = CFG.towers[kind];
    if (!def) return false;
    if (state.gold < def.cost) return false;
    // No placing on top of an enemy.
    for (var i = 0; i < enemies.length; i++) {
      var ex = Math.floor(enemies[i].x), ey = Math.floor(enemies[i].y);
      if (ex === cellX && ey === cellY) return false;
    }
    if (!canPlace(W, H, blocked, entrance, base, cellX, cellY)) return false;
    blocked[cellY * W + cellX] = 1;
    towers.push({ kind: kind, x: cellX, y: cellY, cd: 0, level: 1 });
    state.gold -= def.cost;
    recomputeSharedPath();
    rePathEnemies();
    return true;
  }

  // =====================================================================
  // Enemy + tower update.
  // =====================================================================
  function spawnEnemy(kind, hpMul) {
    var def = CFG.enemies[kind];
    var path = state.sharedPath || findPath(W, H, blocked, entrance, base);
    if (!path) return;
    if (enemies.length >= MAX_ENEMIES) return;  // defensive
    enemies.push({
      kind: kind,
      hp: def.hp * hpMul,
      hpMax: def.hp * hpMul,
      speed: def.speed,
      gold: def.gold,
      score: def.score,
      radius: def.radius,
      color: def.color,
      x: entrance.x + 0.5 - 0.5,    // step slightly off the left edge so they walk in
      y: entrance.y + 0.5 - 0.5,
      // Share the cached path by reference. Only enemies that need a
      // different starting cell (via rePathEnemies after a tower placement)
      // get their own path array. This dramatically cuts allocation churn.
      path: path,
      pathIdx: 1,
      slowUntil: 0,
      slowMul: 1,
    });
  }

  function updateEnemies(dt) {
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      if (e.path.length === 0 || e.pathIdx >= e.path.length) {
        // Reached the base.
        state.lives = Math.max(0, state.lives - CFG.leakDamage);
        enemies.splice(i, 1);
        if (state.lives === 0) endGame();
        continue;
      }
      var tgt = e.path[e.pathIdx];
      var dx = (tgt.x + 0.5) - (e.x + 0.5);   // target cell centre minus enemy centre
      var dy = (tgt.y + 0.5) - (e.y + 0.5);
      var d = Math.hypot(dx, dy);
      var slowFactor = (e.slowUntil > now()) ? e.slowMul : 1;
      var step = e.speed * slowFactor * dt;
      if (step >= d) {
        // Snap to the cell centre and advance.
        e.x = tgt.x; e.y = tgt.y;
        e.pathIdx++;
      } else {
        e.x += (dx / d) * step;
        e.y += (dy / d) * step;
      }
      e.hp -= 0; // (status effects like burn would go here)
    }
  }

  function pickTarget(t, def) {
    // Target the enemy furthest along its path that is in range.
    var best = null, bestProgress = -Infinity;
    var R = def.range;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      var dx = (e.x + 0.5) - (t.x + 0.5);
      var dy = (e.y + 0.5) - (t.y + 0.5);
      if (dx * dx + dy * dy > R * R) continue;
      // "Progress" = how many cells of its path the enemy has already
      // consumed — proxy for "closest to the base".
      var prog = e.pathIdx;
      if (prog > bestProgress) { bestProgress = prog; best = e; }
    }
    return best;
  }

  function updateTowers(dt) {
    for (var i = 0; i < towers.length; i++) {
      var t = towers[i];
      var def = CFG.towers[t.kind];
      if (t.cd > 0) t.cd -= dt;
      if (t.cd > 0) continue;
      var target = pickTarget(t, def);
      if (!target) continue;
      t.cd = def.fire;
      // Lead the shot slightly toward where the enemy is heading.
      var nextIdx = Math.min(target.path.length - 1, target.pathIdx);
      var lead = target.path[nextIdx];
      var leadX = (lead ? lead.x + 0.5 : target.x + 0.5);
      var leadY = (lead ? lead.y + 0.5 : target.y + 0.5);
      projectiles.push({
        x: t.x + 0.5, y: t.y + 0.5,
        tx: leadX, ty: leadY,
        target: target,
        dmg: def.dmg,
        splash: def.splash,
        slow: def.slow || null,
        color: def.projColor,
        speed: def.shotSpeed,
        life: 1.6,
      });
    }
  }

  function updateProjectiles(dt) {
    for (var i = projectiles.length - 1; i >= 0; i--) {
      var p = projectiles[i];
      p.life -= dt;
      if (p.life <= 0) { projectiles.splice(i, 1); continue; }
      var dx, dy, d;
      if (p.target && enemies.indexOf(p.target) !== -1) {
        // Re-aim at the current target each tick (homing-ish for a snappy hit).
        p.tx = p.target.x + 0.5;
        p.ty = p.target.y + 0.5;
      }
      dx = p.tx - p.x; dy = p.ty - p.y;
      d = Math.hypot(dx, dy);
      var step = p.speed * dt;
      if (step >= d) {
        // Hit.
        applyHit(p, p.tx, p.ty);
        projectiles.splice(i, 1);
      } else {
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
      }
    }
  }

  function applyHit(p, hx, hy) {
    if (p.splash && p.splash > 0) {
      // Splash damages every enemy within radius.
      for (var i = enemies.length - 1; i >= 0; i--) {
        var e = enemies[i];
        var dx = (e.x + 0.5) - hx, dy = (e.y + 0.5) - hy;
        if (dx * dx + dy * dy <= p.splash * p.splash) {
          damageEnemy(e, p.dmg, p.slow, i);
        }
      }
    } else if (p.target && enemies.indexOf(p.target) !== -1) {
      damageEnemy(p.target, p.dmg, p.slow, enemies.indexOf(p.target));
    }
  }

  function damageEnemy(e, dmg, slow, idx) {
    e.hp -= dmg;
    if (slow) {
      e.slowMul = Math.min(e.slowMul, slow.mul);
      e.slowUntil = now() + slow.dur;
    }
    pops.push({ x: e.x + 0.5, y: e.y + 0.5, text: String(Math.round(dmg)), color: '#fff', t: 0, dur: 0.45 });
    if (e.hp <= 0) {
      state.gold += e.gold;
      state.score += e.score;
      enemies.splice(idx, 1);
    }
  }

  function updatePops(dt) {
    for (var i = pops.length - 1; i >= 0; i--) {
      pops[i].t += dt;
      if (pops[i].t >= pops[i].dur) pops.splice(i, 1);
    }
  }

  // =====================================================================
  // Wave generator. Endless escalation: more grunts each wave, runners
  // from wave 3, tanks from wave 5 (every other wave), HP/speed scale.
  // =====================================================================
  function generateWave(n) {
    var spawns = [];
    var t = 0;
    var gruntCount = 5 + Math.floor(n * 1.6);
    for (var i = 0; i < gruntCount; i++) { spawns.push({ kind: 'grunt', t: t }); t += CFG.spawnPeriod; }
    if (n >= 3) {
      var runnerCount = 2 + Math.floor((n - 3) * 0.7);
      for (var j = 0; j < runnerCount; j++) { spawns.push({ kind: 'runner', t: t }); t += CFG.spawnPeriod * 0.55; }
    }
    if (n >= 5) {
      var tankCount = 1 + Math.floor((n - 5) / 3);
      for (var k = 0; k < tankCount; k++) { spawns.push({ kind: 'tank', t: t }); t += CFG.spawnPeriod * 1.6; }
    }
    return { spawns: spawns, idx: 0, t: 0, hpMul: 1 + (n - 1) * 0.16, total: spawns.length };
  }

  function startWave() {
    state.wave++;
    state.waveQueue = generateWave(state.wave);
    state.interWaveTimer = CFG.interWaveDelay;
    state.phase = 'wave';
  }

  function updateWave(dt) {
    if (!state.waveQueue) return;
    var q = state.waveQueue;
    if (state.interWaveTimer > 0) { state.interWaveTimer -= dt; return; }
    q.t += dt;
    while (q.idx < q.spawns.length && q.spawns[q.idx].t <= q.t) {
      spawnEnemy(q.spawns[q.idx].kind, q.hpMul);
      q.idx++;
    }
    if (q.idx >= q.spawns.length && enemies.length === 0) {
      // Wave clear.
      state.gold += CFG.waveBonus + Math.floor(state.wave * 1.2);
      state.score += 10 * state.wave;
      state.waveQueue = null;
      state.phase = 'build';
    }
  }

  // =====================================================================
  // Loop + state machine.
  // =====================================================================
  function now() { return performance.now() / 1000; }

  function endGame() {
    state.phase = 'gameover';
    try {
      var raw = JSON.parse(localStorage.getItem('bastion_v1') || '{}');
      if ((state.score) > (raw.bestScore || 0)) {
        raw.bestScore = state.score;
        raw.bestWave = state.wave;
        localStorage.setItem('bastion_v1', JSON.stringify(raw));
      }
    } catch (e) { /* private mode */ }
    showOverlay('go');
  }

  function loadBest() {
    try {
      var raw = JSON.parse(localStorage.getItem('bastion_v1') || '{}');
      state.best = raw.bestScore || 0;
    } catch (e) {}
  }
  loadBest();

  // =====================================================================
  // Rendering.
  // =====================================================================
  function fitCanvas() {
    var wrap = canvas.parentElement;
    // Belt-and-braces: if the wrap hasn't been laid out yet, clientHeight
    // is 0; a negative-truthy `0 - 4` would have leaked through the
    // earlier `|| 9999` short-circuit. Use explicit positive math.
    var maxW = Math.max(120, (wrap.clientWidth || 320) - 4);
    var maxH = Math.min(window.innerHeight * 0.62, Math.max(180, (wrap.clientHeight || 240) - 4));
    var byW = Math.floor(maxW / W);
    var byH = Math.floor(maxH / H);
    cellPx = Math.max(20, Math.min(46, Math.min(byW, byH)));
    canvas.width = W * cellPx;
    canvas.height = H * cellPx;
    canvas.style.width = canvas.width + 'px';
    canvas.style.height = canvas.height + 'px';
  }
  fitCanvas();
  window.addEventListener('resize', fitCanvas);

  function drawGrid() {
    ctx.fillStyle = CFG.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // grid lines
    ctx.strokeStyle = CFG.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = 0; x <= W; x++) { ctx.moveTo(x * cellPx, 0); ctx.lineTo(x * cellPx, H * cellPx); }
    for (var y = 0; y <= H; y++) { ctx.moveTo(0, y * cellPx); ctx.lineTo(W * cellPx, y * cellPx); }
    ctx.stroke();
  }

  function drawPath() {
    if (!state.sharedPath || state.sharedPath.length < 2) return;
    // Glow under-stroke first, then thinner bright stroke.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = CFG.pathGlow;
    ctx.lineWidth = cellPx * 0.62;
    ctx.beginPath();
    var p0 = state.sharedPath[0];
    ctx.moveTo((p0.x + 0.5) * cellPx, (p0.y + 0.5) * cellPx);
    for (var i = 1; i < state.sharedPath.length; i++) {
      var p = state.sharedPath[i];
      ctx.lineTo((p.x + 0.5) * cellPx, (p.y + 0.5) * cellPx);
    }
    ctx.stroke();
    ctx.strokeStyle = CFG.pathStroke;
    ctx.lineWidth = cellPx * 0.16;
    ctx.stroke();
  }

  function drawEndpoints() {
    var pad = cellPx * 0.18;
    ctx.fillStyle = CFG.entranceCol;
    ctx.fillRect(entrance.x * cellPx + pad, entrance.y * cellPx + pad, cellPx - pad * 2, cellPx - pad * 2);
    ctx.fillStyle = CFG.baseCol;
    ctx.beginPath();
    ctx.arc((base.x + 0.5) * cellPx, (base.y + 0.5) * cellPx, cellPx * 0.32, 0, Math.PI * 2);
    ctx.fill();
    // Centre pulse on the base.
    var pulse = 0.5 + Math.sin(now() * 4) * 0.5;
    ctx.fillStyle = 'rgba(255,180,120,' + (0.25 + pulse * 0.25) + ')';
    ctx.beginPath();
    ctx.arc((base.x + 0.5) * cellPx, (base.y + 0.5) * cellPx, cellPx * (0.18 + pulse * 0.20), 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTowers() {
    for (var i = 0; i < towers.length; i++) {
      var t = towers[i];
      var def = CFG.towers[t.kind];
      var cx = (t.x + 0.5) * cellPx, cy = (t.y + 0.5) * cellPx;
      var s = cellPx * 0.34;
      // Glow underlay
      ctx.fillStyle = def.glow;
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.arc(cx, cy, cellPx * 0.50, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // Shape
      ctx.fillStyle = def.color;
      if (def.shape === 'tri') {
        ctx.beginPath();
        ctx.moveTo(cx, cy - s);
        ctx.lineTo(cx + s, cy + s * 0.8);
        ctx.lineTo(cx - s, cy + s * 0.8);
        ctx.closePath();
        ctx.fill();
      } else if (def.shape === 'hex') {
        ctx.beginPath();
        for (var a = 0; a < 6; a++) {
          var th = (a / 6) * Math.PI * 2 - Math.PI / 2;
          var px = cx + Math.cos(th) * s, py = cy + Math.sin(th) * s;
          if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
      }
      // Inner mark
      ctx.fillStyle = '#0F0F0E';
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawEnemies() {
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      var cx = (e.x + 0.5) * cellPx, cy = (e.y + 0.5) * cellPx;
      // Body
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(cx, cy, e.radius * cellPx, 0, Math.PI * 2);
      ctx.fill();
      // Slow tint
      if (e.slowUntil > now()) {
        ctx.strokeStyle = 'rgba(160,220,255,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, e.radius * cellPx + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      // HP bar
      var barW = cellPx * 0.7;
      var barH = 3;
      var bx = cx - barW / 2, by = cy - e.radius * cellPx - 7;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx, by, barW, barH);
      var ratio = Math.max(0, e.hp / e.hpMax);
      ctx.fillStyle = ratio > 0.5 ? '#7BD68B' : (ratio > 0.25 ? '#FFCB85' : '#FF6B6B');
      ctx.fillRect(bx, by, barW * ratio, barH);
    }
  }

  function drawProjectiles() {
    for (var i = 0; i < projectiles.length; i++) {
      var p = projectiles[i];
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.splash ? 4 : 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x * cellPx, p.y * cellPx);
      var dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy) || 1;
      var tail = Math.min(0.45, d);
      ctx.lineTo((p.x - (dx / d) * tail) * cellPx, (p.y - (dy / d) * tail) * cellPx);
      ctx.stroke();
    }
  }

  function drawPops() {
    ctx.font = 'bold ' + Math.floor(cellPx * 0.32) + 'px ' + 'JetBrains Mono, ui-monospace, monospace';
    ctx.textAlign = 'center';
    for (var i = 0; i < pops.length; i++) {
      var p = pops[i];
      var k = p.t / p.dur;
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x * cellPx, (p.y - 0.4 - k * 0.4) * cellPx);
    }
    ctx.globalAlpha = 1;
  }

  function drawHoverPreview() {
    if (!state.hover || !state.selectedTower) return;
    var def = CFG.towers[state.selectedTower];
    var cx = state.hover.x, cy = state.hover.y;
    var valid = state.gold >= def.cost
             && canPlace(W, H, blocked, entrance, base, cx, cy)
             && !enemies.some(function (e) { return Math.floor(e.x) === cx && Math.floor(e.y) === cy; });
    // Range circle
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.strokeStyle = valid ? 'rgba(127,230,170,0.65)' : 'rgba(255,90,90,0.65)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc((cx + 0.5) * cellPx, (cy + 0.5) * cellPx, def.range * cellPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Cell highlight
    ctx.fillStyle = valid ? CFG.validCol : CFG.invalidCol;
    ctx.fillRect(cx * cellPx + 1, cy * cellPx + 1, cellPx - 2, cellPx - 2);
  }

  function drawSelectedTowerRange() {
    // (Layer 2 will let you click an already-placed tower to inspect.
    // For now, no-op.)
  }

  function render() {
    drawGrid();
    drawPath();
    drawEndpoints();
    drawHoverPreview();
    drawTowers();
    drawProjectiles();
    drawEnemies();
    drawPops();
  }

  // =====================================================================
  // HUD.
  // =====================================================================
  function $(id) { return document.getElementById(id); }
  function updateHUD() {
    $('bn-wave').textContent = state.wave;
    $('bn-gold').textContent = state.gold;
    $('bn-lives').textContent = state.lives;
    $('bn-score').textContent = state.score;
    $('bn-best').textContent = state.best;
    // Tower palette enabled/disabled state by affordability
    var keys = Object.keys(CFG.towers);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var def = CFG.towers[k];
      var btn = $('bn-t-' + k);
      if (!btn) continue;
      btn.classList.toggle('selected', state.selectedTower === k);
      btn.classList.toggle('unaffordable', state.gold < def.cost);
    }
    $('bn-startwave-btn').disabled = state.phase !== 'build' || state.lives <= 0;
    $('bn-speed-btn').textContent = state.speed === 2 ? '2x' : '1x';
    $('bn-pause-btn').textContent = state.paused ? '▶' : '❚❚';
  }

  function showOverlay(which) {
    var menu = $('bn-menu'), go = $('bn-gameover');
    if (menu) menu.classList.toggle('is-visible', which === 'menu');
    if (go) go.classList.toggle('is-visible', which === 'go');
    if (which === 'go') {
      $('bn-go-wave').textContent = state.wave;
      $('bn-go-score').textContent = state.score;
      loadBest();
      $('bn-go-best').textContent = state.best;
    }
  }

  // =====================================================================
  // Input.
  // =====================================================================
  function eventToCell(e) {
    var r = canvas.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width * canvas.width;
    var y = (e.clientY - r.top) / r.height * canvas.height;
    return { x: Math.floor(x / cellPx), y: Math.floor(y / cellPx) };
  }
  canvas.addEventListener('pointermove', function (e) {
    var c = eventToCell(e);
    if (c.x < 0 || c.x >= W || c.y < 0 || c.y >= H) { state.hover = null; state._hoverDirty = true; return; }
    if (!state.hover || state.hover.x !== c.x || state.hover.y !== c.y) state._hoverDirty = true;
    state.hover = c;
  });
  canvas.addEventListener('pointerleave', function () { state.hover = null; state._hoverDirty = true; });
  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    var c = eventToCell(e);
    if (c.x < 0 || c.x >= W || c.y < 0 || c.y >= H) return;
    state.hover = c;
    state._hoverDirty = true;
    if (state.selectedTower) tryPlace(c.x, c.y, state.selectedTower);
  });

  // Palette buttons
  Object.keys(CFG.towers).forEach(function (k) {
    var btn = $('bn-t-' + k);
    if (!btn) return;
    btn.addEventListener('click', function () {
      state.selectedTower = state.selectedTower === k ? null : k;
      state._hoverDirty = true;
    });
  });

  // Flow controls
  $('bn-startwave-btn').addEventListener('click', function () {
    if (state.phase !== 'build') return;
    startWave();
  });
  $('bn-speed-btn').addEventListener('click', function () {
    state.speed = state.speed === 1 ? 2 : 1;
  });
  $('bn-pause-btn').addEventListener('click', function () {
    state.paused = !state.paused;
  });
  $('bn-restart-btn').addEventListener('click', function () {
    fullReset();
    state.phase = 'build';
    startLoop();
  });

  // Keyboard shortcuts (1/2/3, Space = next wave, P = pause).
  window.addEventListener('keydown', function (e) {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.code === 'Digit1') state.selectedTower = state.selectedTower === 'gun' ? null : 'gun';
    if (e.code === 'Digit2') state.selectedTower = state.selectedTower === 'cannon' ? null : 'cannon';
    if (e.code === 'Digit3') state.selectedTower = state.selectedTower === 'frost' ? null : 'frost';
    if (e.code === 'Space') { e.preventDefault(); if (state.phase === 'build') startWave(); }
    if (e.code === 'KeyP') state.paused = !state.paused;
    if (e.code === 'Escape') state.selectedTower = null;
  });

  // Menu / over overlay buttons. Each starts the rAF loop, which on the
  // menu/game-over screens is NOT running (we render one static frame
  // and idle the page until the user starts a game).
  $('bn-play-btn').addEventListener('click', function () {
    fullReset();
    state.phase = 'build';
    showOverlay(null);
    startLoop();
  });
  $('bn-playagain-btn').addEventListener('click', function () {
    fullReset();
    state.phase = 'build';
    showOverlay(null);
    startLoop();
  });

  function fullReset() {
    blocked = new Uint8Array(W * H);
    towers.length = 0;
    enemies.length = 0;
    projectiles.length = 0;
    pops.length = 0;
    state.gold = CFG.startGold;
    state.lives = CFG.startLives;
    state.score = 0;
    state.wave = 0;
    state.speed = 1;
    state.paused = false;
    state.selectedTower = null;
    state.hover = null;
    state.waveQueue = null;
    state.interWaveTimer = 0;
    state.phase = 'build';
    loadBest();
    recomputeSharedPath();
  }

  // =====================================================================
  // Main loop. The loop only runs when the GAME is actually running
  // (build phase or wave). On menu / game-over it does not run at all —
  // we render one static frame and let the page be idle. This is the
  // real fix for the load-time OOM crash report: a constantly-running
  // rAF + render pipeline on top of a canvas under a (formerly blurred)
  // overlay was burning compositor work for nothing, every single frame,
  // from the moment the page loaded.
  // =====================================================================
  var last = performance.now();
  var MAX_PROJECTILES = 400;
  var MAX_POPS = 120;
  var MAX_ENEMIES = 200;
  var MAX_SUBSTEPS = 4;
  var rafId = null;
  var running = false;

  function trimCaps() {
    if (projectiles.length > MAX_PROJECTILES) projectiles.splice(0, projectiles.length - MAX_PROJECTILES);
    if (pops.length > MAX_POPS) pops.splice(0, pops.length - MAX_POPS);
    if (enemies.length > MAX_ENEMIES) enemies.splice(0, enemies.length - MAX_ENEMIES);
  }

  function startLoop() {
    if (running) return;
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(loop);
  }
  function stopLoop() {
    running = false;
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function loop(t) {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    var raw = (t - last) / 1000;
    last = t;
    if (!isFinite(raw) || raw <= 0) raw = 1 / 60;
    var dt = Math.min(0.05, raw);
    if (!state.paused) {
      var per = dt * state.speed;
      var subs = 0;
      while (per > 0.04 && subs < MAX_SUBSTEPS) {
        stepLogic(0.04);
        per -= 0.04;
        subs++;
      }
      if (per > 0) stepLogic(Math.min(per, 0.04));
      trimCaps();
    }
    updateHUD();
    render();
    // If we just hit game-over, the loop self-stops next frame.
    if (state.phase === 'gameover') stopLoop();
  }

  // Pause when the tab is hidden — most browsers throttle rAF aggressively
  // but Chrome can still queue work; the visibility-pause guarantees the
  // main loop is idle and stops any chance of background allocation churn.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      state._wasPausedByVisibility = !state.paused;
      state.paused = true;
    } else if (state._wasPausedByVisibility) {
      state.paused = false;
      state._wasPausedByVisibility = false;
      last = performance.now(); // reset the dt baseline so we don't sim a backlog
    }
  });
  function stepLogic(dt) {
    if (state.phase === 'wave') {
      updateWave(dt);
      updateEnemies(dt);
      updateTowers(dt);
      updateProjectiles(dt);
    } else if (state.phase === 'build') {
      // Towers still cooldown so they're ready when the wave starts.
      updateTowers(dt);
    }
    updatePops(dt);
  }

  // Initial overlay state.
  // Boot: render one static frame so the menu has the grid behind it,
  // but DO NOT start the rAF loop. The loop only runs while a game is
  // active (build phase or wave). On menu / game-over the page is idle.
  showOverlay('menu');
  updateHUD();
  render();
})();
