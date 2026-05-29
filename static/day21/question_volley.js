/* The Question Volley — Day 21. Conversation lives entirely in the URL hash. */
(function () {
  'use strict';

  // ===== Module 1: Constants & deck =====
  const MAX_CHARS = 280;
  const SOFT_CAP_VOLLEYS = 10; // measured in questions asked
  const SCHEMA_VERSION = 1;
  const NAME_STORAGE_KEY = 'qv_my_name';

  const QUESTION_DECK = {
    "Getting to know you": [
      "What's something you changed your mind about recently?",
      "What's a small thing that reliably makes your day better?",
      "What did you want to be when you were ten?",
      "What's a skill you'd love to have but have never pursued?",
      "What's the last thing that made you laugh out loud?",
      "Where do you feel most like yourself?",
      "What's a question you wish people asked you more often?",
      "What's something you're looking forward to?",
    ],
    "For close ones": [
      "When did you last feel genuinely proud of me?",
      "What's something you've never told me but always wanted to?",
      "What do you think I worry about too much?",
      "What's a moment with me you think about often?",
      "How have I changed since we first met?",
      "What's something you need more of from me?",
      "What do you think we're best at, together?",
      "What's a memory of us you'd want to keep forever?",
    ],
    "Playful": [
      "If you had to eat one meal for a month, what would it be?",
      "What's the most useless talent you have?",
      "If you could instantly master one instrument, which?",
      "What fictional world would you most want to live in?",
      "What's your most irrational fear?",
      "If your life had a theme song, what would it be?",
      "What's the best gift you've ever received?",
      "What would you do with a completely free, obligation-free day?",
    ],
    "Deep": [
      "What's something you're still trying to forgive yourself for?",
      "What does a meaningful life look like to you?",
      "What belief did you inherit that you no longer hold?",
      "When did you last feel truly at peace?",
      "What are you most afraid of losing?",
      "What would you do if you knew you couldn't fail?",
      "What's a truth about yourself you've only recently accepted?",
      "What do you hope people remember about you?",
    ],
  };
  const CATEGORIES = Object.keys(QUESTION_DECK);
  const WRITE_OWN = "Write your own";

  // ===== Module 2: Encode / decode =====
  function encodeConversation(state) {
    const json = JSON.stringify(state);
    return LZString.compressToEncodedURIComponent(json);
  }

  function decodeConversation(encoded) {
    try {
      const json = LZString.decompressFromEncodedURIComponent(encoded);
      if (!json) return null;
      const state = JSON.parse(json);
      if (!state || state.v !== SCHEMA_VERSION || !Array.isArray(state.turns)) return null;
      if (!Array.isArray(state.names)) state.names = ['', ''];
      return state;
    } catch (e) {
      return null;
    }
  }

  function buildLink(state) {
    return `${window.location.origin}${window.location.pathname}#c=${encodeConversation(state)}`;
  }

  // ===== Module 3: State =====
  const state = {
    conversation: null,
    myPersonIndex: null,
  };

  function whoseTurn(conversation) {
    const turns = conversation.turns;
    const lastTurn = turns[turns.length - 1];
    if (lastTurn && lastTurn[1] === 'q') {
      return lastTurn[0] === 0 ? 1 : 0;
    }
    return null; // conversation wrapped up (ended on an answer)
  }

  function questionCount(conversation) {
    return conversation.turns.filter(t => t[1] === 'q').length;
  }

  // ===== Module 9 (helpers, defined early) =====
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function switchScreen(name) {
    $all('.qv-screen').forEach(s => s.classList.toggle('is-active', s.dataset.screen === name));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showToast(msg) {
    const t = $('.qv-toast');
    t.textContent = msg;
    t.classList.add('is-visible');
    setTimeout(() => t.classList.remove('is-visible'), 2000);
  }

  function showError(msg) {
    const e = $('.qv-error');
    e.textContent = msg;
    e.classList.remove('is-hidden');
    setTimeout(() => e.classList.add('is-hidden'), 5000);
  }

  function savedName() {
    try { return localStorage.getItem(NAME_STORAGE_KEY) || ''; } catch (e) { return ''; }
  }
  function rememberName(name) {
    try { if (name) localStorage.setItem(NAME_STORAGE_KEY, name); } catch (e) {}
  }

  // ===== Reusable question picker =====
  // root must contain .qv-categories, .qv-questions, .qv-custom-wrap (with
  // .qv-custom-input + .qv-custom-counter). Returns { getText, reset }.
  function buildPicker(root, onChange) {
    const catsEl = $('.qv-categories', root);
    const qsEl = $('.qv-questions', root);
    const customWrap = $('.qv-custom-wrap', root);
    const customInput = $('.qv-custom-input', root);
    const customCounter = $('.qv-custom-counter', root);

    let selectedText = '';
    let mode = null; // category name or WRITE_OWN

    catsEl.innerHTML = '';
    [...CATEGORIES, WRITE_OWN].forEach(cat => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'qv-cat-chip';
      chip.textContent = cat;
      chip.dataset.cat = cat;
      chip.addEventListener('click', () => selectCategory(cat));
      catsEl.appendChild(chip);
    });

    function selectCategory(cat) {
      mode = cat;
      $all('.qv-cat-chip', catsEl).forEach(c => { c.dataset.active = (c.dataset.cat === cat) ? 'true' : 'false'; });
      selectedText = '';
      onChange(selectedText);
      if (cat === WRITE_OWN) {
        qsEl.innerHTML = '';
        customWrap.classList.remove('is-hidden');
        customInput.value = '';
        updateCounter();
        customInput.focus();
      } else {
        customWrap.classList.add('is-hidden');
        renderQuestions(cat);
      }
    }

    function renderQuestions(cat) {
      qsEl.innerHTML = '';
      QUESTION_DECK[cat].forEach(q => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'qv-question-card';
        card.textContent = q;
        card.addEventListener('click', () => {
          selectedText = q;
          $all('.qv-question-card', qsEl).forEach(c => c.classList.remove('is-selected'));
          card.classList.add('is-selected');
          onChange(selectedText);
        });
        qsEl.appendChild(card);
      });
    }

    function updateCounter() {
      const len = customInput.value.length;
      customCounter.textContent = `${len} / ${MAX_CHARS}`;
      customCounter.classList.toggle('is-over', len > MAX_CHARS);
    }

    customInput.addEventListener('input', () => {
      updateCounter();
      selectedText = customInput.value.trim();
      onChange(selectedText);
    });

    function reset() {
      mode = null;
      selectedText = '';
      $all('.qv-cat-chip', catsEl).forEach(c => { c.dataset.active = 'false'; });
      qsEl.innerHTML = '';
      customWrap.classList.add('is-hidden');
      customInput.value = '';
      updateCounter();
    }

    return {
      getText() {
        const t = (selectedText || '').trim();
        if (!t || t.length > MAX_CHARS) return null;
        return t;
      },
      reset,
    };
  }

  // ===== Char counter for a plain textarea =====
  function bindCounter(input, counter) {
    function update() {
      const len = input.value.length;
      counter.textContent = `${len} / ${MAX_CHARS}`;
      counter.classList.toggle('is-over', len > MAX_CHARS);
    }
    input.addEventListener('input', update);
    update();
    return update;
  }

  // ===== Module 7: Thread rendering =====
  function renderThread(container, conversation) {
    container.innerHTML = '';
    const names = conversation.names || ['', ''];
    conversation.turns.forEach(turn => {
      const [authorIdx, type, text] = turn;
      const group = document.createElement('div');
      group.className = `qv-bubble-group ${authorIdx === 0 ? 'is-a' : 'is-b'}`;
      const name = names[authorIdx] || (authorIdx === 0 ? 'Person A' : 'Person B');
      group.innerHTML = `
        <div class="qv-bubble-name">${escapeHTML(name)}</div>
        <div class="qv-bubble ${type === 'q' ? 'is-question' : ''}">
          <div class="qv-bubble-type">${type === 'q' ? 'asked' : 'replied'}</div>
          ${escapeHTML(text)}
        </div>`;
      container.appendChild(group);
    });
  }

  // ===== Compose first question (Screen 2) =====
  let composePicker = null;

  function showComposeScreen() {
    const nameInput = $('#qv-compose-name');
    nameInput.value = savedName();
    if (!composePicker) {
      composePicker = buildPicker($('#qv-compose .qv-picker'), () => updateComposeBtn());
    } else {
      composePicker.reset();
    }
    updateComposeBtn();
    switchScreen('compose');
  }

  function updateComposeBtn() {
    $('#qv-create-btn').disabled = !composePicker || !composePicker.getText();
  }

  function onCreateLink() {
    const q = composePicker.getText();
    if (!q) return;
    const myName = $('#qv-compose-name').value.trim().slice(0, 40);
    rememberName(myName);
    state.conversation = {
      v: SCHEMA_VERSION,
      names: [myName, ''],
      turns: [[0, 'q', q]],
    };
    state.myPersonIndex = 0;
    showLinkReady(buildLink(state.conversation), q);
  }

  // ===== Link ready (Screen 3) =====
  function showLinkReady(link, questionText) {
    $('.qv-link-field').value = link;
    $('#qv-link-question').textContent = questionText || '';
    switchScreen('link-ready');
  }

  // ===== Received / your turn (Screen 4) =====
  let askPicker = null;

  function showReceivedScreen() {
    const conv = state.conversation;
    renderThread($('#qv-received .qv-thread'), conv);

    const turn = whoseTurn(conv);
    const answerSection = $('#qv-answer-section');
    const askSection = $('#qv-ask-section');
    const sendBtn = $('#qv-send-btn');
    const endedNote = $('#qv-ended-note');
    const softNote = $('.qv-softcap-note');

    // Wrapped-up conversation (ended on an answer) → read-only.
    if (turn === null) {
      answerSection.classList.add('is-hidden');
      askSection.classList.add('is-hidden');
      sendBtn.classList.add('is-hidden');
      endedNote.classList.remove('is-hidden');
      switchScreen('received');
      return;
    }
    endedNote.classList.add('is-hidden');
    sendBtn.classList.remove('is-hidden');
    answerSection.classList.remove('is-hidden');

    state.myPersonIndex = turn;

    // Name input if this person isn't named yet.
    const nameWrap = $('#qv-received-name-wrap');
    const nameInput = $('#qv-received-name');
    if (!conv.names[turn]) {
      nameWrap.classList.remove('is-hidden');
      nameInput.value = savedName();
    } else {
      nameWrap.classList.add('is-hidden');
    }

    // The pending question to answer is the last turn.
    const lastQ = conv.turns[conv.turns.length - 1];
    $('#qv-answer-prompt').textContent = lastQ[2];

    const answerInput = $('#qv-answer-input');
    answerInput.value = '';
    bindCounter(answerInput, $('#qv-answer-counter'));
    answerInput.addEventListener('input', updateSendBtn);

    // Soft cap: if 10 questions already asked, no new question allowed.
    const capped = questionCount(conv) >= SOFT_CAP_VOLLEYS;
    if (capped) {
      askSection.classList.add('is-hidden');
      softNote.classList.remove('is-hidden');
      askPicker = null;
    } else {
      askSection.classList.remove('is-hidden');
      softNote.classList.add('is-hidden');
      if (!askPicker) {
        askPicker = buildPicker($('#qv-received .qv-ask-picker'), () => updateSendBtn());
      } else {
        askPicker.reset();
      }
    }

    updateSendBtn();
    switchScreen('received');
  }

  function updateSendBtn() {
    const answer = $('#qv-answer-input').value.trim();
    const conv = state.conversation;
    const capped = questionCount(conv) >= SOFT_CAP_VOLLEYS;
    const answerOk = answer.length > 0 && answer.length <= MAX_CHARS;
    const askOk = capped || (askPicker && askPicker.getText());
    $('#qv-send-btn').disabled = !(answerOk && askOk);
  }

  function onSendBack() {
    const conv = state.conversation;
    const myIdx = state.myPersonIndex;
    const answer = $('#qv-answer-input').value.trim();
    if (!answer || answer.length > MAX_CHARS) return;

    const capped = questionCount(conv) >= SOFT_CAP_VOLLEYS;
    const askText = capped ? null : (askPicker && askPicker.getText());
    if (!capped && !askText) return;

    // Update name
    const nameInput = $('#qv-received-name');
    if (!conv.names[myIdx] && nameInput.value.trim()) {
      conv.names[myIdx] = nameInput.value.trim().slice(0, 40);
      rememberName(conv.names[myIdx]);
    }

    conv.turns.push([myIdx, 'a', answer]);
    if (askText) conv.turns.push([myIdx, 'q', askText]);

    const link = buildLink(conv);
    const preview = askText
      ? askText
      : 'You wrapped up the conversation. Send this final reply back.';
    showLinkReady(link, preview);
  }

  // ===== Module 4: Screen routing =====
  function init() {
    // Static button wiring
    $('#qv-start-btn').addEventListener('click', showComposeScreen);
    $('#qv-create-btn').addEventListener('click', onCreateLink);
    $('#qv-send-btn').addEventListener('click', onSendBack);
    $('.qv-copy-btn').addEventListener('click', () => {
      const link = $('.qv-link-field').value;
      const done = () => showToast('Link copied — send it to your person');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(done).catch(() => fallbackCopy(link, done));
      } else { fallbackCopy(link, done); }
    });
    $('#qv-new-volley-btn').addEventListener('click', () => {
      state.conversation = null;
      state.myPersonIndex = null;
      try { history.replaceState(null, '', window.location.pathname); } catch (e) {}
      showIntroScreen();
    });

    const hash = window.location.hash;
    if (hash.startsWith('#c=')) {
      const conv = decodeConversation(hash.slice(3));
      if (conv) {
        state.conversation = conv;
        state.myPersonIndex = whoseTurn(conv);
        showReceivedScreen();
        return;
      }
      showError('This link seems incomplete or corrupted. Starting fresh instead.');
    }
    showIntroScreen();
  }

  function showIntroScreen() { switchScreen('intro'); }

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

  // Expose a few internals for headless testing (no effect in browser use).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { whoseTurn, questionCount, SOFT_CAP_VOLLEYS };
  }

  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})();
