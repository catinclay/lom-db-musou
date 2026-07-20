/**
 * 敵人定義。一個 defId 一種敵人，永久不變。
 * 實例（帶當前 hp、所在行列）由 Formation 現生。
 */
import { TUNING } from '../config/tuning.js';

const enemy = (defId, name, tint) => ({ defId, name, tint, ...TUNING.combat.enemies[defId] });

export const ENEMY_DEFS = {
  luo: enemy('luo', '嘍囉', 0x9c4a3f),
  kuaiDao: enemy('kuaiDao', '快刀手', 0xb96d42),
  han: enemy('han', '大漢', 0x7a5aa0),
  dingZhuang: enemy('dingZhuang', '定樁力士', 0x4e7180),
};

export const ENEMY_BUFF = { IMMOVABLE: 'immovable' };

export const ENEMY_BUFF_DEFS = {
  immovable: {
    id: 'immovable',
    name: '不動',
    short: '定',
    color: 0x9fd0e8,
    desc: '每層抵銷一次擊退；也會阻斷同一路的連鎖推擠。',
  },
};

export const ENEMY_BUFF_IDS = Object.keys(ENEMY_BUFF_DEFS);

export function activeEnemyBuffs(enemy) {
  return ENEMY_BUFF_IDS.filter((id) => (enemy.buffs?.[id] ?? 0) > 0);
}

export function getEnemyDef(defId) {
  const def = ENEMY_DEFS[defId];
  if (!def) throw new Error(`未知的敵人定義: ${defId}`);
  return def;
}

export const ENEMY_IDS = Object.keys(ENEMY_DEFS);
