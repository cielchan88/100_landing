/* Forty — Day 20. Hijri-age calculator, 100% client-side. */
(function () {
  'use strict';

  const DAY_MS = 86400000;
  const HIJRI_MONTHS = [
    'Muharram', 'Safar', "Rabi' al-Awwal", "Rabi' al-Thani",
    'Jumada al-Awwal', 'Jumada al-Thani', 'Rajab', "Sha'ban",
    'Ramadan', 'Shawwal', "Dhu al-Qi'dah", 'Dhu al-Hijjah',
  ];

  // ===== Calendar functions =====
  const hijriFmt = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura', {
    day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC',
  });

  function getHijriParts(date) {
    const obj = {};
    for (const p of hijriFmt.formatToParts(date)) {
      if (p.type === 'year') obj.year = parseInt(p.value, 10);
      if (p.type === 'month') obj.month = parseInt(p.value, 10);
      if (p.type === 'day') obj.day = parseInt(p.value, 10);
    }
    return obj;
  }

  function hijriToGregorian(hYear, hMonth, hDay) {
    const target = hYear * 10000 + hMonth * 100 + hDay;
    const estGregYear = Math.floor(hYear * 0.970224 + 621.5643);
    let lo = Date.UTC(estGregYear - 2, 0, 1, 12, 0, 0);
    let hi = Date.UTC(estGregYear + 2, 11, 31, 12, 0, 0);

    while (lo <= hi) {
      const midDays = Math.floor(((lo + hi) / 2) / DAY_MS);
      const mid = midDays * DAY_MS + 12 * 3600 * 1000;
      const h = getHijriParts(new Date(mid));
      const val = h.year * 10000 + h.month * 100 + h.day;
      if (val < target) lo = mid + DAY_MS;
      else if (val > target) hi = mid - DAY_MS;
      else return new Date(mid);
    }
    // Exact Hijri day may not exist that year; lo points just past it.
    return new Date(lo);
  }

  function hijriAge(birthH, todayH) {
    let years = todayH.year - birthH.year;
    if (todayH.month < birthH.month ||
        (todayH.month === birthH.month && todayH.day < birthH.day)) {
      years -= 1;
    }
    return years;
  }

  function gregorianAge(birthDate, today) {
    let years = today.getUTCFullYear() - birthDate.getUTCFullYear();
    const m = today.getUTCMonth() - birthDate.getUTCMonth();
    if (m < 0 || (m === 0 && today.getUTCDate() < birthDate.getUTCDate())) {
      years -= 1;
    }
    return years;
  }

  function fortiethHijriBirthday(birthDate) {
    const bh = getHijriParts(birthDate);
    return hijriToGregorian(bh.year + 40, bh.month, bh.day);
  }

  function fortiethGregorian(birthDate) {
    return new Date(Date.UTC(
      birthDate.getUTCFullYear() + 40,
      birthDate.getUTCMonth(),
      birthDate.getUTCDate(), 12, 0, 0,
    ));
  }

  // ===== Formatting =====
  function formatGregorian(date) {
    return date.toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    });
  }

  function formatHijri(parts) {
    return `${parts.day} ${HIJRI_MONTHS[parts.month - 1]} ${parts.year} AH`;
  }

  function ymBetween(from, to) {
    let years = to.getUTCFullYear() - from.getUTCFullYear();
    let months = to.getUTCMonth() - from.getUTCMonth();
    if (to.getUTCDate() < from.getUTCDate()) months -= 1;
    if (months < 0) { years -= 1; months += 12; }
    return { years, months };
  }

  function formatDuration(from, to) {
    const { years, months } = ymBetween(from, to);
    const parts = [];
    if (years > 0) parts.push(years + ' year' + (years !== 1 ? 's' : ''));
    if (months > 0) parts.push(months + ' month' + (months !== 1 ? 's' : ''));
    if (parts.length === 0) return 'less than a month';
    return parts.join(', ');
  }

  function totalMonths(from, to) {
    const { years, months } = ymBetween(from, to);
    return years * 12 + months;
  }

  function describeFortieth(fortiethDate, today) {
    const diffMs = fortiethDate.getTime() - today.getTime();
    if (Math.abs(diffMs) < DAY_MS) return 'today';
    const future = diffMs > 0;
    const dur = formatDuration(future ? today : fortiethDate, future ? fortiethDate : today);
    return future ? `in ${dur}` : `${dur} ago`;
  }

  // ===== DOM / flow =====
  let dom = {};

  function browserSupported() {
    const h = getHijriParts(new Date());
    return h.year && h.year > 1400 && h.year < 1600;
  }

  function parseInputDate(value) {
    if (!value) return null;
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    const date = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
    // reject if the round-trip changed (invalid like 1985-02-31)
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
    return date;
  }

  function todayUTCNoon() {
    const n = new Date();
    return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0, 0));
  }

  function calculate(birthDate) {
    const today = todayUTCNoon();

    if (birthDate.getTime() > today.getTime()) {
      showError('That birthdate is in the future. Enter a date on or before today.');
      hideResults();
      return;
    }
    hideError();

    const birthH = getHijriParts(birthDate);
    const todayH = getHijriParts(today);

    const f40 = fortiethHijriBirthday(birthDate);
    const f40H = getHijriParts(f40);
    const g40 = fortiethGregorian(birthDate);

    // Card A
    dom.hijri40Greg.textContent = formatGregorian(f40);
    dom.hijri40Hijri.textContent = formatHijri(f40H);
    dom.hijri40Framing.textContent = describeFortieth(f40, today);

    // gap between 40th Hijri and 40th Gregorian (Hijri comes first)
    const gapMonths = Math.abs(totalMonths(
      f40.getTime() < g40.getTime() ? f40 : g40,
      f40.getTime() < g40.getTime() ? g40 : f40,
    ));
    dom.hijri40Comparison.textContent =
      `That's about ${gapMonths} month${gapMonths !== 1 ? 's' : ''} before your 40th Gregorian birthday on ${formatGregorian(g40)}.`;

    // Card B
    const gAge = gregorianAge(birthDate, today);
    const hAge = hijriAge(birthH, todayH);
    dom.ageGreg.textContent = gAge;
    dom.ageHijri.textContent = hAge;
    if (hAge !== gAge) {
      dom.ageHighlight.textContent =
        `You are already ${hAge} in Hijri years, but ${gAge} in Gregorian years.`;
      dom.ageHighlight.classList.remove('is-hidden');
    } else {
      dom.ageHighlight.classList.add('is-hidden');
    }

    // Card C
    dom.birthGreg.textContent = formatGregorian(birthDate);
    dom.birthHijri.textContent = formatHijri(birthH);

    showResults();
  }

  function showResults() { dom.results.classList.add('is-visible'); }
  function hideResults() { dom.results.classList.remove('is-visible'); }
  function showError(msg) { dom.error.textContent = msg; dom.error.classList.remove('is-hidden'); }
  function hideError() { dom.error.classList.add('is-hidden'); }

  function showToast(msg) {
    dom.toast.textContent = msg;
    dom.toast.classList.add('is-visible');
    setTimeout(() => dom.toast.classList.remove('is-visible'), 1800);
  }

  function updateHash(value) {
    try { history.replaceState(null, '', '#d=' + value); } catch (e) {}
  }

  function onInputChange() {
    const value = dom.input.value;
    const birthDate = parseInputDate(value);
    if (!birthDate) { hideResults(); hideError(); return; }
    updateHash(value);
    calculate(birthDate);
  }

  function init() {
    dom = {
      input: document.getElementById('forty-date'),
      results: document.getElementById('forty-results'),
      error: document.querySelector('.forty-error'),
      toast: document.querySelector('.forty-toast'),
      hijri40Greg: document.getElementById('forty-hijri40-greg'),
      hijri40Hijri: document.getElementById('forty-hijri40-hijri'),
      hijri40Framing: document.getElementById('forty-hijri40-framing'),
      hijri40Comparison: document.getElementById('forty-hijri40-comparison'),
      ageGreg: document.getElementById('forty-age-greg'),
      ageHijri: document.getElementById('forty-age-hijri'),
      ageHighlight: document.getElementById('forty-age-highlight'),
      birthGreg: document.getElementById('forty-birth-greg'),
      birthHijri: document.getElementById('forty-birth-hijri'),
      shareBtn: document.getElementById('forty-share-btn'),
      resetBtn: document.getElementById('forty-reset-btn'),
    };

    // Max = today
    const n = new Date();
    const mm = String(n.getMonth() + 1).padStart(2, '0');
    const dd = String(n.getDate()).padStart(2, '0');
    dom.input.max = `${n.getFullYear()}-${mm}-${dd}`;

    if (!browserSupported()) {
      showError("Your browser doesn't support the Islamic calendar conversion. Try a recent version of Chrome, Safari, or Firefox.");
      dom.input.disabled = true;
      return;
    }

    dom.input.addEventListener('change', onInputChange);
    dom.input.addEventListener('input', onInputChange);

    dom.shareBtn.addEventListener('click', () => {
      const url = window.location.href;
      const done = () => showToast('Link copied');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopy(url, done));
      } else { fallbackCopy(url, done); }
    });

    dom.resetBtn.addEventListener('click', () => {
      dom.input.value = '';
      hideResults();
      hideError();
      updateHash('');
      try { history.replaceState(null, '', window.location.pathname); } catch (e) {}
      dom.input.focus();
    });

    // Prefill from URL hash
    const m = window.location.hash.match(/d=(\d{4}-\d{2}-\d{2})/);
    if (m) {
      dom.input.value = m[1];
      onInputChange();
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
