import { getEnemyDef } from './EnemyLibrary.js';
import { defaultRng } from './rng.js';

/**
 * 敵人陣列 —— 格狀。
 *
 * 每個敵人各自佔一格 (rank, lane)：
 *   rank  到主角的排數，0 = 接觸；越大越遠。上限 maxRank（場地最遠只到這麼遠）。
 *   lane  第幾路（縱列），0..lanes-1。
 * 一格只能站一個人。敵人不乖乖排隊：前進被卡住時會側移到隔壁一路的前方補位。
 *
 * 純資料，零 Phaser。畫面（FormationView）把每個敵人的 (rank, lane) 投影成肩後視角。
 */

let enemyUid = 0;

/** 測試用：讓 uid 可預測 */
export function resetEnemyUid() {
  enemyUid = 0;
}

export function createEnemy(defId, rank, lane) {
  const def = getEnemyDef(defId);
  return {
    uid: `e${enemyUid++}`,
    defId,
    rank,
    lane,
    hp: def.hp,
    maxHp: def.hp,
    damage: def.damage,
    alive: true,
    prepared: false, // 進到接觸位、備戰中（telegraph）；備戰過才會攻擊
    statuses: {}, // debuff placeholder，見 StatusLibrary
  };
}

export class Formation {
  constructor(lanes = 7, maxRank = 6, rng = defaultRng) {
    this.lanes = lanes;
    this.maxRank = maxRank;
    this.rng = rng;
    this.enemies = []; // 扁平；每個帶 rank/lane
  }

  get living() {
    return this.enemies.filter((e) => e.alive);
  }

  get isEmpty() {
    return !this.enemies.some((e) => e.alive);
  }

  /** 某格上的活敵人（沒有就 null） */
  at(rank, lane) {
    return this.enemies.find((e) => e.alive && e.rank === rank && e.lane === lane) ?? null;
  }

  findByUid(uid) {
    return this.enemies.find((e) => e.uid === uid) ?? null;
  }

  /** 由前到後、由左到右 */
  livingEnemiesInOrder() {
    return this.living.sort((a, b) => a.rank - b.rank || a.lane - b.lane);
  }

  frontRank() {
    const l = this.living;
    return l.length ? Math.min(...l.map((e) => e.rank)) : null;
  }

  frontLivingEnemy() {
    return this.livingEnemiesInOrder()[0] ?? null;
  }

  /** 最前那一排（rank 最小）的所有活敵人 —— 橫劈/崩山用（只打最近一排，不是每路的最前） */
  frontRankEnemies() {
    const fr = this.frontRank();
    return fr == null ? [] : this.living.filter((e) => e.rank === fr).sort((a, b) => a.lane - b.lane);
  }

  /**
   * 最近的一路 —— 貫用。
   * 先取「最前排有人」的所有路（同近的候選），其中優先挑**整條縱列人最多**的
   * （貫由前貫到後，人多才打得最多）；人數也一樣多才隨機挑一條。
   */
  pickFrontLane(rng = this.rng) {
    const l = this.living;
    if (!l.length) return null;
    const minRank = Math.min(...l.map((e) => e.rank));
    const lanes = [...new Set(l.filter((e) => e.rank === minRank).map((e) => e.lane))];
    const most = Math.max(...lanes.map((lane) => this.laneEnemies(lane).length));
    const best = lanes.filter((lane) => this.laneEnemies(lane).length === most);
    return best[Math.floor(rng() * best.length)];
  }

  /** 某一路由前到後的所有活敵人 —— 貫穿整路用 */
  laneEnemies(lane) {
    return this.living.filter((e) => e.lane === lane).sort((a, b) => a.rank - b.rank);
  }

  /** 最近的 n 個「有人的排」（rank，由近到遠）—— 毒霧用 */
  nearestRanks(n) {
    const ranks = [...new Set(this.living.map((e) => e.rank))].sort((a, b) => a - b);
    return ranks.slice(0, n);
  }

  /** 指定那些排上的所有活敵人（由前到後、由左到右）—— 毒霧用 */
  enemiesInRanks(ranks) {
    const set = new Set(ranks);
    return this.living.filter((e) => set.has(e.rank)).sort((a, b) => a.rank - b.rank || a.lane - b.lane);
  }

  /**
   * 火藥用：挑一個 size×size 方塊涵蓋的活敵人。
   * 方塊由**最近排（frontRank）往後**延伸 size 排（越往後涵蓋越多縱深），
   * lane 起點在場內滑動；只考慮**含到至少一個最近排敵人**的位置，
   * 其中取涵蓋人數最多的（同多則用 rng 挑一個）。
   *
   * 之後要開放玩家指定中心時，改成吃一個外部給的 (rank,lane) 即可，其餘結算不變。
   * @returns 該方塊涵蓋的活敵人陣列（空陣列＝沒得打）
   */
  pickBlast(size = 3, rng = this.rng) {
    const fr = this.frontRank();
    if (fr == null) return [];
    const band = this.living.filter((e) => e.rank >= fr && e.rank < fr + size);

    const candidates = [];
    let best = -1;
    for (let ls = 0; ls <= this.lanes - size; ls++) {
      const inBox = band.filter((e) => e.lane >= ls && e.lane < ls + size);
      if (!inBox.some((e) => e.rank === fr)) continue; // 必含最近排敵人
      if (inBox.length > best) {
        best = inBox.length;
        candidates.length = 0;
        candidates.push(inBox);
      } else if (inBox.length === best) {
        candidates.push(inBox);
      }
    }
    if (!candidates.length) return [];
    return candidates[Math.floor(rng() * candidates.length)];
  }

  damageEnemy(enemy, dmg) {
    if (!enemy.alive) return false;
    enemy.hp -= dmg;
    if (enemy.hp <= 0) {
      enemy.hp = 0;
      enemy.alive = false;
      return true;
    }
    return false;
  }

  /** 已備戰、在接觸位（rank 0）的活敵人攻擊力總和 */
  contactDamage() {
    return this.living.filter((e) => e.rank === 0 && e.prepared).reduce((s, e) => s + e.damage, 0);
  }

  hasContact() {
    return this.living.some((e) => e.rank === 0);
  }

  /**
   * 前進一步（補位）。由前到後處理，前面先讓出空間。
   * 正前方（同路近一排）空就前進；被卡住就側移到「隔壁一路」的前方補位；
   * 差超過一路（隔壁也滿）就卡住不動。rank 0 已接觸，不再前進。
   */
  advance() {
    for (const e of this.livingEnemiesInOrder()) {
      if (e.rank === 0) continue;
      const r = e.rank;
      const lane = e.lane;
      if (!this.at(r - 1, lane)) {
        e.rank = r - 1;
        continue;
      }
      const left = lane > 0 && !this.at(r - 1, lane - 1) ? lane - 1 : null;
      const right = lane < this.lanes - 1 && !this.at(r - 1, lane + 1) ? lane + 1 : null;
      const side = left ?? right; // 左優先（決定性）
      if (side != null) {
        e.rank = r - 1;
        e.lane = side;
      }
      // 否則卡住
    }
  }

  /** 新到接觸位的敵人進入備戰（下回合才攻擊）；不在接觸位就清掉備戰 */
  prepareFront() {
    for (const e of this.living) e.prepared = e.rank === 0;
  }

  /**
   * 把一個敵人往後推一格，並連鎖推擠正後方的人。
   * 整路推到 maxRank 塞滿時，最後一個往左右擠（有空間才行）；都沒空間則整串不動。
   * @returns 是否有推動
   */
  knockback(enemy, amount = 1) {
    let moved = false;
    for (let i = 0; i < amount; i++) if (this.pushBackOnce(enemy)) moved = true;
    return moved;
  }

  pushBackOnce(enemy) {
    const lane = enemy.lane;
    // 從 enemy 往後找連續佔住的最後一格
    let k = enemy.rank;
    while (this.at(k + 1, lane)) k++;

    if (k < this.maxRank) {
      // 後方有空間：整串 enemy.rank..k 往後移一格（由後往前搬）
      this.shiftBack(lane, enemy.rank, k);
      return true;
    }
    // 塞到場地最後了：最後一個往左右擠
    const back = this.at(this.maxRank, lane);
    const side = this.freeSideAt(this.maxRank, lane);
    if (side == null) return false; // 無空間，推不動
    back.lane = side;
    if (back.rank > 0) back.prepared = false;
    // 讓出 (maxRank, lane) 後，其餘往後移一格
    this.shiftBack(lane, enemy.rank, this.maxRank - 1);
    return true;
  }

  /** 把 lane 上 rank from..to 的敵人各往後移一格（由後往前，避免覆蓋） */
  shiftBack(lane, from, to) {
    for (let r = to; r >= from; r--) {
      const e = this.at(r, lane);
      if (!e) continue;
      e.rank = r + 1;
      if (e.rank > 0) e.prepared = false;
    }
  }

  /** rank 上 lane 左右相鄰、空著的一格（左優先），沒有回 null */
  freeSideAt(rank, lane) {
    if (lane > 0 && !this.at(rank, lane - 1)) return lane - 1;
    if (lane < this.lanes - 1 && !this.at(rank, lane + 1)) return lane + 1;
    return null;
  }

  /** 在某 rank 放一排 count 個敵人，置中對齊到縱列 */
  addRow(rank, defId, count) {
    const n = Math.min(count, this.lanes);
    const start = Math.floor((this.lanes - n) / 2);
    for (let i = 0; i < n; i++) this.enemies.push(createEnemy(defId, rank, start + i));
  }

  /** 目前有敵人的排數（不同 rank 的數量） */
  occupiedRankCount() {
    return new Set(this.living.map((e) => e.rank)).size;
  }

  /**
   * 補排湧上：讓「有人的排數」維持在 targetRows，新排從最後方補（不補在接觸位）。
   * @param spec { defId(): string, count(): number }
   */
  refill(targetRows, spec) {
    while (this.occupiedRankCount() < targetRows) {
      const ranks = this.living.map((e) => e.rank);
      const backmost = ranks.length ? Math.max(...ranks) : -1;
      const rank = Math.min(Math.max(backmost + 1, 1), this.maxRank);
      if (this.living.some((e) => e.rank === rank)) break; // 已滿到 maxRank
      this.addRow(rank, spec.defId(), spec.count());
    }
  }
}
