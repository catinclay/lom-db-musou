const CN_NUMERALS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/**
 * 境界標籤。
 * 一〜十 用中文數字（合武俠的味），超過就轉阿拉伯數字 ——
 * 連鎖合成很容易把境界推到二十幾，「二十七」擠不進角落的徽章。
 */
export function realmLabel(realm) {
  if (realm == null) return ''; // realmless（催化劑）不顯示境界
  if (realm >= 1 && realm <= 10) return CN_NUMERALS[realm];
  return String(realm);
}

/** 依卡牌類型取色 */
export const CARD_COLORS = {
  attack: { fill: 0x6b2b25, border: 0xc4583f, text: '#f0d5c0' },
  defense: { fill: 0x24445c, border: 0x4a8fb8, text: '#c9e2f0' },
  skill: { fill: 0x2c4a30, border: 0x5aa06a, text: '#cbe8cf' },
  catalyst: { fill: 0x4a3f24, border: 0xd9b45c, text: '#f0dda0' },
};

export const FORMLESS_COLOR = 0xd9b45c;
