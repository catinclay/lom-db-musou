import { describe, it, expect, beforeEach } from 'vitest';
import { Formation, createEnemy, resetEnemyUid } from '../../src/core/Formation.js';
import { resolveAttack, TARGET } from '../../src/core/combat.js';

beforeEach(() => resetEnemyUid());

/** 前排 3 人、後排 3 人的簡單陣（嘍囉 hp 14, dmg 5） */
const twoRows = () => {
  const f = new Formation();
  f.addRow(0, 'luo', 3);
  f.addRow(1, 'luo', 3);
  return f;
};

const eff = (o) => ({ hits: 1, damage: 0, totalDamage: 0, ...o });

describe('SINGLE 單體', () => {
  it('打最前方一個，吃整發總傷', () => {
    const f = twoRows();
    const { hits } = resolveAttack(eff({ totalDamage: 10 }), TARGET.SINGLE, f);
    expect(hits).toHaveLength(1);
    expect(hits[0].uid).toBe('e0');
    expect(hits[0].damage).toBe(10);
  });

  it('前排第一個死了就打下一個', () => {
    const f = twoRows();
    f.frontLivingEnemy().alive = false;
    const { hits } = resolveAttack(eff({ totalDamage: 10 }), TARGET.SINGLE, f);
    expect(hits[0].uid).toBe('e1');
  });
});

describe('LANE 縱列（貫）', () => {
  it('貫穿最近一路：整條縱列由前到後都吃傷', () => {
    // 7 路、每排 3 人置中 → col 2,3,4；前排 e0,e1,e2、後排 e3,e4,e5
    const f = twoRows();
    const rng = () => 0.5; // frontLanes=[2,3,4]，floor(0.5*3)=1 → 挑 col 3
    const { hits } = resolveAttack(eff({ damage: 9 }), TARGET.LANE, f, rng);
    expect(hits.map((h) => h.uid)).toEqual(['e1', 'e4']); // col 3 的前後兩人
  });

  it('只打選中那一路，別路不受影響', () => {
    const f = twoRows();
    resolveAttack(eff({ damage: 9 }), TARGET.LANE, f, () => 0); // 挑最左 lane 2 → e0,e3
    expect(f.at(0, 3).alive).toBe(true); // lane 3 那路沒被打
  });
});

describe('ROW 整排', () => {
  it('橫掃最前一整排，每人各吃一份每發傷', () => {
    const f = twoRows();
    const { hits } = resolveAttack(eff({ damage: 8 }), TARGET.ROW, f);
    expect(hits.map((h) => h.uid)).toEqual(['e0', 'e1', 'e2']); // 只打前排
    expect(hits.every((h) => h.damage === 8)).toBe(true);
  });

  it('後排不受影響', () => {
    const f = twoRows();
    resolveAttack(eff({ damage: 8 }), TARGET.ROW, f);
    expect(f.enemies.filter((e) => e.rank === 1).every((e) => e.alive)).toBe(true);
  });
});

describe('NEAR_ROWS 毒霧', () => {
  const put = (f, rank, lane) => f.enemies.push(createEnemy('luo', rank, lane));

  it('打最近三排全部，第四排不受影響', () => {
    const f = new Formation(7, 6);
    f.addRow(0, 'luo', 3);
    f.addRow(1, 'luo', 3);
    f.addRow(2, 'luo', 3);
    f.addRow(3, 'luo', 3);
    const { hits } = resolveAttack(eff({ damage: 2 }), TARGET.NEAR_ROWS, f, undefined, 0, { rows: 3 });
    expect(new Set(hits.map((h) => h.uid)).size).toBe(9); // 前三排各 3
    expect(f.enemies.filter((e) => e.rank === 3).every((e) => e.alive)).toBe(true);
  });

  it('有空排時取「最近的三個有人的排」，跳過空排', () => {
    const f = new Formation(7, 6);
    put(f, 0, 3); // rank 0
    put(f, 2, 3); // rank 2（rank 1 空）
    put(f, 4, 3); // rank 4
    put(f, 5, 3); // rank 5 —— 第四近，不該打
    const { hits } = resolveAttack(eff({ damage: 2 }), TARGET.NEAR_ROWS, f, undefined, 0, { rows: 3 });
    expect(hits.map((h) => h.uid)).toEqual(['e0', 'e1', 'e2']); // rank 0,2,4
  });
});

describe('BLAST 火藥（3×3）', () => {
  const put = (f, rank, lane) => f.enemies.push(createEnemy('luo', rank, lane));

  it('選涵蓋最多人的 3×3，且必含最近排敵人', () => {
    const f = new Formation(7, 6);
    put(f, 0, 3); // 最近排一人（e0）
    put(f, 1, 2);
    put(f, 1, 3);
    put(f, 1, 4);
    put(f, 2, 2);
    put(f, 2, 3);
    put(f, 2, 4); // e1..e6
    put(f, 1, 6); // 離群一人，湊不進同一個含最近排的方塊
    const { hits } = resolveAttack(eff({ damage: 2 }), TARGET.BLAST, f, () => 0, 0, { size: 3 });
    expect(hits).toHaveLength(7); // e0..e6
    expect(hits.map((h) => h.uid)).toContain('e0');
    expect(hits.map((h) => h.uid)).not.toContain('e7');
  });

  it('最近排敵人偏一側時，方塊仍必含它（即使因此打得較少）', () => {
    const f = new Formation(7, 6);
    put(f, 0, 0); // 最近排在最左（e0）
    put(f, 1, 4);
    put(f, 1, 5);
    put(f, 1, 6);
    put(f, 2, 4);
    put(f, 2, 5);
    put(f, 2, 6); // 右側一大群，但方塊含不到最近排
    const { hits } = resolveAttack(eff({ damage: 2 }), TARGET.BLAST, f, () => 0, 0, { size: 3 });
    expect(hits.map((h) => h.uid)).toContain('e0'); // 一定含最近排
    expect(hits).toHaveLength(1); // 左側方塊只涵蓋到它
  });
});

describe('MULTI 多發暗器', () => {
  it('每根打一個，由前而後分配', () => {
    const f = twoRows();
    const { hits } = resolveAttack(eff({ hits: 3, damage: 5 }), TARGET.MULTI, f);
    expect(hits.map((h) => h.uid)).toEqual(['e0', 'e1', 'e2']);
  });

  it('發數比人多時繞回前面補刀（可擊殺）', () => {
    const f = new Formation();
    f.addRow(0, 'luo', 1); // 只有 1 人，hp 14
    const { hits } = resolveAttack(eff({ hits: 4, damage: 5 }), TARGET.MULTI, f);
    // 前 3 發（5×3=15 > 14）打死它，之後沒活人可打
    expect(hits.filter((h) => h.killed)).toHaveLength(1);
    expect(f.isEmpty).toBe(true);
  });
});

describe('SCATTER 散射（暗器）', () => {
  it('每根隨機打最前排的一個（用注入 rng 決定）', () => {
    const f = twoRows(); // 前排 e0,e1,e2
    const seq = [0, 2 / 3]; // 第一發 index 0 → e0；第二發 index 2 → e2
    let i = 0;
    const rng = () => seq[i++];
    const { hits } = resolveAttack(eff({ hits: 2, damage: 5 }), TARGET.SCATTER, f, rng);
    expect(hits[0].uid).toBe('e0');
    expect(hits[1].uid).toBe('e2');
  });

  it('只打最前排，不會散到後排', () => {
    const f = twoRows();
    const rng = () => 0;
    resolveAttack(eff({ hits: 3, damage: 5 }), TARGET.SCATTER, f, rng);
    expect(f.enemies.filter((e) => e.rank === 1).every((e) => e.alive)).toBe(true);
  });
});

describe('RANDOM 隨機', () => {
  it('用注入的 rng 決定目標', () => {
    const f = twoRows(); // 6 個活人 e0..e5
    const seq = [0, 5 / 6]; // 第一發挑 index 0，第二發挑 index 5
    let i = 0;
    const rng = () => seq[i++];
    const { hits } = resolveAttack(eff({ hits: 2, damage: 5 }), TARGET.RANDOM, f, rng);
    expect(hits[0].uid).toBe('e0');
    expect(hits[1].uid).toBe('e5');
  });
});

describe('連段 → 多波揮擊（次數）', () => {
  it('ROW 連段 2：重選最近排打兩波，各標 wave', () => {
    const f = twoRows(); // 前排 e0,e1,e2（hp14，8 傷打不死）
    const { hits } = resolveAttack(eff({ hits: 2, damage: 8 }), TARGET.ROW, f);
    expect(hits.filter((h) => h.wave === 0).map((h) => h.uid)).toEqual(['e0', 'e1', 'e2']);
    expect(hits.filter((h) => h.wave === 1).map((h) => h.uid)).toEqual(['e0', 'e1', 'e2']);
  });

  it('ROW 連段：前排被清光後下一波打新的最近排', () => {
    const f = new Formation();
    f.addRow(0, 'luo', 1); // e0 at rank0
    f.addRow(1, 'luo', 1); // e1 at rank1
    const { hits } = resolveAttack(eff({ hits: 2, damage: 14 }), TARGET.ROW, f); // 每發 14 剛好斬殺
    expect(hits.map((h) => h.uid)).toEqual(['e0', 'e1']);
    expect(hits[0].killed).toBe(true);
  });

  it('LANE 連段 2：每波重選一路', () => {
    const f = twoRows();
    const { hits } = resolveAttack(eff({ hits: 2, damage: 9 }), TARGET.LANE, f, () => 0);
    expect(hits.filter((h) => h.wave === 0).map((h) => h.uid)).toEqual(['e0', 'e3']);
    expect(hits.filter((h) => h.wave === 1).map((h) => h.uid)).toEqual(['e0', 'e3']);
  });

  it('崩山（ROW + 擊退）逐波擊退：連段 2 把同一人往後推兩格', () => {
    const f = new Formation(7, 6);
    f.addRow(0, 'luo', 1); // e0 at rank0，孤身一人
    const { hits } = resolveAttack(eff({ hits: 2, damage: 1 }), TARGET.ROW, f, undefined, 1);
    expect(hits.map((h) => h.uid)).toEqual(['e0', 'e0']); // 兩波都打到它
    expect(f.findByUid('e0').rank).toBe(2); // 被逐波推了兩格
  });

  it('崩山逐波記錄擊退後的位置快照（waveLayouts，給 UI 交錯演出）', () => {
    const f = new Formation(7, 6);
    f.addRow(0, 'luo', 1); // e0 at rank0
    const { waveLayouts } = resolveAttack(eff({ hits: 2, damage: 1 }), TARGET.ROW, f, undefined, 1);
    expect(waveLayouts).toHaveLength(2);
    expect(waveLayouts[0].find((e) => e.uid === 'e0').rank).toBe(1); // 第一波推到 rank1
    expect(waveLayouts[1].find((e) => e.uid === 'e0').rank).toBe(2); // 第二波再推到 rank2
  });

  it('無擊退的攻擊不產生 waveLayouts', () => {
    const f = twoRows();
    const { waveLayouts } = resolveAttack(eff({ hits: 2, damage: 8 }), TARGET.ROW, f);
    expect(waveLayouts).toHaveLength(0);
  });
});

describe('空陣', () => {
  it('沒有敵人時不命中、不崩潰', () => {
    const f = new Formation();
    expect(resolveAttack(eff({ hits: 3, damage: 5 }), TARGET.MULTI, f).hits).toHaveLength(0);
    expect(resolveAttack(eff({ totalDamage: 9 }), TARGET.SINGLE, f).hits).toHaveLength(0);
  });
});
