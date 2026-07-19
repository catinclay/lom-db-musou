import { applyStatus, STATUS } from './StatusLibrary.js';

/**
 * 遺物·秘籍：一局內持有的被動加成。零 Phaser。
 *
 * 三種掛法（可混用）：
 *   onAcquire(run)   —— 拿到當下對 RunState 生效一次（如加血量上限）。
 *   battleMods       —— 每場戰鬥開始時疊上的數值（energy / handSize…），由 BattleState 匯總。
 *   hooks            —— 戰鬥中的事件掛鉤（BattleState 在對應時機呼叫，收到 battle 本體）：
 *                       onBattleStart(battle)、onTurnStart(battle)。
 *
 * 遺物存在 RunState.relics（只存 id）；BattleState 由 battleConfig.relics 拿到 id 清單解算。
 */
export const RELIC_DEFS = {
  xuanTie: {
    id: 'xuanTie',
    name: '玄鐵令',
    desc: '每回合內力 +1',
    battleMods: { energy: 1 },
  },
  baiBao: {
    id: 'baiBao',
    name: '百寶囊',
    desc: '每回合起手多抽一張',
    battleMods: { handSize: 1 },
  },
  jinZhong: {
    id: 'jinZhong',
    name: '金鐘罩',
    desc: '主角血量上限 +25（拿到時立即回 25）',
    onAcquire: (run) => {
      run.maxHp += 25;
      run.hp = Math.min(run.maxHp, run.hp + 25);
    },
  },
  cuiDu: {
    id: 'cuiDu',
    name: '淬毒袖箭',
    desc: '每回合開始，最前排一個敵人中毒 4',
    hooks: {
      onTurnStart: (battle) => {
        const e = battle.formation.frontLivingEnemy();
        if (e) applyStatus(e, STATUS.POISON, 4);
      },
    },
  },
  yinRan: {
    id: 'yinRan',
    name: '引燃索',
    desc: '戰鬥開始，最近一排敵人燃燒 3',
    hooks: {
      onBattleStart: (battle) => {
        const ranks = battle.formation.nearestRanks(1);
        for (const e of battle.formation.enemiesInRanks(ranks)) applyStatus(e, STATUS.BURN, 3);
      },
    },
  },
};

export const RELIC_IDS = Object.keys(RELIC_DEFS);

export function getRelicDef(id) {
  const def = RELIC_DEFS[id];
  if (!def) throw new Error(`未知的遺物: ${id}`);
  return def;
}
