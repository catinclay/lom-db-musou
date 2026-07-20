import { describe, it, expect, beforeEach } from 'vitest';
import { Formation, createEnemy, resetEnemyUid } from '../../src/core/Formation.js';
import { BattleState } from '../../src/core/BattleState.js';
import { isBossDef } from '../../src/core/EnemyLibrary.js';
import { seededRng } from '../../src/core/rng.js';
import { TUNING } from '../../src/config/tuning.js';

const noDrawMerge = { ...TUNING, mergeDraw: { baseChance: 0, decayPerMerge: 0, minChance: 0 } };

beforeEach(() => resetEnemyUid());

describe('王定義', () => {
  it('touMu/moWang 標記為 boss,雜兵不是', () => {
    expect(isBossDef('touMu')).toBe(true);
    expect(isBossDef('moWang')).toBe(true);
    expect(isBossDef('luo')).toBe(false);
  });
});

describe('攻擊距離（inAttackRange）', () => {
  it('雜兵射程 0：只在 rank 0 進入攻擊準備', () => {
    const f = new Formation(7, 6, seededRng(1));
    f.enemies.push(createEnemy('luo', 0, 3));
    f.enemies.push(createEnemy('luo', 1, 3));
    f.initializeContactPreparation();
    expect(f.at(0, 3).attackState).not.toBe('none'); // 接觸位開始準備
    expect(f.at(1, 3).attackState).toBe('none'); // 後排不準備
  });

  it('遠程王（touMu 射程 1）在 rank 1 就進入攻擊準備', () => {
    const f = new Formation(7, 6, seededRng(1));
    f.enemies.push(createEnemy('touMu', 1, 3));
    f.initializeContactPreparation();
    expect(f.at(1, 3).attackState).not.toBe('none');
  });

  it('王前進到射程即停止（touMu 停在 rank 1）', () => {
    const f = new Formation(7, 6, seededRng(1));
    f.enemies.push(createEnemy('touMu', 4, 3));
    for (let i = 0; i < 6; i++) f.advance();
    expect(f.at(1, 3)).toBeTruthy();
    expect(f.frontRank()).toBe(1); // 沒有推進到 rank 0
  });

  it('ready 的遠程王在 rank 1 就計入 contactDamage', () => {
    const f = new Formation(7, 6, seededRng(1));
    const boss = createEnemy('touMu', 1, 3);
    boss.attackState = 'ready';
    f.enemies.push(boss);
    expect(f.contactDamage()).toBe(boss.damage);
  });
});

describe('finale：王在正常波清完後登場', () => {
  const makeBattle = (extra = {}) =>
    new BattleState({
      deckList: [{ defId: 'hengPi' }],
      rng: seededRng(5),
      tuning: { ...noDrawMerge, startingHandSize: 1 },
      battle: {
        waves: 0,
        rows: 1,
        minPerRow: 1,
        maxPerRow: 1,
        gruntDefIds: ['luo'],
        eliteChance: 0,
        bossDefId: 'touMu',
        ...extra,
      },
    });

  const killAll = (b) => b.formation.living.forEach((e) => b.formation.damageEnemy(e, 9999));

  it('開場王未登場、有待登場王旗標', () => {
    const b = makeBattle();
    b.start();
    expect(b.hasPendingBoss).toBe(true);
    expect(b.formation.living.some((e) => e.defId === 'touMu')).toBe(false);
  });

  it('正常波未清完前不生王', () => {
    const b = makeBattle({ waves: 2 });
    b.start();
    expect(b.maybeSpawnBoss()).toBe(false); // 還有補充波
  });

  it('清空敵陣但王未登場 → 不判勝', () => {
    const b = makeBattle();
    b.start();
    killAll(b);
    expect(b.checkOutcome()).toBe('ongoing'); // 王還沒出，不算贏
  });

  it('正常波清完 → maybeSpawnBoss 讓王登場', () => {
    const b = makeBattle();
    b.start();
    killAll(b);
    expect(b.maybeSpawnBoss()).toBe(true);
    expect(b.bossSpawned).toBe(true);
    expect(b.formation.living.some((e) => e.defId === 'touMu')).toBe(true);
    expect(b.maybeSpawnBoss()).toBe(false); // 只登場一次
  });

  it('王被擊殺 → 判勝', () => {
    const b = makeBattle();
    b.start();
    killAll(b);
    b.maybeSpawnBoss();
    killAll(b); // 殺掉王
    expect(b.checkOutcome()).toBe('won');
  });
});

describe('無王戰鬥維持原行為', () => {
  it('清空且無補充波即判勝（bossDefId 省略）', () => {
    const b = new BattleState({
      deckList: [{ defId: 'hengPi' }],
      rng: seededRng(5),
      tuning: { ...noDrawMerge, startingHandSize: 1 },
      battle: { waves: 0, rows: 1, minPerRow: 1, maxPerRow: 1, gruntDefIds: ['luo'], eliteChance: 0 },
    });
    b.start();
    expect(b.hasPendingBoss).toBe(false);
    b.formation.living.forEach((e) => b.formation.damageEnemy(e, 9999));
    expect(b.checkOutcome()).toBe('won');
  });
});
