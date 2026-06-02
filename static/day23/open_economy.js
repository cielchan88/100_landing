/* Riba & Risk: Open Economy — Day 23.
 * Extends the Day 22 closed-economy model with exchange rate, capital flows,
 * and current account. Two new external shocks (global rate, sudden stop).
 * Pure client-side simulation, deterministic.
 */
(function () {
  'use strict';

  // ===== Parameters =====
  const PARAMS = {
    T: 20, shockPeriod: 3,
    rho_y: 0.7, rho_pi: 0.6, kappa: 0.3,
    pi_target: 2, r_neutral: 4, ror_base: 4,
    beta_r: 0.4, delta_debt: 1.5, debt_init: 80, fxDebt: 0.6,
    beta_ror: 0.4, gamma: 0.5, pls_strength: 0.6,
    finAmpC: 0.04, decayRate: 0.6,
    // open-economy
    iota: 0.8, lambda_e: 0.5, psi: 0.4, phi: 0.2, nx_sens: 0.5,
    passthrough: 0.25, piWorld: 2, rWorld_base: 3, equityStick: 0.6,
    e_init: 100,
    // FX-augmented Taylor: conventional rate reacts to depreciation
    // (emerging-market policy rule). Scaled by responsiveness so the
    // rate-defence dilemma surfaces under high-responsiveness runs.
    fxTaylor: 0.25,
    // Direct output drag on conventional from sharp depreciation —
    // FX-debt balance-sheet effect hitting investment, not just debt stocks.
    // Islamic side stays equity-financed -> no such drag (structural asymmetry).
    fxOutputDragC: 0.12,
    // A smaller symmetric drag captures the real-economy cost of depreciation
    // both sides share (imported goods, real-purchasing-power loss). Keeps
    // the Islamic side from looking immune to currency shocks while the
    // larger asymmetric drag above preserves the FX-debt-fragility story.
    fxOutputDragShared: 0.06,
    // shock magnitudes
    globalRateMag: 3.0,
    suddenStopMag: 5.0,
    globalRateDecay: 0.85,
  };

  const COLOR_C = '#7BA7CC';
  const COLOR_I = '#D97757';

  const SHOCK_LABELS = {
    demand: 'Demand shock',
    supply: 'Supply / oil shock',
    financial: 'Financial crisis',
    global_rate: 'Global rate shock',
    sudden_stop: 'Sudden stop / capital flight',
  };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ===== Shock profile =====
  function shockProfile(shockType, severity, T, shockPeriod) {
    const scale = severity / 5;
    const shock_y = new Array(T).fill(0);
    const shock_pi = new Array(T).fill(0);
    const capShock = new Array(T).fill(0);
    const rWorldPath = new Array(T).fill(PARAMS.rWorld_base);

    let base_y = 0, base_pi = 0;
    if (shockType === 'demand') { base_y = -1.5 * scale; base_pi = -0.3 * scale; }
    else if (shockType === 'supply') { base_y = -0.5 * scale; base_pi = 1.5 * scale; }
    else if (shockType === 'financial') { base_y = -2.0 * scale; base_pi = -0.2 * scale; }

    for (let t = shockPeriod; t < T; t++) {
      const fastDecay = Math.pow(PARAMS.decayRate, t - shockPeriod);
      const slowDecay = Math.pow(PARAMS.globalRateDecay, t - shockPeriod);
      shock_y[t] = base_y * fastDecay;
      shock_pi[t] = base_pi * fastDecay;
      if (shockType === 'global_rate') {
        rWorldPath[t] = PARAMS.rWorld_base + PARAMS.globalRateMag * scale * slowDecay;
      }
      if (shockType === 'sudden_stop') {
        capShock[t] = -PARAMS.suddenStopMag * scale * fastDecay;
      }
    }
    return { shock_y, shock_pi, capShock, rWorldPath, scale };
  }

  // ===== Simulate =====
  function simulate(shockType, severity, responsiveness, realLinkage, capMobility) {
    const T = PARAMS.T;
    const sp = PARAMS.shockPeriod;
    const { shock_y, shock_pi, capShock, rWorldPath, scale } =
      shockProfile(shockType, severity, T, sp);

    // ---- Conventional ----
    const y_C = new Array(T).fill(0);
    const pi_C = new Array(T).fill(0);
    const r_C = new Array(T).fill(0);
    const debt_C = new Array(T).fill(0);
    const e_C = new Array(T).fill(0);
    const cap_C = new Array(T).fill(0);
    const ca_C = new Array(T).fill(0);

    pi_C[0] = PARAMS.pi_target;
    r_C[0] = PARAMS.r_neutral;
    debt_C[0] = PARAMS.debt_init;
    e_C[0] = PARAMS.e_init;
    cap_C[0] = capMobility * PARAMS.iota * (r_C[0] - rWorldPath[0]);
    ca_C[0] = 0;

    const taylor_pi = 1.5 * responsiveness;
    const taylor_y = 0.5 * responsiveness;
    const neutralRealRate = PARAMS.r_neutral - PARAMS.pi_target;

    // ---- Islamic ----
    const y_I = new Array(T).fill(0);
    const pi_I = new Array(T).fill(0);
    const ror_I = new Array(T).fill(0);
    const absorb = new Array(T).fill(0);
    const absorbCumul = new Array(T).fill(0);
    const e_I = new Array(T).fill(0);
    const cap_I = new Array(T).fill(0);
    const ca_I = new Array(T).fill(0);

    pi_I[0] = PARAMS.pi_target;
    ror_I[0] = PARAMS.ror_base;
    e_I[0] = PARAMS.e_init;
    const gamma_eff = PARAMS.gamma * realLinkage;
    const absorbLevel = clamp(PARAMS.pls_strength * realLinkage, 0, 0.95);
    absorb[0] = absorbLevel;
    cap_I[0] = capMobility * PARAMS.iota * PARAMS.equityStick * (ror_I[0] - rWorldPath[0]);
    ca_I[0] = 0;

    for (let t = 1; t < T; t++) {
      // --- Conventional ---
      // Taylor rule includes an FX-reaction term (emerging-market style):
      // when the currency depreciates, the policy rate rises to defend it,
      // scaled by responsiveness. This surfaces the rate-defence dilemma.
      const fxGap_C = (e_C[t - 1] - PARAMS.e_init) / PARAMS.e_init * 100;
      r_C[t] = clamp(
        PARAMS.r_neutral
          + taylor_pi * (pi_C[t - 1] - PARAMS.pi_target)
          + taylor_y * y_C[t - 1]
          + PARAMS.fxTaylor * responsiveness * fxGap_C,
        0, 25);
      cap_C[t] = capMobility * PARAMS.iota * (r_C[t] - rWorldPath[t]) + capShock[t];
      e_C[t] = clamp(e_C[t - 1] * (1 + PARAMS.lambda_e * (-cap_C[t] / 100) + 0.3 * (pi_C[t - 1] - PARAMS.piWorld) / 100), 40, 300);
      ca_C[t] = PARAMS.psi * ((e_C[t - 1] - 100) / 100) - PARAMS.phi * y_C[t - 1];
      const realRate_C = r_C[t] - pi_C[t - 1];
      let finExtra = 0;
      if (shockType === 'financial' && t >= sp) {
        const decay = Math.pow(PARAMS.decayRate, t - sp);
        finExtra = -PARAMS.finAmpC * (debt_C[t - 1] / 100) * scale * decay;
      }
      // Two depreciation drags. The shared drag (import dependency / real
      // purchasing-power loss) hits both economies symmetrically. The
      // FX-debt drag is conventional-only — equity-like financing carries
      // no fixed FX liability so the balance-sheet spiral can't happen.
      const deprFrac_C = Math.max(0, (e_C[t] - e_C[t - 1]) / e_C[t - 1]);
      const fxDrag_C = (PARAMS.fxOutputDragC + PARAMS.fxOutputDragShared) * deprFrac_C * 100;
      y_C[t] = PARAMS.rho_y * y_C[t - 1]
        - PARAMS.beta_r * (realRate_C - neutralRealRate)
        + PARAMS.nx_sens * ((e_C[t - 1] - 100) / 100)
        + shock_y[t] + finExtra - fxDrag_C;
      y_C[t] = clamp(y_C[t], -30, 30);
      const dPi_C = ((e_C[t] - e_C[t - 1]) / e_C[t - 1]) * 100;
      // Anchor persistence to target so inflation doesn't drift to zero
      // without a shock (otherwise the Taylor rule sees a deflation it
      // never asked for and the rate-defence dilemma never surfaces).
      pi_C[t] = PARAMS.pi_target + PARAMS.rho_pi * (pi_C[t - 1] - PARAMS.pi_target) + PARAMS.kappa * y_C[t] + PARAMS.passthrough * dPi_C + shock_pi[t];
      pi_C[t] = clamp(pi_C[t], -20, 30);
      debt_C[t] = debt_C[t - 1] * (1 + r_C[t] / 100 / 4)
        + PARAMS.delta_debt * Math.max(0, y_C[t])
        + PARAMS.fxDebt * Math.max(0, e_C[t] - e_C[t - 1]);
      debt_C[t] = clamp(debt_C[t], 0, 500);

      // --- Islamic ---
      ror_I[t] = clamp(PARAMS.ror_base + gamma_eff * y_I[t - 1], -5, 25);
      absorb[t] = absorbLevel;
      const expRetDiff = ror_I[t] - rWorldPath[t];
      cap_I[t] = capMobility * PARAMS.iota * PARAMS.equityStick * expRetDiff
        + (1 - PARAMS.equityStick) * capShock[t];
      e_I[t] = clamp(e_I[t - 1] * (1 + PARAMS.lambda_e * (-cap_I[t] / 100) + 0.3 * (pi_I[t - 1] - PARAMS.piWorld) / 100), 40, 300);
      ca_I[t] = PARAMS.psi * ((e_I[t - 1] - 100) / 100) - PARAMS.phi * y_I[t - 1];
      // Symmetric depreciation drag also hits the Islamic side — equity
      // financing dodges the balance-sheet spiral, but currency depreciation
      // still raises real costs and shrinks real purchasing power.
      const deprFrac_I = Math.max(0, (e_I[t] - e_I[t - 1]) / e_I[t - 1]);
      const fxDrag_I = PARAMS.fxOutputDragShared * deprFrac_I * 100;
      y_I[t] = PARAMS.rho_y * y_I[t - 1]
        - PARAMS.beta_ror * (ror_I[t] - PARAMS.ror_base)
        + PARAMS.nx_sens * ((e_I[t - 1] - 100) / 100)
        + (1 - absorb[t]) * shock_y[t] - fxDrag_I;
      y_I[t] = clamp(y_I[t], -30, 30);
      const dPi_I = ((e_I[t] - e_I[t - 1]) / e_I[t - 1]) * 100;
      // shock_pi passes through fully (cost-push isn't absorbed by PLS) — same
      // deliberate deviation as Day 22, to keep "supply shocks hard for both."
      // Same target-anchoring as on the conventional side.
      pi_I[t] = PARAMS.pi_target + PARAMS.rho_pi * (pi_I[t - 1] - PARAMS.pi_target) + PARAMS.kappa * y_I[t] + PARAMS.passthrough * dPi_I + shock_pi[t];
      pi_I[t] = clamp(pi_I[t], -20, 30);
      absorbCumul[t] = absorbCumul[t - 1] + absorb[t] * Math.abs(shock_y[t]);
    }

    return {
      conventional: { y: y_C, pi: pi_C, r: r_C, debt: debt_C, e: e_C, cap: cap_C, ca: ca_C },
      islamic: { y: y_I, pi: pi_I, ror: ror_I, absorb, absorbCumul, e: e_I, cap: cap_I, ca: ca_I },
      rWorld: rWorldPath,
    };
  }

  // ===== Summary + fallback =====
  function r1(x) { return Math.round(x * 10) / 10; }
  function summarize(shockType, sev, resp, link, capMob, results) {
    function key(arr) {
      return { min: r1(Math.min(...arr)), max: r1(Math.max(...arr)), end: r1(arr[arr.length - 1]) };
    }
    return {
      shock: shockType,
      params: { severity: sev, responsiveness: r1(resp), realLinkage: r1(link), capMobility: r1(capMob) },
      conventional: {
        output_gap: key(results.conventional.y),
        inflation: key(results.conventional.pi),
        policy_rate_end: r1(results.conventional.r[results.conventional.r.length - 1]),
        debt_end: r1(results.conventional.debt[results.conventional.debt.length - 1]),
        debt_change: r1(results.conventional.debt[results.conventional.debt.length - 1] - PARAMS.debt_init),
        exchange_rate_max: r1(Math.max(...results.conventional.e)),
        exchange_rate_end: r1(results.conventional.e[results.conventional.e.length - 1]),
        capital_flow_min: r1(Math.min(...results.conventional.cap)),
        current_account_end: r1(results.conventional.ca[results.conventional.ca.length - 1]),
      },
      islamic: {
        output_gap: key(results.islamic.y),
        inflation: key(results.islamic.pi),
        absorption_share: r1(results.islamic.absorb[0]),
        cumulative_absorbed: r1(results.islamic.absorbCumul[results.islamic.absorbCumul.length - 1]),
        exchange_rate_max: r1(Math.max(...results.islamic.e)),
        exchange_rate_end: r1(results.islamic.e[results.islamic.e.length - 1]),
        capital_flow_min: r1(Math.min(...results.islamic.cap)),
        current_account_end: r1(results.islamic.ca[results.islamic.ca.length - 1]),
      },
    };
  }

  function clientFallback(summary) {
    const cY = summary.conventional.output_gap.min;
    const iY = summary.islamic.output_gap.min;
    const cE = summary.conventional.exchange_rate_max;
    const iE = summary.islamic.exchange_rate_max;
    const deeperOutput = cY < iY ? 'the conventional economy' : (iY < cY ? 'the Islamic economy' : 'both economies');
    const moreDepr = cE > iE ? 'the conventional currency' : (iE > cE ? 'the Islamic currency' : 'both currencies');
    return `In this stylized run of a ${SHOCK_LABELS[summary.shock]}, ${deeperOutput} shows the deeper output trough, while ${moreDepr} depreciates more. ` +
      `Mechanically, the conventional side moves through the interest-rate channel (which also doubles as a capital magnet, with exchange-rate pass-through and FX-debt fragility on depreciation); the Islamic side has no policy rate, capital responds to expected real returns, and equity-like flows are stickier — though a portion of capital still flees in a sudden stop. ` +
      `This is a stylized teaching model on a floating regime; no system escapes the impossible trinity.`;
  }

  // ===== Charts =====
  const charts = {};
  function destroyCharts() {
    Object.values(charts).forEach(c => { try { c.destroy(); } catch (e) {} });
    Object.keys(charts).forEach(k => delete charts[k]);
  }

  function makeChart(canvasId, series, color, yTitle) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const cs = getComputedStyle(document.documentElement);
    const muted = cs.getPropertyValue('--muted').trim();
    const border = cs.getPropertyValue('--border').trim();
    const labels = series[0].data.map((_, i) => i);
    return new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: series.map(s => ({
          label: s.label,
          data: s.data,
          borderColor: s.color || color,
          backgroundColor: (s.color || color) + (s.fill === false ? '00' : '22'),
          borderDash: s.dash || [],
          tension: 0.25,
          fill: s.fill !== false,
          pointRadius: 0,
          borderWidth: 2,
        })),
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: series.length > 1, labels: { color: muted, font: { size: 9 } } },
          tooltip: { mode: 'index', intersect: false },
        },
        scales: {
          x: { title: { display: true, text: 'period', color: muted, font: { size: 9 } },
               grid: { color: border + '30' }, ticks: { color: muted, font: { size: 9 } } },
          y: { title: { display: true, text: yTitle, color: muted, font: { size: 9 } },
               grid: { color: border + '30' }, ticks: { color: muted, font: { size: 9 } } },
        },
      },
    });
  }

  function renderCharts(results) {
    destroyCharts();
    charts.cY = makeChart('oe-c-y', [{ label: 'Output gap', data: results.conventional.y }], COLOR_C, 'output gap (%)');
    charts.cPi = makeChart('oe-c-pi', [{ label: 'Inflation', data: results.conventional.pi }], COLOR_C, 'inflation (%)');
    charts.cDebt = makeChart('oe-c-debt', [{ label: 'Debt/GDP', data: results.conventional.debt }], COLOR_C, 'debt/GDP (%)');
    charts.cE = makeChart('oe-c-e', [{ label: 'Exchange rate', data: results.conventional.e }], COLOR_C, 'index (↑ = depreciation)');
    charts.cExt = makeChart('oe-c-ext', [
      { label: 'Capital flow (% GDP)', data: results.conventional.cap },
      { label: 'Current account (% GDP)', data: results.conventional.ca, color: COLOR_C, dash: [4, 3], fill: false },
    ], COLOR_C, '% of GDP');

    charts.iY = makeChart('oe-i-y', [{ label: 'Output gap', data: results.islamic.y }], COLOR_I, 'output gap (%)');
    charts.iPi = makeChart('oe-i-pi', [{ label: 'Inflation', data: results.islamic.pi }], COLOR_I, 'inflation (%)');
    charts.iAbs = makeChart('oe-i-abs', [{ label: 'Cumulative absorption', data: results.islamic.absorbCumul }], COLOR_I, 'absorbed');
    charts.iE = makeChart('oe-i-e', [{ label: 'Exchange rate', data: results.islamic.e }], COLOR_I, 'index (↑ = depreciation)');
    charts.iExt = makeChart('oe-i-ext', [
      { label: 'Capital flow (% GDP)', data: results.islamic.cap },
      { label: 'Current account (% GDP)', data: results.islamic.ca, color: COLOR_I, dash: [4, 3], fill: false },
    ], COLOR_I, '% of GDP');
  }

  // ===== UI =====
  const ui = {
    shock: 'sudden_stop',
    severity: 5,
    responsiveness: 1.0,
    realLinkage: 0.7,
    capMobility: 0.7,
  };

  function setShock(name) {
    ui.shock = name;
    document.querySelectorAll('.oe-shock-btn').forEach(b => {
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
    const results = simulate(ui.shock, ui.severity, ui.responsiveness, ui.realLinkage, ui.capMobility);
    renderCharts(results);

    const narr = document.getElementById('oe-narrative');
    const body = document.getElementById('oe-narrative-body');
    narr.classList.remove('is-hidden');
    body.textContent = '';
    document.getElementById('oe-thinking').classList.remove('is-hidden');

    const summary = summarize(ui.shock, ui.severity, ui.responsiveness, ui.realLinkage, ui.capMobility, results);

    try {
      const resp = await fetch('/day-23/open-economy/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.narrative) {
        body.textContent = data.narrative;
      } else {
        body.textContent = clientFallback(summary) + (data.message ? `\n\n(${data.message})` : '');
      }
    } catch (e) {
      body.textContent = clientFallback(summary);
    } finally {
      document.getElementById('oe-thinking').classList.add('is-hidden');
    }
  }

  function init() {
    document.querySelectorAll('.oe-shock-btn').forEach(btn => {
      btn.addEventListener('click', () => setShock(btn.dataset.shock));
    });
    setShock(ui.shock);
    bindSlider('oe-severity', 'severity', v => v.toFixed(0));
    bindSlider('oe-responsiveness', 'responsiveness', v => v.toFixed(2));
    bindSlider('oe-linkage', 'realLinkage', v => v.toFixed(2));
    bindSlider('oe-capmob', 'capMobility', v => v.toFixed(2));
    document.getElementById('oe-run-btn').addEventListener('click', run);
    run();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { simulate, summarize, clientFallback, PARAMS };
  }

  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})();
