/* Snake — Day 8.
 * Interpolated cinematic Snake. Game logic on a fixed tick; visuals
 * interpolate every frame using (now - lastTickAt) / tickMs as the fraction.
 */
(function () {
  'use strict';

  // ===== Module 1: Configuration =====
  const CFG = {
    GRID_SIZE: 20,
    CANVAS_PADDING: 20,
    INITIAL_TICK_MS: 140,
    MIN_TICK_MS: 70,
    SPEED_UP_EVERY: 5,
    SPEED_UP_FACTOR: 0.92,

    PARTICLE_COUNT_EAT: 18,
    PARTICLE_COUNT_DEATH: 35,

    SCREEN_SHAKE_EAT_MS: 100,
    SCREEN_SHAKE_EAT_MAG: 2,
    SCREEN_SHAKE_DEATH_MS: 220,
    SCREEN_SHAKE_DEATH_MAG: 6,

    DEATH_HITSTOP_MS: 150,
    DEATH_FLASH_MS: 250,
    DEATH_FADE_SEGMENT_MS: 55,
    DEATH_OVERLAY_DELAY_MS: 1200,

    APPLE_PULSE_HZ: 1.6,

    AUDIO_MASTER_GAIN: 0.18,

    BODY_HEAD_RATIO: 0.92,
    BODY_TAIL_RATIO: 0.55,
  };

  const REDUCED_MOTION =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ===== Module 2: State =====
  const state = {
    machine: 'intro',
    snake: [],
    direction: { x: 1, y: 0 },
    queuedDirection: null,
    apple: { x: 10, y: 10 },
    applePrev: { x: 10, y: 10 },
    score: 0,
    tickMs: CFG.INITIAL_TICK_MS,
    lastTickAt: 0,
    growing: 0,
    particles: [],
    shake: { until: 0, mag: 0 },
    deathStartedAt: 0,
    deathSegmentFade: 0,
    canvasSize: 600,
    cellSize: 28,
    speedupFlashUntil: 0,
    audioEnabled: true,
    started: false,
  };

  // ===== Module 3: DOM refs =====
  const canvas = document.getElementById('snake-canvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('snake-score');
  const introOverlay = document.getElementById('snake-intro');
  const gameoverOverlay = document.getElementById('snake-gameover');
  const finalScoreEl = document.getElementById('snake-final-score');
  const finalMessageEl = document.getElementById('snake-final-message');
  const playAgainBtn = document.getElementById('snake-play-again');
  const soundToggle = document.getElementById('snake-sound-toggle');
  const controlHint = document.getElementById('snake-control-hint');

  // ===== Module 4: Canvas sizing =====
  function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const wrap = canvas.parentElement;
    const size = Math.min(600, wrap.clientWidth);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.canvasSize = size;
    state.cellSize = (size - CFG.CANVAS_PADDING * 2) / CFG.GRID_SIZE;
  }
  window.addEventListener('resize', setupCanvas);

  // ===== Module 5: Audio =====
  const audio = {
    ctx: null,
    masterGain: null,
    ensureContext() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = state.audioEnabled ? CFG.AUDIO_MASTER_GAIN : 0;
        this.masterGain.connect(this.ctx.destination);
      } catch (e) {
        console.warn('Audio unavailable:', e);
      }
    },
    setEnabled(on) {
      state.audioEnabled = on;
      if (this.masterGain) {
        this.masterGain.gain.value = on ? CFG.AUDIO_MASTER_GAIN : 0;
      }
    },
    playEat(score) {
      if (!this.ctx || !state.audioEnabled) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      const freq = Math.min(1200, 400 * Math.pow(1.06, Math.max(0, score - 1)));
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(freq * 1.4, t + 0.06);
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.6, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g).connect(this.masterGain);
      o.start(t);
      o.stop(t + 0.2);
    },
    playDeath() {
      if (!this.ctx || !state.audioEnabled) return;
      const t = this.ctx.currentTime;
      const o1 = this.ctx.createOscillator();
      const o2 = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o1.type = 'sine';
      o2.type = 'triangle';
      o1.frequency.setValueAtTime(170, t);
      o1.frequency.exponentialRampToValueAtTime(60, t + 0.55);
      o2.frequency.setValueAtTime(90, t);
      o2.frequency.exponentialRampToValueAtTime(40, t + 0.55);
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.9, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      o1.connect(g);
      o2.connect(g);
      g.connect(this.masterGain);
      o1.start(t); o2.start(t);
      o1.stop(t + 0.62); o2.stop(t + 0.62);
    },
    playStart() {
      if (!this.ctx || !state.audioEnabled) return;
      const t = this.ctx.currentTime;
      [0, 0.06].forEach((delay, i) => {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(440 + i * 220, t + delay);
        g.gain.setValueAtTime(0.001, t + delay);
        g.gain.exponentialRampToValueAtTime(0.5, t + delay + 0.005);
        g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.1);
        o.connect(g).connect(this.masterGain);
        o.start(t + delay);
        o.stop(t + delay + 0.12);
      });
    },
  };

  // ===== Module 6: Helpers =====
  function gridToPx(gx, gy) {
    return {
      x: CFG.CANVAS_PADDING + (gx + 0.5) * state.cellSize,
      y: CFG.CANVAS_PADDING + (gy + 0.5) * state.cellSize,
    };
  }

  function randomEmptyCell() {
    const occupied = new Set(state.snake.map(s => s.x + ',' + s.y));
    let tries = 0;
    while (tries++ < 500) {
      const x = Math.floor(Math.random() * CFG.GRID_SIZE);
      const y = Math.floor(Math.random() * CFG.GRID_SIZE);
      if (!occupied.has(x + ',' + y)) return { x, y };
    }
    for (let y = 0; y < CFG.GRID_SIZE; y++) {
      for (let x = 0; x < CFG.GRID_SIZE; x++) {
        if (!occupied.has(x + ',' + y)) return { x, y };
      }
    }
    return { x: 0, y: 0 };
  }

  function resetState() {
    const cx = Math.floor(CFG.GRID_SIZE / 2);
    const cy = Math.floor(CFG.GRID_SIZE / 2);
    state.snake = [
      { x: cx,     y: cy, prevX: cx - 1, prevY: cy },
      { x: cx - 1, y: cy, prevX: cx - 2, prevY: cy },
      { x: cx - 2, y: cy, prevX: cx - 3, prevY: cy },
    ];
    state.direction = { x: 1, y: 0 };
    state.queuedDirection = null;
    state.apple = randomEmptyCell();
    state.applePrev = { ...state.apple };
    state.score = 0;
    state.tickMs = CFG.INITIAL_TICK_MS;
    state.lastTickAt = performance.now();
    state.growing = 0;
    state.particles.length = 0;
    state.shake.until = 0;
    state.deathStartedAt = 0;
    state.deathSegmentFade = 0;
    updateScoreDisplay(false);
  }

  function updateScoreDisplay(pulse) {
    scoreEl.textContent = state.score;
    if (pulse && !REDUCED_MOTION) {
      scoreEl.classList.add('is-pulsing');
      setTimeout(() => scoreEl.classList.remove('is-pulsing'), 140);
    }
  }

  function triggerShake(magnitude, duration) {
    if (REDUCED_MOTION) return;
    state.shake.until = performance.now() + duration;
    state.shake.mag = magnitude;
  }

  function spawnParticles(gx, gy, count, kind) {
    if (REDUCED_MOTION) return;
    const p = gridToPx(gx, gy);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (kind === 'death' ? 90 : 55) + Math.random() * 60;
      state.particles.push({
        x: p.x,
        y: p.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: kind === 'death' ? 1000 : 600,
        age: 0,
        size: kind === 'death' ? 3 + Math.random() * 3 : 2 + Math.random() * 2,
        color: Math.random() < 0.5 ? '#D97757' : '#E8916F',
      });
    }
  }

  // ===== Module 7: Input =====
  const DIRS = {
    up:    { x: 0,  y: -1 },
    down:  { x: 0,  y: 1  },
    left:  { x: -1, y: 0  },
    right: { x: 1,  y: 0  },
  };

  function queueDirection(name) {
    const d = DIRS[name];
    if (!d) return;
    if (d.x === -state.direction.x && d.y === -state.direction.y) return;
    if (d.x === state.direction.x && d.y === state.direction.y) return;
    state.queuedDirection = d;
  }

  function onKeyDown(e) {
    const key = e.key;
    audio.ensureContext();

    if (state.machine === 'intro') {
      if (key === ' ' || key === 'Enter') {
        e.preventDefault();
        startGame();
        return;
      }
    }
    if (state.machine === 'gameover') {
      if (key === ' ' || key === 'Enter') {
        e.preventDefault();
        startGame();
        return;
      }
    }
    if (state.machine !== 'playing' && state.machine !== 'paused') return;

    if (key === ' ' || key === 'Escape') {
      e.preventDefault();
      togglePause();
      return;
    }
    if (key === 'm' || key === 'M') {
      e.preventDefault();
      toggleMute();
      return;
    }
    if (state.machine !== 'playing') return;

    if (key === 'ArrowUp' || key === 'w' || key === 'W')    { e.preventDefault(); queueDirection('up'); }
    else if (key === 'ArrowDown' || key === 's' || key === 'S')  { e.preventDefault(); queueDirection('down'); }
    else if (key === 'ArrowLeft' || key === 'a' || key === 'A')  { e.preventDefault(); queueDirection('left'); }
    else if (key === 'ArrowRight' || key === 'd' || key === 'D') { e.preventDefault(); queueDirection('right'); }
  }
  document.addEventListener('keydown', onKeyDown);

  let touchStart = null;
  canvas.addEventListener('touchstart', (e) => {
    audio.ensureContext();
    if (e.touches.length !== 1) return;
    e.preventDefault();
    touchStart = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      t: performance.now(),
    };
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    if (touchStart) e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    if (!touchStart) return;
    e.preventDefault();
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    touchStart = null;

    if (absX < 24 && absY < 24) {
      if (state.machine === 'intro') { startGame(); }
      else if (state.machine === 'gameover') { startGame(); }
      else if (state.machine === 'playing' || state.machine === 'paused') { togglePause(); }
      return;
    }
    if (state.machine !== 'playing') return;
    if (absX > absY) queueDirection(dx > 0 ? 'right' : 'left');
    else             queueDirection(dy > 0 ? 'down'  : 'up');
  }, { passive: false });

  canvas.addEventListener('click', () => {
    audio.ensureContext();
    if (state.machine === 'intro') startGame();
    else if (state.machine === 'gameover') startGame();
  });

  soundToggle.addEventListener('click', () => {
    audio.ensureContext();
    toggleMute();
  });

  playAgainBtn.addEventListener('click', () => {
    audio.ensureContext();
    startGame();
  });

  function toggleMute() {
    const newOn = !state.audioEnabled;
    audio.setEnabled(newOn);
    soundToggle.textContent = newOn ? '🔊' : '🔇';
    soundToggle.setAttribute('aria-label', newOn ? 'Mute sound' : 'Unmute sound');
    soundToggle.dataset.muted = newOn ? 'false' : 'true';
  }

  function togglePause() {
    if (state.machine === 'playing') {
      state.machine = 'paused';
    } else if (state.machine === 'paused') {
      state.machine = 'playing';
      state.lastTickAt = performance.now();
    }
  }

  // ===== Module 8: Game tick =====
  function gameTick() {
    if (state.queuedDirection) {
      state.direction = state.queuedDirection;
      state.queuedDirection = null;
    }

    for (const seg of state.snake) {
      seg.prevX = seg.x;
      seg.prevY = seg.y;
    }
    state.applePrev = { ...state.apple };

    const head = state.snake[0];
    const nx = head.x + state.direction.x;
    const ny = head.y + state.direction.y;

    if (nx < 0 || nx >= CFG.GRID_SIZE || ny < 0 || ny >= CFG.GRID_SIZE) {
      onDeath(head.x, head.y);
      return;
    }
    const willGrow = state.growing > 0;
    const endIdx = willGrow ? state.snake.length : state.snake.length - 1;
    for (let i = 0; i < endIdx; i++) {
      if (state.snake[i].x === nx && state.snake[i].y === ny) {
        onDeath(nx, ny);
        return;
      }
    }

    state.snake.unshift({ x: nx, y: ny, prevX: head.x, prevY: head.y });

    if (nx === state.apple.x && ny === state.apple.y) {
      state.score += 1;
      state.growing += 1;
      updateScoreDisplay(true);
      audio.playEat(state.score);
      spawnParticles(state.apple.x, state.apple.y, CFG.PARTICLE_COUNT_EAT, 'eat');
      triggerShake(CFG.SCREEN_SHAKE_EAT_MAG, CFG.SCREEN_SHAKE_EAT_MS);
      state.apple = randomEmptyCell();
      state.applePrev = { ...state.apple };
      maybeSpeedUp();
    }

    if (state.growing > 0) {
      state.growing -= 1;
    } else {
      state.snake.pop();
    }
  }

  function maybeSpeedUp() {
    if (state.score > 0 && state.score % CFG.SPEED_UP_EVERY === 0) {
      state.tickMs = Math.max(CFG.MIN_TICK_MS, state.tickMs * CFG.SPEED_UP_FACTOR);
      state.speedupFlashUntil = performance.now() + 220;
      canvas.classList.add('speedup-flash');
      setTimeout(() => canvas.classList.remove('speedup-flash'), 220);
    }
  }

  function onDeath(gx, gy) {
    state.machine = 'dying';
    state.deathStartedAt = performance.now();
    state.deathSegmentFade = 0;
    audio.playDeath();
    triggerShake(CFG.SCREEN_SHAKE_DEATH_MAG, CFG.SCREEN_SHAKE_DEATH_MS);
    spawnParticles(gx, gy, CFG.PARTICLE_COUNT_DEATH, 'death');
    setTimeout(showGameover, CFG.DEATH_OVERLAY_DELAY_MS);
  }

  function showGameover() {
    state.machine = 'gameover';
    finalScoreEl.textContent = state.score;
    finalMessageEl.textContent = scoreMessage(state.score);
    gameoverOverlay.classList.remove('is-hidden');
    setTimeout(() => playAgainBtn.focus(), 50);
  }

  function scoreMessage(s) {
    if (s === 0) return "Couldn't even land one. Try again.";
    if (s < 5)   return "An honest start.";
    if (s < 10)  return "Getting the feel of it.";
    if (s < 20)  return "Solid run.";
    if (s < 35)  return "You've internalized the rhythm.";
    return "Cinematic.";
  }

  // ===== Module 9: Rendering =====
  function startGame() {
    resetState();
    introOverlay.classList.add('is-hidden');
    gameoverOverlay.classList.add('is-hidden');
    state.machine = 'playing';
    state.started = true;
    audio.ensureContext();
    audio.playStart();
  }

  function render(now) {
    if (state.machine === 'playing') {
      while (now - state.lastTickAt >= state.tickMs) {
        gameTick();
        state.lastTickAt += state.tickMs;
        if (state.machine !== 'playing') break;
      }
    }

    if (state.particles.length) {
      const dt = 1 / 60;
      for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.age += 16.67;
        if (p.age >= p.life) {
          state.particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.94;
        p.vy *= 0.94;
      }
    }

    let t = 0;
    if (state.machine === 'playing') {
      t = Math.min(1, (now - state.lastTickAt) / state.tickMs);
    } else if (state.machine === 'paused') {
      t = 1;
    } else if (state.machine === 'dying' || state.machine === 'gameover') {
      t = 1;
      if (state.machine === 'dying') {
        const elapsed = now - state.deathStartedAt - CFG.DEATH_HITSTOP_MS;
        if (elapsed > 0) {
          state.deathSegmentFade = Math.floor(elapsed / CFG.DEATH_FADE_SEGMENT_MS);
        }
      }
    }

    drawFrame(now, t);
    requestAnimationFrame(render);
  }

  function drawFrame(now, t) {
    const size = state.canvasSize;
    ctx.clearRect(0, 0, size, size);

    let shakeX = 0, shakeY = 0;
    if (now < state.shake.until && !REDUCED_MOTION) {
      const remaining = (state.shake.until - now) / CFG.SCREEN_SHAKE_DEATH_MS;
      const mag = state.shake.mag * remaining;
      shakeX = (Math.random() * 2 - 1) * mag;
      shakeY = (Math.random() * 2 - 1) * mag;
    }
    ctx.save();
    ctx.translate(shakeX, shakeY);

    drawSubtleGrid();

    if (state.machine !== 'dying' && state.machine !== 'gameover' && state.machine !== 'intro') {
      drawApple(now);
    } else if (state.machine === 'dying') {
      const dyingFor = now - state.deathStartedAt;
      if (dyingFor < CFG.DEATH_OVERLAY_DELAY_MS - 400) drawApple(now);
    }

    if (state.started || state.machine === 'dying' || state.machine === 'gameover') {
      drawSnake(now, t);
    }

    drawParticles();

    if (state.machine === 'dying') {
      const elapsed = now - state.deathStartedAt;
      if (elapsed < CFG.DEATH_FLASH_MS) {
        const alpha = (1 - elapsed / CFG.DEATH_FLASH_MS) * 0.6;
        ctx.fillStyle = 'rgba(255, 107, 71, ' + alpha + ')';
        ctx.fillRect(0, 0, size, size);
      }
    }

    ctx.restore();

    if (state.machine === 'paused') {
      ctx.save();
      ctx.fillStyle = 'rgba(15, 15, 14, 0.55)';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#FAFAF7';
      ctx.font = '600 28px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Paused', size / 2, size / 2);
      ctx.font = '14px Inter, sans-serif';
      ctx.fillStyle = '#A8A29E';
      ctx.fillText('Press Space or tap to resume', size / 2, size / 2 + 28);
      ctx.restore();
    }
  }

  function drawSubtleGrid() {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
    ctx.lineWidth = 1;
    const cs = state.cellSize;
    const startX = CFG.CANVAS_PADDING;
    const startY = CFG.CANVAS_PADDING;
    for (let i = 0; i <= CFG.GRID_SIZE; i += 5) {
      ctx.beginPath();
      ctx.moveTo(startX + i * cs, startY);
      ctx.lineTo(startX + i * cs, startY + CFG.GRID_SIZE * cs);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(startX, startY + i * cs);
      ctx.lineTo(startX + CFG.GRID_SIZE * cs, startY + i * cs);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawApple(now) {
    const p = gridToPx(state.apple.x, state.apple.y);
    const t = now / 1000;
    const pulse = Math.sin(t * CFG.APPLE_PULSE_HZ * Math.PI * 2);
    const base = state.cellSize * 0.32;
    const r = base + pulse * (REDUCED_MOTION ? 0 : 2.2);

    ctx.save();
    const haloR = r * 2.6;
    const grad = ctx.createRadialGradient(p.x, p.y, r * 0.5, p.x, p.y, haloR);
    grad.addColorStop(0, 'rgba(217, 119, 87, 0.55)');
    grad.addColorStop(1, 'rgba(217, 119, 87, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, haloR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#D97757';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FAFAF7';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSnake(now, t) {
    if (state.snake.length === 0) return;
    const cs = state.cellSize;
    const n = state.snake.length;

    const centers = state.snake.map((seg, i) => {
      const lerpT = (state.machine === 'dying' || state.machine === 'gameover') ? 1 : t;
      const ix = seg.prevX + (seg.x - seg.prevX) * lerpT;
      const iy = seg.prevY + (seg.y - seg.prevY) * lerpT;
      return gridToPx(ix, iy);
    });

    ctx.save();
    ctx.shadowColor = 'rgba(217, 119, 87, 0.45)';
    ctx.shadowBlur = 10;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const visibleCount = state.machine === 'dying'
      ? Math.max(0, n - state.deathSegmentFade)
      : n;

    if (visibleCount >= 2) {
      ctx.beginPath();
      ctx.moveTo(centers[0].x, centers[0].y);
      for (let i = 1; i < visibleCount; i++) {
        ctx.lineTo(centers[i].x, centers[i].y);
      }
      ctx.strokeStyle = '#D97757';
      ctx.lineWidth = cs * (CFG.BODY_HEAD_RATIO * 0.85);
      ctx.stroke();
    }

    for (let i = 0; i < visibleCount; i++) {
      const frac = i / Math.max(1, n - 1);
      const ratio = CFG.BODY_HEAD_RATIO + (CFG.BODY_TAIL_RATIO - CFG.BODY_HEAD_RATIO) * frac;
      const radius = (cs * ratio) / 2;
      const color = mixColor('#D97757', '#E8916F', frac);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(centers[i].x, centers[i].y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    if (visibleCount > 0) {
      const h = centers[0];
      const hr = (cs * CFG.BODY_HEAD_RATIO) / 2;
      const dx = state.direction.x;
      const dy = state.direction.y;
      ctx.fillStyle = '#FAFAF7';
      ctx.beginPath();
      ctx.arc(h.x + dx * hr * 0.35, h.y + dy * hr * 0.35, hr * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles() {
    if (!state.particles.length) return;
    ctx.save();
    for (const p of state.particles) {
      const lifeFrac = 1 - p.age / p.life;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, lifeFrac);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * lifeFrac, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function mixColor(c1, c2, t) {
    const a = hexToRgb(c1);
    const b = hexToRgb(c2);
    const r = Math.round(a.r + (b.r - a.r) * t);
    const g = Math.round(a.g + (b.g - a.g) * t);
    const bl = Math.round(a.b + (b.b - a.b) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }
  function hexToRgb(h) {
    return {
      r: parseInt(h.slice(1, 3), 16),
      g: parseInt(h.slice(3, 5), 16),
      b: parseInt(h.slice(5, 7), 16),
    };
  }

  // ===== Module 10: Init =====
  function setupControlHint() {
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (controlHint) {
      controlHint.innerHTML = isTouch
        ? 'Swipe to change direction · Tap to start or pause'
        : '<kbd>↑↓←→</kbd> or <kbd>WASD</kbd> to move · <kbd>Space</kbd> to pause · <kbd>M</kbd> to mute';
    }
  }

  function init() {
    setupCanvas();
    setupControlHint();
    updateScoreDisplay(false);
    resetState();
    state.started = false;
    state.machine = 'intro';
    requestAnimationFrame(render);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
