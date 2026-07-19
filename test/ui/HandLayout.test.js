import { describe, it, expect } from 'vitest';
import { computeLayout, layoutWidth } from '../../src/ui/HandLayout.js';

const CENTER_X = 800;
const BASE_Y = 780;
const base = { centerX: CENTER_X, baseY: BASE_Y };

describe('扇形佈局 — 基本', () => {
  it('空手牌回傳空陣列', () => {
    expect(computeLayout(0, base)).toEqual([]);
    expect(computeLayout(-1, base)).toEqual([]);
  });

  it('單張牌置中、不旋轉、不下垂', () => {
    const [c] = computeLayout(1, base);
    expect(c.x).toBe(CENTER_X);
    expect(c.y).toBe(BASE_Y);
    expect(c.rotation).toBe(0);
    expect(c.scale).toBe(1);
  });

  it('張數正確', () => {
    expect(computeLayout(7, base)).toHaveLength(7);
  });

  it('以中心左右對稱', () => {
    const l = computeLayout(5, base);
    for (let i = 0; i < l.length; i++) {
      const mirror = l[l.length - 1 - i];
      expect(l[i].x - CENTER_X).toBeCloseTo(-(mirror.x - CENTER_X), 5);
      expect(l[i].rotation).toBeCloseTo(-mirror.rotation, 5);
      expect(l[i].y).toBeCloseTo(mirror.y, 5);
    }
  });

  it('由左至右排列', () => {
    const l = computeLayout(6, base);
    for (let i = 1; i < l.length; i++) {
      expect(l[i].x).toBeGreaterThan(l[i - 1].x);
    }
  });

  it('depth 由左至右遞增（右邊的牌蓋在左邊之上）', () => {
    const l = computeLayout(5, base);
    for (let i = 1; i < l.length; i++) {
      expect(l[i].depth).toBeGreaterThan(l[i - 1].depth);
    }
  });
});

describe('扇形弧度', () => {
  it('左半邊向左傾、右半邊向右傾', () => {
    const l = computeLayout(5, base);
    expect(l[0].rotation).toBeLessThan(0);
    expect(l[4].rotation).toBeGreaterThan(0);
    expect(l[2].rotation).toBeCloseTo(0, 5);
  });

  it('兩端比中央低（扇形下垂）', () => {
    const l = computeLayout(5, base);
    expect(l[0].y).toBeGreaterThan(l[2].y);
    expect(l[4].y).toBeGreaterThan(l[2].y);
  });

  it('張數越多張角越大', () => {
    const few = computeLayout(3, base);
    const many = computeLayout(6, base);
    const spread = (l) => l[l.length - 1].rotation - l[0].rotation;
    expect(spread(many)).toBeGreaterThan(spread(few));
  });

  it('張角有上限，不會無限展開', () => {
    const l = computeLayout(30, { ...base, maxArcAngle: 28 });
    const spreadDeg = ((l[l.length - 1].rotation - l[0].rotation) * 180) / Math.PI;
    expect(spreadDeg).toBeLessThanOrEqual(28.0001);
  });
});

describe('寬度壓縮（連鎖爆抽時的關鍵）', () => {
  it('手牌不超過 maxSpreadWidth', () => {
    const maxSpreadWidth = 900;
    for (const n of [2, 5, 10, 20, 40]) {
      const l = computeLayout(n, { ...base, maxSpreadWidth });
      const spread = l[l.length - 1].x - l[0].x;
      expect(spread).toBeLessThanOrEqual(maxSpreadWidth + 0.0001);
    }
  });

  it('張數少時用理想間距，不硬撐滿寬度', () => {
    const l = computeLayout(3, { ...base, cardWidth: 140, overlapFactor: 0.72, maxSpreadWidth: 900 });
    expect(l[1].x - l[0].x).toBeCloseTo(140 * 0.72, 5);
  });

  it('張數多時間距被壓縮（卡牌重疊）', () => {
    const opts = { ...base, cardWidth: 140, overlapFactor: 0.72, maxSpreadWidth: 900 };
    const spacingOf = (n) => {
      const l = computeLayout(n, opts);
      return l[1].x - l[0].x;
    };
    expect(spacingOf(20)).toBeLessThan(spacingOf(3));
  });

  it('間距隨張數單調不增（不會突然跳開）', () => {
    const opts = { ...base, maxSpreadWidth: 900 };
    let prev = Infinity;
    for (let n = 2; n <= 30; n++) {
      const l = computeLayout(n, opts);
      const spacing = l[1].x - l[0].x;
      expect(spacing).toBeLessThanOrEqual(prev + 0.0001);
      prev = spacing;
    }
  });

  it('張數劇變時佈局仍連續（無跳變）', () => {
    // 連鎖抽牌時 n 會一路狂跳，中心點不該亂飄
    const opts = { ...base, maxSpreadWidth: 900 };
    for (let n = 1; n <= 25; n++) {
      const l = computeLayout(n, opts);
      const mid = (l[0].x + l[l.length - 1].x) / 2;
      expect(mid).toBeCloseTo(CENTER_X, 5);
    }
  });
});

describe('Hover', () => {
  it('被 hover 的牌放大、上抬、擺正、置頂', () => {
    const plain = computeLayout(5, base);
    const l = computeLayout(5, { ...base, focusIndex: 1, hoverScale: 1.18, hoverLift: 48 });

    expect(l[1].scale).toBe(1.18);
    expect(l[1].y).toBeCloseTo(plain[1].y - 48, 5);
    expect(l[1].rotation).toBe(0);
    expect(l[1].depth).toBeGreaterThan(Math.max(...plain.map((c) => c.depth)));
  });

  it('鄰牌向兩側讓位', () => {
    const plain = computeLayout(5, base);
    const l = computeLayout(5, { ...base, focusIndex: 2, neighborNudge: 26 });

    expect(l[1].x).toBeLessThan(plain[1].x); // 左鄰往左讓
    expect(l[3].x).toBeGreaterThan(plain[3].x); // 右鄰往右讓
  });

  it('讓位隨距離衰減', () => {
    const plain = computeLayout(7, base);
    const l = computeLayout(7, { ...base, focusIndex: 3, neighborNudge: 26 });
    const nudge = (i) => Math.abs(l[i].x - plain[i].x);

    expect(nudge(2)).toBeGreaterThan(nudge(1)); // 越近讓越多
    expect(nudge(1)).toBeGreaterThan(nudge(0));
    expect(nudge(0)).toBeCloseTo(0, 5); // 太遠就不受影響
  });

  it('未 hover 的牌不放大', () => {
    const l = computeLayout(5, { ...base, focusIndex: 2 });
    expect(l[0].scale).toBe(1);
    expect(l[4].scale).toBe(1);
  });

  it('focusIndex 為 null 時等同無 hover', () => {
    expect(computeLayout(5, { ...base, focusIndex: null })).toEqual(computeLayout(5, base));
  });

  it('hover 第一張或最後一張不會出錯', () => {
    expect(() => computeLayout(5, { ...base, focusIndex: 0 })).not.toThrow();
    expect(() => computeLayout(5, { ...base, focusIndex: 4 })).not.toThrow();
  });
});

describe('layoutWidth', () => {
  it('空手牌為 0', () => {
    expect(layoutWidth(0, base)).toBe(0);
  });

  it('單張等於卡寬', () => {
    expect(layoutWidth(1, { ...base, cardWidth: 140 })).toBe(140);
  });

  it('隨張數增加但有上限', () => {
    const opts = { ...base, cardWidth: 140, maxSpreadWidth: 900 };
    expect(layoutWidth(30, opts)).toBeLessThanOrEqual(900 + 140);
  });
});
