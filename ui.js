// Tidebound — canvas UI. Requires engine.js (window.Tidebound).
// Browser only: guarded so Node can still --check the file.
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var E = window.Tidebound;
  var W = 1280, H = 720;
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var DPR = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * DPR; canvas.height = H * DPR;
  // CSS (width: min(1280px, 96vw, 92vh * 16/9); height: auto) keeps the
  // 16:9 aspect at any viewport; do not set inline pixel sizes here.
  ctx.scale(DPR, DPR);

  var S = E.newRun();
  var mouse = { x: -1, y: -1 };
  var hoverCard = -1;
  var floaters = [];   // {x,y,text,color,life,max}
  var particles = [];  // ambient bubbles {x,y,r,vy,alpha}
  var shake = 0;
  var playAnim = null; // {card, t, fromX, fromY}
  var muted = false;
  var time = 0;
  var prevScreen = null;

  for (let i = 0; i < 40; i++) {
    particles.push({ x: Math.random() * W, y: Math.random() * H, r: 1 + Math.random() * 3, vy: 0.2 + Math.random() * 0.5, a: 0.08 + Math.random() * 0.2 });
  }

  // ---------- audio ----------
  var AC = null;
  function audio() {
    if (muted) return null;
    try {
      if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === 'suspended') AC.resume();
      return AC;
    } catch (e) { return null; }
  }
  function tone(freq, dur, type, vol, slideTo) {
    var ac = audio(); if (!ac) return;
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, ac.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.12, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + dur);
  }
  function sfx(name) {
    if (name === 'play') tone(520, 0.12, 'triangle', 0.10, 780);
    else if (name === 'hit') tone(140, 0.18, 'sawtooth', 0.14, 60);
    else if (name === 'block') tone(320, 0.1, 'square', 0.06, 240);
    else if (name === 'heal') { tone(660, 0.15, 'sine', 0.08); setTimeout(function () { tone(880, 0.2, 'sine', 0.08); }, 90); }
    else if (name === 'burn') tone(220, 0.2, 'sawtooth', 0.08, 110);
    else if (name === 'win') [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { tone(f, 0.25, 'triangle', 0.12); }, i * 120); });
    else if (name === 'lose') [330, 262, 196].forEach(function (f, i) { setTimeout(function () { tone(f, 0.3, 'sawtooth', 0.09); }, i * 160); });
    else if (name === 'draft') { tone(440, 0.12, 'triangle', 0.1, 660); }
    else if (name === 'click') tone(700, 0.05, 'square', 0.05);
  }

  // ---------- drawing helpers ----------
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function text(str, x, y, size, color, align, bold) {
    ctx.fillStyle = color || '#fff';
    ctx.font = (bold ? 'bold ' : '') + size + 'px Georgia, serif';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  }
  function wrapText(str, x, y, maxW, size, color, lineH) {
    ctx.fillStyle = color; ctx.font = size + 'px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var words = str.split(' '), line = '', yy = y;
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, yy); line = words[i]; yy += lineH;
      } else line = test;
    }
    if (line) ctx.fillText(line, x, yy);
    return yy;
  }
  function suitShape(suit, x, y, s, color) {
    ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath();
    if (suit === 'tide') { // droplet
      ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x + s * 0.8, y + s * 0.2, x, y + s * 0.7);
      ctx.quadraticCurveTo(x - s * 0.8, y + s * 0.2, x, y - s);
      ctx.fill();
    } else if (suit === 'storm') { // bolt
      ctx.moveTo(x + s * 0.2, y - s); ctx.lineTo(x - s * 0.5, y + s * 0.1);
      ctx.lineTo(x - s * 0.05, y + s * 0.1); ctx.lineTo(x - s * 0.2, y + s);
      ctx.lineTo(x + s * 0.5, y - s * 0.1); ctx.lineTo(x + s * 0.05, y - s * 0.1);
      ctx.closePath(); ctx.fill();
    } else if (suit === 'kelp') { // leaf
      ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x + s, y, x, y + s);
      ctx.quadraticCurveTo(x - s, y, x, y - s); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.moveTo(x, y - s * 0.8); ctx.lineTo(x, y + s * 0.8); ctx.stroke();
    } else if (suit === 'sun') { // sun disc + rays
      ctx.arc(x, y, s * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      for (var i = 0; i < 8; i++) {
        var a = i * Math.PI / 4;
        ctx.moveTo(x + Math.cos(a) * s * 0.7, y + Math.sin(a) * s * 0.7);
        ctx.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
      }
      ctx.stroke();
    } else { // curse: hollow circle
      ctx.arc(x, y, s * 0.6, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, s * 0.25, 0, Math.PI * 2); ctx.fill();
    }
  }
  function bar(x, y, w, h, frac, fill, bg) {
    rr(x, y, w, h, h / 2); ctx.fillStyle = bg || 'rgba(0,0,0,0.55)'; ctx.fill();
    if (frac > 0) {
      rr(x, y, Math.max(h, w * Math.min(1, frac)), h, h / 2);
      ctx.fillStyle = fill; ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.stroke();
  }
  function addFloater(x, y, txt, color) {
    floaters.push({ x: x, y: y, text: txt, color: color, life: 1 });
  }

  // ---------- card rendering ----------
  var CARD_W = 150, CARD_H = 210;
  function cardLayout() {
    var n = S.hand.length, cx = W / 2;
    var positions = [];
    for (var i = 0; i < n; i++) {
      var off = (i - (n - 1) / 2);
      var x = cx + off * 158 - CARD_W / 2;
      var y = H - CARD_H - 26 + Math.abs(off) * 8;
      positions.push({ x: x, y: y, rot: off * 0.03 });
    }
    return positions;
  }
  function drawCard(id, x, y, scale, hovered) {
    var c = E.CARDS[id];
    var suit = E.SUITS[c.suit];
    var w = CARD_W * scale, h = CARD_H * scale;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    if (hovered) ctx.translate(0, -18 * scale);
    ctx.scale(scale, scale);
    ctx.translate(-CARD_W / 2, -CARD_H / 2);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    rr(4, 6, CARD_W, CARD_H, 12); ctx.fill();
    // body
    rr(0, 0, CARD_W, CARD_H, 12);
    ctx.fillStyle = '#f7f2e7'; ctx.fill();
    ctx.strokeStyle = suit.dark; ctx.lineWidth = 3; ctx.stroke();
    // header band
    rr(0, 0, CARD_W, 52, 12);
    ctx.fillStyle = suit.color; ctx.fill();
    ctx.fillStyle = suit.color; ctx.fillRect(0, 30, CARD_W, 22);
    // cost gem
    ctx.beginPath(); ctx.arc(24, 24, 16, 0, Math.PI * 2);
    ctx.fillStyle = '#1d2b53'; ctx.fill();
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2; ctx.stroke();
    text(String(c.cost), 24, 25, 20, '#ffd166', 'center', true);
    // name
    text(c.name, 82, 26, c.name.length > 14 ? 13 : 15, '#fff', 'center', true);
    // suit icon
    suitShape(c.suit, CARD_W / 2, 92, 22, suit.color);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(14, 122); ctx.lineTo(CARD_W - 14, 122); ctx.stroke();
    // text
    wrapText(c.text, CARD_W / 2, 142, CARD_W - 22, 13, '#2b2b2b', 17);
    // suit label
    text(suit.name, CARD_W / 2, CARD_H - 14, 11, '#8a8a8a', 'center', true);
    ctx.restore();
  }
  function drawHand() {
    var pos = cardLayout();
    for (var i = 0; i < S.hand.length; i++) {
      var affordable = S.player.energy >= E.CARDS[S.hand[i]].cost;
      ctx.save();
      if (!affordable) ctx.globalAlpha = 0.55;
      drawCard(S.hand[i], pos[i].x, pos[i].y, hoverCard === i ? 1.12 : 1, hoverCard === i);
      ctx.restore();
    }
  }

  // ---------- enemy ----------
  function drawEnemy() {
    var e = S.enemy;
    if (!e) return;
    var cx = W / 2, cy = 190;
    var bob = Math.sin(time * 0.0012) * 6;
    // glow
    var g = ctx.createRadialGradient(cx, cy + bob, 10, cx, cy + bob, 150);
    g.addColorStop(0, e.color + '44'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy + bob, 150, 0, Math.PI * 2); ctx.fill();
    // body
    ctx.fillStyle = e.color;
    ctx.beginPath(); ctx.arc(cx, cy + bob, 62, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3; ctx.stroke();
    // face: eyes
    ctx.fillStyle = '#1d2b53';
    ctx.beginPath(); ctx.arc(cx - 22, cy - 8 + bob, 8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 22, cy - 8 + bob, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx - 20, cy - 10 + bob, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 24, cy - 10 + bob, 3, 0, Math.PI * 2); ctx.fill();
    // crown / hat per boss
    if (S.act === 0) { // knight helm
      ctx.fillStyle = '#c9d4e0';
      rr(cx - 40, cy - 62 + bob, 80, 22, 6); ctx.fill();
      ctx.fillRect(cx - 6, cy - 84 + bob, 12, 24);
    } else if (S.act === 1) { // witch hat
      ctx.fillStyle = '#5b2d8e';
      ctx.beginPath(); ctx.moveTo(cx - 48, cy - 52 + bob); ctx.lineTo(cx, cy - 118 + bob); ctx.lineTo(cx + 48, cy - 52 + bob); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7a3fb0'; ctx.fillRect(cx - 58, cy - 56 + bob, 116, 10);
    } else { // king crown
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.moveTo(cx - 46, cy - 50 + bob); ctx.lineTo(cx - 46, cy - 82 + bob);
      ctx.lineTo(cx - 22, cy - 62 + bob); ctx.lineTo(cx, cy - 88 + bob);
      ctx.lineTo(cx + 22, cy - 62 + bob); ctx.lineTo(cx + 46, cy - 82 + bob);
      ctx.lineTo(cx + 46, cy - 50 + bob); ctx.closePath(); ctx.fill();
    }
    // name + title
    text(e.name, cx, cy + 92, 26, '#fff', 'center', true);
    text(e.title, cx, cy + 116, 13, 'rgba(255,255,255,0.7)');
    // HP bar
    bar(cx - 140, cy + 132, 280, 18, e.hp / e.maxHp, '#e63946');
    text(Math.max(0, e.hp) + ' / ' + e.maxHp, cx, cy + 141, 12, '#fff', 'center', true);
    // status line
    var st = [];
    if (e.block > 0) st.push('Block ' + e.block);
    if (e.strength > 0) st.push('Str +' + e.strength);
    if (e.burn > 0) st.push('Burn ' + e.burn);
    if (e.weak > 0) st.push('Weak ' + e.weak);
    if (S.enraged) st.push('ENRAGED');
    if (st.length) text(st.join('   •   '), cx, cy + 162, 13, '#ffd166', 'center', true);
    // intent bubble
    var it = e.intent;
    ctx.fillStyle = 'rgba(10,18,32,0.85)';
    rr(cx - 170, cy - 178, 340, 34, 10); ctx.fill();
    ctx.strokeStyle = e.color; ctx.lineWidth = 2; ctx.stroke();
    var icon = it.kind === 'attack' || it.kind === 'attack_burn' ? '[ATK]' :
      it.kind === 'block' ? '[DEF]' : it.kind === 'heal' ? '[HEAL]' :
      it.kind === 'curse' ? '[CURSE]' : '[BUFF]';
    text(icon + '  ' + it.text, cx, cy - 160, 15, '#fff', 'center', true);
  }

  // ---------- player panel ----------
  function drawPlayer() {
    var p = S.player;
    var x = 36, y = H - 300;
    // panel
    ctx.fillStyle = 'rgba(10,18,32,0.75)';
    rr(x, y, 250, 150, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.stroke();
    text('YOU — Tidecaller', x + 125, y + 22, 16, '#fff', 'center', true);
    bar(x + 18, y + 42, 214, 16, p.hp / p.maxHp, '#3ddc97');
    text(Math.max(0, p.hp) + ' / ' + p.maxHp + ' HP', x + 125, y + 50, 12, '#fff', 'center', true);
    // energy orbs
    for (var i = 0; i < p.maxEnergy; i++) {
      ctx.beginPath(); ctx.arc(x + 34 + i * 30, y + 84, 12, 0, Math.PI * 2);
      ctx.fillStyle = i < p.energy ? '#38bdf8' : 'rgba(255,255,255,0.15)';
      ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    text(p.energy + ' / ' + p.maxEnergy + ' energy', x + 125, y + 108, 12, '#bae6fd', 'center', true);
    var st = [];
    if (p.block > 0) st.push('Block ' + p.block);
    if (p.strength > 0) st.push('Str +' + p.strength);
    if (p.thorns > 0) st.push('Thorns ' + p.thorns);
    if (p.burn > 0) st.push('Burn ' + p.burn);
    if (p.weak > 0) st.push('Weak ' + p.weak);
    text(st.length ? st.join('  •  ') : 'No statuses', x + 125, y + 130, 12, st.length ? '#ffd166' : 'rgba(255,255,255,0.5)', 'center', true);
    // piles
    text('Deck: ' + S.drawPile.length, 60, H - 24, 13, 'rgba(255,255,255,0.7)', 'left');
    text('Discard: ' + S.discardPile.length, 170, H - 24, 13, 'rgba(255,255,255,0.7)', 'left');
    text('Act ' + (S.act + 1) + ' / 3  •  Turn ' + S.turn, W - 36, 44, 13, 'rgba(255,255,255,0.7)', 'right');
  }

  function drawEndTurn() {
    var x = W - 190, y = H - 92, w = 160, h = 48;
    var hov = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
    ctx.fillStyle = hov ? '#f59e0b' : '#d97706';
    rr(x, y, w, h, 10); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    text('END TURN  ⏎', x + w / 2, y + h / 2 + 1, 17, '#fff', 'center', true);
    return { x: x, y: y, w: w, h: h };
  }

  // ---------- background ----------
  function drawBackground() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#06283f'); g.addColorStop(0.55, '#0a4a6b'); g.addColorStop(1, '#03121f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // light rays
    ctx.save(); ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#bfe9ff';
    for (var i = 0; i < 4; i++) {
      var rx = 180 + i * 300 + Math.sin(time * 0.0002 + i) * 30;
      ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx + 90, 0);
      ctx.lineTo(rx + 200, H); ctx.lineTo(rx + 40, H); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // bubbles
    particles.forEach(function (p) {
      p.y -= p.vy; if (p.y < -6) { p.y = H + 6; p.x = Math.random() * W; }
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(190,230,255,' + p.a + ')'; ctx.fill();
    });
    // seabed
    ctx.fillStyle = '#04202f';
    ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, H - 40);
    ctx.quadraticCurveTo(W * 0.3, H - 70, W * 0.6, H - 34);
    ctx.quadraticCurveTo(W * 0.85, H - 10, W, H - 44);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }

  // ---------- screens ----------
  function drawTitle() {
    text('TIDEBOUND', W / 2, 210, 84, '#bfe9ff', 'center', true);
    text('A roguelike deck-builder beneath the waves', W / 2, 268, 22, '#7dd3fc');
    text('Descend through the Sunken Court. Duel three guardians.', W / 2, 300, 17, 'rgba(255,255,255,0.8)');
    text('Draft new cards after every victory. Beware the deep — it grows stronger every 3 turns.', W / 2, 326, 17, 'rgba(255,255,255,0.8)');
    // suits legend
    var suits = ['tide', 'storm', 'kelp', 'sun'];
    suits.forEach(function (s, i) {
      var x = W / 2 - 210 + i * 140;
      suitShape(s, x, 400, 20, E.SUITS[s].color);
      text(E.SUITS[s].name, x, 436, 14, '#fff', 'center', true);
    });
    text('Click a card to play it  •  Keys 1-7 play cards  •  Space ends your turn  •  M mutes', W / 2, 500, 15, 'rgba(255,255,255,0.65)');
    var pulse = 0.75 + Math.sin(time * 0.004) * 0.25;
    ctx.globalAlpha = pulse;
    text('— CLICK TO BEGIN —', W / 2, 570, 24, '#ffd166', 'center', true);
    ctx.globalAlpha = 1;
  }

  function drawDraft() {
    text('VICTORY — CHOOSE A NEW CARD', W / 2, 120, 30, '#ffd166', 'center', true);
    text('Your deck grows. Pick one to keep, then face the next guardian.', W / 2, 158, 16, 'rgba(255,255,255,0.8)');
    S.draftChoices.forEach(function (id, i) {
      var x = W / 2 - 330 + i * 260;
      var hov = mouse.x >= x && mouse.x <= x + 150 && mouse.y >= 220 && mouse.y <= 430;
      drawCard(id, x, 220, hov ? 1.15 : 1, hov);
      if (hov) text('Click to take', x + 75, 460, 14, '#ffd166', 'center', true);
    });
    text('Deck size: ' + S.deck.length + ' cards', W / 2, 520, 15, 'rgba(255,255,255,0.7)');
  }

  function drawEndScreen(win) {
    ctx.fillStyle = 'rgba(3,10,18,0.85)'; ctx.fillRect(0, 0, W, H);
    if (win) {
      text('THE COURT IS YOURS', W / 2, 240, 56, '#ffd166', 'center', true);
      text('You conquered all three guardians of the Sunken Court.', W / 2, 300, 20, '#fff');
    } else {
      text('THE DEEP CLAIMS YOU', W / 2, 240, 56, '#e63946', 'center', true);
      text('The ' + (S.enemy ? S.enemy.name : 'deep') + ' drags you under…', W / 2, 300, 20, '#fff');
    }
    text('Bosses beaten: ' + S.stats.bossesBeaten + ' / 3    •    Cards played: ' + S.stats.cardsPlayed +
      '    •    Damage dealt: ' + S.stats.damageDealt + '    •    Turns: ' + S.stats.turnsTaken,
      W / 2, 360, 17, 'rgba(255,255,255,0.85)');
    text('Deck size: ' + S.deck.length + ' cards', W / 2, 392, 15, 'rgba(255,255,255,0.65)');
    var pulse = 0.75 + Math.sin(time * 0.004) * 0.25;
    ctx.globalAlpha = pulse;
    text('Press R or click to play again', W / 2, 470, 22, '#fff', 'center', true);
    ctx.globalAlpha = 1;
  }

  // ---------- floaters & shake ----------
  function drawFloaters() {
    for (var i = floaters.length - 1; i >= 0; i--) {
      var f = floaters[i];
      f.life -= 0.016; f.y -= 1.1;
      if (f.life <= 0) { floaters.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, f.life);
      text(f.text, f.x, f.y, 26, f.color, 'center', true);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- play resolution (with UI feedback) ----------
  function tryPlay(i) {
    if (S.screen !== 'combat') return;
    if (!E.canPlay(S, i)) { sfx('click'); return; }
    var id = S.hand[i];
    var card = E.CARDS[id];
    var pos = cardLayout()[i];
    playAnim = { id: id, t: 0, fromX: pos.x, fromY: pos.y };
    var hpBefore = S.enemy.hp, blockBefore = S.enemy.block;
    E.playCard(S, i);
    sfx('play');
    var dealt = Math.max(0, hpBefore - S.enemy.hp);
    var blocked = Math.max(0, blockBefore - S.enemy.block);
    if (dealt > 0) {
      addFloater(W / 2, 300, '-' + dealt, '#ff6b6b');
      shake = Math.min(10, 4 + dealt / 4);
      sfx('hit');
    } else if (blocked > 0) {
      addFloater(W / 2, 300, 'Blocked ' + blocked, '#9db4c8');
      sfx('block');
    } else if (/Heal/i.test(card.text)) {
      addFloater(300, H - 320, '+' + card.text.match(/\d+/) + ' HP', '#3ddc97');
      sfx('heal');
    }
    if (S.screen === 'win') sfx('win');
    if (S.screen === 'lose') sfx('lose');
  }

  function tryEndTurn() {
    if (S.screen !== 'combat') return;
    var hpBefore = S.player.hp;
    E.endPlayerTurn(S);
    if (S.player.hp < hpBefore) {
      addFloater(300, H - 320, '-' + (hpBefore - S.player.hp), '#ff6b6b');
      shake = 8; sfx('hit');
    }
    if (S.screen === 'win') sfx('win');
    if (S.screen === 'lose') sfx('lose');
  }

  // ---------- input ----------
  function handHit(mx, my) {
    var pos = cardLayout();
    for (var i = pos.length - 1; i >= 0; i--) {
      if (mx >= pos[i].x && mx <= pos[i].x + CARD_W && my >= pos[i].y - 18 && my <= pos[i].y + CARD_H) return i;
    }
    return -1;
  }
  canvas.addEventListener('mousemove', function (ev) {
    var r = canvas.getBoundingClientRect();
    mouse.x = (ev.clientX - r.left) * (W / r.width);
    mouse.y = (ev.clientY - r.top) * (H / r.height);
    if (S.screen === 'combat') hoverCard = handHit(mouse.x, mouse.y);
  });
  canvas.addEventListener('click', function (ev) {
    // Compute the position from the event itself: synthetic clicks (and
    // touch taps) do not always fire a mousemove first.
    var r = canvas.getBoundingClientRect();
    mouse.x = (ev.clientX - r.left) * (W / r.width);
    mouse.y = (ev.clientY - r.top) * (H / r.height);
    if (S.screen === 'combat') hoverCard = handHit(mouse.x, mouse.y);
    if (S.screen === 'title') {
      sfx('click');
      E.startAct(S);
      return;
    }
    if (S.screen === 'win' || S.screen === 'lose') {
      restart();
      return;
    }
    if (S.screen === 'draft') {
      S.draftChoices.forEach(function (id, i) {
        var x = W / 2 - 330 + i * 260;
        if (mouse.x >= x && mouse.x <= x + 150 && mouse.y >= 220 && mouse.y <= 430) {
          sfx('draft');
          E.chooseDraft(S, i);
        }
      });
      return;
    }
    if (S.screen === 'combat') {
      var btn = drawEndTurn._last;
      if (btn && mouse.x >= btn.x && mouse.x <= btn.x + btn.w && mouse.y >= btn.y && mouse.y <= btn.y + btn.h) {
        tryEndTurn(); return;
      }
      var i = handHit(mouse.x, mouse.y);
      if (i >= 0) tryPlay(i);
    }
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'm' || ev.key === 'M') { muted = !muted; return; }
    if (S.screen === 'title' && (ev.key === 'Enter' || ev.key === ' ')) { E.startAct(S); return; }
    if ((S.screen === 'win' || S.screen === 'lose') && (ev.key === 'r' || ev.key === 'R' || ev.key === 'Enter')) { restart(); return; }
    if (S.screen === 'combat') {
      if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); tryEndTurn(); return; }
      var n = parseInt(ev.key, 10);
      if (n >= 1 && n <= S.hand.length) tryPlay(n - 1);
      return;
    }
    if (S.screen === 'draft') {
      var m = parseInt(ev.key, 10);
      if (m >= 1 && m <= S.draftChoices.length) { sfx('draft'); E.chooseDraft(S, m - 1); }
    }
  });

  // debug hook for automated testing (harmless in play)
  window.__tidebound = function () {
    return {
      screen: S.screen, hand: S.hand.slice(), energy: S.player.energy,
      enemyHp: S.enemy ? S.enemy.hp : null,
      enemyIntent: S.enemy ? S.enemy.intent.kind : null,
      playerHp: S.player.hp, turn: S.turn, act: S.act,
      draft: S.draftChoices.slice(),
    };
  };

  function restart() {
    S = E.newRun();
    floaters = []; playAnim = null; shake = 0;
    sfx('click');
  }

  // ---------- main loop ----------
  function frame(ts) {
    time = ts || 0;
    // fresh screen: drop stale combat effects
    if (S.screen !== prevScreen) { floaters = []; playAnim = null; prevScreen = S.screen; }
    ctx.save();
    if (shake > 0.3) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      shake *= 0.88;
    }
    drawBackground();
    if (S.screen === 'title') {
      drawTitle();
    } else if (S.screen === 'draft') {
      drawDraft();
    } else if (S.screen === 'win') {
      drawEndScreen(true);
    } else if (S.screen === 'lose') {
      drawEndScreen(false);
    } else {
      drawEnemy();
      drawPlayer();
      var btn = drawEndTurn();
      drawEndTurn._last = btn;
      drawHand();
      // play animation: card flies to the enemy
      if (playAnim) {
        playAnim.t += 0.08;
        var t = Math.min(1, playAnim.t);
        var px = playAnim.fromX + (W / 2 - 75 - playAnim.fromX) * t;
        var py = playAnim.fromY + (120 - playAnim.fromY) * t;
        ctx.save(); ctx.globalAlpha = 1 - t * 0.6;
        drawCard(playAnim.id, px, py, 1, false);
        ctx.restore();
        if (t >= 1) playAnim = null;
      }
      drawFloaters();
      if (S.log.length) {
        text('Last played: ' + S.log[S.log.length - 1], W / 2, H - 252, 13, 'rgba(255,255,255,0.55)');
      }
      text('M: mute', W - 70, 22, 12, 'rgba(255,255,255,0.5)', 'center');
    }
    ctx.restore();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
