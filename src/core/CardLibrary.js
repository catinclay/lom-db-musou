/**
 * 卡牌「定義」 — 一張牌本質上是什麼。
 *
 * 關鍵區分（因為合成僅存在於單場戰鬥）：
 *   定義（這裡）      永久不變，一個 defId 一筆
 *   牌組（deck list） 玩家跑圖中構築的 defId 清單，跨戰鬥保存
 *   實例（Card.js）   每場戰鬥開始時由牌組現生，帶階級與 Tag，戰鬥結束即丟棄
 *
 * 合成改的永遠只有「實例」，碰不到定義也碰不到牌組，
 * 所以下一場戰鬥自然乾淨重來。
 *
 * ── 效果怎麼長大 ──
 * base 是「階級一、連擊一」時的樣子：{ hits, damage } 或 { hits, armor }。
 * rankScale / comboScale 決定階級與連擊各自把什麼變大，可依卡自訂。
 * 沒寫就走預設（階級＝曲線放大每發數值、連擊＝線性放大發數），大多數卡不必寫。
 */

import { rankMultiplier } from './Effect.js';
import { TARGET } from './combat.js';
import { STATUS } from './StatusLibrary.js';
import { TUNING } from '../config/tuning.js';

export const CARD_TYPE = {
  ATTACK: 'attack',
  DEFENSE: 'defense',
  /** 技能：不打人、不給甲，做內力／靈感之類的功能效果 */
  SKILL: 'skill',
};

/**
 * 常見的階級成長曲線，給 rankScale 挑用。
 * 預設（不寫 rankScale）走傷害曲線；功能牌用獨立的資源產量曲線。
 */
export const GROWTH = {
  /** 線性倍增：階級 N ＝ 基礎 × N。 */
  linear: (field) => (e, rank) => ({ ...e, [field]: e[field] * rank }),
  /** 線性遞增：每升一階 +step（階級 N ＝ 基礎 + step×(N−1)）。 */
  step: (field, step = 1) => (e, rank) => ({ ...e, [field]: e[field] + step * (rank - 1) }),
  /** 直接查表；超階沿用最後一格。 */
  curve: (field, curve) => (e, rank) => ({
    ...e,
    [field]: curve[Math.min(Math.max(rank, 1), curve.length) - 1],
  }),
  /** 連擊＝重複施放次數，將該次產量等比放大。 */
  repeat: (field) => (e, combo) => ({ ...e, [field]: e[field] * combo }),
};

const oneEnergy = TUNING.energyUnit;
const skillCurve = TUNING.skillResourceCurve;

export const CARD_DEFS = {
  anqi: {
    defId: 'anqi',
    name: '暗器',
    type: CARD_TYPE.ATTACK,
    target: TARGET.SCATTER,
    cost: oneEnergy,
    base: { hits: 3, damage: 5 },
    /** 階級↑ → 每一發更痛（吃階級曲線）；連擊↑ → 撒更多發。 */
    rankScale: (e, rank) => ({ ...e, damage: Math.round(e.damage * rankMultiplier(rank)) }),
    desc: '撒出多發暗器，各自隨機釘住最前排一人',
  },

  hengPi: {
    defId: 'hengPi',
    name: '橫劈',
    type: CARD_TYPE.ATTACK,
    target: TARGET.ROW,
    cost: oneEnergy,
    base: { hits: 1, damage: 7 },
    desc: '橫掃最靠近的一整列',
  },

  guan: {
    defId: 'guan',
    name: '貫',
    type: CARD_TYPE.ATTACK,
    target: TARGET.LANE,
    cost: oneEnergy,
    base: { hits: 1, damage: 8 },
    desc: '貫穿最近一路，由前到後',
  },

  bengShan: {
    defId: 'bengShan',
    name: '崩山',
    type: CARD_TYPE.ATTACK,
    target: TARGET.ROW,
    cost: oneEnergy * 2,
    base: { hits: 1, damage: 6 },
    knockback: 1, // 命中的敵人往後震退一格（連鎖推擠後方）
    desc: '撼動最前一列，震退一步',
  },

  /**
   * 毒霧 —— 純上「中毒」。**無直接傷害**（見 base 無 damage）。
   * effectStatus 是這張卡「自身的效果」（非附魔）：命中最近三排的敵人各上 stacks 層毒，
   *   每次層數隨階級曲線成長，連擊讓它獨立施放多次。
   * rows：NEAR_ROWS 打最近幾排（見 combat.js）。
   */
  duWu: {
    defId: 'duWu',
    name: '毒霧',
    type: CARD_TYPE.ATTACK,
    target: TARGET.NEAR_ROWS,
    rows: 3,
    cost: oneEnergy,
    base: { hits: 1 },
    effectStatus: { id: STATUS.POISON, stacks: 3 },
    desc: '毒霧瀰漫最近三排，全數中毒（無直接傷害）',
  },

  /**
   * 火藥 —— 純上「燃燒」。**無直接傷害**。
   * effectStatus：命中 3×3 範圍的敵人各上 stacks 層火；階級加每次層數，連擊增加獨立爆炸次數。
   * blast：BLAST 方塊邊長（見 combat.js）。
   */
  huoYao: {
    defId: 'huoYao',
    name: '火藥',
    type: CARD_TYPE.ATTACK,
    target: TARGET.BLAST,
    blast: 3,
    cost: oneEnergy,
    base: { hits: 1 },
    effectStatus: { id: STATUS.BURN, stacks: 3 },
    desc: '炸開 3×3 一片（含最近排、盡量多人），範圍內全數燃燒（無直接傷害）',
  },

  yunQi: {
    defId: 'yunQi',
    name: '運氣調息',
    type: CARD_TYPE.SKILL,
    cost: 0,
    base: { energy: skillCurve[0] },
    rankScale: GROWTH.curve('energy', skillCurve),
    comboScale: GROWTH.repeat('energy'),
    desc: '每次施放依階級回復 3／4／5／6／7 小格內力',
  },

  linJi: {
    defId: 'linJi',
    name: '臨機應變',
    type: CARD_TYPE.SKILL,
    cost: oneEnergy,
    base: { inspiration: skillCurve[0] },
    rankScale: GROWTH.curve('inspiration', skillCurve),
    comboScale: GROWTH.repeat('inspiration'),
    desc: '每次施放依階級獲得 3／4／5／6／7 點靈感',
  },

  /**
   * 忘形有兩種用法：打出時境界歸零；拖到具體牌上時讓它升一階並獲得合成靈感。
   * 兩種用法都會讓忘形在本場消耗。
   */
  wangXing: {
    defId: 'wangXing',
    name: '忘形',
    type: CARD_TYPE.SKILL,
    cost: 0,
    rankless: true,
    forgetForm: true,
    desc: '打出：境界歸零並消耗。拖到牌上：消耗忘形，使該牌階級＋1並獲得合成靈感。',
  },
};

export function getCardDef(defId) {
  const def = CARD_DEFS[defId];
  if (!def) throw new Error(`未知的卡牌定義: ${defId}`);
  return def;
}
