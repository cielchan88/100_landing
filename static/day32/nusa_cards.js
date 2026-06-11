/* Nusa TCG — the card roster (Day 32).
 * 22 original cards themed on Indonesian wildlife (Rimba) and mythology
 * (Sakti), plus colorless Trainers. All cards, attacks, and effects are
 * original work; the genre's mechanics are not.
 *
 * Language convention: app copy, attack names, item names, and effect text
 * are English. Indonesian is reserved for character proper nouns — the 17
 * creature names plus the two human supporters (Pedagang Pasar, Dukun) — and
 * for Rimba / Sakti as type names.
 *
 * type: 'R' Rimba / 'S' Sakti / 'T' Trainer. Energy pips in costs: 'R', 'S',
 * or 'C' (colorless = any energy). Rarity: C/U/R/L; Legends (L) are worth 2
 * points when knocked out. */
(function () {
  'use strict';

  var CARDS = [
    // ---- RIMBA ----
    { id: 'kancil', no: 1, name: 'Kancil', type: 'R', kind: 'creature', stage: 0, hp: 60, retreat: 0, rarity: 'C', emoji: '\u{1F98C}',
      attacks: [{ name: 'Swift Dash', cost: ['R'], dmg: 20, fx: null, text: '' }] },
    { id: 'kupu_raja', no: 2, name: 'Kupu Raja', type: 'R', kind: 'creature', stage: 0, hp: 50, retreat: 0, rarity: 'C', emoji: '\u{1F98B}',
      attacks: [{ name: 'Pollen Wings', cost: ['C'], dmg: 10, fx: 'healSelf10', text: 'Heal 10 from this creature.' }] },
    { id: 'cendrawasih', no: 3, name: 'Cendrawasih', type: 'R', kind: 'creature', stage: 0, hp: 60, retreat: 0, rarity: 'U', emoji: '\u{1F426}',
      attacks: [{ name: 'Far Peck', cost: ['R'], dmg: 20, fx: 'snipe', text: 'Hit ONE of the opponent’s benched creatures for 20. Requires a bench target.' }] },
    { id: 'komodo_muda', no: 4, name: 'Komodo Muda', type: 'R', kind: 'creature', stage: 0, hp: 70, retreat: 1, rarity: 'C', emoji: '\u{1F98E}',
      attacks: [{ name: 'Bite', cost: ['R'], dmg: 20, fx: null, text: '' }] },
    { id: 'raja_komodo', no: 5, name: 'Raja Komodo', type: 'R', kind: 'creature', stage: 1, evolvesFrom: 'komodo_muda', hp: 130, retreat: 2, rarity: 'R', emoji: '\u{1F40A}',
      attacks: [{ name: 'Venom Bite', cost: ['R', 'R'], dmg: 50, fx: 'coin20', text: 'Flip a coin: heads, +20 damage.' }] },
    { id: 'harimau_loreng', no: 6, name: 'Harimau Loreng', type: 'R', kind: 'creature', stage: 0, hp: 80, retreat: 1, rarity: 'U', emoji: '\u{1F405}',
      attacks: [{ name: 'Claw', cost: ['R', 'C'], dmg: 30, fx: null, text: '' }] },
    { id: 'harimau_malam', no: 7, name: 'Harimau Malam', type: 'R', kind: 'creature', stage: 1, evolvesFrom: 'harimau_loreng', hp: 140, retreat: 2, rarity: 'L', emoji: '\u{1F42F}',
      attacks: [{ name: 'Night Pounce', cost: ['R', 'R', 'C'], dmg: 80, fx: null, text: '' }] },
    { id: 'orangutan', no: 8, name: 'Orangutan', type: 'R', kind: 'creature', stage: 0, hp: 90, retreat: 2, rarity: 'U', emoji: '\u{1F9A7}',
      attacks: [{ name: 'Slam', cost: ['R', 'C'], dmg: 40, fx: null, text: '' }] },
    { id: 'badak_bercula', no: 9, name: 'Badak Bercula', type: 'R', kind: 'creature', stage: 0, hp: 100, retreat: 3, rarity: 'R', emoji: '\u{1F98F}',
      attacks: [{ name: 'Horn Charge', cost: ['R', 'R', 'C'], dmg: 60, fx: null, text: '' }] },

    // ---- SAKTI ----
    { id: 'peri_embun', no: 10, name: 'Peri Embun', type: 'S', kind: 'creature', stage: 0, hp: 50, retreat: 0, rarity: 'C', emoji: '\u{1F9DA}',
      attacks: [{ name: 'Sacred Dew', cost: ['S'], dmg: 0, fx: 'healAny20', text: 'Heal 20 from one of your creatures. No damage.' }] },
    { id: 'banaspati', no: 11, name: 'Banaspati', type: 'S', kind: 'creature', stage: 0, hp: 70, retreat: 1, rarity: 'C', emoji: '\u{1F525}',
      attacks: [{ name: 'Ember Flare', cost: ['S'], dmg: 20, fx: 'coin10', text: 'Flip a coin: heads, +10 damage.' }] },
    { id: 'anak_naga', no: 12, name: 'Anak Naga', type: 'S', kind: 'creature', stage: 0, hp: 60, retreat: 1, rarity: 'C', emoji: '\u{1F409}',
      attacks: [{ name: 'Dragon Spark', cost: ['S'], dmg: 20, fx: null, text: '' }] },
    { id: 'naga_nusantara', no: 13, name: 'Naga Nusantara', type: 'S', kind: 'creature', stage: 1, evolvesFrom: 'anak_naga', hp: 150, retreat: 2, rarity: 'L', emoji: '\u{1F432}',
      attacks: [{ name: 'Archipelago Fire', cost: ['S', 'S', 'C'], dmg: 70, fx: 'discardS', text: 'Discard 1 S energy from this creature.' }] },
    { id: 'garuda_muda', no: 14, name: 'Garuda Muda', type: 'S', kind: 'creature', stage: 0, hp: 70, retreat: 1, rarity: 'U', emoji: '\u{1F985}',
      attacks: [{ name: 'Swoop', cost: ['S', 'C'], dmg: 30, fx: null, text: '' }] },
    { id: 'garuda_perkasa', no: 15, name: 'Garuda Perkasa', type: 'S', kind: 'creature', stage: 1, evolvesFrom: 'garuda_muda', hp: 130, retreat: 1, rarity: 'R', emoji: '\u{1F985}',
      attacks: [{ name: 'Sky Strike', cost: ['S', 'S'], dmg: 60, fx: null, text: '' }] },
    { id: 'barong', no: 16, name: 'Barong', type: 'S', kind: 'creature', stage: 0, hp: 90, retreat: 2, rarity: 'R', emoji: '\u{1F981}',
      attacks: [{ name: 'Guardian Fang', cost: ['S', 'C'], dmg: 30, fx: 'shield10', text: 'This creature takes −10 damage during the opponent’s next turn.' }] },
    { id: 'jin_gunung', no: 17, name: 'Jin Gunung', type: 'S', kind: 'creature', stage: 0, hp: 100, retreat: 3, rarity: 'U', emoji: '\u{1F5FF}',
      attacks: [{ name: 'Boulder Smash', cost: ['S', 'C', 'C'], dmg: 50, fx: null, text: '' }] },

    // ---- TRAINERS (colorless, both decks) ----
    // Pedagang Pasar and Dukun keep their Indonesian names (human characters,
    // proper nouns by the language rule). Other Trainers are common items.
    { id: 'pedagang_pasar', no: 18, name: 'Pedagang Pasar', type: 'T', kind: 'supporter', rarity: 'C', emoji: '\u{1F9FA}',
      fx: 'draw2', text: 'Draw 2 cards.' },
    { id: 'dukun', no: 19, name: 'Dukun', type: 'T', kind: 'supporter', rarity: 'U', emoji: '\u{1F33F}',
      fx: 'heal50', text: 'Heal 50 from one of your creatures.' },
    { id: 'herbal_tonic', no: 20, name: 'Herbal Tonic', type: 'T', kind: 'item', rarity: 'C', emoji: '\u{1F375}',
      fx: 'heal20', text: 'Heal 20 from one of your creatures.' },
    { id: 'swift_boat', no: 21, name: 'Swift Boat', type: 'T', kind: 'item', rarity: 'C', emoji: '\u{1F6F6}',
      fx: 'switch', text: 'Switch your Active with a Benched creature (free).' },
    { id: 'ancient_map', no: 22, name: 'Ancient Map', type: 'T', kind: 'item', rarity: 'C', emoji: '\u{1F5FA}',
      fx: 'draw1', text: 'Draw 1 card.' },
  ];

  var BY_ID = {};
  CARDS.forEach(function (c) { BY_ID[c.id] = c; });

  // Prebuilt 20-card decks (max 2 copies per name).
  // Note: the design doc's Sakti list summed to 19; Ancient Map is 2x here to
  // reach a legal 20.
  var DECKS = {
    R: ['kancil', 'kancil', 'komodo_muda', 'komodo_muda', 'raja_komodo', 'raja_komodo',
        'harimau_loreng', 'harimau_loreng', 'harimau_malam', 'cendrawasih', 'cendrawasih',
        'orangutan', 'badak_bercula', 'pedagang_pasar', 'pedagang_pasar', 'dukun',
        'herbal_tonic', 'herbal_tonic', 'swift_boat', 'swift_boat'],
    S: ['anak_naga', 'anak_naga', 'naga_nusantara', 'garuda_muda', 'garuda_muda',
        'garuda_perkasa', 'garuda_perkasa', 'banaspati', 'banaspati', 'barong',
        'jin_gunung', 'peri_embun', 'pedagang_pasar', 'pedagang_pasar', 'dukun',
        'herbal_tonic', 'herbal_tonic', 'swift_boat', 'ancient_map', 'ancient_map'],
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
