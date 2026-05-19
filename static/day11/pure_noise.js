/* Pure Noise — Day 11
 * Six ambient sounds, fully synthesized via Web Audio API.
 * State encodes into the URL hash for sharing.
 */
(function () {
  'use strict';

  // ────────────────────────────────────────────────────────────────
  // Module 1: Sound Definitions
  // ────────────────────────────────────────────────────────────────
  const SOUNDS = [
    {
      id: 'rain',
      name: 'Rain',
      options: [
        { key: 'intensity', type: 'slider', label: 'Intensity', min: 1, max: 10, default: 5 },
        { key: 'drops', type: 'toggle', label: 'Drops', default: true },
      ],
    },
    {
      id: 'white',
      name: 'White Noise',
      options: [
        { key: 'color', type: 'select', label: 'Color', options: ['White', 'Pink', 'Brown'], default: 'White' },
      ],
    },
    {
      id: 'wind',
      name: 'Wind',
      options: [
        { key: 'speed', type: 'slider', label: 'Speed', min: 1, max: 10, default: 5 },
      ],
    },
    {
      id: 'fire',
      name: 'Fire',
      options: [
        { key: 'crackle', type: 'slider', label: 'Crackle rate', min: 1, max: 10, default: 5 },
      ],
    },
    {
      id: 'drone',
      name: 'Drone',
      options: [
        { key: 'pitch', type: 'select', label: 'Pitch', options: ['Low', 'Mid', 'High'], default: 'Low' },
        { key: 'brightness', type: 'slider', label: 'Brightness', min: 1, max: 10, default: 5 },
      ],
    },
    {
      id: 'bowl',
      name: 'Singing Bowl',
      options: [
        { key: 'interval', type: 'slider', label: 'Interval (sec)', min: 5, max: 60, default: 20 },
        { key: 'pitch', type: 'select', label: 'Pitch', options: ['432 Hz', '528 Hz', '440 Hz'], default: '432 Hz' },
      ],
    },
  ];

  // ────────────────────────────────────────────────────────────────
  // Module 2: State
  // ────────────────────────────────────────────────────────────────
  const state = {
    audioCtx: null,
    masterGain: null,
    analyser: null,
    sources: {},
    volumes: {},
    options: {},
    initialized: false,
  };

  SOUNDS.forEach(sound => {
    state.volumes[sound.id] = 0;
    state.options[sound.id] = {};
    sound.options.forEach(opt => {
      state.options[sound.id][opt.key] = opt.default;
    });
  });

  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ────────────────────────────────────────────────────────────────
  // Module 3: URL Encoding
  // ────────────────────────────────────────────────────────────────
  function encodeState() {
    const v = SOUNDS.map(s => Math.round(state.volumes[s.id] * 100)).join(',');
    const o = SOUNDS.map(s => {
      const optsStr = s.options.map(opt => {
        const val = state.options[s.id][opt.key];
        return opt.key + '=' + encodeURIComponent(val);
      }).join('|');
      return s.id + ':' + optsStr;
    }).join(';');
    return 'v=' + v + '&o=' + encodeURIComponent(o);
  }

  function decodeStateFromURL() {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const v = params.get('v');
    const o = params.get('o');

    if (v) {
      const volumes = v.split(',').map(Number);
      SOUNDS.forEach((s, i) => {
        if (!isNaN(volumes[i])) {
          state.volumes[s.id] = Math.max(0, Math.min(1, volumes[i] / 100));
        }
      });
    }

    if (o) {
      try {
        const decoded = decodeURIComponent(o);
        const soundGroups = decoded.split(';');
        soundGroups.forEach(group => {
          const [soundId, optsStr] = group.split(':');
          if (!soundId || !optsStr) return;
          if (!state.options[soundId]) return;
          const opts = optsStr.split('|');
          opts.forEach(opt => {
            const eq = opt.indexOf('=');
            if (eq === -1) return;
            const key = opt.slice(0, eq);
            const val = opt.slice(eq + 1);
            if (!key) return;
            const decodedVal = decodeURIComponent(val);
            const num = Number(decodedVal);
            state.options[soundId][key] = (decodedVal === 'true' || decodedVal === 'false')
              ? decodedVal === 'true'
              : (isNaN(num) ? decodedVal : num);
          });
        });
      } catch (e) {
        console.error('Failed to decode options:', e);
      }
    }
  }

  let urlUpdateTimer = null;
  function updateURL() {
    if (urlUpdateTimer) clearTimeout(urlUpdateTimer);
    urlUpdateTimer = setTimeout(() => {
      try {
        history.replaceState(null, '', '#' + encodeState());
      } catch (e) {
        window.location.hash = encodeState();
      }
    }, 120);
  }

  // ────────────────────────────────────────────────────────────────
  // Module 4: Helpers
  // ────────────────────────────────────────────────────────────────
  function createNoiseBuffer(audioCtx, durationSeconds) {
    const sampleRate = audioCtx.sampleRate;
    const buffer = audioCtx.createBuffer(2, sampleRate * durationSeconds, sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    return buffer;
  }

  function setSmooth(param, target, time, tau) {
    try {
      param.cancelScheduledValues(time);
      param.setTargetAtTime(target, time, tau || 0.05);
    } catch (e) {
      param.value = target;
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Module 5: AudioContext Lifecycle + Setup
  // ────────────────────────────────────────────────────────────────
  async function initAudio() {
    if (state.initialized) return;

    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Web Audio API not supported');
      state.audioCtx = new AC();
      if (state.audioCtx.state === 'suspended') {
        await state.audioCtx.resume();
      }

      state.masterGain = state.audioCtx.createGain();
      state.masterGain.gain.value = 0.7;

      state.analyser = state.audioCtx.createAnalyser();
      state.analyser.fftSize = 2048;
      state.analyser.smoothingTimeConstant = 0.85;

      state.masterGain.connect(state.analyser);
      state.analyser.connect(state.audioCtx.destination);

      setupRain();
      setupWhiteNoise();
      setupWind();
      setupFire();
      setupDrone();
      setupBowl();

      state.initialized = true;

      SOUNDS.forEach(s => {
        s.options.forEach(opt => applyOption(s.id, opt.key, state.options[s.id][opt.key]));
        applyVolume(s.id, state.volumes[s.id]);
      });
    } catch (e) {
      console.error('Audio init failed:', e);
    }
  }

  function setupRain() {
    const ctx = state.audioCtx;
    const noise = createNoiseBuffer(ctx, 5);
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 3500;
    filter.Q.value = 0.6;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(state.masterGain);
    source.start();

    state.sources.rain = {
      source, filter, gain,
      dropsActive: false,
      dropsTimer: null,
    };
  }

  function scheduleDrop() {
    const rain = state.sources.rain;
    if (!rain || !rain.dropsActive) return;
    if (state.volumes.rain < 0.01) {
      rain.dropsActive = false;
      return;
    }
    const ctx = state.audioCtx;
    const burst = ctx.createBufferSource();
    burst.buffer = createNoiseBuffer(ctx, 0.08);

    const bf = ctx.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = 2500 + Math.random() * 2000;
    bf.Q.value = 2.5;

    const env = ctx.createGain();
    const now = ctx.currentTime;
    const volume = (0.04 + Math.random() * 0.08) * state.volumes.rain;
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(volume, now + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.05 + Math.random() * 0.05);

    burst.connect(bf);
    bf.connect(env);
    env.connect(state.masterGain);
    burst.start(now);
    burst.stop(now + 0.2);

    const delay = 500 + Math.random() * 1500;
    rain.dropsTimer = setTimeout(scheduleDrop, delay);
  }

  function setupWhiteNoise() {
    const ctx = state.audioCtx;
    const noise = createNoiseBuffer(ctx, 3);
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 20000;
    filter.Q.value = 0.5;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(state.masterGain);
    source.start();

    state.sources.white = { source, filter, gain };
  }

  function setupWind() {
    const ctx = state.audioCtx;
    const noise = createNoiseBuffer(ctx, 4);
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 600;
    filter.Q.value = 0.9;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.15;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 450;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    const gain = ctx.createGain();
    gain.gain.value = 0;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(state.masterGain);
    source.start();

    state.sources.wind = { source, filter, lfo, lfoGain, gain };
  }

  function setupFire() {
    const ctx = state.audioCtx;
    const baseNoise = createNoiseBuffer(ctx, 4);
    const baseSource = ctx.createBufferSource();
    baseSource.buffer = baseNoise;
    baseSource.loop = true;

    const baseFilter = ctx.createBiquadFilter();
    baseFilter.type = 'lowpass';
    baseFilter.frequency.value = 400;
    baseFilter.Q.value = 0.5;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    baseSource.connect(baseFilter);
    baseFilter.connect(gain);
    gain.connect(state.masterGain);
    baseSource.start();

    state.sources.fire = {
      source: baseSource,
      filter: baseFilter,
      gain,
      crackleActive: false,
      crackleTimer: null,
    };
  }

  function scheduleCrackle() {
    const fire = state.sources.fire;
    if (!fire || !fire.crackleActive) return;
    if (state.volumes.fire < 0.01) {
      fire.crackleActive = false;
      return;
    }
    const ctx = state.audioCtx;
    const crackleScale = state.options.fire.crackle || 5;
    const scale = (11 - crackleScale) / 10;
    const delay = (0.05 + Math.random() * 0.25) * scale + 0.02;

    fire.crackleTimer = setTimeout(() => {
      if (!fire.crackleActive) return;
      const burst = ctx.createBufferSource();
      burst.buffer = createNoiseBuffer(ctx, 0.1);

      const burstFilter = ctx.createBiquadFilter();
      burstFilter.type = 'highpass';
      burstFilter.frequency.value = 2000 + Math.random() * 2000;
      burstFilter.Q.value = 1.0;

      const burstEnv = ctx.createGain();
      const now = ctx.currentTime;
      const burstVolume = (0.06 + Math.random() * 0.14) * state.volumes.fire;

      burst.connect(burstFilter);
      burstFilter.connect(burstEnv);
      burstEnv.connect(state.masterGain);

      burstEnv.gain.setValueAtTime(0, now);
      burstEnv.gain.linearRampToValueAtTime(burstVolume, now + 0.004);
      burstEnv.gain.exponentialRampToValueAtTime(0.0001, now + 0.04 + Math.random() * 0.08);

      burst.start(now);
      burst.stop(now + 0.2);

      scheduleCrackle();
    }, delay * 1000);
  }

  function setupDrone() {
    const ctx = state.audioCtx;
    const droneMaster = ctx.createGain();
    droneMaster.gain.value = 0;

    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 1200;
    droneFilter.Q.value = 0.4;

    droneMaster.connect(droneFilter);
    droneFilter.connect(state.masterGain);

    const oscs = [];
    const fundamentals = [110, 165, 220];
    fundamentals.forEach((freq) => {
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = freq;
      osc1.detune.value = -3 + Math.random() * 6;

      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = freq * 1.5;
      osc2.detune.value = -3 + Math.random() * 6;

      const partialGain = ctx.createGain();
      partialGain.gain.value = 0.33;

      osc1.connect(partialGain);
      osc2.connect(partialGain);
      partialGain.connect(droneMaster);

      osc1.start();
      osc2.start();
      oscs.push({ osc1, osc2, baseFreq: freq, partialGain });
    });

    state.sources.drone = {
      gain: droneMaster,
      filter: droneFilter,
      oscs,
    };
  }

  function setupBowl() {
    const ctx = state.audioCtx;
    const bowlGain = ctx.createGain();
    bowlGain.gain.value = 0;
    bowlGain.connect(state.masterGain);

    state.sources.bowl = {
      gain: bowlGain,
      intervalActive: false,
      intervalId: null,
    };
  }

  function strikeBowl() {
    const ctx = state.audioCtx;
    const bowl = state.sources.bowl;
    if (!bowl || state.volumes.bowl < 0.01) return;

    const pitchMap = { '432 Hz': 432, '528 Hz': 528, '440 Hz': 440 };
    const fundamental = pitchMap[state.options.bowl.pitch] || 432;

    const partials = [
      { freq: fundamental, gain: 0.5, decay: 6 },
      { freq: fundamental * 2.756, gain: 0.3, decay: 4 },
      { freq: fundamental * 5.404, gain: 0.15, decay: 2.5 },
    ];

    const now = ctx.currentTime;
    partials.forEach(p => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = p.freq;
      const env = ctx.createGain();
      const peak = p.gain * state.volumes.bowl;
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(peak, now + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);
      osc.connect(env);
      env.connect(bowl.gain);
      osc.start(now);
      osc.stop(now + p.decay + 0.2);
    });
  }

  function startBowl(intervalSeconds) {
    const bowl = state.sources.bowl;
    if (!bowl) return;
    stopBowl();
    bowl.intervalActive = true;
    strikeBowl();
    bowl.intervalId = setInterval(strikeBowl, intervalSeconds * 1000);
  }

  function stopBowl() {
    const bowl = state.sources.bowl;
    if (!bowl) return;
    if (bowl.intervalId) clearInterval(bowl.intervalId);
    bowl.intervalId = null;
    bowl.intervalActive = false;
  }

  // ────────────────────────────────────────────────────────────────
  // Module 6: Volume / Option Application
  // ────────────────────────────────────────────────────────────────
  function applyVolume(soundId, volume) {
    state.volumes[soundId] = volume;
    if (!state.initialized) return;

    const sd = state.sources[soundId];
    if (!sd || !sd.gain) return;

    const now = state.audioCtx.currentTime;
    setSmooth(sd.gain.gain, volume, now, 0.05);

    if (soundId === 'rain') {
      const dropsOn = !!state.options.rain.drops;
      if (volume > 0.01 && dropsOn && !sd.dropsActive) {
        sd.dropsActive = true;
        scheduleDrop();
      } else if ((volume < 0.01 || !dropsOn) && sd.dropsActive) {
        sd.dropsActive = false;
        if (sd.dropsTimer) clearTimeout(sd.dropsTimer);
      }
    }

    if (soundId === 'fire') {
      if (volume > 0.01 && !sd.crackleActive) {
        sd.crackleActive = true;
        scheduleCrackle();
      } else if (volume < 0.01 && sd.crackleActive) {
        sd.crackleActive = false;
        if (sd.crackleTimer) clearTimeout(sd.crackleTimer);
      }
    }

    if (soundId === 'bowl') {
      const interval = state.options.bowl.interval || 20;
      if (volume > 0.01 && !sd.intervalActive) {
        startBowl(interval);
      } else if (volume < 0.01 && sd.intervalActive) {
        stopBowl();
      }
    }
  }

  function applyOption(soundId, key, value) {
    if (!state.options[soundId]) return;
    state.options[soundId][key] = value;
    if (!state.initialized) return;

    const ctx = state.audioCtx;
    const now = ctx.currentTime;
    const sd = state.sources[soundId];
    if (!sd) return;

    if (soundId === 'rain' && key === 'intensity') {
      const v = Number(value) || 5;
      const cutoff = 1500 + (v - 1) * (3500 / 9);
      setSmooth(sd.filter.frequency, cutoff, now, 0.1);
    }
    if (soundId === 'rain' && key === 'drops') {
      const dropsOn = !!value;
      if (dropsOn && state.volumes.rain > 0.01 && !sd.dropsActive) {
        sd.dropsActive = true;
        scheduleDrop();
      } else if (!dropsOn && sd.dropsActive) {
        sd.dropsActive = false;
        if (sd.dropsTimer) clearTimeout(sd.dropsTimer);
      }
    }

    if (soundId === 'white' && key === 'color') {
      const map = { 'White': 20000, 'Pink': 1500, 'Brown': 500 };
      const cutoff = map[value] || 20000;
      setSmooth(sd.filter.frequency, cutoff, now, 0.1);
    }

    if (soundId === 'wind' && key === 'speed') {
      const v = Number(value) || 5;
      const lfoFreq = 0.05 + (v - 1) * 0.06;
      setSmooth(sd.lfo.frequency, lfoFreq, now, 0.1);
    }

    if (soundId === 'fire' && key === 'crackle') {
      // crackle rate read live by scheduleCrackle from state.options.fire.crackle
    }

    if (soundId === 'drone' && key === 'pitch') {
      const baseMap = { 'Low': 1.0, 'Mid': 2.0, 'High': 4.0 };
      const mult = baseMap[value] || 1.0;
      const bases = [110, 165, 220];
      sd.oscs.forEach((o, i) => {
        const newFreq = bases[i] * mult;
        setSmooth(o.osc1.frequency, newFreq, now, 0.15);
        setSmooth(o.osc2.frequency, newFreq * 1.5, now, 0.15);
      });
    }
    if (soundId === 'drone' && key === 'brightness') {
      const v = Number(value) || 5;
      const cutoff = 400 + (v - 1) * 400; // 400..3600
      setSmooth(sd.filter.frequency, cutoff, now, 0.15);
    }

    if (soundId === 'bowl' && key === 'interval') {
      if (sd.intervalActive) {
        startBowl(Number(value) || 20);
      }
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Module 7: Visualizer
  // ────────────────────────────────────────────────────────────────
  let visualizerFrame = null;
  let idlePhase = 0;

  function startVisualizer() {
    const canvas = document.getElementById('pn-visualizer');
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');

    function resizeCanvas() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const draw = () => {
      visualizerFrame = requestAnimationFrame(draw);

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      ctx2d.fillStyle = reducedMotion ? 'rgba(15, 15, 14, 0.5)' : 'rgba(15, 15, 14, 0.15)';
      ctx2d.fillRect(0, 0, w, h);

      ctx2d.lineWidth = 2;
      ctx2d.strokeStyle = '#D97757';
      ctx2d.shadowBlur = reducedMotion ? 0 : 8;
      ctx2d.shadowColor = 'rgba(217, 119, 87, 0.5)';
      ctx2d.beginPath();

      if (state.analyser) {
        const bufferLength = state.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        state.analyser.getByteTimeDomainData(dataArray);

        const sliceWidth = w / bufferLength;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * h) / 2;
          if (i === 0) ctx2d.moveTo(x, y);
          else ctx2d.lineTo(x, y);
          x += sliceWidth;
        }
      } else {
        // Idle waveform — gentle sine while AudioContext not yet started
        idlePhase += reducedMotion ? 0.003 : 0.012;
        const samples = 240;
        const sliceWidth = w / samples;
        for (let i = 0; i < samples; i++) {
          const t = i / samples;
          const y = h / 2 + Math.sin(t * Math.PI * 4 + idlePhase) * (h * 0.04)
                          + Math.sin(t * Math.PI * 9 + idlePhase * 0.7) * (h * 0.02);
          if (i === 0) ctx2d.moveTo(i * sliceWidth, y);
          else ctx2d.lineTo(i * sliceWidth, y);
        }
      }

      ctx2d.stroke();
      ctx2d.shadowBlur = 0;
    };

    draw();
  }

  // ────────────────────────────────────────────────────────────────
  // Module 8: Rendering Sound Rows
  // ────────────────────────────────────────────────────────────────
  function renderSoundRows() {
    const container = document.getElementById('pn-sounds');
    if (!container) return;
    container.innerHTML = '';

    SOUNDS.forEach(sound => {
      const row = document.createElement('div');
      row.className = 'pn-sound-row';
      row.dataset.soundId = sound.id;
      const vol = Math.round(state.volumes[sound.id] * 100);
      row.dataset.active = vol > 1 ? 'true' : 'false';

      row.innerHTML = `
        <div class="pn-sound-name">${sound.name}</div>
        <input type="range" class="pn-slider" min="0" max="100" value="${vol}" data-sound="${sound.id}" aria-label="${sound.name} volume">
        <div class="pn-volume-label">${vol}%</div>
        <button class="pn-expand-btn" type="button" data-sound="${sound.id}" aria-label="${sound.name} options">···</button>
        <div class="pn-sound-options" data-sound="${sound.id}">
          ${sound.options.map(opt => renderOptionRow(sound.id, opt)).join('')}
        </div>
      `;
      container.appendChild(row);
    });

    bindSoundEvents();
  }

  function renderOptionRow(soundId, opt) {
    const value = state.options[soundId][opt.key];
    if (opt.type === 'slider') {
      return `
        <div class="pn-option-row">
          <span class="pn-option-label">${opt.label}</span>
          <input type="range" class="pn-option-slider" min="${opt.min}" max="${opt.max}" value="${value}" data-sound="${soundId}" data-opt="${opt.key}" aria-label="${opt.label}">
          <span class="pn-option-label" style="min-width:30px;text-align:right" data-value-for="${soundId}-${opt.key}">${value}</span>
        </div>`;
    }
    if (opt.type === 'select') {
      return `
        <div class="pn-option-row">
          <span class="pn-option-label">${opt.label}</span>
          <select class="pn-option-select" data-sound="${soundId}" data-opt="${opt.key}" aria-label="${opt.label}">
            ${opt.options.map(o => `<option value="${o}" ${o === value ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
        </div>`;
    }
    if (opt.type === 'toggle') {
      return `
        <div class="pn-option-row">
          <label class="pn-option-toggle">
            <input type="checkbox" data-sound="${soundId}" data-opt="${opt.key}" ${value ? 'checked' : ''}>
            <span>${opt.label}</span>
          </label>
        </div>`;
    }
    return '';
  }

  // ────────────────────────────────────────────────────────────────
  // Module 9: Event Bindings
  // ────────────────────────────────────────────────────────────────
  function bindSoundEvents() {
    document.querySelectorAll('.pn-slider').forEach(slider => {
      slider.addEventListener('input', async (e) => {
        if (!state.initialized) await initAudio();
        const soundId = e.target.dataset.sound;
        const value = parseInt(e.target.value, 10) / 100;
        applyVolume(soundId, value);
        const row = e.target.closest('.pn-sound-row');
        row.querySelector('.pn-volume-label').textContent = e.target.value + '%';
        row.dataset.active = value > 0.01 ? 'true' : 'false';
        dismissOverlay();
        updateURL();
      });
    });

    document.querySelectorAll('.pn-option-slider').forEach(el => {
      el.addEventListener('input', (e) => {
        const soundId = e.target.dataset.sound;
        const key = e.target.dataset.opt;
        const value = parseInt(e.target.value, 10);
        applyOption(soundId, key, value);
        const label = document.querySelector(`[data-value-for="${soundId}-${key}"]`);
        if (label) label.textContent = value;
        updateURL();
      });
    });

    document.querySelectorAll('.pn-option-select').forEach(el => {
      el.addEventListener('change', (e) => {
        const soundId = e.target.dataset.sound;
        const key = e.target.dataset.opt;
        applyOption(soundId, key, e.target.value);
        updateURL();
      });
    });

    document.querySelectorAll('.pn-option-toggle input').forEach(el => {
      el.addEventListener('change', (e) => {
        const soundId = e.target.dataset.sound;
        const key = e.target.dataset.opt;
        applyOption(soundId, key, e.target.checked);
        updateURL();
      });
    });

    document.querySelectorAll('.pn-expand-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const expanded = btn.dataset.expanded === 'true';
        btn.dataset.expanded = (!expanded).toString();
        const options = btn.parentElement.querySelector('.pn-sound-options');
        options.dataset.expanded = (!expanded).toString();
      });
    });
  }

  function refreshSliderUI() {
    document.querySelectorAll('.pn-slider').forEach(slider => {
      const soundId = slider.dataset.sound;
      const newVal = Math.round(state.volumes[soundId] * 100);
      slider.value = newVal;
      const row = slider.closest('.pn-sound-row');
      row.querySelector('.pn-volume-label').textContent = newVal + '%';
      row.dataset.active = newVal > 1 ? 'true' : 'false';
    });
  }

  // ────────────────────────────────────────────────────────────────
  // Module 10: Action Buttons + Toast
  // ────────────────────────────────────────────────────────────────
  let toastTimer = null;
  function showToast(message) {
    const toast = document.getElementById('pn-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 1800);
  }

  function bindActions() {
    document.getElementById('pn-reset-btn').addEventListener('click', () => {
      SOUNDS.forEach(s => applyVolume(s.id, 0));
      refreshSliderUI();
      updateURL();
    });

    document.getElementById('pn-share-btn').addEventListener('click', async () => {
      const url = window.location.href;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(url);
        } else {
          const ta = document.createElement('textarea');
          ta.value = url;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        showToast('Link copied');
      } catch (e) {
        showToast('Copy failed');
      }
    });

    document.getElementById('pn-random-btn').addEventListener('click', async () => {
      if (!state.initialized) await initAudio();
      dismissOverlay();
      const shuffled = SOUNDS.slice().sort(() => Math.random() - 0.5);
      const count = 2 + Math.floor(Math.random() * 2);
      const selected = shuffled.slice(0, count);
      SOUNDS.forEach(s => applyVolume(s.id, 0));
      selected.forEach(s => applyVolume(s.id, 0.3 + Math.random() * 0.5));
      refreshSliderUI();
      updateURL();
    });
  }

  // ────────────────────────────────────────────────────────────────
  // Module 11: First-use overlay
  // ────────────────────────────────────────────────────────────────
  function dismissOverlay() {
    const overlay = document.getElementById('pn-overlay');
    if (overlay) overlay.classList.add('is-hidden');
  }

  function bindOverlay() {
    const overlay = document.getElementById('pn-overlay');
    if (!overlay) return;
    overlay.addEventListener('click', async () => {
      await initAudio();
      dismissOverlay();
      // If URL had non-zero volumes, the apply happened in initAudio; refresh UI.
      refreshSliderUI();
    });
  }

  // ────────────────────────────────────────────────────────────────
  // Module 12: Boot
  // ────────────────────────────────────────────────────────────────
  function init() {
    decodeStateFromURL();
    renderSoundRows();
    bindActions();
    bindOverlay();
    startVisualizer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
