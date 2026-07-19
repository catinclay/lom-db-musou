import { describe, it, expect } from 'vitest';
import {
  spinReels,
  resolveSlotReward,
  applySlotReward,
  SLOT_SYMBOLS,
} from '../../src/core/slot.js';
import { RunState } from '../../src/core/RunState.js';
import { seededRng } from '../../src/core/rng.js';
import { TUNING } from '../../src/config/tuning.js';

const run = () => new RunState({ rng: seededRng(1) });
const constRng = (v) => () => v;

describe('spinReels', () => {
  it('轉出三個合法符號', () => {
    const reels = spinReels(seededRng(3), TUNING);
    expect(reels).toHaveLength(3);
    for (const s of reels) expect(SLOT_SYMBOLS).toContain(s);
  });
});

describe('resolveSlotReward — 三連大獎', () => {
  it('三金 → 銀兩', () => {
    const r = resolveSlotReward(['coin', 'coin', 'coin'], run(), constRng(0), TUNING);
    expect(r).toMatchObject({ kind: 'coins', amount: TUNING.run.slot.jackpot.coin });
  });

  it('三葫蘆 → 大筆銀兩', () => {
    const r = resolveSlotReward(['gourd', 'gourd', 'gourd'], run(), constRng(0), TUNING);
    expect(r).toMatchObject({ kind: 'coins', amount: TUNING.run.slot.jackpot.gourd });
  });

  it('三劍 → 加一張攻擊牌（來自獎池）', () => {
    const r = resolveSlotReward(['sword', 'sword', 'sword'], run(), constRng(0), TUNING);
    expect(r.kind).toBe('card');
    expect(TUNING.run.slot.rewardCardPool).toContain(r.defId);
  });

  it('三毒 → 牌組某攻擊牌附中毒（給 level）', () => {
    const r = resolveSlotReward(['poison', 'poison', 'poison'], run(), constRng(0), TUNING);
    expect(r).toMatchObject({ kind: 'enchant', statusId: 'poison', level: TUNING.run.slot.jackpot.poison.level });
    expect(r.targetIndex).toBeGreaterThanOrEqual(0);
  });

  it('三火 → 附燃燒（給 level）', () => {
    const r = resolveSlotReward(['fire', 'fire', 'fire'], run(), constRng(0), TUNING);
    expect(r).toMatchObject({ kind: 'enchant', statusId: 'burn', level: TUNING.run.slot.jackpot.fire.level });
  });

  it('三囧 → 槓龜', () => {
    const r = resolveSlotReward(['dud', 'dud', 'dud'], run(), constRng(0), TUNING);
    expect(r.kind).toBe('dud');
  });
});

describe('resolveSlotReward — 兩連 / 沒對上', () => {
  it('兩連 → 小銀兩', () => {
    const r = resolveSlotReward(['coin', 'coin', 'dud'], run(), constRng(0), TUNING);
    expect(r).toMatchObject({ kind: 'coins', amount: TUNING.run.slot.pairCoins });
  });

  it('全不同 → 安慰銀兩', () => {
    const r = resolveSlotReward(['coin', 'sword', 'fire'], run(), constRng(0), TUNING);
    expect(r).toMatchObject({ kind: 'coins', amount: TUNING.run.slot.missCoins });
  });
});

describe('applySlotReward', () => {
  it('coins 加銀兩', () => {
    const r = run();
    const before = r.money;
    applySlotReward(r, { kind: 'coins', amount: 20 });
    expect(r.money).toBe(before + 20);
  });

  it('card 加進牌組', () => {
    const r = run();
    const n = r.deck.length;
    applySlotReward(r, { kind: 'card', defId: 'anqi' });
    expect(r.deck).toHaveLength(n + 1);
    expect(r.deck[r.deck.length - 1].defId).toBe('anqi');
  });

  it('enchant 疊 level 到牌組指定牌的 enchants', () => {
    const r = run();
    const idx = r.deck.findIndex((s) => s.defId === 'hengPi');
    applySlotReward(r, { kind: 'enchant', targetIndex: idx, statusId: 'burn', level: 3 });
    expect(r.deck[idx].enchants).toEqual({ burn: 3 });
  });

  it('dud 什麼都不動', () => {
    const r = run();
    const before = { money: r.money, deck: r.deck.length };
    applySlotReward(r, { kind: 'dud' });
    expect(r.money).toBe(before.money);
    expect(r.deck).toHaveLength(before.deck);
  });
});
