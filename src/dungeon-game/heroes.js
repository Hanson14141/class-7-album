
/* 英雄与技能数据：17 名（火枪手为弩手换皮，已排除）
 * ranks       施放者可用站位 [1..4]
 * target      enemy | ally | self
 * targetRanks 目标必须处于的站位
 * aoe         为 true 时命中该站位区间内全部目标，无需手动选目标
 * effect      dmg / heal / stun / bleed / blight / push / pull
 * cd          冷却回合数
 */
(function (root, factory) {
  var list = factory();
  if (typeof module === 'object' && module.exports) module.exports = list;
  else root.HEROES = list;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var list = [
    { id: 'crusader', name: '十字军', role: '坦克', lore: '武器怎么比得上久经锻炼的肉体，他的鬼背甚至连子弹都无法打穿。', lane: 'front', hp: 30, spd: 3, atk: 5, skills: [
      { id: 'smite',        name: '制裁',     ranks: [1, 2],    target: 'enemy', targetRanks: [1, 2],    effect: { dmg: 7 }, cd: 0 },
      { id: 'scroll',      name: '裁决卷轴', ranks: [1, 2],    target: 'enemy', targetRanks: [1, 2, 3, 4], effect: { dmg: 6 }, cd: 2, aoe: true, maxTargets: 2 },
      { id: 'stunning_blow',name: '眩晕打击', ranks: [1, 2],    target: 'enemy', targetRanks: [1],       effect: { dmg: 4, stun: 1 }, cd: 2 },
      { id: 'battle_heal',  name: '战地治疗', ranks: [1, 2],    target: 'ally',  targetRanks: [1, 2],    effect: { heal: 7 }, cd: 1 }
    ]},

    { id: 'manatarms', name: '老兵', role: '坦克', lore: '他始终心系国家，他有一位挚友，被收藏家杀死沦为藏品。', hp: 30, spd: 2, atk: 4, skills: [
      { id: 'crush',      name: '碾压', ranks: [1, 2], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 7 }, cd: 0 },
      { id: 'rampart',    name: '壁垒', ranks: [1, 2], target: 'enemy', targetRanks: [1],    effect: { dmg: 4, stun: 1, push: 1 }, cd: 2 },
      { id: 'hold_line',  name: '坚守', ranks: [1, 2], target: 'self',  targetRanks: [1, 2], effect: { heal: 6 }, cd: 2 },
      { id: 'guard_ally', name: '守护', ranks: [1, 2], target: 'ally',  targetRanks: [1, 2, 3, 4], effect: { guard: 1 }, cd: 2 }
    ]},

    { id: 'flagellant', name: '苦修者', role: '坦克', lore: '她苦修英语，久而久之，没有人能听懂她的语言。', hp: 27, spd: 6, atk: 6, skills: [
      { id: 'punish',    name: '惩罚',     ranks: [1, 2], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 6, bleed: 2 }, cd: 0 },
      { id: 'rain',      name: '悲恸之雨', ranks: [2, 3], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 3, bleed: 2 }, cd: 1, aoe: true },
      { id: 'exsang',    name: '放血',     ranks: [1, 2], target: 'enemy', targetRanks: [1],    effect: { dmg: 4, bleed: 4, drain: 0.6 }, cd: 2 },
      { id: 'redeem',    name: '救赎',     ranks: [1, 2], target: 'ally',  targetRanks: [1, 2, 3, 4], effect: { heal: 10 }, cd: 3 }
    ]},

    { id: 'leper', name: '麻风国王', role: '坦克', lore: '心无旁骛，他背负着带领福建人走向繁荣的使命。', hp: 31, spd: 2, atk: 7, skills: [
      { id: 'chop',     name: '劈砍', ranks: [1], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 10 }, cd: 0 },
      { id: 'hew',      name: '横斩', ranks: [1], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 6 }, cd: 1, aoe: true },
      { id: 'purge',    name: '净化', ranks: [1], target: 'enemy', targetRanks: [1],    effect: { dmg: 5, push: 2 }, cd: 2 },
      { id: 'solemnity',name: '庄严', ranks: [1], target: 'self',  targetRanks: [1],    effect: { heal: 8 }, cd: 2 }
    ]},

    { id: 'highwayman', name: '强盗', role: '输出', lore: '他表面上是警察学院的学生，实则是强盗接头人，你敢和他对视三秒吗？', lane: 'front', hp: 24, spd: 6, atk: 6, skills: [
      { id: 'wicked_slice', name: '邪恶斩击',   ranks: [1, 2], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 8 }, cd: 0 },
      { id: 'point_blank',  name: '近距离射击', ranks: [1],    target: 'enemy', targetRanks: [1],    effect: { dmg: 11, markBonus: 1.15 }, cd: 2 },
      { id: 'grapeshot',    name: '霰弹轰击',   ranks: [2, 3], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 4 }, cd: 1, aoe: true },
      { id: 'open_vein',    name: '割裂',       ranks: [1, 2], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 4, bleed: 3 }, cd: 0 }
    ]},

    { id: 'hellion', name: '地狱犬', role: '输出', lore: '由三位极品皮哥合成而来的三位一体恐怖怪物，破坏力极强。', hp: 26, spd: 7, atk: 6, skills: [
      { id: 'wicked_hack', name: '邪恶劈砍', ranks: [1, 2], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 8 }, cd: 0 },
      { id: 'breakthrough', name: '突破',     ranks: [1, 2], target: 'enemy', targetRanks: [1, 2, 3, 4], effect: { dmg: 4, move: 1 }, cd: 2, aoe: true },
      { id: 'yawp',        name: '野蛮咆哮', ranks: [1, 2], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 2, stun: 1 }, cd: 3, aoe: true },
      { id: 'bleed_out',   name: '放血',     ranks: [1, 2], target: 'enemy', targetRanks: [1],    effect: { dmg: 3, bleed: 5 }, cd: 2 }
    ]},

    { id: 'graverobber', name: '盗墓贼', role: '输出', lore: '他是一个古风小生，喜欢把盗墓得来的珠宝穿在身上。', hp: 22, spd: 7, atk: 6, skills: [
      { id: 'pick_face', name: '刺脸',     ranks: [1, 2, 3], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 7 }, cd: 0 },
      { id: 'lunge',     name: '突刺',     ranks: [2, 3], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 9 }, cd: 1 },
      { id: 'daggers',   name: '闪光匕首', ranks: [2, 3],    target: 'enemy', targetRanks: [2, 3], effect: { dmg: 4, blight: 3 }, cd: 1, aoe: true },
      { id: 'poison_dart', name: '毒镖',   ranks: [2, 3], target: 'enemy', targetRanks: [1, 2, 3, 4], effect: { dmg: 3, blight: 4 }, cd: 1 }
    ]},

    { id: 'shieldbreaker', name: '破盾者', role: '输出', lore: '他曾经通过这个姿势，破了无数敌人的盾，屡试不爽。', hp: 23, spd: 6, atk: 6, skills: [
      { id: 'pierce',   name: '穿刺',     ranks: [1, 2, 3], target: 'enemy', targetRanks: [1, 2],    effect: { dmg: 8 }, cd: 0 },
      { id: 'puncture', name: '刺穿',     ranks: [1, 2],    target: 'enemy', targetRanks: [2, 3, 4], effect: { dmg: 3, pull: 1 }, cd: 1 },
      { id: 'adder',    name: '毒蛇之吻', ranks: [1, 2],    target: 'enemy', targetRanks: [1, 2],    effect: { dmg: 5, blight: 3 }, cd: 0 },
      { id: 'serpent',  name: '蛇之闪避', ranks: [1, 2],    target: 'self',  targetRanks: [1, 2],    effect: { heal: 6 }, cd: 2 }
    ]},

    { id: 'bountyhunter', name: '赏金猎人', role: '输出', lore: '每当他开启战斗模式，实力极为强大，只要钱给的够多，他能为你带来任何人头。他好像喜欢猎杀江西人。', lane: 'front', hp: 25, spd: 5, atk: 6, skills: [
      { id: 'collect',  name: '收集赏金', ranks: [1, 2], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 7, markBonus: 1.4 }, cd: 0 },
      { id: 'uppercut', name: '上勾拳',   ranks: [1, 2],    target: 'enemy', targetRanks: [1],    effect: { dmg: 5, stun: 1, push: 1 }, cd: 2 },
            { id: 'hook',     name: '勾爪',     ranks: [1, 2], target: 'enemy', targetRanks: [2, 3, 4], effect: { dmg: 3, pull: 2, mark: 2 }, cd: 1 },
      { id: 'markdeath', name: '标记死亡', ranks: [1, 2], target: 'enemy', targetRanks: [1, 2], effect: { mark: 3 }, cd: 2 }
    ]},

    { id: 'abomination', name: '憎恶', role: '输出', lore: '他心中压抑着野兽，不得不用粉色手铐囚禁自身，平常人都不敢与之对视。', hp: 26, spd: 5, atk: 6, skills: [
      { id: 'manacles', name: '镣铐',     ranks: [1, 2], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 4, stun: 1 }, cd: 2 },
      { id: 'bile',     name: '兽性胆汁', ranks: [1, 2], target: 'enemy', targetRanks: [2, 3, 4], effect: { dmg: 4, blight: 4 }, cd: 1 },
      { id: 'absolution', name: '赦免',   ranks: [1, 2], target: 'self',  targetRanks: [1, 2], effect: { heal: 9 }, cd: 2 },
      { id: 'slam',     name: '猛击',     ranks: [1],    target: 'enemy', targetRanks: [1],    effect: { dmg: 9 }, cd: 0 }
    ]},

    { id: 'arbalest', name: '弩手', role: '远程', lore: '从异世界来的神秘嘉宾，速度极快。', hp: 22, spd: 5, atk: 6, skills: [
      { id: 'sniper',    name: '狙击',     ranks: [3, 4],    target: 'enemy', targetRanks: [1, 2, 3, 4], effect: { dmg: 9, markBonus: 1.3 }, cd: 0 },
      { id: 'snipemark', name: '狙击标记', ranks: [2, 3, 4], target: 'enemy', targetRanks: [1, 2, 3, 4], effect: { mark: 3, dodgeDown: 15 }, cd: 0 },
      { id: 'blindfire', name: '盲射',     ranks: [3, 4],    target: 'enemy', targetRanks: [1, 2, 3, 4], effect: { dmg: 4 }, cd: 1, random: 2 },
      { id: 'bandage',   name: '战地绷带', ranks: [1, 2, 3, 4], target: 'ally', targetRanks: [1, 2, 3, 4], effect: { heal: 7 }, cd: 2 }
    ]},

    { id: 'antiquarian', name: '古董商', role: '远程', lore: '眼镜被打歪是他的伪装，他非常精明，绝味鸭脖就是他的旗下企业。', hp: 21, spd: 4, atk: 4, skills: [
      { id: 'vapours',  name: '毒气',     ranks: [3, 4],    target: 'enemy', targetRanks: [1, 2], effect: { dmg: 2, blight: 3 }, cd: 1, aoe: true },
      { id: 'flashpowder', name: '闪光粉', ranks: [3, 4],   target: 'enemy', targetRanks: [1, 2], effect: { dmg: 2, stun: 1 }, cd: 2 },
      { id: 'nervous',  name: '紧张刺击', ranks: [2, 3, 4], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 5 }, cd: 0 },
      { id: 'patch_up', name: '应急包扎', ranks: [1, 2, 3, 4], target: 'self', targetRanks: [1, 2, 3, 4], effect: { heal: 5 }, cd: 2 }
    ]},

    { id: 'vestal', name: '修女', role: '治疗', lore: '他娇羞的摸样让很多男人为之疯狂，但是高岭之花不允许任何人触碰，把贞洁献给了神明。', hp: 24, spd: 4, atk: 4, skills: [
      { id: 'grace',    name: '神恩',   ranks: [3, 4], target: 'ally',  targetRanks: [1, 2, 3, 4], effect: { heal: 10 }, cd: 1 },
      { id: 'comfort',  name: '神慰',   ranks: [3, 4], target: 'ally',  targetRanks: [1, 2, 3, 4], effect: { heal: 5 }, cd: 2, aoe: true },
      { id: 'judgement',name: '审判',   ranks: [3, 4], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 6 }, cd: 0 },
      { id: 'dazzle',   name: '眩光',   ranks: [3, 4], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 3, stun: 1 }, cd: 2 }
    ]},

    { id: 'occultist', name: '神秘学家', role: '治疗', lore: '他口中吐着晦涩难懂的语言，内裤外穿是他的个人癖好，他好像不喜欢福建人。', hp: 23, spd: 5, atk: 5, skills: [
      { id: 'wyrd',      name: '诡异重构', ranks: [2, 3],    target: 'ally',  targetRanks: [1, 2, 3, 4], effect: { healRandom: 14, bleedChance: 0.35, bleedAmount: 2 }, cd: 1 },
      { id: 'stab',     name: '献祭之刺', ranks: [1, 2, 3], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 8 }, cd: 0 },
      { id: 'daemon',   name: '恶魔拖拽', ranks: [2, 3], target: 'enemy', targetRanks: [3, 4], effect: { dmg: 3, pull: 2 }, cd: 2 },
      { id: 'vulnhex',  name: '脆弱诅咒', ranks: [2, 3],    target: 'enemy', targetRanks: [1, 2, 3, 4], effect: { mark: 3, dodgeDown: 15 }, cd: 0 }
    ]},

    { id: 'plaguedoctor', name: '瘟疫医生', role: '辅助', lore: '他的尿液具有极强的腐蚀性，融化一切。同时也能让人染上瘟疫。', hp: 22, spd: 5, atk: 4, skills: [
      { id: 'grenade', name: '瘟疫手雷', ranks: [3, 4], target: 'enemy', targetRanks: [3, 4], effect: { blight: 4 }, cd: 1, aoe: true },
      { id: 'gas',     name: '致盲瓦斯', ranks: [3, 4], target: 'enemy', targetRanks: [3, 4], effect: { stun: 1 }, cd: 3, aoe: true },
      { id: 'medicine',name: '战地医疗', ranks: [3, 4], target: 'ally',  targetRanks: [1, 2, 3, 4], effect: { heal: 5 }, cd: 1 },
      { id: 'incision',name: '切割',     ranks: [2, 3], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 5, bleed: 3 }, cd: 0 }
    ]},

    { id: 'jester', name: '小丑', role: '辅助', lore: '他的歌声毁天灭地，穿透耳膜，他在另一个世界是六十级大佬。', hp: 21, spd: 8, atk: 5, skills: [
      { id: 'harvest', name: '收割',     ranks: [2, 3],    target: 'enemy', targetRanks: [1, 2], effect: { dmg: 4, bleed: 2 }, cd: 0, aoe: true },
      { id: 'finale',  name: '终曲',     ranks: [1, 2, 3], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 12, move: -1 }, cd: 3 },
      { id: 'dirk',    name: '短剑突刺', ranks: [2, 3], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 6, move: 1 }, cd: 0 },
      { id: 'slice',   name: '切割',     ranks: [1, 2],    target: 'enemy', targetRanks: [1, 2], effect: { dmg: 4, bleed: 3 }, cd: 1 }
    ]},

    { id: 'houndmaster', name: '驯犬师', role: '辅助', lore: '他随手发的自拍传到网上就收获了很多人叫爸爸，现实中训狗技术也是一流，无论是两条腿的还是四条腿的。', hp: 24, spd: 6, atk: 5, skills: [
      { id: 'rush',    name: '猎犬突袭', ranks: [1, 2, 3], target: 'enemy', targetRanks: [1, 2, 3, 4], effect: { dmg: 7, markBonus: 1.3 }, cd: 0 },
      { id: 'harry',   name: '猎犬撕咬', ranks: [2, 3],    target: 'enemy', targetRanks: [1, 2, 3, 4], effect: { dmg: 3, bleed: 3 }, cd: 1, aoe: true },
      { id: 'whistle',  name: '标记口哨', ranks: [1, 2, 3], target: 'enemy', targetRanks: [1, 2, 3, 4], effect: { mark: 3 }, cd: 1 },
      { id: 'guard_dog', name: '护卫犬', ranks: [2, 3], target: 'ally', targetRanks: [1, 2, 3, 4], effect: { guard: 1 }, cd: 2 }
    ]}
  ];

  /* 抗性：眩晕 / 流血 / 腐蚀 / 位移，数值参考原作区间（10~50%），不是逐项照抄 */
  var RES = {
    crusader:     { stun: 40, bleed: 30, blight: 30, move: 25 },
    manatarms:    { stun: 45, bleed: 35, blight: 35, move: 30 },
    flagellant:   { stun: 35, bleed: 45, blight: 30, move: 25 },
    leper:        { stun: 50, bleed: 40, blight: 40, move: 40 },

    highwayman:   { stun: 30, bleed: 20, blight: 20, move: 30 },
    hellion:      { stun: 30, bleed: 25, blight: 25, move: 25 },
    graverobber:  { stun: 25, bleed: 15, blight: 20, move: 45 },
    shieldbreaker:{ stun: 30, bleed: 20, blight: 35, move: 35 },
    bountyhunter: { stun: 35, bleed: 25, blight: 25, move: 30 },
    abomination:  { stun: 35, bleed: 25, blight: 35, move: 25 },

    arbalest:     { stun: 20, bleed: 15, blight: 15, move: 25 },
    antiquarian:  { stun: 20, bleed: 15, blight: 20, move: 35 },

    vestal:       { stun: 30, bleed: 20, blight: 25, move: 20 },
    occultist:    { stun: 30, bleed: 15, blight: 30, move: 25 },
    plaguedoctor: { stun: 25, bleed: 15, blight: 45, move: 25 },
    jester:       { stun: 25, bleed: 20, blight: 20, move: 40 },
    houndmaster:  { stun: 30, bleed: 25, blight: 25, move: 30 }
  };

  list.forEach(function (hero) {
    hero.res = RES[hero.id] || { stun: 25, bleed: 20, blight: 20, move: 25 };
  });

  return list;
});

