/* Quick Diagrammer — Day 13
 * Plain-text relationships -> force-directed SVG diagram. 100% client-side.
 */
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const VIEWBOX = { w: 900, h: 460 };

  let currentGraph = { nodes: [], edges: [] };
  let renderTimer = null;

  // ────────────────────────────────────────────────────────────────
  // Module 1: Parser
  // ────────────────────────────────────────────────────────────────
  function parseInput(text) {
    const nodes = new Map();
    const edges = [];

    const lines = text.split('\n');

    for (const rawLine of lines) {
      let line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const hashIdx = line.indexOf(' #');
      if (hashIdx > -1) line = line.slice(0, hashIdx).trim();

      const hasRel = line.includes('->') || line.includes('--') ||
                     line.includes('<->') || line.includes('=>');

      // Description: NodeName: description text
      const descMatch = line.match(/^([^:->\s][^->:]*?):\s+(.+)$/);
      if (descMatch && !hasRel) {
        const name = stripBrackets(descMatch[1].trim());
        ensureNode(nodes, name, descMatch[1].trim());
        nodes.get(name).description = descMatch[2].trim();
        continue;
      }

      // Bidirectional: A <-> B[: label]
      let m = line.match(/^(.+?)\s*<->\s*([^:]+?)(?:\s*:\s*(.+))?$/);
      if (m) {
        addRelation(nodes, edges, m[1].trim(), m[2].trim(), m[3] && m[3].trim(), 'bidirected');
        continue;
      }

      // Strong arrow: A => B[: label]
      m = line.match(/^(.+?)\s*=>\s*([^:]+?)(?:\s*:\s*(.+))?$/);
      if (m) {
        addRelation(nodes, edges, m[1].trim(), m[2].trim(), m[3] && m[3].trim(), 'strong');
        continue;
      }

      // Directed: A -> B[: label]
      m = line.match(/^(.+?)\s*->\s*([^:]+?)(?:\s*:\s*(.+))?$/);
      if (m) {
        addRelation(nodes, edges, m[1].trim(), m[2].trim(), m[3] && m[3].trim(), 'directed');
        continue;
      }

      // Undirected: A -- B[: label]
      m = line.match(/^(.+?)\s*--\s*([^:]+?)(?:\s*:\s*(.+))?$/);
      if (m) {
        addRelation(nodes, edges, m[1].trim(), m[2].trim(), m[3] && m[3].trim(), 'undirected');
        continue;
      }

      // Unparseable lines silently ignored — by design.
    }

    return {
      nodes: Array.from(nodes.values()),
      edges,
    };
  }

  function stripBrackets(s) {
    return s.replace(/^\[|\]$/g, '').trim();
  }

  function ensureNode(nodes, name, rawName) {
    if (!name) return;
    const isStrong = rawName.startsWith('[') && rawName.endsWith(']');
    if (!nodes.has(name)) {
      nodes.set(name, {
        id: name,
        label: name,
        description: null,
        isStrong,
      });
    } else if (isStrong) {
      nodes.get(name).isStrong = true;
    }
  }

  function addRelation(nodes, edges, fromRaw, toRaw, label, kind) {
    const from = stripBrackets(fromRaw);
    const to = stripBrackets(toRaw);
    if (!from || !to) return;
    ensureNode(nodes, from, fromRaw);
    ensureNode(nodes, to, toRaw);
    edges.push({ from, to, label: label || null, kind });
  }

  // ────────────────────────────────────────────────────────────────
  // Module 2: Force-Directed Layout
  // ────────────────────────────────────────────────────────────────
  const LAYOUT_CFG = {
    iterations: 300,
    repulsion: 6000,
    spring: 0.04,
    springLength: 130,
    damping: 0.85,
    gravity: 0.02,
    centerX: 450,
    centerY: 220,
  };

  function computeLayout(graph, seedHash) {
    const rng = mulberry32(seedHash);

    const nodes = graph.nodes.map((n, i) => {
      const angle = (i / graph.nodes.length) * Math.PI * 2 + rng() * 0.5;
      const radius = 80 + rng() * 60;
      return Object.assign({}, n, {
        x: LAYOUT_CFG.centerX + Math.cos(angle) * radius,
        y: LAYOUT_CFG.centerY + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        width: estimateNodeWidth(n.label),
        height: 40,
      });
    });

    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    for (let iter = 0; iter < LAYOUT_CFG.iterations; iter++) {
      for (const n of nodes) {
        n.fx = 0;
        n.fy = 0;
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const distSq = dx * dx + dy * dy + 0.1;
          const dist = Math.sqrt(distSq);
          const force = LAYOUT_CFG.repulsion / distSq;
          a.fx += (dx / dist) * force;
          a.fy += (dy / dist) * force;
          b.fx -= (dx / dist) * force;
          b.fy -= (dy / dist) * force;
        }
      }

      for (const edge of graph.edges) {
        const a = nodeMap.get(edge.from);
        const b = nodeMap.get(edge.to);
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
        const displacement = dist - LAYOUT_CFG.springLength;
        const force = LAYOUT_CFG.spring * displacement;
        a.fx += (dx / dist) * force;
        a.fy += (dy / dist) * force;
        b.fx -= (dx / dist) * force;
        b.fy -= (dy / dist) * force;
      }

      for (const n of nodes) {
        const dx = LAYOUT_CFG.centerX - n.x;
        const dy = LAYOUT_CFG.centerY - n.y;
        n.fx += dx * LAYOUT_CFG.gravity;
        n.fy += dy * LAYOUT_CFG.gravity;
      }

      for (const n of nodes) {
        n.vx = (n.vx + n.fx) * LAYOUT_CFG.damping;
        n.vy = (n.vy + n.fy) * LAYOUT_CFG.damping;
        n.x += n.vx;
        n.y += n.vy;
      }
    }

    return { nodes, edges: graph.edges, nodeMap };
  }

  function estimateNodeWidth(label) {
    return Math.max(60, label.length * 7.5 + 24);
  }

  function mulberry32(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = seed;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // ────────────────────────────────────────────────────────────────
  // Module 3: SVG Renderer
  // ────────────────────────────────────────────────────────────────
  function renderSVG(layout) {
    const svg = document.getElementById('qd-svg');
    svg.setAttribute('viewBox', `0 0 ${VIEWBOX.w} ${VIEWBOX.h}`);
    svg.innerHTML = '';

    const defs = document.createElementNS(SVG_NS, 'defs');
    defs.innerHTML = `
      <marker id="qd-arrow" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted)" />
      </marker>
      <marker id="qd-arrow-accent" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
      </marker>
    `;
    svg.appendChild(defs);

    const edgeGroup = document.createElementNS(SVG_NS, 'g');
    edgeGroup.classList.add('qd-edges');

    for (const edge of layout.edges) {
      const a = layout.nodeMap.get(edge.from);
      const b = layout.nodeMap.get(edge.to);
      if (!a || !b) continue;

      const { x1, y1, x2, y2 } = edgeEndpoints(a, b);

      const lineEl = document.createElementNS(SVG_NS, 'line');
      lineEl.setAttribute('x1', x1);
      lineEl.setAttribute('y1', y1);
      lineEl.setAttribute('x2', x2);
      lineEl.setAttribute('y2', y2);
      lineEl.classList.add('qd-edge');

      if (edge.kind === 'undirected') {
        lineEl.classList.add('qd-edge-undirected');
      } else if (edge.kind === 'bidirected') {
        lineEl.classList.add('qd-edge-bidirected');
      } else if (edge.kind === 'strong') {
        lineEl.classList.add('is-strong');
        lineEl.setAttribute('marker-end', 'url(#qd-arrow-accent)');
      }

      lineEl.dataset.from = edge.from;
      lineEl.dataset.to = edge.to;
      edgeGroup.appendChild(lineEl);

      if (edge.label) {
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        const labelText = document.createElementNS(SVG_NS, 'text');
        labelText.setAttribute('x', midX);
        labelText.setAttribute('y', midY);
        labelText.classList.add('qd-edge-label');
        labelText.textContent = edge.label;

        const labelWidth = edge.label.length * 6.5 + 8;
        const bgRect = document.createElementNS(SVG_NS, 'rect');
        bgRect.setAttribute('x', midX - labelWidth / 2);
        bgRect.setAttribute('y', midY - 8);
        bgRect.setAttribute('width', labelWidth);
        bgRect.setAttribute('height', 16);
        bgRect.setAttribute('rx', 3);
        bgRect.classList.add('qd-edge-label-bg');

        edgeGroup.appendChild(bgRect);
        edgeGroup.appendChild(labelText);
      }
    }

    svg.appendChild(edgeGroup);

    const nodeGroup = document.createElementNS(SVG_NS, 'g');
    nodeGroup.classList.add('qd-nodes');

    for (const n of layout.nodes) {
      const g = document.createElementNS(SVG_NS, 'g');
      g.classList.add('qd-node');
      g.dataset.nodeId = n.id;
      g.setAttribute('transform', `translate(${n.x - n.width / 2}, ${n.y - n.height / 2})`);

      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('width', n.width);
      rect.setAttribute('height', n.height);
      rect.setAttribute('rx', 6);
      rect.classList.add('qd-node-rect');
      if (n.isStrong) rect.classList.add('is-strong');
      g.appendChild(rect);

      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', n.width / 2);
      text.setAttribute('y', n.height / 2);
      text.classList.add('qd-node-text');
      text.textContent = n.label;
      g.appendChild(text);

      if (n.description) {
        text.setAttribute('y', n.height / 2 - 6);
        const sub = document.createElementNS(SVG_NS, 'text');
        sub.setAttribute('x', n.width / 2);
        sub.setAttribute('y', n.height / 2 + 8);
        sub.classList.add('qd-node-text');
        sub.style.fontSize = '9px';
        sub.style.fill = 'var(--muted)';
        sub.textContent = n.description;
        g.appendChild(sub);
      }

      nodeGroup.appendChild(g);
    }

    svg.appendChild(nodeGroup);

    return svg;
  }

  function edgeEndpoints(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const angle = Math.atan2(dy, dx);

    const aHalfW = a.width / 2 + 4;
    const aHalfH = a.height / 2 + 4;
    const bHalfW = b.width / 2 + 4;
    const bHalfH = b.height / 2 + 4;

    const fromOffset = boundaryPoint(angle, aHalfW, aHalfH);
    const toOffset = boundaryPoint(angle + Math.PI, bHalfW, bHalfH);

    return {
      x1: a.x + fromOffset.x,
      y1: a.y + fromOffset.y,
      x2: b.x + toOffset.x,
      y2: b.y + toOffset.y,
    };
  }

  function boundaryPoint(angle, halfW, halfH) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const tx = dx === 0 ? Infinity : Math.abs(halfW / dx);
    const ty = dy === 0 ? Infinity : Math.abs(halfH / dy);
    const t = Math.min(tx, ty);
    return { x: dx * t, y: dy * t };
  }

  // ────────────────────────────────────────────────────────────────
  // Module 4: Hover Interactions
  // ────────────────────────────────────────────────────────────────
  function setupHover() {
    const svg = document.getElementById('qd-svg');

    svg.addEventListener('mouseover', (e) => {
      const nodeEl = e.target.closest('.qd-node');
      if (!nodeEl) return;

      const nodeId = nodeEl.dataset.nodeId;
      const connected = getConnectedNodes(nodeId);

      document.querySelectorAll('.qd-node-rect').forEach(r => {
        const ownerId = r.closest('.qd-node').dataset.nodeId;
        if (ownerId !== nodeId && !connected.has(ownerId)) {
          r.classList.add('is-dimmed');
        }
      });

      document.querySelectorAll('.qd-edge').forEach(ed => {
        if (ed.dataset.from !== nodeId && ed.dataset.to !== nodeId) {
          ed.classList.add('is-dimmed');
        }
      });
    });

    svg.addEventListener('mouseout', (e) => {
      if (!e.target.closest('.qd-node')) return;
      document.querySelectorAll('.qd-node-rect').forEach(r => r.classList.remove('is-dimmed'));
      document.querySelectorAll('.qd-edge').forEach(ed => ed.classList.remove('is-dimmed'));
    });
  }

  function getConnectedNodes(nodeId) {
    const set = new Set();
    for (const edge of currentGraph.edges) {
      if (edge.from === nodeId) set.add(edge.to);
      if (edge.to === nodeId) set.add(edge.from);
    }
    return set;
  }

  // ────────────────────────────────────────────────────────────────
  // Module 5: Export
  // ────────────────────────────────────────────────────────────────
  function exportSVG() {
    const svg = document.getElementById('qd-svg');
    const clone = svg.cloneNode(true);

    const cssVars = ['--bg', '--surface', '--text', '--muted', '--accent', '--border'];
    const style = getComputedStyle(document.documentElement);
    const inlineStyle = cssVars.map(v => `${v}: ${style.getPropertyValue(v).trim()};`).join(' ');

    clone.setAttribute('xmlns', SVG_NS);
    clone.style.cssText = inlineStyle;

    const styleEl = document.createElement('style');
    styleEl.textContent = getInlineStyles();
    clone.insertBefore(styleEl, clone.firstChild);

    return new XMLSerializer().serializeToString(clone);
  }

  function getInlineStyles() {
    return `
      .qd-node-rect { fill: ${getCSSVar('--surface')}; stroke: ${getCSSVar('--border')}; stroke-width: 1; }
      .qd-node-rect.is-strong { stroke: ${getCSSVar('--accent')}; stroke-width: 2; }
      .qd-node-text { fill: ${getCSSVar('--text')}; font-family: 'JetBrains Mono', monospace; font-size: 12px; text-anchor: middle; dominant-baseline: middle; }
      .qd-edge { stroke: ${getCSSVar('--muted')}; stroke-width: 1.5; fill: none; }
      .qd-edge.is-strong { stroke: ${getCSSVar('--accent')}; stroke-width: 2; }
      .qd-edge-label { fill: ${getCSSVar('--text')}; font-family: 'JetBrains Mono', monospace; font-size: 10px; text-anchor: middle; }
      .qd-edge-label-bg { fill: ${getCSSVar('--bg')}; }
    `;
  }

  function getCSSVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  async function copyAsSVG() {
    const svgString = exportSVG();
    try {
      await navigator.clipboard.writeText(svgString);
      showToast('SVG copied');
    } catch (e) {
      fallbackCopyText(svgString);
      showToast('SVG copied');
    }
  }

  function fallbackCopyText(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  function copyAsPNG() {
    const svgString = exportSVG();
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = 2;
      canvas.width = VIEWBOX.w * scale;
      canvas.height = VIEWBOX.h * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = getCSSVar('--bg');
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (pngBlob) => {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
          showToast('PNG copied');
        } catch (e) {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(pngBlob);
          link.download = 'diagram.png';
          link.click();
          showToast('PNG downloaded');
        }
        URL.revokeObjectURL(url);
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      showToast('PNG export failed');
    };
    img.src = url;
  }

  function shareURL() {
    const text = document.getElementById('qd-textarea').value;
    const encoded = encodeURIComponent(text);
    const url = `${window.location.origin}${window.location.pathname}#text=${encoded}`;
    navigator.clipboard.writeText(url).then(() => showToast('Share link copied'))
      .catch(() => { fallbackCopyText(url); showToast('Share link copied'); });
  }

  // ────────────────────────────────────────────────────────────────
  // Module 6: Boot & Event Loop
  // ────────────────────────────────────────────────────────────────
  function render() {
    const text = document.getElementById('qd-textarea').value;
    const graph = parseInput(text);
    currentGraph = graph;

    const emptyState = document.querySelector('.qd-empty-state');
    if (graph.nodes.length === 0) {
      emptyState.classList.remove('is-hidden');
      document.getElementById('qd-svg').innerHTML = '';
      return;
    }
    emptyState.classList.add('is-hidden');

    const hash = hashString(text);
    const layout = computeLayout(graph, hash);
    renderSVG(layout);
  }

  function debouncedRender() {
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 200);
  }

  function showToast(msg) {
    const toast = document.getElementById('qd-toast');
    toast.textContent = msg;
    toast.classList.add('is-visible');
    setTimeout(() => toast.classList.remove('is-visible'), 1800);
  }

  function init() {
    const textarea = document.getElementById('qd-textarea');

    if (window.location.hash.startsWith('#text=')) {
      try {
        const text = decodeURIComponent(window.location.hash.slice(6));
        textarea.value = text;
      } catch (e) {}
    }

    textarea.addEventListener('input', debouncedRender);
    document.getElementById('qd-copy-svg').addEventListener('click', copyAsSVG);
    document.getElementById('qd-copy-png').addEventListener('click', copyAsPNG);
    document.getElementById('qd-share').addEventListener('click', shareURL);

    setupHover();
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
