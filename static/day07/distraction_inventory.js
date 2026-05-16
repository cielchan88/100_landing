/* Distraction Inventory — Day 7 */
(function () {
  'use strict';

  const STORAGE_KEY = 'di_entries';

  const AVOIDING_OPTIONS = [
    'Hard work',
    'A decision',
    'A conversation',
    'A task I dislike',
    'An emotion',
    'Other',
  ];

  const TURNING_OPTIONS = [
    'Social media',
    'News or web browsing',
    'Messaging apps',
    'Email',
    'Video or streaming',
    'Food or snacks',
    'Different work task',
    'Other',
  ];

  const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // ===== Storage =====
  let storageWorks = true;
  try {
    const _t = '__di_test__';
    localStorage.setItem(_t, '1');
    localStorage.removeItem(_t);
  } catch (e) {
    storageWorks = false;
  }

  function loadEntries() {
    if (!storageWorks) return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('not an array');
      return parsed.filter(e => e && typeof e === 'object' && e.id && e.ts && e.avoiding && e.turning_to);
    } catch (e) {
      console.warn('Distraction Inventory: corrupt storage, resetting.', e);
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      return [];
    }
  }

  function saveEntries(arr) {
    if (!storageWorks) return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
      return true;
    } catch (e) {
      console.error('Distraction Inventory: storage write failed.', e);
      showStorageWarning('Your browser storage is full or unavailable. New entries cannot be saved.');
      return false;
    }
  }

  function genId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'di-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function addEntry(avoiding, turning_to) {
    const entries = loadEntries();
    entries.push({ id: genId(), ts: Date.now(), avoiding, turning_to });
    return saveEntries(entries);
  }

  function deleteEntry(id) {
    const entries = loadEntries().filter(e => e.id !== id);
    return saveEntries(entries);
  }

  function clearAll() {
    try { localStorage.removeItem(STORAGE_KEY); return true; } catch { return false; }
  }

  // ===== Helpers =====
  function timeAgo(ts) {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 30) return 'just now';
    if (diff < 60) return diff + 's ago';
    if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
    if (diff < 86400) return Math.floor(diff / 3600) + ' h ago';
    const days = Math.floor(diff / 86400);
    if (days === 1) return 'yesterday';
    if (days < 7) return days + ' days ago';
    return new Date(ts).toLocaleDateString();
  }

  function showStorageWarning(msg) {
    let el = document.getElementById('di-warn');
    if (!el) {
      el = document.createElement('div');
      el.id = 'di-warn';
      el.className = 'di-warn';
      const target = document.querySelector('.di-hero, .di-insights-header');
      if (target && target.parentNode) target.parentNode.insertBefore(el, target.nextSibling);
    }
    el.textContent = msg;
  }

  // ===== Index page (capture) =====
  function initIndex() {
    const logBtn = document.getElementById('di-log-btn');
    if (!logBtn) return;

    if (!storageWorks) {
      showStorageWarning('Your browser does not support localStorage. Entries cannot be saved.');
    }

    const modal = document.getElementById('di-modal');
    const avoidingSel = document.getElementById('di-avoiding');
    const turningSel = document.getElementById('di-turning');
    const saveBtn = document.getElementById('di-save');
    const cancelBtn = document.getElementById('di-cancel');
    const recentList = document.getElementById('di-recent-list');

    // Populate dropdowns
    function fillSelect(sel, options) {
      sel.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '— pick one —';
      placeholder.disabled = true;
      placeholder.selected = true;
      sel.appendChild(placeholder);
      options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        sel.appendChild(o);
      });
    }
    fillSelect(avoidingSel, AVOIDING_OPTIONS);
    fillSelect(turningSel, TURNING_OPTIONS);

    function openModal() {
      modal.dataset.open = 'true';
      avoidingSel.value = '';
      turningSel.value = '';
      setTimeout(() => avoidingSel.focus(), 0);
    }

    function closeModal() {
      modal.dataset.open = 'false';
      logBtn.focus();
    }

    function trySave() {
      const a = avoidingSel.value;
      const t = turningSel.value;
      if (!a || !t) {
        if (!a) avoidingSel.focus();
        else turningSel.focus();
        return;
      }
      const ok = addEntry(a, t);
      closeModal();
      if (ok) renderRecent();
    }

    logBtn.addEventListener('click', openModal);
    saveBtn.addEventListener('click', trySave);
    cancelBtn.addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // Keyboard: L opens, Enter saves, Escape cancels
    document.addEventListener('keydown', (e) => {
      const tag = e.target && e.target.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA';
      if (modal.dataset.open === 'true') {
        if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
        else if (e.key === 'Enter') { e.preventDefault(); trySave(); }
        return;
      }
      if (!inField && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        openModal();
      }
    });

    function renderRecent() {
      const entries = loadEntries().sort((a, b) => b.ts - a.ts).slice(0, 5);
      recentList.innerHTML = '';
      if (entries.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'di-empty';
        empty.textContent = 'Nothing logged yet. Click the button above when you notice yourself distracted.';
        recentList.appendChild(empty);
        return;
      }
      entries.forEach(e => {
        const row = document.createElement('div');
        row.className = 'di-entry-row';

        const time = document.createElement('span');
        time.className = 'di-entry-time';
        time.textContent = timeAgo(e.ts);

        const action = document.createElement('span');
        action.className = 'di-entry-action';
        const avoid = document.createElement('span');
        avoid.textContent = e.avoiding;
        const arrow = document.createElement('span');
        arrow.className = 'di-entry-arrow';
        arrow.textContent = ' → ';
        const turning = document.createElement('span');
        turning.textContent = e.turning_to;
        action.appendChild(avoid);
        action.appendChild(arrow);
        action.appendChild(turning);

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'di-entry-delete';
        del.setAttribute('aria-label', 'Delete this entry');
        del.textContent = '✕';
        del.addEventListener('click', () => {
          deleteEntry(e.id);
          renderRecent();
        });

        row.appendChild(time);
        row.appendChild(action);
        row.appendChild(del);
        recentList.appendChild(row);
      });
    }

    renderRecent();
    // Re-render time-ago labels every minute
    setInterval(renderRecent, 60 * 1000);
  }

  // ===== Insights page =====
  function computeStats(entries) {
    const total = entries.length;
    let earliest = Infinity, latest = -Infinity;
    const hourCounts = new Array(24).fill(0);
    const dowCounts = new Array(7).fill(0); // 0 = Mon
    const avoidCounts = {};
    const turnCounts = {};
    const pairCounts = {};

    entries.forEach(e => {
      if (e.ts < earliest) earliest = e.ts;
      if (e.ts > latest) latest = e.ts;
      const d = new Date(e.ts);
      hourCounts[d.getHours()] += 1;
      // Convert JS getDay() (0=Sun..6=Sat) to (0=Mon..6=Sun)
      const jsDow = d.getDay();
      const dow = (jsDow + 6) % 7;
      dowCounts[dow] += 1;
      avoidCounts[e.avoiding] = (avoidCounts[e.avoiding] || 0) + 1;
      turnCounts[e.turning_to] = (turnCounts[e.turning_to] || 0) + 1;
      const key = e.avoiding + '||' + e.turning_to;
      pairCounts[key] = (pairCounts[key] || 0) + 1;
    });

    const daysSpan = total > 0
      ? Math.max(1, Math.ceil((latest - earliest) / 86400000) + 1)
      : 0;

    const pairs = Object.entries(pairCounts)
      .map(([k, c]) => {
        const [avoiding, turning_to] = k.split('||');
        return { avoiding, turning_to, count: c };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      total,
      daysSpan,
      hourCounts,
      dowCounts,
      avoidCounts,
      turnCounts,
      pairs,
    };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  function configureChartDefaults() {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.color = '#A8A29E';
    Chart.defaults.borderColor = 'rgba(217, 119, 87, 0.15)';
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    if (Chart.defaults.scale && Chart.defaults.scale.grid) {
      Chart.defaults.scale.grid.color = 'rgba(168, 162, 158, 0.10)';
    }
  }

  function renderHeatmap(container, hourCounts) {
    container.innerHTML = '';
    const max = Math.max(0, ...hourCounts);
    for (let h = 0; h < 24; h++) {
      const cell = document.createElement('div');
      cell.className = 'di-heatmap-cell';
      const count = hourCounts[h];
      if (max > 0 && count > 0) {
        const opacity = 0.15 + 0.85 * (count / max);
        cell.style.backgroundColor = 'rgba(217, 119, 87, ' + opacity.toFixed(2) + ')';
        cell.style.borderColor = 'rgba(217, 119, 87, 0.4)';
      }
      const hourLabel = h === 0 ? '12am' : h === 12 ? '12pm' : h < 12 ? h + 'am' : (h - 12) + 'pm';
      cell.title = hourLabel + ' — ' + count + (count === 1 ? ' entry' : ' entries');
      container.appendChild(cell);
    }
  }

  function renderBarChart(canvas, countsMap, options) {
    if (typeof Chart === 'undefined') return null;
    const entries = Object.entries(countsMap).sort((a, b) => b[1] - a[1]);
    const labels = entries.map(e => e[0]);
    const data = entries.map(e => e[1]);
    return new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: 'rgba(217, 119, 87, 0.7)',
          borderColor: 'rgba(217, 119, 87, 0.9)',
          borderWidth: 0,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ctx.parsed.x + (ctx.parsed.x === 1 ? ' entry' : ' entries'),
            },
          },
        },
        scales: {
          x: { beginAtZero: true, ticks: { precision: 0 } },
          y: { grid: { display: false } },
        },
      },
    });
  }

  function renderDowChart(canvas, dowCounts) {
    if (typeof Chart === 'undefined') return null;
    const todayJs = new Date().getDay();
    const todayIdx = (todayJs + 6) % 7;
    const bgs = dowCounts.map((_, i) =>
      i === todayIdx ? 'rgba(217, 119, 87, 0.9)' : 'rgba(217, 119, 87, 0.45)'
    );
    return new Chart(canvas, {
      type: 'bar',
      data: {
        labels: DOW_LABELS,
        datasets: [{ data: dowCounts, backgroundColor: bgs, borderWidth: 0 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });
  }

  function renderPairings(container, pairs) {
    container.innerHTML = '';
    pairs.forEach(p => {
      const row = document.createElement('div');
      row.className = 'di-pairing-row';
      const a = document.createElement('strong');
      a.textContent = p.avoiding;
      const arrow = document.createElement('span');
      arrow.className = 'di-pairing-arrow';
      arrow.textContent = ' → ';
      const t = document.createElement('strong');
      t.textContent = p.turning_to;
      const c = document.createElement('span');
      c.className = 'di-pairing-count';
      c.textContent = p.count + (p.count === 1 ? ' time' : ' times');
      row.appendChild(a);
      row.appendChild(arrow);
      row.appendChild(t);
      row.appendChild(c);
      container.appendChild(row);
    });
  }

  function initInsights() {
    const root = document.getElementById('di-insights-root');
    if (!root) return;

    if (!storageWorks) {
      showStorageWarning('Your browser does not support localStorage. No entries to analyze.');
    }

    const entries = loadEntries();
    const stats = computeStats(entries);

    const subtitle = document.getElementById('di-stat-headline');
    const emptyEl = document.getElementById('di-empty-state');
    const fewEl = document.getElementById('di-few-state');
    const fullEl = document.getElementById('di-full-state');

    if (stats.total === 0) {
      emptyEl.style.display = 'block';
      subtitle.textContent = '';
      return;
    }

    subtitle.textContent = 'Based on ' + stats.total +
      (stats.total === 1 ? ' entry' : ' entries') +
      ' over ' + stats.daysSpan +
      (stats.daysSpan === 1 ? ' day' : ' days');

    if (stats.total < 5) {
      fewEl.style.display = 'block';
      document.getElementById('di-few-count').textContent = stats.total;
      // Still show export/reset row
      wireExportReset(stats.total);
      return;
    }

    fullEl.style.display = 'block';

    configureChartDefaults();
    renderHeatmap(document.getElementById('di-heatmap'), stats.hourCounts);
    renderBarChart(document.getElementById('di-avoiding-chart'), stats.avoidCounts);
    renderBarChart(document.getElementById('di-turning-chart'), stats.turnCounts);
    renderPairings(document.getElementById('di-pairings'), stats.pairs);
    renderDowChart(document.getElementById('di-dow-chart'), stats.dowCounts);

    wireExportReset(stats.total);
  }

  function wireExportReset(total) {
    const exportBtn = document.getElementById('di-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const payload = {
          exported_at: new Date().toISOString(),
          version: 1,
          entries: loadEntries(),
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const datestamp = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = 'distraction-inventory-' + datestamp + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }

    const resetBtn = document.getElementById('di-reset');
    const confirmModal = document.getElementById('di-confirm-modal');
    const confirmYes = document.getElementById('di-confirm-yes');
    const confirmNo = document.getElementById('di-confirm-no');
    const confirmCount = document.getElementById('di-confirm-count');

    if (resetBtn && confirmModal) {
      resetBtn.addEventListener('click', () => {
        confirmCount.textContent = total;
        confirmModal.dataset.open = 'true';
      });
      confirmNo.addEventListener('click', () => {
        confirmModal.dataset.open = 'false';
      });
      confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) confirmModal.dataset.open = 'false';
      });
      confirmYes.addEventListener('click', () => {
        clearAll();
        window.location.reload();
      });
    }
  }

  // ===== Boot =====
  function boot() {
    initIndex();
    initInsights();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
