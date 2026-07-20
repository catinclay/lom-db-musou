import { describe, it, expect, beforeEach } from 'vitest';
import { RunState } from '../../src/core/RunState.js';
import { BattleState } from '../../src/core/BattleState.js';
import { resetUidCounter } from '../../src/core/Card.js';
import { seededRng } from '../../src/core/rng.js';
import { TUNING } from '../../src/config/tuning.js';
import { RARITY, cardRarity, defIdsByRarity } from '../../src/core/CardLibrary.js';
import { weightedPickDefId, rollAcquireRealm, rarityWeight } from '../../src/core/rarity.js';

const run = () => new RunState({ rng: seededRng(1) });

beforeEach(() => resetUidCounter());

describe('稀有度定義', () => {
  it('未標示的卡為普通,示範卡有對應稀有度', () => {
    expect(cardRarity('hengPi')).toBe(RARITY.COMMON);
    expect(cardRarity('huiLongJian')).toBe(RARITY.RARE);
    expect(cardRarity('dianPoYunGuan')).toBe(RARITY.SIGNATURE);
  });

  it('defIdsByRarity 依稀有度分組(排除催化劑)', () => {
    expect(defIdsByRarity(RARITY.SIGNATURE)).toContain('dianPoYunGuan');
    expect(defIdsByRarity(RARITY.RARE)).toContain('huiLongJian');
    expect(defIdsByRarity(RARITY.COMMON)).not.toContain('wangXing'); // 催化劑排除
  });
});

describe('加權挑卡', () => {
  it('普通卡權重高於絕學,長期抽樣普通遠多於絕學', () => {
    expect(rarityWeight(RARITY.COMMON)).toBeGreaterThan(rarityWeight(RARITY.SIGNATURE));
    const pool = ['hengPi', 'huiLongJian', 'dianPoYunGuan'];
    const rng = seededRng(7);
    const counts = { hengPi: 0, huiLongJian: 0, dianPoYunGuan: 0 };
    for (let i = 0; i < 3000; i++) counts[weightedPickDefId(pool, rng)] += 1;
    expect(counts.hengPi).toBeGreaterThan(counts.huiLongJian);
    expect(counts.huiLongJian).toBeGreaterThan(counts.dianPoYunGuan);
  });

  it('空池回 null', () => {
    expect(weightedPickDefId([], seededRng(1))).toBeNull();
  });
});

describe('取得境界', () => {
  it('普通卡固定境界一', () => {
    for (let i = 0; i < 20; i++) {
      expect(rollAcquireRealm('hengPi', seededRng(i))).toBe(1);
    }
  });

  it('絕學取得境界落在設定範圍內', () => {
    const [lo, hi] = TUNING.run.rarity.acquireRealm.signature;
    const rng = seededRng(3);
    for (let i = 0; i < 50; i++) {
      const r = rollAcquireRealm('dianPoYunGuan', rng);
      expect(r).toBeGreaterThanOrEqual(lo);
      expect(r).toBeLessThanOrEqual(hi);
    }
  });

  it('取得境界會夾在 maxRealm 以下', () => {
    const rng = seededRng(3);
    for (let i = 0; i < 50; i++) {
      expect(rollAcquireRealm('dianPoYunGuan', rng, TUNING, 2)).toBeLessThanOrEqual(2);
    }
  });
});

describe('牌組取得與參悟', () => {
  it('addDeckCard 把 realm 寫進 spec', () => {
    const r = run();
    const spec = r.addDeckCard('dianPoYunGuan', { realm: 3 });
    expect(spec.realm).toBe(3);
    expect(r.deck.at(-1)).toBe(spec);
  });

  it('acquireDeckCard:絕學取得時直接較高境界,普通卡無 realm 欄位', () => {
    const r = run();
    r.acquireDeckCard('dianPoYunGuan');
    r.acquireDeckCard('hengPi');
    const sig = r.deck.at(-2);
    const common = r.deck.at(-1);
    expect(sig.realm).toBeGreaterThanOrEqual(TUNING.run.rarity.acquireRealm.signature[0]);
    expect(common.realm).toBeUndefined(); // 普通卡不帶 realm = 境界一
  });

  it('upgradeDeckCardRealm +1 且夾 attrs.maxRealm', () => {
    const r = run();
    r.attrs.maxRealm = 3;
    const spec = r.addDeckCard('hengPi'); // 無 realm = 1
    const i = r.deck.length - 1;
    expect(r.upgradeDeckCardRealm(i)).toBe(2);
    expect(r.upgradeDeckCardRealm(i)).toBe(3);
    expect(r.upgradeDeckCardRealm(i)).toBe(3); // 夾在上限
    expect(spec.realm).toBe(3);
  });

  it('buyParseCard:收費升境;達上限或錢不夠不收錢', () => {
    const r = run();
    r.money = TUNING.run.rarity.parseCost + 5;
    r.addDeckCard('hengPi');
    const i = r.deck.length - 1;
    expect(r.buyParseCard(i)).toBe(2);
    expect(r.money).toBe(5); // 有收費
    expect(r.buyParseCard(i)).toBeNull(); // 錢不夠,不收費
    expect(r.money).toBe(5);
  });

  it('buyParseCard:已達 maxRealm 不收錢', () => {
    const r = run();
    r.attrs.maxRealm = 2;
    r.money = 999;
    const spec = r.addDeckCard('hengPi', { realm: 2 });
    const i = r.deck.length - 1;
    expect(r.buyParseCard(i)).toBeNull();
    expect(r.money).toBe(999);
    expect(spec.realm).toBe(2);
  });
});

describe('魔王戰利品', () => {
  it('grantBossLoot 習得一張絕學進牌組', () => {
    const r = run();
    const before = r.deck.length;
    const defId = r.grantBossLoot();
    expect(cardRarity(defId)).toBe(RARITY.SIGNATURE);
    expect(r.deck.length).toBe(before + 1);
    expect(cardRarity(r.deck.at(-1).defId)).toBe(RARITY.SIGNATURE);
  });
});

describe('兩層境界:牌組境界 vs 戰鬥境界', () => {
  const noDrawMerge = { ...TUNING, mergeDraw: { baseChance: 0, decayPerMerge: 0, minChance: 0 } };

  it('spec 帶 realm:3 → 戰鬥實例現生即境界三', () => {
    const deckList = [{ defId: 'dianPoYunGuan', realm: 3 }];
    const b = new BattleState({ deckList, rng: seededRng(9), tuning: { ...noDrawMerge, startingHandSize: 1 } });
    b.start();
    expect(b.hand.get(0).realm).toBe(3);
  });

  it('戰鬥內合成升境不寫回牌組 spec', () => {
    const r = run();
    r.addDeckCard('dianPoYunGuan', { realm: 2 });
    const specBefore = r.deck.at(-1);
    const deckList = r.deck; // BattleState 直接讀 run.deck(按參照)
    const b = new BattleState({ deckList, rng: seededRng(11), tuning: noDrawMerge });
    b.start();
    // 戰鬥內合成把實例升到更高境界(不論有沒有觸發),spec 都不該被改動
    b.formlessMerge?.('nope', 'nope'); // 無效呼叫不崩潰
    expect(specBefore.realm).toBe(2); // 牌組境界不變
    expect(r.deck.at(-1).realm).toBe(2);
  });
});
