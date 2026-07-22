import { describe, expect, it } from 'vitest';
import {
  comboLabel,
  energyPips,
  inspirationGauge,
  shouldHighlightCombo,
} from '../../src/ui/format.js';

describe('資源大小格格式', () => {
  it('三個內力小格會合成一個大格', () => {
    expect(energyPips(1)).toBe('▪');
    expect(energyPips(2)).toBe('▪▪');
    expect(energyPips(3)).toBe('▰');
    expect(energyPips(5)).toBe('▰ ▪▪');
    expect(energyPips(6)).toBe('▰ ▰');
  });

  it('零資源仍有空格提示', () => {
    expect(energyPips(0)).toBe('○');
  });

  it('靈感 HUD 顯示目前餘數', () => {
    expect(inspirationGauge(0)).toBe('○○○');
    expect(inspirationGauge(2)).toBe('●●○');
  });
});

describe('戰鬥提示格式', () => {
  it('零連擊不顯示文字', () => {
    expect(comboLabel(0)).toBe('');
    expect(comboLabel(3)).toBe('連擊 ×3');
  });

  it('境界零不高亮；建立境界後才提示可續擊牌', () => {
    const card = { rank: 2 };
    expect(shouldHighlightCombo(card, 0, 9, 3)).toBe(false);
    expect(shouldHighlightCombo(card, 1, 9, 3)).toBe(true);
    expect(shouldHighlightCombo(card, 1, 2, 3)).toBe(false);
  });
});
