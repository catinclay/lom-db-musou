/**
 * 卡牌效果的解算。
 *
 * 同一張卡在不同境界、不同連段下的成長方式是「每張卡自訂」的：
 *
 *   劈砍  1 發。境界↑ → 每發傷害變高（吃曲線）；連段↑ → **發數變多**（劈砍兩次…）
 *   暗器  3 發。境界↑ → 每發傷害變高；連段↑ → **發數變多**（3→6→9）
 *   抽牌/內力  境界↑ → 溫和線性；連段↑ → **+（step−1）**（加法，不是乘）
 *
 * 所以境界與連段各是一個可抽換的函式，而不是寫死的乘法。
 * 未指定時走預設（境界加每發傷害／護甲、連段加發數），攻擊牌大多不必寫。
 *
 * 效果的形狀：{ hits, damage?, armor?, statusId?, statusStacks? }
 *   hits   打幾發（暗器 3 發，劈 1 發）
 *   damage 每發傷害
 *   armor  每發護甲
 *   statusStacks 卡片每次施加的狀態層數（只吃境界曲線；連段增加施放次數）
 * 總量 = hits × 每發
 */

import { TUNING } from '../config/tuning.js';
import { STATUS_DEFS } from './StatusLibrary.js';

// 每發數值乘上倍率後**取整** —— 成長曲線帶小數（×1.5、×2.5），
// 卡面與傷害都該是整數。連段是整數倍，取整對它無影響。
const scaleField = (effect, field, factor) =>
  effect[field] == null ? effect[field] : Math.round(effect[field] * factor);

/**
 * 境界對「每發數值」的成長係數（相對境界一）。
 * 查 tuning.realmDamageCurve（索引 = 境界−1）；超出表長沿用最後一格。
 * 境界一係數為 1（基礎值），realmless（催化劑）不會被拿來算效果，故不特別處理 null。
 */
export function realmMultiplier(realm, tuning = TUNING) {
  const curve = tuning.realmDamageCurve;
  return curve[Math.min(Math.max(realm, 1), curve.length) - 1];
}

/** 預設：境界以等比級數提升「每發」的數值 */
export const defaultRealmScale = (effect, realm) => ({
  ...effect,
  damage: scaleField(effect, 'damage', realmMultiplier(realm)),
  armor: scaleField(effect, 'armor', realmMultiplier(realm)),
});

/**
 * 預設：連段提升「發數」（不是每發傷害）。
 * 連段中第 N 張＝打 N 次，每次重選目標、各自演一段動畫（劈砍兩次、貫兩次…）。
 * multiplier ＝ comboMultiplier(step) ＝ step（見 ComboTracker / tuning）。
 * 功能牌（抽牌/內力）不吃這條，改用自己的 comboScale 走「+（step−1）」的加法（見 CardLibrary）。
 */
export const defaultComboScale = (effect, multiplier) => ({
  ...effect,
  hits: (effect.hits ?? 1) * multiplier,
});

/**
 * 解出一張牌實際打出去的效果。
 * 順序固定為「先境界、後連段」—— 兩者都是乘法，順序不影響結果，
 * 但固定下來才好講也好測。
 */
export function resolveEffect(def, realm, multiplier = 1) {
  const base = { hits: 1, ...def.base };
  const afterRealm = (def.realmScale ?? defaultRealmScale)(base, realm);
  const afterCombo = (def.comboScale ?? defaultComboScale)(afterRealm, multiplier);

  const hits = afterCombo.hits ?? 1;
  const result = {
    ...afterCombo,
    hits,
    totalDamage: (afterCombo.damage ?? 0) * hits,
    totalArmor: (afterCombo.armor ?? 0) * hits,
  };
  // 卡片自身的每次狀態層數與攻擊卡每發傷害吃同一條境界曲線；
  // 連段走 hits 變成多次獨立施放，每波各套一次這個層數。
  if (def.effectStatus) {
    const realmScaled = Math.round(def.effectStatus.stacks * realmMultiplier(realm));
    result.statusId = def.effectStatus.id;
    result.statusStacks = realmScaled;
  }
  return result;
}

/**
 * 卡面上要顯示的數值（不含連段，因為連段是出牌當下才知道的）。
 * 依效果種類回傳一個短標籤 tag（傷/甲/力/抽）＋數值文字；多發傷害顯示「3 × 5」。
 * 無任何可顯示效果的卡（如忘形催化劑）回傳 null。
 */
export function cardFaceValue(def, realm) {
  if (!def.base) return null;
  const e = resolveEffect(def, realm, 1);

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
  if (e.energy) return { isDamage: false, tag: '力', text: `＋${e.energy}` };
  if (e.draw) return { isDamage: false, tag: '抽', text: `${e.draw}` };
  // 純狀態卡（毒霧/火藥）無傷害數值，改標它自身效果的狀態與層數
  if (def.effectStatus) {
    const s = STATUS_DEFS[def.effectStatus.id];
    return { isDamage: false, tag: s?.short ?? '狀', text: `${e.statusStacks}` };
  }
  return null;
}
