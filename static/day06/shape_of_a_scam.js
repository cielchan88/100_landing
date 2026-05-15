/* The Shape of a Scam — Day 6 */
(function () {
  'use strict';

  function fmtMoney(n) {
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    if (abs >= 1000000) return sign + '$' + (abs / 1000000).toFixed(1) + 'M';
    if (abs >= 1000) return sign + '$' + (abs / 1000).toFixed(1) + 'k';
    return sign + '$' + abs.toFixed(0);
  }

  function bucketColor(center) {
    if (center < -50) return '#FF6B47';
    if (center < 50) return '#A8A29E';
    return '#7fb069';
  }

  function configureChartDefaults() {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.color = '#A8A29E';
    Chart.defaults.borderColor = 'rgba(217, 119, 87, 0.15)';
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    Chart.defaults.scale.grid.color = 'rgba(168, 162, 158, 0.10)';
  }

  function renderHistogram(canvas, data) {
    if (!canvas || typeof Chart === 'undefined') return;
    const centers = data.histogram.centers || [];
    const buckets = data.histogram.buckets || [];
    const colors = centers.map(bucketColor);
    new Chart(canvas, {
      type: 'bar',
      data: {
        labels: centers.map(c => fmtMoney(c)),
        datasets: [{
          data: buckets,
          backgroundColor: colors,
          borderColor: colors,
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: items => items.length ? 'Net: ' + items[0].label : '',
              label: ctx => ctx.parsed.y.toLocaleString() + ' participants',
            },
          },
        },
        scales: {
          x: {
            ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
            grid: { display: false },
            title: { display: true, text: 'Net result (per participant)' },
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Participants (across 100 trials)' },
          },
        },
      },
    });
  }

  function renderTimeline(canvas, data) {
    if (!canvas || typeof Chart === 'undefined') return;
    const tl = data.showcase.timeline || [];
    const months = tl.map(t => 'M' + t.month);
    const invested = tl.map(t => t.invested);
    const paidOut = tl.map(t => t.paid_out);
    const collapseMonth = data.showcase.collapse_month;

    const datasets = [
      {
        label: 'Money in (from participants)',
        data: invested,
        borderColor: '#FF6B47',
        backgroundColor: 'rgba(255, 107, 71, 0.10)',
        fill: true,
        tension: 0.2,
        pointRadius: 0,
        borderWidth: 2,
      },
      {
        label: 'Money paid out (to participants)',
        data: paidOut,
        borderColor: '#7fb069',
        backgroundColor: 'rgba(127, 176, 105, 0.06)',
        fill: true,
        tension: 0.2,
        pointRadius: 0,
        borderWidth: 2,
      },
    ];

    new Chart(canvas, {
      type: 'line',
      data: { labels: months, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, boxHeight: 12 } },
          tooltip: {
            callbacks: {
              label: ctx => ctx.dataset.label + ': ' + fmtMoney(ctx.parsed.y),
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            title: { display: true, text: 'Month' },
            ticks: { autoSkip: true, maxTicksLimit: 10 },
          },
          y: {
            title: { display: true, text: 'Cumulative dollars' },
            ticks: { callback: v => fmtMoney(v) },
          },
        },
      },
    });

    if (collapseMonth) {
      const wrap = canvas.closest('.sos-chart-container');
      if (wrap) {
        const note = document.createElement('div');
        note.style.cssText = 'position:absolute; top:1rem; right:1rem; padding:4px 8px; background:rgba(217,119,87,0.12); border:1px solid var(--accent); border-radius:6px; font-size:0.7rem; color:var(--accent); font-family:JetBrains Mono, monospace;';
        note.textContent = 'Collapse at month ' + collapseMonth;
        wrap.appendChild(note);
      }
    }
  }

  function animateNumber(el) {
    const target = parseFloat(el.dataset.target);
    if (Number.isNaN(target)) return;
    const suffix = el.dataset.suffix || '';
    const isFloat = el.dataset.float === '1';
    const start = performance.now();
    const dur = 900;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = target * eased;
      el.textContent = (isFloat ? value.toFixed(1) : Math.round(value).toLocaleString()) + suffix;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function init() {
    const root = document.getElementById('sos-results-root');
    if (!root) return;
    let data;
    try {
      data = JSON.parse(document.getElementById('sos-data').textContent);
    } catch (e) {
      console.error('Failed to parse simulation data:', e);
      return;
    }

    configureChartDefaults();
    renderHistogram(document.getElementById('sos-histogram'), data);
    renderTimeline(document.getElementById('sos-timeline'), data);

    document.querySelectorAll('.sos-animate-num').forEach(animateNumber);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
