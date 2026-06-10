/* Nusa TCG — Day 32. A pocket trading-card battler: 20-card decks, an Energy
 * Zone instead of energy cards, a 3-slot bench, KO points (Legend = 2), first
 * to 3 wins. Played vs a rule-based AI with two prebuilt decks; boosters and
 * a collection binder round out the loop.
 *
 * Architecture: the match engine is pure (no DOM) — every rule lives in it as
 * a validated action that throws on illegal moves, so the AI cannot cheat and
 * the whole rule set can be asserted headless in Node. Packs and the daily
 * economy are pure functions too. The browser shell below renders state and
 * drives the AI with visible pacing. */
(function () {
  'use strict';

  var DATA = (typeof module !== 'undefined' && module.exports)
    ? require('./nusa_cards.js')
    : window.NUSA_CARDS;
  var BY_ID = DATA.BY_ID, DECKS = DATA.DECKS, PACK = DATA.PACK, CARDS = DATA.CARDS;

  // =====================================================================
  // Match engine (pure)
  // =====================================================================

  var WIN_POINTS = 3;
  var BENCH_MAX = 3;
  var uidSeq = 0;

  function err(msg) { throw new Error('[nusa] ' + msg); }

  function mkInstFromCard(card, globalTurn) {
    return { uid: ++uidSeq, card: card, dmg: 0, energy: [], enteredTurn: globalTurn, shieldUntil: -1, stack: [card] };
  }

  function mkSide(id, deckType, rng) {
    var deck = DECKS[deckType].map(function (cid) { return { uid: ++uidSeq, card: BY_ID[cid] }; });
    shuffle(deck, rng);
    return {
      id: id, type: deckType, deck: deck, hand: [], discard: [],
      active: null, bench: [], points: 0, turnsTaken: 0,
      energyAvail: false, supporterPlayed: false, retreated: false, setupDone: false,
    };
  }

  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
  }

  function hasBasic(cards) {
    return cards.some(function (h) { return h.card.kind === 'creature' && h.card.stage === 0; });
  }

  function newMatch(playerType, rng) {
    rng = rng || Math.random;
    var aiType = playerType === 'R' ? 'S' : 'R';
    var st = {
      rng: rng, globalTurn: 0, phase: 'setup', current: null, first: null,
      winner: null, pendingPromote: null, promoteThenEnd: false, log: [],
      sides: { P: mkSide('P', playerType, rng), O: mkSide('O', aiType, rng) },
    };
    ['P', 'O'].forEach(function (sid) {
      var s = st.sides[sid];
      // Opening hand of 5 with a guaranteed Basic: mulligan until true.
      for (var guard = 0; guard < 100; guard++) {
        s.hand = s.deck.splice(0, 5);
        if (hasBasic(s.hand)) break;
        s.deck = s.deck.concat(s.hand);
        s.hand = [];
        shuffle(s.deck, rng);
      }
    });
    return st;
  }

  function side(st, sid) { return st.sides[sid]; }
  function foe(sid) { return sid === 'P' ? 'O' : 'P'; }
  function pushLog(st, msg) { st.log.push(msg); if (st.log.length > 60) st.log.shift(); }

  function creatures(s) {
    var out = [];
    if (s.active) out.push({ loc: { zone: 'active', idx: 0 }, inst: s.active });
    s.bench.forEach(function (b, i) { out.push({ loc: { zone: 'bench', idx: i }, inst: b }); });
    return out;
  }
  function instAt(s, loc) {
    if (!loc) return null;
    if (loc.zone === 'active') return s.active;
    return s.bench[loc.idx] || null;
  }

  // ---- Setup phase ----
  function setupActive(st, sid, handIdx) {
    if (st.phase !== 'setup') err('bukan fase setup');
    var s = side(st, sid);
    if (s.setupDone) err('setup sudah selesai');
    var h = s.hand[handIdx];
    if (!h || h.card.kind !== 'creature' || h.card.stage !== 0) err('Active harus kartu Basic');
    if (s.active) { s.hand.push({ uid: s.active.uid, card: s.active.card }); s.active = null; }
    s.hand.splice(handIdx, 1);
    s.active = mkInstFromCard(h.card, 0);
  }
  function setupBench(st, sid, handIdx) {
    if (st.phase !== 'setup') err('bukan fase setup');
    var s = side(st, sid);
    if (!s.active) err('pilih Active dulu');
    if (s.bench.length >= BENCH_MAX) err('bench penuh');
    var h = s.hand[handIdx];
    if (!h || h.card.kind !== 'creature' || h.card.stage !== 0) err('hanya Basic ke bench');
    s.hand.splice(handIdx, 1);
    s.bench.push(mkInstFromCard(h.card, 0));
  }
  function setupDone(st, sid) {
    if (st.phase !== 'setup') err('bukan fase setup');
    var s = side(st, sid);
    if (!s.active) err('harus ada Active');
    s.setupDone = true;
    if (st.sides.P.setupDone && st.sides.O.setupDone) {
      st.first = st.rng() < 0.5 ? 'P' : 'O';
      st.phase = 'main';
      pushLog(st, (st.first === 'P' ? 'Kamu' : 'AI') + ' jalan duluan (lempar koin).');
      beginTurn(st, st.first);
    }
  }

  // ---- Turn loop ----
  function beginTurn(st, sid) {
    st.globalTurn++;
    st.current = sid;
    var s = side(st, sid);
    s.turnsTaken++;
    s.supporterPlayed = false;
    s.retreated = false;
    if (s.deck.length > 0) s.hand.push(s.deck.shift());
    // Energy Zone: 1 energy of the deck's type per turn — except the very
    // first turn of the match for the side that goes first.
    s.energyAvail = st.globalTurn !== 1;
  }

  function requireMain(st, sid) {
    if (st.phase !== 'main') err('aksi tidak tersedia di fase ini');
    if (st.current !== sid) err('bukan giliranmu');
  }

  function attachEnergy(st, sid, loc) {
    requireMain(st, sid);
    var s = side(st, sid);
    if (!s.energyAvail) err('energi zone sudah dipakai / belum tersedia');
    var inst = instAt(s, loc);
    if (!inst) err('target tidak ada');
    inst.energy.push(s.type);
    s.energyAvail = false;
    pushLog(st, sideName(sid) + ' pasang energi ke ' + inst.card.name + '.');
  }

  function playBasic(st, sid, handIdx) {
    requireMain(st, sid);
    var s = side(st, sid);
    var h = s.hand[handIdx];
    if (!h || h.card.kind !== 'creature' || h.card.stage !== 0) err('bukan kartu Basic');
    if (s.bench.length >= BENCH_MAX) err('bench penuh');
    s.hand.splice(handIdx, 1);
    s.bench.push(mkInstFromCard(h.card, st.globalTurn));
    pushLog(st, sideName(sid) + ' menurunkan ' + h.card.name + ' ke bench.');
  }

  function canEvolveOnto(st, sid, card, inst) {
    var s = side(st, sid);
    return card.kind === 'creature' && card.stage === 1 &&
      inst && inst.card.id === card.evolvesFrom &&
      s.turnsTaken > 1 &&                      // nobody evolves on their first turn
      inst.enteredTurn < st.globalTurn;        // not on the turn it entered play
  }

  function evolve(st, sid, handIdx, loc) {
    requireMain(st, sid);
    var s = side(st, sid);
    var h = s.hand[handIdx];
    var inst = instAt(s, loc);
    if (!h || !canEvolveOnto(st, sid, h.card, inst)) err('evolusi tidak sah');
    s.hand.splice(handIdx, 1);
    inst.stack.push(h.card);
    inst.card = h.card;             // keeps dmg + energy
    inst.enteredTurn = st.globalTurn;
    inst.shieldUntil = -1;
    pushLog(st, sideName(sid) + ': evolusi menjadi ' + h.card.name + '!');
  }

  function heal(inst, n) { inst.dmg = Math.max(0, inst.dmg - n); }

  function drawN(st, s, n) {
    for (var i = 0; i < n && s.deck.length > 0; i++) s.hand.push(s.deck.shift());
  }

  function playTrainer(st, sid, handIdx, targetLoc) {
    requireMain(st, sid);
    var s = side(st, sid);
    var h = s.hand[handIdx];
    if (!h || h.card.type !== 'T') err('bukan kartu Trainer');
    if (h.card.kind === 'supporter' && s.supporterPlayed) err('hanya 1 Supporter per giliran');
    var fx = h.card.fx, inst;
    if (fx === 'heal50' || fx === 'heal20') {
      inst = instAt(s, targetLoc);
      if (!inst) err('pilih target untuk dipulihkan');
    }
    if (fx === 'switch') {
      if (targetLoc == null || targetLoc.zone !== 'bench' || !s.bench[targetLoc.idx]) err('pilih kartu bench untuk ditukar');
    }
    s.hand.splice(handIdx, 1);
    s.discard.push(h);
    if (h.card.kind === 'supporter') s.supporterPlayed = true;
    if (fx === 'draw2') drawN(st, s, 2);
    else if (fx === 'draw1') drawN(st, s, 1);
    else if (fx === 'heal50') heal(inst, 50);
    else if (fx === 'heal20') heal(inst, 20);
    else if (fx === 'switch') {
      var b = s.bench[targetLoc.idx];
      s.bench[targetLoc.idx] = s.active;
      s.active = b;
    }
    pushLog(st, sideName(sid) + ' memakai ' + h.card.name + '.');
  }

  function retreat(st, sid, benchIdx) {
    requireMain(st, sid);
    var s = side(st, sid);
    if (s.retreated) err('sudah mundur giliran ini');
    if (!s.active) err('tidak ada Active');
    if (!s.bench[benchIdx]) err('target bench tidak ada');
    var cost = s.active.card.retreat;
    if (s.active.energy.length < cost) err('energi kurang untuk mundur (butuh ' + cost + ')');
    for (var i = 0; i < cost; i++) s.active.energy.pop();
    var b = s.bench[benchIdx];
    s.bench[benchIdx] = s.active;
    s.active = b;
    s.retreated = true;
    pushLog(st, sideName(sid) + ' mundur: ' + b.card.name + ' maju.');
  }

  function countType(arr, t) {
    var n = 0; for (var i = 0; i < arr.length; i++) if (arr[i] === t) n++; return n;
  }
  function canAfford(inst, cost) {
    if (inst.energy.length < cost.length) return false;
    var typed = cost.filter(function (c) { return c !== 'C'; });
    if (!typed.length) return true;
    return countType(inst.energy, typed[0]) >= typed.length;
  }

  function weaknessBonus(attCard, defCard) {
    // Rimba and Sakti are weak to each other: +20 when hitting weakness.
    if (attCard.type === 'R' && defCard.type === 'S') return 20;
    if (attCard.type === 'S' && defCard.type === 'R') return 20;
    return 0;
  }

  function applyDamage(st, defInst, amount) {
    if (defInst.shieldUntil >= st.globalTurn) amount = Math.max(0, amount - 10);
    defInst.dmg += amount;
    return amount;
  }

  function isKO(inst) { return inst.dmg >= inst.card.hp; }

  function scoreKO(st, scorerSid, koInst) {
    var pts = koInst.card.rarity === 'L' ? 2 : 1;
    side(st, scorerSid).points += pts;
    pushLog(st, koInst.card.name + ' KO! ' + sideName(scorerSid) + ' +' + pts + ' poin.');
  }

  function discardInst(s, inst) {
    inst.stack.forEach(function (c) { s.discard.push({ uid: ++uidSeq, card: c }); });
  }

  function checkWinner(st) {
    ['P', 'O'].forEach(function (sid) {
      if (st.winner) return;
      if (side(st, sid).points >= WIN_POINTS) st.winner = sid;
    });
    ['P', 'O'].forEach(function (sid) {
      if (st.winner) return;
      var s = side(st, sid);
      if (!s.active && s.bench.length === 0) st.winner = foe(sid);
    });
    if (st.winner) { st.phase = 'over'; st.pendingPromote = null; }
  }

  function attack(st, sid, atkIdx, targetLoc) {
    requireMain(st, sid);
    var s = side(st, sid), o = side(st, foe(sid));
    if (!s.active) err('tidak ada Active');
    var atk = s.active.card.attacks[atkIdx];
    if (!atk) err('serangan tidak ada');
    if (!canAfford(s.active, atk.cost)) err('energi tidak cukup');

    pushLog(st, sideName(sid) + ': ' + s.active.card.name + ' memakai ' + atk.name + '!');

    var koList = []; // [{sid of owner, inst, wasActive}]

    if (atk.fx === 'snipe') {
      var t = (targetLoc && targetLoc.zone === 'bench') ? o.bench[targetLoc.idx] : null;
      if (!t) err('Patuk Jauh butuh target di bench lawan');
      applyDamage(st, t, atk.dmg); // no weakness on bench hits
      if (isKO(t)) koList.push({ owner: foe(sid), inst: t, loc: targetLoc });
    } else if (atk.fx === 'healAny20') {
      var mine = instAt(s, targetLoc) || s.active;
      heal(mine, 20);
      pushLog(st, 'Pulih 20: ' + mine.card.name + '.');
    } else {
      if (!o.active) err('lawan tidak punya Active');
      var amount = atk.dmg;
      if (atk.fx === 'coin20' || atk.fx === 'coin10') {
        var heads = st.rng() < 0.5;
        pushLog(st, 'Koin: ' + (heads ? 'GAMBAR' : 'ANGKA') + '.');
        if (heads) amount += (atk.fx === 'coin20' ? 20 : 10);
      }
      amount += weaknessBonus(s.active.card, o.active.card);
      var dealt = applyDamage(st, o.active, amount);
      pushLog(st, o.active.card.name + ' kena ' + dealt + ' damage.');
      if (atk.fx === 'healSelf10') heal(s.active, 10);
      if (atk.fx === 'shield10') s.active.shieldUntil = st.globalTurn + 1;
      if (atk.fx === 'discardS') {
        var si = s.active.energy.indexOf('S');
        if (si >= 0) s.active.energy.splice(si, 1);
      }
      if (isKO(o.active)) koList.push({ owner: foe(sid), inst: o.active, loc: { zone: 'active', idx: 0 } });
    }

    // Resolve KOs: discard, score, then promotion / win.
    var needsPromote = false;
    koList.forEach(function (ko) {
      var os = side(st, ko.owner);
      if (ko.loc.zone === 'active') { os.active = null; needsPromote = true; }
      else os.bench.splice(ko.loc.idx, 1);
      discardInst(os, ko.inst);
      scoreKO(st, sid, ko.inst);
    });

    checkWinner(st);
    if (st.winner) return;

    if (needsPromote && side(st, foe(sid)).bench.length > 0) {
      st.phase = 'promote';
      st.pendingPromote = foe(sid);
      st.promoteThenEnd = true;
      return;
    }
    endTurn(st, sid);
  }

  function promote(st, sid, benchIdx) {
    if (st.phase !== 'promote' || st.pendingPromote !== sid) err('tidak perlu promosi');
    var s = side(st, sid);
    if (!s.bench[benchIdx]) err('target bench tidak ada');
    s.active = s.bench.splice(benchIdx, 1)[0];
    pushLog(st, sideName(sid) + ' memajukan ' + s.active.card.name + '.');
    st.phase = 'main';
    st.pendingPromote = null;
    if (st.promoteThenEnd) {
      st.promoteThenEnd = false;
      endTurn(st, foe(sid));
    }
  }

  function endTurn(st, sid) {
    if (st.phase !== 'main' || st.current !== sid) err('tidak bisa mengakhiri giliran');
    var s = side(st, sid);
    s.energyAvail = false; // unattached zone energy is lost
    checkWinner(st);
    if (st.winner) return;
    beginTurn(st, foe(sid));
  }

  function sideName(sid) { return sid === 'P' ? 'Kamu' : 'AI'; }

  // =====================================================================
  // Packs + economy (pure)
  // =====================================================================

  function rollRarity(weights, rng) {
    var total = 0, k;
    for (k in weights) total += weights[k];
    var r = rng() * total;
    for (k in weights) { r -= weights[k]; if (r < 0) return k; }
    return 'C';
  }

  var BY_RARITY = { C: [], U: [], R: [], L: [] };
  CARDS.forEach(function (c) { BY_RARITY[c.rarity].push(c); });

  function rollPack(rng) {
    rng = rng || Math.random;
    var out = [];
    for (var i = 0; i < PACK.size; i++) {
      var rar = rollRarity(PACK.weights, rng);
      // Pity: the last slot guarantees the pack holds at least one U-or-better.
      if (i === PACK.size - 1) {
        var hasGood = out.some(function (c) { return c.rarity !== 'C'; });
        if (!hasGood) rar = rollRarity(PACK.pityWeights, rng);
      }
      var pool = BY_RARITY[rar];
      out.push(pool[Math.floor(rng() * pool.length)]);
    }
    return out;
  }

  function freshStore() {
    return { coll: {}, credits: 0, freeDate: '', freeUsed: 0 };
  }

  function packsAvailable(store, today) {
    var free = store.freeDate === today ? Math.max(0, PACK.freePerDay - store.freeUsed) : PACK.freePerDay;
    return free + store.credits;
  }

  function consumePack(store, today) {
    if (store.freeDate !== today) { store.freeDate = today; store.freeUsed = 0; }
    if (store.freeUsed < PACK.freePerDay) { store.freeUsed++; return true; }
    if (store.credits > 0) { store.credits--; return true; }
    return false;
  }

  function creditPack(store) {
    store.credits = Math.min(PACK.creditCap, store.credits + 1);
  }

  function addToCollection(store, cards) {
    cards.forEach(function (c) { store.coll[c.id] = (store.coll[c.id] || 0) + 1; });
  }

  var ENGINE = {
    newMatch: newMatch, setupActive: setupActive, setupBench: setupBench, setupDone: setupDone,
    attachEnergy: attachEnergy, playBasic: playBasic, evolve: evolve, canEvolveOnto: canEvolveOnto,
    playTrainer: playTrainer, retreat: retreat, attack: attack, promote: promote, endTurn: endTurn,
    canAfford: canAfford, weaknessBonus: weaknessBonus, creatures: creatures, instAt: instAt, foe: foe,
    rollPack: rollPack, freshStore: freshStore, packsAvailable: packsAvailable,
    consumePack: consumePack, creditPack: creditPack, addToCollection: addToCollection,
    BENCH_MAX: BENCH_MAX, WIN_POINTS: WIN_POINTS,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ENGINE;
    return; // headless: no shell
  }
  if (typeof window === 'undefined') return;

  // =====================================================================
  // Browser shell
  // =====================================================================

  var LSKEY = 'nusa_v1';
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, reducedMotion ? Math.min(ms, 120) : ms); }); }

  var store = null;
  function loadStore() {
    try {
      var raw = JSON.parse(localStorage.getItem(LSKEY));
      if (raw && raw.coll) return raw;
    } catch (e) { /* fall through */ }
    return freshStore();
  }
  function saveStore() {
    try { localStorage.setItem(LSKEY, JSON.stringify(store)); } catch (e) { /* private mode */ }
  }

  // ---- Card DOM component ----
  function pipEl(letter) {
    var p = document.createElement('span');
    p.className = 'nt-pip nt-pip-' + letter.toLowerCase();
    p.title = letter === 'C' ? 'Energi apa saja' : (letter === 'R' ? 'Rimba' : 'Sakti');
    return p;
  }

  function cardEl(card, opts) {
    opts = opts || {};
    var el = document.createElement('div');
    el.className = 'nt-card nt-type-' + card.type.toLowerCase() +
      (card.rarity === 'L' ? ' nt-legend' : '') +
      (opts.small ? ' nt-small' : '') +
      (opts.silhouette ? ' nt-silhouette' : '');
    var head = document.createElement('div');
    head.className = 'nt-card-head';
    var nm = document.createElement('span');
    nm.className = 'nt-card-name';
    nm.textContent = card.name + (card.rarity === 'L' ? ' ★' : '');
    head.appendChild(nm);
    if (card.kind === 'creature') {
      var hp = document.createElement('span');
      hp.className = 'nt-card-hp';
      hp.textContent = 'HP' + card.hp;
      head.appendChild(hp);
    } else {
      var kd = document.createElement('span');
      kd.className = 'nt-card-kind';
      kd.textContent = card.kind === 'supporter' ? 'SUPPORTER' : 'ITEM';
      head.appendChild(kd);
    }
    el.appendChild(head);

    var art = document.createElement('div');
    art.className = 'nt-card-art';
    art.textContent = card.emoji;
    el.appendChild(art);

    var body = document.createElement('div');
    body.className = 'nt-card-body';
    if (card.kind === 'creature') {
      if (card.stage === 1) {
        var ev = document.createElement('div');
        ev.className = 'nt-card-evline';
        ev.textContent = 'Stage 1 ← ' + BY_ID[card.evolvesFrom].name;
        body.appendChild(ev);
      }
      card.attacks.forEach(function (a) {
        var row = document.createElement('div');
        row.className = 'nt-atk-row';
        var costs = document.createElement('span');
        costs.className = 'nt-atk-cost';
        a.cost.forEach(function (c) { costs.appendChild(pipEl(c)); });
        row.appendChild(costs);
        var an = document.createElement('span');
        an.className = 'nt-atk-name';
        an.textContent = a.name;
        row.appendChild(an);
        var ad = document.createElement('span');
        ad.className = 'nt-atk-dmg';
        ad.textContent = a.dmg ? String(a.dmg) : '';
        row.appendChild(ad);
        body.appendChild(row);
        if (a.text && !opts.small) {
          var tx = document.createElement('div');
          tx.className = 'nt-atk-text';
          tx.textContent = a.text;
          body.appendChild(tx);
        }
      });
    } else if (!opts.small) {
      var tt = document.createElement('div');
      tt.className = 'nt-atk-text';
      tt.textContent = card.text;
      body.appendChild(tt);
    }
    el.appendChild(body);

    var foot = document.createElement('div');
    foot.className = 'nt-card-foot';
    var left = document.createElement('span');
    left.className = 'nt-card-retreat';
    if (card.kind === 'creature') {
      left.appendChild(document.createTextNode('Mundur '));
      for (var i = 0; i < card.retreat; i++) left.appendChild(pipEl('C'));
      if (card.retreat === 0) left.appendChild(document.createTextNode('0'));
    }
    foot.appendChild(left);
    var gem = document.createElement('span');
    gem.className = 'nt-gem nt-gem-' + card.rarity.toLowerCase();
    gem.textContent = card.rarity;
    foot.appendChild(gem);
    el.appendChild(foot);

    if (card.rarity === 'L' && !opts.silhouette) {
      var badge = document.createElement('div');
      badge.className = 'nt-legend-badge';
      badge.textContent = 'LEGENDA · KO = 2 POIN';
      el.appendChild(badge);
    }
    if (opts.count != null) {
      var cnt = document.createElement('div');
      cnt.className = 'nt-count-badge';
      cnt.textContent = '×' + opts.count;
      el.appendChild(cnt);
    }
    return el;
  }

  // Small board chip: name, emoji, HP bar, energy pips, damage.
  function boardChip(inst, opts) {
    opts = opts || {};
    var card = inst.card;
    var el = document.createElement('div');
    el.className = 'nt-chip nt-type-' + card.type.toLowerCase() + (card.rarity === 'L' ? ' nt-legend' : '');
    var em = document.createElement('div');
    em.className = 'nt-chip-art';
    em.textContent = card.emoji;
    el.appendChild(em);
    var nm = document.createElement('div');
    nm.className = 'nt-chip-name';
    nm.textContent = card.name;
    el.appendChild(nm);
    var hpLeft = Math.max(0, card.hp - inst.dmg);
    var bar = document.createElement('div');
    bar.className = 'nt-chip-hpbar';
    var fill = document.createElement('div');
    fill.className = 'nt-chip-hpfill' + (hpLeft / card.hp <= 0.34 ? ' low' : '');
    fill.style.width = Math.round(hpLeft / card.hp * 100) + '%';
    bar.appendChild(fill);
    el.appendChild(bar);
    var hp = document.createElement('div');
    hp.className = 'nt-chip-hp';
    hp.textContent = hpLeft + '/' + card.hp;
    el.appendChild(hp);
    var en = document.createElement('div');
    en.className = 'nt-chip-energy';
    inst.energy.forEach(function (t) { en.appendChild(pipEl(t)); });
    el.appendChild(en);
    if (inst.shieldUntil >= (match ? match.globalTurn : 0)) {
      var sh = document.createElement('div');
      sh.className = 'nt-chip-shield';
      sh.textContent = '⛨ -10';
      el.appendChild(sh);
    }
    return el;
  }

  // ---- Views ----
  var VIEWS = ['home', 'deckpick', 'match', 'pack', 'binder', 'rules'];
  function showView(name) {
    VIEWS.forEach(function (v) {
      $('#nt-view-' + v).classList.toggle('is-hidden', v !== name);
    });
    if (name === 'home') renderHome();
    if (name === 'binder') renderBinder();
  }

  function renderHome() {
    $('#nt-pack-count').textContent = 'Buka Pack (' + packsAvailable(store, todayStr()) + ' tersedia)';
  }

  // ---- Match state + rendering ----
  var match = null;
  var uiMode = null; // {type:'attach'|'retreat'|'healTarget'|'switch'|'snipe'|'evolve'|'promote', handIdx, atkIdx}
  var aiBusy = false;

  function startMatch(playerType) {
    match = newMatch(playerType);
    uiMode = null;
    aiBusy = false;
    // AI setup: best basic (highest HP, prefer evolvable) as active, bench the rest.
    aiSetup();
    showView('match');
    renderMatch();
    toast('Pilih kartu Basic dari tanganmu sebagai Active.');
  }

  function aiSetup() {
    var o = match.sides.O;
    var basics = [];
    o.hand.forEach(function (h, i) {
      if (h.card.kind === 'creature' && h.card.stage === 0) basics.push(i);
    });
    basics.sort(function (a, b) {
      return score(b) - score(a);
      function score(i) {
        var c = o.hand[i].card;
        var evolvable = CARDS.some(function (x) { return x.evolvesFrom === c.id; }) ? 25 : 0;
        return c.hp + evolvable;
      }
    });
    setupActive(match, 'O', basics[0]);
    // Bench remaining basics (indices shift after each removal).
    for (var guard = 0; guard < 5; guard++) {
      var idx = -1;
      o.hand.some(function (h, i) {
        if (h.card.kind === 'creature' && h.card.stage === 0 && o.bench.length < BENCH_MAX) { idx = i; return true; }
        return false;
      });
      if (idx < 0) break;
      setupBench(match, 'O', idx);
    }
    setupDone(match, 'O');
  }

  function isPlayerTurn() {
    return match && match.phase === 'main' && match.current === 'P' && !aiBusy;
  }

  function renderMatch() {
    if (!match) return;
    var P = match.sides.P, O = match.sides.O;

    $('#nt-opp-points').textContent = O.points;
    $('#nt-my-points').textContent = P.points;
    $('#nt-opp-hand').textContent = O.hand.length;
    $('#nt-opp-deck').textContent = O.deck.length;
    $('#nt-my-deck').textContent = P.deck.length;

    // Opponent board
    renderSlot($('#nt-opp-active'), O.active, 'O', { zone: 'active', idx: 0 });
    renderBenchRow($('#nt-opp-bench'), O, 'O');
    // Player board
    renderSlot($('#nt-my-active'), P.active, 'P', { zone: 'active', idx: 0 });
    renderBenchRow($('#nt-my-bench'), P, 'P');

    // Energy chip
    var chip = $('#nt-energy-chip');
    chip.classList.toggle('avail', !!P.energyAvail && isPlayerTurn());
    chip.querySelector('.nt-energy-letter').textContent = P.type;
    chip.classList.toggle('is-hidden', match.phase === 'setup');

    // Hand
    var handEl = $('#nt-hand');
    handEl.innerHTML = '';
    P.hand.forEach(function (h, i) {
      var c = cardEl(h.card, { small: true });
      c.classList.add('nt-hand-card');
      c.addEventListener('click', function () { onHandTap(i); });
      handEl.appendChild(c);
    });

    // Banner
    var banner = $('#nt-banner');
    if (match.phase === 'setup') banner.textContent = 'SETUP — pilih Active (lalu bench), tekan Mulai';
    else if (match.phase === 'over') banner.textContent = match.winner === 'P' ? 'KAMU MENANG!' : 'AI MENANG';
    else if (match.phase === 'promote') banner.textContent = match.pendingPromote === 'P' ? 'Pilih kartu bench untuk maju!' : 'AI memilih...';
    else if (uiMode) banner.textContent = uiModeLabel();
    else banner.textContent = match.current === 'P' ? 'GILIRANMU' : 'GILIRAN AI...';

    // Log line
    $('#nt-log').textContent = match.log.length ? match.log[match.log.length - 1] : '';

    // Action bar
    $('#nt-setup-done').classList.toggle('is-hidden', !(match.phase === 'setup' && match.sides.P.active));
    $('#nt-end-turn').classList.toggle('is-hidden', !isPlayerTurn());
    $('#nt-cancel-mode').classList.toggle('is-hidden', !uiMode);

    // Match end overlay
    var over = $('#nt-match-end');
    if (match.phase === 'over') {
      over.classList.remove('is-hidden');
      $('#nt-end-title').textContent = match.winner === 'P' ? 'KAMU MENANG!' : 'AI MENANG';
      $('#nt-end-pts').textContent = 'Poin: Kamu ' + P.points + ' — AI ' + O.points;
      $('#nt-end-pack').textContent = match.winner === 'P' ? '+1 pack dikreditkan! \u{1F381}' : '';
    } else {
      over.classList.add('is-hidden');
    }
  }

  function uiModeLabel() {
    switch (uiMode.type) {
      case 'attach': return 'Pilih kartumu untuk dipasangi energi';
      case 'retreat': return 'Pilih kartu bench untuk maju (mundur)';
      case 'healTarget': return 'Pilih kartumu yang dipulihkan';
      case 'switch': return 'Pilih kartu bench untuk ditukar';
      case 'snipe': return 'Pilih target di bench lawan';
      case 'evolve': return 'Pilih kartu yang dievolusi';
      default: return '';
    }
  }

  function renderSlot(el, inst, sid, loc) {
    el.innerHTML = '';
    el.classList.remove('targetable');
    if (!inst) {
      el.classList.add('empty');
      return;
    }
    el.classList.remove('empty');
    var chipNode = boardChip(inst);
    el.appendChild(chipNode);
    var targetable = isTargetable(sid, loc);
    if (targetable) el.classList.add('targetable');
    el.onclick = function () { onBoardTap(sid, loc); };
  }

  function renderBenchRow(rowEl, s, sid) {
    rowEl.innerHTML = '';
    for (var i = 0; i < BENCH_MAX; i++) {
      var slot = document.createElement('div');
      slot.className = 'nt-slot nt-slot-bench';
      var inst = s.bench[i];
      if (inst) {
        slot.appendChild(boardChip(inst));
        if (isTargetable(sid, { zone: 'bench', idx: i })) slot.classList.add('targetable');
        (function (idx) {
          slot.onclick = function () { onBoardTap(sid, { zone: 'bench', idx: idx }); };
        })(i);
      } else {
        slot.classList.add('empty');
      }
      rowEl.appendChild(slot);
    }
  }

  function isTargetable(sid, loc) {
    if (!uiMode) return false;
    var mine = sid === 'P';
    switch (uiMode.type) {
      case 'attach': case 'healTarget': return mine;
      case 'evolve': {
        if (!mine) return false;
        var h = match.sides.P.hand[uiMode.handIdx];
        var inst = instAt(match.sides.P, loc);
        return !!(h && inst && canEvolveOnto(match, 'P', h.card, inst));
      }
      case 'retreat': case 'switch': case 'promote': return mine && loc.zone === 'bench';
      case 'snipe': return !mine && loc.zone === 'bench';
      default: return false;
    }
  }

  function toast(msg) {
    var t = $('#nt-toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._tm);
    toast._tm = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  function tryAction(fn) {
    try { fn(); return true; }
    catch (e) { toast(String(e.message || e).replace('[nusa] ', '')); return false; }
  }

  // ---- Player interactions ----
  function onHandTap(i) {
    var P = match.sides.P;
    var h = P.hand[i];
    if (!h) return;
    if (match.phase === 'setup') {
      // Tap basics to place: first becomes Active, rest bench.
      if (h.card.kind !== 'creature' || h.card.stage !== 0) { toast('Saat setup, hanya kartu Basic.'); return; }
      if (!P.active) tryAction(function () { setupActive(match, 'P', i); });
      else if (P.bench.length < BENCH_MAX) tryAction(function () { setupBench(match, 'P', i); });
      else toast('Bench penuh.');
      renderMatch();
      return;
    }
    openZoom(h.card, handActions(i));
  }

  function handActions(i) {
    var P = match.sides.P;
    var h = P.hand[i];
    var acts = [];
    if (!isPlayerTurn()) return acts;
    var card = h.card;
    if (card.kind === 'creature' && card.stage === 0) {
      acts.push({
        label: 'Turunkan ke Bench',
        disabled: P.bench.length >= BENCH_MAX ? 'Bench penuh' : null,
        run: function () { tryAction(function () { playBasic(match, 'P', i); }); },
      });
    }
    if (card.kind === 'creature' && card.stage === 1) {
      var anyTarget = creatures(P).some(function (c) { return canEvolveOnto(match, 'P', card, c.inst); });
      acts.push({
        label: 'Evolusi',
        disabled: anyTarget ? null : 'Tidak ada target yang sah (cek waktu evolusi)',
        run: function () { uiMode = { type: 'evolve', handIdx: i }; },
      });
    }
    if (card.type === 'T') {
      var disabled = null;
      if (card.kind === 'supporter' && P.supporterPlayed) disabled = 'Sudah pakai Supporter giliran ini';
      if (card.fx === 'switch' && P.bench.length === 0) disabled = 'Bench kosong';
      if ((card.fx === 'heal20' || card.fx === 'heal50') && !creatures(P).some(function (c) { return c.inst.dmg > 0; })) disabled = 'Tidak ada yang terluka';
      acts.push({
        label: 'Pakai',
        disabled: disabled,
        run: function () {
          if (card.fx === 'heal20' || card.fx === 'heal50') uiMode = { type: 'healTarget', handIdx: i };
          else if (card.fx === 'switch') uiMode = { type: 'switch', handIdx: i };
          else tryAction(function () { playTrainer(match, 'P', i); });
        },
      });
    }
    return acts;
  }

  function onBoardTap(sid, loc) {
    var P = match.sides.P;
    if (match.phase === 'promote' && match.pendingPromote === 'P' && sid === 'P' && loc.zone === 'bench') {
      tryAction(function () { promote(match, 'P', loc.idx); });
      renderMatch();
      maybeRunAI();
      return;
    }
    if (uiMode && isTargetable(sid, loc)) {
      var mode = uiMode;
      uiMode = null;
      switch (mode.type) {
        case 'attach': tryAction(function () { attachEnergy(match, 'P', loc); }); break;
        case 'evolve': tryAction(function () { evolve(match, 'P', mode.handIdx, loc); }); break;
        case 'healTarget': case 'switch': tryAction(function () { playTrainer(match, 'P', mode.handIdx, loc); }); break;
        case 'retreat': tryAction(function () { retreat(match, 'P', loc.idx); }); break;
        case 'snipe':
          tryAction(function () { attack(match, 'P', mode.atkIdx, loc); });
          renderMatch();
          maybeRunAI();
          return;
      }
      renderMatch();
      return;
    }
    // No mode: zoom the card with contextual actions.
    var s = match.sides[sid];
    var inst = instAt(s, loc);
    if (!inst) return;
    openZoom(inst.card, boardActions(sid, loc, inst), inst);
  }

  function boardActions(sid, loc, inst) {
    var acts = [];
    if (sid !== 'P' || !isPlayerTurn()) return acts;
    var P = match.sides.P;
    if (P.energyAvail) {
      acts.push({
        label: 'Pasang Energi (' + P.type + ') ke kartu ini',
        disabled: null,
        run: function () { tryAction(function () { attachEnergy(match, 'P', loc); }); },
      });
    }
    if (loc.zone === 'active') {
      inst.card.attacks.forEach(function (a, ai) {
        var afford = canAfford(inst, a.cost);
        var disabled = null;
        if (!afford) disabled = 'Energi kurang';
        if (a.fx === 'snipe' && match.sides.O.bench.length === 0) disabled = 'Tidak ada target di bench lawan';
        var dmgNote = '';
        if (a.dmg && a.fx !== 'snipe' && match.sides.O.active) {
          var w = weaknessBonus(inst.card, match.sides.O.active.card);
          dmgNote = ' — ' + (a.dmg + w) + ' dmg' + (w ? ' (lemah +20)' : '');
        } else if (a.fx === 'snipe') {
          dmgNote = ' — ' + a.dmg + ' ke bench';
        }
        acts.push({
          label: 'Serang: ' + a.name + dmgNote,
          disabled: disabled,
          run: function () {
            if (a.fx === 'snipe') { uiMode = { type: 'snipe', atkIdx: ai }; return; }
            if (a.fx === 'healAny20') { tryAction(function () { attack(match, 'P', ai, { zone: 'active', idx: 0 }); }); afterPlayerAttack(); return; }
            tryAction(function () { attack(match, 'P', ai); });
            afterPlayerAttack();
          },
        });
      });
      var cost = inst.card.retreat;
      acts.push({
        label: 'Mundur (buang ' + cost + ' energi)',
        disabled: P.retreated ? 'Sudah mundur giliran ini'
          : P.bench.length === 0 ? 'Bench kosong'
          : inst.energy.length < cost ? 'Energi kurang' : null,
        run: function () { uiMode = { type: 'retreat' }; },
      });
    }
    return acts;
  }

  function afterPlayerAttack() {
    renderMatch();
    maybeRunAI();
  }

  // ---- Zoom overlay ----
  function openZoom(card, actions, inst) {
    var ov = $('#nt-zoom');
    var slot = $('#nt-zoom-card');
    slot.innerHTML = '';
    slot.appendChild(cardEl(card));
    if (inst && inst.dmg > 0) {
      var d = document.createElement('div');
      d.className = 'nt-zoom-dmg';
      d.textContent = 'Damage: ' + inst.dmg + ' · Sisa HP: ' + Math.max(0, card.hp - inst.dmg);
      slot.appendChild(d);
    }
    var btns = $('#nt-zoom-actions');
    btns.innerHTML = '';
    (actions || []).forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'nt-btn nt-btn-block';
      b.textContent = a.label + (a.disabled ? ' — ' + a.disabled : '');
      b.disabled = !!a.disabled;
      b.addEventListener('click', function () {
        closeZoom();
        a.run();
        renderMatch();
      });
      btns.appendChild(b);
    });
    ov.classList.remove('is-hidden');
  }
  function closeZoom() { $('#nt-zoom').classList.add('is-hidden'); }

  // ---- AI driver ----
  function maybeRunAI() {
    if (!match || match.winner) { onMatchMaybeOver(); return; }
    if (match.phase === 'promote' && match.pendingPromote === 'O') {
      aiPromote();
      renderMatch();
      if (!match.winner && match.phase === 'main' && match.current === 'O') runAITurn();
      else onMatchMaybeOver();
      return;
    }
    if (match.phase === 'main' && match.current === 'O') runAITurn();
    else onMatchMaybeOver();
  }

  function aiPromote() {
    var o = match.sides.O;
    var best = 0, bestScore = -1;
    o.bench.forEach(function (b, i) {
      var s = (b.card.hp - b.dmg) + b.energy.length * 15;
      if (s > bestScore) { bestScore = s; best = i; }
    });
    promote(match, 'O', best);
  }

  async function runAITurn() {
    if (aiBusy) return;
    aiBusy = true;
    renderMatch();
    var o = match.sides.O, p = match.sides.P;
    try {
      await sleep(700);

      // 1) Attach energy to the creature that best progresses an attack.
      if (o.energyAvail && match.phase === 'main' && match.current === 'O') {
        var target = pickEnergyTarget(o);
        attachEnergy(match, 'O', target);
        renderMatch();
        await sleep(600);
      }

      // 2) Bench basics while there's room.
      var benched = true;
      while (benched && o.bench.length < BENCH_MAX) {
        benched = false;
        for (var i = 0; i < o.hand.length; i++) {
          var h = o.hand[i];
          if (h.card.kind === 'creature' && h.card.stage === 0) {
            playBasic(match, 'O', i);
            benched = true;
            renderMatch();
            await sleep(450);
            break;
          }
        }
      }

      // 3) Evolve whenever legal.
      var evolved = true;
      while (evolved) {
        evolved = false;
        outer:
        for (var hi = 0; hi < o.hand.length; hi++) {
          var hc = o.hand[hi];
          if (hc.card.kind !== 'creature' || hc.card.stage !== 1) continue;
          var crs = creatures(o);
          for (var ci = 0; ci < crs.length; ci++) {
            if (canEvolveOnto(match, 'O', hc.card, crs[ci].inst)) {
              evolve(match, 'O', hi, crs[ci].loc);
              evolved = true;
              renderMatch();
              await sleep(600);
              break outer;
            }
          }
        }
      }

      // 4) Items.
      await aiPlayItems(o);

      // 5) One supporter if useful.
      await aiPlaySupporter(o);

      // 6) Retreat if active is doomed and a bench creature is better.
      await aiMaybeRetreat(o, p);

      // 7) Attack (best affordable; prefer lethal) or end turn.
      if (match.phase === 'main' && match.current === 'O') {
        var plan = aiBestAttack(o, p);
        if (plan) {
          attack(match, 'O', plan.atkIdx, plan.target);
          renderMatch();
          await sleep(600);
        } else {
          endTurn(match, 'O');
        }
      }
    } catch (e) {
      // An engine rejection here is a bug; surface it loudly rather than hang.
      console.error('AI illegal move bug:', e);
      if (match.phase === 'main' && match.current === 'O') {
        try { endTurn(match, 'O'); } catch (e2) { /* give up the turn */ }
      }
    }
    aiBusy = false;
    renderMatch();
    if (match.phase === 'promote' && match.pendingPromote === 'P') {
      toast('Kartumu KO — pilih kartu bench untuk maju.');
    }
    onMatchMaybeOver();
  }

  function pickEnergyTarget(o) {
    // Prefer the active if energy progresses (or completes) one of its attacks;
    // otherwise the bench creature closest to affording an attack.
    var best = { zone: 'active', idx: 0 }, bestScore = -99;
    creatures(o).forEach(function (c) {
      var inst = c.inst;
      var sc = -99;
      inst.card.attacks.forEach(function (a) {
        var deficit = a.cost.length - inst.energy.length;
        var s;
        if (deficit <= 0) s = 1;            // already affordable: low value
        else if (deficit === 1) s = 10;     // one away: attaching completes it
        else s = 6 - deficit;               // farther away: less value
        if (c.loc.zone === 'active') s += 3;
        if (s > sc) sc = s;
      });
      sc += match.rng ? 0 : 0;
      sc += Math.random() * 0.5; // tiny tiebreak so it isn't robotic
      if (sc > bestScore) { bestScore = sc; best = c.loc; }
    });
    return best;
  }

  async function aiPlayItems(o) {
    for (var guard = 0; guard < 6; guard++) {
      if (match.phase !== 'main' || match.current !== 'O') return;
      var played = false;
      for (var i = 0; i < o.hand.length; i++) {
        var h = o.hand[i];
        if (h.card.type !== 'T' || h.card.kind !== 'item') continue;
        if (h.card.fx === 'heal20') {
          var hurt = creatures(o).filter(function (c) { return c.inst.dmg >= 20; })[0];
          if (hurt) { playTrainer(match, 'O', i, hurt.loc); played = true; break; }
        } else if (h.card.fx === 'draw1') {
          playTrainer(match, 'O', i); played = true; break;
        } else if (h.card.fx === 'switch') {
          var act = o.active;
          if (act && o.bench.length > 0 && (act.card.hp - act.dmg) <= 30) {
            var betterIdx = -1, betterHp = act.card.hp - act.dmg;
            o.bench.forEach(function (b, bi) {
              var hpLeft = b.card.hp - b.dmg;
              if (hpLeft > betterHp + 20) { betterHp = hpLeft; betterIdx = bi; }
            });
            if (betterIdx >= 0) { playTrainer(match, 'O', i, { zone: 'bench', idx: betterIdx }); played = true; break; }
          }
        }
      }
      if (!played) return;
      renderMatch();
      await sleep(500);
    }
  }

  async function aiPlaySupporter(o) {
    if (o.supporterPlayed || match.phase !== 'main' || match.current !== 'O') return;
    for (var i = 0; i < o.hand.length; i++) {
      var h = o.hand[i];
      if (h.card.kind !== 'supporter') continue;
      if (h.card.fx === 'draw2' && o.hand.length <= 3) {
        playTrainer(match, 'O', i);
        renderMatch();
        await sleep(500);
        return;
      }
      if (h.card.fx === 'heal50') {
        var hurt = creatures(o).filter(function (c) { return c.inst.dmg >= 50; })[0];
        if (hurt) {
          playTrainer(match, 'O', i, hurt.loc);
          renderMatch();
          await sleep(500);
          return;
        }
      }
    }
  }

  function playerBestVisibleDamage(p, o) {
    // What the player's active could hit the AI's active for next turn.
    if (!p.active || !o.active) return 0;
    var best = 0;
    p.active.card.attacks.forEach(function (a) {
      if (a.fx === 'snipe' || a.fx === 'healAny20') return;
      if (!canAfford(p.active, a.cost)) return;
      var d = a.dmg + weaknessBonus(p.active.card, o.active.card);
      if (d > best) best = d;
    });
    return best;
  }

  async function aiMaybeRetreat(o, p) {
    if (o.retreated || match.phase !== 'main' || match.current !== 'O' || !o.active || o.bench.length === 0) return;
    var threat = playerBestVisibleDamage(p, o);
    var hpLeft = o.active.card.hp - o.active.dmg;
    if (threat < hpLeft) return; // not doomed
    if (o.active.energy.length < o.active.card.retreat) return;
    // A bench creature must both survive the same threat and attack at least as soon.
    var bestIdx = -1;
    o.bench.forEach(function (b, i) {
      var bHp = b.card.hp - b.dmg;
      var survives = bHp > threat;
      var canHit = b.card.attacks.some(function (a) { return canAfford(b, a.cost); });
      if (survives && canHit && bestIdx < 0) bestIdx = i;
    });
    if (bestIdx >= 0) {
      retreat(match, 'O', bestIdx);
      renderMatch();
      await sleep(500);
    }
  }

  function aiBestAttack(o, p) {
    if (!o.active) return null;
    var plans = [];
    o.active.card.attacks.forEach(function (a, ai) {
      if (!canAfford(o.active, a.cost)) return;
      if (a.fx === 'snipe') {
        // Snipe only when it kills a bench target (per the design's AI spec).
        p.bench.forEach(function (b, bi) {
          if (b.dmg + a.dmg >= b.card.hp) {
            plans.push({ atkIdx: ai, target: { zone: 'bench', idx: bi }, dmg: a.dmg, lethal: true, pts: b.card.rarity === 'L' ? 2 : 1 });
          }
        });
        return;
      }
      if (a.fx === 'healAny20') {
        var hurt = creatures(o).filter(function (c) { return c.inst.dmg > 0; })[0];
        plans.push({ atkIdx: ai, target: hurt ? hurt.loc : { zone: 'active', idx: 0 }, dmg: 0, lethal: false, heal: true });
        return;
      }
      if (!p.active) return;
      var d = a.dmg + weaknessBonus(o.active.card, p.active.card);
      var lethal = p.active.dmg + Math.max(0, d - (p.active.shieldUntil >= match.globalTurn ? 10 : 0)) >= p.active.card.hp;
      plans.push({ atkIdx: ai, target: null, dmg: d, lethal: lethal, pts: lethal ? (p.active.card.rarity === 'L' ? 2 : 1) : 0 });
    });
    if (!plans.length) return null;
    plans.sort(function (x, y) {
      if (!!y.lethal !== !!x.lethal) return y.lethal ? 1 : -1;
      if ((y.pts || 0) !== (x.pts || 0)) return (y.pts || 0) - (x.pts || 0);
      if (y.dmg !== x.dmg) return y.dmg - x.dmg;
      return Math.random() - 0.5;
    });
    // Don't waste the heal-attack when something damaging exists.
    var damaging = plans.filter(function (pl) { return !pl.heal; });
    return damaging.length ? damaging[0] : plans[0];
  }

  function onMatchMaybeOver() {
    if (!match || !match.winner) return;
    if (match.winner === 'P' && !match._packCredited) {
      match._packCredited = true;
      creditPack(store);
      saveStore();
    }
    renderMatch();
  }

  // ---- Pack opening ----
  var packCards = null, packRevealed = 0;

  function openPackFlow() {
    var avail = packsAvailable(store, todayStr());
    if (avail <= 0) {
      toast('Pack habis — besok lagi! (2 gratis per hari, +1 tiap menang)');
      return;
    }
    consumePack(store, todayStr());
    packCards = rollPack();
    addToCollection(store, packCards);
    saveStore();
    packRevealed = 0;
    showView('pack');
    renderPack();
  }

  function renderPack() {
    var stage = $('#nt-pack-stage');
    stage.innerHTML = '';
    $('#nt-pack-hint').textContent = packRevealed < PACK.size
      ? 'Ketuk kartu untuk membuka (' + (PACK.size - packRevealed) + ' lagi)'
      : 'Selesai!';
    $('#nt-pack-done').classList.toggle('is-hidden', packRevealed < PACK.size);

    // Already-revealed row
    var revealedRow = document.createElement('div');
    revealedRow.className = 'nt-pack-revealed';
    for (var i = 0; i < packRevealed; i++) {
      var c = cardEl(packCards[i], { small: true });
      c.classList.add('nt-revealed-card');
      if (packCards[i].rarity === 'R') c.classList.add('nt-shimmer');
      revealedRow.appendChild(c);
    }
    stage.appendChild(revealedRow);

    if (packRevealed < PACK.size) {
      var stack = document.createElement('div');
      stack.className = 'nt-pack-stack';
      var remaining = PACK.size - packRevealed;
      for (var s = 0; s < remaining; s++) {
        var back = document.createElement('div');
        back.className = 'nt-card-back';
        back.style.transform = 'translate(' + s * 3 + 'px,' + -s * 3 + 'px)';
        if (s === remaining - 1) {
          back.classList.add('top');
          back.addEventListener('click', revealNext);
        }
        stack.appendChild(back);
      }
      stage.appendChild(stack);
    }
  }

  function revealNext() {
    var card = packCards[packRevealed];
    packRevealed++;
    if (reducedMotion) { renderPack(); return; }
    // Flip transition: render, then pulse the newest card.
    renderPack();
    var cardsRow = $$('.nt-revealed-card');
    var newest = cardsRow[cardsRow.length - 1];
    if (newest) {
      newest.classList.add('nt-flip-in');
      if (card.rarity === 'L') {
        newest.classList.add('nt-gold-burst');
        toast('✨ LEGENDA! ' + card.name + ' ✨');
      } else if (card.rarity === 'R') {
        toast('Rare! ' + card.name);
      }
    }
  }

  // ---- Binder ----
  function renderBinder() {
    var grid = $('#nt-binder-grid');
    grid.innerHTML = '';
    var owned = 0;
    CARDS.forEach(function (card) {
      var n = store.coll[card.id] || 0;
      if (n > 0) owned++;
      var c = cardEl(card, { small: true, silhouette: n === 0, count: n > 0 ? n : null });
      c.classList.add('nt-binder-card');
      c.addEventListener('click', function () {
        openZoom(card, []);
      });
      grid.appendChild(c);
    });
    $('#nt-binder-stats').textContent = 'Koleksi: ' + owned + '/' + CARDS.length + ' kartu';
  }

  // ---- Boot ----
  function init() {
    store = loadStore();

    $('#nt-go-deckpick').addEventListener('click', function () { showView('deckpick'); });
    $('#nt-go-pack').addEventListener('click', openPackFlow);
    $('#nt-go-binder').addEventListener('click', function () { showView('binder'); });
    $('#nt-go-rules').addEventListener('click', function () { showView('rules'); });
    $$('.nt-back-home').forEach(function (b) {
      b.addEventListener('click', function () { showView('home'); });
    });

    $('#nt-pick-rimba').addEventListener('click', function () { startMatch('R'); });
    $('#nt-pick-sakti').addEventListener('click', function () { startMatch('S'); });

    $('#nt-setup-done').addEventListener('click', function () {
      tryAction(function () { setupDone(match, 'P'); });
      renderMatch();
      maybeRunAI();
    });
    $('#nt-end-turn').addEventListener('click', function () {
      if (!isPlayerTurn()) return;
      uiMode = null;
      tryAction(function () { endTurn(match, 'P'); });
      renderMatch();
      maybeRunAI();
    });
    $('#nt-cancel-mode').addEventListener('click', function () {
      uiMode = null;
      renderMatch();
    });
    $('#nt-energy-chip').addEventListener('click', function () {
      if (!isPlayerTurn() || !match.sides.P.energyAvail) return;
      uiMode = { type: 'attach' };
      renderMatch();
    });
    $('#nt-zoom-close').addEventListener('click', closeZoom);
    $('#nt-zoom').addEventListener('click', function (e) {
      if (e.target === $('#nt-zoom')) closeZoom();
    });

    $('#nt-rematch').addEventListener('click', function () {
      startMatch(match.sides.P.type);
    });
    $('#nt-end-home').addEventListener('click', function () { showView('home'); });
    $('#nt-pack-done').addEventListener('click', function () { showView('home'); });

    showView('home');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
