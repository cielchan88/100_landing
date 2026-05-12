/* Color Heist — Day 3 */
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const HEX_RE = /^#[0-9a-f]{6}$/i;
  const SUGGESTION_ORDER = ["complementary", "analogous", "triadic", "monochromatic"];
  const SUGGESTION_LABEL = {
    complementary: "Complementary",
    analogous: "Analogous",
    triadic: "Triadic",
    monochromatic: "Monochromatic",
  };

  // ----- State -----
  const state = {
    extracted: [],
    suggestions: {},
    active: [],
    activeLabel: "Extracted",
    selectedFile: null,
    busy: false,
  };

  // ----- DOM refs -----
  const tabs = $$(".tab-btn");
  const bodies = $$(".tab-body");
  const urlInput = $("#ch-url");
  const submitUrl = $("#ch-submit-url");
  const fileInput = $("#ch-file");
  const dropZone = $("#ch-drop");
  const dropEmpty = $("#ch-drop-empty");
  const dropSelected = $("#ch-drop-selected");
  const fileName = $("#ch-file-name");
  const fileSize = $("#ch-file-size");
  const submitImage = $("#ch-submit-image");
  const pickerEl = $("#ch-picker");
  const hexEl = $("#ch-hex");
  const submitPicker = $("#ch-submit-picker");
  const outputEl = $("#ch-output");
  const errorEl = $("#ch-error");
  const activeStrip = $("#ch-active-strip");
  const activeLabelEl = $("#ch-active-label");
  const suggestionsEl = $("#ch-suggestions");
  const modal = $("#ch-modal");
  const modalTitle = $("#ch-modal-title");
  const modalCode = $("#ch-modal-code");
  const modalCopyBtn = $("#ch-modal-copy");
  const modalCloseBtn = $("#ch-modal-close");
  const suggestionTpl = $("#ch-suggestion-tpl");
  const swatchTpl = $("#ch-swatch-tpl");

  // ----- Tabs -----
  function setTab(name) {
    tabs.forEach((t) => {
      const active = t.dataset.tab === name;
      t.dataset.active = active ? "true" : "false";
      t.setAttribute("aria-selected", active ? "true" : "false");
    });
    bodies.forEach((b) => {
      b.classList.toggle("hidden", b.dataset.body !== name);
    });
  }
  tabs.forEach((t) => t.addEventListener("click", () => setTab(t.dataset.tab)));

  // ----- Picker sync -----
  function syncPickerFromHex() {
    const v = hexEl.value.trim();
    if (HEX_RE.test(v)) {
      pickerEl.value = v;
      hexEl.classList.remove("is-invalid");
    } else {
      hexEl.classList.add("is-invalid");
    }
  }
  function syncHexFromPicker() {
    hexEl.value = pickerEl.value.toUpperCase();
    hexEl.classList.remove("is-invalid");
  }
  pickerEl.addEventListener("input", syncHexFromPicker);
  hexEl.addEventListener("input", syncPickerFromHex);

  // ----- Drop zone -----
  dropZone.addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("is-dragover");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("is-dragover"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("is-dragover");
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) acceptFile(f);
  });
  fileInput.addEventListener("change", () => {
    const f = fileInput.files && fileInput.files[0];
    if (f) acceptFile(f);
  });

  function acceptFile(file) {
    state.selectedFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatBytes(file.size);
    dropEmpty.classList.add("hidden");
    dropSelected.classList.remove("hidden");
    submitImage.disabled = false;
  }

  function formatBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  // ----- Submit handlers -----
  function setBusy(btn, busy) {
    state.busy = busy;
    const label = btn.querySelector(".ch-btn-label");
    const loading = btn.querySelector(".ch-btn-loading");
    btn.disabled = busy;
    if (label) label.classList.toggle("hidden", busy);
    if (loading) loading.classList.toggle("hidden", !busy);
  }

  async function doSubmit(btn, fetchFn) {
    if (state.busy) return;
    clearError();
    setBusy(btn, true);
    try {
      const res = await fetchFn();
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        renderError(data.message || "Too many requests. Try again in a minute.");
        return;
      }
      if (res.status === 413) {
        renderError("Image too large. Max upload size is 5MB.");
        return;
      }
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        renderError("Unexpected server response.");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        renderError(data.message || data.error || `Request failed (${res.status}).`);
        return;
      }
      renderResults(data);
    } catch (err) {
      renderError("Network error: " + (err && err.message ? err.message : err));
    } finally {
      setBusy(btn, false);
    }
  }

  submitUrl.addEventListener("click", () => {
    const url = (urlInput.value || "").trim();
    if (!url) { renderError("Please paste a URL first."); return; }
    doSubmit(submitUrl, () => fetch("/day-03/color-heist/api/extract/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }));
  });

  submitImage.addEventListener("click", () => {
    if (!state.selectedFile) { renderError("Choose an image first."); return; }
    const fd = new FormData();
    fd.append("image", state.selectedFile);
    doSubmit(submitImage, () => fetch("/day-03/color-heist/api/extract/image", {
      method: "POST",
      body: fd,
    }));
  });

  submitPicker.addEventListener("click", () => {
    const seed = (hexEl.value || "").trim();
    if (!HEX_RE.test(seed)) { renderError("Enter a valid HEX like #22C55E."); return; }
    doSubmit(submitPicker, () => fetch("/day-03/color-heist/api/extract/picker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed }),
    }));
  });

  // ----- Render error -----
  function renderError(msg) {
    outputEl.classList.remove("hidden");
    errorEl.classList.remove("hidden");
    errorEl.innerHTML = "";
    const head = document.createElement("div");
    head.className = "text-xs mono uppercase tracking-wider mb-1";
    head.style.color = "var(--muted)";
    head.textContent = "⚠️ Heads up";
    const body = document.createElement("div");
    body.className = "text-sm";
    body.textContent = msg;
    errorEl.appendChild(head);
    errorEl.appendChild(body);
  }
  function clearError() {
    errorEl.classList.add("hidden");
    errorEl.innerHTML = "";
  }

  // ----- Render results -----
  function getReadableTextColor(hex) {
    const m = HEX_RE.exec(hex);
    if (!m) return "#FFFFFF";
    const v = hex.slice(1);
    const r = parseInt(v.slice(0, 2), 16) / 255;
    const g = parseInt(v.slice(2, 4), 16) / 255;
    const b = parseInt(v.slice(4, 6), 16) / 255;
    const channel = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const L = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    return L > 0.45 ? "#000000" : "#FFFFFF";
  }

  function buildSwatch(hex, info) {
    const node = swatchTpl.content.firstElementChild.cloneNode(true);
    node.style.background = hex;
    const text = getReadableTextColor(hex);
    const hexEl = node.querySelector(".swatch-hex");
    hexEl.textContent = hex.toUpperCase();
    hexEl.style.color = text;
    const overlay = node.querySelector(".swatch-overlay");
    const wcag = overlay.querySelector(".swatch-wcag");
    const copy = overlay.querySelector(".swatch-copy");
    if (info) {
      wcag.textContent = `W ${info.contrast_white}× ${info.wcag_white}  ·  B ${info.contrast_black}× ${info.wcag_black}`;
    } else {
      wcag.textContent = hex.toUpperCase();
    }
    copy.textContent = "click to copy";
    node.addEventListener("click", () => swatchClickToCopy(node, hex));
    node.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); swatchClickToCopy(node, hex); }
    });
    return node;
  }

  async function swatchClickToCopy(node, hex) {
    try {
      await navigator.clipboard.writeText(hex.toUpperCase());
      const copyEl = node.querySelector(".swatch-copy");
      const original = copyEl.textContent;
      copyEl.textContent = "copied!";
      node.classList.add("is-copied");
      setTimeout(() => {
        node.classList.remove("is-copied");
        copyEl.textContent = original;
      }, 1200);
    } catch {}
  }

  function renderActive() {
    activeStrip.innerHTML = "";
    state.active.forEach((hex, i) => {
      const info = state.activeLabel === "Extracted" ? state.extracted[i] : null;
      activeStrip.appendChild(buildSwatch(hex, info));
    });
    activeLabelEl.textContent = state.activeLabel;
  }

  function renderSuggestions() {
    suggestionsEl.innerHTML = "";
    SUGGESTION_ORDER.forEach((key) => {
      const palette = state.suggestions[key] || [];
      if (!palette.length) return;
      const node = suggestionTpl.content.firstElementChild.cloneNode(true);
      node.querySelector(".ch-suggestion-label").textContent = SUGGESTION_LABEL[key];
      const useBtn = node.querySelector(".ch-use-btn");
      useBtn.addEventListener("click", () => {
        state.active = palette.slice();
        state.activeLabel = SUGGESTION_LABEL[key];
        renderActive();
        outputEl.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      const strip = node.querySelector(".ch-suggestion-strip");
      palette.forEach((hex) => strip.appendChild(buildSwatch(hex, null)));
      suggestionsEl.appendChild(node);
    });
  }

  function renderResults(data) {
    state.extracted = data.extracted || [];
    state.suggestions = data.suggestions || {};
    state.active = state.extracted.map((e) => e.hex);
    state.activeLabel = "Extracted";
    outputEl.classList.remove("hidden");
    renderActive();
    renderSuggestions();
    outputEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ----- Export bar -----
  $$(".ch-export-btn").forEach((btn) => {
    btn.addEventListener("click", () => exportPalette(btn.dataset.export));
  });

  function buildCss(palette) {
    const lines = palette.map((c, i) => `  --color-${i + 1}: ${c.toUpperCase()};`);
    return `:root {\n${lines.join("\n")}\n}`;
  }
  function buildTailwind(palette) {
    const obj = palette.map((c, i) => `        "color-${i + 1}": "${c.toUpperCase()}"`).join(",\n");
    return `module.exports = {\n  theme: {\n    extend: {\n      colors: {\n${obj}\n      }\n    }\n  }\n};`;
  }
  function buildJson(palette) {
    const arr = palette.map((c, i) => ({ name: `color-${i + 1}`, hex: c.toUpperCase() }));
    return JSON.stringify(arr, null, 2);
  }
  function buildSvgUrl(palette) {
    const params = palette
      .map((c, i) => `c${i + 1}=${encodeURIComponent(c)}`)
      .join("&");
    return `/day-03/color-heist/api/export/svg?${params}`;
  }

  function exportPalette(kind) {
    const palette = state.active.slice(0, 8);
    if (palette.length < 8) {
      renderError("Generate a palette first.");
      return;
    }
    if (kind === "css") openModal("CSS Variables", buildCss(palette));
    else if (kind === "tailwind") openModal("Tailwind Config", buildTailwind(palette));
    else if (kind === "json") openModal("JSON", buildJson(palette));
    else if (kind === "svg") window.location.href = buildSvgUrl(palette);
  }

  // ----- Modal -----
  function openModal(title, code) {
    modalTitle.textContent = title;
    modalCode.textContent = code;
    modal.classList.remove("hidden");
    document.addEventListener("keydown", onModalKey);
    modalCopyBtn.textContent = "Copy";
  }
  function closeModal() {
    modal.classList.add("hidden");
    document.removeEventListener("keydown", onModalKey);
  }
  function onModalKey(e) { if (e.key === "Escape") closeModal(); }
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
  modalCloseBtn.addEventListener("click", closeModal);
  modalCopyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(modalCode.textContent);
      modalCopyBtn.textContent = "Copied!";
      setTimeout(() => (modalCopyBtn.textContent = "Copy"), 1500);
    } catch {
      modalCopyBtn.textContent = "Copy failed";
    }
  });
})();
