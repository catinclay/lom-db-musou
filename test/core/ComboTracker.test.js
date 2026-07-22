import { describe, expect, it } from 'vitest';
import { ComboTracker } from '../../src/core/ComboTracker.js';
import { TUNING } from '../../src/config/tuning.js';

const card = (rank) => ({ rank });

describe('ComboTracker — 境界門檻與連擊', () => {
  it('階級大於境界時，境界與連擊各 +1', () => {
    const t = new ComboTracker();
    expect(t.play(card(1))).toMatchObject({ realm: 1, combo: 1, multiplier: 1, broke: true });
    expect(t.play(card(2))).toMatchObject({ realm: 2, combo: 2, multiplier: 2, broke: true });
    expect(t.play(card(4))).toMatchObject({ realm: 3, combo: 3, multiplier: 3, broke: true });
  });

  it('同階牌先逐步突破，到達當前境界後會中斷並歸零', () => {
    const t = new ComboTracker();
    expect(t.play(card(2)).combo).toBe(1);
    expect(t.play(card(2)).combo).toBe(2);
    expect(t.play(card(2))).toMatchObject({
      realm: 0, combo: 0, multiplier: 1, broke: false, interrupted: true,
    });
    expect(t.current()).toMatchObject({ realm: 0, combo: 0, multiplier: 0 });
  });

  it('低階牌會打斷並重置既有境界與連擊，下一張重新起段', () => {
    const t = new ComboTracker();
    t.play(card(1));
    t.play(card(3));
    expect(t.play(card(1))).toMatchObject({
      realm: 0, combo: 0, multiplier: 1, broke: false, interrupted: true,
    });
    expect(t.play(card(1))).toMatchObject({
      realm: 1, combo: 1, multiplier: 1, broke: true, interrupted: false,
    });
  });

  it('forgetForm 只把境界歸零，低階牌可再次突破並續增連擊', () => {
    const t = new ComboTracker();
    t.play(card(1));
    t.play(card(2));
    expect(t.forgetForm()).toMatchObject({ realm: 0, combo: 2, multiplier: 2 });
    expect(t.play(card(1))).toMatchObject({ realm: 1, combo: 3, multiplier: 3, broke: true });
  });

  it('reset 讓境界與連擊都歸零', () => {
    const t = new ComboTracker();
    t.play(card(3));
    t.reset();
    expect(t.current()).toMatchObject({ realm: 0, combo: 0, multiplier: 0 });
  });

  it('peek 可預測突破但不修改狀態', () => {
    const t = new ComboTracker();
    t.play(card(1));
    expect(t.peek(card(2))).toMatchObject({ realm: 2, combo: 2, broke: true });
    expect(t.current()).toMatchObject({ realm: 1, combo: 1 });
  });

  it('peek 可預測中斷與基礎倍率，但不修改狀態', () => {
    const t = new ComboTracker();
    t.play(card(1));
    t.play(card(2));
    expect(t.peek(card(2))).toMatchObject({
      realm: 0, combo: 0, multiplier: 1, broke: false, interrupted: true,
    });
    expect(t.current()).toMatchObject({ realm: 2, combo: 2, multiplier: 2 });
  });

  it('comboMultiplier 仍可由 tuning 替換', () => {
    const t = new ComboTracker({ ...TUNING, comboMultiplier: (n) => 2 ** (n - 1) });
    expect(t.play(card(1)).multiplier).toBe(1);
    expect(t.play(card(2)).multiplier).toBe(2);
    expect(t.play(card(3)).multiplier).toBe(4);
  });
});
