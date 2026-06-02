/* Riba & Risk — Day 22.
 * Comparative monetary-system simulation + Gemini narrative.
 * Pure client-side math, deterministic.
 */
(function () {
  'use strict';

  // ===== Module 1: Parameters =====
  const PARAMS = {
    T: 20,
    shockPeriod: 3,
    rho_y: 0.7, rho_pi: 0.6, kappa: 0.3,
    pi_target: 2, r_neutral: 4, ror_base: 4,
    beta_r: 0.4, delta_debt: 1.5, debt_init: 80,
    beta_ror: 0.4, gamma: 0.5, pls_strength: 0.6,
    finAmpC: 0.04,    // financial-crisis debt amplification on conventional output
    decayRate: 0.6,   // shock decays each period after impact
  };

  const COLOR_C = '#7BA7CC';
  const COLOR_I = '#D97757';

  const SHOCK_LABELS = {
    demand: 'Demand shock',
    supply: 'Supply / oil shock',
    financial: 'Financial crisis',
  };

  // ===== Module 2: Simulation =====
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function shockProfile(shockType, severity, T, shockPeriod, decayRate) {
    // Returns arrays shock_y[t], shock_pi[t] for t = 0..T-1.
    const scale = severity / 5;
    const shock_y = new Array(T).fill(0);
    const shock_pi = new Array(T).fill(0);

    let base_y = 0, base_pi = 0;
    if (shockType === 'demand') { base_y = -1.5 * scale; base_pi = -0.3 * scale; }
    else if (shockType === 'supply') { base_y = -0.5 * scale; base_pi = 1.5 * scale; }
    else if (shockType === 'financial') { base_y = -2.0 * scale; base_pi = -0.2 * scale; }

    for (let t = shockPeriod; t < T; t++) {
      const decay = Math.pow(decayRate, t - shockPeriod);
      shock_y[t] = base_y * decay;
      shock_pi[t] = base_pi * decay;
    }
    return { shock_y, shock_pi, scale };
  }

  function simulate(shockType, severity, responsiveness, realLinkage) {
    const T = PARAMS.T;
    const shockPeriod = PARAMS.shockPeriod;
    const { shock_y, shock_pi, scale } = shockProfile(shockType, severity, T, shockPeriod, PARAMS.decayRate);

    // ----- Conventional -----
    const y_C = new Array(T).fill(0);
    const pi_C = new Array(T).fill(0);
    const r_C = new Array(T).fill(0);
    const debt_C = new Array(T).fill(0);

    pi_C[0] = PARAMS.pi_target;
    r_C[0] = PARAMS.r_neutral;
    debt_C[0] = PARAMS.debt_init;

    const taylor_pi = 1.5 * responsiveness;
    const taylor_y = 0.5 * responsiveness;
    const neutralRealRate = PARAMS.r_neutral - PARAMS.pi_target;

    for (let t = 1; t < T; t++) {
      r_C[t] = clamp(PARAMS.r_neutral + taylor_pi * (pi_C[t - 1] - PARAMS.pi_target) + taylor_y * y_C[t - 1], 0, 20);
      const realRate = r_C[t] - pi_C[t - 1];
      let extra = 0;
      if (shockType === 'financial' && t >= shockPeriod) {
        const decay = Math.pow(PARAMS.decayRate, t - shockPeriod);
        extra = -PARAMS.finAmpC * (debt_C[t - 1] / 100) * scale * decay;
      }
      y_C[t] = PARAMS.rho_y * y_C[t - 1] - PARAMS.beta_r * (realRate - neutralRealRate) + shock_y[t] + extra;
      y_C[t] = clamp(y_C[t], -30, 30);
      pi_C[t] = PARAMS.rho_pi * pi_C[t - 1] + PARAMS.kappa * y_C[t] + shock_pi[t];
      pi_C[t] = clamp(pi_C[t], -20, 30);
      // debt: quarterly interest compound + new borrowing during expansions
      debt_C[t] = debt_C[t - 1] * (1 + r_C[t] / 100 / 4) + PARAMS.delta_debt * Math.max(0, y_C[t]);
      debt_C[t] = clamp(debt_C[t], 0, 500);
    }

    // ----- Islamic -----
    const y_I = new Array(T).fill(0);
    const pi_I = new Array(T).fill(0);
    const ror_I = new Array(T).fill(0);
    const absorb = new Array(T).fill(0);
    const absorbCumul = new Array(T).fill(0);

    pi_I[0] = PARAMS.pi_target;
    ror_I[0] = PARAMS.ror_base;
    const gamma_eff = PARAMS.gamma * responsiveness * realLinkage;
    const absorbLevel = clamp(PARAMS.pls_strength * realLinkage, 0, 0.95);
    absorb[0] = absorbLevel;

    for (let t = 1; t < T; t++) {
      ror_I[t] = clamp(PARAMS.ror_base + gamma_eff * y_I[t - 1], -5, 25);
      absorb[t] = absorbLevel;
      // PLS absorbs losses/output shocks; a cost-push price shock passes through
      // regardless of financing structure, so absorption applies only to shock_y.
      y_I[t] = PARAMS.rho_y * y_I[t - 1]
        - PARAMS.beta_ror * (ror_I[t] - PARAMS.ror_base)
        + (1 - absorb[t]) * shock_y[t];
      y_I[t] = clamp(y_I[t], -30, 30);
      pi_I[t] = PARAMS.rho_pi * pi_I[t - 1] + PARAMS.kappa * y_I[t] + shock_pi[t];
      pi_I[t] = clamp(pi_I[t], -20, 30);
      absorbCumul[t] = absorbCumul[t - 1] + absorb[t] * Math.abs(shock_y[t]);
    }

    return {
      conventional: { y: y_C, pi: pi_C, r: r_C, debt: debt_C },
      islamic: { y: y_I, pi: pi_I, ror: ror_I, absorb, absorbCumul },
    };
  }

  function round1(x) { return Math.round(x * 10) / 10; }
  function summarize(shockType, severity, responsiveness, realLinkage, results) {
    function key(arr) {
      return {
        min: round1(Math.min(...arr)),
        max: round1(Math.max(...arr)),
        end: round1(arr[arr.length - 1]),
      };
    }
    return {
      shock: shockType,
      params: {
        severity, responsiveness: round1(responsiveness), realLinkage: round1(realLinkage),
      },
      conventional: {
        output_gap: key(results.conventional.y),
        inflation: key(results.conventional.pi),
        policy_rate_path_end: round1(results.conventional.r[results.conventional.r.length - 1]),
        debt_path_end: round1(results.conventional.debt[results.conventional.debt.length - 1]),
        debt_change: round1(results.conventional.debt[results.conventional.debt.length - 1] - PARAMS.debt_init),
      },
      islamic: {
        output_gap: key(results.islamic.y),
        inflation: key(results.islamic.pi),
        absorption_share: round1(results.islamic.absorb[0]),
        cumulative_absorbed: round1(results.islamic.absorbCumul[results.islamic.absorbCumul.length - 1]),
      },
    };
  }

  function clientFallbackOneLiner(summary) {
    const cMin = summary.conventional.output_gap.min;
    const iMin = summary.islamic.output_gap.min;
    const deeper = cMin < iMin ? 'the conventional economy' : (iMin < cMin ? 'the Islamic economy' : 'both economies');
    return `In this stylized run of a ${SHOCK_LABELS[summary.shock]}, ${deeper} shows the deeper output trough. ` +
      `Mechanically, the conventional side moves through the interest-rate channel and accumulates debt; the Islamic side has no policy rate and absorbs part of the shock through profit-and-loss sharing. ` +
      `This is a teaching model, not a verdict — neither system dominates across all shocks, and real Islamic finance operates in dual-banking systems with imperfect risk-sharing.`;
  }

  // ===== Module 3: Charts =====
  const charts = {}; // keyed by canvas id

  function destroyCharts() {
    Object.values(charts).forEach(c => { try { c.destroy(); } catch (e) {} });
    Object.keys(charts).forEach(k => delete charts[k]);
  }

  function makeChart(canvasId, label, data, color, yTitle) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const labels = data.map((_, i) => i);
    const cs = getComputedStyle(document.documentElement);
    const muted = cs.getPropertyValue('--muted').trim();
    const border = cs.getPropertyValue('--border').trim();
    const shock = PARAMS.shockPeriod;

    return new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label,
          data,
          borderColor: color,
          backgroundColor: color + '22',
          tension: 0.25,
          fill: true,
          pointRadius: 0,
          borderWidth: 2,
        }],
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { mode: 'index', intersect: false },
          // Vertical shock-period line via 'segment' is overkill; instead annotate via filler dataset.
        },
        scales: {
          x: {
            title: { display: true, text: 'period', color: muted, font: { size: 9 } },
            grid: { color: border + '30' },
            ticks: { color: muted, font: { size: 9 } },
          },
          y: {
            title: { display: true, text: yTitle, color: muted, font: { size: 9 } },
            grid: { color: border + '30' },
            ticks: { color: muted, font: { size: 9 } },
          },
        },
      },
    });
  }

  function renderCharts(results) {
    destroyCharts();
    charts.cY = makeChart('rr-c-y', 'Output gap (%)', results.conventional.y, COLOR_C, 'output gap');
    charts.cPi = makeChart('rr-c-pi', 'Inflation (%)', results.conventional.pi, COLOR_C, 'inflation');
    charts.cDebt = makeChart('rr-c-debt', 'Debt / GDP (%)', results.conventional.debt, COLOR_C, 'debt/GDP');
    charts.iY = makeChart('rr-i-y', 'Output gap (%)', results.islamic.y, COLOR_I, 'output gap');
    charts.iPi = makeChart('rr-i-pi', 'Inflation (%)', results.islamic.pi, COLOR_I, 'inflation');
    charts.iAbs = makeChart('rr-i-abs', 'Cumulative absorption', results.islamic.absorbCumul, COLOR_I, 'absorbed');
  }

  // ===== Module 4: UI state + bindings =====
  const ui = {
    shock: 'financial',
    severity: 5,
    responsiveness: 1.0,
    realLinkage: 0.7,
  };

  function setShock(name) {
    ui.shock = name;
    document.querySelectorAll('.rr-shock-btn').forEach(b => {
      b.dataset.active = (b.dataset.shock === name) ? 'true' : 'false';
    });
  }

  function bindSlider(id, key, formatter) {
    const slider = document.getElementById(id);
    const label = document.getElementById(id + '-val');
    function update() {
      ui[key] = parseFloat(slider.value);
      label.textContent = formatter ? formatter(ui[key]) : ui[key];
    }
    slider.addEventListener('input', update);
    update();
  }

  async function run() {
    const results = simulate(ui.shock, ui.severity, ui.responsiveness, ui.realLinkage);
    renderCharts(results);

    const narrative = document.getElementById('rr-narrative');
    const narrativeBody = document.getElementById('rr-narrative-body');
    narrative.classList.remove('is-hidden');
    narrativeBody.textContent = '';
    document.getElementById('rr-thinking').classList.remove('is-hidden');

    const summary = summarize(ui.shock, ui.severity, ui.responsiveness, ui.realLinkage, results);

    try {
      const resp = await fetch('/day-22/riba-and-risk/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.narrative) {
        narrativeBody.textContent = data.narrative;
      } else {
        narrativeBody.textContent = clientFallbackOneLiner(summary) +
          (data.message ? `\n\n(${data.message})` : '');
      }
    } catch (e) {
      narrativeBody.textContent = clientFallbackOneLiner(summary);
    } finally {
      document.getElementById('rr-thinking').classList.add('is-hidden');
    }
  }

  function init() {
    document.querySelectorAll('.rr-shock-btn').forEach(btn => {
      btn.addEventListener('click', () => setShock(btn.dataset.shock));
    });
    setShock(ui.shock);

    bindSlider('rr-severity', 'severity', v => v.toFixed(0));
    bindSlider('rr-responsiveness', 'responsiveness', v => v.toFixed(2));
    bindSlider('rr-linkage', 'realLinkage', v => v.toFixed(2));

    document.getElementById('rr-run-btn').addEventListener('click', run);

    // Run once on load so the page isn't empty.
    run();
  }

  // Expose for headless testing.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { simulate, summarize, clientFallbackOneLiner, PARAMS };
  }

  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})();
