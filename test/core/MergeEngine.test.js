import { beforeEach, describe, expect, it } from 'vitest';
import { createCard, resetUidCounter } from '../../src/core/Card.js';
import {
  applyWangxingPump,
  canWangxingPump,
  findFirstAutoMergePair,
  gainInspiration,
  resolveAutoMerges,
  TX,
} from '../../src/core/MergeEngine.js';
import { Deck } from '../../src/core/Deck.js';
import { Hand } from '../../src/core/Hand.js';
import { TUNING } from '../../src/config/tuning.js';

const tuning = (extra = {}) => ({ ...TUNING, ...extra });

function ctx(handCards, drawCards = [], rng = () => 0.99, inspiration = 0) {
  return {
    hand: new Hand(handCards),
    deck: new Deck(drawCards, rng),
    exhaustPile: [],
    rng,
    mergesThisTurn: 0,
    inspiration,
  };
}

beforeEach(() => resetUidCounter());

describe('同名同階自動合成', () => {
  it('兩張同名同階合成為新 uid、階級 +1', () => {
    const a = createCard('pi', { rank: 1 });
    const b = createCard('pi', { rank: 1 });
    const c = ctx([a, b]);
    const tx = resolveAutoMerges(c, tuning());

    expect(c.hand.size).toBe(1);
    expect(c.hand.get(0)).toMatchObject({ defId: 'pi', rank: 2 });
    expect(c.hand.get(0).uid).not.toBe(a.uid);
    expect(tx[0]).toMatchObject({ type: TX.MERGE, auto: true, consumed: [a.uid, b.uid] });
  });

  it('不同名或不同階不合成', () => {
    const hand = new Hand([
      createCard('pi', { rank: 1 }),
      createCard('pi', { rank: 2 }),
      createCard('dang', { rank: 1 }),
    ]);
    expect(findFirstAutoMergePair(hand, tuning())).toBeNull();
  });

  it('由左至右取第一組，結果留在左側位置', () => {
    const a = createCard('pi');
    const middle = createCard('dang');
    const b = createCard('pi');
    const c = ctx([a, middle, b]);
    resolveAutoMerges(c, tuning());
    expect(c.hand.toArray().map((x) => `${x.defId}:${x.rank}`)).toEqual(['pi:2', 'dang:1']);
  });

  it('四張一階牌可連鎖成一張三階牌', () => {
    const c = ctx(Array.from({ length: 4 }, () => createCard('pi')));
    resolveAutoMerges(c, tuning());
    expect(c.hand.toArray()).toHaveLength(1);
    expect(c.hand.get(0).rank).toBe(3);
    expect(c.mergesThisTurn).toBe(3);
  });

  it('合成保留兩張的 tags 聯集', () => {
    const c = ctx([
      createCard('pi', { tags: ['a'] }),
      createCard('pi', { tags: ['b'] }),
    ]);
    resolveAutoMerges(c, tuning());
    expect(c.hand.get(0).tags).toEqual(['a', 'b']);
  });

  it('到 maxRank 的牌不再自動合成；null 代表無上限', () => {
    const capped = ctx([createCard('pi', { rank: 5 }), createCard('pi', { rank: 5 })]);
    resolveAutoMerges(capped, tuning({ maxRank: 5 }));
    expect(capped.hand.size).toBe(2);

    const uncapped = ctx([createCard('pi', { rank: 50 }), createCard('pi', { rank: 50 })]);
    resolveAutoMerges(uncapped, tuning({ maxRank: null }));
    expect(uncapped.hand.get(0).rank).toBe(51);
  });

  it('合成補抽可再引爆後續合成', () => {
    const a = createCard('pi');
    const b = createCard('pi');
    const drawn = createCard('pi', { rank: 2 });
    const c = ctx([a, b], [drawn], () => 0, 1);
    const tx = resolveAutoMerges(c, tuning());
    expect(c.hand.get(0).rank).toBe(3);
    expect(tx.filter((x) => x.type === TX.MERGE)).toHaveLength(2);
    expect(tx.some((x) => x.type === TX.DRAW)).toBe(true);
  });
});

describe('靈感補牌', () => {
  it('每滿 3 點抽一張，餘數保留', () => {
    const drawn = [createCard('pi'), createCard('ci')];
    const c = ctx([], drawn);
    const tx = [];
    gainInspiration(c, 7, tx, tuning(), 'test');

    expect(c.inspiration).toBe(1);
    expect(c.hand.size).toBe(2);
    expect(tx.map((step) => step.type)).toEqual([
      TX.INSPIRATION, TX.INSPIRATION, TX.INSPIRATION, TX.DRAW,
      TX.INSPIRATION, TX.INSPIRATION, TX.INSPIRATION, TX.DRAW,
      TX.INSPIRATION,
    ]);
    expect(tx.filter((step) => step.type === TX.INSPIRATION)).toHaveLength(7);
    expect(tx[2]).toMatchObject({ before: 2, after: 0, draws: 1 });
    expect(tx.filter((step) => step.type === TX.DRAW)).toHaveLength(2);
  });

  it('初始 2 點靈感時，前兩次合成都會抽牌', () => {
    const c = ctx([], [createCard('ci'), createCard('dang')], () => 0, 2);
    const tx = [];
    gainInspiration(c, TUNING.inspiration.perMerge, tx, tuning(), 'merge');
    expect(c.inspiration).toBe(1);
    gainInspiration(c, TUNING.inspiration.perMerge, tx, tuning(), 'merge');
    expect(c.inspiration).toBe(0);
    expect(tx.filter((step) => step.type === TX.DRAW)).toHaveLength(2);
  });
});

describe('忘形施放升階', () => {
  it('只能由忘形拖到一張具體牌，不能反拖或施放到忘形', () => {
    const w1 = createCard('wangXing');
    const w2 = createCard('wangXing');
    const target = createCard('pi');
    expect(w1.rank).toBeNull();
    expect(canWangxingPump(w1, target)).toBe(true);
    expect(canWangxingPump(target, w1)).toBe(false);
    expect(canWangxingPump(w1, w2)).toBe(false);
  });

  it('目標階級 +1、產出新 uid，忘形消耗且升階獲得合成靈感', () => {
    const w = createCard('wangXing');
    const target = createCard('pi', { rank: 2 });
    const c = ctx([w, target]);
    const tx = applyWangxingPump(c, w.uid, target.uid, tuning());

    expect(c.hand.get(0)).toMatchObject({ defId: 'pi', rank: 3 });
    expect(c.hand.get(0).uid).not.toBe(target.uid);
    expect(c.exhaustPile).toEqual([w]);
    expect(c.deck.discardPile).toEqual([]);
    expect(c.mergesThisTurn).toBe(1);
    expect(tx).toHaveLength(4);
    expect(tx[0]).toMatchObject({ type: TX.EXHAUST, card: w });
    expect(tx[1]).toMatchObject({
      type: TX.RANK_UP,
      consumed: target.uid,
      result: { defId: 'pi', rank: 3 },
    });
    expect(tx[2]).toMatchObject({ type: TX.INSPIRATION, amount: 1, before: 0, after: 1, draws: 0 });
    expect(tx[3]).toMatchObject({ type: TX.INSPIRATION, amount: 1, before: 1, after: 2, draws: 0 });
    expect(c.inspiration).toBe(2);
  });

  it('忘形升階使靈感滿格時會抽牌', () => {
    const w = createCard('wangXing');
    const target = createCard('pi', { rank: 2 });
    const bonus = createCard('ci');
    const c = ctx([w, target], [bonus], () => 0, 1);
    const tx = applyWangxingPump(c, w.uid, target.uid, tuning());

    expect(tx.map((x) => x.type)).toEqual([
      TX.EXHAUST, TX.RANK_UP, TX.INSPIRATION, TX.INSPIRATION, TX.DRAW,
    ]);
    expect(tx[4]).toMatchObject({ card: bonus, source: 'inspiration' });
    expect(c.hand.toArray()).toContain(bonus);
    expect(c.mergesThisTurn).toBe(1);
  });

  it('可突破 maxRank', () => {
    const w = createCard('wangXing');
    const target = createCard('pi', { rank: 5 });
    const c = ctx([w, target]);
    applyWangxingPump(c, w.uid, target.uid, tuning({ maxRank: 5 }));
    expect(c.hand.get(0).rank).toBe(6);
  });

  it('升階後接同名同階自動合成鏈', () => {
    const w = createCard('wangXing');
    const target = createCard('pi', { rank: 1 });
    const pair = createCard('pi', { rank: 2 });
    const c = ctx([w, target, pair]);
    const tx = applyWangxingPump(c, w.uid, target.uid, tuning());

    expect(c.hand.toArray()).toHaveLength(1);
    expect(c.hand.get(0).rank).toBe(3);
    expect(c.exhaustPile).toContain(w);
    expect(c.deck.discardPile).not.toContain(w);
    expect(c.mergesThisTurn).toBe(2);
    expect(tx.slice(0, 2).map((x) => x.type)).toEqual([TX.EXHAUST, TX.RANK_UP]);
    expect(tx.filter((x) => x.type === TX.MERGE)).toHaveLength(1);
  });

  it('非法 uid 或方向不改動手牌', () => {
    const w = createCard('wangXing');
    const target = createCard('pi');
    const c = ctx([w, target]);
    expect(applyWangxingPump(c, target.uid, w.uid, tuning())).toBeNull();
    expect(c.hand.toArray()).toEqual([w, target]);
  });
});
