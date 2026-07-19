/**
 * 敵人身上的異常狀態（debuff）。
 *
 * 定義「有哪些狀態、疊了幾層、長什麼顏色」，並在 resolveStatusTick 結算實際效果。
 * 中毒／燃燒已有效果（見下）；破甲／麻痺仍是 placeholder。
 */
import { TUNING } from '../config/tuning.js';

export const STATUS = {
  BURN: 'burn',
  POISON: 'poison',
  ARMOR_BREAK: 'armorBreak',
  PARALYZE: 'paralyze',
};

export const STATUS_DEFS = {
  burn: { id: 'burn', name: '燃燒', short: '燒', color: 0xff7a3c },
  poison: { id: 'poison', name: '中毒', short: '毒', color: 0x8fd06a },
  armorBreak: { id: 'armorBreak', name: '破甲', short: '甲', color: 0xd9b45c },
  paralyze: { id: 'paralyze', name: '麻痺', short: '痺', color: 0x9fd0e8 },
};

export const STATUS_IDS = Object.keys(STATUS_DEFS);

export function getStatusDef(id) {
  const def = STATUS_DEFS[id];
  if (!def) throw new Error(`未知的狀態: ${id}`);
  return def;
}

/** 施加 stacks 層某狀態到敵人身上（累加）。回傳新的層數。 */
export function applyStatus(enemy, id, stacks = 1) {
  getStatusDef(id); // 打錯提早爆
  enemy.statuses[id] = (enemy.statuses[id] ?? 0) + stacks;
  return enemy.statuses[id];
}

/** 敵人身上還有的狀態（層數 > 0），依 STATUS_DEFS 順序 */
export function activeStatuses(enemy) {
  return STATUS_IDS.filter((id) => (enemy.statuses[id] ?? 0) > 0);
}

/**
 * 結算一次異常狀態的跳動（tick）。純函式（會改敵人的 hp/層數，但零 Phaser），
 * 交由 BattleState 呼叫並發 STATUS_TICKED 事件給 UI 演出。
 *
 * 兩種節拍（phase）：
 *   'play'    出牌小 tick —— 中毒滴小傷；燃燒自己疊層（越燒越旺，不掉血）。
 *   'turnEnd' 回合結束大 tick —— 中毒多重滴傷後慢衰；燃燒依層數引爆後快衰。
 *
 * 破甲／麻痺目前仍無 tick 效果。
 *
 * @returns { phase, hits, changed }
 *   hits    [{ uid, damage, killed, status }] —— 要跳傷害數字/倒地的命中（給 UI）
 *   changed [uid,...] —— 只有層數變動、沒受傷的敵人（燃燒疊層/衰減），UI 只需刷新狀態點
 */
export function resolveStatusTick(formation, phase, tuning = TUNING) {
  const cfg = tuning.combat.status;
  const hits = [];
  const changed = new Set();

  for (const e of formation.living) {
    // ── 中毒：每 tick 造成傷害後比例衰減（最少 1 層）。出牌 1 tick、回合結束多 tick，
    //    但先算好「總傷 + 最終層數」，畫面只跳一次數字（免得太亂）。──
    let psn = e.statuses[STATUS.POISON] ?? 0;
    if (psn > 0) {
      const ticks = phase === 'play' ? 1 : cfg.poison.turnEndTicks;
      let total = 0;
      let hpLeft = e.hp;
      for (let t = 0; t < ticks && psn > 0 && hpLeft > 0; t++) {
        const dmg = Math.min(hpLeft, psn * cfg.poison.damagePerStack);
        total += dmg;
        hpLeft -= dmg;
        psn = Math.max(0, psn - Math.max(1, Math.floor(psn * cfg.poison.decayRate)));
      }
      e.statuses[STATUS.POISON] = psn;
      changed.add(e.uid);
      if (total > 0) {
        const killed = formation.damageEnemy(e, total);
        hits.push({ uid: e.uid, damage: total, killed, status: STATUS.POISON });
      }
    }

    // ── 燃燒：蓄力引爆（中毒可能已把它燒死，先確認還活著）──
    const brn = e.alive ? e.statuses[STATUS.BURN] ?? 0 : 0;
    if (brn > 0) {
      if (phase === 'play') {
        // 出牌：火自己越燒越旺（+比例層、最少 1，不掉血）
        e.statuses[STATUS.BURN] = brn + Math.max(1, Math.floor(brn * cfg.burn.growthRate));
        changed.add(e.uid);
      } else {
        // 回合結束：依層數引爆，然後快衰（只留一小撮火苗）；死了就歸零
        const dmg = brn * cfg.burn.detonateDamage;
        if (dmg > 0) {
          const killed = formation.damageEnemy(e, dmg);
          hits.push({ uid: e.uid, damage: dmg, killed, status: STATUS.BURN });
        }
        e.statuses[STATUS.BURN] = e.alive ? Math.floor(brn * cfg.burn.decayKeep) : 0;
        changed.add(e.uid);
      }
    }
  }

  return { phase, hits, changed: [...changed] };
}
