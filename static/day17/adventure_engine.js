/* The Adventure Engine — Day 17 */
(function () {
  'use strict';

  // ===== State =====
  const state = {
    genre: null,
    protagonist: '',
    currentTurn: 0,       // 0 = setup, 1-6 = playing
    history: [],          // [{role: 'user'|'model', content: string}]
    streaming: false,
    fullStoryText: '',
    prevChoices: [],      // choices currently shown (for retry rollback)
    pendingTransition: null, // chosen-action element added before a continuation
  };

  let dom = {};

  // ===== Init =====
  function init() {
    dom = {
      setup: document.querySelector('.ae-setup'),
      storyScreen: document.querySelector('.ae-story-screen'),
      progressLabel: document.querySelector('.ae-progress-label'),
      progressDots: document.querySelectorAll('.ae-progress-dot'),
      storyContent: document.querySelector('.ae-story-content'),
      choices: document.querySelector('.ae-choices'),
      thinking: document.querySelector('.ae-thinking'),
      protagonistInput: document.querySelector('.ae-protagonist-input'),
      beginBtn: document.querySelector('.ae-begin-btn'),
      genreButtons: document.querySelectorAll('.ae-genre-btn'),
      endScreen: document.querySelector('.ae-end'),
      newAdventureBtn: document.querySelector('.ae-new-adventure-btn'),
      copyBtn: document.querySelector('.ae-copy-btn'),
      error: document.querySelector('.ae-error'),
      toast: document.querySelector('.ae-toast'),
    };

    dom.genreButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        dom.genreButtons.forEach(b => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        state.genre = btn.dataset.genre;
        updateBeginButton();
      });
    });

    dom.protagonistInput.addEventListener('input', () => {
      state.protagonist = dom.protagonistInput.value.trim();
      updateBeginButton();
    });

    dom.beginBtn.addEventListener('click', beginAdventure);
    dom.newAdventureBtn.addEventListener('click', resetToSetup);
    dom.copyBtn.addEventListener('click', copyStory);
  }

  function updateBeginButton() {
    dom.beginBtn.disabled = !(state.genre && state.protagonist.length > 0);
  }

  // ===== Adventure lifecycle =====
  async function beginAdventure() {
    if (!state.genre || !state.protagonist) return;

    state.currentTurn = 1;
    state.history = [];

    dom.setup.classList.add('is-hidden');
    dom.storyScreen.classList.add('is-visible');

    await streamTurn();
  }

  async function streamTurn() {
    state.streaming = true;
    state.fullStoryText = '';

    updateProgress(state.currentTurn);

    dom.thinking.classList.remove('is-hidden');
    dom.choices.classList.add('is-hidden');
    dom.error.classList.add('is-hidden');

    const turnEl = document.createElement('div');
    turnEl.className = 'ae-story-turn';
    turnEl.innerHTML = `
      <div class="ae-turn-label">${state.currentTurn < 6 ? `Turn ${state.currentTurn} of 6` : 'The End'}</div>
      <div class="ae-story-text"><span class="ae-text-content"></span></div>
    `;
    dom.storyContent.appendChild(turnEl);

    const contentEl = turnEl.querySelector('.ae-text-content');
    const cursor = document.createElement('span');
    cursor.className = 'ae-typing-cursor';
    contentEl.appendChild(cursor);

    try {
      const response = await fetch('/day-17/adventure-engine/story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          genre: state.genre,
          protagonist: state.protagonist,
          history: state.history,
          turn: state.currentTurn,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Error ${response.status}`);
      }

      dom.thinking.classList.add('is-hidden');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamError = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop();

        for (const line of parts) {
          if (!line.startsWith('data: ')) continue;
          let data;
          try {
            data = JSON.parse(line.slice(6));
          } catch (e) {
            continue; // skip malformed/incomplete chunk
          }
          if (data.error) {
            streamError = data.message || 'The AI service returned an error.';
            continue;
          }
          if (data.text) {
            state.fullStoryText += data.text;
            cursor.insertAdjacentText('beforebegin', data.text);
            turnEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }
          if (data.done) {
            cursor.remove();
          }
        }
      }

      cursor.remove();

      if (streamError && !state.fullStoryText) {
        throw new Error(streamError);
      }

      const { storyText, choices } = parseStoryOutput(state.fullStoryText, state.currentTurn);

      contentEl.innerHTML = formatStoryText(storyText);

      state.history.push({ role: 'model', content: state.fullStoryText });

      if (state.currentTurn < 6) {
        if (choices.length === 3) {
          renderChoices(choices);
        } else if (choices.length > 0) {
          // Forgiving: pad/truncate to 3 if the model gave an odd count but something usable.
          const padded = choices.slice(0, 3);
          while (padded.length < 3) padded.push('Continue.');
          renderChoices(padded);
        } else {
          console.warn('Expected 3 choices, got:', choices.length);
          showError('The story didn\'t produce choices this turn. Try "Start new adventure".');
          showEndScreen();
        }
      } else {
        showEndScreen();
      }
    } catch (e) {
      console.error('Stream failed:', e);
      dom.thinking.classList.add('is-hidden');
      try { cursor.remove(); } catch (_) {}
      // Remove the empty/partial turn so retry is clean.
      if (turnEl && !state.fullStoryText) turnEl.remove();

      if (state.currentTurn <= 1) {
        // Opening failed — return to setup, keep the genre + protagonist.
        const keepGenre = state.genre;
        const keepProtagonist = state.protagonist;
        resetToSetup();
        state.genre = keepGenre;
        state.protagonist = keepProtagonist;
        dom.protagonistInput.value = keepProtagonist;
        dom.genreButtons.forEach(b => b.classList.toggle('is-selected', b.dataset.genre === keepGenre));
        updateBeginButton();
      } else {
        // Continuation failed — undo the choice and let the user pick again.
        if (state.pendingTransition) { state.pendingTransition.remove(); state.pendingTransition = null; }
        if (state.history.length && state.history[state.history.length - 1].role === 'user') {
          state.history.pop();
        }
        state.currentTurn--;
        updateProgress(state.currentTurn);
        if (state.prevChoices.length) renderChoices(state.prevChoices);
      }
      showError(e.message || 'Something went wrong. Please try again.');
    } finally {
      state.streaming = false;
    }
  }

  function parseStoryOutput(text, turnNumber) {
    if (turnNumber === 6) {
      return { storyText: stripTrailingChoices(text).trim(), choices: [] };
    }

    const choiceRegex = /CHOICE\s*(\d+)\s*[:.\-]\s*(.+?)(?=CHOICE\s*\d+\s*[:.\-]|$)/gis;
    const matches = Array.from(text.matchAll(choiceRegex));

    if (matches.length === 0) {
      return { storyText: text.trim(), choices: [] };
    }

    const firstChoiceIdx = text.search(/CHOICE\s*1\s*[:.\-]/i);
    const storyText = firstChoiceIdx > -1 ? text.slice(0, firstChoiceIdx).trim() : text.trim();

    const choices = matches
      .slice(0, 3)
      .map(m => m[2].trim().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' '))
      .filter(Boolean);

    return { storyText, choices };
  }

  function stripTrailingChoices(text) {
    const idx = text.search(/CHOICE\s*1\s*[:.\-]/i);
    return idx > -1 ? text.slice(0, idx) : text;
  }

  function formatStoryText(text) {
    const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(p => p);
    if (paragraphs.length === 0) return '';
    return paragraphs.map(p => `<p>${escapeHTML(p)}</p>`).join('');
  }

  function renderChoices(choices) {
    state.prevChoices = choices.slice();
    dom.choices.innerHTML = '';
    choices.forEach((choice, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ae-choice-btn';
      btn.innerHTML = `
        <span class="ae-choice-number">${idx + 1}</span>
        <span class="ae-choice-text">${escapeHTML(choice)}</span>
      `;
      btn.addEventListener('click', () => handleChoiceClick(idx + 1, choice));
      dom.choices.appendChild(btn);
    });
    dom.choices.classList.remove('is-hidden');
    dom.choices.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  async function handleChoiceClick(choiceNum, choiceText) {
    if (state.streaming) return;

    dom.choices.querySelectorAll('.ae-choice-btn').forEach(b => { b.disabled = true; });

    const transition = document.createElement('div');
    transition.className = 'ae-chosen-action';
    transition.textContent = choiceText;
    dom.storyContent.appendChild(transition);
    state.pendingTransition = transition;

    state.history.push({ role: 'user', content: `I choose: ${choiceText}` });

    dom.choices.classList.add('is-hidden');

    state.currentTurn++;
    await streamTurn();
    state.pendingTransition = null;
  }

  function updateProgress(turnNum) {
    dom.progressLabel.textContent = turnNum <= 5 ? `Turn ${turnNum} of 6` : 'The End';
    dom.progressDots.forEach((dot, idx) => {
      dot.classList.remove('is-active', 'is-complete');
      if (idx < turnNum - 1) dot.classList.add('is-complete');
      else if (idx === turnNum - 1) dot.classList.add('is-active');
    });
  }

  function showEndScreen() {
    dom.endScreen.classList.add('is-visible');
    dom.endScreen.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  function resetToSetup() {
    state.genre = null;
    state.protagonist = '';
    state.currentTurn = 0;
    state.history = [];
    state.fullStoryText = '';
    state.prevChoices = [];
    state.pendingTransition = null;

    dom.storyContent.innerHTML = '';
    dom.choices.innerHTML = '';
    dom.choices.classList.add('is-hidden');
    dom.protagonistInput.value = '';
    dom.genreButtons.forEach(b => b.classList.remove('is-selected'));
    dom.beginBtn.disabled = true;

    dom.progressDots.forEach(d => d.classList.remove('is-active', 'is-complete'));

    dom.storyScreen.classList.remove('is-visible');
    dom.endScreen.classList.remove('is-visible');
    dom.setup.classList.remove('is-hidden');
    dom.error.classList.add('is-hidden');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function copyStory() {
    let storyText = `Genre: ${state.genre}\nProtagonist: ${state.protagonist}\n\n`;

    const turns = dom.storyContent.querySelectorAll('.ae-story-turn');
    const actions = dom.storyContent.querySelectorAll('.ae-chosen-action');

    turns.forEach((turn, idx) => {
      const label = (turn.querySelector('.ae-turn-label') || {}).textContent || '';
      const text = (turn.querySelector('.ae-story-text') || {}).textContent || '';
      storyText += `--- ${label} ---\n\n${text.trim()}\n\n`;
      if (idx < actions.length) {
        storyText += `→ ${actions[idx].textContent.replace(/^→\s*/, '')}\n\n`;
      }
    });

    storyText += '--- The End ---';

    const done = () => showToast('Story copied');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(storyText).then(done).catch(() => fallbackCopy(storyText, done));
    } else {
      fallbackCopy(storyText, done);
    }
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    done();
  }

  function showError(message) {
    dom.error.textContent = message;
    dom.error.classList.remove('is-hidden');
    dom.error.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  function showToast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add('is-visible');
    setTimeout(() => dom.toast.classList.remove('is-visible'), 1800);
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ===== Boot =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
