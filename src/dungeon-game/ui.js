
/* 渲染与交互层：只读 state，只调用 Game 的接口 */
(function () {
  'use strict';

  /* 出错时在页面顶部显示，别让玩家对着白屏猜 */
  function showError(msg) {
    var bar = document.getElementById('err-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'err-bar';
      document.body.appendChild(bar);
    }
    bar.textContent = '脚本出错：' + msg;
    bar.style.display = 'block';
  }

  function safe(fn) {
    return function (e) {
      try { return fn(e); }
      catch (err) { showError((err && err.message) || String(err)); }
    };
  }

  window.addEventListener('error', function (e) {
    var where = (e.filename || '').split('/').pop();
    showError((e.message || e.error) + (where ? '  @' + where + ':' + e.lineno : ''));
  });

  var G = window.Game;
  var HEROES = window.HEROES || [];
  var CARD_ART = window.CARD_ART || {};
  var TEAM_SIZE = G.CONFIG.teamSize;

  var el = {
    screenTitle: document.getElementById('screen-title'),
    screenSelect: document.getElementById('screen-select'),
    modeSolo: document.getElementById('btn-mode-solo'),
    modePvp: document.getElementById('btn-mode-pvp'),
    screenLobby: document.getElementById('screen-lobby'),
    lobbyStatus: document.getElementById('lobby-status'),
    lobbyRoom: document.getElementById('lobby-room'),
    lobbyCode: document.getElementById('lobby-code'),
    lobbySeats: document.getElementById('lobby-seats'),
    roomInput: document.getElementById('room-input'),
    btnCreateRoom: document.getElementById('btn-create-room'),
    btnJoinRoom: document.getElementById('btn-join-room'),
    btnCopyRoom: document.getElementById('btn-copy-room'),
    btnLobbyBack: document.getElementById('btn-lobby-back'),
    serverInput: document.getElementById('server-input'),
    btnSaveServer: document.getElementById('btn-save-server'),
    titleHint: document.getElementById('title-hint'),
    titleBest: document.getElementById('title-best'),
    titleAudio: document.getElementById('title-audio'),
    btnTitle: document.getElementById('btn-title'),
    screenBattle: document.getElementById('screen-battle'),
    slots: document.getElementById('slots'),
    selectHint: document.getElementById('select-hint'),
    stageLabel: document.getElementById('stage-label'),
    prophecyWarning: document.getElementById('prophecy-warning'),
    rewardList: document.getElementById('reward-list'),
    overlayActions: document.getElementById('overlay-actions'),
    itemBandage: document.getElementById('item-bandage'),
    itemAntidote: document.getElementById('item-antidote'),
    countBandage: document.getElementById('count-bandage'),
    countAntidote: document.getElementById('count-antidote'),
    picker: document.getElementById('picker'),
    start: document.getElementById('btn-start'),
    random: document.getElementById('btn-random'),
    auto: document.getElementById('btn-auto'),
    clear: document.getElementById('btn-clear'),
    enemyRow: document.getElementById('enemy-row'),
    playerRow: document.getElementById('player-row'),
    roundLabel: document.getElementById('round-label'),
    turnLabel: document.getElementById('turn-label'),
    actorLine: document.getElementById('actor-line'),
    skills: document.getElementById('skills'),
    skillsTitle: document.getElementById('skills-title'),
    hint: document.getElementById('hint'),
    cancel: document.getElementById('btn-cancel'),
    aoe: document.getElementById('btn-aoe'),
    skip: document.getElementById('btn-skip'),
    forward: document.getElementById('btn-forward'),
    back: document.getElementById('btn-back'),
    moveBack: document.getElementById('btn-move-back'),
    lastStand: document.getElementById('last-stand'),
    deathBanner: document.getElementById('death-banner'),
    dbText: document.getElementById('db-text'),
    dbSub: document.getElementById('db-sub'),
    skillBanner: document.getElementById('skill-banner'),
    sbActor: document.getElementById('sb-actor'),
    sbName: document.getElementById('sb-name'),
    areaBanner: document.getElementById('area-banner'),
    abRegion: document.getElementById('ab-region'),
    abSub: document.getElementById('ab-sub'),
    info: document.getElementById('info-overlay'),
    infoName: document.getElementById('info-name'),
    infoArt: document.getElementById('info-art'),
    infoMeta: document.getElementById('info-meta'),
    infoStats: document.getElementById('info-stats'),
    infoSkills: document.getElementById('info-skills'),
    infoLore: document.getElementById('info-lore'),
    infoAction: document.getElementById('info-action'),
    infoClose: document.getElementById('info-close'),
    log: document.getElementById('log'),
    restart: document.getElementById('btn-restart'),
    reselect: document.getElementById('btn-reselect'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlay-title'),
    overlaySub: document.getElementById('overlay-sub'),
    again: document.getElementById('btn-again'),
    back: document.getElementById('btn-back')
  };

  var slots = [null, null, null, null];
  var state = null;
  var teams = null;
  /* ===== 节奏参数：想调快调慢改这里 ===== */
  var TIMING = {
    holdMin: 920,      /* 行动结算后、进入下一个人之前的停顿 */
    holdMax: 2700,     /* 特效很多时最多等这么久 */
    effectGap: 210,    /* 多个伤害飘字之间的间隔 */
    effectStart: 340,  /* 出手动画之后多久开始飘字 */
    areaHold: 1950,    /* 进入新地点：地点提示停留 */
    dotWord: 220,      /* 流血/腐蚀：先出状态字样 */
    dotNum: 600,       /* 状态字样之后多久才跳扣血数字 */
    turnMinor: 1640,   /* 同方换人：横幅停留 */
    turnMajor: 2300,   /* 换边：大横幅停留 */
    aiStep: 1700,      /* 敌方每步之间的思考停顿 */
    endDelay: 2500     /* 战斗结束到结算面板 */
  };

  var CONFIG_REST = 0.4;   /* 过关小憩回复比例 */

  var GAME_SPEEDS = [1, 1.5, 2, 3];
  var speed = 1;
  var SPEED_KEY = 'dd_web_speed';
  function scaled(ms) { return Math.round(ms / speed); }

  var endTimer = null;
  var endedState = null;
  var aiTimer = null;
  var busy = false;        /* 回合切换的停顿中，禁止操作 */
  var aiStuckUid = null;   /* AI 卡住检测 */
  var aiStuck = 0;
  var bannerTimer = null;
  var lastSide = null;     /* 上一次行动的是哪一方，用来判断要不要放大横幅 */
  var mode = 'idle';       /* idle | target */
  var pending = null;      /* 待选目标的技能 id */
  var pendingItem = null;  /* 待选目标的道具 */
  var pendingAoe = false;  /* 当前待选的是群体技能 */
  var validSet = null;     /* uid -> true */
  var drag = null;
  var lastPointerTs = 0;   /* 用来判断点击是否已被指针事件处理过 */
  var lastPointerEl = null;

  /* ================= 选人 ================= */

  function heroOf(id) {
    for (var i = 0; i < HEROES.length; i++) if (HEROES[i].id === id) return HEROES[i];
    return null;
  }

  function isFull() { return slots.indexOf(null) < 0; }
  function firstEmpty() {
    for (var i = 0; i < slots.length; i++) if (!slots[i]) return i;
    return -1;
  }

  function placeAt(id, index) {
    var from = slots.indexOf(id);
    if (from === index) return;
    var displaced = slots[index];
    slots[index] = id;
    if (from >= 0) slots[from] = displaced || null;
  }

  /* ---------- 渲染 ---------- */

  function makeArtwork(id, name, extraClass, eager) {
    if (!CARD_ART[id]) return null;
    var img = document.createElement('img');
    img.className = 'card-art' + (extraClass ? ' ' + extraClass : '');
    img.src = CARD_ART[id];
    img.alt = name + '卡牌';
    img.draggable = false;
    img.setAttribute('draggable', 'false');
    img.loading = eager ? 'eager' : 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', function () {
      img.dataset.failed = '1';
      img.classList.add('hidden');
      if (img.parentNode) img.parentNode.classList.remove('has-card-art');
    });
    return img;
  }

  function showInfoArtwork(id, name) {
    if (!el.infoArt) return;
    el.infoArt.innerHTML = '';
    var img = makeArtwork(id, name, 'info-card-art', true);
    if (img) {
      el.infoArt.appendChild(img);
      var note = document.createElement('p');
      note.className = 'art-note';
      note.textContent = '当前生命和强化数值以实时血条、属性面板为准。';
      el.infoArt.appendChild(note);
    }
    el.infoArt.classList.toggle('hidden', !img);
    if (el.infoArt.parentNode) el.infoArt.parentNode.classList.toggle('has-art', !!img);
  }

  function updateBattleArtwork(card, unit) {
    if (card._artId !== unit.id) {
      if (card._art && card._art.parentNode) card._art.parentNode.removeChild(card._art);
      card._art = makeArtwork(unit.id, unit.name, '', true);
      card._artId = unit.id;
      if (card._art) card.insertBefore(card._art, card.firstChild);
    }
    return !!card._art && card._art.dataset.failed !== '1';
  }

  function renderSlots() {
    el.slots.innerHTML = '';
    for (var i = 0; i < TEAM_SIZE; i++) {
      var id = slots[i];
      var hero = id ? heroOf(id) : null;

      var slot = document.createElement('div');
      slot.className = 'slot' + (hero ? ' filled' : '');
      slot.dataset.slot = String(i);

      var idx = document.createElement('span');
      idx.className = 'slot-idx';
      idx.textContent = String(i + 1);
      slot.appendChild(idx);

      if (!hero) {
        var ph = document.createElement('span');
        ph.className = 'slot-empty';
        ph.textContent = '点卡牌加入';
        slot.appendChild(ph);
      } else {
        var card = document.createElement('div');
        card.className = 'slot-card';
        card.dataset.id = hero.id;
        card.dataset.slot = String(i);
        var art = makeArtwork(hero.id, hero.name, '', true);
        if (art) { card.classList.add('has-card-art'); card.appendChild(art); }

        var nm = document.createElement('div');
        nm.className = 'sc-name';
        nm.textContent = hero.name;

        var meta = document.createElement('div');
        meta.className = 'sc-meta';
        meta.textContent = hero.role + ' · 血 ' + hero.hp;

        card.appendChild(nm);
        card.appendChild(meta);
        card.addEventListener('pointerdown', (function (hid, idx) {
          return function (e) { onPointerDown(e, hid, idx); };
        })(hero.id, i));
        bindCardTouch(card, hero.id, i);
        card.addEventListener('click', (function (hid, idx) {
          return function (e) {
            if (Date.now() < suppressClickUntil) return;
            tapPlace(hid, idx, e && e.currentTarget);
          };
        })(hero.id, i));
        slot.appendChild(card);
      }

      el.slots.appendChild(slot);
    }
  }

  /* 点击放置：不支持 PointerEvent 的老浏览器也能选人 */
  function tapPlace(id, fromSlot, node, force) {
    /* 同一个元素刚被指针事件处理过，就不要再处理一次 */
    if (!force && node && node === lastPointerEl && Date.now() - lastPointerTs < 450) return;
    var before = cardsById();
    if (fromSlot >= 0) {
      slots[fromSlot] = null;
      renderSelect();
      flipAll(before, id);
      return;
    }
    var empty = firstEmpty();
    if (empty < 0) { el.selectHint.textContent = '四个位置都满了，先点掉一个再选'; return; }
    slots[empty] = id;
    renderSelect();
    flashSlot(empty);
    if (window.SFX) window.SFX.play('place');
    flipAll(before, id);
  }

  /* 刚放进槽位的卡闪一下，手机上很容易看出来 */
  function flashSlot(idx) {
    var s = document.querySelector ? document.querySelector('.slot[data-slot="' + idx + '"]') : null;
    if (!s || !s.classList) return;
    s.classList.add('just-placed');
    setTimeout(function () { s.classList.remove('just-placed'); }, 700);
  }

  function buildHeroCard(h) {
    var card = document.createElement('div');
    card.className = 'hero-card';
    card.dataset.id = h.id;
    card.setAttribute('draggable', 'false');
    var art = makeArtwork(h.id, h.name);
    if (art) { card.classList.add('has-card-art'); card.appendChild(art); }

    var head = document.createElement('div');
    head.className = 'hero-name';
    var nm = document.createElement('span');
    nm.textContent = h.name;
    head.appendChild(nm);

    var tags = document.createElement('div');
    tags.className = 'hero-tags';

    var role = document.createElement('span');
    role.className = 'hero-role';
    role.textContent = h.role;
    tags.appendChild(role);

    if (h.skills.some(function (s) { return s.ranks.indexOf(4) >= 0; })) {
      var lane = document.createElement('span');
      lane.className = 'hero-lane';
      lane.textContent = '适合四号位';
      tags.appendChild(lane);
    }

    var stats = document.createElement('div');
    stats.className = 'hero-stats';
    var rng = rankRangeOf(h);
    var rangeText = rng.lo === rng.hi ? String(rng.lo) : (rng.lo + '–' + rng.hi);
    stats.textContent = '血 ' + h.hp + '　速 ' + h.spd + '　站位 ' + rangeText;

    var resLine = document.createElement('div');
    resLine.className = 'hero-res';
    var dodge = h.dodge != null ? h.dodge : ({ '坦克': 4, '输出': 10, '远程': 8, '治疗': 6, '辅助': 8 }[h.role] || 5);
    resLine.textContent = '闪 ' + dodge + '　抗 晕' + h.res.stun + ' 流' + h.res.bleed +
                          ' 腐' + h.res.blight + ' 移' + h.res.move;

    var skillBox = document.createElement('div');
    skillBox.className = 'hero-skills';
    h.skills.forEach(function (s) {
      var item = document.createElement('span');
      item.textContent = s.name;
      skillBox.appendChild(item);
    });

    card.appendChild(head);
    card.appendChild(tags);
    card.appendChild(stats);
    card.appendChild(resLine);
    card.appendChild(skillBox);
    card.addEventListener('pointerdown', function (e) { onPointerDown(e, h.id, -1); });
    bindCardTouch(card, h.id, -1);
    card.addEventListener('click', function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      if (Date.now() < suppressClickUntil) return;   /* 刚拖完，ignore */
      openHeroInfo(h.id);
    });
    return card;
  }

  /* 一个英雄能站的号位区间 */
  function rankRangeOf(h) {
    var pool = h.skills.filter(function (s) { return s.target === 'enemy'; });
    if (!pool.length) pool = h.skills;      /* 纯辅助角色退回全部技能 */
    var lo = 4, hi = 1;
    pool.forEach(function (s) {
      s.ranks.forEach(function (r) {
        if (r < lo) lo = r;
        if (r > hi) hi = r;
      });
    });
    return { lo: lo, hi: hi };
  }

  function maxRankOf(h) { return rankRangeOf(h).hi; }

  function renderPicker() {
    var scroll = el.picker.scrollTop;
    el.picker.innerHTML = '';

    var groups = [
      { max: 2, title: '纯前排', note: '只能站 1–2 号位', items: [] },
      { max: 3, title: '可站中排', note: '能用到 3 号位', items: [] },
      { max: 4, title: '适合后排', note: '能用到 4 号位', items: [] }
    ];

    HEROES.forEach(function (h) {
      if (slots.indexOf(h.id) >= 0) return;   /* 已上阵的不再出现在卡池里 */
      var m = maxRankOf(h);
      var g = groups[0];
      if (m >= 4) g = groups[2];
      else if (m === 3) g = groups[1];
      g.items.push(h);
    });

    groups.forEach(function (g) {
      if (!g.items.length) return;
      g.items.sort(function (a, b) {
        var ra = rankRangeOf(a), rb = rankRangeOf(b);
        if (ra.lo !== rb.lo) return ra.lo - rb.lo;
        return b.hp - a.hp;
      });

      var wrap = document.createElement('section');
      wrap.className = 'picker-group';

      var head = document.createElement('div');
      head.className = 'picker-group-head';
      var t = document.createElement('span');
      t.className = 'pg-title';
      t.textContent = g.title;
      var n = document.createElement('span');
      n.className = 'pg-note';
      n.textContent = g.note;
      head.appendChild(t);
      head.appendChild(n);
      wrap.appendChild(head);

      var grid = document.createElement('div');
      grid.className = 'picker-grid';
      g.items.forEach(function (h) { grid.appendChild(buildHeroCard(h)); });
      wrap.appendChild(grid);

      el.picker.appendChild(wrap);
    });

    el.picker.scrollTop = scroll;
  }

  function renderSelect() {
    renderSlots();
    renderPicker();
    el.start.disabled = !isFull();
    el.auto.disabled = !isFull();

    var warn = '';
    if (isFull()) {
      var idle = 0;
      slots.forEach(function (id, i) {
        var hero = heroOf(id);
        var ok = hero && hero.skills.some(function (s) { return s.ranks.indexOf(i + 1) >= 0; });
        if (!ok) idle += 1;
      });
      if (idle) warn = '当前顺序下有 ' + idle + ' 人放不出技能，试试「自动布阵」';
    }
    el.selectHint.textContent = warn;
  }

  /* ---------- 拖拽 ---------- */

  function cardsById() {
    var map = {};
    var list = document.querySelectorAll('.hero-card, .slot-card');
    for (var i = 0; i < list.length; i++) {
      var node = list[i];
      if (node.dataset && node.dataset.id) map[node.dataset.id] = node.getBoundingClientRect();
    }
    return map;
  }

  function flipAll(before, skipId) {
    var list = document.querySelectorAll('.hero-card, .slot-card');
    for (var i = 0; i < list.length; i++) {
      var node = list[i];
      var id = node.dataset && node.dataset.id;
      if (!id || id === skipId) continue;
      var prev = before[id];
      if (!prev || !node.animate) continue;
      var to = node.getBoundingClientRect();
      var dx = prev.left - to.left;
      var dy = prev.top - to.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      node.animate(
        [{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }],
        { duration: 240, easing: 'cubic-bezier(.2,.85,.25,1)' }
      );
    }
  }

  function flyIn(id, fromRect) {
    if (!fromRect) return;
    var node = document.querySelector('.slot-card[data-id="' + id + '"], .hero-card[data-id="' + id + '"]');
    if (!node || !node.animate) return;
    var to = node.getBoundingClientRect();
    var dx = fromRect.left - to.left;
    var dy = fromRect.top - to.top;
    var sx = fromRect.width / to.width;
    var sy = fromRect.height / to.height;
    node.animate(
      [{ transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')', opacity: .9 },
       { transform: 'none', opacity: 1 }],
      { duration: 300, easing: 'cubic-bezier(.2,.85,.25,1)' }
    );
  }

  function makeGhost(srcEl, hero) {
    var rect = srcEl.getBoundingClientRect();
    var ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.style.width = rect.width + 'px';
    ghost.style.height = rect.height + 'px';
    var art = makeArtwork(hero.id, hero.name, '', true);
    if (art) { ghost.classList.add('has-card-art'); ghost.appendChild(art); }

    var nm = document.createElement('div');
    nm.className = 'sc-name';
    nm.textContent = hero.name;
    var meta = document.createElement('div');
    meta.className = 'sc-meta';
    meta.textContent = hero.role;
    ghost.appendChild(nm);
    ghost.appendChild(meta);

    document.body.appendChild(ghost);
    return { node: ghost, w: rect.width, h: rect.height };
  }

  function clearHover() {
    var list = document.querySelectorAll('.slot.drop-hover');
    for (var i = 0; i < list.length; i++) list[i].classList.remove('drop-hover');
  }

  function hitTest(x, y) {
    var node = document.elementFromPoint(x, y);
    if (!node || !node.closest) return { slot: -1, picker: false };
    var slotEl = node.closest('.slot');
    return {
      slot: slotEl ? parseInt(slotEl.dataset.slot, 10) : -1,
      picker: !!node.closest('.picker')
    };
  }

  var touchPending = null;
  var suppressClickUntil = 0;

  /* 触屏：长按 280ms 拿起卡牌，期间滑动仍然滚页面 */
  function onCardTouchStart(e, id, fromSlot) {
    if (!e.touches || e.touches.length !== 1) return;
    var t = e.touches[0];
    var src = e.currentTarget;
    touchPending = { id: id, fromSlot: fromSlot, x: t.clientX, y: t.clientY, src: src, timer: null };
    touchPending.timer = setTimeout(function () {
      if (!touchPending) return;
      var p = touchPending;
      touchPending = null;
      drag = {
        id: p.id, fromSlot: p.fromSlot, startX: p.x, startY: p.y, startTs: Date.now(),
        touch: true, src: p.src, moved: true, ghost: null, ghostRect: null
      };
      drag.ghost = makeGhost(p.src, heroOf(p.id));
      if (p.src && p.src.classList) p.src.classList.add('dragging');
      document.body.classList.add('is-dragging');
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(15);
      var g = drag.ghost;
      g.node.style.transform = 'translate3d(' + (p.x - g.w / 2) + 'px,' + (p.y - g.h / 2) + 'px,0) scale(1.06)';
    }, 280);
  }

  function onCardTouchMove(e) {
    var t = e.touches && e.touches[0];
    if (!t) return;
    if (touchPending) {
      if (Math.abs(t.clientX - touchPending.x) > 12 || Math.abs(t.clientY - touchPending.y) > 12) {
        clearTimeout(touchPending.timer);
        touchPending = null;      /* 手指在动 = 想滚页面 */
      }
      return;
    }
    if (!drag) return;
    if (e.preventDefault) e.preventDefault();     /* 进入拖拽后才禁止滚动 */
    onPointerMove({ clientX: t.clientX, clientY: t.clientY });
  }

  function onCardTouchEnd(e) {
    if (touchPending) {
      clearTimeout(touchPending.timer);
      touchPending = null;
      return;                     /* 短按：交给 click 打开详情 */
    }
    if (!drag) return;
    var t = (e.changedTouches && e.changedTouches[0]) || { clientX: 0, clientY: 0 };
    suppressClickUntil = Date.now() + 500;
    if (e.preventDefault) e.preventDefault();
    onPointerUp({ clientX: t.clientX, clientY: t.clientY });
  }

  function onCardTouchCancel(e) {
    if (touchPending) { clearTimeout(touchPending.timer); touchPending = null; }
    if (!drag) return;
    var t = (e.changedTouches && e.changedTouches[0]) || { clientX: 0, clientY: 0 };
    suppressClickUntil = Date.now() + 500;
    onPointerUp({ clientX: t.clientX, clientY: t.clientY });
  }

  function bindCardTouch(card, id, fromSlot) {
    card.addEventListener('touchstart', function (e) { onCardTouchStart(e, id, fromSlot); }, { passive: true });
    card.addEventListener('touchmove', onCardTouchMove, { passive: false });
    card.addEventListener('touchend', onCardTouchEnd, { passive: false });
    card.addEventListener('touchcancel', onCardTouchCancel, { passive: false });
  }

  function onPointerDown(e, id, fromSlot) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    /* 触屏：不拖拽。点一下 = 打开详情，滑动 = 滚页面，互不干扰 */
    var isTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
    if (!e.pointerType) {
      isTouch = ('ontouchstart' in window) ||
        (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
    }
    /* 有些 WebView 会把触摸伪装成 mouse 事件 */
    if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) isTouch = true;
    if (isTouch) return;

    var src = e.currentTarget;
    drag = {
      id: id,
      fromSlot: fromSlot,
      startX: e.clientX,
      startY: e.clientY,
      startTs: Date.now(),
      touch: e.pointerType !== 'mouse',
      src: src,
      moved: false,
      ghost: null,
      ghostRect: null
    };
    if (src && src.setPointerCapture) {
      try { src.setPointerCapture(e.pointerId); } catch (err) {}
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
  }

  /* 触屏上滑动手势会被系统接管（滚动列表），此时直接放弃这次拖拽，不算点击 */
  function onPointerCancel() {
    if (!drag) return;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    if (drag.ghost && drag.ghost.node) drag.ghost.node.remove();
    clearHover();
    document.body.classList.remove('is-dragging');
    if (drag.src && drag.src.classList) drag.src.classList.remove('dragging');

    /* 手指轻微滑动就被系统取消的，仍然当作点击：只用来查看介绍 / 收回槽位 */
    var d = drag;
    drag = null;
    if (!d.moved && Date.now() - d.startTs < 600) {
      if (d.fromSlot >= 0) {
        slots[d.fromSlot] = null;
        renderSelect();
      } else {
        openHeroInfo(d.id);
      }
    }
  }

  function onPointerMove(e) {
    if (!drag) return;
    var dx = e.clientX - drag.startX;
    var dy = e.clientY - drag.startY;
    if (!drag.moved) {
      var threshold = drag.touch ? 16 : 7;   /* 手指更容易抖，阈值放大 */
      if (Math.abs(dx) + Math.abs(dy) < threshold) return;
      drag.moved = true;
      var hero = heroOf(drag.id);
      drag.ghost = makeGhost(drag.src, hero);
      if (drag.src && drag.src.classList) drag.src.classList.add('dragging');
      document.body.classList.add('is-dragging');
    }
    var g = drag.ghost;
    g.node.style.transform =
      'translate3d(' + (e.clientX - g.w / 2) + 'px,' + (e.clientY - g.h / 2) + 'px,0) rotate(2deg) scale(1.04)';

    clearHover();
    var hit = hitTest(e.clientX, e.clientY);
    if (hit.slot >= 0) {
      var slotEl = document.querySelector('.slot[data-slot="' + hit.slot + '"]');
      if (slotEl) slotEl.classList.add('drop-hover');
    }
  }

  function onPointerUp(e) {
    lastPointerTs = Date.now();
    if (drag) lastPointerEl = drag.src;
    if (!drag) return;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);

    var d = drag;
    drag = null;

    var before = cardsById();
    var ghostRect = null;
    if (d.ghost && d.ghost.node) {
      ghostRect = d.ghost.node.getBoundingClientRect();
      d.ghost.node.remove();
    }
    clearHover();
    document.body.classList.remove('is-dragging');
    if (d.src && d.src.classList) d.src.classList.remove('dragging');

    /* 没拖动 = 点击：卡池里的自动补位，槽位里的收回卡池 */
    if (!d.moved) {
      var fromRect = d.src && d.src.getBoundingClientRect ? d.src.getBoundingClientRect() : null;
      if (d.fromSlot >= 0) {
        slots[d.fromSlot] = null;
        renderSelect();
        flipAll(before, d.id);
      } else {
        /* 单击卡池里的卡 = 查看介绍，入队用面板里的按钮 */
        openHeroInfo(d.id);
      }
      return;
    }

    var hit = hitTest(e.clientX, e.clientY);
    if (hit.slot >= 0) {
      placeAt(d.id, hit.slot);
    } else if (hit.picker && d.fromSlot >= 0) {
      slots[d.fromSlot] = null;
    } else {
      return;   /* 丢在空白处：不改状态，卡片自己弹回去 */
    }

    renderSelect();
    if (window.SFX) window.SFX.play('place');
    flyIn(d.id, ghostRect);
    flipAll(before, d.id);
  }

  /* ================= 战斗 ================= */

  function orderedUnits(team) {
    return state.units
      .filter(function (u) { return u.team === team && !u.removed; })
      .sort(function (a, b) { return a.rank - b.rank; });
  }

  /* 卡牌只创建一次，之后原地更新——这样飘字/受击动画不会被打断 */
  function createCard(u) {
    var card = document.createElement('div');
    card.dataset.uid = u.uid;

    var rank = document.createElement('span');
    rank.className = 'rank';

    var name = document.createElement('div');
    name.className = 'name';
    name.textContent = u.name;

    var badges = document.createElement('div');
    badges.className = 'badges';

    var bottom = document.createElement('div');
    bottom.className = 'bottom';

    var bar = document.createElement('div');
    bar.className = 'bar';
    var fill = document.createElement('div');
    fill.className = 'fill';
    bar.appendChild(fill);

    var hp = document.createElement('div');
    hp.className = 'hp';

    bottom.appendChild(bar);
    bottom.appendChild(hp);

    card.appendChild(name);
    card.appendChild(badges);
    card.appendChild(bottom);
    card.appendChild(rank);

    card._rank = rank;
    card._name = name;
    card._badges = badges;
    card._fill = fill;
    card._hp = hp;
    card._tag = null;
    card._badgeSig = '';

    card.addEventListener('click', function () { onCardClick(u.uid); });
    return card;
  }

  function updateCard(card, u, activeUid) {
    var targetable = !!(mode === 'target' && validSet && validSet[u.uid]);

    var cls = 'card ' + u.team + (u.alive ? '' : ' dead');
    if (updateBattleArtwork(card, u)) cls += ' has-card-art';
    if (u.corpse) cls += ' corpse';
    if (u.uid === activeUid) cls += ' active';
    if (targetable) cls += ' targetable';
    if (targetable && pendingAoe) cls += ' aoe-target';
    if (u.boss) cls += ' boss';
    if (u.boss && u.size === 1) cls += ' compact-boss';
    var foretold = state.units.some(function (source) {
      return source.alive && source.team !== u.team && source.forecastRank === u.rank;
    });
    if (foretold) cls += ' foretold';
    if (card.className !== cls) card.className = cls;

    card._rank.textContent = (u.alive || u.corpse)
      ? ((u.size > 1 ? u.rank + '–' + (u.rank + 1) : u.rank) + ' 号位')
      : '';
    card._name.textContent = u.name;
    card._fill.style.width = (u.hp / u.maxHp * 100) + '%';
    card._hp.textContent = u.alive
      ? (u.hp + ' / ' + u.maxHp)
      : (u.corpse ? (targetable ? '可打掉' : '尸骸') : '已阵亡');

    /* 徽章只在内容变化时重建，避免每帧闪一下 */
    var guarded = state.units.some(function (o) {
      return o.alive && o.guarding && o.guarding.uid === u.uid;
    });
    var sig = (u.status.stun > 0 ? 's' : '') +
      (u.status.bleed ? 'b' + u.status.bleed.turns : '') +
      (u.status.blight ? 'c' + u.status.blight.turns : '') +
      (u.status.mark ? 'm' + u.status.mark.turns : '') +
      (u.status.dodgeUp ? 'U' : '') + (u.status.dodgeDown ? 'D' : '') + (foretold ? 'F' : '') +
      (u.guarding ? 'g' + u.guarding.turns : '') + (guarded ? 'G' : '');
    if (sig !== card._badgeSig) {
      card._badgeSig = sig;
      card._badges.innerHTML = '';
      if (u.status.stun > 0) card._badges.appendChild(badge('眩', 'stun'));
      if (u.status.bleed) card._badges.appendChild(badge('流' + u.status.bleed.turns, 'bleed'));
      if (u.status.blight) card._badges.appendChild(badge('腐' + u.status.blight.turns, 'blight'));
      if (u.status.mark) card._badges.appendChild(badge('标' + u.status.mark.turns, 'mark'));
      if (u.status.dodgeUp) card._badges.appendChild(badge('潜没 +' + u.status.dodgeUp.amount + '闪', 'dodgeUp'));
      if (u.status.dodgeDown) card._badges.appendChild(badge('闪↓' + u.status.dodgeDown.amount, 'mark'));
      if (foretold) card._badges.appendChild(badge('预言位', 'forecast'));
      if (u.guarding) {
        var _gt = Math.max(1, (u.guarding.turns || 1) - 1);
        card._badges.appendChild(badge('护' + _gt, 'guard'));
      }
      if (guarded) card._badges.appendChild(badge('守', 'guard'));
    }

    /* BOSS 标记 */
    if (u.boss) {
      if (!card._bossTag) {
        card._bossTag = document.createElement('span');
        card._bossTag.className = 'boss-tag';
        card.appendChild(card._bossTag);
      }
      card._bossTag.textContent = 'BOSS';
    } else if (card._bossTag) {
      if (card._bossTag.parentNode) card._bossTag.parentNode.removeChild(card._bossTag);
      card._bossTag = null;
    }

    /* 精英标记 */
    card.classList.toggle('elite', !!u.elite);
    if (u.elite) {
      if (!card._eliteTag) {
        card._eliteTag = document.createElement('span');
        card._eliteTag.className = 'elite-tag';
        card._eliteTag.textContent = '精英';
        card.appendChild(card._eliteTag);
      }
    } else if (card._eliteTag) {
      if (card._eliteTag.parentNode) card._eliteTag.parentNode.removeChild(card._eliteTag);
      card._eliteTag = null;
    }

    /* 死门标签 */
    card.classList.toggle('death-door', !!u.deathDoor);
    if (u.deathDoor) {
      if (!card._doorTag) {
        card._doorTag = document.createElement('span');
        card._doorTag.className = 'door-tag';
        card._doorTag.textContent = '死门';
        card.appendChild(card._doorTag);
      }
    } else if (card._doorTag) {
      if (card._doorTag.parentNode) card._doorTag.parentNode.removeChild(card._doorTag);
      card._doorTag = null;
    }

    /* 尸骸标签 */
    if (u.corpse) {
      if (!card._tag) {
        card._tag = document.createElement('span');
        card._tag.className = 'corpse-tag';
        card.appendChild(card._tag);
      }
      card._tag.textContent = targetable ? '尸骸 · 可打掉' : '尸骸';
    } else if (card._tag) {
      if (card._tag.parentNode) card._tag.parentNode.removeChild(card._tag);
      card._tag = null;
    }
  }

  /* 按 uid 复用节点，顺序变了才移动 */
  function syncRow(rowEl, units, activeUid) {
    /* 记录换位前的位置，用于 FLIP 动画 */
    var prevRects = {};
    Array.prototype.slice.call(rowEl.children).forEach(function (c) {
      if (!c.dataset || !c.dataset.uid || c.dataset.spacer) return;
      if (c.getBoundingClientRect) prevRects[c.dataset.uid] = c.getBoundingClientRect();
    });

    var existing = {};
    var kids = Array.prototype.slice.call(rowEl.children);
    kids.forEach(function (c) { existing[c.dataset.uid] = c; });

    var seen = {};
    units.forEach(function (u, idx) {
      var card = existing[u.uid] || createCard(u);
      updateCard(card, u, activeUid);
      seen[u.uid] = true;

      var cur = rowEl.children[idx];
      if (cur !== card) {
        if (rowEl.insertBefore) rowEl.insertBefore(card, cur || null);
        else rowEl.appendChild(card);
      }
    });

    Array.prototype.slice.call(rowEl.children).forEach(function (c) {
      if (c.dataset.spacer) return;
      if (!seen[c.dataset.uid]) rowEl.removeChild(c);
    });

    /* 补齐空位：BOSS 占两格，人少了也保留空槽，阵型不会塌 */
    Array.prototype.slice.call(rowEl.children).forEach(function (c) {
      if (c.dataset.spacer) rowEl.removeChild(c);
    });
    var occupied = 0;
    units.forEach(function (u) { occupied += (u.size || 1); });
    for (var i = occupied; i < 4; i++) {
      var sp = document.createElement('div');
      sp.className = 'card-spacer';
      sp.dataset.spacer = '1';
      rowEl.appendChild(sp);
    }

    /* 位置变了就滑动过去 */
    Array.prototype.slice.call(rowEl.children).forEach(function (c) {
      if (!c.dataset || !c.dataset.uid) return;
      var before = prevRects[c.dataset.uid];
      if (!before || !c.getBoundingClientRect) return;
      var after = c.getBoundingClientRect();
      var dx = before.left - after.left;
      var dy = before.top - after.top;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
      if (!c.animate) return;
      c.animate(
        [{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'translate(0,0)' }],
        { duration: scaled(320), easing: 'cubic-bezier(.2,.8,.25,1)' }
      );
      c.classList.remove('swap-glow');
      void c.offsetWidth;
      c.classList.add('swap-glow');
      setTimeout(function () { c.classList.remove('swap-glow'); }, scaled(500));
    });
  }

  function badge(text, cls) {
    var b = document.createElement('span');
    b.className = 'badge ' + cls;
    b.textContent = text;
    return b;
  }

  var lastLogSig = '';
  function renderLog() {
    /* 日志没变化就不要重建 140 个节点 */
    var sig = state.log.length + '|' + (state.log.length ? state.log[state.log.length - 1].text : '');
    if (sig === lastLogSig) return;
    lastLogSig = sig;

    el.log.innerHTML = '';
    for (var i = 0; i < state.log.length; i++) {
      var li = document.createElement('li');
      li.textContent = state.log[i].text;
      if (state.log[i].hl) li.className = 'hl';
      el.log.appendChild(li);
    }
    el.log.scrollTop = el.log.scrollHeight;
  }

  function renderSkills(list, myTurn) {
    el.skills.innerHTML = '';
    list = list || G.usableSkills(state);
    if (el.skillsTitle) el.skillsTitle.textContent = '行动 · 技能 ' + list.length;
    list.forEach(function (item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'skill';
      btn.dataset.id = item.skill.id;
      btn.disabled = !item.ready || myTurn === false;

      var line = document.createElement('span');
      line.className = 'skill-name';

      var nm = document.createElement('span');
      nm.textContent = item.skill.name;

      var range = document.createElement('span');
      range.className = 'skill-range';
      range.textContent = item.reason || (item.skill.ranks[0] + '–' + item.skill.ranks[item.skill.ranks.length - 1] + ' 位');

      var cdTag = document.createElement('span');
      cdTag.className = 'skill-cd' + (item.cd > 0 ? ' cooling' : '');
      if (item.skill.cd > 0) {
        cdTag.textContent = item.cd > 0 ? 'CD ' + item.cd : 'CD ' + item.skill.cd;
        cdTag.classList.remove('hidden');
      } else {
        cdTag.classList.add('hidden');
      }

      line.appendChild(nm);
      line.appendChild(cdTag);
      line.appendChild(range);

      var desc = document.createElement('span');
      desc.className = 'skill-desc';
      desc.textContent = item.desc;

      btn.appendChild(line);
      btn.appendChild(desc);
      btn.addEventListener('click', function () { onSkill(item); });
      el.skills.appendChild(btn);
    });
  }

  function renderBattle() {
    var active = G.currentUnit(state);
    var activeUid = active ? active.uid : null;

    syncRow(el.enemyRow, orderedUnits(G.ENEMY), activeUid);
    syncRow(el.playerRow, orderedUnits(G.PLAYER), activeUid);
    if (el.prophecyWarning) {
      var prophet = state.units.filter(function (u) { return u.alive && u.forecastRank; })[0];
      el.prophecyWarning.textContent = prophet
        ? '灾祸预言：第 ' + prophet.forecastRank + ' 号位将遭碎石轰击 · 调位或守护应对' : '';
      el.prophecyWarning.classList.toggle('hidden', !prophet || state.phase === 'over');
    }

    syncSoloMusic();
    el.roundLabel.textContent = '第 ' + state.round + ' 回合 / ' + G.CONFIG.maxRounds;

    if (state.phase === 'over') {
      el.turnLabel.textContent = '战斗结束';
      el.actorLine.textContent = '—';
    } else if (active) {
      el.turnLabel.textContent = active.name + ' 行动中';
      el.actorLine.innerHTML = '';
      var who = document.createElement('span');
      who.textContent = active.name;
      var at = document.createElement('span');
      at.className = 'dim';
      at.textContent = '　' + active.rank + ' 号位 · 血 ' + active.hp + '/' + active.maxHp;
      el.actorLine.appendChild(who);
      el.actorLine.appendChild(at);
    }

    var skillList = G.usableSkills(state);
    var myTurn = isOnline() ? isMyTurn() : !!(active && active.team === G.PLAYER);
    var locked = busy || state.phase === 'over';
    var anyReady = skillList.some(function (i) { return i.ready; });
    if (state.phase === 'over') el.hint.textContent = '战斗结束';
    else if (!myTurn) el.hint.textContent = isOnline() ? '等待对手行动…' : '敌方行动中…';
    else if (busy) el.hint.textContent = '……';
    else if (mode === 'target') el.hint.textContent = pendingAoe
      ? '群体技能 · 已锁定 ' + Object.keys(validSet || {}).length + ' 个目标，点「释放」或任意高亮卡牌'
      : '点击高亮的目标卡牌';
    else if (mode === 'item') el.hint.textContent = '点击要治疗的队友';
    else if (!anyReady) el.hint.textContent = '本回合无可用技能，可以移动';
    else el.hint.textContent = '选择一个技能';

    var items = state.items || { bandage: 0, antidote: 0 };
    var myTurnNow = isOnline() ? isMyTurn() : !!(active && active.team === G.PLAYER);
    el.countBandage.textContent = items.bandage;
    el.countAntidote.textContent = items.antidote;
    el.itemBandage.disabled = locked || !active || !myTurnNow || items.bandage <= 0 ||
      !(active && active.status && active.status.bleed);
    el.itemAntidote.disabled = locked || !active || !myTurnNow || items.antidote <= 0 ||
      !(active && active.status && active.status.blight);

    el.cancel.classList.toggle('hidden', mode === 'idle');
    var showAoe = mode === 'target' && pendingAoe;
    el.aoe.classList.toggle('hidden', !showAoe);
    el.aoe.disabled = locked || !showAoe;
    el.forward.disabled = locked || !active || !myTurnNow || !G.canMoveActor(state, -1);
    el.moveBack.disabled = locked || !active || !myTurnNow || !G.canMoveActor(state, 1);
    if (el.skip) el.skip.disabled = locked || !myTurnNow;

    renderSkills(skillList, myTurn && !busy);
    renderLog();

    if (state.phase === 'over') {
      if (!endTimer) {
        endTimer = setTimeout(function () {
          endTimer = null;
          handleBattleEnd();
        }, scaled(TIMING.endDelay));
      }
    } else {
      if (endTimer) { clearTimeout(endTimer); endTimer = null; }
      el.overlay.classList.add('hidden');
    }
  }

  /* ================= 打击感 ================= */

  function drainEvents() {
    var list = state.events ? state.events.slice() : [];
    if (state.events) state.events.length = 0;
    return list;
  }

  function removeNode(node) {
    if (!node) return;
    if (node.remove) node.remove();
    else if (node.parentNode && node.parentNode.removeChild) node.parentNode.removeChild(node);
  }

  function spawnFloat(card, text, cls) {
    if (!card || !card.appendChild) return;
    var span = document.createElement('span');
    span.className = 'float-num ' + cls;
    span.textContent = text;
    card.appendChild(span);
    setTimeout(function () { removeNode(span); }, 900);
  }

  function spawnImpact(card, variant) {
    if (!card || !card.appendChild) return;
    var ring = document.createElement('div');
    ring.className = 'impact' + (variant ? ' ' + variant : '');
    card.appendChild(ring);
    setTimeout(function () { removeNode(ring); }, 480);
  }

  function flashVignette() {
    if (!document.body || !document.body.appendChild) return;
    var v = document.getElementById('vignette');
    if (!v) {
      v = document.createElement('div');
      v.id = 'vignette';
      document.body.appendChild(v);
    }
    v.classList.remove('show');
    void v.offsetWidth;
    v.classList.add('show');
  }

  function playEffects(events) {
    if (!events || !events.length) return;

    var total = 0;
    events.forEach(function (ev) {
      if (ev.type === 'dmg') total += ev.amount || 0;
    });

    if (total > 0) {
      var stage = document.querySelector('.stage');
      if (stage) {
        var cls = total >= 12 ? 'shake-lg' : 'shake-sm';
        stage.classList.remove('shake-sm', 'shake-lg');
        void stage.offsetWidth;
        stage.classList.add(cls);
        setTimeout(function () { stage.classList.remove(cls); }, 460);
      }
      if (total >= 12) flashVignette();
    }

    var delay = TIMING.effectStart;
    events.forEach(function (ev) {
      var card = document.querySelector('.card[data-uid="' + ev.uid + '"]');
      if (!card) return;

      if (ev.type === 'dmg') {
        var at = delay;
        delay += TIMING.effectGap;

        if (ev.dot) {
          /* 持续伤害：先弹状态字样，再跳扣血 */
          var word = ev.element === 'bleed' ? '流血' : '腐蚀';
          var wordCls = 'dot-word ' + (ev.element === 'bleed' ? 'bleed' : 'blight');
          setTimeout(function () {
            spawnFloat(card, word, wordCls);
          }, scaled(at + TIMING.dotWord));
          setTimeout(function () {
            card.classList.remove('flash');
            void card.offsetWidth;
            card.classList.add('flash');
            spawnImpact(card, 'dot');
            spawnFloat(card, '-' + ev.amount, 'dot');
            setTimeout(function () { card.classList.remove('flash'); }, 260);
          }, scaled(at + TIMING.dotWord + TIMING.dotNum));
          return;
        }

        setTimeout(function () {
          card.classList.remove('flash');
          void card.offsetWidth;
          card.classList.add('flash');
          if (ev.crit) {
            spawnImpact(card, 'crit');
            spawnFloat(card, '暴击 ' + ev.amount, 'crit');
          } else {
            spawnImpact(card, ev.element !== 'phys' ? 'dot' : '');
            spawnFloat(card, '-' + ev.amount, ev.element === 'phys' ? 'dmg' : 'dot');
          }
          setTimeout(function () { card.classList.remove('flash'); }, 260);
        }, scaled(at));
      } else if (ev.type === 'heal') {
        spawnFloat(card, (ev.crit ? '暴击 +' : '+') + ev.amount, ev.crit ? 'heal crit' : 'heal');
      } else if (ev.type === 'summon') {
        card.classList.add('summon-pop');
        setTimeout(function () { card.classList.remove('summon-pop'); }, 600);
      } else if (ev.type === 'cannon') {
        spawnFloat(card, ev.misfire ? '哑火' : '开火！', ev.misfire ? 'dodge' : 'crit');
        if (!ev.misfire) spawnImpact(card, 'crit');
      } else if (ev.type === 'guard') {
        spawnImpact(card, 'guard');
        spawnFloat(card, '挡下', 'guard');
      } else if (ev.type === 'guardend') {
        spawnFloat(card, '守护结束', 'guard');
      } else if (ev.type === 'guardup') {
        var _gk = (G.CONFIG && G.CONFIG.guardReduction) || 0.3;
        spawnFloat(card, '守护 · 受伤 -' + Math.round(_gk * 100) + '%', 'guard');
      } else if (ev.type === 'cure') {
        spawnFloat(card, '解除', 'heal');
        spawnImpact(card, 'dot');
      } else if (ev.type === 'laststand') {
        var pct = Math.round((ev.k - 1) * 100);
        showDeathBanner(ev.name + ' 阵亡 · 全队伤害与治疗 +' + pct + '%（残阵强化）');
      } else if (ev.type === 'enrage') {
        spawnFloat(card, '暴怒', 'crit');
        card.classList.remove('shake-sm'); void card.offsetWidth; card.classList.add('shake-sm');
      } else if (ev.type === 'dodge') {
        spawnFloat(card, '闪避', 'dodge');
        card.classList.remove('dodge-shift');
        void card.offsetWidth;
        card.classList.add('dodge-shift');
        setTimeout(function () { card.classList.remove('dodge-shift'); }, 420);
      } else if (ev.type === 'resist') {
        /* 先亮出被抵抗的是什么，再显示"抵抗" */
        var rlabel = ev.status === 'stun' ? '眩晕'
                   : ev.status === 'bleed' ? '流血'
                   : ev.status === 'blight' ? '腐蚀'
                   : ev.status === 'move' ? '位移'
                   : '效果';
        spawnFloat(card, rlabel, 'st-' + (ev.status || 'stun'));
        setTimeout(function () { spawnFloat(card, '抵抗', 'resist'); }, scaled(260));
        spawnImpact(card, 'resist');
        card.classList.remove('resist-pulse');
        void card.offsetWidth;
        card.classList.add('resist-pulse');
        setTimeout(function () { card.classList.remove('resist-pulse'); }, 520);
      } else if (ev.type === 'status') {
        var LABELS = {
          stun: '眩晕', bleed: '流血', blight: '腐蚀',
          mark: '★ 标记', markend: '标记结束', dodgeDown: '闪避 ↓',
          dodgeUp: '潜没 · 闪避 ↑', dodgeUpEnd: '潜没结束', forecast: '灾祸预言'
        };
        var label = LABELS[ev.status] || '';
        if (!label) return;
        spawnFloat(card, label, 'st-' + ev.status);
        var badge = card.querySelector ? card.querySelector('.badge.' + ev.status) : null;
        if (badge) {
          badge.classList.add('pop');
          setTimeout(function () { badge.classList.remove('pop'); }, 320);
        }
      } else if (ev.type === 'deathdoor') {
        var du = state.units.filter(function (x) { return x.uid === ev.uid; })[0];
        card.classList.add('death-door');
        if (!card._doorTag) {
          card._doorTag = document.createElement('span');
          card._doorTag.className = 'door-tag';
          card._doorTag.textContent = '死门';
          card.appendChild(card._doorTag);
        }
        showDeathBanner(
          (du ? du.name : '队友') + ' 进入死门',
          'door',
          '每回合 50% 概率倒下　·　再受伤做 50% 判定　·　治疗回血即可脱离'
        );
        if (window.SFX) window.SFX.play('death');
        card.classList.remove('door-in');
        void card.offsetWidth;
        card.classList.add('door-in');
      } else if (ev.type === 'doorhold') {
        spawnFloat(card, '撑住', 'resist');
      } else if (ev.type === 'leavesdoor') {
        card.classList.remove('death-door', 'door-in');
        if (card._doorTag && card._doorTag.parentNode) card._doorTag.parentNode.removeChild(card._doorTag);
        card._doorTag = null;
        var lu = state.units.filter(function (x) { return x.uid === ev.uid; })[0];
        spawnFloat(card, '脱离死门', 'heal');
      } else if (ev.type === 'corpse') {
        spawnFloat(card, ev.decay ? '腐烂' : '清除', ev.decay ? 'dot' : 'heal');
        card.classList.add('corpse-cleared');
      } else if (ev.type === 'death') {
        card.classList.remove('death-door', 'door-in');
        if (card._doorTag && card._doorTag.parentNode) card._doorTag.parentNode.removeChild(card._doorTag);
        card._doorTag = null;
        card.classList.add('dying');
        setTimeout(function () { card.classList.remove('dying'); }, 620);
      }
    });
  }

  function lunge(uid) {
    if (!uid) return;
    var card = document.querySelector('.card[data-uid="' + uid + '"]');
    if (!card) return;
    card.classList.remove('lunge');
    void card.offsetWidth;
    card.classList.add('lunge');
    setTimeout(function () { card.classList.remove('lunge'); }, 260);
  }

  var soloMusic = false;
  var SOLO_TRACK = 'bgm-last.mp4';
  var NORMAL_TRACK = 'bgm.mp3';

  /* 队伍只剩一人时换 BGM（会循环播放） */
  var lastStandTimer = null;

  function showLastStand() {
    if (!el.lastStand) return;
    el.lastStand.classList.remove('show');
    void el.lastStand.offsetWidth;
    el.lastStand.classList.add('show');
    if (window.SFX) window.SFX.play('crit');
    if (lastStandTimer) clearTimeout(lastStandTimer);
    lastStandTimer = setTimeout(function () {
      if (el.lastStand) el.lastStand.classList.remove('show');
    }, scaled(3200));
  }

  var lastStandShown = false;

  function syncSoloMusic() {
    if (!state) return;
    var alive = state.units.filter(function (x) { return x.team === G.PLAYER && x.alive; }).length;

    /* 音乐：只剩一个人时切换 */
    var musicSolo = alive === 1;
    if (musicSolo !== soloMusic) {
      soloMusic = musicSolo;
      if (window.BGM && window.BGM.setTrack) window.BGM.setTrack(musicSolo ? 'solo' : 'normal');
    }

    /* 文字：只剩一个人时才喊 */
    if (alive === 1 && !lastStandShown) {
      lastStandShown = true;
      showLastStand();
    }
  }

  function playActionSfx(events) {
    if (!window.SFX || !events || !events.length) return;
    var hasCrit = false, hasDmg = false, hasHeal = false, hasDeath = false, hasDodge = false;
    var dotKinds = [];
    events.forEach(function (ev) {
      if (ev.type === 'dmg' && !ev.dot) { hasDmg = true; if (ev.crit) hasCrit = true; }
      else if (ev.type === 'dmg' && ev.dot) {
        if (dotKinds.indexOf(ev.element) < 0) dotKinds.push(ev.element);
      }
      else if (ev.type === 'heal') hasHeal = true;
      else if (ev.type === 'death') hasDeath = true;
      else if (ev.type === 'dodge') hasDodge = true;
    });
    if (hasDmg) window.SFX.play(hasCrit ? 'crit' : 'attack');
    else if (hasDodge) window.SFX.play('dodge');
    else if (hasHeal) window.SFX.play('heal');

    /* 流血/腐蚀单独一拍，和"字样"同步 */
    dotKinds.forEach(function (kind, i) {
      setTimeout(function () {
        window.SFX.play(kind === 'bleed' ? 'bleed' : 'blight');
      }, 220 + i * 700);
    });

    if (hasDeath) setTimeout(function () { window.SFX.play('death'); }, 240);
  }

  function afterAction(actorUid) {
    if(isGuest() && remotePending){busy=true;renderBattle();return;}
    var events = drainEvents();
    pushSync(events);
    playActionSfx(events);
    syncSoloMusic();
    busy = true;               /* 结算期间锁住操作 */
    renderBattle();
    lunge(actorUid);

    if (events.length) playEffects(events);

    /* 让玩家看清飘字，再进入下一个人的回合 */
    var hold = Math.min(
      TIMING.holdMax,
      TIMING.holdMin + Math.max(0, events.length - 1) * TIMING.effectGap
    );
    setTimeout(function () {
      beginTurn();
      if (state && state.phase === 'over') handleBattleEnd();
    }, scaled(hold));
  }

  /* ---------- 回合切换：停顿 + 顶部横幅 ---------- */

  function setSettling(on) {
    var stage = document.querySelector ? document.querySelector('.stage') : null;
    if (!stage || !stage.classList) return;
    if (on) stage.classList.add('is-settling');
    else stage.classList.remove('is-settling');
  }

  function showTurnBanner(actor, major) {
    var banner = document.querySelector ? document.querySelector('.turn-banner') : null;
    if (!banner || !banner.querySelector) return;
    var side = banner.querySelector('.tb-side');
    var sub = banner.querySelector('.tb-actor');
    if (!side || !sub) return;

    banner.className = 'turn-banner ' + (actor.team === G.PLAYER ? 'player' : 'enemy');
    if (major) {
      side.textContent = actor.team === G.PLAYER ? '我方回合' : '敌方回合';
      sub.textContent = actor.name + ' 行动';
      banner.classList.remove('minor');
    } else {
      side.textContent = '轮到 ' + actor.name;
      sub.textContent = '';
      banner.classList.add('minor');
    }
    var dur = scaled(major ? TIMING.turnMajor : TIMING.turnMinor);
    if (banner.style) banner.style.animationDuration = dur + 'ms';
    if (bannerTimer) clearTimeout(bannerTimer);
    void banner.offsetWidth;
    banner.classList.add('show');
    bannerTimer = setTimeout(function () {
      bannerTimer = null;
      banner.classList.remove('show');
    }, dur + 60);
  }

  /* 队友阵亡时，把残阵加成的变化打在界面上 */
  function showDeathBanner(text, variant, sub) {
    if (!el.deathBanner) return;
    el.deathBanner.classList.toggle('door', variant === 'door');
    if (el.dbText) el.dbText.textContent = text;
    if (el.dbSub) {
      el.dbSub.textContent = sub || '';
      el.dbSub.classList.toggle('hidden', !sub);
    }
    el.deathBanner.classList.remove('show');
    void el.deathBanner.offsetWidth;
    el.deathBanner.classList.add('show');
    var hold = variant === 'door' ? 5400 : 2450;
    setTimeout(function () {
      if (el.deathBanner) el.deathBanner.classList.remove('show');
    }, scaled(hold));
  }

  /* 谁用了什么技能，顶部弹一条 */
  function showSkillBanner(actor, skillId) {
    if (!el.skillBanner || !actor) return;
    var s = null;
    (actor.skills || []).forEach(function (k) { if (k.id === skillId) s = k; });
    if (!s) return;
    if (el.sbActor) el.sbActor.textContent = actor.name + ' ·';
    if (el.sbName) el.sbName.textContent = s.name;
    el.skillBanner.classList.toggle('boss', !!actor.boss);
    el.skillBanner.classList.remove('show');
    void el.skillBanner.offsetWidth;
    el.skillBanner.classList.add('show');
    setTimeout(function () {
      if (el.skillBanner) el.skillBanner.classList.remove('show');
    }, 1400);
  }

  /* 进入新地点时，顶部/中央打出地点名 */
  function showAreaBanner(region, stage, boss, bossName) {
    if (!el.areaBanner) return;
    el.areaBanner.classList.toggle('boss', !!boss);
    if (el.abRegion) el.abRegion.textContent = boss ? 'BOSS' : region;
    if (el.abSub) el.abSub.textContent = boss
      ? ('第 ' + stage + ' 关 · ' + region + (bossName ? ' · ' + bossName : ''))
      : ('第 ' + stage + ' 关');
    el.areaBanner.classList.remove('show');
    void el.areaBanner.offsetWidth;
    el.areaBanner.classList.add('show');
    setTimeout(function () {
      if (el.areaBanner) el.areaBanner.classList.remove('show');
    }, scaled(TIMING.areaHold) + 100);
  }

  function beginTurn() {
    if (!state || state.phase !== 'playing') { busy = false; setSettling(false); return; }
    var actor = G.currentUnit(state);
    if (!actor) { busy = false; return; }

    var major = lastSide !== actor.team;
    lastSide = actor.team;

    busy = true;
    setSettling(true);
    showTurnBanner(actor, major);
    renderBattle();

    setTimeout(function () {
      busy = false;
      setSettling(false);
      renderBattle();
      scheduleAI();
    }, scaled(major ? TIMING.turnMajor : TIMING.turnMinor));
  }

  /* ---------- 敌方自动行动 ---------- */
  function scheduleAI() {
    if (isOnline()) return;          /* 联机时对面是真人，不跑 AI */
    if (aiTimer || busy) return;
    if (!state || state.phase !== 'playing') return;
    var u = G.currentUnit(state);
    if (!u || u.team !== G.ENEMY) return;
    aiTimer = setTimeout(function () {
      aiTimer = null;
      runAI();
    }, scaled(TIMING.aiStep));
  }

  function runAI() {
    if (!state || state.phase !== 'playing') return;
    var u = G.currentUnit(state);
    if (!u || u.team !== G.ENEMY) return;

    /* 同一个单位连续尝试 2 次都没走成，就让它待机，防止卡死 */
    if (aiStuckUid === u.uid) aiStuck += 1; else { aiStuckUid = u.uid; aiStuck = 0; }

    var act = G.chooseAction(state);
    var res = { ok: false };
    if (act && act.type === 'skill') {
      showSkillBanner(u, act.skillId);
      res = G.useSkill(state, act.skillId, act.targetUid);
    } else if (act && act.type === 'move') {
      res = G.moveActor(state, act.dir);
    }

    if (!res || !res.ok || aiStuck >= 2) {
      aiStuckUid = null; aiStuck = 0;
      G.skipTurn(state);
    }
    afterAction(u.uid);
  }

  /* ================= 交互 ================= */

  function resetTargeting() {
    mode = 'idle';
    pending = null;
    pendingItem = null;
    pendingAoe = false;
    validSet = null;
    hideAim();
  }

  function onSkill(item) {
    if (state.phase === 'over' || busy || !item.ready) return;
    var cur = G.currentUnit(state);
    if (!cur) return;
    if (isOnline() && !isMyTurn()) { el.hint.textContent = '还没轮到你行动'; return; }
    if (!isOnline() && cur.team !== G.PLAYER) return;

    if (mode === 'target' && pending === item.skill.id) {
      resetTargeting();
      renderBattle();
      return;
    }

    if (item.skill.target === 'self') {
      var me = G.currentUnit(state);
      showSkillBanner(me, item.skill.id);
      performSkill(item.skill.id, null);
      resetTargeting();
      afterAction(me && me.uid);
      return;
    }

    if (item.skill.random) {
      var me2 = G.currentUnit(state);
      showSkillBanner(me2, item.skill.id);
      var rres = performSkill(item.skill.id, null);
      if (!rres.ok) { el.hint.textContent = rres.error || '无法释放'; return; }
      resetTargeting();
      afterAction(me2 && me2.uid);
      return;
    }

    var targets = G.previewTargets(state, item.skill.id);
    if (!targets.length) {
      el.hint.textContent = '射程内没有目标';
      return;
    }
    mode = 'target';
    pending = item.skill.id;
    pendingAoe = !!item.skill.aoe;
    validSet = {};
    targets.forEach(function (uid) { validSet[uid] = true; });
    renderBattle();
    if (pendingAoe) hideAim();      /* 群体技能不画单条瞄准线 */
    else aimAt(targets[0]);
  }

  /* 道具：只能给自己用，而且不消耗回合，用完还能继续行动 */
  function startItem(type) {
    if (!state || state.phase === 'over' || busy) return;
    var actor = G.currentUnit(state);
    if (!actor || (isOnline() ? !isMyTurn() : actor.team !== G.PLAYER)) return;
    if ((state.items[type] || 0) <= 0) {
      el.hint.textContent = '这个道具已经用完了';
      return;
    }
    var kind = type === 'bandage' ? 'bleed' : 'blight';
    if (!actor.status[kind]) {
      el.hint.textContent = '你身上没有' + (type === 'bandage' ? '流血' : '腐蚀');
      return;
    }
    var res = performItem(type, actor.uid);
    if (!res.ok) { el.hint.textContent = res.error; return; }

    if(isGuest()&&remotePending){busy=true;renderBattle();return;}
    var events = drainEvents();
    pushSync(events);
    renderBattle();
    playEffects(events);
    el.hint.textContent = '已解除，还可以继续行动';
  }

  /* ---------- 瞄准线 ---------- */

  function aimNode() {
    return document.querySelector ? document.querySelector('.aim-line') : null;
  }

  function aimAt(uid) {
    var card = uid && document.querySelector ? document.querySelector('.card[data-uid="' + uid + '"]') : null;
    if (!card) return;
    var r = card.getBoundingClientRect();
    aimTo(r.left + r.width / 2, r.top + r.height / 2, card);
  }

  function aimTo(clientX, clientY, cardOverride) {
    var line = aimNode();
    if (!line || mode === 'idle' || !state) return;

    var actor = G.currentUnit(state);
    var stage = document.querySelector('.stage');
    var actorCard = actor && document.querySelector
      ? document.querySelector('.card[data-uid="' + actor.uid + '"]') : null;
    if (!stage || !actorCard) return;

    var sr = stage.getBoundingClientRect();
    var ar = actorCard.getBoundingClientRect();
    var x1 = ar.left + ar.width / 2 - sr.left;
    var y1 = ar.top + ar.height / 2 - sr.top;

    var card = cardOverride || null;
    if (!card && document.elementFromPoint) {
      var under = document.elementFromPoint(clientX, clientY);
      card = under && under.closest ? under.closest('.card') : null;
    }

    var x2, y2;
    if (card && validSet && validSet[card.dataset.uid]) {
      var cr = card.getBoundingClientRect();
      x2 = cr.left + cr.width / 2 - sr.left;
      y2 = cr.top + cr.height / 2 - sr.top;
    } else {
      x2 = clientX - sr.left;
      y2 = clientY - sr.top;
    }

    var dx = x2 - x1;
    var dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    line.style.width = len + 'px';
    line.style.transform = 'translate(' + x1 + 'px,' + y1 + 'px) rotate(' +
      (Math.atan2(dy, dx) * 180 / Math.PI) + 'deg)';
    line.classList.add('on');
  }

  function hideAim() {
    var line = aimNode();
    if (line) line.classList.remove('on');
  }

  /* 群体技能确认时，先让所有目标一起亮一下再结算 */
  function flashAoeTargets(uids) {
    if (!uids || !uids.length) return;
    uids.forEach(function (uid) {
      var card = document.querySelector ? document.querySelector('.card[data-uid="' + uid + '"]') : null;
      if (!card || !card.classList) return;
      card.classList.remove('aoe-fire');
      void card.offsetWidth;
      card.classList.add('aoe-fire');
    });
  }

  /* ---------- 游戏速度 ---------- */
  function applySpeed(v, save) {
    speed = GAME_SPEEDS.indexOf(v) >= 0 ? v : 1;
    if (save) { try { localStorage.setItem(SPEED_KEY, String(speed)); } catch (e) {} }
    var btn = document.getElementById('btn-speed');
    if (btn) {
      btn.textContent = (speed === 1 ? '1' : String(speed)) + '×';
      btn.title = '游戏速度 ' + speed + '×（点击切换）';
    }
    if (document.documentElement && document.documentElement.style) {
      document.documentElement.style.setProperty('--spd', String(1 / speed));
    }
  }

  function restoreSpeed() {
    var v = 1;
    try { v = parseFloat(localStorage.getItem(SPEED_KEY) || '1'); } catch (e) { v = 1; }
    applySpeed(v, false);
  }

  function cycleSpeed() {
    var i = GAME_SPEEDS.indexOf(speed);
    applySpeed(GAME_SPEEDS[(i + 1) % GAME_SPEEDS.length], true);
  }

  /* ---------- 单位详情弹窗 ---------- */
  function statCell(k, v) {
    var d = document.createElement('div');
    d.className = 'info-stat';
    if (k === '当前状态') d.classList.add('info-stat-wide');
    var a = document.createElement('span');
    a.className = 'k';
    a.textContent = k;
    var b = document.createElement('span');
    b.className = 'v';
    b.textContent = v;
    d.appendChild(a);
    d.appendChild(b);
    return d;
  }

  var infoAction = null;

  function placeFromInfo() {
    if (!infoAction || infoAction.type !== 'place') return;
    var empty = firstEmpty();
    if (empty < 0) {
      if (el.selectHint) el.selectHint.textContent = '四个位置都满了，先点掉一个再选';
      return;
    }
    slots[empty] = infoAction.id;
    renderSelect();
    flashSlot(empty);
    if (window.SFX) window.SFX.play('place');
    closeUnitInfo();
  }

  /* 选人界面的英雄介绍 */
  function openHeroInfo(heroId) {
    var hero = G.heroById(heroId);
    if (!hero || !el.info) return;
    infoAction = { type: 'place', id: heroId };
    showInfoArtwork(hero.id, hero.name);

    el.infoName.textContent = hero.name;
    el.infoMeta.textContent = (hero.role || '战斗单位') + ' · 生命 ' + hero.hp + ' · 速度 ' + hero.spd;
    if (el.infoLore) el.infoLore.textContent = hero.lore || '';

    el.infoStats.innerHTML = '';
    el.infoStats.appendChild(statCell('生命', String(hero.hp)));
    el.infoStats.appendChild(statCell('速度', String(hero.spd)));
    var crit = hero.crit != null ? hero.crit : (G.CRIT_BY_ROLE && G.CRIT_BY_ROLE[hero.role]) || 5;
    var dodge = hero.dodge != null ? hero.dodge : (G.DODGE_BY_ROLE && G.DODGE_BY_ROLE[hero.role]) || 5;
    el.infoStats.appendChild(statCell('暴击', crit + '%'));
    el.infoStats.appendChild(statCell('闪避', dodge + '%'));
    var res = hero.res || { stun: 0, bleed: 0, blight: 0, move: 0 };
    el.infoStats.appendChild(statCell('抗眩晕', res.stun + '%'));
    el.infoStats.appendChild(statCell('抗流血', res.bleed + '%'));
    el.infoStats.appendChild(statCell('抗腐蚀', res.blight + '%'));
    el.infoStats.appendChild(statCell('抗位移', res.move + '%'));

    el.infoSkills.innerHTML = '';
    (hero.skills || []).forEach(function (s) {
      var box = document.createElement('div');
      box.className = 'info-skill';

      var head = document.createElement('div');
      head.className = 'is-head';

      var nm = document.createElement('span');
      nm.className = 'is-name';
      nm.textContent = s.name;

      var tag = document.createElement('span');
      tag.className = 'is-tag';
      var lo = s.ranks[0], hi = s.ranks[s.ranks.length - 1];
      var rlo = s.targetRanks[0], rhi = s.targetRanks[s.targetRanks.length - 1];
      tag.textContent = '站位 ' + (lo === hi ? lo : lo + '–' + hi) +
        '　目标 ' + (s.target === 'self' ? '自己' : (rlo === rhi ? rlo : rlo + '–' + rhi) + ' 号位');

      head.appendChild(nm);
      head.appendChild(tag);

      var desc = document.createElement('div');
      desc.className = 'is-desc';
      desc.textContent = G.describe(s);

      box.appendChild(head);
      box.appendChild(desc);

      if (s.cd > 0 && !(G.CONFIG && G.CONFIG.noCooldown)) {
        var cd = document.createElement('div');
        cd.className = 'is-cd';
        cd.textContent = '冷却 ' + s.cd + ' 回合';
        box.appendChild(cd);
      }

      el.infoSkills.appendChild(box);
    });

    if (el.infoAction) {
      var already = slots.indexOf(heroId) >= 0;
      el.infoAction.textContent = already ? '已在队伍中' : '加入队伍';
      el.infoAction.disabled = already || firstEmpty() < 0;
      el.infoAction.classList.remove('hidden');
    }

    el.info.classList.remove('hidden');
    var infoBox = el.info.querySelector('.info-box');
    if (infoBox) infoBox.scrollTop = 0;
  }

  function openUnitInfo(unit) {
    if (!unit || !el.info) return;
    showInfoArtwork(unit.id, unit.name);

    infoAction = null;
    if (el.infoAction) el.infoAction.classList.add('hidden');
    var hero = G.heroById(unit.id);
    if (el.infoLore) el.infoLore.textContent = hero ? (hero.lore || '') : '';
    el.infoName.textContent = unit.name;

    var meta = (unit.team === G.PLAYER ? '我方' : '敌方') + ' · ' + unit.role;
    if (unit.elite) meta = '精英 · ' + meta;
    if (unit.guarding) {
      var _gr = (G.CONFIG && G.CONFIG.guardReduction) || 0.3;
      var _gt2 = Math.max(1, (unit.guarding.turns || 1) - 1);
      meta += ' · 守护中 ' + _gt2 + ' 回合（挡刀时受伤 -' + Math.round(_gr * 100) + '%）';
    }
    if (unit.corpse) meta += ' · 尸骸（带伤害的技能可以打掉）';
    else if (!unit.alive) meta += ' · 已阵亡';
    else meta += ' · 站在 ' + unit.rank + ' 号位';
    el.infoMeta.textContent = meta;

    el.infoStats.innerHTML = '';
    el.infoStats.appendChild(statCell('生命', unit.hp + ' / ' + unit.maxHp));
    el.infoStats.appendChild(statCell('速度', String(unit.spd)));
    el.infoStats.appendChild(statCell('暴击', unit.crit + '%'));
    el.infoStats.appendChild(statCell('闪避', G.effectiveDodge(unit) + '%'));
    el.infoStats.appendChild(statCell('抗眩晕', unit.res.stun + '%'));
    el.infoStats.appendChild(statCell('抗流血', unit.res.bleed + '%'));
    el.infoStats.appendChild(statCell('抗腐蚀', unit.res.blight + '%'));
    el.infoStats.appendChild(statCell('抗位移', unit.res.move + '%'));

    if (unit.dr) {
      el.infoStats.appendChild(statCell('直接伤害减免', '-' + Math.round(unit.dr * 100) + '%'));
    }
    if (unit.dmgK && unit.dmgK > 1) {
      el.infoStats.appendChild(statCell('蓄势加成', '+' + Math.round((unit.dmgK - 1) * 100) + '%'));
    }
    if (unit.lastStandK && unit.lastStandK > 1) {
      el.infoStats.appendChild(statCell('残阵加成', '+' + Math.round((unit.lastStandK - 1) * 100) + '% 伤害'));
    }

    var now = [];
    if (unit.status.stun > 0) now.push('眩晕');
    if (unit.status.bleed) now.push('流血 ' + unit.status.bleed.turns + ' 回合');
    if (unit.status.blight) now.push('腐蚀 ' + unit.status.blight.turns + ' 回合');
    if (unit.status.mark) now.push('标记 ' + unit.status.mark.turns + ' 回合');
    if (unit.status.dodgeDown) now.push('闪避降低 ' + unit.status.dodgeDown.amount + '%');
    if (unit.status.dodgeUp) now.push('潜没：闪避 +' + unit.status.dodgeUp.amount + '%，至下次行动结束');
    if (unit.forecastRank) now.push('正在预言第 ' + unit.forecastRank + ' 号位');
    if (unit.guarding) now.push('正在守护');
    if (now.length) el.infoStats.appendChild(statCell('当前状态', now.join('、')));

    el.infoSkills.innerHTML = '';
    (unit.skills || []).forEach(function (s) {
      var box = document.createElement('div');
      box.className = 'info-skill';

      var head = document.createElement('div');
      head.className = 'is-head';

      var nm = document.createElement('span');
      nm.className = 'is-name';
      nm.textContent = s.name;

      var tag = document.createElement('span');
      tag.className = 'is-tag';
      var lo = s.ranks[0], hi = s.ranks[s.ranks.length - 1];
      var rlo = s.targetRanks[0], rhi = s.targetRanks[s.targetRanks.length - 1];
      tag.textContent = '站位 ' + (lo === hi ? lo : lo + '–' + hi) +
        '　目标 ' + (s.target === 'self' ? '自己' : (rlo === rhi ? rlo : rlo + '–' + rhi) + ' 号位');

      head.appendChild(nm);
      head.appendChild(tag);

      var desc = document.createElement('div');
      desc.className = 'is-desc';
      desc.textContent = G.describe(s, unit);

      box.appendChild(head);
      box.appendChild(desc);

      if (s.cd > 0 && !(G.CONFIG && G.CONFIG.noCooldown)) {
        var cd = document.createElement('div');
        cd.className = 'is-cd';
        var left = unit.cd && unit.cd[s.id] ? unit.cd[s.id] : 0;
        cd.textContent = '冷却 ' + s.cd + ' 回合' + (left > 0 ? '（还剩 ' + left + '）' : '');
        box.appendChild(cd);
      }

      el.infoSkills.appendChild(box);
    });

    el.info.classList.remove('hidden');
    var infoBox = el.info.querySelector('.info-box');
    if (infoBox) infoBox.scrollTop = 0;
  }

  function closeUnitInfo() {
    if (el.info) el.info.classList.add('hidden');
  }
  function onCardClick(uid) {
    if (mode !== 'target') {
      var who = state && state.units.filter(function (x) { return x.uid === uid; })[0];
      openUnitInfo(who);
      return;
    }
    if (busy) return;
    if (mode === 'item') {
      if (!validSet || !validSet[uid]) return;
      var type = pendingItem;
      resetTargeting();
      performItem(type, uid);
      afterAction();
      return;
    }
    if (mode !== 'target' || !validSet || !validSet[uid]) return;
    var skillId = pending;
    var actor = G.currentUnit(state);
    var aoeUids = pendingAoe ? Object.keys(validSet) : null;
    resetTargeting();
    showSkillBanner(actor, skillId);
    performSkill(skillId, uid);
    afterAction(actor && actor.uid);
    if (aoeUids) flashAoeTargets(aoeUids);   /* 渲染之后再闪，否则会被重渲染清掉 */
  }

  /* ================= 标题 / 模式选择 ================= */

  function updateAudioStatus() {
    if (!el.titleAudio) return;
    var d = window.BGM && window.BGM.debug ? window.BGM.debug() : null;
    if (!d) { el.titleAudio.textContent = ''; return; }
    var text;
    if (!window.BGM.isOn()) text = 'BGM：已关闭';
    else if (d.volume === 0) text = 'BGM：音量为零';
    else if (d.pendingGesture) text = 'BGM：点击画面开始播放';
    else if (d.hasTrack && d.playing) text = 'BGM：' + d.src;
    else if (d.synthPlaying) text = 'BGM：备用音乐';
    else if (d.failed) text = 'BGM：音频不可用';
    else text = 'BGM：未播放';
    el.titleAudio.textContent = text;
  }

  function showTitle() {
    closeUnitInfo();
    var sb = document.getElementById('btn-speed');
    if (sb) sb.classList.add('hidden');
    soloMusic = false;
    if (window.BGM && window.BGM.setTrack) window.BGM.setTrack('normal');
    el.screenTitle.classList.remove('hidden');
    el.screenSelect.classList.add('hidden');
    el.screenBattle.classList.add('hidden');
    if (el.screenLobby) el.screenLobby.classList.add('hidden');
    el.overlay.classList.add('hidden');
    el.titleHint.textContent = '';
    var best = readBest();
    el.titleBest.textContent = best ? '最佳纪录：第 ' + best + ' 关' : '';
    updateAudioStatus();
    setTimeout(updateAudioStatus, 400);
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
    clearEndTimer();
  }

  var TIP_KEY = 'dd_sel_tip_v1';
  var tipActive = false;

  function maybeShowSelectTip() {
    try {
      if (localStorage.getItem(TIP_KEY) === '1') return;
    } catch (e) {}
    tipActive = true;
    if (el.selectHint) {
      el.selectHint.textContent = '点卡牌 → 看技能介绍　|　长按卡牌 → 拖到上方槽位　|　点槽位里的卡 → 移回卡池';
      el.selectHint.classList.add('tip-strong');
    }
  }

  function clearSelectTip() {
    if (!tipActive) return;
    tipActive = false;
    try { localStorage.setItem(TIP_KEY, '1'); } catch (e) {}
    if (el.selectHint) el.selectHint.classList.remove('tip-strong');
  }

  function enterSelect() {
    var sb0 = document.getElementById('btn-speed');
    if (sb0) sb0.classList.remove('hidden');
    el.titleHint.textContent = '';
    el.screenTitle.classList.add('hidden');
    el.screenSelect.classList.remove('hidden');
    el.screenBattle.classList.add('hidden');
    if(el.screenLobby)el.screenLobby.classList.add('hidden');
    if (isOnline()) {
      online.myReady = false;
      online.peerReady = false;
      online.myTeam = null;
      online.peerTeam = null;
      if (el.start) { el.start.disabled = false; el.start.textContent = '准备'; }
      el.selectHint.textContent = isHost() ? '选好队伍后点「准备」，等待对手…' : '选好队伍后点「准备」';
    }
    renderSelect();
    maybeShowSelectTip();
  }

  /* ================= 流程：联机对战 ================= */

  var remotePending=false;
  var online = {
    myTeam: null,          /* 我选的四人 */
    peerTeam: null,        /* 对手的四人 */
    myReady: false,
    peerReady: false,
    seed: 0
  };

  function isHost() { return playMode === 'host'; }
  function isGuest() { return playMode === 'guest'; }
  function isOnline() { return playMode === 'host' || playMode === 'guest'; }

  /* 当前行动者是不是“我” */
  function isMyTurn() {
    if (!state || state.phase !== 'playing') return false;
    if (!isOnline()) return true;
    if(Net.state()!=='online')return false;
    var cur = G.currentUnit(state);
    if (!cur) return false;
    return isHost() ? cur.team === G.PLAYER : cur.team === G.ENEMY;
  }

  /* 动作统一入口：联机时房客不本地结算，改为把意图发给房主 */
  function performSkill(skillId, targetUid) {
    if (isGuest()) {
      remotePending=true;
      Net.send({ t: 'action', skillId: skillId, targetUid: targetUid == null ? null : targetUid });
      return { ok: true, remote: true };
    }
    return G.useSkill(state, skillId, targetUid);
  }

  function performMove(dir) {
    if (isGuest()) { remotePending=true;Net.send({ t: 'move', dir: dir }); return { ok: true, remote: true }; }
    return G.moveActor(state, dir);
  }

  function performItem(item, targetUid) {
    if (isGuest()) { remotePending=true;Net.send({ t: 'item', item: item, targetUid: targetUid || null }); return { ok: true, remote: true }; }
    return G.useItem(state, item, targetUid);
  }

  /* 房主：把整份状态发给对手（引擎状态是纯数据，直接 JSON 即可） */
  function pushSync(events) {
    if (!isHost()) return;
    Net.send({ t: 'sync', state: state, events: events || [] });
  }

  /* 房客：收到房主的状态后重建本地视图 */
  function applySync(msg) {
    if (!isGuest()) return;
    remotePending=false;
    state = msg.state;
    state.events = msg.events || [];
    busy = false;
    resetTargeting();
    afterAction.apply(null, [null]);
  }

  /* ---------- 联机：选人 -> 开局 ---------- */

  function myTeamIds() {
    return slots.filter(Boolean).slice(0, 4);
  }

  function onlineReady() {
    if (!isFull()) { el.selectHint.textContent = '先选满四个人'; return; }
    online.myTeam = myTeamIds();
    online.myReady = true;
    Net.send({ t: 'team', team: online.myTeam });
    el.selectHint.textContent = '已准备，等待对手…';
    if (el.start) { el.start.disabled = true; el.start.textContent = '已准备'; }
    if (isHost() && online.peerReady) startOnlineBattle();
  }

  function startOnlineBattle() {
    if (!isHost() || !online.myTeam || !online.peerTeam) return;
    remotePending=false;
    online.seed = (Date.now() % 2147483647) >>> 0;
    Net.send({ t: 'start', seed: online.seed, hostTeam: online.myTeam, guestTeam: online.peerTeam });
    beginOnlineStage(online.myTeam, online.peerTeam, online.seed);
    pushSync([]);
  }

  function beginOnlineStage(hostTeam, guestTeam, seed) {
    state = G.createState(hostTeam, guestTeam, {
      stage: 1,
      seed: seed,
      player: hostTeam.map(function (id) { var h = heroOf(id); return { id: id, hp: h.hp, maxHp: h.hp }; })
    });
    mode = 'idle';
    busy = false;
    lastSide = null;
    el.screenSelect.classList.add('hidden');
    el.screenBattle.classList.remove('hidden');
    el.overlay.classList.add('hidden');
    if (el.stageLabel) el.stageLabel.textContent = '联机 · ' + (isHost() ? '你操作右侧队伍' : '你操作左侧队伍');
    renderBattle();
    beginTurn();
  }

  /* ================= 流程：联机大厅 ================= */

  var playMode = 'solo';        /* solo | host | guest */
  var netRoom = '';
  var peers = { host: false, guest: false };

  function roomCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function lobbyStatus(text, tone) {
    if (!el.lobbyStatus) return;
    el.lobbyStatus.textContent = text;
    el.lobbyStatus.className = 'lobby-status' + (tone ? ' ' + tone : '');
  }

  function renderSeats() {
    if (!el.lobbySeats) return;
    el.lobbySeats.innerHTML = '';
    [['host', '房主'], ['guest', '对手']].forEach(function (pair) {
      var d = document.createElement('div');
      d.className = 'lobby-seat' + (peers[pair[0]] ? ' filled' : '');
      d.textContent = pair[1] + (peers[pair[0]] ? ' 已就位' : ' 等待中');
      el.lobbySeats.appendChild(d);
    });
  }

  function savedServer() {
    try { return localStorage.getItem('dd_ws') || ''; } catch (e) { return ''; }
  }

  function saveServer(url) {
    var clean = (url || '').trim().replace(/\/+$/, '');
    if (clean && !/^wss?:\/\/.+/i.test(clean)) {
      lobbyStatus('地址要以 ws:// 或 wss:// 开头', 'err');
      return false;
    }
    try { localStorage.setItem('dd_ws', clean); } catch (e) {}
    if (window.Net) Net.config({ base: clean });
    return true;
  }

  function openLobby() {
    el.screenTitle.classList.add('hidden');
    el.screenSelect.classList.add('hidden');
    el.screenBattle.classList.add('hidden');
    if (el.screenLobby) el.screenLobby.classList.remove('hidden');
    if (el.lobbyRoom) el.lobbyRoom.classList.add('hidden');
    if (el.serverInput && !el.serverInput.value) el.serverInput.value = savedServer();
    renderSeats();
    if (!window.Net || !Net.hasServer()) {
      lobbyStatus('还没有服务器地址，展开下面「服务器设置」填一个', 'err');
      var box = document.querySelector ? document.querySelector('.lobby-server') : null;
      if (box) box.open = true;
      if (el.serverInput && !el.serverInput.value) el.serverInput.value = savedServer();
    } else {
      lobbyStatus('未连接');
    }
  }

  function closeLobby() {
    if (el.screenLobby) el.screenLobby.classList.add('hidden');
    if (window.Net) Net.close();
    playMode = 'solo';
  }

  function startHosting(code) {
    playMode = 'host';
    netRoom = code;
    peers = { host: false, guest: false };
    if (el.lobbyRoom) el.lobbyRoom.classList.remove('hidden');
    if (el.lobbyCode) el.lobbyCode.textContent = code;
    renderSeats();
    lobbyStatus('连接中…');
    Net.connect(code);
  }

  function startJoining(code) {
    playMode = 'guest';
    netRoom = code;
    peers = { host: false, guest: false };
    if (el.lobbyRoom) el.lobbyRoom.classList.remove('hidden');
    if (el.lobbyCode) el.lobbyCode.textContent = code;
    renderSeats();
    lobbyStatus('连接中…');
    Net.connect(code);
  }

  function bindLobby() {
    if (!el.btnCreateRoom) return;
    el.btnCreateRoom.addEventListener('click', function () {
      if (!window.Net || !Net.hasServer()) { lobbyStatus('未配置联机服务器', 'err'); return; }
      startHosting(roomCode());
    });
    el.btnJoinRoom.addEventListener('click', function () {
      if (!window.Net || !Net.hasServer()) { lobbyStatus('未配置联机服务器', 'err'); return; }
      var code = (el.roomInput && el.roomInput.value || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{4,6}$/.test(code)) { lobbyStatus('房间码是 4-6 位字母数字', 'err'); return; }
      startJoining(code);
    });
    el.roomInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') el.btnJoinRoom.click();
    });
    el.btnCopyRoom.addEventListener('click', function () {
      var link = location.origin + location.pathname + '?room=' + netRoom;
      if (navigator.clipboard) navigator.clipboard.writeText(link);
      lobbyStatus('邀请链接已复制', 'ok');
    });
    if (el.btnSaveServer) {
      el.btnSaveServer.addEventListener('click', function () {
        if (saveServer(el.serverInput && el.serverInput.value)) {
          lobbyStatus('服务器地址已保存', 'ok');
        }
      });
    }

    el.btnLobbyBack.addEventListener('click', function () {
      closeLobby();
      showTitle();
    });

    if (!window.Net) return;
    Net.on('state', function (s) {
      if (s.state === 'online') {
        playMode = Net.seat() || playMode;
        lobbyStatus('已连接，等待对手…', 'ok');
      } else if (s.state === 'closed') {
        lobbyStatus('连接断开', 'err');
      }
    });
    Net.on('seated', function (msg) {
      peers[msg.seat === 'host' ? 'host' : 'guest'] = true;
      playMode = msg.seat;
      renderSeats();
      lobbyStatus(msg.seat === 'host' ? '你是房主，等待对手加入…' : '你是挑战者，等待房主…', 'ok');
    });
    Net.on('peers', function (msg) {
      peers.host = !!msg.host;
      peers.guest = !!msg.guest;
      renderSeats();
      if (peers.host && peers.guest) {
        lobbyStatus('双方已就位，进入布阵…', 'ok');
        setTimeout(function () { if (isOnline()) enterSelect(); }, 500);
      }
    });
    Net.on('left', function () {
      lobbyStatus('对手离开了房间', 'err');
      peers.guest = playMode === 'host' ? false : peers.guest;
      peers.host = playMode === 'guest' ? false : peers.host;
      renderSeats();
    });
    Net.on('error', function (e) {
      lobbyStatus(e.message || '连接出错', 'err');
    });

    /* ---------- 联机对局消息 ---------- */
    Net.on('peer:team', function (msg) {
      if (!Array.isArray(msg.team) || msg.team.length !== 4) return;
      online.peerTeam = msg.team;
      online.peerReady = true;
      if (isHost() && online.myReady) startOnlineBattle();
      else if (el.selectHint && isOnline()) el.selectHint.textContent = '对手已准备…';
    });

    Net.on('peer:start', function (msg) {
      if (!isGuest()) return;
      online.myTeam = msg.guestTeam;
      online.peerTeam = msg.hostTeam;
      online.seed = msg.seed;
      beginOnlineStage(msg.hostTeam, msg.guestTeam, msg.seed);
    });

    Net.on('peer:sync', function (msg) {
      if (!isGuest() || !msg || !msg.state) return;
      applySync(msg);
    });

    function acceptGuestAction(msg){if(!isHost()||!state||state.phase!=='playing')return false;if(busy||msg.revision!==Net.revision()){pushSync([]);return false;}return true;}
    Net.on('peer:action', function (msg) {
      if(!acceptGuestAction(msg))return;
      if (!isHost() || !state || state.phase !== 'playing') return;
      var cur = G.currentUnit(state);
      if (!cur || cur.team !== G.ENEMY) return;          /* 不是对手的回合 */
      showSkillBanner(cur, msg.skillId);
      var r = G.useSkill(state, msg.skillId, msg.targetUid);
      if (!r.ok){pushSync([]);return;}
      afterAction(cur.uid);
    });

    Net.on('peer:move', function (msg) {
      if(!acceptGuestAction(msg))return;
      if (!isHost() || !state || state.phase !== 'playing') return;
      var cur = G.currentUnit(state);
      if (!cur || cur.team !== G.ENEMY) return;
      if (G.moveActor(state, msg.dir).ok) afterAction(cur.uid);else pushSync([]);
    });

    Net.on('peer:skip',function(msg){if(!acceptGuestAction(msg))return;var cur=G.currentUnit(state);if(cur&&cur.team===G.ENEMY&&G.skipTurn(state).ok)afterAction(cur.uid);});
    Net.on('peer:item', function (msg) {
      if(!acceptGuestAction(msg))return;
      if (!isHost() || !state || state.phase !== 'playing') return;
      var cur = G.currentUnit(state);
      if (!cur || cur.team !== G.ENEMY) return;
      if (G.useItem(state, msg.item, msg.targetUid).ok) afterAction(cur.uid);else pushSync([]);
    });

    Net.on('left', function () {
      if (isOnline() && state && state.phase === 'playing') {
        showEnd('对手掉线', '对手已离开房间');
      }
    });
  }

  /* ================= 流程：单机 Roguelike ================= */

  var run = null;
  var chosenRewards = [];   /* { stage, region, roster: [{id, hp, maxHp, items}] } */
  var BEST_KEY = 'dd_web_best_stage';

  function readBest() {
    try { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; }
    catch (e) { return 0; }
  }
  function saveBest(n) {
    try { if (n > readBest()) localStorage.setItem(BEST_KEY, String(n)); }
    catch (e) {}
  }

  var REWARDS = [
    { id: 'heal',   name: '治疗', desc: '全员回复 80% 生命', core: true },
    { id: 'supply', name: '补给', desc: '全队 +3 绷带 / +3 解毒药（上限 10）', core: true },
    { id: 'vigor',  name: '锻炼', desc: '全员最大生命 +8（当前血量不变）', core: true },
    { id: 'keen',   name: '锐意', desc: '全员暴击率 +4%' },
    { id: 'swift',  name: '疾行', desc: '全员速度 +1（更容易先手）' },
    { id: 'power',  name: '蓄势', desc: '全员伤害 +8%（含直伤、流血、腐蚀，伤害向上取整）' },
    { id: 'ward',   name: '坚壁', desc: '全员直接伤害减免 +8%（累计上限 50%）' }
  ];

  function rewardAvailable(reward) {
    return reward.id !== 'ward' || ((run.bonus && run.bonus.dr) || 0) < G.CONFIG.rewardDrCap;
  }

  function rewardDescription(reward) {
    if (reward.id === 'power') {
      var damageBonus = (run.bonus && run.bonus.dmg) || 0;
      return '全员伤害 +8%（累计 ' + Math.round(damageBonus * 100) + '% → ' +
        Math.round((damageBonus + 0.08) * 100) + '%；含直伤、流血、腐蚀，伤害向上取整）';
    }
    if (reward.id !== 'ward') return reward.desc;
    var current = ((run.bonus && run.bonus.dr) || 0);
    var next = G.nextWardReduction(current);
    return '全员直接伤害减免 +' + Math.round((next - current) * 100) + '%（' +
      Math.round(current * 100) + '% → ' + Math.round(next * 100) + '%，累计上限 50%）';
  }

  function clearEndTimer() {
    if (endTimer) { clearTimeout(endTimer); endTimer = null; }
  }

  function startRun() {
    if (!isFull()) return;
    if (isOnline()) { onlineReady(); return; }
    if (!G.ENEMIES || !G.ENEMIES.length) {
      el.selectHint.textContent = '敌人数据没加载成功：检查 data/enemies.js 是否存在';
      return;
    }
    clearEndTimer();
    run = {
      stage: 1,
      bonus: { crit: 0, spd: 0, dmg: 0, dr: 0 },
      fallen: [],
      region: '',
      items: { bandage: 6, antidote: 6 },
      roster: slots.filter(Boolean).map(function (id) {
        var h = heroOf(id);
        return { id: id, hp: h.hp, maxHp: h.hp };
      })
    };
    el.screenSelect.classList.add('hidden');
    el.screenBattle.classList.remove('hidden');
    el.overlay.classList.add('hidden');
    startStage();
  }

  function startStage() {
    var squad = G.buildSquad(run.stage);
    var bossName = squad.boss ? G.heroById(squad.ids[0]).name : '';
    run.region = squad.region;
    var ids = run.roster.map(function (r) { return r.id; });
    state = G.createState(ids, squad.ids, {
      enemyScale: squad.scale, stage: run.stage,
      bonus: run.bonus,
      player: run.roster,
      items: run.items
    });
    resetTargeting();
    clearEndTimer();

    var lsUnit = state.units.filter(function (x) { return x.team === G.PLAYER && x.lastStandK > 1; })[0];
    if (lsUnit) {
      state.log.push({
        text: '队伍只剩 ' + state.units.filter(function (x) { return x.team === G.PLAYER; }).length +
              ' 人，全队伤害 +' + Math.round((lsUnit.lastStandK - 1) * 100) + '%（残阵强化）',
        hl: true
      });
    }
    closeUnitInfo();
    el.stageLabel.textContent = '第 ' + run.stage + ' 关 · ' + squad.region +
      (squad.boss ? ' · BOSS：' + bossName : '');
    el.overlay.classList.add('hidden');
    lastSide = null;
    busy = false;
    /* 先播地点提示，再开始第一个回合 */
    busy = true;
    renderBattle();
    showAreaBanner(squad.region, run.stage, squad.boss, bossName);
    setTimeout(function () {
      busy = false;
      beginTurn();
      playEffects(drainEvents());
    }, scaled(TIMING.areaHold));
  }

  function handleBattleEnd() {
    if (!state || state.phase !== 'over' || endedState === state) return;
    endedState = state;
    clearEndTimer();
    if (isOnline()) {
      var iWin = isHost() ? state.winner === 'player' : state.winner === 'enemy';
      var draw = state.winner === 'draw' || !state.winner;
      showEnd(draw ? '平局' : (iWin ? '你赢了' : '你输了'),
        draw ? '双方都没能结束战斗' : (iWin ? '对手的队伍被击溃' : '你的队伍被击溃'));
      return;
    }
    if (!run) return;
    if (state.winner === G.PLAYER) {
      if (state.items) run.items = { bandage: state.items.bandage, antidote: state.items.antidote };
      /* 永久死亡：阵亡的队友不会回来，队伍会越打越少 */
      var fallen = state.units
        .filter(function (u) { return u.team === G.PLAYER && !u.alive; })
        .map(function (u) { return u.name; });
      run.fallen = fallen;
      run.roster = state.units
        .filter(function (u) { return u.team === G.PLAYER && u.alive; })
        .map(function (u) {
          return { id: u.id, hp: u.hp, maxHp: u.maxHp };
        });
      saveBest(run.stage);
      // 过关小憩：回复 40% 上限（会显示在奖励面板上）
      run.roster.forEach(function (r) {
        r.hp = Math.min(r.maxHp, r.hp + Math.ceil(r.maxHp * CONFIG_REST));
      });
      showRewards();
    } else {
      saveBest(run.stage);
      showEnd('全军覆没', '倒在' + (run.region || '') + ' · 第 ' + run.stage + ' 关　|　最佳纪录：第 ' + readBest() + ' 关');
    }
  }

  function showRewards() {
    el.overlayTitle.textContent = '第 ' + run.stage + ' 关 通过';
    var sub = '剩余 ' + run.roster.length + ' 人 · 过关小憩已回复 ' + Math.round(CONFIG_REST * 100) + '% 生命 · 再选一项奖励继续';
    if (run.fallen && run.fallen.length) {
      sub += '\n本关阵亡：' + run.fallen.join('、') + '（不会复活）';
    }
    el.overlaySub.textContent = sub;
    el.rewardList.innerHTML = '';
    var shuffle = function (arr) { return arr.slice().sort(function () { return Math.random() - 0.5; }); };
    var core = REWARDS.filter(function (r) { return r.core; });
    var extra = REWARDS.filter(function (r) { return !r.core && rewardAvailable(r); });
    var shown = shuffle([shuffle(core)[0]].concat(shuffle(extra).slice(0, 2)));
    chosenRewards = shown;
    shown.forEach(function (r) {
      var btn = document.createElement('button');
      btn.className = 'reward';
      var nm = document.createElement('span');
      nm.className = 'reward-name';
      nm.textContent = r.name;
      var ds = document.createElement('span');
      ds.className = 'reward-desc';
      ds.textContent = rewardDescription(r);
      btn.appendChild(nm);
      btn.appendChild(ds);
      btn.addEventListener('click', function () { applyReward(r.id); });
      el.rewardList.appendChild(btn);
    });
    el.rewardList.classList.remove('hidden');
    el.overlayActions.classList.add('hidden');
    el.overlay.classList.remove('hidden');
  }

  function applyReward(type) {
    if (!run.bonus) run.bonus = { crit: 0, spd: 0, dmg: 0, dr: 0 };
    if (!rewardAvailable({ id: type })) return;
    run.roster.forEach(function (r) {
      if (type === 'heal') {
        r.hp = Math.min(r.maxHp, r.hp + Math.ceil(r.maxHp * 0.8));
      } else if (type === 'vigor') {
        r.maxHp += 8;
      }
    });
    if (type === 'keen') run.bonus.crit += 4;
    if (type === 'swift') run.bonus.spd += 1;
    if (type === 'power') run.bonus.dmg = Math.round(((run.bonus.dmg || 0) + 0.08) * 100) / 100;
    if (type === 'ward') run.bonus.dr = G.nextWardReduction(run.bonus.dr);
    if (type === 'supply') {
      run.items.bandage = Math.min(10, run.items.bandage + 3);
      run.items.antidote = Math.min(10, run.items.antidote + 3);
    }
    run.stage += 1;
    startStage();
  }

  function showEnd(title, sub) {
    el.overlayTitle.textContent = title;
    el.overlaySub.textContent = sub;
    el.rewardList.classList.add('hidden');
    el.overlayActions.classList.remove('hidden');
    el.again.textContent = '重新开始';
    el.overlay.classList.remove('hidden');
  }

  function backToSelect() {
    clearEndTimer();
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
    run = null;
    el.overlay.classList.add('hidden');
    el.screenBattle.classList.add('hidden');
    el.screenSelect.classList.remove('hidden');
    resetTargeting();
    renderSelect();
  }

  el.modeSolo.addEventListener('click', safe(enterSelect));
  el.modePvp.addEventListener('click', safe(openLobby));
  el.btnTitle.addEventListener('click', safe(showTitle));
  bindLobby();

  /* 邀请链接：?room=ABCD 直接进大厅 */
  (function autoJoin() {
    var q = /[?&]room=([A-Za-z0-9]{4,6})/.exec(location.search || '');
    if (!q) return;
    var code = q[1].toUpperCase();
    setTimeout(function () {
      openLobby();
      if (el.roomInput) el.roomInput.value = code;
      startJoining(code);
    }, 60);
  })();

  /* 委托兜底：任何情况下点这两个按钮都能进入 */
  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    if (t.closest('#btn-mode-solo')) safe(enterSelect)();
    else if (t.closest('#btn-mode-pvp')) {
      /* Socket.IO lobby is enabled above. */
    }
  });

  el.start.addEventListener('click', startRun);
  el.restart.addEventListener('click', backToSelect);
  el.again.addEventListener('click', backToSelect);
  if (el.back) el.back.addEventListener('click', backToSelect);

  function doMove(dir) {
    if (state.phase === 'over' || busy) return;
    var cur = G.currentUnit(state);
    if (!cur || (isOnline() ? !isMyTurn() : cur.team !== G.PLAYER)) return;
    resetTargeting();
    var r = performMove(dir);
    if (!r.ok) { el.hint.textContent = r.error === '已经到边' ? '已经站在边上了' : '无法移动'; return; }
    afterAction();
  }

  el.skip.addEventListener('click', function () {
    if (!state || state.phase === 'over' || busy) return;
    var cur = G.currentUnit(state);
    if (!cur || (isOnline() ? !isMyTurn() : cur.team !== G.PLAYER)) return;
    resetTargeting();
    if(isGuest()){remotePending=true;Net.send({t:'skip'});}else G.skipTurn(state);
    afterAction(cur.uid);
  });

  ['btn-bgm', 'btn-sfx'].forEach(function (id) {
    var b = document.getElementById(id);
    if (b) b.addEventListener('click', function () { setTimeout(updateAudioStatus, 80); });
  });

  if (el.infoAction) el.infoAction.addEventListener('click', function (e) {
    if (e && e.stopPropagation) e.stopPropagation();
    placeFromInfo();
  });

  var speedBtn = document.getElementById('btn-speed');
  if (speedBtn) speedBtn.addEventListener('click', function () { cycleSpeed(); });
  restoreSpeed();

  el.forward.addEventListener('click', function () { doMove(-1); });
  el.moveBack.addEventListener('click', function () { doMove(1); });

  if (el.infoClose) el.infoClose.addEventListener('click', closeUnitInfo);
  if (el.info) {
    el.info.addEventListener('click', function (ev) {
      if (ev.target === el.info) closeUnitInfo();   /* 点背景关闭 */
    });
  }
  window.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') closeUnitInfo();
  });

  el.cancel.addEventListener('click', function () {
    resetTargeting();
    renderBattle();
  });

  el.aoe.addEventListener('click', function () {
    if (mode !== 'target' || !pendingAoe || busy) return;
    var actor = G.currentUnit(state);
    var id = pending;
    var aoeUids = Object.keys(validSet || {});
    resetTargeting();
    showSkillBanner(actor, id);
    performSkill(id, null);
    afterAction(actor && actor.uid);
    flashAoeTargets(aoeUids);
  });

  el.itemBandage.addEventListener('click', function () { startItem('bandage'); });
  el.itemAntidote.addEventListener('click', function () { startItem('antidote'); });

  (function bindAim() {
    var stage = document.querySelector ? document.querySelector('.stage') : null;
    if (!stage || !stage.addEventListener) return;
    stage.addEventListener('pointermove', function (e) {
      if (mode === 'idle') return;
      aimTo(e.clientX, e.clientY);
    });
  })();

  el.random.addEventListener('click', function () {
    var team = G.randomTeam([], TEAM_SIZE);
    slots = [team[0] || null, team[1] || null, team[2] || null, team[3] || null];
    renderSelect();
  });

  el.auto.addEventListener('click', function () {
    if (!isFull()) return;
    var ordered = G.bestOrder(slots.slice());
    slots = [ordered[0], ordered[1], ordered[2], ordered[3]];
    renderSelect();
  });

  el.clear.addEventListener('click', function () {
    slots = [null, null, null, null];
    renderSelect();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && mode === 'target') {
      resetTargeting();
      renderBattle();
    }
  });

  /* 调试用：控制台可以 __dd.state 查看当前战斗 */
  window.__dd = {
    get state() { return state; },
    get run() { return run; },
    get playMode() { return playMode; },
    get online() { return online; },
    get busy() { return busy; },
    get targetMode() { return mode; },
    syncMusic: function () { syncSoloMusic(); },
    render: function () { renderBattle(); },
    trySfx: function (events) { playActionSfx(events); },
    doorDemo: function () {
      showDeathBanner('十字军 进入死门', 'door', '每回合 50% 概率倒下　·　再受伤做 50% 判定　·　治疗回血即可脱离');
    },
    previewBoss: function () {
      showAreaBanner('荒野', 5, true);
      showSkillBanner({ name: '死灵法师', boss: true, skills: [{ id: 'preview', name: '亡者之息' }] }, 'preview');
    }
  };

  setInterval(updateAudioStatus, 900);

  renderSelect();
  showTitle();
})();

