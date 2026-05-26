/* The 5-Whys Partner — Day 16 */
(function () {
  'use strict';

  // ===== State =====
  const state = {
    tone: 'Direct',
    domain: 'Business',
    depth_style: 'Root cause',
    problem: '',
    messages: [],        // [{role: 'user'|'model', content: string}, ...]
    currentQuestion: 0,  // 0 = setup, 1-5 = whys, 6 = synthesis
    streaming: false,
  };

  let dom = {};

  // ===== Init =====
  function init() {
    dom = {
      setup: document.querySelector('.fw-setup'),
      conversation: document.querySelector('.fw-conversation'),
      progressLabel: document.querySelector('.fw-progress-label'),
      progressDots: document.querySelectorAll('.fw-progress-dot'),
      progressSynthesisMarker: document.querySelector('.fw-progress-synthesis-marker'),
      thread: document.querySelector('.fw-thread'),
      thinkingIndicator: document.querySelector('.fw-thinking-indicator'),
      inputArea: document.querySelector('.fw-input-area'),
      input: document.querySelector('.fw-input'),
      sendBtn: document.querySelector('.fw-send-btn'),
      problemInput: document.querySelector('.fw-problem-input'),
      beginBtn: document.querySelector('.fw-begin-btn'),
      endScreen: document.querySelector('.fw-end'),
      newSessionBtn: document.querySelector('.fw-new-session-btn'),
      copyBtn: document.querySelector('.fw-copy-btn'),
      error: document.querySelector('.fw-error'),
      toast: document.querySelector('.fw-toast'),
    };

    document.querySelectorAll('input[name="fw-tone"]').forEach(r => {
      r.addEventListener('change', () => { state.tone = r.value; });
    });
    document.querySelectorAll('input[name="fw-domain"]').forEach(r => {
      r.addEventListener('change', () => { state.domain = r.value; });
    });
    document.querySelectorAll('input[name="fw-depth"]').forEach(r => {
      r.addEventListener('change', () => { state.depth_style = r.value; });
    });

    dom.problemInput.addEventListener('input', () => {
      dom.beginBtn.disabled = !dom.problemInput.value.trim();
    });
    dom.beginBtn.disabled = true;

    dom.beginBtn.addEventListener('click', beginSession);

    dom.sendBtn.addEventListener('click', sendMessage);
    dom.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!state.streaming && dom.input.value.trim()) sendMessage();
      }
    });
    dom.input.addEventListener('input', () => {
      dom.input.style.height = 'auto';
      dom.input.style.height = dom.input.scrollHeight + 'px';
    });

    dom.newSessionBtn.addEventListener('click', resetToSetup);
    dom.copyBtn.addEventListener('click', copySynthesis);
  }

  // ===== Session lifecycle =====
  function beginSession() {
    const problem = dom.problemInput.value.trim();
    if (!problem) return;

    state.problem = problem;
    state.messages = [{ role: 'user', content: problem }];
    state.currentQuestion = 1;

    dom.setup.classList.add('is-hidden');
    dom.conversation.classList.add('is-visible');

    appendUserMessage(problem);
    updateProgress(1);

    streamBotResponse();
  }

  async function sendMessage() {
    const text = dom.input.value.trim();
    if (!text || state.streaming) return;

    state.messages.push({ role: 'user', content: text });
    appendUserMessage(text);
    dom.input.value = '';
    dom.input.style.height = 'auto';

    state.currentQuestion++;
    updateProgress(state.currentQuestion);

    await streamBotResponse();
  }

  async function streamBotResponse() {
    state.streaming = true;
    dom.input.disabled = true;
    dom.sendBtn.disabled = true;

    const isSynthesis = state.currentQuestion > 5;
    if (isSynthesis) {
      dom.inputArea.classList.add('is-hidden');
    }

    dom.thinkingIndicator.classList.remove('is-hidden');
    dom.error.classList.add('is-hidden');

    let botContainer = null;
    let fullText = '';
    let failed = false;

    try {
      const response = await fetch('/day-16/five-whys-partner/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: state.messages,
          tone: state.tone,
          domain: state.domain,
          depth_style: state.depth_style,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Error ${response.status}`);
      }

      const labelText = isSynthesis ? 'Synthesis' : `Why ${state.currentQuestion} of 5`;
      botContainer = appendBotMessage(labelText, isSynthesis);
      const contentEl = botContainer.querySelector('.fw-message-bot');
      const cursor = document.createElement('span');
      cursor.className = 'fw-typing-cursor';
      contentEl.appendChild(cursor);

      dom.thinkingIndicator.classList.add('is-hidden');

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
            continue; // skip malformed/incomplete chunk, don't abort
          }
          if (data.error) {
            streamError = data.message || 'The AI service returned an error.';
            continue;
          }
          if (data.text) {
            fullText += data.text;
            cursor.insertAdjacentText('beforebegin', data.text);
            botContainer.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }
          if (data.done) {
            cursor.remove();
          }
        }
      }

      cursor.remove();

      if (streamError && !fullText) {
        throw new Error(streamError);
      }

      state.messages.push({ role: 'model', content: fullText });

      if (isSynthesis) {
        endSession();
      }
    } catch (e) {
      failed = true;
      console.error('Stream failed:', e);
      dom.thinkingIndicator.classList.add('is-hidden');
      // Remove the empty bot bubble so a retry doesn't leave a blank message.
      if (botContainer && !fullText) botContainer.remove();

      if (state.messages.length === 1 && state.messages[0].role === 'user') {
        // Failed on the very first question — return to setup, keep the problem text.
        const problem = state.messages[0].content;
        resetToSetup();
        dom.problemInput.value = problem;
        dom.beginBtn.disabled = !problem.trim();
      } else if (state.messages.length && state.messages[state.messages.length - 1].role === 'user') {
        // Roll back the typed answer so the user can retry cleanly.
        state.messages.pop();
        state.currentQuestion = Math.max(1, state.currentQuestion - 1);
        updateProgress(state.currentQuestion);
      }
      showError(e.message || 'Something went wrong. Please try again.');
    } finally {
      state.streaming = false;
      // On failure, always restore the input so the user can retry — even mid-synthesis.
      if (!isSynthesis || failed) {
        dom.inputArea.classList.remove('is-hidden');
        dom.input.disabled = false;
        dom.sendBtn.disabled = false;
      }
    }
  }

  // ===== Rendering =====
  function appendUserMessage(text) {
    const el = document.createElement('div');
    el.className = 'fw-message fw-message-user';
    el.textContent = text;
    dom.thread.appendChild(el);
    el.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  function appendBotMessage(label, isSynthesis) {
    const container = document.createElement('div');
    container.className = 'fw-message-bot-container';

    const labelEl = document.createElement('div');
    labelEl.className = 'fw-message-bot-label';
    labelEl.textContent = label;
    container.appendChild(labelEl);

    const messageEl = document.createElement('div');
    messageEl.className = 'fw-message fw-message-bot';
    if (isSynthesis) messageEl.classList.add('is-synthesis');
    container.appendChild(messageEl);

    dom.thread.appendChild(container);
    return container;
  }

  function updateProgress(questionNum) {
    if (questionNum <= 5) {
      dom.progressLabel.textContent = `Why ${questionNum} of 5`;
      dom.progressDots.forEach((dot, idx) => {
        dot.classList.remove('is-active', 'is-complete');
        if (idx < questionNum - 1) dot.classList.add('is-complete');
        else if (idx === questionNum - 1) dot.classList.add('is-active');
      });
      dom.progressSynthesisMarker.classList.remove('is-active');
    } else {
      dom.progressLabel.textContent = 'Synthesis';
      dom.progressDots.forEach(dot => {
        dot.classList.remove('is-active');
        dot.classList.add('is-complete');
      });
      dom.progressSynthesisMarker.classList.add('is-active');
    }
  }

  function endSession() {
    dom.inputArea.classList.add('is-hidden');
    dom.endScreen.classList.add('is-visible');
    dom.endScreen.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  function resetToSetup() {
    state.messages = [];
    state.currentQuestion = 0;
    state.problem = '';
    dom.thread.innerHTML = '';
    dom.problemInput.value = '';
    dom.input.value = '';
    dom.beginBtn.disabled = true;

    dom.conversation.classList.remove('is-visible');
    dom.endScreen.classList.remove('is-visible');
    dom.inputArea.classList.remove('is-hidden');
    dom.input.disabled = false;
    dom.sendBtn.disabled = false;
    dom.setup.classList.remove('is-hidden');
    dom.error.classList.add('is-hidden');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function copySynthesis() {
    const botMessages = dom.thread.querySelectorAll('.fw-message-bot');
    if (botMessages.length === 0) return;
    const synthesis = botMessages[botMessages.length - 1].textContent;

    const done = () => showToast('Synthesis copied');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(synthesis).then(done).catch(() => fallbackCopy(synthesis, done));
    } else {
      fallbackCopy(synthesis, done);
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
  }

  function showToast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add('is-visible');
    setTimeout(() => dom.toast.classList.remove('is-visible'), 1800);
  }

  // ===== Boot =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
