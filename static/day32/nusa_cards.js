/* Nusa TCG — the card roster (Day 32).
 * 22 original cards themed on Indonesian wildlife (Rimba) and mythology
 * (Sakti), plus colorless Trainers. All names, creatures, attacks, and text
 * are original. type: 'R' Rimba / 'S' Sakti / 'T' Trainer. Energy pips in
 * costs: 'R', 'S', or 'C' (colorless = any energy). Rarity: C/U/R/L; Legends
 * (L) are worth 2 points when knocked out. */
(function () {
  'use strict';

  var CARDS = [
    // ---- RIMBA ----
    { id: 'kancil', no: 1, name: 'Kancil', type: 'R', kind: 'creature', stage: 0, hp: 60, retreat: 0, rarity: 'C', emoji: '\u{1F98C}',
      attacks: [{ name: 'Lari Lincah', cost: ['R'], dmg: 20, fx: null, text: '' }] },
    { id: 'kupu_raja', no: 2, name: 'Kupu Raja', type: 'R', kind: 'creature', stage: 0, hp: 50, retreat: 0, rarity: 'C', emoji: '\u{1F98B}',
      attacks: [{ name: 'Sayap Serbuk', cost: ['C'], dmg: 10, fx: 'healSelf10', text: 'Pulihkan 10 dari kartu ini.' }] },
    { id: 'cendrawasih', no: 3, name: 'Cendrawasih', type: 'R', kind: 'creature', stage: 0, hp: 60, retreat: 0, rarity: 'U', emoji: '\u{1F426}',
      attacks: [{ name: 'Patuk Jauh', cost: ['R'], dmg: 20, fx: 'snipe', text: 'Serang SATU kartu di Bench lawan (20 damage). Butuh target di Bench.' }] },
    { id: 'komodo_muda', no: 4, name: 'Komodo Muda', type: 'R', kind: 'creature', stage: 0, hp: 70, retreat: 1, rarity: 'C', emoji: '\u{1F98E}',
      attacks: [{ name: 'Gigit', cost: ['R'], dmg: 20, fx: null, text: '' }] },
    { id: 'raja_komodo', no: 5, name: 'Raja Komodo', type: 'R', kind: 'creature', stage: 1, evolvesFrom: 'komodo_muda', hp: 130, retreat: 2, rarity: 'R', emoji: '\u{1F40A}',
      attacks: [{ name: 'Gigitan Bisa', cost: ['R', 'R'], dmg: 50, fx: 'coin20', text: 'Lempar koin: jika gambar, +20 damage.' }] },
    { id: 'harimau_loreng', no: 6, name: 'Harimau Loreng', type: 'R', kind: 'creature', stage: 0, hp: 80, retreat: 1, rarity: 'U', emoji: '\u{1F405}',
      attacks: [{ name: 'Cakar', cost: ['R', 'C'], dmg: 30, fx: null, text: '' }] },
    { id: 'harimau_malam', no: 7, name: 'Harimau Malam', type: 'R', kind: 'creature', stage: 1, evolvesFrom: 'harimau_loreng', hp: 140, retreat: 2, rarity: 'L', emoji: '\u{1F42F}',
      attacks: [{ name: 'Terkam Malam', cost: ['R', 'R', 'C'], dmg: 80, fx: null, text: '' }] },
    { id: 'orangutan', no: 8, name: 'Orangutan', type: 'R', kind: 'creature', stage: 0, hp: 90, retreat: 2, rarity: 'U', emoji: '\u{1F9A7}',
      attacks: [{ name: 'Banting', cost: ['R', 'C'], dmg: 40, fx: null, text: '' }] },
    { id: 'badak_bercula', no: 9, name: 'Badak Bercula', type: 'R', kind: 'creature', stage: 0, hp: 100, retreat: 3, rarity: 'R', emoji: '\u{1F98F}',
      attacks: [{ name: 'Seruduk', cost: ['R', 'R', 'C'], dmg: 60, fx: null, text: '' }] },

    // ---- SAKTI ----
    { id: 'peri_embun', no: 10, name: 'Peri Embun', type: 'S', kind: 'creature', stage: 0, hp: 50, retreat: 0, rarity: 'C', emoji: '\u{1F9DA}',
      attacks: [{ name: 'Embun Sakti', cost: ['S'], dmg: 0, fx: 'healAny20', text: 'Pulihkan 20 dari salah satu kartumu. Tanpa damage.' }] },
    { id: 'banaspati', no: 11, name: 'Banaspati', type: 'S', kind: 'creature', stage: 0, hp: 70, retreat: 1, rarity: 'C', emoji: '\u{1F525}',
      attacks: [{ name: 'Bara Api', cost: ['S'], dmg: 20, fx: 'coin10', text: 'Lempar koin: jika gambar, +10 damage.' }] },
    { id: 'anak_naga', no: 12, name: 'Anak Naga', type: 'S', kind: 'creature', stage: 0, hp: 60, retreat: 1, rarity: 'C', emoji: '\u{1F409}',
      attacks: [{ name: 'Semburan Kecil', cost: ['S'], dmg: 20, fx: null, text: '' }] },
    { id: 'naga_nusantara', no: 13, name: 'Naga Nusantara', type: 'S', kind: 'creature', stage: 1, evolvesFrom: 'anak_naga', hp: 150, retreat: 2, rarity: 'L', emoji: '\u{1F432}',
      attacks: [{ name: 'Api Nusantara', cost: ['S', 'S', 'C'], dmg: 70, fx: 'discardS', text: 'Buang 1 energi S dari kartu ini.' }] },
    { id: 'garuda_muda', no: 14, name: 'Garuda Muda', type: 'S', kind: 'creature', stage: 0, hp: 70, retreat: 1, rarity: 'U', emoji: '\u{1F985}',
      attacks: [{ name: 'Sambar', cost: ['S', 'C'], dmg: 30, fx: null, text: '' }] },
    { id: 'garuda_perkasa', no: 15, name: 'Garuda Perkasa', type: 'S', kind: 'creature', stage: 1, evolvesFrom: 'garuda_muda', hp: 130, retreat: 1, rarity: 'R', emoji: '\u{1F985}',
      attacks: [{ name: 'Terjang Angkasa', cost: ['S', 'S'], dmg: 60, fx: null, text: '' }] },
    { id: 'barong', no: 16, name: 'Barong', type: 'S', kind: 'creature', stage: 0, hp: 90, retreat: 2, rarity: 'R', emoji: '\u{1F981}',
      attacks: [{ name: 'Taring Pelindung', cost: ['S', 'C'], dmg: 30, fx: 'shield10', text: 'Kartu ini menerima -10 damage saat giliran lawan berikutnya.' }] },
    { id: 'jin_gunung', no: 17, name: 'Jin Gunung', type: 'S', kind: 'creature', stage: 0, hp: 100, retreat: 3, rarity: 'U', emoji: '\u{1F5FF}',
      attacks: [{ name: 'Hantam Batu', cost: ['S', 'C', 'C'], dmg: 50, fx: null, text: '' }] },

    // ---- TRAINERS (colorless, both decks) ----
    { id: 'pedagang_pasar', no: 18, name: 'Pedagang Pasar', type: 'T', kind: 'supporter', rarity: 'C', emoji: '\u{1F9FA}',
      fx: 'draw2', text: 'Ambil 2 kartu.' },
    { id: 'dukun', no: 19, name: 'Dukun', type: 'T', kind: 'supporter', rarity: 'U', emoji: '\u{1F33F}',
      fx: 'heal50', text: 'Pulihkan 50 dari salah satu kartumu.' },
    { id: 'jamu', no: 20, name: 'Jamu', type: 'T', kind: 'item', rarity: 'C', emoji: '\u{1F375}',
      fx: 'heal20', text: 'Pulihkan 20 dari salah satu kartumu.' },
    { id: 'perahu_cepat', no: 21, name: 'Perahu Cepat', type: 'T', kind: 'item', rarity: 'C', emoji: '\u{1F6F6}',
      fx: 'switch', text: 'Tukar kartu Active-mu dengan satu kartu di Bench (gratis).' },
    { id: 'peta_kuno', no: 22, name: 'Peta Kuno', type: 'T', kind: 'item', rarity: 'C', emoji: '\u{1F5FA}',
      fx: 'draw1', text: 'Ambil 1 kartu.' },
  ];

  var BY_ID = {};
  CARDS.forEach(function (c) { BY_ID[c.id] = c; });

  // Prebuilt 20-card decks (max 2 copies per name).
  // Note: the design doc's Sakti list summed to 19; Peta Kuno is 2x here to
  // reach a legal 20.
  var DECKS = {
    R: ['kancil', 'kancil', 'komodo_muda', 'komodo_muda', 'raja_komodo', 'raja_komodo',
        'harimau_loreng', 'harimau_loreng', 'harimau_malam', 'cendrawasih', 'cendrawasih',
        'orangutan', 'badak_bercula', 'pedagang_pasar', 'pedagang_pasar', 'dukun',
        'jamu', 'jamu', 'perahu_cepat', 'perahu_cepat'],
    S: ['anak_naga', 'anak_naga', 'naga_nusantara', 'garuda_muda', 'garuda_muda',
        'garuda_perkasa', 'garuda_perkasa', 'banaspati', 'banaspati', 'barong',
        'jin_gunung', 'peri_embun', 'pedagang_pasar', 'pedagang_pasar', 'dukun',
        'jamu', 'jamu', 'perahu_cepat', 'peta_kuno', 'peta_kuno'],
  };

  var PACK = {
    size: 5,
    weights: { C: 60, U: 25, R: 12, L: 3 },      // per-slot rarity weights (%)
    pityWeights: { U: 25, R: 12, L: 3 },          // slot-5 reroll pool if no U+ yet
    freePerDay: 2,
    creditCap: 5,
  };

  var TYPE_NAMES = { R: 'Rimba', S: 'Sakti', T: 'Trainer' };

  var api = { CARDS: CARDS, BY_ID: BY_ID, DECKS: DECKS, PACK: PACK, TYPE_NAMES: TYPE_NAMES };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.NUSA_CARDS = api;
})();
