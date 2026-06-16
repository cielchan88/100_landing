/* Type Speed Mirror — Day 15 */
(function () {
  'use strict';

  // ===== Constants =====
  const PASSAGES = [
    {
      id: 'rain',
      label: 'Narrative',
      text: "The rain came in the morning, slow at first, then loud enough that we couldn't hear each other from across the room. We made tea and watched it through the window. By noon the street was empty and the world felt like a place that had been waiting for permission to slow down."
    },
    {
      id: 'philosophy',
      label: 'Abstract',
      text: "Consciousness presupposes that something is appearing to something, which presupposes a difference between the thing that appears and the thing receiving the appearance. Resolving that asymmetry, philosophically, has occupied a great many people for a long time without producing what could be called a settled answer."
    },
    {
      id: 'list',
      label: 'Context switching',
      text: "A blue tarp. The smell of pine. The number 47. A song you can't quite name. Your grandmother's accent. The way light falls through a kitchen window in winter. The taste of a metal spoon. A door closing softly. Your own handwriting from twenty years ago. The sound of distant traffic."
    },
    {
      id: 'punctuation',
      label: 'Punctuation',
      text: "She said — and this is the part I remember best — that the difference between a good story and a great one is, simply, the willingness to leave things out. Most writers add. The best subtract. You finish what you don't say; the reader finishes what you do."
    },
    {
      id: 'poem',
      label: 'Lyrical',
      text: "The light leaves quickly in November. By four it is dim, by five it is gone. The trees lose their last leaves and stand bare against a sky that has nothing left to offer. We turn inward. We make small lights. We tell each other stories until the world thaws."
    },
  ];

  // ===== State =====
  const state = {
    passageIdx: 0,
    currentIdx: 0,
    started: false,
    completed: false,
    startTime: null,
    keyTimes: [],
    errors: 0,
    chart: null,
  };

  // ===== DOM refs =====
  const dom = {
    passageContainer: null,
    passage: null,
    status: null,
    progressFill: null,
    input: null,
    chartCanvas: null,
    stats: null,
    chips: null,
  };

  // ===== Passage rendering =====
  function renderPassage() {
    const passage = PASSAGES[state.passageIdx];
    const chars = passage.text.split('');

    dom.passage.innerHTML = chars.map((c, i) => {
      // Render real spaces so the passage can wrap (CSS uses pre-wrap to
      // preserve them); spaces remain their own spans so they can be the
      // is-current / is-done highlighted character.
      const displayChar = (c === ' ') ? ' ' : escapeHTML(c);
      let cls = 'char';
      if (i < state.currentIdx) cls += ' is-done';
      else if (i === state.currentIdx && state.started && !state.completed) cls += ' is-current';
      return `<span class="${cls}" data-idx="${i}">${displayChar}</span>`;
    }).join('');

    // Keep the line the user is typing visible inside the (capped + scrolling)
    // passage box. block:'nearest' avoids janking the surrounding page.
    if (state.started && !state.completed) {
      const currentEl = dom.passage.querySelector('.is-current');
      if (currentEl && currentEl.scrollIntoView) {
        currentEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }

    updateStatus();
  }

  function updateStatus() {
    const passage = PASSAGES[state.passageIdx];
    const total = passage.text.length;
    const pct = total > 0 ? (state.currentIdx / total) * 100 : 0;
    dom.status.querySelector('.tsm-progress-label').textContent = `${state.currentIdx} / ${total} characters`;
    dom.progressFill.style.width = `${pct}%`;
  }

  // ===== Input handling =====
  // Architecture: characters are captured via the input element's `input`
  // event, which fires reliably on BOTH desktop hardware keyboards AND
  // mobile on-screen keyboards (where `keydown` is unreliable — many
  // virtual keyboards send only `e.key === 'Unidentified'` to keydown or
  // skip it entirely, but they all dispatch `input` with the character).
  // The keydown listener stays only to swallow Tab so it can't jump focus
  // away during a test and to keep Space from scrolling the page.
  function processChar(typed) {
    if (!state.started || state.completed) return;
    if (typeof typed !== 'string' || typed.length !== 1) return;

    const passage = PASSAGES[state.passageIdx];
    const expected = passage.text[state.currentIdx];

    if (typed === expected) {
      state.keyTimes.push(performance.now());
      state.currentIdx++;
      renderPassage();
      updateChart();
      if (state.currentIdx >= passage.text.length) completeSession();
    } else {
      const charEl = dom.passage.querySelector(`[data-idx="${state.currentIdx}"]`);
      if (charEl) {
        charEl.classList.add('is-error');
        setTimeout(() => charEl.classList.remove('is-error'), 200);
      }
      state.errors++;
    }
  }

  // Keydown is only for swallowing keys that would steal focus or scroll
  // the page mid-test. Character processing happens in the input event.
  function handleKey(e) {
    if (!state.started || state.completed) return;
    if (e.key === 'Tab') { e.preventDefault(); dom.input.focus(); return; }
    if (e.key === ' ' && document.activeElement !== dom.input) { e.preventDefault(); }
  }

  // The input event handler: e.data carries the inserted character (or
  // multiple characters, for paste / IME composition / fast autocorrect).
  // We process them in order and then clear the input so it doesn't grow.
  function handleInput(e) {
    // Auto-start the session on the user's first keystroke. The Start
    // button is still there for explicit use, but with the input visible
    // most people will just click it and start typing — let that work.
    if (!state.started && !state.completed) startSession();
    if (!state.started || state.completed) {
      dom.input.value = '';
      return;
    }
    const data = e.data;
    if (data && data.length) {
      for (let i = 0; i < data.length; i++) processChar(data.charAt(i));
    }
    dom.input.value = '';
  }

  // ===== Chart =====
  function initChart() {
    const ctx = dom.chartCanvas.getContext('2d');
    const cs = getComputedStyle(document.documentElement);
    const accentColor = cs.getPropertyValue('--accent').trim();
    const mutedColor = cs.getPropertyValue('--muted').trim();
    const borderColor = cs.getPropertyValue('--border').trim();

    state.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'chars/sec',
          data: [],
          borderColor: accentColor,
          backgroundColor: accentColor + '20',
          tension: 0.3,
          fill: true,
          pointRadius: 0,
          borderWidth: 2,
        }]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
        scales: {
          x: {
            title: { display: true, text: 'time (s)', color: mutedColor, font: { size: 10 } },
            grid: { color: borderColor + '30' },
            ticks: { color: mutedColor, font: { size: 10 } },
          },
          y: {
            title: { display: true, text: 'chars/sec', color: mutedColor, font: { size: 10 } },
            grid: { color: borderColor + '30' },
            ticks: { color: mutedColor, font: { size: 10 } },
            beginAtZero: true,
            suggestedMax: 10,
          }
        }
      }
    });
  }

  function computePaces(times) {
    const SMOOTH_WINDOW = 5;
    const labels = [];
    const paces = [];
    for (let i = 1; i < times.length; i++) {
      const elapsed = (times[i] - state.startTime) / 1000;
      const startIdx = Math.max(0, i - SMOOTH_WINDOW);
      const charsInWindow = i - startIdx;
      const timeInWindow = (times[i] - times[startIdx]) / 1000;
      const pace = timeInWindow > 0 ? charsInWindow / timeInWindow : 0;
      labels.push(elapsed.toFixed(1));
      paces.push(pace);
    }
    return { labels, paces };
  }

  function updateChart() {
    if (!state.chart) return;     // chart-less mode (Chart.js failed to load)
    if (state.keyTimes.length < 2) return;
    const { labels, paces } = computePaces(state.keyTimes);
    state.chart.data.labels = labels;
    state.chart.data.datasets[0].data = paces;
    state.chart.update('none');
  }

  // ===== Session lifecycle =====
  function startSession() {
    state.started = true;
    state.completed = false;
    state.currentIdx = 0;
    state.keyTimes = [];
    state.errors = 0;
    state.startTime = performance.now();
    // Clear any pre-Start text so the first real character is processed
    // cleanly rather than as a multi-char paste.
    if (dom.input) dom.input.value = '';

    renderPassage();
    if (state.chart) {
      state.chart.data.labels = [];
      state.chart.data.datasets[0].data = [];
      state.chart.update('none');
    }

    dom.stats.classList.remove('is-visible');
    document.getElementById('tsm-start-btn').textContent = 'Stop';

    dom.chips.forEach(chip => { chip.disabled = true; });

    dom.input.focus();
  }

  function stopSession() {
    state.started = false;
    state.completed = true;

    if (state.keyTimes.length >= 2) {
      computeAndShowStats();
    }

    dom.chips.forEach(chip => { chip.disabled = false; });
    document.getElementById('tsm-start-btn').textContent = 'Start';
    renderPassage();
  }

  function completeSession() {
    state.started = false;
    state.completed = true;

    computeAndShowStats();

    dom.chips.forEach(chip => { chip.disabled = false; });
    document.getElementById('tsm-start-btn').textContent = 'Try another passage';
    renderPassage();
  }

  // ===== Stats computation =====
  function computeAndShowStats() {
    const times = state.keyTimes;
    if (times.length < 2) return;

    const totalTime = (times[times.length - 1] - times[0]) / 1000;
    const totalChars = times.length;
    const avgPace = totalTime > 0 ? totalChars / totalTime : 0;

    const SMOOTH_WINDOW = 5;
    const paces = [];
    for (let i = 1; i < times.length; i++) {
      const startIdx = Math.max(0, i - SMOOTH_WINDOW);
      const charsInWindow = i - startIdx;
      const timeInWindow = (times[i] - times[startIdx]) / 1000;
      paces.push(timeInWindow > 0 ? charsInWindow / timeInWindow : 0);
    }

    const tolerance = 0.3;
    const consistent = paces.filter(p => p >= avgPace * (1 - tolerance) && p <= avgPace * (1 + tolerance)).length;
    const consistency = paces.length > 0 ? (consistent / paces.length) * 100 : 0;

    let longestPause = 0;
    let longestPauseIdx = -1;
    for (let i = 1; i < times.length; i++) {
      const gap = (times[i] - times[i - 1]) / 1000;
      if (gap > longestPause) {
        longestPause = gap;
        longestPauseIdx = i;
      }
    }

    let fastestStreak = 0;
    let fastestStreakStart = -1;
    let currentStreak = 0;
    let currentStart = -1;

    for (let i = 0; i < paces.length; i++) {
      if (paces[i] > avgPace * 1.5) {
        if (currentStreak === 0) currentStart = i;
        currentStreak++;
        if (currentStreak >= 4 && currentStreak > fastestStreak) {
          fastestStreak = currentStreak;
          fastestStreakStart = currentStart;
        }
      } else {
        currentStreak = 0;
      }
    }

    document.getElementById('tsm-consistency-value').textContent = `${consistency.toFixed(0)}%`;
    document.getElementById('tsm-total-time').textContent = `${totalTime.toFixed(1)}s`;
    document.getElementById('tsm-avg-pace').textContent = `${avgPace.toFixed(1)}`;
    document.getElementById('tsm-longest-pause').textContent = `${longestPause.toFixed(1)}s`;
    document.getElementById('tsm-fastest-streak').textContent = fastestStreak > 0 ? `${fastestStreak} chars` : '—';

    const moments = generateMoments({
      passage: PASSAGES[state.passageIdx].text,
      times,
      avgPace,
      longestPause,
      longestPauseIdx,
      fastestStreak,
      fastestStreakStart,
    });

    const momentsHtml = moments.map(m => `<div class="tsm-moment">${m}</div>`).join('');
    document.getElementById('tsm-moments-list').innerHTML = momentsHtml;

    dom.stats.classList.add('is-visible');
  }

  function generateMoments(data) {
    const moments = [];
    const { passage, times, avgPace, longestPause, longestPauseIdx, fastestStreak, fastestStreakStart } = data;

    if (longestPause > 0.7 && longestPauseIdx > 0) {
      const charsBefore = passage.slice(0, longestPauseIdx);
      const words = charsBefore.split(/\s+/).filter(w => w);
      const wordBefore = words[words.length - 1] || '';
      moments.push(`You paused for <em>${longestPause.toFixed(1)}s</em> after typing "${escapeHTML(wordBefore)}".`);
    }

    if (fastestStreak >= 4 && fastestStreakStart >= 0) {
      const endIdx = Math.min(fastestStreakStart + fastestStreak, passage.length);
      const phrase = passage.slice(fastestStreakStart, endIdx).trim();
      const endTimeIdx = Math.min(fastestStreakStart + fastestStreak, times.length - 1);
      const streakTime = (times[endTimeIdx] - times[fastestStreakStart]) / 1000;
      const streakPace = streakTime > 0 ? fastestStreak / streakTime : 0;
      if (phrase) {
        moments.push(`Your fastest run was <em>${fastestStreak} characters</em> during "${escapeHTML(phrase)}", averaging <em>${streakPace.toFixed(1)} chars/sec</em>.`);
      }
    }

    moments.push(`Average pace: <em>${avgPace.toFixed(1)} chars/sec</em> over <em>${times.length} characters</em>.`);

    return moments.slice(0, 3);
  }

  // ===== Helpers =====
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ===== Setup =====
  function setupChips() {
    dom.chips.forEach(chip => {
      chip.addEventListener('click', () => {
        if (state.started) return;
        const idx = parseInt(chip.dataset.idx, 10);
        state.passageIdx = idx;
        dom.chips.forEach(c => { c.dataset.active = 'false'; });
        chip.dataset.active = 'true';
        state.currentIdx = 0;
        state.completed = false;
        state.keyTimes = [];
        dom.stats.classList.remove('is-visible');
        document.getElementById('tsm-start-btn').textContent = 'Start';
        renderPassage();
      });
    });
  }

  function setupActions() {
    document.getElementById('tsm-start-btn').addEventListener('click', () => {
      if (state.started) {
        stopSession();
      } else if (state.completed) {
        const otherIndices = PASSAGES.map((_, i) => i).filter(i => i !== state.passageIdx);
        const newIdx = otherIndices[Math.floor(Math.random() * otherIndices.length)];
        state.passageIdx = newIdx;
        dom.chips.forEach(c => { c.dataset.active = (parseInt(c.dataset.idx, 10) === newIdx) ? 'true' : 'false'; });
        startSession();
      } else {
        startSession();
      }
    });

    document.getElementById('tsm-reset-btn').addEventListener('click', () => {
      state.started = false;
      state.completed = false;
      state.currentIdx = 0;
      state.keyTimes = [];
      dom.chips.forEach(chip => { chip.disabled = false; });
      document.getElementById('tsm-start-btn').textContent = 'Start';
      dom.stats.classList.remove('is-visible');
      renderPassage();
      if (state.chart) {
        state.chart.data.labels = [];
        state.chart.data.datasets[0].data = [];
        state.chart.update('none');
      }
    });
  }

  // ===== Boot =====
  function init() {
    dom.passageContainer = document.querySelector('.tsm-passage-container');
    dom.passage = document.querySelector('.tsm-passage');
    dom.status = document.querySelector('.tsm-status');
    dom.progressFill = document.querySelector('.tsm-progress-fill');
    dom.input = document.getElementById('tsm-input');
    dom.chartCanvas = document.getElementById('tsm-chart');
    dom.stats = document.querySelector('.tsm-stats');

    const chipsContainer = document.querySelector('.tsm-passage-selector');
    chipsContainer.innerHTML = PASSAGES.map((p, i) =>
      `<button class="tsm-passage-chip" type="button" data-idx="${i}" data-active="${i === 0 ? 'true' : 'false'}">${escapeHTML(p.label)}</button>`
    ).join('');
    dom.chips = document.querySelectorAll('.tsm-passage-chip');

    // Wire input capture FIRST, before anything that could throw. The chart
    // depends on a CDN load that can be blocked by adblockers / flaky
    // networks; if Chart.js isn't there, initChart() throws and (before this
    // re-order) the input event listener was never attached, so the page
    // looked fine but typing did nothing. Listeners go on first; the chart
    // is wrapped in try/catch and treated as a nice-to-have.
    dom.input.addEventListener('input', handleInput);
    document.addEventListener('keydown', handleKey);

    // Defensive re-focus: a click anywhere in the passage area pulls focus
    // back to the input. (No pointerdown + preventDefault — that suppresses
    // the synthesized click that delivers focus on some browsers.)
    dom.passageContainer.addEventListener('click', () => dom.input.focus());

    // Re-acquire focus if it's lost mid-test (an accidental tap-away
    // shouldn't kill the input stream). Only fights the user while a test
    // is active.
    dom.input.addEventListener('blur', () => {
      if (state.started && !state.completed) {
        setTimeout(() => dom.input.focus(), 0);
      }
    });

    // Focus hint (the legacy passage-container ::after; the new visible
    // input is its own affordance and the CSS hides this, but the class
    // toggle is kept for backwards-compat).
    const updateFocusHint = () => {
      const focused = document.activeElement === dom.input;
      dom.passageContainer.classList.toggle('is-focused', focused);
      dom.passageContainer.classList.toggle('is-blurred', !focused);
    };
    dom.input.addEventListener('focus', updateFocusHint);
    dom.input.addEventListener('blur', updateFocusHint);
    updateFocusHint();

    setupChips();
    setupActions();
    // Chart is a nice-to-have visual; if Chart.js failed to load (adblock,
    // CDN flake), the typing engine still works.
    try { initChart(); }
    catch (e) {
      console.warn('Type Speed Mirror: chart unavailable —', e && e.message);
    }
    renderPassage();

    // The input event is the primary character source (works on both
    // desktop hardware keyboards AND mobile on-screen keyboards). The
    // document keydown is only for swallowing Tab / scroll-on-Space.
    dom.input.addEventListener('input', handleInput);
    document.addEventListener('keydown', handleKey);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
