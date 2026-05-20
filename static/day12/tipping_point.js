/* The Tipping Point — Day 12
 * Schelling's segregation model. 100% client-side.
 */
(function () {
  'use strict';

  // ────────────────────────────────────────────────────────────────
  // Module 1: Configuration
  // ────────────────────────────────────────────────────────────────
  const CFG = {
    GRID_WIDTH: 40,
    GRID_HEIGHT: 40,
    DENSITY: 0.90,
    GROUP_A_RATIO: 0.5,
    AGENT_PADDING: 0.15,

    FAST_STEP_MS: 30,
    SLOW_STEP_MS: 250,
    MAX_ITERATIONS: 200,
    EQUILIBRIUM_PATIENCE: 3,
  };

  // ────────────────────────────────────────────────────────────────
  // Module 2: State
  // ────────────────────────────────────────────────────────────────
  const state = {
    grid: [],
    threshold: 0.30,
    speed: 'fast',
    running: false,
    iteration: 0,
    stableIterations: 0,
    totalAgents: 0,
    unhappy: 0,
    lastMoves: 0,
    stepTimer: null,
    canvasSize: 600,
  };

  const reducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let canvas = null;
  let ctx = null;

  // ────────────────────────────────────────────────────────────────
  // Module 3: Grid Initialization
  // ────────────────────────────────────────────────────────────────
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  }

  function initGrid() {
    const totalCells = CFG.GRID_WIDTH * CFG.GRID_HEIGHT;
    const populated = Math.floor(totalCells * CFG.DENSITY);
    const groupA = Math.floor(populated * CFG.GROUP_A_RATIO);
    const groupB = populated - groupA;

    const cells = [];
    for (let i = 0; i < groupA; i++) cells.push(0);
    for (let i = 0; i < groupB; i++) cells.push(1);
    for (let i = 0; i < totalCells - populated; i++) cells.push(null);

    shuffle(cells);

    state.grid = [];
    let idx = 0;
    for (let y = 0; y < CFG.GRID_HEIGHT; y++) {
      const row = [];
      for (let x = 0; x < CFG.GRID_WIDTH; x++) {
        row.push(cells[idx++]);
      }
      state.grid.push(row);
    }

    state.totalAgents = populated;
    state.iteration = 0;
    state.stableIterations = 0;
    state.lastMoves = 0;
    state.unhappy = 0;
  }

  // ────────────────────────────────────────────────────────────────
  // Module 4: Schelling Algorithm
  // ────────────────────────────────────────────────────────────────
  function isHappy(x, y) {
    const me = state.grid[y][x];
    if (me === null) return true;

    let sameCount = 0;
    let otherCount = 0;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= CFG.GRID_WIDTH || ny < 0 || ny >= CFG.GRID_HEIGHT) continue;
        const neighbor = state.grid[ny][nx];
        if (neighbor === null) continue;
        if (neighbor === me) sameCount++;
        else otherCount++;
      }
    }

    const totalNeighbors = sameCount + otherCount;
    if (totalNeighbors === 0) return true;
    return (sameCount / totalNeighbors) >= state.threshold;
  }

  function findEmptyCells() {
    const empties = [];
    for (let y = 0; y < CFG.GRID_HEIGHT; y++) {
      for (let x = 0; x < CFG.GRID_WIDTH; x++) {
        if (state.grid[y][x] === null) empties.push([x, y]);
      }
    }
    return empties;
  }

  function stepSimulation() {
    const unhappy = [];
    for (let y = 0; y < CFG.GRID_HEIGHT; y++) {
      for (let x = 0; x < CFG.GRID_WIDTH; x++) {
        if (state.grid[y][x] !== null && !isHappy(x, y)) {
          unhappy.push([x, y]);
        }
      }
    }

    state.unhappy = unhappy.length;

    if (unhappy.length === 0) {
      state.lastMoves = 0;
      return false;
    }

    shuffle(unhappy);
    let empties = findEmptyCells();
    shuffle(empties);

    let moves = 0;
    for (let k = 0; k < unhappy.length; k++) {
      if (empties.length === 0) break;
      const x = unhappy[k][0];
      const y = unhappy[k][1];

      const target = empties.pop();
      const ex = target[0];
      const ey = target[1];

      state.grid[ey][ex] = state.grid[y][x];
      state.grid[y][x] = null;

      empties.push([x, y]);
      shuffle(empties);

      moves++;
    }

    state.lastMoves = moves;
    state.iteration++;

    return moves > 0;
  }

  function isEquilibrium() {
    return state.lastMoves === 0 ||
           state.iteration >= CFG.MAX_ITERATIONS ||
           state.stableIterations >= CFG.EQUILIBRIUM_PATIENCE;
  }

  // ────────────────────────────────────────────────────────────────
  // Module 5: Render
  // ────────────────────────────────────────────────────────────────
  function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const size = Math.min(600, window.innerWidth - 32);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.canvasSize = size;
  }

  function render() {
    const size = state.canvasSize || 600;
    ctx.clearRect(0, 0, size, size);

    const cellWidth = size / CFG.GRID_WIDTH;
    const cellHeight = size / CFG.GRID_HEIGHT;
    const padding = Math.max(1, cellWidth * CFG.AGENT_PADDING);
    const radius = (cellWidth - padding * 2) / 2;

    for (let y = 0; y < CFG.GRID_HEIGHT; y++) {
      for (let x = 0; x < CFG.GRID_WIDTH; x++) {
        const cell = state.grid[y][x];
        const cx = x * cellWidth + cellWidth / 2;
        const cy = y * cellHeight + cellHeight / 2;

        if (cell === null) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
          ctx.lineWidth = 1;
          ctx.strokeRect(
            x * cellWidth + padding,
            y * cellHeight + padding,
            cellWidth - padding * 2,
            cellHeight - padding * 2
          );
        } else {
          ctx.fillStyle = cell === 0 ? '#D97757' : '#7BA7CC';
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(1, radius), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Module 6: Simulation Loop
  // ────────────────────────────────────────────────────────────────
  function runSimulationStep() {
    const didWork = stepSimulation();

    if (!didWork) {
      state.stableIterations++;
    } else {
      state.stableIterations = 0;
    }

    render();
    updateStatus();

    if (isEquilibrium()) {
      state.running = false;
      if (state.stepTimer) clearTimeout(state.stepTimer);
      state.stepTimer = null;
      onEquilibriumReached();
      return;
    }

    const delay = state.speed === 'fast' ? CFG.FAST_STEP_MS : CFG.SLOW_STEP_MS;
    state.stepTimer = setTimeout(runSimulationStep, delay);
  }

  function startSimulation() {
    if (state.running) return;
    state.running = true;
    hideAnnotation();
    document.getElementById('tp-start-btn').disabled = true;
    runSimulationStep();
  }

  function resetSimulation() {
    if (state.stepTimer) clearTimeout(state.stepTimer);
    state.stepTimer = null;
    state.running = false;

    initGrid();
    render();
    updateStatus();
    hideAnnotation();
    document.getElementById('tp-start-btn').disabled = false;
  }

  // ────────────────────────────────────────────────────────────────
  // Module 7: Equilibrium analysis + annotation
  // ────────────────────────────────────────────────────────────────
  function calculateSegregationIndex() {
    let highlySegregated = 0;

    for (let y = 0; y < CFG.GRID_HEIGHT; y++) {
      for (let x = 0; x < CFG.GRID_WIDTH; x++) {
        const cell = state.grid[y][x];
        if (cell === null) continue;

        let same = 0;
        let other = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= CFG.GRID_WIDTH || ny < 0 || ny >= CFG.GRID_HEIGHT) continue;
            const neighbor = state.grid[ny][nx];
            if (neighbor === null) continue;
            if (neighbor === cell) same++;
            else other++;
          }
        }

        const total = same + other;
        if (total > 0 && (same / total) >= 0.7) {
          highlySegregated++;
        }
      }
    }

    return Math.round((highlySegregated / state.totalAgents) * 100);
  }

  const ANNOTATIONS = {
    veryLow: {
      text: "Even with very mild preferences, the grid still self-organized into clusters. This is the heart of Schelling's insight: emergent segregation doesn't require prejudice. Tolerance levels we'd consider 'fine' can still produce patterns that look anything but.",
    },
    low: {
      text: "These results echo patterns researchers have observed in: school enrollment when families weakly prefer 'some' similarity, neighborhood evolution over decades, online communities forming filter bubbles from mild preferences for familiar content. Each individual decision is defensible. The collective pattern is striking.",
    },
    medium: {
      text: "At these threshold levels, segregation becomes near-total. Real-world systems with this intensity of in-group preference rarely emerge spontaneously — they require active enforcement (legal, economic, social). The model suggests how much preference is 'enough' to produce visible separation.",
    },
    high: {
      text: "When everyone demands an overwhelming majority of same-group neighbors, many agents can't find acceptable positions and the system never reaches stable equilibrium. The model is showing the limits of its own logic — and arguably, of any system built on these incentives.",
    },
  };

  function onEquilibriumReached() {
    document.getElementById('tp-start-btn').disabled = false;

    const thresholdPct = Math.round(state.threshold * 100);
    const segregation = calculateSegregationIndex();

    let annotation;
    if (thresholdPct <= 15) annotation = ANNOTATIONS.veryLow;
    else if (thresholdPct <= 40) annotation = ANNOTATIONS.low;
    else if (thresholdPct <= 70) annotation = ANNOTATIONS.medium;
    else annotation = ANNOTATIONS.high;

    showAnnotation(annotation.text, segregation);
  }

  function showAnnotation(text, segregationPct) {
    const annotation = document.getElementById('tp-annotation');
    annotation.querySelector('.tp-annotation-body').textContent = text;

    const marker = annotation.querySelector('.tp-meter-marker');
    marker.style.left = segregationPct + '%';

    annotation.querySelector('.tp-meter-numeric').textContent =
      segregationPct + '% in highly clustered neighborhoods';

    annotation.classList.add('is-visible');
  }

  function hideAnnotation() {
    document.getElementById('tp-annotation').classList.remove('is-visible');
  }

  // ────────────────────────────────────────────────────────────────
  // Module 8: UI Bindings & Status Updates
  // ────────────────────────────────────────────────────────────────
  function updateStatus() {
    const statusEl = document.getElementById('tp-status');
    if (state.iteration === 0 && !state.running) {
      statusEl.textContent = 'Click Start to begin';
    } else if (state.running) {
      statusEl.textContent = 'Iteration ' + state.iteration + ' · ' +
        state.unhappy + ' unhappy · ' + state.lastMoves + ' moved this step';
    } else {
      statusEl.textContent = 'Equilibrium reached after ' + state.iteration + ' iterations';
    }
  }

  function setupControls() {
    const thresholdSlider = document.getElementById('tp-threshold');
    const thresholdLabel = document.getElementById('tp-threshold-label');

    thresholdSlider.addEventListener('input', () => {
      state.threshold = parseInt(thresholdSlider.value, 10) / 100;
      thresholdLabel.innerHTML = 'Threshold: <strong>' + thresholdSlider.value + '%</strong>';
    });

    document.querySelectorAll('.tp-speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tp-speed-btn').forEach(b => { b.dataset.active = 'false'; });
        btn.dataset.active = 'true';
        state.speed = btn.dataset.speed;
      });
    });

    document.getElementById('tp-start-btn').addEventListener('click', startSimulation);
    document.getElementById('tp-reset-btn').addEventListener('click', resetSimulation);
  }

  function init() {
    canvas = document.getElementById('tp-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    setupCanvas();
    setupControls();
    initGrid();
    render();
    updateStatus();

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        setupCanvas();
        render();
      }, 120);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
