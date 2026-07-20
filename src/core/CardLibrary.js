/**
 * 卡牌「定義」 — 一張牌本質上是什麼。
 *
 * 關鍵區分（因為合成僅存在於單場戰鬥）：
 *   定義（這裡）      永久不變，一個 defId 一筆
 *   牌組（deck list） 玩家跑圖中構築的 defId 清單，跨戰鬥保存
 *   實例（Card.js）   每場戰鬥開始時由牌組現生，帶境界與 Tag，戰鬥結束即丟棄
 *
 * 合成改的永遠只有「實例」，碰不到定義也碰不到牌組，
 * 所以下一場戰鬥自然乾淨重來。
 *
 * ── 效果怎麼長大 ──
 * base 是「境界一、無連段」時的樣子：{ hits, damage } 或 { hits, armor }。
 * realmScale / comboScale 決定境界與連段各自把什麼變大，可依卡自訂。
 * 沒寫就走預設（境界＝等比放大每發數值、連段＝線性放大每發數值），大多數卡不必寫。
 */

import { realmMultiplier } from './Effect.js';
import { TARGET } from './combat.js';
import { STATUS } from './StatusLibrary.js';

export const CARD_TYPE = {
  ATTACK: 'attack',
  DEFENSE: 'defense',
  /** 技能：不打人、不給甲，做內力/抽牌之類的功能效果 */
  SKILL: 'skill',
  /** 催化劑：無境界、無戰鬥數值，只作合成材料（見忘形卡） */
  CATALYST: 'catalyst',
};

/**
 * 常見的境界成長曲線，給 realmScale 挑用。
 * 預設（不寫 realmScale）走等比 —— 適合傷害/護甲。
 * 功能牌（內力、抽牌）刻意走溫和的線性，否則境界一升強度就爆炸。
 */
export const GROWTH = {
  /** 線性倍增：境界 N ＝ 基礎 × N（劈五＝劈一的五倍前的舊行為，現多用於此類微調） */
  linear: (field) => (e, realm) => ({ ...e, [field]: e[field] * realm }),
  /** 線性遞增：每升一境界 +step（境界 N ＝ 基礎 + step×(N−1)） */
  step: (field, step = 1) => (e, realm) => ({ ...e, [field]: e[field] + step * (realm - 1) }),
};

/**
 * 連段對「非次數」效果（抽牌、內力）的加成：每多一段 +1，第一張不加。
 * 連段 step 傳進來當 multiplier：step1 +0、step2 +1、step3 +2……
 * 例：臨機應變境界三抽 4，在連段第三張出 ⇒ 4 +（3−1）＝ 抽 6 張。
 */
const comboAdd = (field) => (e, step) => ({ ...e, [field]: e[field] + (step - 1) });

export const CARD_DEFS = {
  anqi: {
    defId: 'anqi',
    name: '暗器',
    type: CARD_TYPE.ATTACK,
    target: TARGET.SCATTER,
    cost: 1,
    base: { hits: 3, damage: 5 },
    /** 境界↑ → 每一發更痛（吃境界曲線，發數不變）。連段↑ → 撒更多發（走預設 comboScale） */
    realmScale: (e, realm) => ({ ...e, damage: Math.round(e.damage * realmMultiplier(realm)) }),
    enchantScale: 0.1, // 附魔層數＝每發傷 × 這個 × level（打數個目標，中等）
    desc: '撒出多發暗器，各自隨機釘住最前排一人',
  },

  hengPi: {
    defId: 'hengPi',
    name: '橫劈',
    type: CARD_TYPE.ATTACK,
    target: TARGET.ROW,
    cost: 1,
    base: { hits: 1, damage: 7 },
    enchantScale: 0.08, // 橫掃一整列、命中最多 ⇒ 附魔層數給最少
    desc: '橫掃最靠近的一整列',
  },

  guan: {
    defId: 'guan',
    name: '貫',
    type: CARD_TYPE.ATTACK,
    target: TARGET.LANE,
    cost: 1,
    base: { hits: 1, damage: 8 },
    enchantScale: 0.15, // 只貫一路、命中較少 ⇒ 附魔層數給較多
    desc: '貫穿最近一路，由前到後',
  },

  bengShan: {
    defId: 'bengShan',
    name: '崩山',
    type: CARD_TYPE.ATTACK,
    target: TARGET.ROW,
    cost: 2,
    base: { hits: 1, damage: 6 },
    knockback: 1, // 命中的敵人往後震退一格（連鎖推擠後方）
    enchantScale: 0.08,
    desc: '撼動最前一列，震退一步',
  },

  /**
   * 毒霧 —— 純上「中毒」。**無直接傷害**（見 base 無 damage）。
   * effectStatus 是這張卡「自身的效果」（非附魔）：命中最近三排的敵人各上 stacks 層毒，
   *   每次層數隨境界曲線成長，連段 step 讓它獨立施放多次；不佔附魔上限、不隨合成轉移。
   * rows：NEAR_ROWS 打最近幾排（見 combat.js）。
   */
  duWu: {
    defId: 'duWu',
    name: '毒霧',
    type: CARD_TYPE.ATTACK,
    target: TARGET.NEAR_ROWS,
    rows: 3,
    cost: 1,
    base: { hits: 1 },
    effectStatus: { id: STATUS.POISON, stacks: 3 },
    desc: '毒霧瀰漫最近三排，全數中毒（無直接傷害）',
  },

  /**
   * 火藥 —— 純上「燃燒」。**無直接傷害**。
   * effectStatus：命中 3×3 範圍的敵人各上 stacks 層火；境界加每次層數，連段增加獨立爆炸次數。
   * blast：BLAST 方塊邊長（見 combat.js）。
   */
  huoYao: {
    defId: 'huoYao',
    name: '火藥',
    type: CARD_TYPE.ATTACK,
    target: TARGET.BLAST,
    blast: 3,
    cost: 1,
    base: { hits: 1 },
    effectStatus: { id: STATUS.BURN, stacks: 3 },
    desc: '炸開 3×3 一片（含最近排、盡量多人），範圍內全數燃燒（無直接傷害）',
  },

  yunQi: {
    defId: 'yunQi',
    name: '運氣調息',
    type: CARD_TYPE.SKILL,
    cost: 0,
    base: { energy: 1 },
    // 線性：境界 N ＝ 內力 +N（不走等比，境界三也只 +3）
    realmScale: GROWTH.linear('energy'),
    // 連段：每多一段再 +1（第一張不加）
    comboScale: comboAdd('energy'),
    desc: '不耗內力，內力 ＋境界（連段再加成）',
  },

  linJi: {
    defId: 'linJi',
    name: '臨機應變',
    type: CARD_TYPE.SKILL,
    cost: 1,
    base: { draw: 2 },
    // 線性遞增：每升一境界多抽一張（境界二抽 3、境界三抽 4）
    realmScale: GROWTH.step('draw', 1),
    // 連段：每多一段再多抽一張（第一張不加）
    comboScale: comboAdd('draw'),
    desc: '耗一內力，抽（境界＋1）張（連段再加成）',
  },

  /**
   * 忘形 —— 純催化劑。
   * 不帶境界（可與任何境界合成）、無戰鬥數值、不能單獨出牌。
   * 拖到任一張牌上即能跨名合成一次。
   * catalyst 旗標由 createCard 讀取：強制 realm = null 並帶上忘形 tag。
   */
  wangXing: {
    defId: 'wangXing',
    name: '忘形',
    type: CARD_TYPE.CATALYST,
    cost: 0,
    catalyst: true,
    desc: '無境界的萬用合成材料。可跨名合成一次。',
  },
};

export function getCardDef(defId) {
  const def = CARD_DEFS[defId];
  if (!def) throw new Error(`未知的卡牌定義: ${defId}`);
  return def;
}
