import { describe, it, expect } from 'vitest';
import { MetaState, META_UPGRADES } from '../../src/core/MetaState.js';
import { RunState } from '../../src/core/RunState.js';
import { seededRng } from '../../src/core/rng.js';
import { TUNING } from '../../src/config/tuning.js';

describe('MetaState 威望與升級', () => {
  it('起始 0 威望、無升級', () => {
    const m = new MetaState();
    expect(m.prestige).toBe(0);
    expect(m.level('guts')).toBe(0);
  });

  it('costOf 隨等級遞增、滿級回 null', () => {
    const m = new MetaState();
    expect(m.costOf('guts')).toBe(META_UPGRADES.guts.cost(0));
    m.levels.guts = META_UPGRADES.guts.maxLevel;
    expect(m.costOf('guts')).toBeNull();
  });

  it('buyUpgrade：夠威望才買、扣威望、+級', () => {
    const m = new MetaState({ prestige: 100 });
    const cost = m.costOf('funds');
    expect(m.buyUpgrade('funds')).toBe(true);
    expect(m.level('funds')).toBe(1);
    expect(m.prestige).toBe(100 - cost);

    const broke = new MetaState({ prestige: 0 });
    expect(broke.buyUpgrade('funds')).toBe(false);
    expect(broke.level('funds')).toBe(0);
  });

  it('earnFromRun：撐到第幾天 + 通關獎勵', () => {
    const m = new MetaState();
    expect(m.earnFromRun({ day: 5, outcome: 'lost' })).toBe(5 * TUNING.run.meta.prestigePerDay);
    const g = m.earnFromRun({ day: 10, outcome: 'won' });
    expect(g).toBe(10 * TUNING.run.meta.prestigePerDay + TUNING.run.meta.winBonus);
    expect(m.stats).toEqual({ runs: 2, wins: 1, bestDay: 10 });
  });

  it('toJSON 可序列化還原', () => {
    const m = new MetaState({ prestige: 42 });
    m.buyUpgrade('funds');
    const restored = new MetaState(JSON.parse(JSON.stringify(m.toJSON())));
    expect(restored.prestige).toBe(m.prestige);
    expect(restored.level('funds')).toBe(1);
    expect(restored.stats).toEqual(m.stats);
  });

  it('舊存檔沒有 stats 時可向後相容', () => {
    expect(new MetaState({ prestige: 8, levels: { funds: 1 } }).stats).toEqual({
      runs: 0,
      wins: 0,
      bestDay: 0,
    });
  });
});

describe('據點升級疊進新 run', () => {
  const runWith = (levels) => new RunState({ rng: seededRng(1), meta: new MetaState({ prestige: 999, levels }) });
  const base = () => new RunState({ rng: seededRng(1) });

  it('紮實底子：起始血量上限更高、補滿', () => {
    const r = runWith({ guts: 2 });
    expect(r.maxHp).toBe(base().maxHp + 30);
    expect(r.hp).toBe(r.maxHp);
  });

  it('殷實家底：起始銀兩更多', () => {
    const r = runWith({ funds: 3 });
    expect(r.money).toBe(base().money + 60);
  });

  it('渾厚內力：起始內力上限 +1', () => {
    const r = runWith({ innerQi: 1 });
    expect(r.attrs.energyPerTurn).toBe(TUNING.energyPerTurn + 1);
  });

  it('祖傳絕學：牌組多帶貫', () => {
    const b = base();
    const r = runWith({ heirloom: 2 });
    expect(r.deck.length).toBe(b.deck.length + 2);
    expect(r.deck.filter((s) => s.defId === 'guan').length).toBe(
      b.deck.filter((s) => s.defId === 'guan').length + 2
    );
  });

  it('傳家寶：起始帶一件遺物', () => {
    const r = runWith({ treasure: 1 });
    expect(r.relics.length).toBe(1);
  });
});
