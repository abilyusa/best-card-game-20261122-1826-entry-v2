// Tidebound — roguelike deck-builder card battler.
// Pure game engine: no DOM, no canvas. Safe to require() from Node for
// simulation testing. UI lives in ui.js; index.html loads both.
(function (root) {
  'use strict';

  // ---------- helpers ----------
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function shuffle(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor((rnd || Math.random)() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function pickN(arr, n, rnd) { return shuffle(arr, rnd).slice(0, n); }

  // ---------- suits ----------
  // tide (blue), storm (violet), kelp (green), sun (gold)
  var SUITS = {
    tide:  { color: '#3aa7ff', dark: '#1c5fa8', name: 'Tide' },
    storm: { color: '#b678ff', dark: '#6d34b8', name: 'Storm' },
    kelp:  { color: '#3ddc97', dark: '#1e7d55', name: 'Kelp' },
    sun:   { color: '#ffc53d', dark: '#a87808', name: 'Sun' },
    curse: { color: '#8a8f98', dark: '#565b63', name: 'Curse' },
  };

  // ---------- card pool ----------
  // Each card: { id, name, suit, cost, text, play(S) }
  // S is the run state; helpers below mutate it. Damage numbers returned
  // by effects are reported through S.log for the UI.
  function dmg(S, target, amount, source) {
    // amount is raw damage; strength applies for the player, weak reduces.
    let amt = amount;
    if (source === 'player') {
      amt += S.player.strength;
      if (S.player.weak > 0) amt = Math.floor(amt * 0.75);
    } else {
      amt += S.enemy.strength;
      if (S.enemy.weak > 0) amt = Math.floor(amt * 0.75);
    }
    amt = Math.max(0, amt);
    const t = target === 'player' ? S.player : S.enemy;
    let blocked = 0;
    if (t.block > 0) { blocked = Math.min(t.block, amt); t.block -= blocked; amt -= blocked; }
    if (amt > 0) {
      t.hp -= amt;
      // thorns reflect on the attacker
      if (target === 'enemy' && S.player.thorns > 0) {
        hurtEnemy(S, S.player.thorns, 'thorns');
      }
      if (target === 'player' && S.enemy.thorns > 0) {
        hurtPlayer(S, S.enemy.thorns, 'thorns');
      }
    }
    S.lastDamage = { target: target, amount: amt, blocked: blocked };
    return amt;
  }
  function hurtEnemy(S, amount) { // direct damage, ignores strength/weak
    let amt = Math.max(0, amount);
    let blocked = 0;
    if (S.enemy.block > 0) { blocked = Math.min(S.enemy.block, amt); S.enemy.block -= blocked; amt -= blocked; }
    if (amt > 0) S.enemy.hp -= amt;
    S.lastDamage = { target: 'enemy', amount: amt, blocked: blocked };
    return amt;
  }
  function hurtPlayer(S, amount) {
    let amt = Math.max(0, amount);
    let blocked = 0;
    if (S.player.block > 0) { blocked = Math.min(S.player.block, amt); S.player.block -= blocked; amt -= blocked; }
    if (amt > 0) S.player.hp -= amt;
    S.lastDamage = { target: 'player', amount: amt, blocked: blocked };
    return amt;
  }
  function gainBlock(S, who, amount) {
    const t = who === 'player' ? S.player : S.enemy;
    t.block += amount;
  }
  function heal(S, who, amount) {
    const t = who === 'player' ? S.player : S.enemy;
    t.hp = Math.min(t.maxHp, t.hp + amount);
  }
  function drawCards(S, n) {
    for (let i = 0; i < n; i++) {
      if (S.drawPile.length === 0) {
        if (S.discardPile.length === 0) return;
        S.drawPile = shuffle(S.discardPile);
        S.discardPile = [];
      }
      if (S.hand.length >= 10) return; // hand cap
      S.hand.push(S.drawPile.pop());
    }
  }

  var CARDS = {};
  function def(id, name, suit, cost, text, play) {
    CARDS[id] = { id: id, name: name, suit: suit, cost: cost, text: text, play: play };
  }

  // ---- Tide (blue): control, draw, block ----
  def('splash', 'Splash', 'tide', 1, 'Deal 4 damage.', function (S) { dmg(S, 'enemy', 4, 'player'); });
  def('crashing_wave', 'Crashing Wave', 'tide', 2, 'Deal 9 damage.', function (S) { dmg(S, 'enemy', 9, 'player'); });
  def('undertow', 'Undertow', 'tide', 1, 'Deal 3 damage. Draw 1 card.', function (S) { dmg(S, 'enemy', 3, 'player'); drawCards(S, 1); });
  def('riptide', 'Riptide', 'tide', 2, 'Deal 6 damage. Draw 1 card.', function (S) { dmg(S, 'enemy', 6, 'player'); drawCards(S, 1); });
  def('floodwall', 'Floodwall', 'tide', 1, 'Gain 6 Block.', function (S) { gainBlock(S, 'player', 6); });
  def('deep_shelter', 'Deep Shelter', 'tide', 2, 'Gain 10 Block.', function (S) { gainBlock(S, 'player', 10); });
  def('tidal_pull', 'Tidal Pull', 'tide', 1, 'Deal 2 damage. Enemy loses 6 Block.', function (S) { S.enemy.block = Math.max(0, S.enemy.block - 6); dmg(S, 'enemy', 2, 'player'); });
  def('soothing_current', 'Soothing Current', 'tide', 1, 'Heal 4 HP.', function (S) { heal(S, 'player', 4); });
  def('maelstrom', 'Maelstrom', 'tide', 3, 'Deal 14 damage.', function (S) { dmg(S, 'enemy', 14, 'player'); });
  def('ebb', 'Ebb', 'tide', 0, 'Draw 1 card.', function (S) { drawCards(S, 1); });
  def('high_tide', 'High Tide', 'tide', 2, 'Gain 8 Block. Draw 1 card.', function (S) { gainBlock(S, 'player', 8); drawCards(S, 1); });

  // ---- Storm (violet): burn and burst ----
  def('spark', 'Spark', 'storm', 1, 'Deal 5 damage.', function (S) { dmg(S, 'enemy', 5, 'player'); });
  def('lightning', 'Lightning', 'storm', 2, 'Deal 8 damage. Apply 2 Burn.', function (S) { dmg(S, 'enemy', 8, 'player'); S.enemy.burn += 2; });
  def('thunderclap', 'Thunderclap', 'storm', 2, 'Deal 7 damage. Gain 4 Block.', function (S) { dmg(S, 'enemy', 7, 'player'); gainBlock(S, 'player', 4); });
  def('static_charge', 'Static Charge', 'storm', 1, 'Apply 3 Burn.', function (S) { S.enemy.burn += 3; });
  def('storm_surge', 'Storm Surge', 'storm', 3, 'Deal 12 damage. Apply 3 Burn.', function (S) { dmg(S, 'enemy', 12, 'player'); S.enemy.burn += 3; });
  def('gale_slash', 'Gale Slash', 'storm', 1, 'Deal 3 damage twice.', function (S) { dmg(S, 'enemy', 3, 'player'); dmg(S, 'enemy', 3, 'player'); });
  def('overcharge', 'Overcharge', 'storm', 0, 'Gain 1 Energy. Draw 1 card.', function (S) { S.player.energy += 1; drawCards(S, 1); });
  def('tempest', 'Tempest', 'storm', 3, 'Deal 10 damage. Apply 4 Burn.', function (S) { dmg(S, 'enemy', 10, 'player'); S.enemy.burn += 4; });
  def('chain_lightning', 'Chain Lightning', 'storm', 2, 'Deal 6 damage. If the enemy is Burning, deal 6 more.', function (S) { dmg(S, 'enemy', 6, 'player'); if (S.enemy.burn > 0) dmg(S, 'enemy', 6, 'player'); });
  def('ionize', 'Ionize', 'storm', 1, 'Deal 4 damage. Apply 2 Burn.', function (S) { dmg(S, 'enemy', 4, 'player'); S.enemy.burn += 2; });

  // ---- Kelp (green): thorns, weaken, healing ----
  def('vine_whip', 'Vine Whip', 'kelp', 1, 'Deal 4 damage. Gain 3 Block.', function (S) { dmg(S, 'enemy', 4, 'player'); gainBlock(S, 'player', 3); });
  def('thorn_lash', 'Thorn Lash', 'kelp', 1, 'Deal 3 damage. Gain 3 Thorns.', function (S) { dmg(S, 'enemy', 3, 'player'); S.player.thorns += 3; });
  def('bloom', 'Bloom', 'kelp', 1, 'Heal 5 HP.', function (S) { heal(S, 'player', 5); });
  def('root_snare', 'Root Snare', 'kelp', 1, 'Deal 2 damage. Apply 2 Weak.', function (S) { dmg(S, 'enemy', 2, 'player'); S.enemy.weak += 2; });
  def('kelp_armor', 'Kelp Armor', 'kelp', 2, 'Gain 9 Block.', function (S) { gainBlock(S, 'player', 9); });
  def('spore_cloud', 'Spore Cloud', 'kelp', 2, 'Apply 3 Weak and 2 Burn.', function (S) { S.enemy.weak += 3; S.enemy.burn += 2; });
  def('photosynthesis', 'Photosynthesis', 'kelp', 0, 'Heal 3 HP. Draw 1 card.', function (S) { heal(S, 'player', 3); drawCards(S, 1); });
  def('bramble_shield', 'Bramble Shield', 'kelp', 1, 'Gain 5 Block. Gain 3 Thorns.', function (S) { gainBlock(S, 'player', 5); S.player.thorns += 3; });
  def('entangle', 'Entangle', 'kelp', 2, 'Deal 5 damage. Apply 3 Weak.', function (S) { dmg(S, 'enemy', 5, 'player'); S.enemy.weak += 3; });
  def('regrowth', 'Regrowth', 'kelp', 2, 'Heal 8 HP.', function (S) { heal(S, 'player', 8); });

  // ---- Sun (gold): strength, energy, big hits ----
  def('sunbeam', 'Sunbeam', 'sun', 1, 'Deal 6 damage.', function (S) { dmg(S, 'enemy', 6, 'player'); });
  def('radiant_strike', 'Radiant Strike', 'sun', 2, 'Deal 10 damage.', function (S) { dmg(S, 'enemy', 10, 'player'); });
  def('golden_aegis', 'Golden Aegis', 'sun', 2, 'Gain 12 Block.', function (S) { gainBlock(S, 'player', 12); });
  def('focus', 'Focus', 'sun', 1, 'Gain 2 Strength.', function (S) { S.player.strength += 2; });
  def('solar_flare', 'Solar Flare', 'sun', 3, 'Deal 16 damage.', function (S) { dmg(S, 'enemy', 16, 'player'); });
  def('blessing', 'Blessing', 'sun', 1, 'Heal 6 HP.', function (S) { heal(S, 'player', 6); });
  def('dawn', 'Dawn', 'sun', 1, 'Draw 2 cards.', function (S) { drawCards(S, 2); });
  def('smite', 'Smite', 'sun', 2, 'Deal 8 damage. Gain 1 Energy.', function (S) { dmg(S, 'enemy', 8, 'player'); S.player.energy += 1; });
  def('halo', 'Halo', 'sun', 1, 'Gain 6 Block. Gain 1 Strength.', function (S) { gainBlock(S, 'player', 6); S.player.strength += 1; });
  def('zenith', 'Zenith', 'sun', 3, 'Deal 13 damage. Heal 3 HP.', function (S) { dmg(S, 'enemy', 13, 'player'); heal(S, 'player', 3); });
  def('gleam', 'Gleam', 'sun', 0, 'Deal 2 damage. Draw 1 card.', function (S) { dmg(S, 'enemy', 2, 'player'); drawCards(S, 1); });
  def('cleanse', 'Cleanse', 'sun', 1, 'Remove all your Burn. Deal 5 damage.', function (S) { S.player.burn = 0; dmg(S, 'enemy', 5, 'player'); });
  def('crowns_wrath', "Crown's Wrath", 'sun', 3, 'Deal 18 damage.', function (S) { dmg(S, 'enemy', 18, 'player'); });

  // ---- Curse (grey): junk the Tide Witch plants in your deck ----
  def('drowned_doubt', 'Drowned Doubt', 'curse', 1, 'It weighs on you. No effect.', function (S) { /* nothing */ });

  var ALL_CARD_IDS = Object.keys(CARDS);
  var DRAFT_POOL = ALL_CARD_IDS.filter(function (id) { return CARDS[id].suit !== 'curse'; });

  // ---------- bosses ----------
  // Each boss has a looping intent pattern. intent = { kind, value, text }
  // kinds: attack, block, buff, curse, heal, attack_burn
  var BOSSES = [
    {
      name: 'Drowned Knight', title: 'Act I — Guardian of the Gate',
      maxHp: 60, color: '#7fb2d9',
      pattern: [
        { kind: 'attack', value: 8, text: 'Attacks for 8' },
        { kind: 'block', value: 6, text: 'Raises 6 Block' },
        { kind: 'attack', value: 11, text: 'Attacks for 11' },
        { kind: 'buff', value: 2, text: 'Sharpens (+2 Strength)' },
      ],
    },
    {
      name: 'Tide Witch', title: 'Act II — Weaver of Doubt',
      maxHp: 85, color: '#b678ff',
      pattern: [
        { kind: 'curse', value: 6, text: 'Curses you: plants Doubt, deals 6' },
        { kind: 'attack', value: 10, text: 'Attacks for 10' },
        { kind: 'heal', value: 12, text: 'Mends herself (+12 HP)' },
        { kind: 'attack_burn', value: 8, text: 'Attacks for 8, applies 2 Burn' },
      ],
    },
    {
      name: 'Sunken King', title: 'Act III — The Drowned Crown',
      maxHp: 115, color: '#ffc53d',
      pattern: [
        { kind: 'attack', value: 12, text: 'Attacks for 12' },
        { kind: 'block', value: 10, text: 'Raises 10 Block, +1 Strength' },
        { kind: 'attack', value: 17, text: 'Attacks for 17' },
        { kind: 'buff', value: 3, text: 'Rages (+3 Strength)' },
      ],
      enrageAt: 0.5, // below 50% HP: +3 Strength once, attacks hit harder
    },
  ];

  // ---------- run state ----------
  function newRun(rnd) {
    const starter = ['splash', 'splash', 'floodwall', 'floodwall', 'spark', 'spark',
      'vine_whip', 'vine_whip', 'sunbeam', 'sunbeam', 'bloom', 'focus'];
    const S = {
      screen: 'title', // title | combat | draft | win | lose
      act: 0, // 0..2 index into BOSSES
      turn: 0,
      player: {
        hp: 40, maxHp: 40, energy: 3, maxEnergy: 3,
        block: 0, strength: 0, thorns: 0, burn: 0, weak: 0,
      },
      enemy: null,
      deck: starter.slice(),
      drawPile: [], discardPile: [], hand: [],
      draftChoices: [],
      log: [],
      lastDamage: null,
      stats: { cardsPlayed: 0, damageDealt: 0, bossesBeaten: 0, turnsTaken: 0 },
      enraged: false,
      rnd: rnd || Math.random,
    };
    return S;
  }

  function startAct(S) {
    const boss = BOSSES[S.act];
    S.enemy = {
      name: boss.name, title: boss.title, color: boss.color,
      hp: boss.maxHp, maxHp: boss.maxHp, block: 0,
      strength: 0, thorns: 0, burn: 0, weak: 0,
      patternIndex: 0, intent: boss.pattern[0],
    };
    S.enraged = false;
    S.log = [];
    S.drawPile = shuffle(S.deck.slice(), S.rnd);
    S.discardPile = [];
    S.hand = [];
    S.turn = 1;
    S.screen = 'combat';
    startPlayerTurn(S);
  }

  function startPlayerTurn(S) {
    S.player.block = 0;
    S.player.energy = S.player.maxEnergy;
    // burn ticks on the player at the start of their turn
    if (S.player.burn > 0) {
      hurtPlayer(S, S.player.burn);
      S.player.burn = Math.max(0, S.player.burn - 1);
    }
    if (S.player.weak > 0) S.player.weak -= 1;
    drawCards(S, 5);
  }

  function canPlay(S, handIndex) {
    if (S.screen !== 'combat') return false;
    const card = CARDS[S.hand[handIndex]];
    if (!card) return false;
    return S.player.energy >= card.cost;
  }

  function playCard(S, handIndex) {
    if (!canPlay(S, handIndex)) return false;
    const id = S.hand[handIndex];
    const card = CARDS[id];
    S.player.energy -= card.cost;
    S.hand.splice(handIndex, 1);
    S.discardPile.push(id);
    const hpBefore = S.enemy.hp;
    card.play(S);
    S.stats.cardsPlayed += 1;
    S.stats.damageDealt += Math.max(0, hpBefore - S.enemy.hp);
    S.log.push(card.name);
    if (S.log.length > 6) S.log.shift();
    if (S.enemy.hp <= 0) { bossDefeated(S); return true; }
    return true;
  }

  function bossDefeated(S) {
    S.stats.bossesBeaten += 1;
    S.hand = [];
    if (S.act >= 2) {
      S.screen = 'win';
      return;
    }
    // rewards: heal, +1 max energy, draft 1 of 3
    heal(S, 'player', 8);
    S.player.maxEnergy += 1;
    S.player.block = 0; S.player.burn = 0; S.player.weak = 0;
    S.player.thorns = 0; S.player.strength = 0;
    S.draftChoices = pickN(DRAFT_POOL, 3, S.rnd);
    S.screen = 'draft';
  }

  function chooseDraft(S, choiceIndex) {
    if (S.screen !== 'draft') return false;
    const id = S.draftChoices[choiceIndex];
    if (!id) return false;
    S.deck.push(id);
    S.act += 1;
    startAct(S);
    return true;
  }

  function endPlayerTurn(S) {
    if (S.screen !== 'combat') return false;
    // discard hand
    while (S.hand.length > 0) S.discardPile.push(S.hand.pop());
    S.stats.turnsTaken += 1;
    enemyTurn(S);
    if (S.screen !== 'combat') return true; // player may have died
    S.turn += 1;
    startPlayerTurn(S);
    if (S.player.hp <= 0) { S.screen = 'lose'; }
    return true;
  }

  function enemyTurn(S) {
    const boss = BOSSES[S.act];
    const e = S.enemy;
    // enrage check for the Sunken King
    if (boss.enrageAt && !S.enraged && e.hp <= e.maxHp * boss.enrageAt) {
      S.enraged = true;
      e.strength += 3;
    }
    e.block = 0;
    // The deep grows impatient: every 3rd turn the boss gains +1 Strength.
    if (S.turn % 3 === 0) e.strength += 1;
    // burn ticks on the enemy at the start of its turn
    if (e.burn > 0) {
      hurtEnemy(S, e.burn);
      e.burn = Math.max(0, e.burn - 1);
      if (e.hp <= 0) { bossDefeated(S); return; }
    }
    if (e.weak > 0) e.weak -= 1;
    const intent = e.intent;
    if (intent.kind === 'attack') {
      dmg(S, 'player', intent.value, 'enemy');
    } else if (intent.kind === 'attack_burn') {
      dmg(S, 'player', intent.value, 'enemy');
      S.player.burn += 2;
    } else if (intent.kind === 'block') {
      gainBlock(S, 'enemy', intent.value);
      if (S.act === 2) e.strength += 1;
    } else if (intent.kind === 'buff') {
      e.strength += intent.value;
    } else if (intent.kind === 'heal') {
      heal(S, 'enemy', intent.value);
    } else if (intent.kind === 'curse') {
      dmg(S, 'player', intent.value, 'enemy');
      S.discardPile.push('drowned_doubt');
    }
    if (S.player.hp <= 0) { S.screen = 'lose'; return; }
    // advance to the next intent in the pattern
    e.patternIndex = (e.patternIndex + 1) % boss.pattern.length;
    e.intent = boss.pattern[e.patternIndex];
  }

  function isRunOver(S) { return S.screen === 'win' || S.screen === 'lose'; }

  // ---------- exports ----------
  var api = {
    SUITS: SUITS, CARDS: CARDS, BOSSES: BOSSES,
    ALL_CARD_IDS: ALL_CARD_IDS, DRAFT_POOL: DRAFT_POOL,
    newRun: newRun, startAct: startAct, playCard: playCard,
    canPlay: canPlay, endPlayerTurn: endPlayerTurn,
    chooseDraft: chooseDraft, isRunOver: isRunOver,
    drawCards: drawCards, shuffle: shuffle, clamp: clamp,
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Tidebound = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
