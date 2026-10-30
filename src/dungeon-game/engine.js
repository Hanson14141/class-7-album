
/* 暗黑地牢 · 网页对战原型 —— 纯逻辑层，不碰 DOM */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Game = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var HEROES = root.HEROES || [];
  var ENEMIES = root.ENEMIES || [];
  var CONFIG = {
    corpseTurns: 3,
    lastStand: 0.10,   /* 每少一名队友，全队伤害与治疗 +10% */
    deathDoorChance: 0.5,   /* 死门每回合的死亡概率 */
    deathDoor: true,        /* 死门机制开关（关闭则血量归零直接死亡） */
    playerCorpses: true,    /* 英雄阵亡是否留下尸骸（false 则直接清空位置） */
    noCooldown: true,        /* 技能不消耗冷却（全部视为 CD 0） */
    markCrit: 15,            /* 被标记的目标被攻击时，暴击率额外 +15% */
    aoeMaxTargets: 2,         /* 群体攻击技能最多命中几个目标（群体治疗不限制） */
    guardTurns: 2,            /* 守护持续几个回合（从守护者的回合开始计算） */
    eliteChance: 0.20,       /* 第 3 关起，每关 20% 概率出一只精英 */
    eliteMinStage: 3,
    bossSummonScaleCap: 1.4, /* 召唤物不随后期关卡无限膨胀 */
    firstBossHpMultiplier: 0.85, /* 第 5 关 BOSS 生命额外降低 15%，后续 BOSS 不受影响 */
    minionHpGrowth: 1.06,    /* 第 5 关起，小兵每关生命 ×1.08（复利） */
    minionAtkGrowth: 1.05,   /* 第 5 关起，小兵每关伤害 ×1.06（复利，含流血/腐蚀） */
    doorHitChance: 0.5,     /* 死门中受到伤害时的死亡判定 */
    maxRounds: 20,
    teamSize: 4,
    guardReduction: 0.3,   /* 替队友挡刀时，守护者受到的伤害 -30% */
    rewardDrCap: 0.5,      /* 坚壁奖励最多累计 50% 常驻直接减伤 */
    damageReductionCap: 0.8, /* 含守护等效果，总直接减伤最多 80% */
    dotTurns: 2
  };
  var PLAYER = 'player';
  var ENEMY = 'enemy';

  function other(team) { return team === PLAYER ? ENEMY : PLAYER; }

  function nextWardReduction(current) {
    return Math.min(CONFIG.rewardDrCap, Math.round((Math.max(0, current || 0) + 0.08) * 100) / 100);
  }

  /* ---------- 确定性随机（联机/回放需要） ----------
   * 所有战斗内的随机数都走这里，state.rngState 就是随机数种子。
   * 同种子 + 同操作序列 = 完全相同的战斗。
   */
  function nextRand(holder) {
    holder.rngState = (holder.rngState + 0x6D2B79F5) >>> 0;
    var t = holder.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function newSeed() {
    return ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0) || 1;
  }

  function heroById(id) {
    for (var i = 0; i < HEROES.length; i++) if (HEROES[i].id === id) return HEROES[i];
    for (var j = 0; j < ENEMIES.length; j++) if (ENEMIES[j].id === id) return ENEMIES[j];
    return null;
  }

  /* ---------- 关卡与敌人队伍 ---------- */
  /* 每个地区 3 套阵容，进关时随机抽一套 */
  var REGIONS = [
    { name: '废墟', variants: [
      ['bone_defender', 'bone_soldier', 'bone_courtier', 'bone_arbalest'],
      ['bone_soldier', 'bone_spearman', 'bone_acolyte', 'bone_arbalest'],
      ['bone_defender', 'bone_spearman', 'bone_courtier', 'bone_arbalest']
    ]},
    { name: '荒野', variants: [
      ['brigand_cutthroat', 'madman', 'fungal_artillery', 'brigand_fusilier'],
      ['rabid_dog', 'brigand_bloodletter', 'fungal_artillery', 'brigand_fusilier'],
      ['brigand_bloodletter', 'brigand_cutthroat', 'madman', 'brigand_fusilier']
    ]},
    { name: '猪圈', variants: [
      ['ghoul', 'swine_slasher', 'swine_wretch', 'maggot'],
      ['bloated_corpse', 'swine_slasher', 'swine_skiver', 'maggot'],
      ['ghoul', 'bloated_corpse', 'swine_skiver', 'swine_wretch']
    ]},
    { name: '海湾', variants: [
      ['pelagic_grouper', 'drowned', 'spider', 'pelagic_shaman'],
      ['pelagic_fighter', 'drowned', 'spider', 'pelagic_shaman'],
      ['pelagic_grouper', 'pelagic_fighter', 'spider', 'pelagic_shaman']
    ]},
    { name: '深渊', variants: [
      ['ghoul', 'swine_slasher', 'bone_arbalest', 'pelagic_shaman'],
      ['bloated_corpse', 'pelagic_fighter', 'brigand_fusilier', 'pelagic_shaman'],
      ['ghoul', 'brigand_bloodletter', 'fungal_artillery', 'pelagic_shaman']
    ]}
  ];

  /* 地区完全随机：每次从候选里抽一个，避免和上一关重复 */
  var lastRegionIdx = -1;
  function pickRegionIndex(stage) {
    var pool = [0, 1, 2, 3];
    if (stage >= 6) pool.push(4);          /* 深渊是混编精英，第 6 关之后才可能遇到 */
    var candidates = pool.filter(function (i) { return i !== lastRegionIdx; });
    if (!candidates.length) candidates = pool;
    var idx = candidates[Math.floor(Math.random() * candidates.length)];
    lastRegionIdx = idx;
    return idx;
  }

  /* 无尽模式：前 10 关每关 +2%，第 11 关起每关 +10% */
  function stageScale(stage) {
    var early = Math.min(stage, 10) - 1;
    var late = Math.max(0, stage - 10);
    return 1 + 0.02 * early + 0.10 * late;
  }

  /* BOSS 独立成长：第 5、10、15 关依次增强，第 15 关后缓慢线性增长。 */
  function bossScale(stage) {
    if (stage <= 5) {
      var first = Math.max(0, stage - 1) / 4;
      return { hp: 1 + 0.5 * first, dmg: 1 + 0.3 * first };
    }
    if (stage <= 10) {
      var second = (stage - 5) / 5;
      return { hp: 1.5 + 0.3 * second, dmg: 1.3 + 0.15 * second };
    }
    if (stage <= 15) {
      var third = (stage - 10) / 5;
      return { hp: 1.8 + 0.2 * third, dmg: 1.45 + 0.15 * third };
    }
    return { hp: 2 + 0.04 * (stage - 15), dmg: 1.6 + 0.025 * (stage - 15) };
  }

  var BOSS_STAGES = ['swine_king', 'siren', 'necromancer', 'crocodile', 'prophet', 'collector', 'brigand_pounder', 'sleeper'];

  var lastBossId = null;

  function buildSquad(stage) {
    if (stage % 5 === 0) {
      var pool = BOSS_STAGES.filter(function (id) { return id !== lastBossId; });
      if (!pool.length) pool = BOSS_STAGES;
      var bossId = pool[Math.floor(Math.random() * pool.length)];
      lastBossId = bossId;
      var bossHero = heroById(bossId);
      return {
        stage: stage,
        region: bossHero && bossHero.region ? bossHero.region : '深渊',
        ids: [bossId],
        scale: stageScale(stage),
        boss: true
      };
    }
    var region = REGIONS[pickRegionIndex(stage)];
    var variant = region.variants[Math.floor(Math.random() * region.variants.length)];
    return {
      stage: stage,
      region: region.name,
      ids: variant.slice(),
      scale: stageScale(stage),
      boss: false
    };
  }

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------- 站位评估 ----------
   * 一个英雄站在某个号位的得分：
   *   + 该号位能用的技能数（权重最高，站错位置等于废掉一个回合）
   *   + 职业倾向（前排职业靠前、远程与治疗靠后）
   *   + 血量微调（1 号位优先给血厚的）
   */
  function placementScore(hero, rank) {
    var usable = 0;
    hero.skills.forEach(function (s) {
      if (s.ranks.indexOf(rank) >= 0) usable += 1;
    });

    var score = usable * 10;
    if (usable === 0) score -= 100;

    var front = hero.role === '坦克' || hero.role === '输出';
    var back = hero.role === '远程' || hero.role === '治疗' || hero.role === '辅助';

    if (front) score += rank <= 2 ? 3 : (rank === 3 ? 0 : -3);
    if (back) score += rank >= 3 ? 3 : (rank === 2 ? 0 : -2);

    /* 被指定为前排的角色：除非万不得已，不往后排塞 */
    if (hero.lane === 'front') score += rank <= 2 ? 4 : (rank === 3 ? -10 : -16);

    if (rank === 1) score += hero.hp / 100;

    return score;
  }

  function bestRank(hero) {
    var best = 1, bestScore = -Infinity;
    for (var r = 1; r <= 4; r++) {
      var sc = placementScore(hero, r);
      if (sc > bestScore) { bestScore = sc; best = r; }
    }
    return best;
  }

  /* 4! = 24 种排法，直接全枚举求最优 */
  function bestOrder(ids) {
    var heroes = ids.map(heroById);
    for (var i = 0; i < heroes.length; i++) {
      if (!heroes[i]) return ids.slice();
    }

    var best = null, bestScore = -Infinity;

    function walk(rest, acc) {
      if (!rest.length) {
        var total = 0;
        for (var k = 0; k < acc.length; k++) total += placementScore(acc[k], k + 1);
        if (total > bestScore) { bestScore = total; best = acc.slice(); }
        return;
      }
      for (var j = 0; j < rest.length; j++) {
        var next = rest.slice(0, j).concat(rest.slice(j + 1));
        walk(next, acc.concat([rest[j]]));
      }
    }

    walk(heroes, []);
    return best.map(function (h) { return h.id; });
  }

  /* 最优排法下，是否每个人在自己号位都至少有一个能放的技能 */
  function isViable(order) {
    for (var i = 0; i < order.length; i++) {
      var h = heroById(order[i]);
      if (!h) return false;
      var ok = false;
      for (var k = 0; k < h.skills.length; k++) {
        if (h.skills[k].ranks.indexOf(i + 1) >= 0) { ok = true; break; }
      }
      if (!ok) return false;
    }
    return true;
  }

  /* 随机组队：反复抽，直到抽到一支「排完还能人人有技能」的队伍 */
  function randomTeam(excludeIds, size) {
    var taken = excludeIds || [];
    var pool = HEROES.filter(function (h) { return taken.indexOf(h.id) < 0; });
    var n = Math.min(size || CONFIG.teamSize, pool.length);
    var fallback = null;

    for (var attempt = 0; attempt < 80; attempt++) {
      var picked = shuffle(pool).slice(0, n);
      var order = bestOrder(picked.map(function (h) { return h.id; }));
      if (isViable(order)) return order;
      if (!fallback) fallback = order;
    }
    return fallback;
  }

  function randomEnemy(excludeIds, size) {
    return randomTeam(excludeIds, size);
  }

  /* ---------- 技能描述 ---------- */
  function rewardDamage(base, actor) {
    if (!base || !actor || !actor.dmgK || actor.dmgK === 1) return base;
    var scaled = base * actor.dmgK;
    /* 正向奖励向上取整，避免 +8% 在低伤害技能上完全消失；消除浮点尾差。 */
    return Math.max(1, actor.dmgK > 1 ? Math.ceil(scaled - 1e-9) : Math.round(scaled));
  }

  function directDamage(base, actor) {
    if (!base) return base;
    var damage = base;
    if (actor && actor.lastStandK && actor.lastStandK > 1) {
      damage = Math.max(base + 1, Math.round(base * actor.lastStandK));
    }
    return rewardDamage(damage, actor);
  }

  function describe(s, actor) {
    var e = s.effect || {};
    var parts = [];
    var dmgOut = directDamage(e.dmg || 0, actor);
    var bleedOut = s.target === 'enemy' ? rewardDamage(e.bleed || 0, actor) : (e.bleed || 0);
    var blightOut = s.target === 'enemy' ? rewardDamage(e.blight || 0, actor) : (e.blight || 0);
    var healOut = e.heal || 0;
    if (actor) {
      if (actor.lastStandK && actor.lastStandK > 1) {
        if (healOut) healOut = Math.max(healOut + 1, Math.round(healOut * actor.lastStandK));
      }
    }
    if (e.dmg) parts.push(dmgOut + ' 伤害' + (actor && dmgOut !== e.dmg ? '（+' + (dmgOut - e.dmg) + '）' : ''));
    if (e.heal) parts.push('治疗 ' + healOut + (actor && healOut !== e.heal ? '（+' + (healOut - e.heal) + '）' : ''));
    if (e.healRandom) parts.push('治疗 0~' + e.healRandom);
    if (e.stun) parts.push('眩晕');
    if (e.bleed) parts.push('流血 ' + bleedOut + '×' + CONFIG.dotTurns + (actor && bleedOut !== e.bleed ? '（每回合 +' + (bleedOut - e.bleed) + '）' : ''));
    if (e.blight) parts.push('腐蚀 ' + blightOut + '×' + CONFIG.dotTurns + (actor && blightOut !== e.blight ? '（每回合 +' + (blightOut - e.blight) + '）' : ''));
    if (e.push) parts.push('击退 ' + e.push);
    if (e.pull) parts.push('拉近 ' + e.pull);
    if (e.move) parts.push(e.move > 0 ? '前移 ' + e.move : '后移 ' + (-e.move));
    if (e.bleedChance) parts.push('有 ' + Math.round(e.bleedChance * 100) + '% 概率使目标流血');
    if (e.execStun) parts.push('对眩晕目标伤害 ×' + e.execStun);
    if (e.bonusBleed) parts.push('对流血的敌人伤害 ×' + e.bonusBleed);
    if (e.markBonus) parts.push('对已标记的敌人伤害 ×' + e.markBonus);
    if (e.mark) parts.push('标记 ' + e.mark + ' 回合（被攻击时暴击率 +' + CONFIG.markCrit + '%）');
    if (e.dodgeDown) parts.push('闪避降低 ' + e.dodgeDown + '%');
    if (e.dodgeUp) parts.push('闪避提高 ' + e.dodgeUp + '%，至下次行动结束');
    if (e.forecast) parts.push('预告目标站位，下次行动以碎石轰击该位置；可调位应对');
    if (e.drain) parts.push('回复造成伤害的 ' + Math.round(e.drain * 100) + '%');
    if (e.selfHeal) parts.push('自身回复 ' + e.selfHeal);
    if (s.maxUses) parts.push('每场最多 ' + s.maxUses + ' 次');
    if (s.hpBelow) parts.push('生命不高于 ' + Math.round(s.hpBelow * 100) + '% 时可用');
    if (e.reload) parts.push('等待火绳手点火');
    if (e.igniteCannon) parts.push('引爆火炮；可被击杀或眩晕阻止');
    if (e.summon) {
      var minion = heroById(e.summon);
      parts.push('召唤 ' + (minion ? minion.name : e.summon));
    }
    if (e.summonRoster) {
      parts.push('召唤 ' + e.summonRoster.map(function (id) {
        var minion = heroById(id);
        return minion ? minion.name : id;
      }).join('、'));
    }

    var scope;
    if (s.entryOnly) scope = '登场技';
    else if (e.guard) scope = '守护';
    else if (typeof s.random === 'number' && s.random > 1) scope = '随机 ' + s.random + ' 人';
    else if (s.aoe) scope = s.maxTargets ? '群体（最多 ' + s.maxTargets + ' 人）' : '群体';
    else if (s.target === 'ally') scope = '单体治疗';
    else if (s.target === 'self') scope = '自身';
    else scope = '单体';

    return scope + ' · ' + parts.join(' · ');
  }

  /* ---------- 构建 ---------- */
  function scaleSkills(skills, scale, dmgScale) {
    var ds = dmgScale || scale || 1;
    return skills.map(function (s) {
      var e = {};
      Object.keys(s.effect || {}).forEach(function (k) {
        var v = s.effect[k];
        if ((k === 'dmg' || k === 'bleed' || k === 'blight') && typeof v === 'number') {
          e[k] = Math.max(1, Math.round(v * ds));
        } else if (k === 'heal' && typeof v === 'number') {
          e[k] = Math.max(1, Math.round(v * scale));
        } else {
          e[k] = v;
        }
      });
      var out = {};
      Object.keys(s).forEach(function (k) { out[k] = s[k]; });
      out.effect = e;
      return out;
    });
  }

  var CRIT_BY_ROLE = { '坦克': 4, '输出': 9, '远程': 7, '治疗': 5, '辅助': 6, '近战': 5 };
  var DODGE_BY_ROLE = { '坦克': 4, '输出': 10, '远程': 8, '治疗': 6, '辅助': 8, '近战': 5 };

  function makeUnit(hero, team, rank, carried, scale) {
    var boss = !!hero.boss;
    /* BOSS 血量吃满倍率，伤害只吃 65%，避免后期一刀秒人 */
    var dmgScale = boss && scale ? 1 + (scale - 1) * 0.65 : scale;
    var skills = scaleSkills(hero.skills, scale, dmgScale);
    var cd = {};
    skills.forEach(function (s) { cd[s.id] = 0; });

    var maxHp = carried && carried.maxHp ? carried.maxHp : hero.hp;
    if (carried && carried.maxHp) maxHp = carried.maxHp;
    else if (scale && scale !== 1) maxHp = Math.round(hero.hp * scale);
    var hp = carried ? Math.min(carried.hp, maxHp) : maxHp;

    return {
      uid: team + '-' + rank,
      id: hero.id,
      name: hero.name,
      role: hero.role,
      team: team,
      rank: rank,
      hp: hp,
      maxHp: maxHp,
      spd: hero.spd,
      atk: hero.atk,
      crit: hero.crit != null ? hero.crit : (CRIT_BY_ROLE[hero.role] || 5),
      dodge: hero.dodge != null ? hero.dodge : (DODGE_BY_ROLE[hero.role] || 5),
      dr: hero.dr || 0,
      skills: CONFIG.noCooldown
        ? skills.map(function (s) {
            var o = {};
            Object.keys(s).forEach(function (k) { o[k] = s[k]; });
            o.cd = 0;
            return o;
          })
        : skills,
      boss: boss,
      noEnrage: !!hero.noEnrage,
      size: hero.size || 1,
      enraged: false,
      res: {
        stun: (hero.res && hero.res.stun) || 0,
        bleed: (hero.res && hero.res.bleed) || 0,
        blight: (hero.res && hero.res.blight) || 0,
        move: (hero.res && hero.res.move) || 0
      },
      status: { stun: 0, bleed: null, blight: null },
      items: null,   /* 道具改成队伍共用了，见 state.items */
      cd: cd,
      alive: true,
      deathDoor: false
    };
  }

  function emit(state, ev) {
    if (!state.events) state.events = [];
    state.events.push(ev);
    if (state.events.length > 200) state.events.shift();
  }

  function pushLog(state, text, highlight) {
    state.log.push({ text: text, hl: !!highlight });
    if (state.log.length > 140) state.log.shift();
  }

  function createState(playerIds, enemyIds, opts) {
    opts = opts || {};
    var seed = opts.seed != null ? (opts.seed >>> 0) : newSeed();
    var seedHolder = { rngState: seed };
    var units = [];
    playerIds.forEach(function (id, i) {
      var h = heroById(id);
      var carried = opts.player ? opts.player[i] : null;
      if (h) {
        var pu = makeUnit(h, PLAYER, i + 1, carried, 1);
        var bn = opts.bonus;
        if (bn) {
          pu.crit += bn.crit || 0;
          pu.spd += bn.spd || 0;
          pu.dmgK = 1 + (bn.dmg || 0);
          pu.dr = Math.min(CONFIG.rewardDrCap, Math.max(0, bn.dr || 0));
        }
        units.push(pu);
      }
    });
    enemyIds.forEach(function (id, i) {
      var h = heroById(id);
      if (!h) {
        console.warn('[dungeon] 找不到敌人数据:', id, '—— data/enemies.js 是不是没加载？');
        return;
      }
      var enemy = makeUnit(h, ENEMY, h.boss && h.startRank ? h.startRank : i + 1, null, opts.enemyScale || 1);
      if (h.boss && opts.stage > 0) {
        var curve = bossScale(opts.stage);
        var hpMultiplier = opts.stage === 5 ? CONFIG.firstBossHpMultiplier : 1;
        enemy.hp = enemy.maxHp = Math.max(1, Math.round(h.hp * curve.hp * hpMultiplier));
        enemy.skills = scaleSkills(h.skills, curve.hp, curve.dmg);
        if (CONFIG.noCooldown) enemy.skills.forEach(function (s) { s.cd = 0; });
      }
      units.push(enemy);
    });

    /* 精英怪：第 3 关起每关 15% 概率，把一只小兵强化 */
    var eliteStage = opts.stage || 0;
    if (eliteStage >= CONFIG.eliteMinStage && nextRand(seedHolder) < CONFIG.eliteChance) {
      var pool = units.filter(function (u) { return u.team === ENEMY && !u.boss; });
      if (pool.length) {
        var elite = pool[Math.floor(nextRand(seedHolder) * pool.length)];
        elite.elite = true;
        elite.hp = Math.max(1, Math.round(elite.hp * 1.8));
        elite.maxHp = Math.max(1, Math.round(elite.maxHp * 1.8));
        elite.skills = elite.skills.map(function (s) {
          var e = {};
          Object.keys(s.effect || {}).forEach(function (key) {
            var v = s.effect[key];
            e[key] = (key === 'dmg' && typeof v === 'number') ? Math.max(1, Math.round(v * 1.3)) : v;
          });
          return { id: s.id, name: s.name, ranks: s.ranks, target: s.target,
                   targetRanks: s.targetRanks, aoe: s.aoe, cd: s.cd, effect: e };
        });
        elite.name = elite.name;
      }
    }

    /* 后期小兵强化：只作用于非 BOSS 敌人 */
    var mStage = opts.stage || 0;
    var extra = Math.max(0, mStage - 4);
    if (extra > 0) {
      units.forEach(function (u) {
        if (u.team !== ENEMY || u.boss) return;
        var hpK = Math.pow(CONFIG.minionHpGrowth, extra);
        var atkK = Math.pow(CONFIG.minionAtkGrowth, extra);
        u.hp = Math.max(1, Math.round(u.hp * hpK));
        u.maxHp = Math.max(1, Math.round(u.maxHp * hpK));
        u.skills = u.skills.map(function (s) {
          var e = {};
          Object.keys(s.effect || {}).forEach(function (key) {
            var v = s.effect[key];
            e[key] = ((key === 'dmg' || key === 'bleed' || key === 'blight') && typeof v === 'number')
              ? Math.max(1, Math.round(v * atkK))
              : v;
          });
          return { id: s.id, name: s.name, ranks: s.ranks, target: s.target,
                   targetRanks: s.targetRanks, aoe: s.aoe, cd: s.cd, effect: e };
        });
      });
    }

    /* 残阵强化：队伍不满 4 人时全队伤害提升 */
    var playerUnits = units.filter(function (u) { return u.team === PLAYER; });
    var missing = Math.max(0, CONFIG.teamSize - playerUnits.length);
    if (missing > 0) {
      var k = 1 + missing * CONFIG.lastStand;
      playerUnits.forEach(function (u) {
        u.lastStandK = k;
        if (u.hp <= 0) { u.hp = 1; u.deathDoor = false; }
      });
    }

    var state = {
      round: 1, turnIndex: 0, order: [], units: units,
      seed: seed, rngState: seedHolder.rngState,
      enemyScale: opts.enemyScale || 1,
      stage: opts.stage || 0,
      bonus: opts.bonus || null,
      /* 绷带/解毒药是整支队伍共用的 */
      items: opts.items
        ? { bandage: opts.items.bandage, antidote: opts.items.antidote }
        : { bandage: 4, antidote: 4 },
      log: [], events: [], phase: 'playing', winner: null
    };

    startRound(state);
    pushLog(state, '第 1 回合开始，按速度从高到低行动。', true);
    units.filter(function (u) { return u.team === ENEMY && u.boss; }).forEach(function (boss) {
      var entrance = boss.skills.filter(function (s) {
        return s.entryOnly && s.effect && (s.effect.summon || s.effect.summonRoster);
      })[0];
      if (!entrance) return;
      var roster = entrance.effect.summonRoster || [entrance.effect.summon];
      var summoned = 0;
      roster.forEach(function (id) {
        summoned += summonMinions(state, boss, id, 1, true);
      });
      if (summoned) {
        pushLog(state, boss.name + ' 登场使用「' + entrance.name + '」！', true);
      }
    });
    stepToNextActor(state);
    return state;
  }

  function aliveOf(state, team) {
    return state.units.filter(function (u) { return u.alive && u.team === team; });
  }

  function unitByUid(state, uid) {
    for (var i = 0; i < state.units.length; i++) {
      if (state.units[i].uid === uid) return state.units[i];
    }
    return null;
  }

  function startRound(state) {
    /* 火炮每回合最多补一人：优先补火绳手，给玩家留出击杀窗口。 */
    if (state.round > 1) {
      var pounder = state.units.filter(function (u) { return u.alive && u.id === 'brigand_pounder'; })[0];
      if (pounder) {
        var reinforcements = ['brigand_matchman', 'cannon_guard', 'cannon_gunner'];
        for (var ri = 0; ri < reinforcements.length; ri++) {
          var kind = reinforcements[ri];
          var present = state.units.some(function (u) {
            return u.alive && u.id === kind && u.summonedByBoss === pounder.uid;
          });
          if (!present) {
            if (summonMinions(state, pounder, kind, 1, true)) {
              pushLog(state, '火炮的援兵赶到。', true);
            }
            break;
          }
        }
      }
    }
    state.order = state.units
      .filter(function (u) { return u.alive; })
      .sort(function (a, b) {
        if (b.spd !== a.spd) return b.spd - a.spd;
        if (a.rank !== b.rank) return a.rank - b.rank;
        return a.team === PLAYER ? -1 : 1;
      })
      .map(function (u) { return u.uid; });
    state.turnIndex = 0;
  }

  function currentUnit(state) {
    if (state.phase === 'over') return null;
    var uid = state.order[state.turnIndex];
    return uid ? unitByUid(state, uid) : null;
  }

  function totalHp(state, team) {
    return aliveOf(state, team).reduce(function (s, u) { return s + u.hp; }, 0);
  }

  function finishByHp(state) {
    var p = totalHp(state, PLAYER);
    var e = totalHp(state, ENEMY);
    state.phase = 'over';
    state.round = CONFIG.maxRounds;
    state.winner = p > e ? PLAYER : (e > p ? ENEMY : 'draw');
    pushLog(state, CONFIG.maxRounds + ' 回合结束，按剩余总血量判定。', true);
  }

  function checkEnd(state) {
    if (!aliveOf(state, ENEMY).length) {
      state.phase = 'over'; state.winner = PLAYER;
      pushLog(state, '敌方全员退场。', true);
      return true;
    }
    if (!aliveOf(state, PLAYER).length) {
      state.phase = 'over'; state.winner = ENEMY;
      pushLog(state, '我方全员退场。', true);
      return true;
    }
    return false;
  }

  /* 有人阵亡后，把存活单位重新压紧到 1..n，避免出现打不到的"空档后排" */
  /* 只在出现空档时才整理：尸骸保留原来的格子，挡住后面的人 */
  function compactTeam(state, team) {
    var list = state.units
      .filter(function (u) { return !u.removed && u.team === team; })
      .sort(function (a, b) { return a.rank - b.rank; });

    var used = {};
    var next = 1;
    list.forEach(function (u) {
      while (used[next]) next++;
      if (next > 4) {
        /* 挤出战场：尸骸直接消失，活人理论上不会到这里 */
        if (!u.alive) { u.removed = true; u.corpse = false; return; }
      }
      u.rank = next;
      used[next] = true;
      if (u.size > 1) { used[next + 1] = true; next += 2; } else { next += 1; }
    });
  }

  /* 某个队伍已经被占用的格子（BOSS 算两格） */
  function usedRanks(state, team) {
    var set = {};
    state.units.forEach(function (u) {
      if (u.team !== team || u.removed) return;
      set[u.rank] = true;
      if (u.size > 1) set[u.rank + 1] = true;
    });
    return set;
  }

  function summonMinions(state, actor, minionId, count, nextRound) {
    var minion = heroById(minionId);
    if (!minion) return 0;
    var used = usedRanks(state, actor.team);
    var created = 0;
    for (var rank = 1; rank <= 4 && created < count; rank++) {
      if (used[rank]) continue;
      var scale = Math.min(state.enemyScale || 1, CONFIG.bossSummonScaleCap);
      var nu = makeUnit(minion, actor.team, rank, null, scale);
      var maxNum = 0;
      state.units.forEach(function (x) {
        var match = /-(\d+)$/.exec(x.uid);
        if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
      });
      nu.uid = actor.team + '-' + (maxNum + 1);
      nu.summonedByBoss = actor.uid;
      state.units.push(nu);
      used[rank] = true;
      if (!nextRound) state.order.push(nu.uid);
      emit(state, { type: 'summon', uid: nu.uid, source: actor.uid });
      pushLog(state, actor.name + ' 召唤了 ' + nu.name + '（' + rank + ' 号位）。', true);
      created += 1;
    }
    return created;
  }

  /* 队友阵亡后，幸存者的残阵加成立刻更新 */
  function refreshLastStand(state) {
    var alive = state.units.filter(function (u) { return u.alive && u.team === PLAYER; }).length;
    var missing = Math.max(0, CONFIG.teamSize - alive);
    var k = 1 + missing * CONFIG.lastStand;
    state.units.forEach(function (u) {
      if (u.team === PLAYER) u.lastStandK = u.alive ? k : (u.lastStandK || 1);
    });
    return k;
  }

  /* 死亡后原地留下尸骸，其他人不前移（原版行为） */
  function compactTeams(state) {
    void state;   /* 站位只在尸骸离场时整理，见 compactTeam 的调用点 */
  }

  /* ---------- 回合推进 ---------- */
  function tickCooldowns(u) {
    Object.keys(u.cd).forEach(function (k) {
      if (u.cd[k] > 0) u.cd[k] -= 1;
    });
  }

  function effectiveDodge(u) {
    return Math.max(0, (u.dodge || 0) + (u.status.dodgeUp ? u.status.dodgeUp.amount : 0) -
      (u.status.dodgeDown ? u.status.dodgeDown.amount : 0));
  }

  function completeAction(state, u) {
    u.actionsTaken = (u.actionsTaken || 0) + 1;
    if (u.status.dodgeUp && u.actionsTaken >= u.status.dodgeUp.untilAction) {
      u.status.dodgeUp = null;
      emit(state, { type: 'status', uid: u.uid, status: 'dodgeUpEnd' });
    }
  }

  function recordSkill(state, actor, s) {
    actor.skillTurns = (actor.skillTurns || 0) + 1;
    if (!actor.skillUses) actor.skillUses = {};
    if (!actor.skillLastUsed) actor.skillLastUsed = {};
    actor.skillUses[s.id] = (actor.skillUses[s.id] || 0) + 1;
    actor.skillLastUsed[s.id] = actor.skillTurns;
    actor.repeatSkillCount = actor.lastSkillId === s.id ? (actor.repeatSkillCount || 1) + 1 : 1;
    actor.lastSkillId = s.id;
    if (s.cd > 0) actor.cd[s.id] = s.cd;
    completeAction(state, actor);
  }

  function skillRestriction(u, s) {
    if (u.forecastRank && s.id !== 'pr_rubble') return '需兑现灾祸预言';
    if (s.maxUses && u.skillUses && (u.skillUses[s.id] || 0) >= s.maxUses) return '本场次数已用尽';
    if (s.hpBelow && u.hp > u.maxHp * s.hpBelow) return '生命高于 ' + Math.round(s.hpBelow * 100) + '%';
    if (s.effect.dodgeUp && u.status.dodgeUp) return '潜没仍在生效';
    return '';
  }

  function killUnit(state, u) {
    if (!u.alive) return;
    u.alive = false;
    u.deathDoor = false;
    u.hp = 0;
    var isPounderCrew = u.summonedByBoss && state.units.some(function (b) {
      return b.uid === u.summonedByBoss && b.id === 'brigand_pounder';
    });
    if (isPounderCrew || (u.team === PLAYER && !CONFIG.playerCorpses)) {
      u.corpse = false;
      u.removed = true;
      if (u.team === PLAYER) compactTeam(state, PLAYER);
    } else {
      u.corpse = true;
      u.corpseTurns = CONFIG.corpseTurns;
    }
    emit(state, { type: 'death', uid: u.uid });
    pushLog(state, u.name + (u.corpse ? ' 倒下，留下尸骸。' : ' 倒下并退场。'), true);
    if (u.boss) {
      state.units.forEach(function (minion) {
        if (minion.summonedByBoss !== u.uid || !minion.alive) return;
        minion.alive = false;
        minion.hp = 0;
        minion.corpse = false;
        minion.removed = true;
        pushLog(state, minion.name + ' 随着 ' + u.name + ' 倒下而退场。');
      });
    }
    if (u.team === PLAYER) {
      var k = refreshLastStand(state);
      if (k > 1) emit(state, { type: 'laststand', uid: u.uid, k: k, name: u.name });
    }
  }

  /* 血量见底：先入死门，下次再受伤才真的死 */
  function takeToZero(state, u) {
    if (u.hp < 0) u.hp = 0;
    /* 死门只给玩家队伍，敌人血空即死 */
    if (u.team !== PLAYER || !CONFIG.deathDoor) { killUnit(state, u); return false; }
    if (!u.deathDoor) {
      u.deathDoor = true;
      emit(state, { type: 'deathdoor', uid: u.uid });
      pushLog(state, u.name + ' 倒下——进入死门！', true);
      return true;
    }
    return false;
  }

  function tickDot(state, u) {
    var died = false;
    ['bleed', 'blight'].forEach(function (key) {
      var st = u.status[key];
      if (!st || !u.alive) return;
      var before = u.hp;
      u.hp = Math.max(0, u.hp - st.dmg);
      emit(state, { type: 'dmg', uid: u.uid, amount: before - u.hp, element: key, dot: true });
      pushLog(state, u.name + ' 受到 ' + st.dmg + ' 点' + (key === 'bleed' ? '流血' : '腐蚀') + '伤害');
      st.turns -= 1;
      if (st.turns <= 0) u.status[key] = null;
      if (u.hp <= 0) {
        if (u.deathDoor) {
          if (nextRand(state) < CONFIG.doorHitChance) {
            killUnit(state, u);
          } else {
            emit(state, { type: 'doorhold', uid: u.uid });
            pushLog(state, u.name + ' 在死门中扛住了' + (key === 'bleed' ? '流血' : '腐蚀') + '。');
          }
        } else {
          takeToZero(state, u);
        }
        died = true;
      }
    });
    return died;
  }

  /* 尸骸摆放 N 回合后自动消失 */
  function tickCorpses(state) {
    var rotted = false;
    state.units.forEach(function (u) {
      if (!u.corpse || u.removed) return;
      if (u.corpseTurns == null) u.corpseTurns = CONFIG.corpseTurns;
      u.corpseTurns -= 1;
      if (u.corpseTurns <= 0) {
        u.corpse = false;
        u.removed = true;
        emit(state, { type: 'corpse', uid: u.uid, decay: true });
        pushLog(state, u.name + ' 的尸骸腐烂消失了。');
        rotted = true;
      }
    });
    if (rotted) {
      compactTeam(state, PLAYER);
      compactTeam(state, ENEMY);
    }
  }

  function stepToNextActor(state) {
    compactTeams(state);
    var guard = 0;
    while (state.phase === 'playing' && guard++ < 500) {
      if (state.turnIndex >= state.order.length) {
        state.round += 1;
        if (state.round > CONFIG.maxRounds) { finishByHp(state); return; }
        tickCorpses(state);

        /* 守护：每回合结束衰减一次，正好持续 2 个整回合 */
        state.units.forEach(function (gu) {
          if (!gu.guarding) return;
          gu.guarding.turns -= 1;
          if (gu.guarding.turns <= 0) {
            gu.guarding = null;
            pushLog(state, gu.name + ' 的守护姿态结束了。');
            emit(state, { type: 'guardend', uid: gu.uid });
          }
        });
        startRound(state);
        pushLog(state, '第 ' + state.round + ' 回合开始。', true);
        continue;
      }
      var u = currentUnit(state);
      if (!u || !u.alive) { state.turnIndex += 1; continue; }

      tickCooldowns(u);



      /* 兜底：血量 0 或负值却没进死门的，先补进死门（这一回合不再额外掷骰） */
      var enteredNow = false;
      if (u.alive && u.hp <= 0 && !u.deathDoor) {
        takeToZero(state, u);
        enteredNow = true;
        if (checkEnd(state)) return;
        if (!u.alive) { state.turnIndex += 1; continue; }
      }

      /* 死门判定：每个回合开始有一半概率直接倒下 */
      if (u.deathDoor && !enteredNow) {
        if (nextRand(state) < CONFIG.deathDoorChance) {
          pushLog(state, u.name + ' 没能撑住死门……', true);
          killUnit(state, u);
          if (checkEnd(state)) return;
          state.turnIndex += 1;
          continue;
        }
        emit(state, { type: 'doorhold', uid: u.uid });
        pushLog(state, u.name + ' 撑住了死门。');
      }

      if (tickDot(state, u)) {
        if (checkEnd(state)) return;
        state.turnIndex += 1;
        continue;
      }

      if (u.status.dodgeDown) {
        u.status.dodgeDown.turns -= 1;
        if (u.status.dodgeDown.turns <= 0) u.status.dodgeDown = null;
      }
      if (u.status.mark) {
        u.status.mark.turns -= 1;
        if (u.status.mark.turns <= 0) {
          u.status.mark = null;
          emit(state, { type: 'status', uid: u.uid, status: 'markend' });
        } else {
          emit(state, { type: 'status', uid: u.uid, status: 'mark' });
        }
      }

      if (u.status.stun > 0) {
        u.status.stun -= 1;
        pushLog(state, u.name + ' 处于眩晕，跳过行动。');
        completeAction(state, u);
        state.turnIndex += 1;
        continue;
      }
      return;
    }
  }

  /* ---------- 技能 ---------- */
  function skillOf(u, skillId) {
    for (var i = 0; i < u.skills.length; i++) if (u.skills[i].id === skillId) return u.skills[i];
    return null;
  }

  function isCorpse(u) { return !!u && !u.alive && !!u.corpse; }

  /* 只有占两格的大型 BOSS 可被任何站位命中；收藏家按后排站位受击。 */
  function inRangeOf(skill, unit) {
    if (!unit) return false;
    if (unit.boss && unit.size > 1) return true;
    return (skill.targetRanks || []).indexOf(unit.rank) >= 0;
  }

  /* 带伤害的技能可以顺手把尸骸打掉 */
  function canSmashCorpse(skill) {
    var e = skill.effect || {};
    return skill.target === 'enemy' && ((e.dmg || 0) > 0 || (e.bleed || 0) > 0 || (e.blight || 0) > 0);
  }

  function poolOf(state, actor, skill) {
    if (skill.target === 'self') return [actor];
    if (skill.target === 'ally') return aliveOf(state, actor.team);

    var foes = aliveOf(state, other(actor.team));
    if (canSmashCorpse(skill)) {
      state.units.forEach(function (u) {
        if (u.team === actor.team) return;
        if (isCorpse(u)) foes.push(u);
      });
    }
    return foes;
  }

  function usableSkills(state) {
    var u = currentUnit(state);
    if (!u || state.phase !== 'playing') return [];
    return u.skills.map(function (s) {
      var cd = u.cd[s.id] || 0;
      var rankOk = s.ranks.indexOf(u.rank) >= 0;
      var hasTargets = (s.id === 'pr_rubble' && !!u.forecastRank) || s.target === 'self' || poolOf(state, u, s).some(function (t) {
        return inRangeOf(s, t);
      });
      var reason = '';
      if (s.entryOnly) reason = '登场技已使用';
      else if (skillRestriction(u, s)) reason = skillRestriction(u, s);
      else if (cd > 0) reason = '冷却 ' + cd;
      else if (!rankOk) reason = '站位不符';
      else if (!hasTargets) reason = '无目标';
      return {
        skill: s,
        desc: describe(s, u),
        cd: cd,
        ready: !reason,
        reason: reason
      };
    });
  }

  /* 这个技能会影响到哪些单位（单体 / 群体 / 自身都返回完整列表，用于界面高亮） */
  function previewTargets(state, skillId) {
    var u = currentUnit(state);
    if (!u) return [];
    var s = skillOf(u, skillId);
    if (!s || (u.cd[s.id] || 0) > 0 || s.ranks.indexOf(u.rank) < 0) return [];
    if (skillRestriction(u, s)) return [];
    if (s.id === 'pr_rubble' && u.forecastRank) {
      return state.units.filter(function (t) {
        return t.team !== u.team && !t.removed && (t.alive || isCorpse(t)) && t.rank === u.forecastRank;
      }).map(function (t) { return t.uid; });
    }
    if (s.target === 'self') return [u.uid];
    var list = poolOf(state, u, s)
      .filter(function (t) { return inRangeOf(s, t); })
      .filter(function (t) { return !(s.effect && s.effect.guard && t.uid === u.uid); });
    var pcap = s.maxTargets || 0;
    if (!pcap && s.aoe && s.target === 'enemy') pcap = CONFIG.aoeMaxTargets;
    if (pcap && list.length > pcap) {
      list = list.sort(function (a, b) { return a.rank - b.rank; }).slice(0, pcap);
    }
    return list.map(function (t) { return t.uid; });
  }

  /* 需要玩家手动点选的目标（群体与自身不需要，但界面现在也要求确认） */
  function validTargets(state, skillId) {
    var u = currentUnit(state);
    if (!u) return [];
    var s = skillOf(u, skillId);
    if (!s || (u.cd[s.id] || 0) > 0 || s.ranks.indexOf(u.rank) < 0) return [];
    if (s.aoe || s.target === 'self') return [];
    return previewTargets(state, skillId);
  }

  /* 谁在守护这个单位（同队、存活、未眩晕） */
  function guarderOf(state, target) {
    var found = null;
    state.units.forEach(function (u) {
      if (found || !u.alive) return;
      if (u.uid === target.uid) return;
      if (u.team !== target.team) return;
      if (!u.guarding || u.guarding.uid !== target.uid) return;
      if (u.status.stun > 0) return;
      found = u;
    });
    return found;
  }

  /* 找出占据某个格子的单位（BOSS 的第二格也算被占） */
  function occupantAt(state, team, rank) {
    var found = null;
    state.units.forEach(function (u) {
      if (found || u.removed || u.team !== team || (!u.alive && !isCorpse(u))) return;
      if (u.rank === rank) found = u;
      else if (u.size > 1 && u.rank + 1 === rank) found = u;
    });
    return found;
  }

  function canShiftUnit(state, unit, dir) {
    if (!state || !unit || unit.removed || (!unit.alive && !isCorpse(unit)) || (dir !== -1 && dir !== 1)) return false;
    /* 双方都不能把队伍向空的后排扩张；尸骸、大型单位和队列内部空档仍按实际占位处理。 */
    var limit = state.units.filter(function (u) {
      return u.team === unit.team && !u.removed && (u.alive || isCorpse(u));
    }).reduce(function (last, u) { return Math.max(last, u.rank + (u.size || 1) - 1); }, 0);
    limit = Math.min(CONFIG.teamSize, limit);
    var targetRank = unit.rank + dir;
    var size = unit.size || 1;
    if (targetRank < 1 || targetRank + size - 1 > limit) return false;
    var occupant = occupantAt(state, unit.team, targetRank);
    if (occupant === unit) occupant = null;
    if (occupant && occupant.size > 1 && occupant.rank !== targetRank) return false;
    /* 简单对调只适用于两个单格单位，避免大型单位的第二格重叠。 */
    if (occupant && (size > 1 || occupant.size > 1)) return false;
    if (size > 1) {
      var second = occupantAt(state, unit.team, targetRank + 1);
      if (second && second !== occupant && second !== unit) return false;
    }
    return true;
  }

  function canMoveActor(state, dir) {
    if (!state || state.phase !== 'playing') return false;
    var actor = currentUnit(state);
    return !!actor && actor.alive && canShiftUnit(state, actor, dir);
  }

  function shiftUnit(state, unit, dir) {
    if (!canShiftUnit(state, unit, dir)) return false;
    var targetRank = unit.rank + dir;
    var occupant = occupantAt(state, unit.team, targetRank);
    if (occupant && occupant !== unit) {
      /* 和占位者对调，保持站位不重叠 */
      var back = unit.rank;
      occupant.rank = back;
      unit.rank = targetRank;
      return true;
    }
    unit.rank = targetRank;
    return true;
  }

  /* 抗性判定：命中即抵抗。数值是百分比，0~100 */
  function rollResist(state, target, key) {
    var chance = (target.res && target.res[key]) || 0;
    if (chance <= 0) return false;
    return nextRand(state) * 100 < chance;
  }

  function applyEffect(state, actor, target, effect) {
    var notes = [];
    var whereDamage = 0;

    if (effect.dmg) {
      var boosted = directDamage(effect.dmg, actor);
      if (effect.execStun && target.alive && target.status && target.status.stun > 0) {
        boosted = Math.round(boosted * effect.execStun);
        notes.push('处决！');
      }
      if (effect.bonusBleed && target.alive && target.status && target.status.bleed) {
        boosted = Math.round(boosted * effect.bonusBleed);
        notes.push('追猎！');
      }
      if (effect.markBonus && target.alive && target.status && target.status.mark) {
        boosted = Math.round(boosted * effect.markBonus);
        notes.push('标记命中！');
      }
      /* 被标记的目标：所有攻击对他的暴击率 +CONFIG.markCrit */
      var critChance = (actor.crit || 0) +
        (target.status && target.status.mark ? CONFIG.markCrit : 0);
      var crit = nextRand(state) * 100 < critChance;
      var raw = crit ? Math.round(boosted * 1.5) : boosted;
      var dr = Math.min(CONFIG.damageReductionCap,
        Math.max(0, (target.dr || 0) + (target._guardHit ? CONFIG.guardReduction : 0)));
      if (dr) raw = Math.max(1, Math.round(raw * (1 - dr)));
      var before = target.hp;
      var atDoor = !!target.deathDoor;
      whereDamage = 0;
      target.hp = Math.max(0, target.hp - raw);
      notes.push((crit ? '暴击 ' : '') + raw + ' 伤害');
      whereDamage = before - target.hp;
      emit(state, { type: 'dmg', uid: target.uid, amount: whereDamage, element: 'phys', crit: crit });
      if (atDoor) {
        /* 死门期间再吃伤害 → 掷骰子，扛住就继续站着 */
        if (nextRand(state) < CONFIG.doorHitChance) {
          killUnit(state, target);
        } else {
          emit(state, { type: 'doorhold', uid: target.uid });
          pushLog(state, target.name + ' 在死门中扛住了这一击。');
        }
      }
    }
    function leaveDoorIfHealed(u2) {
      if (u2 && u2.deathDoor && u2.hp > 0) {
        u2.deathDoor = false;
        emit(state, { type: 'leavesdoor', uid: u2.uid });
        pushLog(state, u2.name + ' 被拉出了死门。', true);
      }
    }

    /* 吸血：按造成的伤害回复自己 */
    if (effect.drain && actor.alive) {
      var drainAmt = Math.max(1, Math.round((whereDamage || 0) * effect.drain));
      var dh = actor.hp;
      actor.hp = Math.min(actor.maxHp, actor.hp + drainAmt);
      if (actor.hp > dh) {
        notes.push('回复 ' + (actor.hp - dh));
        emit(state, { type: 'heal', uid: actor.uid, amount: actor.hp - dh, crit: false });
        leaveDoorIfHealed(actor);
      }
    }
    /* 固定自愈（不作用于目标） */
    if (effect.selfHeal && actor.alive) {
      var sh = actor.hp;
      actor.hp = Math.min(actor.maxHp, actor.hp + effect.selfHeal);
      if (actor.hp > sh) {
        notes.push('回复 ' + (actor.hp - sh));
        emit(state, { type: 'heal', uid: actor.uid, amount: actor.hp - sh, crit: false });
        leaveDoorIfHealed(actor);
      }
    }
    if (effect.dodgeUp && actor.alive) {
      actor.status.dodgeUp = { amount: effect.dodgeUp, untilAction: (actor.actionsTaken || 0) + 2 };
      emit(state, { type: 'status', uid: actor.uid, status: 'dodgeUp' });
    }
    if (effect.forecast) {
      actor.forecastRank = target.rank;
      emit(state, { type: 'status', uid: target.uid, status: 'forecast' });
      pushLog(state, '灾祸预言：我方第 ' + target.rank + ' 号位将遭到碎石轰击，可调位或守护应对。', true);
    }

    if (effect.heal) {
      var healVal = effect.heal;
      if (actor.lastStandK && actor.lastStandK > 1) {
        healVal = Math.max(effect.heal + 1, Math.round(effect.heal * actor.lastStandK));
      }
      var healCrit = nextRand(state) * 100 < (actor.crit || 0);
      if (healCrit) healVal = Math.round(healVal * 1.5);
      var b1 = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + healVal);
      notes.push((healCrit ? '暴击 ' : '') + '回复 ' + (target.hp - b1));
      emit(state, { type: 'heal', uid: target.uid, amount: target.hp - b1, crit: healCrit });
      if (target.deathDoor && target.hp > 0) {
        target.deathDoor = false;
        emit(state, { type: 'leavesdoor', uid: target.uid });
        pushLog(state, target.name + ' 被拉出了死门。', true);
      }
    }
    if (effect.healRandom) {
      var hi = effect.healRandom;
      if (actor.lastStandK && actor.lastStandK > 1) {
        hi = Math.max(effect.healRandom + 1, Math.round(effect.healRandom * actor.lastStandK));
      }
      var amount = Math.floor(nextRand(state) * (hi + 1));
      var healCrit2 = nextRand(state) * 100 < (actor.crit || 0);
      if (healCrit2) amount = Math.round(amount * 1.5);
      var b2 = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + amount);
      notes.push((healCrit2 ? '暴击 ' : '') + '回复 ' + (target.hp - b2));
      emit(state, { type: 'heal', uid: target.uid, amount: target.hp - b2, crit: healCrit2 });
      if (target.deathDoor && target.hp > 0) {
        target.deathDoor = false;
        emit(state, { type: 'leavesdoor', uid: target.uid });
        pushLog(state, target.name + ' 被拉出了死门。', true);
      }
    }

    if (whereDamage > 0 && target.hp <= 0 && target.alive) {
      if (target.deathDoor) {
        killUnit(state, target);
        notes.push('倒下');
      } else {
        takeToZero(state, target);
        notes.push('进入死门');
      }
    }
    if (!target.alive) return notes;

    /* BOSS 狂暴：血量降到一半时攻击力与速度提升 */
    if (target.boss && !target.noEnrage && !target.enraged && target.hp <= target.maxHp * 0.5) {
      target.enraged = true;
      target.spd += 2;
      target.skills.forEach(function (sk) {
        if (sk.effect && sk.effect.dmg) sk.effect.dmg = Math.round(sk.effect.dmg * 1.25);
      });
      emit(state, { type: 'enrage', uid: target.uid });
      pushLog(state, target.name + ' 暴怒了！攻击与速度提升。', true);
      notes.push('暴怒');
    }

    if (effect.stun) {
      if (rollResist(state, target, 'stun')) {
        notes.push('眩晕被抵抗');
        emit(state, { type: 'resist', uid: target.uid, status: 'stun' });
      } else {
        target.status.stun = Math.max(target.status.stun, 1);
        notes.push('眩晕');
        emit(state, { type: 'status', uid: target.uid, status: 'stun' });
        /* 被眩晕过的单位会适应：本局内眩晕抗性 +60%（失败不涨） */
        var before2 = target.res.stun || 0;
        target.res.stun = Math.min(100, before2 + 60);
        if (target.res.stun !== before2) {
          pushLog(state, target.name + ' 逐渐适应了眩晕（眩晕抗性 ' + before2 + '% → ' + target.res.stun + '%）。');
          emit(state, { type: 'resistup', uid: target.uid, status: 'stun', value: target.res.stun });
        }
      }
    }
    if (effect.bleed) {
      if (rollResist(state, target, 'bleed')) {
        notes.push('流血被抵抗');
        emit(state, { type: 'resist', uid: target.uid, status: 'bleed' });
      } else {
        target.status.bleed = { turns: CONFIG.dotTurns, dmg: actor.team !== target.team ? rewardDamage(effect.bleed, actor) : effect.bleed };
        notes.push('流血');
        emit(state, { type: 'status', uid: target.uid, status: 'bleed' });
      }
    }
    if (effect.blight) {
      if (rollResist(state, target, 'blight')) {
        notes.push('腐蚀被抵抗');
        emit(state, { type: 'resist', uid: target.uid, status: 'blight' });
      } else {
        target.status.blight = { turns: CONFIG.dotTurns, dmg: actor.team !== target.team ? rewardDamage(effect.blight, actor) : effect.blight };
        notes.push('腐蚀');
        emit(state, { type: 'status', uid: target.uid, status: 'blight' });
      }
    }
    if (effect.mark) {
      target.status.mark = { turns: effect.mark };
      if (effect.dodgeDown) {
        target.status.dodgeDown = { turns: effect.mark, amount: effect.dodgeDown };
      }
      notes.push('标记');
      emit(state, { type: 'status', uid: target.uid, status: 'mark' });
      pushLog(state, target.name + ' 被标记了。');
    }
    if (effect.bleedChance) {
      /* 诡异重构：治疗的同时有概率让被治疗者流血 */
      if (nextRand(state) < effect.bleedChance) {
        target.status.bleed = {
          turns: CONFIG.dotTurns,
          dmg: effect.bleedAmount || 2
        };
        notes.push('流血');
        emit(state, { type: 'status', uid: target.uid, status: 'bleed' });
        pushLog(state, target.name + ' 被诡异的力量反噬，开始流血。');
      }
    }
    if (effect.guard) {
      actor.guarding = { uid: target.uid, turns: CONFIG.guardTurns + 1 };   /* +1 抵消当前回合 */
      notes.push('守护 ' + target.name);
      emit(state, { type: 'guardup', uid: actor.uid, target: target.uid });
      pushLog(state, actor.name + ' 摆出守护姿态护住 ' + target.name + '（' + CONFIG.guardTurns +
        ' 回合）：替其挡刀时，自身受到的伤害 -' + Math.round(CONFIG.guardReduction * 100) + '%。');
    }
    if (effect.summon) {
      var count = summonMinions(state, actor, effect.summon, effect.summonCount || 1, false);
      if (count) notes.push('召唤 ' + count + ' 名小兵');
    }
    if (effect.push) {
      if (rollResist(state, target, 'move')) {
        notes.push('击退被抵抗');
        emit(state, { type: 'resist', uid: target.uid, status: 'move' });
      } else {
        var pushed = 0;
        for (var i = 0; i < effect.push; i++) { if (!shiftUnit(state, target, 1)) break; pushed++; }
        if (pushed) {
          notes.push('击退');
          emit(state, { type: 'shift', uid: target.uid, dir: 1 });
        }
      }
    }
    if (effect.move) {
      /* move > 0 前移（rank 变小），< 0 后移；与挡路的人交换位置 */
      var mdir = effect.move > 0 ? -1 : 1;
      var steps = Math.abs(effect.move);
      var moved = 0;
      for (var m = 0; m < steps; m++) {
        if (!shiftUnit(state, actor, mdir)) break;
        moved++;
      }
      if (moved) {
        notes.push(effect.move > 0 ? '前移 ' + moved : '后移 ' + moved);
        emit(state, { type: 'shift', uid: actor.uid, dir: mdir });
      }
    }
    if (effect.pull) {
      if (rollResist(state, target, 'move')) {
        notes.push('拉近被抵抗');
        emit(state, { type: 'resist', uid: target.uid, status: 'move' });
      } else {
        var pulled = 0;
        for (var j = 0; j < effect.pull; j++) { if (!shiftUnit(state, target, -1)) break; pulled++; }
        if (pulled) {
          notes.push('拉近');
          emit(state, { type: 'shift', uid: target.uid, dir: -1 });
        }
      }
    }
    if (effect.igniteCannon) {
      notes.push(fireCannon(state, actor) ? '火炮齐射' : '哑火');
    }
    return notes;
  }

  function fireCannon(state, matchman) {
    var cannon = state.units.filter(function (u) {
      return u.alive && u.id === 'brigand_pounder' && u.uid === matchman.summonedByBoss;
    })[0];
    if (!cannon) return false;
    var misfireChance = Math.max(0.25, 0.35 - 0.01 * Math.max(0, (state.stage || 5) - 5));
    var misfire = nextRand(state) < misfireChance;
    emit(state, { type: 'cannon', uid: cannon.uid, misfire: misfire });
    if (misfire) {
      pushLog(state, cannon.name + ' 哑火了！', true);
      return false;
    }
    var blast = Math.max(1, Math.round(6 * bossScale(state.stage || 5).dmg));
    pushLog(state, cannon.name + ' 轰鸣！全队受到炮击。', true);
    aliveOf(state, PLAYER).slice().forEach(function (u) {
      applyEffect(state, cannon, u, { dmg: blast });
    });
    return true;
  }

  function randomTargetsFor(state, actor, s, count) {
    var pool = poolOf(state, actor, s).filter(function (t) {
      return t.alive && inRangeOf(s, t);
    });
    var out = [];
    var n = Math.min(count || 1, pool.length);
    for (var i = 0; i < n; i++) {
      out.push(pool.splice(Math.floor(nextRand(state) * pool.length), 1)[0]);
    }
    return out;
  }

  function randomTargetFor(state, actor, s) {
    var picked = randomTargetsFor(state, actor, s, 1);
    return picked.length ? picked[0] : null;
  }

  function useSkill(state, skillId, targetUid) {
    if (state.phase !== 'playing') return { ok: false, error: '战斗已结束' };
    var actor = currentUnit(state);
    if (!actor) return { ok: false, error: '当前没有行动者' };

    var s = skillOf(actor, skillId);
    if (!s) return { ok: false, error: '没有这个技能' };
    if (s.entryOnly) return { ok: false, error: '登场技每场只能使用一次' };
    var restriction = skillRestriction(actor, s);
    if (restriction) return { ok: false, error: restriction };
    if ((actor.cd[s.id] || 0) > 0) return { ok: false, error: '技能冷却中' };
    if (s.ranks.indexOf(actor.rank) < 0) return { ok: false, error: '站位不符' };

    var targets;
    if (s.id === 'pr_rubble' && actor.forecastRank) {
      var foretoldRank = actor.forecastRank;
      targets = state.units.filter(function (t) {
        return t.team !== actor.team && !t.removed && (t.alive || isCorpse(t)) && t.rank === foretoldRank;
      });
      actor.forecastRank = null;
      if (!targets.length) {
        recordSkill(state, actor, s);
        pushLog(state, actor.name + ' 使用「碎石轰击」→ 第 ' + foretoldRank + ' 号位空无一人，碎石落空。', true);
        state.turnIndex += 1;
        stepToNextActor(state);
        return { ok: true };
      }
    } else if (s.target === 'self') {
      targets = [actor];
    } else if (s.aoe) {
      targets = poolOf(state, actor, s).filter(function (t) { return inRangeOf(s, t); });
      var cap = s.maxTargets || 0;
      if (!cap && s.target === 'enemy') cap = CONFIG.aoeMaxTargets;   /* 群体攻击一律最多 2 人 */
      if (cap && targets.length > cap) {
        /* 严格按站位取最靠前的几个 */
        targets = targets.sort(function (a, b) { return a.rank - b.rank; }).slice(0, cap);
      }
    } else if (s.random) {
      var want = typeof s.random === 'number' ? s.random : 1;
      targets = randomTargetsFor(state, actor, s, want);
    } else {
      targets = poolOf(state, actor, s).filter(function (t) {
        return t.uid === targetUid && inRangeOf(s, t);
      });
    }
    if (!targets.length) return { ok: false, error: '没有合法目标' };

    var detail = [];
    targets.forEach(function (t) {
      if (isCorpse(t)) {
        t.corpse = false;
        t.removed = true;
        emit(state, { type: 'corpse', uid: t.uid });
        detail.push(t.name + ' 的尸骸（清除）');
        compactTeam(state, other(actor.team));   /* 尸骸清掉后，后方单位补上来 */
        return;
      }

      var victim = t;
      var guarder = null;
      if (!s.aoe && s.target === 'enemy' && !s.effect.forecast) {
        guarder = guarderOf(state, t);
        if (guarder) victim = guarder;
      }
      /* 闪避：只对带直接伤害的单体/群体攻击生效（标记的"降闪避"会扣掉） */
      var dodgeNow = effectiveDodge(victim);
      if (s.target === 'enemy' && (s.effect.dmg || 0) > 0 &&
          dodgeNow > 0 && nextRand(state) * 100 < dodgeNow) {
        emit(state, { type: 'dodge', uid: victim.uid, from: t.uid });
        if (guarder) {
          detail.push(t.name + '（' + guarder.name + ' 挡下，但' + guarder.name + ' 闪开了）');
        } else {
          detail.push(t.name + '（闪避）');
        }
        return;
      }

      if (guarder && victim === guarder) victim._guardHit = true;
      var notes = applyEffect(state, actor, victim, s.effect || {});
      victim._guardHit = false;
      if (guarder) {
        detail.push(t.name + '（' + guarder.name + ' 挡下）');
        emit(state, { type: 'guard', uid: guarder.uid, from: t.uid });
      } else {
        detail.push(t.name + (notes.length ? '（' + notes.join('、') + '）' : ''));
      }
    });

    recordSkill(state, actor, s);
    pushLog(state, actor.name + ' 使用「' + s.name + '」→ ' + detail.join('　'));

    if (checkEnd(state)) return { ok: true };

    state.turnIndex += 1;
    stepToNextActor(state);
    return { ok: true };
  }

  function moveActor(state, dir) {
    if (state.phase !== 'playing') return { ok: false, error: '战斗已结束' };
    var u = currentUnit(state);
    if (!u || !u.alive) return { ok: false, error: '当前没有行动者' };
    if (!shiftUnit(state, u, dir)) return { ok: false, error: '已经到边' };
    pushLog(state, u.name + (dir > 0 ? ' 后移一位。' : ' 前移一位。'));
    completeAction(state, u);
    state.turnIndex += 1;
    stepToNextActor(state);
    return { ok: true };
  }

  var ITEM_KIND = { bandage: 'bleed', antidote: 'blight' };
  var ITEM_NAME = { bandage: '绷带', antidote: '解毒药' };

  /* 道具只能对自己用，而且不消耗回合 */
  function validItemTargets(state, type) {
    var actor = currentUnit(state);
    if (!actor || state.phase !== 'playing') return [];
    if (!state.items || state.items[type] <= 0) return [];
    var kind = ITEM_KIND[type];
    if (!kind) return [];
    return actor.status[kind] ? [actor.uid] : [];
  }

  function useItem(state, type, targetUid) {
    if (state.phase !== 'playing') return { ok: false, error: '战斗已结束' };
    var actor = currentUnit(state);
    if (!actor) return { ok: false, error: '当前没有行动者' };
    var kind = ITEM_KIND[type];
    if (!kind) return { ok: false, error: '没有这种道具' };
    if (!state.items || state.items[type] <= 0) return { ok: false, error: '道具用完了' };

    var target = unitByUid(state, targetUid);
    if (!target || !target.alive) return { ok: false, error: '目标无效' };
    if (target.uid !== actor.uid) return { ok: false, error: '只能对自己使用' };
    if (!target.status[kind]) return { ok: false, error: '没有需要解除的状态' };

    state.items[type] -= 1;
    target.status[kind] = null;

    emit(state, { type: 'cure', uid: target.uid, status: kind });
    pushLog(state, actor.name + ' 使用' + ITEM_NAME[type] + '，解除自己的' +
      (kind === 'bleed' ? '流血' : '腐蚀') + '（全队剩 ' + state.items[type] + '，不消耗回合）');

    /* 用道具不结束回合，可以继续行动 */
    return { ok: true };
  }

  /* ---------- 敌方自动行动 ---------- */
  function effectOnTarget(t, e) {
    if (!t.alive) return 1;        /* 尸骸：能打但优先级很低 */
    var v = 0;
    var dmg = (e.dmg || 0) + (e.bleed || 0) * 1.3 + (e.blight || 0) * 1.3;
    if (dmg > 0) {
      v += dmg;
      if (t.hp <= dmg) v += 10;              /* 能打死就优先 */
    }
    if (e.stun && !t.status.stun) v += 7;     /* 控住还没被控的 */
    if (e.heal) v += Math.min(e.heal, t.maxHp - t.hp) * 1.5;
    if (e.healRandom) v += Math.min(e.healRandom * 0.55, t.maxHp - t.hp) * 1.5;
    if (e.guard) v += 4;
    if (e.push || e.pull) v += 2;
    return v;
  }

  /* 返回 { type:'skill'|'move', skillId, targetUid, dir } */
  function chooseBossAction(state, actor, ready) {
    if (actor.forecastRank) {
      return { type: 'skill', skillId: 'pr_rubble', targetUid: null };
    }
    // 猪王可兑现一次两连击；两次之后必须换招，避免无限锁定同一人。
    if (actor.id === 'swine_king' && actor.lastSkillId === 'sk_obliterate' && actor.repeatSkillCount === 1) {
      var comboReady = ready.some(function (item) { return item.skill.id === 'sk_obliterate'; });
      var marked = aliveOf(state, other(actor.team)).filter(function (u) { return u.status.mark; });
      if (comboReady && marked.length) {
        marked.sort(function (a, b) { return a.hp - b.hp; });
        return { type: 'skill', skillId: 'sk_obliterate', targetUid: marked[0].uid };
      }
    }
    var turns = actor.skillTurns || 0;
    var used = actor.skillLastUsed || {};
    var choices = [];
    ready.forEach(function (item) {
      var s = item.skill;
      var e = s.effect || {};
      var targets = previewTargets(state, s.id).map(function (uid) { return unitByUid(state, uid); })
        .filter(function (t) { return t.alive || isCorpse(t); });
      if (!targets.length) return;
      var best = targets[0];
      var value = -1;
      targets.forEach(function (t) {
        var v = effectOnTarget(t, e);
        if (e.markBonus && t.status.mark) v += 12;
        if (e.mark && !t.status.mark) v += 4 + (t.rank >= 3 ? 2 : 0);
        if (e.dodgeUp) v += Math.min(8, actor.maxHp - actor.hp);
        if (e.forecast) v = 5;  // 站位预告不按即时伤害评分
        if (v > value) { value = v; best = t; }
      });
      if (e.forecast) best = targets[Math.floor(nextRand(state) * targets.length)];
      var weight = 1;
      if (actor.id === 'sleeper') weight = s.id === 'sl_echo' ? 2 : 4;
      if (e.markBonus && best.status.mark) weight *= 2;
      if (e.dodgeUp) weight *= 1.6;
      // 保留战术倾向，同时限制高伤害技能长期压过其他技能。
      weight *= Math.min(1.6, 0.8 + Math.max(0, value) / 30);
      if (targets.every(function (t) { return !t.alive; })) weight *= 0.2;
      choices.push({ skill: s, target: best, weight: weight, age: turns - (used[s.id] || 0) });
    });
    if (!choices.length) return null;
    // 有其他合法技能时，不连续使用同一招。
    if (choices.length > 1) choices = choices.filter(function (c) { return c.skill.id !== actor.lastSkillId; });
    // 超过一个技能轮换周期还没用过的招式优先，防止低伤害招式被饿死。
    var overdue = choices.filter(function (c) { return c.age >= ready.length + 1; });
    if (overdue.length) {
      var oldest = Math.max.apply(null, overdue.map(function (c) { return c.age; }));
      choices = overdue.filter(function (c) { return c.age === oldest; });
    }
    var total = choices.reduce(function (n, c) { return n + c.weight; }, 0);
    var roll = nextRand(state) * total;
    var picked = choices[choices.length - 1];
    for (var i = 0; i < choices.length; i++) {
      roll -= choices[i].weight;
      if (roll < 0) { picked = choices[i]; break; }
    }
    return { type: 'skill', skillId: picked.skill.id,
      targetUid: picked.skill.aoe || picked.skill.target === 'self' ? null : picked.target.uid };
  }

  function chooseAction(state) {
    var actor = currentUnit(state);
    if (!actor || state.phase !== 'playing') return null;

    var ready = usableSkills(state).filter(function (i) { return i.ready; });

    if (actor.boss && actor.id !== 'brigand_pounder') {
      var bossAction = chooseBossAction(state, actor, ready);
      if (bossAction) return bossAction;
    }

    /* 藏品老兵先护住后排收藏家，守护结束后才再次施放。 */
    if (actor.id === 'collected_guard' && !actor.guarding) {
      var collector = aliveOf(state, actor.team).filter(function (u) { return u.id === 'collector'; })[0];
      var guardSkill = ready.filter(function (i) { return i.skill.id === 'cg_guard'; })[0];
      if (collector && guardSkill) {
        return { type: 'skill', skillId: guardSkill.skill.id, targetUid: collector.uid };
      }
    }

    if (!ready.length) {
      if (actor.rank > 1 && actor.rank < 4) {
        return { type: 'move', dir: actor.rank <= 2 ? 1 : -1 };
      }
      if (actor.rank >= 4) return { type: 'move', dir: -1 };
      if (actor.rank <= 1) return { type: 'move', dir: 1 };
      return null;
    }

    var best = null;
    var bestScore = -1;

    ready.forEach(function (item) {
      var s = item.skill;
      var e = s.effect || {};

      if (s.target === 'self') {
        var v0 = effectOnTarget(actor, e) * (0.9 + nextRand(state) * 0.2);
        if (e.summon) {
          var usedSet = usedRanks(state, actor.team);
          var space = 0;
          for (var rk = 1; rk <= 4; rk++) { if (!usedSet[rk]) space++; }
          v0 += 0;
        }
        if (v0 > bestScore) {
          bestScore = v0;
          best = { type: 'skill', skillId: s.id, targetUid: null };
        }
        return;
      }

      var targets = previewTargets(state, s.id).map(function (uid) { return unitByUid(state, uid); });

      if (s.aoe) {
        if (!targets.length) return;
        var total = 0;
        targets.forEach(function (t) { total += effectOnTarget(t, e); });
        total *= 0.92 + nextRand(state) * 0.16;
        if (total > bestScore) {
          bestScore = total;
          best = { type: 'skill', skillId: s.id, targetUid: null };
        }
        return;
      }

      if (!targets.length) return;
      targets.forEach(function (t) {
        var v = effectOnTarget(t, e) * (0.92 + nextRand(state) * 0.16);
        if (v > bestScore) {
          bestScore = v;
          best = { type: 'skill', skillId: s.id, targetUid: t.uid };
        }
      });
    });

    if (!best) {
      var preferred = actor.rank <= 2 ? 1 : -1;
      if (canShiftUnit(state, actor, preferred)) return { type: 'move', dir: preferred };
      if (canShiftUnit(state, actor, -preferred)) return { type: 'move', dir: -preferred };
      return { type: 'skip' };
    }
    return best;
  }

  function skipTurn(state) {
    if (state.phase !== 'playing') return { ok: false };
    var u = currentUnit(state);
    if (!u) return { ok: false };
    pushLog(state, u.name + ' 待机。');
    completeAction(state, u);
    state.turnIndex += 1;
    stepToNextActor(state);
    return { ok: true };
  }

  return {
    CONFIG: CONFIG,
    PLAYER: PLAYER,
    ENEMY: ENEMY,
    HEROES: HEROES,
    ENEMIES: ENEMIES,
    REGIONS: REGIONS,
    buildSquad: buildSquad,
    heroById: heroById,
    randomEnemy: randomEnemy,
    bestOrder: bestOrder,
    isViable: isViable,
    randomTeam: randomTeam,
    bestRank: bestRank,
    placementScore: placementScore,
    createState: createState,
    currentUnit: currentUnit,
    aliveOf: aliveOf,
    totalHp: totalHp,
    usableSkills: usableSkills,
    previewTargets: previewTargets,
    validTargets: validTargets,
    useSkill: useSkill,
    useItem: useItem,
    chooseAction: chooseAction,
    validItemTargets: validItemTargets,
    ITEM_NAME: ITEM_NAME,
    moveActor: moveActor,
    canMoveActor: canMoveActor,
    skipTurn: skipTurn,
    describe: describe,
    effectiveDodge: effectiveDodge,
    nextWardReduction: nextWardReduction
  };
});

