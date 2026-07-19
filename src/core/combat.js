import { defaultRng } from './rng.js';

/**
 * 招式的鎖定方式 —— 割草感的來源。
 */
export const TARGET = {
  /** 單體：打最前方一個敵人，吃整發總傷 */
  SINGLE: 'single',
  /** 縱列：打最近一路（多路同近時挑人最多的，再同就隨機），整條縱列由前貫到後，各吃一份每發傷 */
  LANE: 'lane',
  /** 整排：橫掃最前排每一個敵人，各吃一份每發傷 */
  ROW: 'row',
  /** 近數排（毒霧）：打最近的 area.rows 排（距離最小的幾個 rank）的所有敵人 */
  NEAR_ROWS: 'nearRows',
  /**
   * 範圍爆破（火藥）：一個 area.size×area.size 方塊，
   * **必含至少一個最近排（frontRank）的敵人**，在此前提下盡量涵蓋最多活敵人。
   * 目前自動選位（見 Formation.pickBlast）；預留之後讓玩家指定方塊中心。
   */
  BLAST: 'blast',
  /** 多發（暗器）：射出 hits 根，每根只打一個敵人，由前而後分配 */
  MULTI: 'multi',
  /** 散射（暗器）：射出 hits 根，每根隨機打最前排的一個敵人（前排清了就換下一排） */
  SCATTER: 'scatter',
  /** 隨機：射出 hits 發，各自從全場活敵人隨機挑一個 */
  RANDOM: 'random',
};

/**
 * 把一張攻擊牌的效果打進陣列，回傳命中明細給 UI 演出。
 *
 * effect 來自 resolveEffect：{ hits, damage(每發), totalDamage, ... }
 *   SINGLE 用 totalDamage（整發打一個）
 *   其餘用 damage（每發），因為它們把「發數」拆給多個敵人
 *
 * 連段以「次數」呈現（effect.hits 隨連段變多）：
 *   ROW / LANE 每一發＝**重新選一次目標**再打一整排/一路（劈砍兩次、貫兩次…），
 *   每發標上 wave 讓 UI 分波演出。崩山的擊退也逐波施加。
 *
 * @param knockback 每次命中後把該波敵人往後震退幾格（0 ＝ 不擊退）
 * @param area 範圍型招式的參數：{ rows }（毒霧近幾排）、{ size }（火藥方塊邊長）
 * @returns { target, hits: [{ uid, damage, killed, wave }], waveLayouts }
 *   waveLayouts[w] ＝ 該波「打完＋擊退後」的全體位置快照 [{uid,rank,lane}]（只有 knockback 才填），
 *   讓 UI 能「打一波→推一波」分開演，而不是全部打完才一次推。
 */
export function resolveAttack(effect, target, formation, rng = defaultRng, knockback = 0, area = {}) {
  const hits = [];
  const waveLayouts = [];
  const strike = (enemy, dmg, wave = 0) => {
    if (!enemy) return;
    const d = dmg ?? 0; // 純狀態卡（毒霧/火藥）無傷害 —— 別讓 undefined 把血量算成 NaN
    const killed = formation.damageEnemy(enemy, d);
    hits.push({ uid: enemy.uid, damage: d, killed, wave });
  };
  // 擊退整波還活著的敵人（崩山用）；每波打完各自震退，波與波之間目標會重選。
  // 推完拍一張全體位置快照給 UI 分波補間。
  const pushWave = (struck, wave) => {
    if (!knockback) return;
    for (const e of struck) if (e.alive) formation.knockback(e, knockback);
    waveLayouts[wave] = formation.living.map((e) => ({ uid: e.uid, rank: e.rank, lane: e.lane }));
  };

  switch (target) {
    case TARGET.LANE: {
      // 貫穿最近一路：每發重新挑一條（同近挑人最多、再同才隨機），整條由前到後都吃傷
      for (let w = 0; w < effect.hits; w++) {
        const col = formation.pickFrontLane(rng);
        if (col == null) break;
        const struck = formation.laneEnemies(col);
        for (const e of struck) strike(e, effect.damage, w);
        pushWave(struck, w);
      }
      break;
    }

    case TARGET.ROW: {
      // 橫掃最近那一排：每發重選最近一排（rank 最小那排的人，不是每路的最前）再打
      for (let w = 0; w < effect.hits; w++) {
        const struck = formation.frontRankEnemies();
        if (!struck.length) break;
        for (const e of struck) strike(e, effect.damage, w);
        pushWave(struck, w);
      }
      break;
    }

    case TARGET.NEAR_ROWS: {
      // 毒霧：最近的 rows 排全數（每發重取，前排清了就往後遞補）
      const rows = area.rows ?? 3;
      for (let w = 0; w < effect.hits; w++) {
        const struck = formation.enemiesInRanks(formation.nearestRanks(rows));
        if (!struck.length) break;
        for (const e of struck) strike(e, effect.damage, w);
        pushWave(struck, w);
      }
      break;
    }

    case TARGET.BLAST: {
      // 火藥：必含最近排、涵蓋最多人的 size×size 方塊（每發重選）
      const size = area.size ?? 3;
      for (let w = 0; w < effect.hits; w++) {
        const struck = formation.pickBlast(size, rng);
        if (!struck.length) break;
        for (const e of struck) strike(e, effect.damage, w);
        pushWave(struck, w);
      }
      break;
    }

    case TARGET.MULTI: {
      // 由前而後，一根打一個；活人不夠就繞回前面補刀
      for (let k = 0; k < effect.hits; k++) {
        const living = formation.livingEnemiesInOrder();
        if (!living.length) break;
        strike(living[k % living.length], effect.damage);
      }
      break;
    }

    case TARGET.SCATTER: {
      // 每根暗器隨機打「當下最前排」的一個敵人；前排被清光就自動換下一排
      for (let k = 0; k < effect.hits; k++) {
        const fr = formation.frontRank();
        if (fr == null) break;
        const cands = formation.living.filter((e) => e.rank === fr);
        if (!cands.length) break;
        strike(cands[Math.floor(rng() * cands.length)], effect.damage);
      }
      break;
    }

    case TARGET.RANDOM: {
      for (let k = 0; k < effect.hits; k++) {
        const living = formation.livingEnemiesInOrder();
        if (!living.length) break;
        strike(living[Math.floor(rng() * living.length)], effect.damage);
      }
      break;
    }

    case TARGET.SINGLE:
    default:
      strike(formation.frontLivingEnemy(), effect.totalDamage);
      break;
  }

  return { target, hits, waveLayouts };
}
