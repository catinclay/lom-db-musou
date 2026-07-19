/**
 * 敵人定義。一個 defId 一種敵人，永久不變。
 * 實例（帶當前 hp、所在行列）由 Formation 現生。
 */
export const ENEMY_DEFS = {
  luo: { defId: 'luo', name: '嘍囉', hp: 14, damage: 5, tint: 0x9c4a3f },
  han: { defId: 'han', name: '大漢', hp: 36, damage: 11, tint: 0x7a5aa0 },
};

export function getEnemyDef(defId) {
  const def = ENEMY_DEFS[defId];
  if (!def) throw new Error(`未知的敵人定義: ${defId}`);
  return def;
}

export const ENEMY_IDS = Object.keys(ENEMY_DEFS);
