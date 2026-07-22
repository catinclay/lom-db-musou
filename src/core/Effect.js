/**
 * 卡牌效果的解算。
 *
 * 同一張卡在不同階級、不同連擊下的成長方式是「每張卡自訂」的：
 *
 *   劈砍  1 發。階級↑ → 每發傷害變高（吃曲線）；連擊↑ → **發數變多**（劈砍兩次…）
 *   暗器  3 發。階級↑ → 每發傷害變高；連擊↑ → **發數變多**（3→6→9）
 *   靈感/內力  階級↑ → 單次產量依 3/4/5/6/7 成長；連擊↑ → **重複施放**
 *
 * 所以階級與連擊各是一個可抽換的函式，而不是寫死的乘法。
 * 未指定時走預設（階級加每發傷害／護甲、連擊加發數），攻擊牌大多不必寫。
 *
 * 效果的形狀：{ hits, damage?, armor?, statusId?, statusStacks? }
 *   hits   打幾發（暗器 3 發，劈 1 發）
 *   damage 每發傷害
 *   armor  每發護甲
 *   statusStacks 卡片每次施加的狀態層數（只吃階級曲線；連擊增加施放次數）
 * 總量 = hits × 每發
 */

import { TUNING } from '../config/tuning.js';
import { STATUS_DEFS } from './StatusLibrary.js';

// 每發數值乘上倍率後**取整** —— 成長曲線帶小數（×1.5、×2.5），
// 卡面與傷害都該是整數。連擊是整數倍，取整對它無影響。
const scaleField = (effect, field, factor) =>
  effect[field] == null ? effect[field] : Math.round(effect[field] * factor);

/**
 * 階級對「每發數值」的成長係數（相對階級一）。
 * 查 tuning.rankCurve（索引 = 階級−1）；超出表長沿用最後一格。
 */
export function rankMultiplier(rank, tuning = TUNING) {
  const curve = tuning.rankCurve;
  return curve[Math.min(Math.max(rank, 1), curve.length) - 1];
}

/** 預設：階級按曲線提升「每發」的數值 */
export const defaultRankScale = (effect, rank) => ({
  ...effect,
  damage: scaleField(effect, 'damage', rankMultiplier(rank)),
  armor: scaleField(effect, 'armor', rankMultiplier(rank)),
});

/**
 * 預設：連擊提升「發數」（不是每發傷害）。
 * 連擊 N＝打 N 次，每次重選目標、各自演一段動畫（劈砍兩次、貫兩次…）。
 * multiplier ＝ comboMultiplier(combo) ＝ combo（見 ComboTracker / tuning）。
 * 功能牌（靈感/內力）不吃這條，改用自己的 comboScale 重複整次產量。
 */
export const defaultComboScale = (effect, multiplier) => ({
  ...effect,
  hits: (effect.hits ?? 1) * multiplier,
});

/**
 * 解出一張牌實際打出去的效果。
 * 順序固定為「先階級、後連擊」。
 * 但固定下來才好講也好測。
 */
export function resolveEffect(def, rank, multiplier = 1) {
  const base = { hits: 1, ...def.base };
  const afterRank = (def.rankScale ?? defaultRankScale)(base, rank);
  const afterCombo = (def.comboScale ?? defaultComboScale)(afterRank, multiplier);

  const hits = afterCombo.hits ?? 1;
  const result = {
    ...afterCombo,
    hits,
    totalDamage: (afterCombo.damage ?? 0) * hits,
    totalArmor: (afterCombo.armor ?? 0) * hits,
  };
  // 卡片自身的每次狀態層數與攻擊卡每發傷害吃同一條階級曲線；
  // 連擊走 hits 變成多次獨立施放，每波各套一次這個層數。
  if (def.effectStatus) {
    const rankScaled = Math.round(def.effectStatus.stacks * rankMultiplier(rank));
    result.statusId = def.effectStatus.id;
    result.statusStacks = rankScaled;
  }
  return result;
}

/**
 * 卡面上要顯示的數值（不含連擊，因為連擊是出牌當下才知道的）。
 * 依效果種類回傳標籤 tag（傷／甲／力／靈感）＋數值；多發傷害顯示「3 × 5」。
 * 無任何可顯示效果的卡（如忘形）回傳 null。
 */
export function cardFaceValue(def, rank) {
  if (!def.base) return null;
  const e = resolveEffect(def, rank, 1);

  if (e.damage != null) {
    return {
      isDamage: true,
      tag: '傷',
      hits: e.hits,
      per: e.damage,
      total: e.totalDamage,
      text: e.hits > 1 ? `${e.hits} × ${e.damage}` : `${e.totalDamage}`,
    };
  }
  if (e.armor != null) {
    return { isDamage: false, tag: '甲', hits: e.hits, per: e.armor, total: e.totalArmor, text: `${e.totalArmor}` };
  }
  if (e.energy) return { isDamage: false, tag: '力', amount: e.energy, text: `＋${e.energy}` };
  if (e.inspiration) return { isDamage: false, tag: '靈感', amount: e.inspiration, text: `＋${e.inspiration}` };
  if (e.draw) return { isDamage: false, tag: '抽', text: `${e.draw}` };
  // 純狀態卡（毒霧/火藥）無傷害數值，改標它自身效果的狀態與層數
  if (def.effectStatus) {
    const s = STATUS_DEFS[def.effectStatus.id];
    return { isDamage: false, tag: s?.short ?? '狀', text: `${e.statusStacks}` };
  }
  return null;
}
