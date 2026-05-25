/* Decision Matrix — Day 14 */
(function () {
  'use strict';

  const MAX_OPTIONS = 6;
  const MAX_CRITERIA = 5;

  const DEFAULT_STATE = {
    options: ['Python', 'Go', 'Rust'],
    criteria: [
      { name: 'Speed', weight: 3 },
      { name: 'Ecosystem', weight: 4 },
      { name: 'Job Market', weight: 5 },
    ],
    ratings: [
      [2, 5, 5],  // Python
      [4, 3, 4],  // Go
      [5, 3, 3],  // Rust
    ],
  };

  let state = JSON.parse(JSON.stringify(DEFAULT_STATE));

  // ===== URL state =====
  function encodeState() {
    const obj = {
      o: state.options,
      c: state.criteria.map(c => [c.name, c.weight]),
      r: state.ratings,
    };
    return encodeURIComponent(JSON.stringify(obj));
  }

  function decodeState(str) {
    try {
      const obj = JSON.parse(decodeURIComponent(str));
      return {
        options: obj.o,
        criteria: obj.c.map(c => ({ name: c[0], weight: c[1] })),
        ratings: obj.r,
      };
    } catch (e) {
      return null;
    }
  }

  function updateURL() {
    const hash = `#m=${encodeState()}`;
    history.replaceState(null, '', hash);
  }

  function loadFromURL() {
    const hash = window.location.hash;
    if (hash.startsWith('#m=')) {
      const decoded = decodeState(hash.slice(3));
      if (decoded && decoded.options && decoded.criteria && decoded.ratings) {
        state = decoded;
        return true;
      }
    }
    return false;
  }

  // ===== State manipulation =====
  function addOption() {
    if (state.options.length >= MAX_OPTIONS) return;
    state.options.push(`Option ${state.options.length + 1}`);
    state.ratings.push(new Array(state.criteria.length).fill(3));
    renderAll();
  }

  function removeOption(idx) {
    state.options.splice(idx, 1);
    state.ratings.splice(idx, 1);
    renderAll();
  }

  function addCriterion() {
    if (state.criteria.length >= MAX_CRITERIA) return;
    state.criteria.push({ name: `Criterion ${state.criteria.length + 1}`, weight: 3 });
    state.ratings.forEach(row => row.push(3));
    renderAll();
  }

  function removeCriterion(idx) {
    state.criteria.splice(idx, 1);
    state.ratings.forEach(row => row.splice(idx, 1));
    renderAll();
  }

  function setOptionName(idx, name) {
    state.options[idx] = name;
    updateURL();
    renderResults();
  }

  function setCriterionName(idx, name) {
    state.criteria[idx].name = name;
    updateURL();
  }

  function setCriterionWeight(idx, weight) {
    state.criteria[idx].weight = Math.max(1, Math.min(5, weight));
    updateURL();
    renderResults();
  }

  function setRating(optionIdx, criterionIdx, rating) {
    state.ratings[optionIdx][criterionIdx] = Math.max(1, Math.min(5, rating));
    updateURL();
    renderResults();
  }

  // ===== Scoring =====
  function computeScores() {
    return state.options.map((name, optIdx) => {
      let total = 0;
      state.criteria.forEach((c, critIdx) => {
        const rating = state.ratings[optIdx][critIdx] || 0;
        total += rating * c.weight;
      });
      return { name, total, index: optIdx };
    });
  }

  function getMaxPossibleScore() {
    return state.criteria.reduce((sum, c) => sum + 5 * c.weight, 0);
  }

  // ===== Render: matrix =====
  function renderMatrix() {
    const container = document.getElementById('dm-matrix-container');
    container.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'dm-matrix';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const corner = document.createElement('td');
    corner.className = 'dm-cell';
    corner.style.background = 'transparent';
    corner.style.border = 'none';
    headerRow.appendChild(corner);

    state.criteria.forEach((c, idx) => {
      const th = document.createElement('td');
      th.className = 'dm-cell dm-header-cell';
      th.innerHTML = `
        <input type="text" class="dm-criterion-name-input" value="${escapeHTML(c.name)}" data-idx="${idx}" />
        <div class="dm-criterion-weight-label">Weight</div>
        <input type="number" class="dm-criterion-weight" min="1" max="5" value="${c.weight}" data-idx="${idx}" />
        <button class="dm-remove-btn" data-action="remove-criterion" data-idx="${idx}" title="Remove criterion">✕</button>
      `;
      headerRow.appendChild(th);
    });

    if (state.criteria.length < MAX_CRITERIA) {
      const addCell = document.createElement('td');
      addCell.className = 'dm-add-criterion-cell';
      addCell.innerHTML = `<button class="dm-add-btn" id="dm-add-criterion-btn">+ Criterion</button>`;
      headerRow.appendChild(addCell);
    }

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    state.options.forEach((opt, optIdx) => {
      const row = document.createElement('tr');

      const nameCell = document.createElement('td');
      nameCell.className = 'dm-cell dm-row-label-cell';
      nameCell.innerHTML = `
        <input type="text" class="dm-option-name-input" value="${escapeHTML(opt)}" data-idx="${optIdx}" />
        <button class="dm-remove-btn" data-action="remove-option" data-idx="${optIdx}" title="Remove option">✕</button>
      `;
      row.appendChild(nameCell);

      state.criteria.forEach((c, critIdx) => {
        const cell = document.createElement('td');
        cell.className = 'dm-cell dm-rating-cell';
        const rating = state.ratings[optIdx][critIdx] || 3;
        cell.innerHTML = `<input type="number" min="1" max="5" value="${rating}"
          data-opt="${optIdx}" data-crit="${critIdx}" class="dm-rating-input" />`;
        row.appendChild(cell);
      });

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    container.appendChild(table);

    if (state.options.length < MAX_OPTIONS) {
      const btnRow = document.createElement('div');
      btnRow.style.marginTop = '1rem';
      btnRow.innerHTML = `<button class="dm-add-btn" id="dm-add-option-btn">+ Option</button>`;
      container.appendChild(btnRow);
    }

    bindMatrixEvents();
  }

  function bindMatrixEvents() {
    document.querySelectorAll('.dm-criterion-name-input').forEach(el => {
      el.addEventListener('input', (e) => {
        setCriterionName(parseInt(e.target.dataset.idx, 10), e.target.value);
      });
    });

    document.querySelectorAll('.dm-criterion-weight').forEach(el => {
      el.addEventListener('input', (e) => {
        setCriterionWeight(parseInt(e.target.dataset.idx, 10), parseInt(e.target.value, 10) || 1);
      });
    });

    document.querySelectorAll('.dm-option-name-input').forEach(el => {
      el.addEventListener('input', (e) => {
        setOptionName(parseInt(e.target.dataset.idx, 10), e.target.value);
      });
    });

    document.querySelectorAll('.dm-rating-input').forEach(el => {
      el.addEventListener('input', (e) => {
        setRating(
          parseInt(e.target.dataset.opt, 10),
          parseInt(e.target.dataset.crit, 10),
          parseInt(e.target.value, 10) || 1
        );
      });
    });

    document.querySelectorAll('[data-action="remove-criterion"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        removeCriterion(parseInt(e.currentTarget.dataset.idx, 10));
      });
    });
    document.querySelectorAll('[data-action="remove-option"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        removeOption(parseInt(e.currentTarget.dataset.idx, 10));
      });
    });

    const addCritBtn = document.getElementById('dm-add-criterion-btn');
    if (addCritBtn) addCritBtn.addEventListener('click', addCriterion);

    const addOptBtn = document.getElementById('dm-add-option-btn');
    if (addOptBtn) addOptBtn.addEventListener('click', addOption);
  }

  // ===== Render: results =====
  function renderResults() {
    const container = document.getElementById('dm-results-container');
    if (!container) return;

    if (state.options.length === 0 || state.criteria.length === 0) {
      container.innerHTML = `
        <div class="dm-results-heading">Results</div>
        <p style="color: var(--muted); font-style: italic;">Add options and criteria to see results.</p>
      `;
      return;
    }

    const scores = computeScores();
    const sorted = [...scores].sort((a, b) => b.total - a.total);
    const winnerIdx = sorted[0].index;
    const maxScore = getMaxPossibleScore();

    let html = '<div class="dm-results-heading">Results</div>';

    sorted.forEach(s => {
      const isWinner = s.index === winnerIdx && sorted[0].total > (sorted[1] ? sorted[1].total : 0);
      const widthPct = maxScore > 0 ? (s.total / maxScore) * 100 : 0;
      html += `
        <div class="dm-result-row">
          <div class="dm-result-name">${escapeHTML(s.name)}</div>
          <div class="dm-result-bar-track">
            <div class="dm-result-bar-fill ${isWinner ? 'is-winner' : ''}" style="width: ${widthPct}%"></div>
          </div>
          <div class="dm-result-score ${isWinner ? 'is-winner' : ''}">${s.total}</div>
        </div>
      `;
    });

    html += `
      <div class="dm-reflection">
        Does this match your gut? If not, which rating or weight might be off?
      </div>
    `;

    container.innerHTML = html;
  }

  function renderAll() {
    renderMatrix();
    renderResults();
    updateURL();
  }

  // ===== Action buttons =====
  function setupActions() {
    document.getElementById('dm-reset-btn').addEventListener('click', () => {
      state = JSON.parse(JSON.stringify(DEFAULT_STATE));
      renderAll();
    });

    document.getElementById('dm-clear-btn').addEventListener('click', () => {
      if (!confirm('Clear all options and criteria?')) return;
      state = { options: [], criteria: [], ratings: [] };
      renderAll();
    });

    document.getElementById('dm-share-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(window.location.href)
        .then(() => showToast('Matrix link copied'))
        .catch(() => {
          const ta = document.createElement('textarea');
          ta.value = window.location.href;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); } catch (e) {}
          document.body.removeChild(ta);
          showToast('Matrix link copied');
        });
    });
  }

  // ===== Helpers =====
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function showToast(msg) {
    const toast = document.getElementById('dm-toast');
    toast.textContent = msg;
    toast.classList.add('is-visible');
    setTimeout(() => toast.classList.remove('is-visible'), 1800);
  }

  // ===== Boot =====
  function init() {
    loadFromURL();
    renderAll();
    setupActions();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
