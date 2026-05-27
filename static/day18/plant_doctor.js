/* Plant Doctor — Day 18 */
(function () {
  'use strict';

  const MAX_DIMENSION = 1024;
  const JPEG_QUALITY = 0.85;

  const EXAMPLES = [
    { path: '/static/day18/examples/monstera_example.jpg', label: 'Monstera', context: '' },
    { path: '/static/day18/examples/snake_plant_example.jpg', label: 'Snake Plant', context: '' },
    { path: '/static/day18/examples/pothos_example.jpg', label: 'Pothos', context: 'Some leaves have started yellowing' },
  ];

  const state = {
    imageBlob: null,
    imageDataUrl: null,
    context: '',
    analyzing: false,
    result: null,
  };

  let dom = {};

  function init() {
    dom = {
      setup: document.querySelector('.pd-setup'),
      analyzing: document.querySelector('.pd-analyzing'),
      results: document.querySelector('.pd-results'),
      error: document.querySelector('.pd-error'),
      toast: document.querySelector('.pd-toast'),

      dropzone: document.querySelector('.pd-dropzone'),
      dropzoneContent: document.querySelector('.pd-dropzone-content'),
      fileInputBrowse: document.querySelector('#pd-input-browse'),
      fileInputCamera: document.querySelector('#pd-input-camera'),
      browseBtn: document.querySelector('#pd-browse-btn'),
      cameraBtn: document.querySelector('#pd-camera-btn'),
      examplesToggle: document.querySelector('.pd-examples-toggle'),
      examplesContainer: document.querySelector('.pd-examples'),

      contextSection: document.querySelector('.pd-context-section'),
      contextInput: document.querySelector('.pd-context-input'),
      diagnoseBtn: document.querySelector('.pd-diagnose-btn'),
      removeImageBtn: document.querySelector('.pd-remove-image'),

      analyzingPreview: document.querySelector('.pd-analyzing-preview'),
      resultsContainer: document.querySelector('.pd-results-cards'),
      resultsPreview: document.querySelector('.pd-results-preview'),
      tryAnotherBtn: document.querySelector('.pd-try-another-btn'),
      copyBtn: document.querySelector('.pd-copy-btn'),
    };

    renderExamples();
    setupEventHandlers();
  }

  function renderExamples() {
    dom.examplesContainer.innerHTML = EXAMPLES.map(ex => `
      <div class="pd-example-card" data-path="${ex.path}" data-context="${escapeHTML(ex.context)}">
        <img class="pd-example-thumb" src="${ex.path}" alt="${escapeHTML(ex.label)}" loading="lazy">
        <div class="pd-example-label">${escapeHTML(ex.label)}</div>
      </div>
    `).join('');

    document.querySelectorAll('.pd-example-card').forEach(card => {
      const img = card.querySelector('.pd-example-thumb');
      // If an example image is missing, hide its card; show a note if none remain.
      img.addEventListener('error', () => {
        card.remove();
        if (!dom.examplesContainer.querySelector('.pd-example-card')) {
          dom.examplesContainer.innerHTML = '<div class="pd-examples-empty">No example photos installed yet — upload your own plant photo above.</div>';
        }
      });
      card.addEventListener('click', () => {
        loadImageFromURL(card.dataset.path, card.dataset.context);
      });
    });
  }

  function setupEventHandlers() {
    dom.dropzone.addEventListener('click', (e) => {
      if (state.imageBlob) return;
      if (e.target.closest('.pd-action-btn, .pd-remove-image, .pd-examples-toggle')) return;
      dom.fileInputBrowse.click();
    });

    dom.dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dom.dropzone.classList.add('is-dragover');
    });
    dom.dropzone.addEventListener('dragleave', () => {
      dom.dropzone.classList.remove('is-dragover');
    });
    dom.dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dom.dropzone.classList.remove('is-dragover');
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    });

    dom.fileInputBrowse.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleFile(file);
    });
    dom.fileInputCamera.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleFile(file);
    });

    dom.browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dom.fileInputBrowse.click();
    });
    dom.cameraBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dom.fileInputCamera.click();
    });

    dom.examplesToggle.addEventListener('click', () => {
      dom.examplesContainer.classList.toggle('is-hidden');
    });

    dom.removeImageBtn.addEventListener('click', resetImage);

    dom.contextInput.addEventListener('input', () => {
      state.context = dom.contextInput.value.trim();
    });

    dom.diagnoseBtn.addEventListener('click', diagnose);
    dom.tryAnotherBtn.addEventListener('click', resetAll);
    dom.copyBtn.addEventListener('click', copyAssessment);
  }

  async function handleFile(file) {
    if (!file.type.startsWith('image/')) {
      showError('Please upload an image file.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      showError('Image is too large (over 15MB). Try a smaller photo.');
      return;
    }
    try {
      const { blob, dataUrl } = await resizeImage(file);
      state.imageBlob = blob;
      state.imageDataUrl = dataUrl;
      showImagePreview();
    } catch (e) {
      console.error('Image processing failed:', e);
      showError('Could not process the image. Try a different photo.');
    }
  }

  async function loadImageFromURL(url, context) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Could not load example');
      const blob = await response.blob();
      const file = new File([blob], 'example.jpg', { type: blob.type || 'image/jpeg' });
      await handleFile(file);
      if (context) {
        state.context = context;
        dom.contextInput.value = context;
      }
    } catch (e) {
      console.error('Failed to load example:', e);
      showError('Could not load that example image.');
    }
  }

  async function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            if (width > height) {
              height = Math.round(height * (MAX_DIMENSION / width));
              width = MAX_DIMENSION;
            } else {
              width = Math.round(width * (MAX_DIMENSION / height));
              height = MAX_DIMENSION;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (!blob) { reject(new Error('toBlob failed')); return; }
            const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
            resolve({ blob, dataUrl });
          }, 'image/jpeg', JPEG_QUALITY);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function showImagePreview() {
    dom.dropzone.classList.add('has-image');
    dom.dropzoneContent.innerHTML = `<img class="pd-image-preview" src="${state.imageDataUrl}" alt="Plant preview">`;
    dom.removeImageBtn.style.display = 'block';
    dom.removeImageBtn.style.margin = '0.5rem auto 0';
    dom.contextSection.classList.remove('is-hidden');
    dom.diagnoseBtn.style.display = 'block';
  }

  function resetImage() {
    state.imageBlob = null;
    state.imageDataUrl = null;
    state.context = '';
    dom.dropzone.classList.remove('has-image');
    dom.dropzoneContent.innerHTML = `
      <div class="pd-dropzone-icon">🌿</div>
      <div class="pd-dropzone-text">Drag photo here or click to upload</div>
      <div class="pd-dropzone-hint">JPG, PNG, or HEIC · max 15MB</div>
    `;
    dom.removeImageBtn.style.display = 'none';
    dom.contextSection.classList.add('is-hidden');
    dom.contextInput.value = '';
    dom.diagnoseBtn.style.display = 'none';
    dom.fileInputBrowse.value = '';
    dom.fileInputCamera.value = '';
    dom.examplesContainer.classList.add('is-hidden');
  }

  async function diagnose() {
    if (!state.imageBlob || state.analyzing) return;

    state.analyzing = true;
    dom.error.classList.add('is-hidden');
    dom.setup.classList.add('is-hidden');
    dom.analyzing.classList.add('is-visible');
    dom.analyzingPreview.src = state.imageDataUrl;

    try {
      const formData = new FormData();
      formData.append('image', state.imageBlob, 'plant.jpg');
      formData.append('context', state.context);

      const response = await fetch('/day-18/plant-doctor/diagnose', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Error ${response.status}`);
      }

      const data = await response.json();

      if (data.result) {
        state.result = data.result;
        showResults(data.result);
      } else if (data.raw_text) {
        showResults({ raw_text: data.raw_text, warning: data.warning });
      } else {
        throw new Error('Empty response from server');
      }
    } catch (e) {
      console.error('Diagnose failed:', e);
      dom.analyzing.classList.remove('is-visible');
      dom.setup.classList.remove('is-hidden');
      showError(e.message || 'Something went wrong. Try again.');
    } finally {
      state.analyzing = false;
    }
  }

  function showResults(result) {
    dom.analyzing.classList.remove('is-visible');
    dom.results.classList.add('is-visible');
    dom.resultsPreview.src = state.imageDataUrl;

    if (result.raw_text) {
      dom.resultsContainer.innerHTML = `
        <div class="pd-result-card">
          <div class="pd-card-heading">Assessment</div>
          <div style="white-space: pre-wrap; line-height: 1.65; color: var(--text);">${escapeHTML(result.raw_text)}</div>
          ${result.warning ? `<div class="pd-disclaimer">${escapeHTML(result.warning)}</div>` : ''}
        </div>
      `;
      dom.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const species = result.species || {};
    const speciesName = species.name || 'Unknown plant';
    const confidence = species.confidence || 'Uncertain';
    const confidenceClass = `pd-confidence-${String(confidence).toLowerCase()}`;

    const health = result.health || 'Healthy';
    const healthClass = `pd-health-${String(health).toLowerCase()}`;

    const observations = Array.isArray(result.observations) ? result.observations : [];
    const recommendations = Array.isArray(result.care_recommendations) ? result.care_recommendations : [];
    const conditions = result.light_water_humidity || {};
    const disclaimer = result.disclaimer || '';

    dom.resultsContainer.innerHTML = `
      <div class="pd-result-card">
        <div class="pd-card-heading">Species</div>
        <div class="pd-species-name">${escapeHTML(speciesName)}</div>
        <span class="pd-confidence-badge ${confidenceClass}">${escapeHTML(confidence)}</span>
      </div>

      <div class="pd-result-card">
        <div class="pd-card-heading">Health</div>
        <span class="pd-health-badge ${healthClass}">${escapeHTML(health)}</span>
      </div>

      <div class="pd-result-card">
        <div class="pd-card-heading">What I see</div>
        <ul class="pd-bullet-list">
          ${observations.map(o => `<li>${escapeHTML(o)}</li>`).join('')}
        </ul>
      </div>

      <div class="pd-result-card">
        <div class="pd-card-heading">Care recommendations</div>
        <ul class="pd-bullet-list">
          ${recommendations.map(r => `<li>${escapeHTML(r)}</li>`).join('')}
        </ul>
      </div>

      <div class="pd-result-card">
        <div class="pd-card-heading">Light · Water · Humidity</div>
        <div class="pd-conditions">
          <div class="pd-condition-row">
            <div class="pd-condition-icon">☀️</div>
            <div class="pd-condition-content">
              <div class="pd-condition-label">Light</div>
              <div class="pd-condition-value">${escapeHTML(conditions.light || '—')}</div>
            </div>
          </div>
          <div class="pd-condition-row">
            <div class="pd-condition-icon">💧</div>
            <div class="pd-condition-content">
              <div class="pd-condition-label">Water</div>
              <div class="pd-condition-value">${escapeHTML(conditions.water || '—')}</div>
            </div>
          </div>
          <div class="pd-condition-row">
            <div class="pd-condition-icon">🌬️</div>
            <div class="pd-condition-content">
              <div class="pd-condition-label">Humidity</div>
              <div class="pd-condition-value">${escapeHTML(conditions.humidity || '—')}</div>
            </div>
          </div>
        </div>
      </div>

      ${disclaimer ? `<div class="pd-disclaimer">${escapeHTML(disclaimer)}</div>` : ''}
    `;

    dom.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetAll() {
    state.result = null;
    resetImage();
    dom.results.classList.remove('is-visible');
    dom.analyzing.classList.remove('is-visible');
    dom.setup.classList.remove('is-hidden');
    dom.error.classList.add('is-hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function copyAssessment() {
    if (!state.result) return;
    const r = state.result;
    let text = '';

    if (r.raw_text) {
      text = r.raw_text;
    } else {
      if (r.species) text += `Species: ${r.species.name} (${r.species.confidence})\n\n`;
      if (r.health) text += `Health: ${r.health}\n\n`;
      if (Array.isArray(r.observations) && r.observations.length) {
        text += `What I see:\n${r.observations.map(o => `• ${o}`).join('\n')}\n\n`;
      }
      if (Array.isArray(r.care_recommendations) && r.care_recommendations.length) {
        text += `Care recommendations:\n${r.care_recommendations.map(c => `• ${c}`).join('\n')}\n\n`;
      }
      if (r.light_water_humidity) {
        const lwh = r.light_water_humidity;
        text += `Light: ${lwh.light}\nWater: ${lwh.water}\nHumidity: ${lwh.humidity}\n\n`;
      }
      if (r.disclaimer) text += `Note: ${r.disclaimer}\n`;
    }
    text += '\n— Plant Doctor · 100dayswithclaude.pythonanywhere.com';

    const done = () => showToast('Assessment copied');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
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
    dom.error.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
