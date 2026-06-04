/* Permadeath — Day 25. Roguelike deckbuilder. */
(function () {
  'use strict';

  // ===== Module: PRNG + utils =====
  function mulberry32(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = seed;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function makeSeed() { return Math.floor(Math.random() * 1e9); }
  function randInt(rng, lo, hi) { return Math.floor(rng() * (hi - lo + 1)) + lo; }
  function shuffle(rng, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function weightedPick(rng, items, weightFn) {
    const total = items.reduce((s, x) => s + weightFn(x), 0);
    let r = rng() * total;
    for (const it of items) { r -= weightFn(it); if (r <= 0) return it; }
    return items[items.length - 1];
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.from((r || document).querySelectorAll(s)); }
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ===== Module: Config =====
  const CFG = {
    startHP: 70, startEnergy: 3, startHandSize: 5,
    startingDeck: ['strike', 'strike', 'strike', 'strike', 'strike', 'guard', 'guard', 'guard', 'guard', 'bash'],
    rewardCount: 3,
    floorRooms: 6,           // rooms on the path before boss (including layered branches)
    floorLayers: 4,          // 3 layers of choice + boss layer
    scoreWeights: { floor: 100, enemy: 8, gold: 1, relic: 25, boss: 80 },
  };

  // ===== Module: Cards =====
  // play(state, ctx) — ctx may contain {target} for targeted cards.
  // Effects mutate the in-combat state.
  const CARDS = {
    strike: {
      id: 'strike', name: 'Strike', cost: 1, type: 'attack', rarity: 'starter', targeted: true,
      desc: () => 'Deal 6 damage.',
      play: (s, ctx) => dealDamage(s, ctx.target, 6),
    },
    guard: {
      id: 'guard', name: 'Guard', cost: 1, type: 'skill', rarity: 'starter',
      desc: () => 'Gain 5 block.',
      play: (s) => gainBlock(s, 5),
    },
    bash: {
      id: 'bash', name: 'Bash', cost: 2, type: 'attack', rarity: 'starter', targeted: true,
      desc: () => 'Deal 8 damage. Apply 2 Vulnerable.',
      play: (s, ctx) => { dealDamage(s, ctx.target, 8); applyStatus(ctx.target, 'vulnerable', 2); },
    },
    cleave: {
      id: 'cleave', name: 'Cleave', cost: 1, type: 'attack', rarity: 'common',
      desc: () => 'Deal 8 damage to ALL enemies.',
      play: (s) => { for (const e of s.enemies) if (e.hp > 0) dealDamage(s, e, 8); },
    },
    twinStrike: {
      id: 'twinStrike', name: 'Twin Strike', cost: 1, type: 'attack', rarity: 'common', targeted: true,
      desc: () => 'Deal 5 damage twice.',
      play: (s, ctx) => { dealDamage(s, ctx.target, 5); if (ctx.target.hp > 0) dealDamage(s, ctx.target, 5); },
    },
    ironWave: {
      id: 'ironWave', name: 'Iron Wave', cost: 1, type: 'attack', rarity: 'common', targeted: true,
      desc: () => 'Deal 5 damage. Gain 5 block.',
      play: (s, ctx) => { dealDamage(s, ctx.target, 5); gainBlock(s, 5); },
    },
    bodySlam: {
      id: 'bodySlam', name: 'Body Slam', cost: 1, type: 'attack', rarity: 'common', targeted: true,
      desc: () => 'Deal damage equal to your current Block.',
      play: (s, ctx) => dealDamage(s, ctx.target, s.player.block),
    },
    shrugItOff: {
      id: 'shrugItOff', name: 'Shrug It Off', cost: 1, type: 'skill', rarity: 'common',
      desc: () => 'Gain 8 block. Draw 1 card.',
      play: (s) => { gainBlock(s, 8); draw(s, 1); },
    },
    pommelStrike: {
      id: 'pommelStrike', name: 'Pommel Strike', cost: 1, type: 'attack', rarity: 'common', targeted: true,
      desc: () => 'Deal 9 damage. Draw 1 card.',
      play: (s, ctx) => { dealDamage(s, ctx.target, 9); draw(s, 1); },
    },
    flex: {
      id: 'flex', name: 'Flex', cost: 0, type: 'skill', rarity: 'common',
      desc: () => 'Gain 2 Strength this turn.',
      play: (s) => { applyStatusPlayer(s, 'strength', 2); applyStatusPlayer(s, 'strengthLossEoT', 2); },
    },
    disarm: {
      id: 'disarm', name: 'Disarm', cost: 1, type: 'skill', rarity: 'uncommon', targeted: true,
      desc: () => 'Apply 2 Weak.',
      play: (s, ctx) => applyStatus(ctx.target, 'weak', 2),
    },
    inflame: {
      id: 'inflame', name: 'Inflame', cost: 1, type: 'power', rarity: 'uncommon',
      desc: () => 'Gain 2 Strength.',
      play: (s) => applyStatusPlayer(s, 'strength', 2),
    },
    heavyBlade: {
      id: 'heavyBlade', name: 'Heavy Blade', cost: 2, type: 'attack', rarity: 'uncommon', targeted: true,
      desc: () => 'Deal 14 damage. Strength affects this 3x.',
      play: (s, ctx) => {
        const strBonus = (s.player.statuses.strength || 0) * 2; // extra 2x on top of base
        dealDamage(s, ctx.target, 14, strBonus);
      },
    },
    bloodletting: {
      id: 'bloodletting', name: 'Bloodletting', cost: 0, type: 'skill', rarity: 'uncommon',
      desc: () => 'Lose 3 HP. Gain 2 Energy.',
      play: (s) => {
        s.player.hp = Math.max(1, s.player.hp - 3);
        s.player.energy += 2;
        floater('-3', '#C44569', getPlayerAnchor());
      },
    },
  };

  const STARTER_REWARDS = ['cleave', 'twinStrike', 'ironWave', 'bodySlam', 'shrugItOff', 'pommelStrike', 'flex', 'disarm', 'inflame', 'heavyBlade', 'bloodletting'];

  // ===== Module: Relics =====
  // hooks: {onCombatStart, onTurnStart, onPlayCard, onCombatEnd, modifyDamageDealt}
  const RELICS = {
    burningBlood: {
      id: 'burningBlood', name: 'Burning Blood', icon: '🩸',
      desc: 'Heal 6 HP after each combat.',
      hooks: { onCombatEnd: (run) => { run.player.hp = clamp(run.player.hp + 6, 0, run.player.maxHp); toast('Burning Blood: +6 HP'); } },
    },
    vajra: {
      id: 'vajra', name: 'Vajra', icon: '⚡',
      desc: 'Gain 1 Strength at the start of each combat.',
      hooks: { onCombatStart: (s) => applyStatusPlayer(s, 'strength', 1) },
    },
    anchor: {
      id: 'anchor', name: 'Anchor', icon: '⚓',
      desc: 'Gain 10 block at the start of each combat.',
      hooks: { onCombatStart: (s) => gainBlock(s, 10) },
    },
    bagOfMarbles: {
      id: 'bagOfMarbles', name: 'Bag of Marbles', icon: '🪨',
      desc: 'At the start of combat, apply 1 Vulnerable to ALL enemies.',
      hooks: { onCombatStart: (s) => { for (const e of s.enemies) applyStatus(e, 'vulnerable', 1); } },
    },
    pureWater: {
      id: 'pureWater', name: 'Pure Water', icon: '💧',
      desc: '+1 Energy on the first turn of each combat.',
      hooks: { onCombatStart: (s) => { s.player.bonusEnergyNextTurn = (s.player.bonusEnergyNextTurn || 0) + 1; } },
    },
    snakeRing: {
      id: 'snakeRing', name: 'Snake Ring', icon: '💍',
      desc: 'Start each combat with 1 extra card in hand.',
      hooks: { onCombatStart: (s) => { s.player.bonusDrawNextTurn = (s.player.bonusDrawNextTurn || 0) + 1; } },
    },
  };

  // ===== Module: Enemies =====
  // Intent shapes: { kind: 'attack'|'block'|'buff'|'debuff'|'multiAttack', value, count? }
  // Each enemy: id, name, emoji, hpRange, intents: function(rng) returning a pattern or weighted picker
  const ENEMIES = {
    imp: {
      id: 'imp', name: 'Imp', emoji: '👺', hpRange: [12, 16],
      pickIntent(rng, turn) {
        const r = rng();
        if (r < 0.5) return { kind: 'attack', value: 6 };
        if (r < 0.8) return { kind: 'block', value: 5 };
        return { kind: 'debuff', status: 'weak', value: 1 };
      },
    },
    cultist: {
      id: 'cultist', name: 'Cultist', emoji: '🧙', hpRange: [22, 26],
      pickIntent(rng, turn) {
        if (turn === 0) return { kind: 'buff', status: 'strength', value: 3 };
        return { kind: 'attack', value: 6 };
      },
    },
    slime: {
      id: 'slime', name: 'Spike Slime', emoji: '🟢', hpRange: [18, 22],
      pickIntent(rng, turn) {
        return turn % 2 === 0 ? { kind: 'attack', value: 8 } : { kind: 'block', value: 6, alsoStatus: { status: 'weak', value: 1 } };
      },
    },
    rat: {
      id: 'rat', name: 'Rat', emoji: '🐀', hpRange: [10, 14],
      pickIntent(rng, turn) {
        return rng() < 0.65 ? { kind: 'attack', value: 4 } : { kind: 'attack', value: 3, count: 2, multi: true };
      },
    },
    warden: {
      id: 'warden', name: 'The Warden', emoji: '🐲', hpRange: [70, 70], boss: true,
      pickIntent(rng, turn) {
        // Pattern: 0:buff +2 str, 1:attack 10, 2:block 12, 3:HEAVY 22, 4:attack 8, then repeat with HEAVY every 3rd from now
        const phase = turn % 4;
        if (phase === 0 && turn === 0) return { kind: 'buff', status: 'strength', value: 2 };
        if (phase === 3) return { kind: 'attack', value: 22, signature: true };
        if (phase === 1) return { kind: 'attack', value: 10 };
        if (phase === 2) return { kind: 'block', value: 12, alsoStatus: { status: 'strength', value: 1 } };
        return { kind: 'attack', value: 8 };
      },
    },
  };

  // Enemy groups per room.
  function enemyGroupForCombat(rng, kind) {
    if (kind === 'easy') {
      const r = rng();
      if (r < 0.5) return [makeEnemy(rng, 'imp'), makeEnemy(rng, 'rat')];
      if (r < 0.8) return [makeEnemy(rng, 'slime')];
      return [makeEnemy(rng, 'rat'), makeEnemy(rng, 'rat')];
    }
    if (kind === 'elite') {
      const r = rng();
      if (r < 0.5) return [makeEnemy(rng, 'cultist'), makeEnemy(rng, 'imp')];
      return [makeEnemy(rng, 'slime'), makeEnemy(rng, 'slime')];
    }
    if (kind === 'boss') return [makeEnemy(rng, 'warden')];
    return [makeEnemy(rng, 'imp')];
  }

  function makeEnemy(rng, id) {
    const def = ENEMIES[id];
    const hp = randInt(rng, def.hpRange[0], def.hpRange[1]);
    return {
      defId: id, name: def.name, emoji: def.emoji, boss: !!def.boss,
      hp, maxHp: hp, block: 0,
      statuses: {},
      intent: null, turn: 0,
    };
  }

  // ===== Module: Run state =====
  const run = {
    seed: 0, rng: null,
    floor: 1, maxFloor: 1,
    player: null,
    deck: [],
    relics: [],
    floorMap: null,
    currentNodeIdx: null,
    score: 0,
    enemiesSlain: 0, gold: 0,
    inCombat: false,
    combatState: null,
    rewardCtx: null, // { reward, source }
    eventCtx: null,
  };

  function newPlayer() {
    return {
      hp: CFG.startHP, maxHp: CFG.startHP, block: 0,
      energy: 0, maxEnergy: CFG.startEnergy,
      statuses: {},
      bonusEnergyNextTurn: 0, bonusDrawNextTurn: 0,
    };
  }

  function startRun(seed) {
    run.seed = seed;
    run.rng = mulberry32(seed);
    run.floor = 1; run.maxFloor = 1;
    run.player = newPlayer();
    run.deck = CFG.startingDeck.slice();
    run.relics = [];
    run.score = 0; run.enemiesSlain = 0; run.gold = 0;
    run.inCombat = false; run.combatState = null;
    generateFloor();
    showView('map');
    renderMap();
    renderHUD();
    $('#pd-abandon-btn').style.display = 'inline-block';
  }

  // ===== Module: Floor generation =====
  // Simple layered map: layer 0 = start (player off-grid), layers 1..L = choices, last layer = boss
  function generateFloor() {
    const rng = run.rng;
    const L = CFG.floorLayers; // 4
    const layers = []; // layers[i] = array of nodes
    // Layer counts: [3, 3, 2, 1 boss]
    const counts = [3, 3, 2, 1];
    let id = 0;
    for (let i = 0; i < counts.length; i++) {
      const row = [];
      for (let j = 0; j < counts[i]; j++) {
        const isBoss = (i === counts.length - 1);
        let kind;
        if (isBoss) kind = 'boss';
        else {
          // Mix: top layer gets rest/treasure; others mostly combat with 1 treasure/elite
          if (i === 0) {
            kind = 'combat';
          } else if (i === 1) {
            kind = j === 1 ? 'elite' : (j === 0 ? 'treasure' : 'combat');
          } else if (i === 2) {
            kind = j === 0 ? 'rest' : 'elite';
          }
        }
        row.push({ id: id++, layer: i, col: j, kind, visited: false, edges: [] });
      }
      layers.push(row);
    }
    // Connect layers: each node in layer i connects to 1-2 nodes in layer i+1.
    for (let i = 0; i < layers.length - 1; i++) {
      for (const node of layers[i]) {
        const nextLayer = layers[i + 1];
        // Connect to nearest col + maybe a neighbor
        const myFrac = node.col / Math.max(1, counts[i] - 1);
        const candidates = nextLayer.map((n, k) => ({ n, idx: k, dist: Math.abs(k / Math.max(1, nextLayer.length - 1) - myFrac) }))
          .sort((a, b) => a.dist - b.dist);
        node.edges.push(candidates[0].n.id);
        if (candidates.length > 1 && rng() < 0.55) node.edges.push(candidates[1].n.id);
      }
      // Ensure every node in next layer is reachable from at least one in current
      for (const n of layers[i + 1]) {
        const reachable = layers[i].some(p => p.edges.includes(n.id));
        if (!reachable) {
          // pick nearest in layer i and connect
          const myFrac = n.col / Math.max(1, layers[i + 1].length - 1);
          const candidates = layers[i].map((p, k) => ({ p, dist: Math.abs(k / Math.max(1, layers[i].length - 1) - myFrac) }))
            .sort((a, b) => a.dist - b.dist);
          if (!candidates[0].p.edges.includes(n.id)) candidates[0].p.edges.push(n.id);
        }
      }
    }
    run.floorMap = { layers, nodesById: {} };
    for (const row of layers) for (const n of row) run.floorMap.nodesById[n.id] = n;
    // currentNodeIdx = -1 means at the start (below layer 0). Accessible = all layer 0 nodes.
    run.currentNodeIdx = null;
  }

  function accessibleNodeIds() {
    const map = run.floorMap;
    if (run.currentNodeIdx === null) {
      // Start: all layer 0 nodes are accessible
      return map.layers[0].map(n => n.id);
    }
    const cur = map.nodesById[run.currentNodeIdx];
    return cur.edges.slice();
  }

  // ===== Module: Combat engine =====
  function startCombat(enemies) {
    const s = {
      enemies,
      player: run.player,
      draw: [], hand: [], discard: [],
      turn: 0,
      isFirstTurn: true,
    };
    s.player.block = 0;
    s.player.statuses = {};
    // Build draw pile from current deck
    s.draw = shuffle(run.rng, run.deck.slice());
    s.hand = []; s.discard = [];
    run.inCombat = true;
    run.combatState = s;

    // Relic onCombatStart
    for (const rid of run.relics) {
      const r = RELICS[rid];
      if (r && r.hooks && r.hooks.onCombatStart) r.hooks.onCombatStart(s);
    }

    // Init enemy intents
    for (const e of s.enemies) {
      e.turn = 0;
      e.intent = ENEMIES[e.defId].pickIntent(run.rng, 0);
    }

    showView('combat');
    startPlayerTurn();
    renderCombat();
  }

  function startPlayerTurn() {
    const s = run.combatState;
    s.player.block = 0;
    s.player.energy = s.player.maxEnergy + (s.player.bonusEnergyNextTurn || 0);
    s.player.bonusEnergyNextTurn = 0;
    const handSize = CFG.startHandSize + (s.player.bonusDrawNextTurn || 0);
    s.player.bonusDrawNextTurn = 0;
    draw(s, handSize);
    s.isFirstTurn = (s.turn === 0);
  }

  function draw(s, n) {
    for (let i = 0; i < n; i++) {
      if (s.draw.length === 0) {
        if (s.discard.length === 0) return;
        s.draw = shuffle(run.rng, s.discard);
        s.discard = [];
      }
      const c = s.draw.pop();
      s.hand.push(c);
    }
  }

  function gainBlock(s, n) {
    s.player.block += n;
    floater(`+${n}`, '#7BA7CC', getPlayerAnchor());
  }

  function applyStatusPlayer(s, statusName, value) {
    s.player.statuses[statusName] = (s.player.statuses[statusName] || 0) + value;
  }

  function applyStatus(target, statusName, value) {
    target.statuses[statusName] = (target.statuses[statusName] || 0) + value;
  }

  // Player attacks an enemy; bonus is added to base, then strength, then weak/vuln multipliers
  function dealDamage(s, target, baseAmount, bonus) {
    if (!target || target.hp <= 0) return;
    bonus = bonus || 0;
    let dmg = baseAmount + bonus + (s.player.statuses.strength || 0);
    if (s.player.statuses.weak > 0) dmg = Math.floor(dmg * 0.75);
    if (target.statuses.vulnerable > 0) dmg = Math.floor(dmg * 1.5);
    dmg = Math.max(0, dmg);
    // Absorb by block
    if (target.block >= dmg) { target.block -= dmg; dmg = 0; }
    else { dmg -= target.block; target.block = 0; }
    if (dmg > 0) {
      target.hp -= dmg;
      const anchor = getEnemyAnchor(target);
      floater(`-${dmg}`, '#C44569', anchor);
      if (anchor) shake(anchor);
    } else {
      floater(`-0`, '#7BA7CC', getEnemyAnchor(target));
    }
    if (target.hp <= 0) target.hp = 0;
  }

  // Enemy attacks player; strength on enemy, weak on enemy, vulnerable on player
  function enemyDealDamage(target, attacker, baseAmount) {
    if (target.hp <= 0) return;
    let dmg = baseAmount + (attacker.statuses.strength || 0);
    if (attacker.statuses.weak > 0) dmg = Math.floor(dmg * 0.75);
    if (target.statuses.vulnerable > 0) dmg = Math.floor(dmg * 1.5);
    dmg = Math.max(0, dmg);
    if (target.block >= dmg) { target.block -= dmg; dmg = 0; }
    else { dmg -= target.block; target.block = 0; }
    if (dmg > 0) {
      target.hp -= dmg;
      floater(`-${dmg}`, '#C44569', getPlayerAnchor());
      shake(document.querySelector('.pd-hud'));
    }
    if (target.hp < 0) target.hp = 0;
  }

  function playCard(cardId, target) {
    const s = run.combatState;
    const card = CARDS[cardId];
    if (!card) return;
    if (s.player.energy < card.cost) return;
    if (card.targeted && (!target || target.hp <= 0)) return;
    // Remove from hand
    const idx = s.hand.indexOf(cardId);
    if (idx < 0) return;
    s.hand.splice(idx, 1);
    s.player.energy -= card.cost;
    // Effect
    card.play(s, { target });
    // Discard
    s.discard.push(cardId);
    // Relic onPlayCard
    for (const rid of run.relics) {
      const r = RELICS[rid];
      if (r && r.hooks && r.hooks.onPlayCard) r.hooks.onPlayCard(s, card);
    }
    // Check win
    if (s.enemies.every(e => e.hp <= 0)) {
      endCombat(true);
      return;
    }
    renderCombat();
  }

  function endTurn() {
    const s = run.combatState;
    // Player end-of-turn ticks: lose strengthLossEoT
    if (s.player.statuses.strengthLossEoT > 0) {
      s.player.statuses.strength = Math.max(0, (s.player.statuses.strength || 0) - s.player.statuses.strengthLossEoT);
      s.player.statuses.strengthLossEoT = 0;
    }
    // Decrement player statuses (Weak, Vulnerable) by 1
    tickStatuses(s.player);
    // Discard hand
    s.discard.push.apply(s.discard, s.hand);
    s.hand = [];

    // Enemy phase
    for (const e of s.enemies) {
      if (e.hp <= 0) continue;
      const intent = e.intent;
      e.block = 0; // enemy block resets each of their turns (simple model)
      if (intent.kind === 'attack') {
        enemyDealDamage(s.player, e, intent.value);
        if (run.player.hp <= 0) { runOver(false); return; }
      } else if (intent.kind === 'multiAttack' || intent.multi) {
        for (let k = 0; k < (intent.count || 2); k++) {
          enemyDealDamage(s.player, e, intent.value);
          if (run.player.hp <= 0) { runOver(false); return; }
        }
      } else if (intent.kind === 'block') {
        e.block += intent.value;
        if (intent.alsoStatus) applyStatus(s.player, intent.alsoStatus.status, intent.alsoStatus.value);
      } else if (intent.kind === 'buff') {
        applyStatus(e, intent.status, intent.value);
      } else if (intent.kind === 'debuff') {
        applyStatus(s.player, intent.status, intent.value);
      }
      // Tick enemy statuses (Vulnerable, Weak)
      tickStatuses(e);
      // Set next intent
      e.turn++;
      e.intent = ENEMIES[e.defId].pickIntent(run.rng, e.turn);
    }

    s.turn++;
    startPlayerTurn();
    renderCombat();
  }

  function tickStatuses(entity) {
    // Vulnerable and Weak decrement by 1; non-negative.
    ['vulnerable', 'weak'].forEach(k => {
      if (entity.statuses[k] > 0) entity.statuses[k] = entity.statuses[k] - 1;
    });
  }

  function endCombat(won) {
    const s = run.combatState;
    run.inCombat = false;
    if (won) {
      const slain = s.enemies.length;
      run.enemiesSlain += slain;
      const wasBoss = s.enemies.some(e => e.boss);
      // Award gold
      const goldEarn = 10 + Math.floor(run.rng() * 8) + (wasBoss ? 30 : 0);
      run.gold += goldEarn;
      // Relic onCombatEnd
      for (const rid of run.relics) {
        const r = RELICS[rid];
        if (r && r.hooks && r.hooks.onCombatEnd) r.hooks.onCombatEnd(run);
      }
      if (wasBoss) {
        runOver(true);
        return;
      }
      // Card reward
      const rewards = rollCardRewards();
      run.rewardCtx = { rewards };
      showView('reward');
      renderRewards();
    } else {
      runOver(false);
    }
  }

  function rollCardRewards() {
    const pool = STARTER_REWARDS.slice();
    shuffle(run.rng, pool);
    return pool.slice(0, CFG.rewardCount);
  }

  function takeReward(cardId) {
    if (cardId) run.deck.push(cardId);
    afterRoom();
  }

  function afterRoom() {
    // Re-render map and return to it
    showView('map');
    renderMap();
    renderHUD();
  }

  // Move into a node and trigger its content
  function enterNode(id) {
    const node = run.floorMap.nodesById[id];
    if (!node) return;
    // Must be in accessible set
    const acc = accessibleNodeIds();
    if (!acc.includes(id)) return;
    run.currentNodeIdx = id;
    node.visited = true;
    if (node.kind === 'combat') startCombat(enemyGroupForCombat(run.rng, 'easy'));
    else if (node.kind === 'elite') startCombat(enemyGroupForCombat(run.rng, 'elite'));
    else if (node.kind === 'boss') startCombat(enemyGroupForCombat(run.rng, 'boss'));
    else if (node.kind === 'treasure') openTreasure();
    else if (node.kind === 'rest') openRest();
  }

  function openTreasure() {
    const availableRelics = Object.keys(RELICS).filter(id => !run.relics.includes(id));
    if (availableRelics.length === 0) {
      run.gold += 30;
      toast('Treasure: +30 gold');
      afterRoom();
      return;
    }
    const rid = availableRelics[Math.floor(run.rng() * availableRelics.length)];
    run.eventCtx = { kind: 'treasure', rid };
    showView('event');
    renderEvent();
  }

  function takeTreasure() {
    const ctx = run.eventCtx;
    if (ctx && ctx.rid) {
      run.relics.push(ctx.rid);
      toast(`Found: ${RELICS[ctx.rid].name}`);
    }
    afterRoom();
  }

  function openRest() {
    run.eventCtx = { kind: 'rest' };
    showView('event');
    renderEvent();
  }

  function restHeal() {
    const heal = Math.floor(run.player.maxHp * 0.3);
    run.player.hp = Math.min(run.player.maxHp, run.player.hp + heal);
    toast(`Rested: +${heal} HP`);
    afterRoom();
  }

  function runOver(victory) {
    run.inCombat = false;
    // Score
    const sw = CFG.scoreWeights;
    let s = (run.floor) * sw.floor + run.enemiesSlain * sw.enemy + run.gold * sw.gold + run.relics.length * sw.relic;
    if (victory) s += sw.boss;
    run.score = s;
    // Best score
    try {
      const best = parseInt(localStorage.getItem('pd_best_score') || '0', 10);
      if (s > best) localStorage.setItem('pd_best_score', String(s));
    } catch (e) {}
    showView('end');
    renderEnd(victory);
    $('#pd-abandon-btn').style.display = 'none';
  }

  // ===== Module: Rendering =====
  function showView(name) {
    $$('.pd-view').forEach(v => v.classList.toggle('is-active', v.dataset.view === name));
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function renderHUD() {
    const html = `
      <div class="pd-hud-item">❤️ <span class="v">${run.player.hp}/${run.player.maxHp}</span></div>
      <div class="pd-hud-item">💰 <span class="v">${run.gold}</span></div>
      <div class="pd-hud-item">Deck <span class="v">${run.deck.length}</span></div>
      <div class="pd-hud-item">Floor <span class="v">${run.floor}</span></div>
      <div class="pd-relics">${run.relics.map(id => `<span class="pd-relic" title="${escapeHTML(RELICS[id].name + ' — ' + RELICS[id].desc)}">${RELICS[id].icon}</span>`).join('')}</div>
    `;
    ['pd-hud-map', 'pd-hud-combat', 'pd-hud-reward', 'pd-hud-event'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    });
  }

  function renderMap() {
    const map = run.floorMap;
    const acc = accessibleNodeIds();
    const wrap = document.createElement('div');
    wrap.className = 'pd-map-inner';
    // Render from bottom (start) up to boss
    for (let i = 0; i < map.layers.length; i++) {
      const row = document.createElement('div');
      row.className = 'pd-map-row';
      for (const node of map.layers[i]) {
        const el = document.createElement('button');
        el.className = 'pd-node';
        el.type = 'button';
        if (node.kind === 'boss') el.classList.add('is-boss');
        if (run.currentNodeIdx === node.id) el.classList.add('is-current');
        else if (node.visited) el.classList.add('is-visited');
        if (acc.includes(node.id)) el.classList.add('is-accessible');
        el.textContent = nodeIcon(node);
        el.title = nodeLabel(node);
        el.dataset.nodeId = node.id;
        el.addEventListener('click', () => enterNode(node.id));
        row.appendChild(el);
      }
      wrap.appendChild(row);
    }
    const mapEl = $('#pd-map');
    mapEl.innerHTML = '';
    mapEl.appendChild(wrap);
    $('#pd-floor-label').textContent = `Floor ${run.floor}`;
  }
  function nodeIcon(n) {
    return ({ combat: '⚔', elite: '👹', treasure: '💎', rest: '☾', boss: '🐲', shop: '🛒' })[n.kind] || '?';
  }
  function nodeLabel(n) {
    return ({ combat: 'Combat', elite: 'Elite', treasure: 'Treasure', rest: 'Rest', boss: 'Boss', shop: 'Shop' })[n.kind] || '?';
  }

  // Targeting state for the combat view
  let targetingCard = null;

  function renderCombat() {
    const s = run.combatState;
    renderHUD();
    // Enemies
    const enemiesEl = $('#pd-enemies');
    enemiesEl.innerHTML = '';
    s.enemies.forEach((e, idx) => {
      const ed = document.createElement('div');
      ed.className = 'pd-enemy';
      if (e.hp <= 0) ed.classList.add('is-dead');
      else if (targetingCard) ed.classList.add('is-targetable');
      ed.dataset.enemyIdx = idx;
      const intentStr = describeIntent(e.intent, e);
      const statuses = renderStatusPills(e.statuses);
      ed.innerHTML = `
        ${e.block > 0 ? `<div class="pd-block-shield">${e.block}</div>` : ''}
        <div class="pd-enemy-emoji">${e.emoji}</div>
        <div class="pd-enemy-name">${escapeHTML(e.name)}</div>
        <div class="pd-hp-bar"><div class="pd-hp-fill" style="width: ${Math.max(0, e.hp / e.maxHp * 100)}%"></div></div>
        <div class="pd-hp-text">${e.hp} / ${e.maxHp}</div>
        <div class="pd-enemy-intent">${intentStr}</div>
        <div class="pd-status-line">${statuses}</div>
      `;
      ed.addEventListener('click', () => {
        if (targetingCard && e.hp > 0) {
          const c = targetingCard;
          targetingCard = null;
          playCard(c, e);
          $('#pd-targeting-hint').classList.add('is-hidden');
        }
      });
      enemiesEl.appendChild(ed);
    });

    // Player combat HUD: HP/block/energy + statuses, prepended into pile-counts row
    const pc = $('#pd-pile-counts');
    pc.innerHTML = `
      ⚡ <span style="color: var(--accent); font-weight:600">${s.player.energy}/${s.player.maxEnergy}</span>
      &nbsp;🛡 <span style="color: #7BA7CC; font-weight:600">${s.player.block}</span>
      &nbsp;Draw <span style="color: var(--text)">${s.draw.length}</span>
      &nbsp;Discard <span style="color: var(--text)">${s.discard.length}</span>
      &nbsp;${renderStatusPills(s.player.statuses)}
    `;

    // Hand
    const handEl = $('#pd-hand');
    handEl.innerHTML = '';
    s.hand.forEach((cid, idx) => {
      const c = CARDS[cid];
      const playable = s.player.energy >= c.cost;
      const cardEl = document.createElement('div');
      cardEl.className = `pd-card is-${c.type} ${playable ? 'is-playable' : 'is-unplayable'}`;
      if (targetingCard === cid) cardEl.classList.add('is-selected');
      cardEl.dataset.cardIdx = idx;
      cardEl.innerHTML = `
        <div class="pd-card-cost">${c.cost}</div>
        <div class="pd-card-name">${escapeHTML(c.name)}</div>
        <div class="pd-card-type">${c.type}</div>
        <div class="pd-card-desc">${c.desc(s)}</div>
      `;
      cardEl.addEventListener('click', () => onCardClick(cid));
      handEl.appendChild(cardEl);
    });

    // Targeting hint
    if (targetingCard) {
      $('#pd-targeting-hint').classList.remove('is-hidden');
    } else {
      $('#pd-targeting-hint').classList.add('is-hidden');
    }
  }

  function onCardClick(cardId) {
    const s = run.combatState;
    const c = CARDS[cardId];
    if (s.player.energy < c.cost) { toast('Not enough energy'); return; }
    if (c.targeted) {
      // Toggle targeting
      if (targetingCard === cardId) { targetingCard = null; renderCombat(); return; }
      targetingCard = cardId;
      renderCombat();
    } else {
      targetingCard = null;
      playCard(cardId);
    }
  }

  function describeIntent(intent, e) {
    if (!intent) return '';
    if (intent.kind === 'attack') {
      const previewDmg = previewIncomingDamage(e, intent.value);
      return `⚔ ${previewDmg}`;
    }
    if (intent.kind === 'multiAttack' || intent.multi) {
      const previewDmg = previewIncomingDamage(e, intent.value);
      return `⚔ ${previewDmg} × ${intent.count || 2}`;
    }
    if (intent.kind === 'block') return `🛡 ${intent.value}`;
    if (intent.kind === 'buff') return `✦ buff`;
    if (intent.kind === 'debuff') return `✦ debuff`;
    return '?';
  }

  function previewIncomingDamage(e, base) {
    let dmg = base + (e.statuses.strength || 0);
    if (e.statuses.weak > 0) dmg = Math.floor(dmg * 0.75);
    if (run.player.statuses.vulnerable > 0) dmg = Math.floor(dmg * 1.5);
    return Math.max(0, dmg);
  }

  function renderStatusPills(statuses) {
    const out = [];
    if (statuses.vulnerable > 0) out.push(`<span class="pd-status-pill is-debuff">Vuln ${statuses.vulnerable}</span>`);
    if (statuses.weak > 0) out.push(`<span class="pd-status-pill is-debuff">Weak ${statuses.weak}</span>`);
    if (statuses.strength > 0) out.push(`<span class="pd-status-pill is-buff">Str ${statuses.strength}</span>`);
    return out.join(' ');
  }

  function renderRewards() {
    const ctx = run.rewardCtx;
    const wrap = $('#pd-rewards');
    wrap.innerHTML = '';
    for (const cid of ctx.rewards) {
      const c = CARDS[cid];
      const el = document.createElement('div');
      el.className = `pd-card is-${c.type} is-playable`;
      el.innerHTML = `
        <div class="pd-card-cost">${c.cost}</div>
        <div class="pd-card-name">${escapeHTML(c.name)}</div>
        <div class="pd-card-type">${c.type}</div>
        <div class="pd-card-desc">${c.desc()}</div>
      `;
      el.addEventListener('click', () => takeReward(cid));
      wrap.appendChild(el);
    }
  }

  function renderEvent() {
    const ctx = run.eventCtx;
    const el = $('#pd-event');
    if (ctx.kind === 'treasure') {
      const r = RELICS[ctx.rid];
      el.innerHTML = `
        <div class="pd-event-icon">${r.icon}</div>
        <div class="pd-event-title">${escapeHTML(r.name)}</div>
        <div class="pd-event-desc">${escapeHTML(r.desc)}</div>
        <div class="pd-event-buttons">
          <button class="pd-event-btn" id="pd-take-treasure">Take it</button>
        </div>`;
      $('#pd-take-treasure').addEventListener('click', takeTreasure);
    } else if (ctx.kind === 'rest') {
      const heal = Math.floor(run.player.maxHp * 0.3);
      el.innerHTML = `
        <div class="pd-event-icon">☾</div>
        <div class="pd-event-title">A quiet shrine</div>
        <div class="pd-event-desc">Rest and recover ${heal} HP.</div>
        <div class="pd-event-buttons">
          <button class="pd-event-btn" id="pd-rest-heal">Rest</button>
        </div>`;
      $('#pd-rest-heal').addEventListener('click', restHeal);
    }
  }

  function renderEnd(victory) {
    const title = $('#pd-end-title');
    title.textContent = victory ? 'Victory.' : 'You died.';
    title.className = 'pd-end-title ' + (victory ? 'is-victory' : 'is-defeat');
    const body = $('#pd-end-body');
    const deckList = run.deck.map(id => `<span class="pd-end-deck-card">${escapeHTML(CARDS[id].name)}</span>`).join('');
    const relicList = run.relics.map(id => `<span class="pd-end-deck-card">${RELICS[id].icon} ${escapeHTML(RELICS[id].name)}</span>`).join('') || '—';
    body.innerHTML = `
      <div class="pd-end-stat">Floor reached <strong>${run.floor}</strong></div>
      <div class="pd-end-stat">Enemies slain <strong>${run.enemiesSlain}</strong></div>
      <div class="pd-end-stat">Gold <strong>${run.gold}</strong></div>
      <div class="pd-end-stat">Relics <strong>${run.relics.length}</strong></div>
      <div class="pd-end-score">Score: <strong>${run.score}</strong></div>
      <div class="pd-end-deck">Final deck (${run.deck.length}): <div class="pd-end-deck-cards">${deckList}</div></div>
      <div class="pd-end-deck" style="margin-top: 0.8rem;">Relics: <div class="pd-end-deck-cards">${relicList}</div></div>
    `;
  }

  // ===== Module: Juice =====
  function floater(text, color, anchor) {
    if (typeof document === 'undefined') return;
    const root = $('#pd-floaters');
    if (!root) return;
    const f = document.createElement('div');
    f.className = 'pd-floater';
    f.style.color = color;
    f.textContent = text;
    let x = window.innerWidth / 2, y = window.innerHeight / 2;
    if (anchor && anchor.getBoundingClientRect) {
      const r = anchor.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
    }
    f.style.left = (x - 12) + 'px';
    f.style.top = y + 'px';
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 900);
  }
  function shake(el) {
    if (typeof document === 'undefined') return;
    if (!el) return;
    el.classList.add('pd-shake');
    setTimeout(() => el.classList.remove('pd-shake'), 200);
  }
  function getEnemyAnchor(target) {
    if (typeof document === 'undefined') return null;
    if (!run.combatState) return null;
    const idx = run.combatState.enemies.indexOf(target);
    if (idx < 0) return null;
    return document.querySelector(`.pd-enemy[data-enemy-idx="${idx}"]`);
  }
  function getPlayerAnchor() {
    if (typeof document === 'undefined') return null;
    return document.querySelector('.pd-hud');
  }
  function toast(msg) {
    const t = $('.pd-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('is-visible');
    setTimeout(() => t.classList.remove('is-visible'), 1500);
  }

  // ===== Boot =====
  function showTitle() {
    showView('title');
    $('#pd-abandon-btn').style.display = 'none';
    try {
      const best = localStorage.getItem('pd_best_score');
      if (best) $('#pd-best-score').textContent = 'Best score: ' + best;
    } catch (e) {}
  }

  function init() {
    $('#pd-begin-btn').addEventListener('click', () => startRun(makeSeed()));
    $('#pd-runagain-btn').addEventListener('click', () => startRun(makeSeed()));
    $('#pd-skip-reward-btn').addEventListener('click', () => takeReward(null));
    $('#pd-end-turn-btn').addEventListener('click', () => {
      if (run.inCombat) {
        targetingCard = null;
        endTurn();
      }
    });
    $('#pd-abandon-btn').addEventListener('click', () => {
      if (confirm('Abandon this run? Your deck and relics will be lost.')) {
        run.inCombat = false;
        showTitle();
      }
    });
    showTitle();
  }

  // Expose internals for headless testing.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CARDS, RELICS, ENEMIES, CFG, mulberry32, dealDamage: (s, t, b) => dealDamage(s, t, b), simulateCombat };
  }

  // Pure-logic combat simulator used by headless sanity tests.
  function simulateCombat(opts) {
    opts = opts || {};
    const seed = opts.seed || 1;
    const rng = mulberry32(seed);
    const enemy = { defId: opts.enemyId || 'imp', name: 'X', emoji: 'X', boss: false, hp: 50, maxHp: 50, block: 0, statuses: {}, intent: null, turn: 0 };
    const player = { hp: 70, maxHp: 70, block: 0, energy: 3, maxEnergy: 3, statuses: {} };
    const s = { enemies: [enemy], player, draw: shuffle(rng, ['strike','strike','strike','strike','strike','guard','guard','guard','guard','bash']), hand: [], discard: [], turn: 0 };
    // Save / restore globals so dealDamage works
    const savedRun = run.combatState;
    run.combatState = s; run.rng = rng; run.player = player;
    // Hand-draw 5
    while (s.hand.length < 5 && s.draw.length > 0) s.hand.push(s.draw.pop());
    // Play Bash if available, then Strikes
    const bashIdx = s.hand.indexOf('bash');
    if (bashIdx >= 0 && player.energy >= 2) { s.hand.splice(bashIdx, 1); player.energy -= 2; CARDS.bash.play(s, { target: enemy }); s.discard.push('bash'); }
    while (player.energy > 0) {
      const sIdx = s.hand.indexOf('strike');
      if (sIdx < 0) break;
      s.hand.splice(sIdx, 1); player.energy -= 1;
      CARDS.strike.play(s, { target: enemy });
      s.discard.push('strike');
    }
    const result = { enemyHpAfter: enemy.hp, vuln: enemy.statuses.vulnerable || 0 };
    run.combatState = savedRun;
    return result;
  }

  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})();
