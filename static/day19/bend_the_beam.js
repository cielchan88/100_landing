/* Bend the Beam — Day 19. Client-side ray-tracing puzzle. */
(function () {
  'use strict';

  // ===== Module 1: Constants & Level Data =====
  const CFG = {
    CANVAS_WIDTH: 600,
    CANVAS_HEIGHT: 800,
    PRISM_SIZE: 50,
    MIRROR_LENGTH: 80,
    MIRROR_THICKNESS: 8,
    TARGET_RADIUS: 22,
    SOURCE_RADIUS: 14,
    MAX_RAY_BOUNCES: 12,
    HIT_TOLERANCE: 18,
    PRISM_REFRACTIVE_INDEX: 1.5,
    ROTATION_INCREMENT: 15,
    STORAGE_KEY: 'btb_solved_levels',
  };

  const LEVELS = [
    { id: 1, title: "First Bend", hint: "Drag the prism to make the light hit the target.",
      source: { x: 100, y: 100, angle: 0 },
      elements: [{ type: "prism", x: 300, y: 100, angle: 0, movable: true, rotatable: true }],
      targets: [{ x: 500, y: 250 }], walls: [], fixed_mirrors: [] },
    { id: 2, title: "Around the Corner", hint: "Use the mirror to redirect the beam.",
      source: { x: 50, y: 400, angle: 0 },
      elements: [{ type: "mirror", x: 300, y: 400, angle: 45, movable: false, rotatable: true }],
      targets: [{ x: 300, y: 100 }], walls: [], fixed_mirrors: [] },
    { id: 3, title: "Two Bends", hint: "Two prisms, two bends. The order matters.",
      source: { x: 100, y: 200, angle: 0 },
      elements: [
        { type: "prism", x: 250, y: 200, angle: 0, movable: true, rotatable: true },
        { type: "prism", x: 450, y: 400, angle: 0, movable: true, rotatable: true },
      ],
      targets: [{ x: 550, y: 600 }], walls: [], fixed_mirrors: [] },
    { id: 4, title: "The Wall", hint: "The wall blocks light. Bend around it.",
      source: { x: 100, y: 120, angle: 0 },
      elements: [
        { type: "prism", x: 230, y: 120, angle: 0, movable: true, rotatable: true },
        { type: "prism", x: 420, y: 300, angle: 0, movable: true, rotatable: true },
      ],
      targets: [{ x: 520, y: 480 }], walls: [{ x: 300, y: 0, w: 60, h: 230 }], fixed_mirrors: [] },
    { id: 5, title: "Down and Across", hint: "Combine prisms and mirrors.",
      source: { x: 300, y: 50, angle: 90 },
      elements: [
        { type: "mirror", x: 300, y: 500, angle: 45, movable: true, rotatable: true },
        { type: "prism", x: 500, y: 500, angle: 0, movable: true, rotatable: true },
      ],
      targets: [{ x: 550, y: 700 }], walls: [], fixed_mirrors: [] },
    { id: 6, title: "Fixed Mirror", hint: "Some mirrors don't move. Aim into the locked one.",
      source: { x: 100, y: 120, angle: 0 },
      elements: [{ type: "mirror", x: 300, y: 120, angle: 45, movable: true, rotatable: true }],
      targets: [{ x: 520, y: 400 }], walls: [{ x: 380, y: 60, w: 30, h: 160 }],
      fixed_mirrors: [{ x: 300, y: 400, angle: 45, movable: false, rotatable: false }] },
    { id: 7, title: "The Slot", hint: "Aim carefully — only one path through.",
      source: { x: 100, y: 100, angle: 0 },
      elements: [
        { type: "prism", x: 200, y: 200, angle: 0, movable: true, rotatable: true },
        { type: "prism", x: 400, y: 400, angle: 0, movable: true, rotatable: true },
      ],
      targets: [{ x: 500, y: 600 }],
      walls: [{ x: 250, y: 250, w: 100, h: 30 }, { x: 350, y: 350, w: 100, h: 30 }], fixed_mirrors: [] },
    { id: 8, title: "Pincer", hint: "Two walls form a narrow path.",
      source: { x: 50, y: 400, angle: 0 },
      elements: [
        { type: "prism", x: 200, y: 400, angle: 0, movable: true, rotatable: true },
        { type: "mirror", x: 350, y: 600, angle: 45, movable: true, rotatable: true },
      ],
      targets: [{ x: 550, y: 700 }],
      walls: [{ x: 300, y: 100, w: 30, h: 250 }, { x: 300, y: 450, w: 30, h: 250 }], fixed_mirrors: [] },
    { id: 9, title: "Right Angle", hint: "Get the beam to turn exactly 90°.",
      source: { x: 100, y: 120, angle: 0 },
      elements: [{ type: "mirror", x: 400, y: 120, angle: 45, movable: true, rotatable: true }],
      targets: [{ x: 400, y: 620 }],
      walls: [{ x: 470, y: 60, w: 30, h: 200 }, { x: 180, y: 300, w: 160, h: 30 }], fixed_mirrors: [] },
    { id: 10, title: "Maze", hint: "Two mirrors, one wall between you and the goal.",
      source: { x: 80, y: 100, angle: 0 },
      elements: [
        { type: "mirror", x: 480, y: 100, angle: 45, movable: true, rotatable: true },
        { type: "mirror", x: 480, y: 600, angle: 45, movable: true, rotatable: true },
      ],
      targets: [{ x: 120, y: 600 }],
      walls: [{ x: 200, y: 250, w: 240, h: 30 }], fixed_mirrors: [] },
    { id: 11, title: "Triple Refract", hint: "Three prisms. Each bend matters.",
      source: { x: 100, y: 200, angle: 0 },
      elements: [
        { type: "prism", x: 200, y: 200, angle: 0, movable: true, rotatable: true },
        { type: "prism", x: 300, y: 400, angle: 0, movable: true, rotatable: true },
        { type: "prism", x: 450, y: 500, angle: 0, movable: true, rotatable: true },
      ],
      targets: [{ x: 550, y: 700 }], walls: [{ x: 250, y: 250, w: 100, h: 100 }], fixed_mirrors: [] },
    { id: 12, title: "The Spiral", hint: "Solve this one and you're done.",
      source: { x: 100, y: 700, angle: 0 },
      elements: [
        { type: "mirror", x: 500, y: 700, angle: 135, movable: true, rotatable: true },
        { type: "mirror", x: 500, y: 100, angle: -135, movable: true, rotatable: true },
        { type: "prism", x: 300, y: 400, angle: 0, movable: true, rotatable: true },
      ],
      targets: [{ x: 100, y: 100 }],
      walls: [{ x: 200, y: 200, w: 200, h: 30 }, { x: 200, y: 570, w: 200, h: 30 }], fixed_mirrors: [] },
  ];

  // ===== Module 2: State =====
  const state = {
    currentLevelIdx: 0,
    elements: [],
    selectedElementIdx: null,
    isDragging: false,
    dragOffset: { x: 0, y: 0 },
    solvedLevels: new Set(),
    rayHitsTarget: false,
  };

  let canvas = null;
  let ctx = null;

  function loadProgress() {
    try {
      const stored = localStorage.getItem(CFG.STORAGE_KEY);
      if (stored) state.solvedLevels = new Set(JSON.parse(stored));
    } catch (e) {}
  }

  function saveProgress() {
    try {
      localStorage.setItem(CFG.STORAGE_KEY, JSON.stringify(Array.from(state.solvedLevels)));
    } catch (e) {}
  }

  function loadLevel(idx) {
    const level = LEVELS[idx];
    if (!level) return;
    state.currentLevelIdx = idx;
    state.selectedElementIdx = null;
    state.isDragging = false;
    state.elements = level.elements.map(e => Object.assign({}, e));
    state.rayHitsTarget = false;

    document.getElementById('btb-level-title').textContent = level.title;
    document.getElementById('btb-level-counter').textContent = `Level ${level.id} of 12`;
    document.getElementById('btb-hint').textContent = level.hint;

    const prevBtn = document.querySelector('.btb-prev-btn');
    const nextBtn = document.querySelector('.btb-next-btn');
    if (prevBtn) prevBtn.disabled = idx === 0;
    if (nextBtn) nextBtn.disabled = idx >= LEVELS.length - 1;

    render();
  }

  // ===== Module 3: Vector math =====
  function vec(x, y) { return { x, y }; }
  function vecAdd(a, b) { return vec(a.x + b.x, a.y + b.y); }
  function vecSub(a, b) { return vec(a.x - b.x, a.y - b.y); }
  function vecScale(v, s) { return vec(v.x * s, v.y * s); }
  function vecLength(v) { return Math.sqrt(v.x * v.x + v.y * v.y); }
  function vecNormalize(v) { const l = vecLength(v); return l > 0 ? vec(v.x / l, v.y / l) : vec(0, 0); }
  function vecDot(a, b) { return a.x * b.x + a.y * b.y; }
  function vecRotate(v, angleDeg) {
    const r = angleDeg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return vec(v.x * c - v.y * s, v.x * s + v.y * c);
  }
  function angleToVec(deg) { const r = deg * Math.PI / 180; return vec(Math.cos(r), Math.sin(r)); }
  function distance(a, b) { return vecLength(vecSub(a, b)); }

  // ===== Module 4: Geometry =====
  function getPrismVertices(prism) {
    const size = CFG.PRISM_SIZE;
    const localVerts = [
      vec(0, -size * 0.577),
      vec(-size / 2, size * 0.289),
      vec(size / 2, size * 0.289),
    ];
    return localVerts.map(v => {
      const r = vecRotate(v, prism.angle);
      return vec(r.x + prism.x, r.y + prism.y);
    });
  }

  function getMirrorEndpoints(mirror) {
    const half = CFG.MIRROR_LENGTH / 2;
    const v1 = vecRotate(vec(-half, 0), mirror.angle);
    const v2 = vecRotate(vec(half, 0), mirror.angle);
    return { start: vec(v1.x + mirror.x, v1.y + mirror.y), end: vec(v2.x + mirror.x, v2.y + mirror.y) };
  }

  function getWallBounds(wall) {
    return { minX: wall.x, minY: wall.y, maxX: wall.x + wall.w, maxY: wall.y + wall.h };
  }

  // ===== Module 5: Ray intersection =====
  function rayIntersectSegment(origin, dir, segStart, segEnd) {
    const x1 = origin.x, y1 = origin.y;
    const x2 = origin.x + dir.x, y2 = origin.y + dir.y;
    const x3 = segStart.x, y3 = segStart.y, x4 = segEnd.x, y4 = segEnd.y;
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-9) return null;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    if (t > 0.001 && u >= 0 && u <= 1) {
      return { point: vec(x1 + t * (x2 - x1), y1 + t * (y2 - y1)), distance: t, segStart, segEnd };
    }
    return null;
  }

  function rayIntersectRect(origin, dir, b) {
    const segs = [
      [vec(b.minX, b.minY), vec(b.maxX, b.minY)],
      [vec(b.maxX, b.minY), vec(b.maxX, b.maxY)],
      [vec(b.maxX, b.maxY), vec(b.minX, b.maxY)],
      [vec(b.minX, b.maxY), vec(b.minX, b.minY)],
    ];
    let nearest = null;
    for (const s of segs) {
      const hit = rayIntersectSegment(origin, dir, s[0], s[1]);
      if (hit && (!nearest || hit.distance < nearest.distance)) nearest = hit;
    }
    return nearest;
  }

  function rayIntersectPolygon(origin, dir, verts) {
    let nearest = null;
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i], b = verts[(i + 1) % verts.length];
      const hit = rayIntersectSegment(origin, dir, a, b);
      if (hit && (!nearest || hit.distance < nearest.distance)) {
        nearest = Object.assign({}, hit, { edge: { start: a, end: b } });
      }
    }
    return nearest;
  }

  // ===== Module 6: Physics =====
  function reflect(dir, normal) {
    const d = vecDot(dir, normal);
    return vec(dir.x - 2 * d * normal.x, dir.y - 2 * d * normal.y);
  }

  function refract(dir, normal, n1, n2) {
    const cosI = -vecDot(dir, normal);
    const sinT2 = (n1 / n2) ** 2 * (1 - cosI * cosI);
    if (sinT2 > 1) return reflect(dir, normal); // total internal reflection
    const cosT = Math.sqrt(1 - sinT2);
    const f = n1 / n2;
    return vec(f * dir.x + (f * cosI - cosT) * normal.x, f * dir.y + (f * cosI - cosT) * normal.y);
  }

  function getEdgeNormal(edgeStart, edgeEnd, polygonCenter) {
    const edge = vecNormalize(vecSub(edgeEnd, edgeStart));
    const n1 = vec(-edge.y, edge.x);
    const edgeMid = vec((edgeStart.x + edgeEnd.x) / 2, (edgeStart.y + edgeEnd.y) / 2);
    const toCenter = vecSub(polygonCenter, edgeMid);
    return vecDot(n1, toCenter) < 0 ? n1 : vec(edge.y, -edge.x);
  }

  // ===== Module 7: Ray tracing =====
  function traceRay(origin, direction) {
    const segments = [];
    let currentOrigin = vec(origin.x, origin.y);
    let currentDir = vecNormalize(direction);
    let insidePrism = null;
    let hitTarget = false;
    const level = LEVELS[state.currentLevelIdx];

    for (let bounce = 0; bounce < CFG.MAX_RAY_BOUNCES; bounce++) {
      let nearestHit = null, hitType = null, hitData = null;

      for (const target of level.targets) {
        const toCenter = vecSub(target, currentOrigin);
        const tCa = vecDot(toCenter, currentDir);
        if (tCa < 0) continue;
        const d2 = vecDot(toCenter, toCenter) - tCa * tCa;
        const r2 = CFG.TARGET_RADIUS * CFG.TARGET_RADIUS;
        if (d2 > r2) continue;
        const t = tCa - Math.sqrt(r2 - d2);
        if (t > 0.001 && (!nearestHit || t < nearestHit.distance)) {
          nearestHit = { point: vec(currentOrigin.x + t * currentDir.x, currentOrigin.y + t * currentDir.y), distance: t };
          hitType = 'target'; hitData = null;
        }
      }

      for (const wall of (level.walls || [])) {
        const hit = rayIntersectRect(currentOrigin, currentDir, getWallBounds(wall));
        if (hit && (!nearestHit || hit.distance < nearestHit.distance)) {
          nearestHit = hit; hitType = 'wall'; hitData = null;
        }
      }

      const allMirrors = state.elements.filter(e => e.type === 'mirror').concat(level.fixed_mirrors || []);
      for (const mirror of allMirrors) {
        const { start, end } = getMirrorEndpoints(mirror);
        const hit = rayIntersectSegment(currentOrigin, currentDir, start, end);
        if (hit && (!nearestHit || hit.distance < nearestHit.distance)) {
          nearestHit = hit; hitType = 'mirror'; hitData = mirror;
        }
      }

      const prisms = state.elements.filter(e => e.type === 'prism');
      for (const prism of prisms) {
        const verts = getPrismVertices(prism);
        const hit = rayIntersectPolygon(currentOrigin, currentDir, verts);
        if (hit && (!nearestHit || hit.distance < nearestHit.distance)) {
          nearestHit = hit;
          hitType = (insidePrism === prism) ? 'prism_out' : 'prism_in';
          hitData = { prism, edge: hit.edge };
        }
      }

      if (!nearestHit) {
        segments.push({ start: currentOrigin, end: vec(currentOrigin.x + currentDir.x * 2000, currentOrigin.y + currentDir.y * 2000) });
        break;
      }

      segments.push({ start: currentOrigin, end: nearestHit.point });

      if (hitType === 'target') { hitTarget = true; break; }
      if (hitType === 'wall') break;

      if (hitType === 'mirror') {
        const { start, end } = getMirrorEndpoints(hitData);
        const edgeVec = vecNormalize(vecSub(end, start));
        let normal = vec(-edgeVec.y, edgeVec.x);
        if (vecDot(normal, currentDir) > 0) normal = vec(-normal.x, -normal.y);
        currentDir = vecNormalize(reflect(currentDir, normal));
        currentOrigin = vecAdd(nearestHit.point, vecScale(currentDir, 0.5));
      } else if (hitType === 'prism_in') {
        const { edge, prism } = hitData;
        const normal = getEdgeNormal(edge.start, edge.end, vec(prism.x, prism.y));
        currentDir = vecNormalize(refract(currentDir, normal, 1.0, CFG.PRISM_REFRACTIVE_INDEX));
        currentOrigin = vecAdd(nearestHit.point, vecScale(currentDir, 0.5));
        insidePrism = prism;
      } else if (hitType === 'prism_out') {
        const { edge, prism } = hitData;
        const outwardNormal = getEdgeNormal(edge.start, edge.end, vec(prism.x, prism.y));
        const inwardNormal = vec(-outwardNormal.x, -outwardNormal.y);
        currentDir = vecNormalize(refract(currentDir, inwardNormal, CFG.PRISM_REFRACTIVE_INDEX, 1.0));
        currentOrigin = vecAdd(nearestHit.point, vecScale(currentDir, 0.5));
        insidePrism = null;
      }
    }

    return { segments, hitTarget };
  }

  // ===== Module 8: Rendering =====
  function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = CFG.CANVAS_WIDTH * dpr;
    canvas.height = CFG.CANVAS_HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function render() {
    const level = LEVELS[state.currentLevelIdx];

    ctx.fillStyle = '#0F0F0E';
    ctx.fillRect(0, 0, CFG.CANVAS_WIDTH, CFG.CANVAS_HEIGHT);

    const direction = angleToVec(level.source.angle);
    const { segments, hitTarget } = traceRay(level.source, direction);
    state.rayHitsTarget = hitTarget;

    ctx.fillStyle = '#1F1D1B';
    ctx.strokeStyle = '#2A2826';
    ctx.lineWidth = 1;
    for (const wall of (level.walls || [])) {
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      ctx.strokeRect(wall.x, wall.y, wall.w, wall.h);
    }

    ctx.strokeStyle = '#D97757';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(217, 119, 87, 0.6)';
    ctx.shadowBlur = 6;
    for (const seg of segments) {
      ctx.beginPath();
      ctx.moveTo(seg.start.x, seg.start.y);
      ctx.lineTo(seg.end.x, seg.end.y);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    for (const target of level.targets) {
      if (hitTarget) {
        ctx.fillStyle = 'rgba(217, 119, 87, 0.3)';
        ctx.beginPath();
        ctx.arc(target.x, target.y, CFG.TARGET_RADIUS + 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#D97757';
        ctx.beginPath();
        ctx.arc(target.x, target.y, CFG.TARGET_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = '#A8A29E';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(target.x, target.y, CFG.TARGET_RADIUS, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.fillStyle = '#D97757';
    ctx.beginPath();
    ctx.arc(level.source.x, level.source.y, CFG.SOURCE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    const dirVec = angleToVec(level.source.angle);
    ctx.strokeStyle = '#FAFAF7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(level.source.x, level.source.y);
    ctx.lineTo(level.source.x + dirVec.x * CFG.SOURCE_RADIUS * 1.5, level.source.y + dirVec.y * CFG.SOURCE_RADIUS * 1.5);
    ctx.stroke();

    const allMirrors = state.elements
      .map((e, i) => Object.assign({}, e, { idx: i }))
      .filter(e => e.type === 'mirror')
      .concat((level.fixed_mirrors || []).map(m => Object.assign({}, m, { fixed: true })));
    for (const mirror of allMirrors) {
      const { start, end } = getMirrorEndpoints(mirror);
      const isSelected = !mirror.fixed && mirror.idx === state.selectedElementIdx;
      const grad = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
      grad.addColorStop(0, '#D4D4D8');
      grad.addColorStop(0.5, '#FAFAF7');
      grad.addColorStop(1, '#D4D4D8');
      ctx.strokeStyle = isSelected ? '#D97757' : grad;
      ctx.lineWidth = isSelected ? CFG.MIRROR_THICKNESS + 4 : CFG.MIRROR_THICKNESS;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.lineCap = 'butt';
      if (mirror.fixed) {
        ctx.fillStyle = '#A8A29E';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('🔒', mirror.x, mirror.y + 4);
        ctx.textAlign = 'start';
      }
    }

    state.elements.forEach((element, idx) => {
      if (element.type !== 'prism') return;
      const verts = getPrismVertices(element);
      const isSelected = idx === state.selectedElementIdx;
      ctx.fillStyle = isSelected ? 'rgba(123, 167, 204, 0.4)' : 'rgba(123, 167, 204, 0.2)';
      ctx.strokeStyle = isSelected ? '#D97757' : 'rgba(250, 250, 247, 0.7)';
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(verts[0].x, verts[0].y);
      for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });

    updateRotateControlsPosition();

    if (hitTarget && !state.solvedLevels.has(level.id)) {
      setTimeout(() => onLevelSolved(level.id), 300);
    }
  }

  // ===== Module 9: Interaction =====
  function getCanvasCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (CFG.CANVAS_WIDTH / rect.width),
      y: (clientY - rect.top) * (CFG.CANVAS_HEIGHT / rect.height),
    };
  }

  function findElementAt(point) {
    for (let i = state.elements.length - 1; i >= 0; i--) {
      const el = state.elements[i];
      if (el.type === 'prism') {
        if (pointInPolygon(point, getPrismVertices(el))) return i;
      } else if (el.type === 'mirror') {
        const { start, end } = getMirrorEndpoints(el);
        if (distanceToSegment(point, start, end) < 18) return i;
      }
    }
    return null;
  }

  function pointInPolygon(point, verts) {
    let inside = false;
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
      const xi = verts[i].x, yi = verts[i].y, xj = verts[j].x, yj = verts[j].y;
      const intersect = ((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function distanceToSegment(p, a, b) {
    const ab = vecSub(b, a), ap = vecSub(p, a);
    const denom = vecDot(ab, ab) || 1;
    const t = Math.max(0, Math.min(1, vecDot(ap, ab) / denom));
    return distance(p, vec(a.x + ab.x * t, a.y + ab.y * t));
  }

  function setupInteraction() {
    let pointerDown = false;

    function onPointerDown(e) {
      const pt = e.touches ? e.touches[0] : e;
      const coords = getCanvasCoords(pt.clientX, pt.clientY);
      const elemIdx = findElementAt(coords);
      if (elemIdx !== null) {
        e.preventDefault();
        state.selectedElementIdx = elemIdx;
        const el = state.elements[elemIdx];
        state.isDragging = !!el.movable;
        state.dragOffset = vec(coords.x - el.x, coords.y - el.y);
        render();
      } else {
        state.selectedElementIdx = null;
        state.isDragging = false;
        render();
      }
      pointerDown = true;
    }

    function onPointerMove(e) {
      if (!pointerDown || !state.isDragging || state.selectedElementIdx === null) return;
      const pt = e.touches ? e.touches[0] : e;
      const coords = getCanvasCoords(pt.clientX, pt.clientY);
      const el = state.elements[state.selectedElementIdx];
      if (el.movable) {
        e.preventDefault();
        el.x = Math.max(40, Math.min(CFG.CANVAS_WIDTH - 40, coords.x - state.dragOffset.x));
        el.y = Math.max(40, Math.min(CFG.CANVAS_HEIGHT - 40, coords.y - state.dragOffset.y));
        render();
      }
    }

    function onPointerUp() { pointerDown = false; state.isDragging = false; }

    canvas.addEventListener('mousedown', onPointerDown);
    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('mouseup', onPointerUp);
    canvas.addEventListener('touchstart', onPointerDown, { passive: false });
    document.addEventListener('touchmove', onPointerMove, { passive: false });
    document.addEventListener('touchend', onPointerUp);

    document.addEventListener('keydown', (e) => {
      if (!document.querySelector('.btb-game-screen').classList.contains('is-visible')) return;
      if (e.key === 'q' || e.key === 'Q') rotateSelected(-1);
      else if (e.key === 'e' || e.key === 'E') rotateSelected(1);
      else if (e.key === 'r' || e.key === 'R') loadLevel(state.currentLevelIdx);
    });
  }

  function rotateSelected(direction) {
    if (state.selectedElementIdx === null) return;
    const el = state.elements[state.selectedElementIdx];
    if (!el.rotatable) return;
    el.angle = (el.angle + direction * CFG.ROTATION_INCREMENT) % 360;
    render();
  }

  function updateRotateControlsPosition() {
    const controls = document.querySelector('.btb-rotate-controls');
    if (state.selectedElementIdx === null) { controls.classList.remove('is-visible'); return; }
    const el = state.elements[state.selectedElementIdx];
    if (!el.rotatable) { controls.classList.remove('is-visible'); return; }
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / CFG.CANVAS_WIDTH;
    const scaleY = rect.height / CFG.CANVAS_HEIGHT;
    controls.style.left = `${el.x * scaleX - 60}px`;
    controls.style.top = `${el.y * scaleY - 70}px`;
    controls.classList.add('is-visible');
  }

  // ===== Module 10: Level lifecycle =====
  function onLevelSolved(levelId) {
    if (state.solvedLevels.has(levelId)) return;
    state.solvedLevels.add(levelId);
    saveProgress();
    showOverlay({
      title: 'Level Complete',
      subtitle: `You solved "${LEVELS[state.currentLevelIdx].title}"`,
      primaryText: state.currentLevelIdx < LEVELS.length - 1 ? 'Next Level' : 'See Results',
      onPrimary: () => {
        hideOverlay();
        if (state.currentLevelIdx < LEVELS.length - 1) loadLevel(state.currentLevelIdx + 1);
        else showCompletionScreen();
      },
    });
  }

  function showOverlay({ title, subtitle, primaryText, onPrimary }) {
    const overlay = document.querySelector('.btb-overlay');
    overlay.querySelector('.btb-overlay-title').textContent = title;
    overlay.querySelector('.btb-overlay-subtitle').textContent = subtitle;
    const primaryBtn = overlay.querySelector('.btb-overlay-btn');
    primaryBtn.textContent = primaryText;
    primaryBtn.onclick = onPrimary;
    overlay.classList.add('is-visible');
  }

  function hideOverlay() {
    document.querySelector('.btb-overlay').classList.remove('is-visible');
  }

  function showCompletionScreen() {
    showOverlay({
      title: 'All Solved.',
      subtitle: 'You finished all 12 levels of Bend the Beam.',
      primaryText: 'Back to level select',
      onPrimary: () => { hideOverlay(); renderLevelSelector(); showIntroScreen(); },
    });
  }

  // ===== Module 11: Boot & UI =====
  function showIntroScreen() {
    document.querySelector('.btb-intro-screen').classList.remove('is-hidden');
    document.querySelector('.btb-game-screen').classList.remove('is-visible');
  }

  function showGameScreen() {
    document.querySelector('.btb-intro-screen').classList.add('is-hidden');
    document.querySelector('.btb-game-screen').classList.add('is-visible');
  }

  function renderLevelSelector() {
    const grid = document.querySelector('.btb-level-grid');
    grid.innerHTML = '';
    LEVELS.forEach((level, idx) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'btb-level-cell';
      if (state.solvedLevels.has(level.id)) cell.classList.add('is-solved');
      if (idx === state.currentLevelIdx) cell.classList.add('is-current');
      cell.textContent = state.solvedLevels.has(level.id) ? '✓' : level.id;
      cell.addEventListener('click', () => { loadLevel(idx); showGameScreen(); });
      grid.appendChild(cell);
    });
  }

  function setupActionButtons() {
    document.querySelector('.btb-begin-btn').addEventListener('click', () => {
      // Resume at first unsolved level, else level 1.
      let startIdx = LEVELS.findIndex(l => !state.solvedLevels.has(l.id));
      if (startIdx < 0) startIdx = 0;
      loadLevel(startIdx);
      showGameScreen();
    });
    document.querySelector('.btb-reset-btn').addEventListener('click', () => loadLevel(state.currentLevelIdx));
    document.querySelector('.btb-back-to-levels-btn').addEventListener('click', () => { renderLevelSelector(); showIntroScreen(); });
    document.querySelector('.btb-rotate-left').addEventListener('click', () => rotateSelected(-1));
    document.querySelector('.btb-rotate-right').addEventListener('click', () => rotateSelected(1));
    const prevBtn = document.querySelector('.btb-prev-btn');
    const nextBtn = document.querySelector('.btb-next-btn');
    if (prevBtn) prevBtn.addEventListener('click', () => { if (state.currentLevelIdx > 0) loadLevel(state.currentLevelIdx - 1); });
    if (nextBtn) nextBtn.addEventListener('click', () => { if (state.currentLevelIdx < LEVELS.length - 1) loadLevel(state.currentLevelIdx + 1); });
  }

  function init() {
    canvas = document.getElementById('btb-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    setupCanvas();
    loadProgress();
    setupInteraction();
    renderLevelSelector();
    setupActionButtons();
    showIntroScreen();
    window.addEventListener('resize', () => { if (state.elements.length) updateRotateControlsPosition(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
