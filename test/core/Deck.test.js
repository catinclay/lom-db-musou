import { describe, it, expect, beforeEach } from 'vitest';
import { Deck } from '../../src/core/Deck.js';
import { Hand } from '../../src/core/Hand.js';
import { createCard, resetUidCounter } from '../../src/core/Card.js';
import { seededRng, shuffleInPlace } from '../../src/core/rng.js';

beforeEach(() => resetUidCounter());

describe('Deck', () => {
  it('依序抽牌', () => {
    const a = createCard('pi');
    const b = createCard('ci');
    const d = new Deck([a, b], seededRng(1));
    expect(d.draw().uid).toBe(a.uid);
    expect(d.draw().uid).toBe(b.uid);
  });

  it('空牌庫抽出 null', () => {
    expect(new Deck([], seededRng(1)).draw()).toBeNull();
  });

  it('牌庫空了會把棄牌堆洗回來', () => {
    const d = new Deck([], seededRng(1));
    d.discard(createCard('pi'));
    d.discard(createCard('ci'));

    expect(d.drawCount).toBe(0);
    expect(d.draw()).not.toBeNull();
    expect(d.discardCount).toBe(0); // 已全數洗回
  });

  it('兩邊都空 ⇒ isExhausted', () => {
    const d = new Deck([createCard('pi')], seededRng(1));
    expect(d.isExhausted).toBe(false);
    d.draw();
    expect(d.isExhausted).toBe(true);
  });

  it('抽完再抽仍是 null，不會爆', () => {
    const d = new Deck([createCard('pi')], seededRng(1));
    d.draw();
    expect(d.draw()).toBeNull();
    expect(d.draw()).toBeNull();
  });

  it('計數正確', () => {
    const d = new Deck([createCard('pi'), createCard('ci')], seededRng(1));
    expect(d.drawCount).toBe(2);
    d.discard(d.draw());
    expect(d.drawCount).toBe(1);
    expect(d.discardCount).toBe(1);
  });
});

describe('洗牌可重現（測試不靠運氣）', () => {
  it('同一顆種子洗出同樣結果', () => {
    const make = () => [1, 2, 3, 4, 5, 6, 7, 8];
    expect(shuffleInPlace(make(), seededRng(7))).toEqual(shuffleInPlace(make(), seededRng(7)));
  });

  it('不同種子洗出不同結果', () => {
    const make = () => [1, 2, 3, 4, 5, 6, 7, 8];
    expect(shuffleInPlace(make(), seededRng(1))).not.toEqual(shuffleInPlace(make(), seededRng(2)));
  });

  it('洗牌不增不減元素', () => {
    const out = shuffleInPlace([1, 2, 3, 4, 5], seededRng(3));
    expect(out.sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('Hand', () => {
  it('插入到指定位置', () => {
    const h = new Hand([createCard('pi'), createCard('ci')]);
    const x = createCard('dang');
    h.insertAt(1, x);
    expect(h.get(1).uid).toBe(x.uid);
    expect(h.size).toBe(3);
  });

  it('依 uid 移除', () => {
    const a = createCard('pi');
    const h = new Hand([a, createCard('ci')]);
    expect(h.removeByUid(a.uid).uid).toBe(a.uid);
    expect(h.size).toBe(1);
  });

  it('移除不存在的 uid 回傳 null', () => {
    const h = new Hand([createCard('pi')]);
    expect(h.removeByUid('無此牌')).toBeNull();
    expect(h.size).toBe(1);
  });

  it('clear 回傳原本的牌並清空', () => {
    const h = new Hand([createCard('pi'), createCard('ci')]);
    expect(h.clear()).toHaveLength(2);
    expect(h.size).toBe(0);
  });

  it('toArray 是複本，改它不影響手牌', () => {
    const h = new Hand([createCard('pi')]);
    h.toArray().push(createCard('ci'));
    expect(h.size).toBe(1);
  });
});
