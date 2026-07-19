import { describe, it, expect } from 'vitest';
import { ComboTracker } from '../../src/core/ComboTracker.js';
import { createCard, resetUidCounter } from '../../src/core/Card.js';
import { TUNING } from '../../src/config/tuning.js';

const card = (realm) => createCard('pi', { realm });
const mult = (t, realm) => t.play(card(realm)).multiplier;

describe('境界連段 — 線性遞增', () => {
  it('1→2→3→4 得 ×1/×2/×3/×4', () => {
    resetUidCounter();
    const t = new ComboTracker();
    expect(mult(t, 1)).toBe(1); // 第1張建立基準
    expect(mult(t, 2)).toBe(2);
    expect(mult(t, 3)).toBe(3);
    expect(mult(t, 4)).toBe(4);
  });

  it('不需連續數字：1→3 也觸發遞增', () => {
    const t = new ComboTracker();
    expect(mult(t, 1)).toBe(1);
    expect(mult(t, 3)).toBe(2);
    expect(mult(t, 9)).toBe(3);
  });

  it('境界相等 ⇒ 中斷，step 歸 1', () => {
    const t = new ComboTracker();
    mult(t, 1);
    mult(t, 2);
    expect(mult(t, 2)).toBe(1); // 2 不大於 2 ⇒ 斷
  });

  it('境界變小 ⇒ 中斷，step 歸 1', () => {
    const t = new ComboTracker();
    mult(t, 1);
    mult(t, 3);
    mult(t, 5);
    expect(mult(t, 2)).toBe(1);
  });

  it('中斷後可重新累積', () => {
    const t = new ComboTracker();
    mult(t, 3); // ×1
    expect(mult(t, 1)).toBe(1); // 斷
    expect(mult(t, 2)).toBe(2); // 從 1 重新爬
    expect(mult(t, 3)).toBe(3);
  });

  it('回報 ascended / broken 旗標', () => {
    const t = new ComboTracker();
    expect(t.play(card(1))).toMatchObject({ ascended: false, broken: false }); // 第一張
    expect(t.play(card(2))).toMatchObject({ ascended: true, broken: false });
    expect(t.play(card(1))).toMatchObject({ ascended: false, broken: true });
  });

  it('reset 清空連段（每回合開始）', () => {
    const t = new ComboTracker();
    mult(t, 5);
    mult(t, 7);
    t.reset();
    expect(mult(t, 1)).toBe(1);
  });

  it('peek 不改變狀態', () => {
    const t = new ComboTracker();
    t.play(card(1));
    expect(t.peek(card(5))).toMatchObject({ multiplier: 2, ascended: true });
    expect(t.peek(card(5))).toMatchObject({ multiplier: 2 }); // 再 peek 一樣
    expect(t.play(card(5)).multiplier).toBe(2); // 真的打出來也一樣
  });

  it('peek 預測中斷', () => {
    const t = new ComboTracker();
    t.play(card(5));
    expect(t.peek(card(2))).toMatchObject({ multiplier: 1, broken: true });
  });
});

describe('倍率公式可抽換', () => {
  it('改成複利疊乘也行（tuning.comboMultiplier）', () => {
    const t = new ComboTracker({ ...TUNING, comboMultiplier: (s) => 2 ** (s - 1) });
    expect(mult(t, 1)).toBe(1);
    expect(mult(t, 2)).toBe(2);
    expect(mult(t, 3)).toBe(4);
    expect(mult(t, 4)).toBe(8);
  });
});
