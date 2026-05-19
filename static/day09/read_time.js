/* Read Time — Day 9 */
(function () {
  'use strict';

  const SAMPLE_TEXT = `Reading speed varies widely among adults. A common estimate places average silent reading at around 250 words per minute, though comprehension tests suggest that careful reading often happens closer to 200 words per minute. Skimming, in contrast, can reach 400 words per minute or higher, at the cost of detail.

Speaking is slower. Conversational speech in English averages roughly 130 words per minute, with formal lectures or podcasts sometimes faster. The gap between reading speed and speaking speed is one reason why audiobook listeners often prefer 1.5x playback — to bring spoken pace closer to the listener's reading pace.

When you write something, knowing how long it will take to read or speak can shape decisions: tighten the email, expand the talk, split the essay into a thread. Most tools tell you word count. Few make the consumption time visible at a glance.`;

  const REDUCED_MOTION =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ===== DOM refs =====
  const textarea = document.getElementById('rt-text');
  const readSlider = document.getElementById('rt-read-speed');
  const readLabel = document.getElementById('rt-read-speed-label');
  const speakSlider = document.getElementById('rt-speak-speed');
  const speakLabel = document.getElementById('rt-speak-speed-label');
  const copyBtn = document.getElementById('rt-copy-btn');
  const clearBtn = document.getElementById('rt-clear-btn');
  const sampleBtn = document.getElementById('rt-sample-btn');
  const toast = document.getElementById('rt-toast');

  const stat = {
    words: document.getElementById('rt-stat-words'),
    chars: document.getElementById('rt-stat-chars'),
    charsSub: document.getElementById('rt-stat-chars-sub'),
    paragraphs: document.getElementById('rt-stat-paragraphs'),
    sentences: document.getElementById('rt-stat-sentences'),
    readTime: document.getElementById('rt-stat-read-time'),
    readTimeSub: document.getElementById('rt-stat-read-time-sub'),
    speakTime: document.getElementById('rt-stat-speak-time'),
    speakTimeSub: document.getElementById('rt-stat-speak-time-sub'),
    tweets: document.getElementById('rt-stat-tweets'),
    threads: document.getElementById('rt-stat-threads'),
  };

  // ===== State =====
  const prevValues = {};
  let recomputeTimer = null;

  // ===== Counting =====
  function countWords(text) {
    if (!text || !text.trim()) return 0;
    return text.trim().split(/\s+/).length;
  }
  function countChars(text, includeSpaces) {
    return includeSpaces ? text.length : text.replace(/\s/g, '').length;
  }
  function countParagraphs(text) {
    if (!text || !text.trim()) return 0;
    return text.trim().split(/\n\s*\n/).filter(p => p.trim()).length;
  }
  function countSentences(text) {
    if (!text || !text.trim()) return 0;
    const masked = text
      .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Rev|vs|etc|e\.g|i\.e|U\.S|U\.K|a\.m|p\.m|approx|No)\.\s/gi, '$1<DOT> ')
      .replace(/\.{3,}/g, '<ELLIPSIS>');
    const parts = masked.split(/[.!?]+(?=\s|$)/).map(s => s.trim()).filter(s => s.length > 0);
    return parts.length;
  }
  function calcReadTimeSeconds(wordCount, wpm) {
    if (!wpm) return 0;
    return (wordCount / wpm) * 60;
  }
  function formatTime(seconds) {
    if (seconds < 1) return '< 1 sec';
    if (seconds < 60) return Math.round(seconds) + ' sec';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins < 60) return secs > 0 ? mins + ' min ' + secs + ' sec' : mins + ' min';
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return hrs + 'h ' + remainMins + 'm';
  }
  function calcTweets(text) {
    if (!text || !text.trim()) return 0;
    const TWEET_MAX = 280;
    const words = text.trim().split(/\s+/);
    let chunks = 0;
    let current = '';
    for (const w of words) {
      if (w.length > TWEET_MAX) {
        if (current) { chunks++; current = ''; }
        chunks += Math.ceil(w.length / TWEET_MAX);
        continue;
      }
      const tentative = current ? current + ' ' + w : w;
      if (tentative.length > TWEET_MAX) {
        chunks++;
        current = w;
      } else {
        current = tentative;
      }
    }
    if (current) chunks++;
    return chunks;
  }
  function calcThreads(tweetCount) {
    if (tweetCount <= 0) return 0;
    return Math.ceil(tweetCount / 15);
  }

  // ===== Render =====
  function pulse(el) {
    if (!el || REDUCED_MOTION) return;
    el.classList.add('is-pulsing');
    setTimeout(() => el.classList.remove('is-pulsing'), 150);
  }

  function setValue(key, newValue) {
    const el = stat[key];
    if (!el) return;
    if (prevValues[key] !== newValue) {
      el.textContent = newValue;
      pulse(el);
      prevValues[key] = newValue;
    }
  }

  function recompute() {
    const text = textarea.value || '';
    const wpm = parseInt(readSlider.value, 10) || 250;
    const spm = parseInt(speakSlider.value, 10) || 130;

    const words = countWords(text);
    const charsWithSpaces = countChars(text, true);
    const charsNoSpaces = countChars(text, false);
    const paragraphs = countParagraphs(text);
    const sentences = countSentences(text);
    const readSecs = calcReadTimeSeconds(words, wpm);
    const speakSecs = calcReadTimeSeconds(words, spm);
    const tweets = calcTweets(text);
    const threads = calcThreads(tweets);

    setValue('words', words.toLocaleString());
    setValue('chars', charsWithSpaces.toLocaleString());
    setValue('paragraphs', paragraphs.toLocaleString());
    setValue('sentences', sentences.toLocaleString());
    setValue('readTime', words > 0 ? formatTime(readSecs) : '—');
    setValue('speakTime', words > 0 ? formatTime(speakSecs) : '—');
    setValue('tweets', tweets.toLocaleString());
    setValue('threads', threads.toLocaleString());

    if (stat.charsSub) stat.charsSub.textContent = charsNoSpaces.toLocaleString() + ' without spaces';
    if (stat.readTimeSub) stat.readTimeSub.textContent = 'at ' + wpm + ' wpm';
    if (stat.speakTimeSub) stat.speakTimeSub.textContent = 'at ' + spm + ' wpm';
  }

  function debouncedRecompute() {
    if (recomputeTimer) clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(recompute, 50);
  }

  function updateReadLabel() {
    readLabel.textContent = 'Reading speed: ' + readSlider.value + ' wpm';
  }
  function updateSpeakLabel() {
    speakLabel.textContent = 'Speaking speed: ' + speakSlider.value + ' wpm';
  }

  // ===== Actions =====
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('is-visible');
    setTimeout(() => toast.classList.remove('is-visible'), 2000);
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  }

  function handleCopySummary() {
    const text = textarea.value || '';
    if (!text.trim()) {
      showToast('Paste some text first');
      return;
    }
    const words = countWords(text);
    const chars = countChars(text, true);
    const wpm = parseInt(readSlider.value, 10) || 250;
    const spm = parseInt(speakSlider.value, 10) || 130;
    const readSecs = calcReadTimeSeconds(words, wpm);
    const speakSecs = calcReadTimeSeconds(words, spm);
    const tweets = calcTweets(text);

    const summary =
      words.toLocaleString() + ' words · ' +
      chars.toLocaleString() + ' chars · ' +
      formatTime(readSecs) + ' read · ' +
      formatTime(speakSecs) + ' spoken · ' +
      tweets + ' tweet' + (tweets === 1 ? '' : 's');

    copyToClipboard(summary)
      .then(() => showToast('Summary copied'))
      .catch(() => showToast('Copy failed'));
  }

  function handleClear() {
    const n = countWords(textarea.value);
    if (n > 200) {
      if (!confirm('Clear ' + n.toLocaleString() + ' words of text?')) return;
    }
    textarea.value = '';
    recompute();
    textarea.focus();
  }

  function handleSample() {
    textarea.value = SAMPLE_TEXT;
    recompute();
  }

  // ===== Boot =====
  function init() {
    textarea.addEventListener('input', debouncedRecompute);
    readSlider.addEventListener('input', () => {
      updateReadLabel();
      recompute();
    });
    speakSlider.addEventListener('input', () => {
      updateSpeakLabel();
      recompute();
    });
    copyBtn.addEventListener('click', handleCopySummary);
    clearBtn.addEventListener('click', handleClear);
    sampleBtn.addEventListener('click', handleSample);

    updateReadLabel();
    updateSpeakLabel();
    recompute();
    textarea.focus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
