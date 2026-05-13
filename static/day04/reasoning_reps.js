/* Reasoning Reps — Day 4 */
(function () {
  const STORAGE_KEY_LAST = "rr_last_played";
  const STORAGE_KEY_PLAYED = "rr_played_dates";

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

  function loadPlayedSet() {
    try {
      return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY_PLAYED) || "[]"));
    } catch { return new Set(); }
  }
  function savePlayedSet(set) {
    try {
      localStorage.setItem(STORAGE_KEY_PLAYED, JSON.stringify([...set]));
    } catch {}
  }

  function initIntro() {
    const card = $(".rr-day-card");
    if (!card) return;
    const today = card.dataset.today;
    if (!today) return;
    const last = localStorage.getItem(STORAGE_KEY_LAST);
    if (last === today) {
      const startBtn = $("#rr-start-btn");
      const played = $("#rr-played-state");
      if (startBtn && played) {
        startBtn.textContent = "Replay today's reps (already played)";
        startBtn.classList.remove("rr-btn-primary");
        startBtn.classList.add("rr-btn");
        played.classList.remove("hidden");
        startCountdown("#rr-countdown");
      }
    }
  }

  function initIntroNav() {
    const about = $("#rr-about");
    const aboutBtn = $("#rr-about-toggle");
    if (aboutBtn && about) {
      aboutBtn.addEventListener("click", () => {
        about.open = !about.open;
        about.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
    const shareBtn = $("#rr-share-toggle");
    if (shareBtn) {
      shareBtn.addEventListener("click", async () => {
        const url = shareBtn.dataset.shareUrl || window.location.href;
        try {
          await navigator.clipboard.writeText(url);
          const orig = shareBtn.textContent;
          shareBtn.textContent = "Copied!";
          setTimeout(() => (shareBtn.textContent = orig), 1500);
        } catch {}
      });
    }
  }

  function initPlay() {
    const promptEl = document.getElementById("rr-prompt");
    const questionForm = document.getElementById("rr-form");
    if (promptEl && questionForm) {
      let seconds = parseInt(promptEl.dataset.displaySeconds, 10) || 8;
      const secondsEl = document.getElementById("rr-mem-seconds");
      const countdownLine = document.getElementById("rr-countdown-line");
      const tick = () => {
        seconds -= 1;
        if (secondsEl) secondsEl.textContent = String(Math.max(0, seconds));
        if (seconds <= 0) {
          clearInterval(timerId);
          promptEl.classList.add("hidden");
          if (countdownLine) countdownLine.classList.add("hidden");
          questionForm.classList.remove("hidden");
          const firstInput = questionForm.querySelector("input, button");
          if (firstInput) firstInput.focus();
        }
      };
      const timerId = setInterval(tick, 1000);
    }

    const submitBtn = document.getElementById("rr-submit");
    const radios = $$(".rr-choice-input");
    if (radios.length && submitBtn) {
      radios.forEach((r) => {
        r.addEventListener("change", () => {
          radios.forEach((rr) => {
            const card = rr.closest(".choice-card");
            if (card) card.dataset.selected = rr.checked ? "true" : "false";
          });
          submitBtn.disabled = false;
        });
      });
      $$(".choice-card").forEach((card) => {
        card.addEventListener("click", (e) => {
          if (e.target.tagName !== "INPUT") {
            const r = card.querySelector("input[type='radio']");
            if (r) { r.checked = true; r.dispatchEvent(new Event("change")); }
          }
        });
      });
    }

    const numericInput = document.getElementById("rr-numeric-input");
    if (numericInput && submitBtn) {
      const sync = () => { submitBtn.disabled = numericInput.value.trim() === ""; };
      numericInput.addEventListener("input", sync);
      sync();
    }

    if (radios.length) {
      document.addEventListener("keydown", (e) => {
        if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
        const map = { "1": 0, "2": 1, "3": 2, "4": 3 };
        if (e.key in map && radios[map[e.key]]) {
          radios[map[e.key]].checked = true;
          radios[map[e.key]].dispatchEvent(new Event("change"));
          e.preventDefault();
        } else if (e.key === "Enter" && submitBtn && !submitBtn.disabled) {
          submitBtn.click();
        }
      });
    }
  }

  function initResults() {
    const root = document.getElementById("rr-results-root");
    if (root) {
      const playedDate = root.dataset.playedDate;
      if (playedDate) {
        localStorage.setItem(STORAGE_KEY_LAST, playedDate);
        const set = loadPlayedSet();
        set.add(playedDate);
        savePlayedSet(set);
      }
      startCountdown("#rr-tomorrow-countdown");
    }

    const shareBtn = document.getElementById("rr-share-btn");
    if (shareBtn) {
      const template = shareBtn.dataset.shareTemplate || "";
      shareBtn.addEventListener("click", async () => {
        const absolute = new URL(template, window.location.origin).toString();
        try {
          await navigator.clipboard.writeText(absolute);
          const orig = shareBtn.textContent;
          shareBtn.textContent = "Copied!";
          setTimeout(() => (shareBtn.textContent = orig), 1500);
        } catch {
          shareBtn.textContent = "Copy failed";
        }
      });
    }
  }

  function initArchive() {
    const grid = $(".rr-archive-grid");
    if (!grid) return;
    const set = loadPlayedSet();
    $$(".rr-archive-cell").forEach((cell) => {
      const d = cell.dataset.date;
      const status = cell.querySelector(".rr-archive-status");
      if (set.has(d) && status) {
        status.textContent = "✓ played";
        status.style.color = "var(--accent)";
      }
    });
  }

  function startCountdown(selector) {
    const el = document.querySelector(selector);
    if (!el) return;
    const fmt = (n) => String(n).padStart(2, "0");
    const tick = () => {
      const now = new Date();
      const tomorrow = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0
      ));
      const diff = Math.max(0, tomorrow - now);
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      el.textContent = `${fmt(h)}:${fmt(m)}:${fmt(s)}`;
      if (diff === 0) {
        window.location.reload();
      }
    };
    tick();
    setInterval(tick, 1000);
  }

  document.addEventListener("DOMContentLoaded", () => {
    initIntro();
    initIntroNav();
    initPlay();
    initResults();
    initArchive();
  });
})();
