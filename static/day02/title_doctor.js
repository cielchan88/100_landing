/* Title Doctor — Day 2 */
(function () {
  const $ = (s) => document.querySelector(s);
  const form = $("#td-form");
  const draftEl = $("#td-draft");
  const counterEl = $("#td-counter");
  const ctEl = $("#td-content-type");
  const audienceEl = $("#td-audience");
  const submitBtn = $("#td-submit");
  const submitText = $("#td-submit-text");
  const submitLoading = $("#td-submit-loading");
  const outputEl = $("#td-output");
  const errorEl = $("#td-error");
  const verdictEl = $("#td-verdict");
  const verdictScoreEl = $("#td-verdict-score");
  const verdictDxEl = $("#td-verdict-diagnosis");
  const groupsEl = $("#td-groups");
  const actionsEl = $("#td-actions");
  const shareBtn = $("#td-share");
  const resetBtn = $("#td-reset");
  const groupTpl = $("#td-group-tpl");
  const variantTpl = $("#td-variant-tpl");

  const state = { variants: [], verdict: null, busy: false };

  function syncSubmit() {
    const len = draftEl.value.trim().length;
    counterEl.textContent = `${draftEl.value.length} / 200`;
    submitBtn.disabled = state.busy || len < 3 || len > 200;
    submitBtn.style.opacity = submitBtn.disabled ? "0.5" : "1";
    submitBtn.style.cursor = submitBtn.disabled ? "not-allowed" : "pointer";
  }
  draftEl.addEventListener("input", syncSubmit);
  syncSubmit();

  function setBusy(b) {
    state.busy = b;
    submitText.classList.toggle("hidden", b);
    submitLoading.classList.toggle("hidden", !b);
    syncSubmit();
  }

  function scoreClass(score) {
    if (score >= 8) return "score-high";
    if (score >= 5) return "score-mid";
    return "score-low";
  }

  function clearOutput() {
    errorEl.classList.add("hidden");
    errorEl.textContent = "";
    verdictEl.classList.add("hidden");
    verdictScoreEl.textContent = "—";
    verdictDxEl.textContent = "";
    groupsEl.innerHTML = "";
    actionsEl.classList.add("hidden");
    state.variants = [];
    state.verdict = null;
  }

  function showError(msg) {
    outputEl.classList.remove("hidden");
    errorEl.classList.remove("hidden");
    errorEl.textContent = msg;
  }

  function renderVerdict(v) {
    state.verdict = v;
    verdictScoreEl.textContent = String(v.score);
    verdictDxEl.textContent = v.diagnosis;
    verdictEl.classList.remove("hidden");
  }

  function renderGroupStart(name) {
    const node = groupTpl.content.firstElementChild.cloneNode(true);
    node.dataset.group = name;
    node.querySelector(".td-group-name").textContent = name;
    groupsEl.appendChild(node);
  }

  function renderVariant(v) {
    state.variants.push(v);
    const groups = groupsEl.querySelectorAll(".td-group");
    const lastGroup = groups[groups.length - 1];
    const list = lastGroup.querySelector(".td-group-variants");
    const node = variantTpl.content.firstElementChild.cloneNode(true);
    node.querySelector(".td-variant-title").textContent = v.title;
    const scoreEl = node.querySelector(".td-variant-score");
    scoreEl.textContent = `${v.score}/10`;
    scoreEl.classList.add(scoreClass(v.score));
    node.querySelector(".td-variant-rationale").textContent = v.rationale;
    const copyBtn = node.querySelector(".td-copy");
    copyBtn.addEventListener("click", () => copyText(v.title, copyBtn));
    list.appendChild(node);
  }

  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      const original = btn.textContent;
      btn.textContent = "copied";
      btn.style.color = "var(--accent)";
      setTimeout(() => {
        btn.textContent = original;
        btn.style.color = "var(--muted)";
      }, 1200);
    } catch (e) {
      console.warn("Clipboard failed:", e);
    }
  }

  function handleEvent(rawEvent) {
    const lines = rawEvent.split("\n");
    let event = "message";
    let dataStr = "";
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
    }
    if (!dataStr) return;
    let data;
    try { data = JSON.parse(dataStr); } catch { return; }
    if (event === "verdict") renderVerdict(data);
    else if (event === "group_start") renderGroupStart(data.name);
    else if (event === "variant") renderVariant(data);
    else if (event === "error") showError(data.message || "Something went wrong.");
    else if (event === "done") {
      actionsEl.classList.remove("hidden");
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (state.busy) return;
    clearOutput();
    outputEl.classList.remove("hidden");
    setBusy(true);

    const payload = {
      draft: draftEl.value.trim(),
      content_type: ctEl.value || null,
      audience: audienceEl.value.trim(),
    };

    try {
      const res = await fetch("/day-02/title-doctor/api/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok && res.headers.get("content-type")?.includes("application/json")) {
        const j = await res.json().catch(() => ({}));
        showError(j.error || `Request failed (${res.status}).`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop();
        for (const evt of events) handleEvent(evt);
      }
      if (buffer.trim()) handleEvent(buffer);
    } catch (err) {
      showError("Network error: " + (err?.message || err));
    } finally {
      setBusy(false);
    }
  }

  form.addEventListener("submit", submit);

  shareBtn.addEventListener("click", async () => {
    if (!state.verdict) return;
    const top = state.variants.slice().sort((a, b) => b.score - a.score).slice(0, 3);
    const lines = [
      `Title Doctor verdict — score ${state.verdict.score}/10`,
      `Diagnosis: ${state.verdict.diagnosis}`,
      "",
      "Top 3 alternatives:",
    ];
    top.forEach((v, i) => {
      lines.push(`${i + 1}. ${v.title} (${v.score}/10) — ${v.rationale}`);
    });
    lines.push("");
    lines.push("via 100dayswithclaude.pythonanywhere.com/day-02/title-doctor");
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      const original = shareBtn.textContent;
      shareBtn.textContent = "Copied to clipboard";
      setTimeout(() => (shareBtn.textContent = original), 1500);
    } catch (e) {
      console.warn("Clipboard failed:", e);
    }
  });

  resetBtn.addEventListener("click", () => {
    clearOutput();
    outputEl.classList.add("hidden");
    draftEl.value = "";
    syncSubmit();
    draftEl.focus();
    draftEl.scrollIntoView({ behavior: "smooth", block: "center" });
  });
})();
