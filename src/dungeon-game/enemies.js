
/* 小怪数据：16 种，数值按本作量级（角色血 21–31、伤害 4–12）设定
 * 结构与英雄一致：id / name / role / hp / spd / atk / res / skills
 * role 只用于自动布阵，'近战' 靠前、'远程' 靠后
 */
(function (root, factory) {
  var list = factory();
  if (typeof module === 'object' && module.exports) module.exports = list;
  else root.ENEMIES = list;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return [
    /* ---------- 废墟 ---------- */
    { id: 'bone_soldier', name: '骷髅剑士', role: '近战', hp: 10, spd: 3, atk: 5,
      res: { stun: 10, bleed: 10, blight: 30, move: 20 },
      skills: [
        { id: 'bs_slash', name: '劈砍', ranks: [1, 2, 3], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 6 }, cd: 0 },
        { id: 'bs_flail', name: '乱挥', ranks: [1, 2, 3], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 4 }, cd: 1 }
      ]},

    { id: 'bone_defender', name: '骷髅盾卫', role: '近战', hp: 16, spd: 2, atk: 4,
      res: { stun: 40, bleed: 20, blight: 30, move: 40 },
      skills: [
        { id: 'bd_bash', name: '盾撞', ranks: [1], target: 'enemy', targetRanks: [1], effect: { dmg: 4, stun: 1 }, cd: 1 },
        { id: 'bd_brace', name: '顶盾', ranks: [1], target: 'self', targetRanks: [1], effect: { heal: 5 }, cd: 2 },
        { id: 'bd_maul', name: '骨锤', ranks: [1], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 5 }, cd: 0 }
      ]},

    { id: 'bone_arbalest', name: '骷髅弩手', role: '远程', hp: 11, spd: 4, atk: 5,
      res: { stun: 15, bleed: 10, blight: 30, move: 10 },
      skills: [
        { id: 'ba_bolt', name: '弩箭', ranks: [3, 4], target: 'enemy', targetRanks: [2, 3, 4], effect: { dmg: 7 }, cd: 0 },
        { id: 'ba_pierce', name: '穿刺箭', ranks: [3, 4], target: 'enemy', targetRanks: [1, 2, 3, 4], effect: { dmg: 9 }, cd: 2 }
      ]},

    { id: 'bone_courtier', name: '骨廷臣', role: '远程', hp: 12, spd: 5, atk: 4,
      res: { stun: 20, bleed: 15, blight: 30, move: 20 },
      skills: [
        { id: 'bc_goblet', name: '诱惑酒杯', ranks: [2, 3], target: 'enemy', targetRanks: [1, 2], effect: { blight: 4 }, cd: 0 },
        { id: 'bc_dagger', name: '匕首', ranks: [2, 3], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 4 }, cd: 0 }
      ]},

    /* ---------- 荒野 ---------- */
    { id: 'brigand_cutthroat', name: '强盗割喉者', role: '近战', hp: 14, spd: 6, atk: 6,
      res: { stun: 20, bleed: 30, blight: 20, move: 25 },
      skills: [
        { id: 'br_cut', name: '割喉', ranks: [1, 2], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 6, bleed: 3 }, cd: 0 },
        { id: 'br_rush', name: '突袭', ranks: [1, 2], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 8 }, cd: 2 }
      ]},

    { id: 'brigand_fusilier', name: '强盗火枪手', role: '远程', hp: 12, spd: 5, atk: 6,
      res: { stun: 15, bleed: 15, blight: 15, move: 20 },
      skills: [
        { id: 'bf_shot', name: '火枪', ranks: [3, 4], target: 'enemy', targetRanks: [2, 3, 4], effect: { dmg: 7 }, cd: 0 },
        { id: 'bf_suppress', name: '压制射击', ranks: [3, 4], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 3, push: 1 }, cd: 1 }
      ]},

    { id: 'fungal_artillery', name: '真菌炮手', role: '远程', hp: 14, spd: 3, atk: 5,
      res: { stun: 20, bleed: 20, blight: 60, move: 10 },
      skills: [
        { id: 'fa_barrage', name: '孢子弹幕', ranks: [3, 4], target: 'enemy', targetRanks: [1, 2], effect: { blight: 4 }, cd: 0, aoe: true },
        { id: 'fa_burst', name: '孢子爆裂', ranks: [3, 4], target: 'enemy', targetRanks: [1, 2, 3, 4], effect: { dmg: 8 }, cd: 2 }
      ]},

    { id: 'madman', name: '疯子', role: '近战', hp: 10, spd: 7, atk: 5,
      res: { stun: 10, bleed: 15, blight: 15, move: 25 },
      skills: [
        { id: 'md_axe', name: '乱斧', ranks: [1, 2, 3, 4], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 6 }, cd: 0 },
        { id: 'md_bite', name: '撕咬', ranks: [1, 2], target: 'enemy', targetRanks: [1], effect: { dmg: 3, bleed: 2 }, cd: 1 }
      ]},

    /* ---------- 猪圈 ---------- */
    { id: 'swine_slasher', name: '猪人屠夫', role: '近战', hp: 18, spd: 4, atk: 7,
      res: { stun: 30, bleed: 25, blight: 20, move: 25 },
      skills: [
        { id: 'ss_cleave', name: '屠刀', ranks: [1, 2], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 7, bleed: 2 }, cd: 0 },
        { id: 'ss_chop', name: '猛砍', ranks: [1, 2], target: 'enemy', targetRanks: [1], effect: { dmg: 9 }, cd: 2 }
      ]},

    { id: 'swine_wretch', name: '猪人呕吐者', role: '远程', hp: 14, spd: 5, atk: 4,
      res: { stun: 20, bleed: 20, blight: 50, move: 20 },
      skills: [
        { id: 'sw_vomit', name: '呕吐', ranks: [2, 3, 4], target: 'enemy', targetRanks: [1, 2], effect: { blight: 5 }, cd: 1, aoe: true },
        { id: 'sw_claw', name: '抓挠', ranks: [2, 3, 4], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 4 }, cd: 0 }
      ]},

    { id: 'ghoul', name: '食尸鬼', role: '近战', hp: 22, spd: 3, atk: 7,
      res: { stun: 35, bleed: 35, blight: 25, move: 40 },
      skills: [
        { id: 'gh_rend', name: '撕咬', ranks: [1, 2], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 8, bleed: 2 }, cd: 0 },
        { id: 'gh_skull', name: '投掷骨头', ranks: [1, 2], target: 'enemy', targetRanks: [2, 3, 4], effect: { dmg: 6 }, cd: 1 }
      ]},

    { id: 'maggot', name: '巨型蛆虫', role: '近战', hp: 7, spd: 6, atk: 3,
      res: { stun: 5, bleed: 5, blight: 70, move: 20 },
      skills: [
        { id: 'mg_gnaw', name: '啃咬', ranks: [1, 2, 3, 4], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 3, blight: 2 }, cd: 0 }
      ]},

    /* ---------- 海湾 ---------- */
    { id: 'pelagic_grouper', name: '鱼人武士', role: '近战', hp: 18, spd: 5, atk: 6,
      res: { stun: 20, bleed: 25, blight: 25, move: 30 },
      skills: [
        { id: 'pg_trident', name: '鱼叉', ranks: [1, 2], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 7 }, cd: 0 },
        { id: 'pg_sweep', name: '横扫', ranks: [1, 2], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 4 }, cd: 1, aoe: true }
      ]},

    { id: 'pelagic_shaman', name: '鱼人祭司', role: '远程', hp: 13, spd: 4, atk: 4,
      res: { stun: 35, bleed: 20, blight: 25, move: 20 },
      skills: [
        { id: 'ps_tide', name: '潮汐治愈', ranks: [3, 4], target: 'ally', targetRanks: [1, 2, 3, 4], effect: { heal: 5 }, cd: 2, aoe: true },
        { id: 'ps_curse', name: '深海诅咒', ranks: [3, 4], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 3, blight: 3 }, cd: 0 }
      ]},

    { id: 'drowned', name: '溺亡者', role: '近战', hp: 16, spd: 4, atk: 5,
      res: { stun: 15, bleed: 15, blight: 40, move: 30 },
      skills: [
        { id: 'dr_drag', name: '拖拽', ranks: [1, 2], target: 'enemy', targetRanks: [2, 3], effect: { dmg: 4, pull: 1 }, cd: 0 },
        { id: 'dr_drown', name: '溺水', ranks: [1, 2], target: 'enemy', targetRanks: [1, 2], effect: { blight: 4 }, cd: 1 }
      ]},

    { id: 'spider', name: '洞穴蜘蛛', role: '远程', dodge: 14, hp: 9, spd: 8, atk: 4,
      res: { stun: 15, bleed: 10, blight: 20, move: 50 },
      skills: [
        { id: 'sp_fang', name: '毒牙', ranks: [1, 2, 3, 4], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 3, blight: 3 }, cd: 0 },
        { id: 'sp_web', name: '蛛丝', ranks: [2, 3], target: 'enemy', targetRanks: [3, 4], effect: { dmg: 2, pull: 2 }, cd: 2 }
      ]},

    { id: 'cultist', name: '邪教徒', role: '近战', hp: 12, spd: 5, atk: 5,
      res: { stun: 20, bleed: 20, blight: 20, move: 20 },
      skills: [
        { id: 'cu_dagger', name: '献祭匕首', ranks: [1, 2, 3], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 6, bleed: 2 }, cd: 0 },
        { id: 'cu_frenzy', name: '狂热', ranks: [1, 2], target: 'enemy', targetRanks: [1], effect: { dmg: 9 }, cd: 2 }
      ]},

    /* ---------- 扩充：各地区第二梯队 ---------- */
    { id: 'bone_spearman', name: '骸骨长枪兵', role: '近战', hp: 12, spd: 4, atk: 6,
      res: { stun: 15, bleed: 10, blight: 30, move: 25 },
      skills: [
        { id: 'bsp_thrust', name: '长枪突刺', ranks: [2, 3], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 7 }, cd: 0 },
        { id: 'bsp_sweep', name: '横扫枪', ranks: [1, 2], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 4 }, cd: 1, aoe: true }
      ]},

    { id: 'bone_acolyte', name: '骷髅祭司', role: '远程', hp: 10, spd: 5, atk: 4,
      res: { stun: 20, bleed: 15, blight: 15, move: 20 },
      skills: [
        { id: 'bac_pray', name: '亡者祈祷', ranks: [3, 4], target: 'ally', targetRanks: [1, 2, 3, 4], effect: { heal: 4 }, cd: 2, aoe: true },
        { id: 'bac_curse', name: '枯骨诅咒', ranks: [3, 4], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 3, blight: 3 }, cd: 0 }
      ]},

    { id: 'brigand_bloodletter', name: '强盗血徒', role: '近战', hp: 13, spd: 5, atk: 6,
      res: { stun: 20, bleed: 35, blight: 20, move: 25 },
      skills: [
        { id: 'bbl_bleed', name: '放血', ranks: [1, 2], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 5, bleed: 4 }, cd: 0 },
        { id: 'bbl_throw', name: '掷刀', ranks: [2, 3], target: 'enemy', targetRanks: [2, 3, 4], effect: { dmg: 4 }, cd: 0 }
      ]},

    { id: 'rabid_dog', name: '疯狗', role: '近战', dodge: 12, hp: 8, spd: 9, atk: 4,
      res: { stun: 10, bleed: 15, blight: 15, move: 40 },
      skills: [
        { id: 'rd_bite', name: '撕咬', ranks: [1, 2], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 4, bleed: 2 }, cd: 0 },
        { id: 'rd_pounce', name: '扑击', ranks: [1, 2, 3], target: 'enemy', targetRanks: [2, 3], effect: { dmg: 6 }, cd: 2 }
      ]},

    { id: 'swine_skiver', name: '猪人投掷者', role: '远程', hp: 12, spd: 6, atk: 5,
      res: { stun: 20, bleed: 20, blight: 30, move: 25 },
      skills: [
        { id: 'ssk_spear', name: '投矛', ranks: [2, 3, 4], target: 'enemy', targetRanks: [2, 3, 4], effect: { dmg: 6 }, cd: 0 },
        { id: 'ssk_charge', name: '猪突', ranks: [1, 2], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 3, push: 1 }, cd: 1 }
      ]},

    { id: 'bloated_corpse', name: '肿胀尸', role: '近战', hp: 18, spd: 2, atk: 5,
      res: { stun: 25, bleed: 20, blight: 60, move: 30 },
      skills: [
        { id: 'bc_burst', name: '尸爆', ranks: [1, 2], target: 'enemy', targetRanks: [1, 2], effect: { blight: 4 }, cd: 2, aoe: true },
        { id: 'bc_claw', name: '抓挠', ranks: [1, 2], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 5 }, cd: 0 }
      ]},

    { id: 'pelagic_fighter', name: '鱼人斗士', role: '近战', hp: 16, spd: 6, atk: 6,
      res: { stun: 25, bleed: 30, blight: 25, move: 35 },
      skills: [
        { id: 'pf_trident', name: '三叉戟', ranks: [1, 2], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 7 }, cd: 0 },
        { id: 'pf_lunge', name: '突刺', ranks: [1, 2, 3], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 5, bleed: 2 }, cd: 1 }
      ]},

    { id: 'drowned_anchorite', name: '深海溺者', bossOnly: true, role: '远程', hp: 14, spd: 3, atk: 5,
      res: { stun: 20, bleed: 15, blight: 45, move: 25 },
      skills: [
        { id: 'da_whisper', name: '深渊低语', ranks: [3, 4], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 3, blight: 4 }, cd: 0 },
        { id: 'da_drag', name: '缠藻', ranks: [2, 3, 4], target: 'enemy', targetRanks: [3, 4], effect: { dmg: 2, pull: 2 }, cd: 2 }
      ]},

    /* ---------- 召唤物：只由 BOSS 召唤出场 ---------- */
    { id: 'prophet_acolyte', name: '腐朽祭师', bossOnly: true, role: '远程', hp: 10, spd: 5, atk: 4,
      res: { stun: 20, bleed: 15, blight: 15, move: 20 },
      skills: [
        { id: 'pa_pray', name: '亡者祈祷', ranks: [3, 4], target: 'ally', targetRanks: [1, 2, 3, 4], effect: { heal: 4 }, cd: 2, aoe: true },
        { id: 'pa_curse', name: '枯骨诅咒', ranks: [3, 4], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 3, blight: 3 }, cd: 0 }
      ]},

    { id: 'cannon_gunner', name: '炮队枪手', bossOnly: true, role: '远程', hp: 12, spd: 5, atk: 6,
      res: { stun: 15, bleed: 15, blight: 15, move: 20 },
      skills: [
        { id: 'cng_shot', name: '火枪', ranks: [3, 4], target: 'enemy', targetRanks: [2, 3, 4], effect: { dmg: 7 }, cd: 0 },
        { id: 'cng_suppress', name: '压制射击', ranks: [3, 4], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 3, push: 1 }, cd: 1 }
      ]},

    { id: 'cannon_guard', name: '炮队刀卫', bossOnly: true, role: '近战', hp: 14, spd: 6, atk: 6,
      res: { stun: 20, bleed: 30, blight: 20, move: 25 },
      skills: [
        { id: 'cdg_cut', name: '割喉', ranks: [1, 2], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 6, bleed: 3 }, cd: 0 },
        { id: 'cdg_rush', name: '突袭', ranks: [1, 2], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 8 }, cd: 2 }
      ]},

    { id: 'hungry_pig', name: '饿猪', role: '近战', hp: 14, spd: 6, atk: 4, crit: 5, dodge: 4,
      res: { stun: 10, bleed: 5, blight: 20, move: 30 },
      skills: [
        { id: 'hg_bite', name: '啃咬', ranks: [1, 2, 3, 4], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 5, bleed: 2 }, cd: 0 },
        { id: 'hg_ram',  name: '拱撞', ranks: [1, 2, 3, 4], target: 'enemy', targetRanks: [1, 2, 3], effect: { dmg: 4, push: 1 }, cd: 0 }
      ]},

    { id: 'revenant', name: '亡灵', role: '远程', hp: 16, spd: 3, atk: 4, crit: 4, dodge: 2,
      res: { stun: 40, bleed: 50, blight: 10, move: 25 },
      skills: [
        { id: 'rv_touch', name: '亡者之触', ranks: [1, 2, 3], target: 'enemy', targetRanks: [1, 2, 3, 4], effect: { dmg: 4, blight: 3 }, cd: 0 },
        { id: 'rv_claw',  name: '骨爪',     ranks: [1, 2, 3], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 6 }, cd: 0 }
      ]},

    { id: 'croc_hatchling', name: '幼鳄', role: '近战', hp: 12, spd: 7, atk: 4, crit: 5, dodge: 6,
      res: { stun: 15, bleed: 20, blight: 35, move: 35 },
      skills: [
        { id: 'ch_snap', name: '突袭撕咬', ranks: [3, 4], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 3, bleed: 2 }, cd: 0 }
      ]},

    /* 收藏家的三件藏品：分别占据前、中、后排。 */
    { id: 'collected_guard', name: '藏品老兵', role: '坦克', hp: 18, spd: 4, atk: 4, crit: 3, dodge: 3,
      res: { stun: 25, bleed: 30, blight: 30, move: 25 },
      skills: [
        { id: 'cg_guard', name: '护主', ranks: [1, 2, 3, 4], target: 'ally', targetRanks: [1, 2, 3, 4], effect: { guard: true }, cd: 0 },
        { id: 'cg_bash', name: '头盔撞击', ranks: [1, 2, 3, 4], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 4, stun: 1 }, cd: 0 }
      ]},
    { id: 'collected_highwayman', name: '藏品强盗', role: '近战', hp: 15, spd: 6, atk: 5, crit: 7, dodge: 6,
      res: { stun: 15, bleed: 25, blight: 25, move: 25 },
      skills: [
        { id: 'ch_headhunt', name: '猎首', ranks: [1, 2, 3, 4], target: 'enemy', targetRanks: [1, 2, 3, 4], effect: { dmg: 5, bleed: 2 }, cd: 0 }
      ]},
    { id: 'collected_vestal', name: '藏品修女', role: '治疗', hp: 14, spd: 3, atk: 3, crit: 3, dodge: 4,
      res: { stun: 20, bleed: 25, blight: 35, move: 25 },
      skills: [
        { id: 'cv_heal', name: '颅中祷言', ranks: [1, 2, 3, 4], target: 'ally', targetRanks: [1, 2, 3, 4], effect: { heal: 6 }, cd: 0 },
        { id: 'cv_flash', name: '头骨闪光', ranks: [1, 2, 3, 4], target: 'enemy', targetRanks: [2, 3, 4], effect: { dmg: 3, blight: 2 }, cd: 0 }
      ]},

    { id: 'brigand_matchman', name: '炮队火绳手', role: '辅助', hp: 9, spd: -5, atk: 0, crit: 0, dodge: 5,
      res: { stun: 10, bleed: 15, blight: 15, move: 20 },
      skills: [
        { id: 'bm_light', name: '点燃引线', ranks: [1, 2, 3, 4], target: 'self', targetRanks: [1, 2, 3, 4], effect: { igniteCannon: true }, cd: 0 }
      ]},

    /* ---------- BOSS：五名大型 BOSS 携一名随从；收藏家与火炮携三名；沉睡者单独登场 ---------- */
    { id: 'swine_king', name: '猪王', role: '近战', boss: true, size: 2, region: '猪圈',
      hp: 110, spd: 2, atk: 8, crit: 8, dodge: 3,
      res: { stun: 35, bleed: 30, blight: 30, move: 45 },
      skills: [
        { id: 'sk_charge', name: '蛮猪冲撞', ranks: [1], target: 'enemy', targetRanks: [1, 2, 3], effect: { dmg: 7, push: 1 }, cd: 3, aoe: true },
        { id: 'sk_rend', name: '撕裂', ranks: [1], target: 'enemy', targetRanks: [1], effect: { dmg: 8, bleed: 3 }, cd: 0 },
        { id: 'sk_roar', name: '震地咆哮', ranks: [1], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 4, stun: 1 }, cd: 4, aoe: true },
        { id: 'sk_obliterate', name: '王之抹杀', ranks: [1], target: 'enemy', targetRanks: [1, 2, 3, 4], effect: { dmg: 5, mark: 2, markBonus: 1.5 }, cd: 0 },
        { id: 'sk_call', name: '召唤猪崽', ranks: [1], target: 'self', targetRanks: [1, 2, 3, 4], effect: { summon: 'hungry_pig', summonCount: 1 }, cd: 0, entryOnly: true }
      ]},

    { id: 'siren', name: '女妖', role: '远程', boss: true, size: 2, region: '海湾',
      hp: 84, spd: 6, atk: 6, crit: 7, dodge: 6,
      res: { stun: 15, bleed: 25, blight: 45, move: 50 },
      skills: [
        { id: 'si_song', name: '魅惑之歌', ranks: [1], target: 'enemy', targetRanks: [3, 4], effect: { stun: 1, pull: 1 }, cd: 4 },
        { id: 'si_howl', name: '潮汐之嚎', ranks: [1], target: 'enemy', targetRanks: [1, 2, 3, 4], effect: { dmg: 6, blight: 4 }, cd: 4, aoe: true },
        { id: 'si_embrace', name: '深海之拥', ranks: [1], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 9, bleed: 3 }, cd: 0 },
        { id: 'si_devour', name: '吞噬', ranks: [1], target: 'enemy', targetRanks: [1, 2, 3, 4], effect: { dmg: 2, bleed: 2 }, cd: 0, aoe: true },
        { id: 'si_call', name: '呼唤深海溺者', ranks: [1], target: 'self', targetRanks: [1, 2, 3, 4], effect: { summon: 'drowned_anchorite', summonCount: 1 }, cd: 0, entryOnly: true }
      ]},
    { id: 'necromancer', name: '死灵法师', role: '远程', boss: true, size: 2, region: '荒野',
      hp: 92, spd: 5, atk: 6, crit: 6, dodge: 4,
      res: { stun: 30, bleed: 40, blight: 20, move: 35 },
      skills: [
        { id: 'ne_drain', name: '汲魂', ranks: [1, 2], target: 'enemy', targetRanks: [1, 2, 3, 4], effect: { dmg: 7, drain: 0.4 }, cd: 1 },
        { id: 'ne_breath', name: '亡者之息', ranks: [1, 2], target: 'enemy', targetRanks: [1, 2, 3, 4], effect: { dmg: 4, blight: 3, selfHeal: 1 }, cd: 3, aoe: true },
        { id: 'ne_spear', name: '骨矛', ranks: [1, 2], target: 'enemy', targetRanks: [3, 4], effect: { dmg: 11 }, cd: 0 },
        { id: 'ne_curse', name: '尸咒', ranks: [1, 2], target: 'enemy', targetRanks: [1], effect: { dmg: 6, stun: 1, blight: 3 }, cd: 3 },
        { id: 'ne_claws', name: '死者之爪', ranks: [1, 2], target: 'enemy', targetRanks: [3, 4], effect: { dmg: 5 }, cd: 0, aoe: true },
        { id: 'ne_raise', name: '唤醒亡者', ranks: [1, 2], target: 'self', targetRanks: [1, 2, 3, 4], effect: { summon: 'revenant', summonCount: 1 }, cd: 0, entryOnly: true }
      ]},

    { id: 'crocodile', name: '巨型鳄鱼', role: '近战', boss: true, size: 2, region: '海湾',
      hp: 84, spd: 9, atk: 7, crit: 10, dodge: 7,
      res: { stun: 25, bleed: 20, blight: 45, move: 60 },
      skills: [
        { id: 'cr_bite', name: '撕咬', ranks: [1], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 8, bleed: 4 }, cd: 0 },
        { id: 'cr_roll', name: '死亡翻滚', ranks: [1], target: 'enemy', targetRanks: [1, 2, 3], effect: { dmg: 5, bleed: 3 }, cd: 3, aoe: true },
        { id: 'cr_tail', name: '尾击', ranks: [1], target: 'enemy', targetRanks: [1, 2, 3, 4], effect: { dmg: 5, push: 1 }, cd: 2 },
        { id: 'cr_submerge', name: '潜没', ranks: [1], target: 'self', targetRanks: [1], effect: { selfHeal: 6, dodgeUp: 15 }, cd: 0, maxUses: 2, hpBelow: 0.7 },
        { id: 'cr_call', name: '呼唤幼鳄', ranks: [1], target: 'self', targetRanks: [1, 2, 3, 4], effect: { summon: 'croc_hatchling', summonCount: 1 }, cd: 0, entryOnly: true }
      ]},

    { id: 'prophet', name: '枯骨先知', role: '远程', boss: true, size: 2, region: '废墟',
      hp: 62, spd: 3, atk: 8, crit: 9, dodge: 0,
      res: { stun: 45, bleed: 35, blight: 35, move: 40 },
      skills: [
        { id: 'pr_rubble', name: '碎石轰击', ranks: [1], target: 'enemy', targetRanks: [3, 4], effect: { dmg: 13, push: 1 }, cd: 1 },
        { id: 'pr_ruin', name: '天谴', ranks: [1], target: 'enemy', targetRanks: [1, 2, 3, 4], effect: { dmg: 6, stun: 1 }, cd: 4, aoe: true },
        { id: 'pr_bone', name: '碎骨', ranks: [1], target: 'enemy', targetRanks: [1, 2], effect: { dmg: 8, blight: 3 }, cd: 0 },
        { id: 'pr_forecast', name: '灾祸预言', ranks: [1], target: 'enemy', targetRanks: [1, 2, 3, 4], effect: { forecast: true }, cd: 0 },
        { id: 'pr_call', name: '召来腐朽祭师', ranks: [1], target: 'self', targetRanks: [1, 2, 3, 4], effect: { summon: 'prophet_acolyte', summonCount: 1 }, cd: 0, entryOnly: true }
      ]},

    { id: 'collector', name: '收藏家', role: '远程', boss: true, size: 1, startRank: 4, region: '废墟',
      hp: 68, spd: 5, atk: 6, crit: 6, dodge: 5,
      res: { stun: 30, bleed: 25, blight: 35, move: 45 },
      skills: [
        { id: 'co_steal', name: '汲取生命', ranks: [1, 2, 3, 4], target: 'enemy', targetRanks: [1, 2, 3, 4], effect: { dmg: 6, drain: 0.4 }, cd: 0 },
        { id: 'co_display', name: '展示藏品', ranks: [1, 2, 3, 4], target: 'enemy', targetRanks: [1, 2, 3, 4], effect: { dmg: 3, mark: 2 }, cd: 0, aoe: true },
        { id: 'co_call', name: '召集藏品', ranks: [4], target: 'self', targetRanks: [1, 2, 3, 4],
          effect: { summonRoster: ['collected_guard', 'collected_highwayman', 'collected_vestal'] }, cd: 0, entryOnly: true }
      ]},

    { id: 'brigand_pounder', name: '强盗火炮', role: '远程', boss: true, size: 1, startRank: 2,
      noEnrage: true, region: '荒野', hp: 76, spd: 0, atk: 0, crit: 0, dodge: 0,
      res: { stun: 100, bleed: 80, blight: 80, move: 100 },
      skills: [
        { id: 'bp_reload', name: '装填火炮', ranks: [1, 2, 3, 4], target: 'self', targetRanks: [1, 2, 3, 4], effect: { reload: true }, cd: 0 },
        { id: 'bp_call', name: '召集炮队', ranks: [2], target: 'self', targetRanks: [1, 2, 3, 4],
          effect: { summonRoster: ['cannon_guard', 'brigand_matchman', 'cannon_gunner'] }, cd: 0, entryOnly: true }
      ]},

    { id: 'sleeper', name: '沉睡者', role: '远程', boss: true, size: 2,
      noEnrage: true, region: '深渊', hp: 92, spd: 6, atk: 7, crit: 8, dodge: 0, dr: 0.12,
      res: { stun: 65, bleed: 75, blight: 35, move: 100 },
      skills: [
        { id: 'sl_awaken', name: '沉睡者苏醒', ranks: [1], target: 'enemy', targetRanks: [1, 2, 3, 4],
          effect: { dmg: 5 }, cd: 0, aoe: true, maxTargets: 4 },
        { id: 'sl_stir', name: '沉睡者躁动', ranks: [1], target: 'enemy', targetRanks: [1, 2, 3, 4],
          effect: { dmg: 3, blight: 2 }, cd: 0, aoe: true, maxTargets: 4 },
        { id: 'sl_echo', name: '梦魇回响', ranks: [1], target: 'enemy', targetRanks: [1, 2, 3, 4],
          effect: { mark: 2, dodgeDown: 10 }, cd: 0, aoe: true, maxTargets: 2 }
      ]}
  ];
});

