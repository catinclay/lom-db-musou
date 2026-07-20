import { describe, it, expect, beforeEach } from 'vitest';
import { Formation, createEnemy, createProjectile, resetEnemyUid } from '../../src/core/Formation.js';
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

describe('特殊行動：召喚 / 後退（specials 陣列）', () => {
  it('召喚在王前方最近空排放一排小兵,並設冷卻', () => {
    const f = new Formation(7, 6, seededRng(1));
    f.enemies.push(createEnemy('touMu', 3, 3));
    const boss = f.at(3, 3);
    boss.intent = { id: 'summon', remaining: 1 };
    const { resolved } = f.resolveSpecialActions();
    const minions = f.living.filter((e) => e.defId === 'luo');
    expect(minions.length).toBe(2); // summonCount
    expect(minions.every((m) => m.rank === 0)).toBe(true); // 前方最近空排
    expect(resolved[0]).toMatchObject({ uid: boss.uid, type: 'summon', summoned: 2 });
    expect(boss.specialCooldowns.summon).toBeGreaterThan(0);
  });

  it('蓄力（remaining>1）先倒數不執行', () => {
    const f = new Formation(7, 6, seededRng(1));
    f.enemies.push(createEnemy('touMu', 3, 3));
    const boss = f.at(3, 3);
    boss.intent = { id: 'summon', remaining: 2 };
    f.resolveSpecialActions();
    expect(boss.intent).toMatchObject({ id: 'summon', remaining: 1 });
    expect(f.living.some((e) => e.defId === 'luo')).toBe(false);
  });

  it('retreatEnemy 往更遠 rank 移動,受佔格阻擋', () => {
    const f = new Formation(7, 6, seededRng(1));
    f.enemies.push(createEnemy('moWang', 1, 3));
    const boss = f.at(1, 3);
    expect(f.retreatEnemy(boss, 1)).toBe(true);
    expect(boss.rank).toBe(2);
    f.enemies.push(createEnemy('luo', 3, 3)); // 擋住後方
    expect(f.retreatEnemy(boss, 1)).toBe(false);
    expect(boss.rank).toBe(2);
  });

  it('planSpecialIntents 尊重冷卻', () => {
    const f = new Formation(7, 6, () => 0); // rng 恆 0 → chance 必中
    f.enemies.push(createEnemy('touMu', 3, 3));
    const boss = f.at(3, 3);
    boss.specialCooldowns.summon = 2;
    f.planSpecialIntents();
    expect(boss.intent).toBeNull(); // 冷卻中不預告
    boss.specialCooldowns.summon = 0;
    f.planSpecialIntents();
    expect(boss.intent).toMatchObject({ id: 'summon' });
  });
});

describe('投射物', () => {
  it('launchProjectile 在王前方一格（同路）生成', () => {
    const f = new Formation(7, 6, seededRng(1));
    f.enemies.push(createEnemy('moWang', 3, 4));
    const boss = f.at(3, 4);
    const proj = f.launchProjectile(boss, 9);
    expect(proj.isProjectile).toBe(true);
    expect(proj.rank).toBe(2);
    expect(proj.lane).toBe(4);
    expect(proj.damage).toBe(9);
  });

  it('每次呼叫 advanceProjectiles 前進一格；越過最前線即命中並消失', () => {
    const f = new Formation(7, 6, seededRng(1));
    f.enemies.push(createProjectile(1, 3, 7));
    expect(f.advanceProjectiles()).toMatchObject({ moved: true, damage: 0 }); // 1 → 0
    expect(f.living[0].rank).toBe(0);
    const res = f.advanceProjectiles(); // 0 → 命中
    expect(res.damage).toBe(7);
    expect(res.hits.length).toBe(1);
    expect(f.living.some((e) => e.isProjectile)).toBe(false); // 命中後消失
  });

  it('投射物不隨敵方相位（advance）移動', () => {
    const f = new Formation(7, 6, seededRng(1));
    f.enemies.push(createProjectile(3, 3, 5));
    f.advance();
    expect(f.at(3, 3)).toBeTruthy(); // 沒被 advance 往前推
  });

  it('投射物可被攻擊打掉（1 滴血）', () => {
    const f = new Formation(7, 6, seededRng(1));
    const proj = createProjectile(2, 3, 5);
    f.enemies.push(proj);
    f.damageEnemy(proj, 1);
    expect(proj.alive).toBe(false);
    expect(f.living.some((e) => e.isProjectile)).toBe(false);
  });

  it('投射物只在遠距離施放（rank ≥ minRank）', () => {
    const f = new Formation(7, 6, () => 0); // chance 必中
    f.enemies.push(createEnemy('moWang', 1, 3));
    const boss = f.at(1, 3);
    boss.specialCooldowns.summon = 9; // 排除干擾,只留投射物候選
    boss.specialCooldowns.retreat = 9;
    f.planSpecialIntents();
    expect(boss.intent).toBeNull(); // rank1 < minRank2,不施放
    boss.rank = 3;
    f.planSpecialIntents();
    expect(boss.intent).toMatchObject({ id: 'projectile' });
  });

  it('BattleState.playCard 會推進投射物並對玩家造成傷害', () => {
    const b = new BattleState({
      deckList: [{ defId: 'yunQi' }],
      rng: seededRng(5),
      tuning: { ...noDrawMerge, startingHandSize: 1 },
      battle: { waves: 0, rows: 1, minPerRow: 1, maxPerRow: 1, gruntDefIds: ['luo'], eliteChance: 0 },
    });
    b.start();
    const hpBefore = b.playerHp;
    b.formation.enemies.push(createProjectile(0, 3, 6)); // 貼臉的投射物
    const uid = b.hand.get(0).uid;
    b.playCard(uid); // 出一張技能牌 → 投射物越線命中
    expect(b.playerHp).toBe(hpBefore - 6);
    expect(b.formation.living.some((e) => e.isProjectile)).toBe(false);
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
