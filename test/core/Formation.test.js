import { describe, it, expect, beforeEach } from 'vitest';
import { Formation, createEnemy, resetEnemyUid } from '../../src/core/Formation.js';

beforeEach(() => resetEnemyUid());

/** 固定敵種、固定人數，讓測試不擲骰子 */
const spec = (defId = 'luo', count = 5) => ({ defId: () => defId, count: () => count });

/** 直接把敵人擺到指定格，方便構造情境 */
const put = (f, rank, lane, defId = 'luo') => {
  const e = createEnemy(defId, rank, lane);
  f.enemies.push(e);
  return e;
};

describe('補排與湧上', () => {
  it('refill 補到指定排數，新排從後方湧入、不在接觸位', () => {
    const f = new Formation(7);
    f.refill(4, spec());
    expect(f.occupiedRankCount()).toBe(4);
    expect([...new Set(f.living.map((e) => e.rank))].sort()).toEqual([1, 2, 3, 4]);
    expect(f.hasContact()).toBe(false);
  });

  it('每排人數由 spec 決定，置中對齊縱列（7 路放 3 → lane 2,3,4）', () => {
    const f = new Formation(7);
    f.addRow(0, 'luo', 3);
    expect(f.living.map((e) => e.lane)).toEqual([2, 3, 4]);
  });
});

describe('前進補位（不乖乖排隊）', () => {
  it('正前方空就前進；前排到接觸位', () => {
    const f = new Formation(7);
    f.refill(4, spec()); // rank 1,2,3,4
    f.advance();
    expect([...new Set(f.living.map((e) => e.rank))].sort()).toEqual([0, 1, 2, 3]);
    expect(f.hasContact()).toBe(true);
  });

  it('正前方被卡住 ⇒ 側移到隔壁一路的前方補位', () => {
    const f = new Formation(3);
    put(f, 0, 1); // 擋在正前方
    const blocked = put(f, 1, 1); // 想前進卻被卡
    f.advance();
    // 正前方 (0,1) 有人 → 側移到 (0,0)（左優先）
    expect(blocked.rank).toBe(0);
    expect(blocked.lane).toBe(0);
  });

  it('隔壁也滿（差超過一路）⇒ 卡住不動', () => {
    const f = new Formation(3);
    put(f, 0, 0);
    put(f, 0, 1);
    put(f, 0, 2); // 最前排三路全滿
    const stuck = put(f, 1, 1);
    f.advance();
    expect(stuck.rank).toBe(1);
    expect(stuck.lane).toBe(1);
  });
});

describe('攻擊準備（telegraph）與接觸傷害', () => {
  it('剛到接觸位還沒備戰 ⇒ 不計傷；prepareFront 後才計', () => {
    const f = new Formation(7);
    f.addRow(0, 'luo', 3); // 3 人在接觸位，尚未備戰
    expect(f.contactDamage()).toBe(0);
    f.prepareFront();
    expect(f.contactDamage()).toBe(15); // 3 × 5
  });

  it('prepareFront 只讓接觸位（rank 0）備戰，其他清掉', () => {
    const f = new Formation(7);
    const front = put(f, 0, 3);
    const back = put(f, 1, 3);
    f.prepareFront();
    expect(front.prepared).toBe(true);
    expect(back.prepared).toBe(false);
  });
});

describe('擊退', () => {
  it('後方有空間 ⇒ 往後退一格，並連鎖推擠後方', () => {
    const f = new Formation(3, 6);
    const a = put(f, 1, 1);
    const b = put(f, 2, 1); // 緊貼在後
    f.knockback(a, 1);
    expect(a.rank).toBe(2);
    expect(b.rank).toBe(3); // 被連鎖推擠
  });

  it('整路塞到場地最遠 ⇒ 最後一個往左右擠出空間', () => {
    const f = new Formation(3, 2); // maxRank 2
    const front = put(f, 0, 1);
    put(f, 1, 1);
    const back = put(f, 2, 1); // lane1 從 0 塞到 maxRank
    const moved = f.knockback(front, 1);
    expect(moved).toBe(true);
    expect(back.lane).not.toBe(1); // 被擠到隔壁一路
    expect(back.rank).toBe(2);
    expect(f.at(1, 1)).not.toBeNull();
    expect(f.at(2, 1)).not.toBeNull();
  });

  it('左右都沒空間 ⇒ 推不動', () => {
    const f = new Formation(1, 2); // 只有 1 路、塞滿到 maxRank
    const front = put(f, 0, 0);
    put(f, 1, 0);
    put(f, 2, 0);
    expect(f.knockback(front, 1)).toBe(false);
    expect(front.rank).toBe(0); // 沒動
  });
});

describe('鎖定用的查詢', () => {
  it('pickFrontLane 同近、人數相同時用 rng 挑一條', () => {
    const f = new Formation(7);
    f.addRow(0, 'luo', 3); // lane 2,3,4 各 1 人，縱列人數相同
    expect(f.pickFrontLane(() => 0)).toBe(2);
    expect(f.pickFrontLane(() => 0.99)).toBe(4);
  });

  it('pickFrontLane 同近時優先挑整條人最多的縱列', () => {
    const f = new Formation(7);
    f.addRow(0, 'luo', 3); // rank0：lane 2,3,4
    f.addRow(1, 'luo', 1); // rank1：置中 → lane 3（讓 lane3 縱列有 2 人）
    // 三路同在最前排，但 lane3 縱列 2 人最多 ⇒ 無視 rng 都挑 lane3
    expect(f.pickFrontLane(() => 0)).toBe(3);
    expect(f.pickFrontLane(() => 0.99)).toBe(3);
  });

  it('laneEnemies 回傳整條縱列（跨排、由前到後）', () => {
    const f = new Formation(7);
    f.addRow(0, 'luo', 3); // lane 2,3,4 → e0,e1,e2
    f.addRow(1, 'luo', 3); // lane 2,3,4 → e3,e4,e5
    expect(f.laneEnemies(3).map((e) => e.uid)).toEqual(['e1', 'e4']);
  });

  it('nearestRanks 取最近的 n 個有人的排（跳過空排）', () => {
    const f = new Formation(7, 6);
    put(f, 0, 3);
    put(f, 2, 3); // rank 1 空
    put(f, 4, 3);
    put(f, 5, 3);
    expect(f.nearestRanks(3)).toEqual([0, 2, 4]);
  });

  it('pickBlast 選涵蓋最多、且必含最近排敵人的 3×3', () => {
    const f = new Formation(7, 6);
    const front = put(f, 0, 3);
    put(f, 1, 2);
    put(f, 1, 3);
    put(f, 1, 4);
    put(f, 2, 2);
    put(f, 2, 3);
    put(f, 2, 4);
    const got = f.pickBlast(3, () => 0);
    expect(got).toContain(front);
    expect(got).toHaveLength(7);
  });

  it('pickBlast 最近排偏一側時仍必含它', () => {
    const f = new Formation(7, 6);
    const front = put(f, 0, 0);
    put(f, 1, 5);
    put(f, 1, 6);
    put(f, 2, 5);
    put(f, 2, 6);
    const got = f.pickBlast(3, () => 0);
    expect(got).toContain(front);
    expect(got).toHaveLength(1);
  });

  it('frontRankEnemies 只取最近那一排，不是每路的最前', () => {
    const f = new Formation(3);
    const a = put(f, 1, 0); // 第一路的人在第一排（rank 1）
    put(f, 2, 1); // 第二路的人在第二排（rank 2，較遠）
    // 最近的排是 rank 1 ⇒ 只打第一路那個
    expect(f.frontRankEnemies().map((e) => e.uid)).toEqual([a.uid]);
  });

  it('livingEnemiesInOrder 由前到後、由左到右', () => {
    const f = new Formation(7);
    f.addRow(0, 'luo', 2); // lane 2,3
    f.addRow(1, 'luo', 2);
    expect(f.livingEnemiesInOrder().map((e) => e.uid)).toEqual(['e0', 'e1', 'e2', 'e3']);
  });

  it('frontLivingEnemy 跳過死人', () => {
    const f = new Formation(7);
    f.addRow(0, 'luo', 2); // e0(lane2), e1(lane3)
    f.living[0].alive = false;
    expect(f.frontLivingEnemy().uid).toBe('e1');
  });

  it('damageEnemy 扣血、歸零即死', () => {
    const f = new Formation();
    const e = createEnemy('luo', 0, 0); // hp 14
    expect(f.damageEnemy(e, 10)).toBe(false);
    expect(e.hp).toBe(4);
    expect(f.damageEnemy(e, 4)).toBe(true);
    expect(e.alive).toBe(false);
  });
});

describe('debuff placeholder', () => {
  it('新敵人身上沒有任何狀態、尚未備戰', () => {
    const e = createEnemy('luo', 0, 0);
    expect(e.statuses).toEqual({});
    expect(e.prepared).toBe(false);
  });
});
