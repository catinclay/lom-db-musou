import { cardRarity } from './CardLibrary.js';
import { TUNING } from './../config/tuning.js';
import { defaultRng } from './rng.js';

/**
 * 稀有度取得工具。零 Phaser、純函式（吃注入的 rng / tuning，測試可重現）。
 *
 * 稀有度**只影響取得**：從混合卡池加權挑一張、以及「取得時的境界」。
 * 不碰境界機制本身（每張卡一律支援境界 1–5）。數值全在 tuning.run.rarity。
 */

export function rarityWeight(rarity, tuning = TUNING) {
  return tuning.run.rarity.weights[rarity] ?? 0;
}

/**
 * 從 defId 池依「稀有度權重」挑一張（絕學越稀有）。權重全 0 時退化為均勻抽。
 * @returns 選中的 defId（空池回 null）
 */
export function weightedPickDefId(pool, rng = defaultRng, tuning = TUNING) {
  if (!pool.length) return null;
  const weights = pool.map((id) => rarityWeight(cardRarity(id), tuning));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return pool[Math.floor(rng() * pool.length)];
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/**
 * 依 defId 的稀有度擲一個「取得境界」（範圍見 tuning.run.rarity.acquireRealm，含端點）。
 * 會夾在 [1, maxRealm]（maxRealm 通常傳主角 attrs.maxRealm）。
 */
export function rollAcquireRealm(defId, rng = defaultRng, tuning = TUNING, maxRealm = Infinity) {
  const range = tuning.run.rarity.acquireRealm[cardRarity(defId)] ?? [1, 1];
  const [lo, hi] = range;
  const realm = lo + Math.floor(rng() * (hi - lo + 1));
  return Math.max(1, Math.min(realm, maxRealm));
}
