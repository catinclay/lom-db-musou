const CN_NUMERALS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/**
 * 階級標籤。
 * 一〜十 用中文數字（合武俠的味），超過就轉阿拉伯數字 ——
 * 連鎖合成很容易把階級推到二十幾，「二十七」擠不進角落的徽章。
 */
export function rankLabel(rank) {
  if (rank == null) return '';
  if (rank >= 1 && rank <= 10) return CN_NUMERALS[rank];
  return String(rank);
}

/** 把三進位資源畫成完整大格＋剩餘小格；卡面不再用第二個數字表示費用。 */
export function resourcePips(amount, unit = 3, { full = '▰', small = '▪', zero = '○' } = {}) {
  const value = Math.max(0, Math.floor(amount ?? 0));
  const fullCount = Math.floor(value / unit);
  const remainder = value % unit;
  const groups = [];
  if (fullCount > 0) groups.push(Array(fullCount).fill(full).join(' '));
  if (remainder > 0) groups.push(small.repeat(remainder));
  return groups.join(' ') || zero;
}

export const energyPips = (amount, unit = 3) => resourcePips(amount, unit);

export function inspirationGauge(amount, threshold = 3) {
  const filled = Math.max(0, Math.min(threshold, Math.floor(amount ?? 0)));
  return `${'●'.repeat(filled)}${'○'.repeat(threshold - filled)}`;
}

/** 零連擊不顯示，避免「連擊 —」被誤讀成已經有第一段。 */
export function comboLabel(combo) {
  return combo > 0 ? `連擊 ×${combo}` : '';
}

/** 境界尚未建立時不提示續擊；之後才標出可突破且付得起的牌。 */
export function shouldHighlightCombo(card, realm, energy, cost) {
  return realm > 0 && cost <= energy && card.rank != null && card.rank > realm;
}

/** 依卡牌類型取色 */
export const CARD_COLORS = {
  attack: { fill: 0x6b2b25, border: 0xc4583f, text: '#f0d5c0' },
  defense: { fill: 0x24445c, border: 0x4a8fb8, text: '#c9e2f0' },
  skill: { fill: 0x2c4a30, border: 0x5aa06a, text: '#cbe8cf' },
};

export const WANGXING_COLOR = 0xd9b45c;
