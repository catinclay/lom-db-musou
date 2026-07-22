import { describe, expect, it, vi } from 'vitest';
import { MergeAnimator } from '../../src/ui/MergeAnimator.js';
import { TX } from '../../src/core/transcript.js';

describe('靈感與抽牌動畫時序', () => {
  it('抽牌飛行期間可繼續點亮靈感與合成，不等待卡牌歸位', async () => {
    let finishDraw;
    const drawFlight = new Promise((resolve) => { finishDraw = resolve; });
    const order = [];
    const animator = Object.assign(Object.create(MergeAnimator.prototype), {
      generation: 0,
      chainStep: 0,
      hand: { speed: 1, chainSpeed: 1 },
      onInspiration: vi.fn(async (ev) => order.push(`靈感${ev.after}`)),
      playDraw: vi.fn(() => {
        order.push('抽牌開始');
        return drawFlight;
      }),
      playMerge: vi.fn(async () => order.push('合成')),
    });

    const running = animator.playOne([
      { type: TX.INSPIRATION, after: 0, draws: 1 },
      { type: TX.DRAW, source: 'inspiration', card: { uid: 'drawn' } },
      { type: TX.INSPIRATION, after: 1, draws: 0 },
      { type: TX.MERGE, consumed: [], result: { uid: 'merged' }, handIndex: 0 },
    ]);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual(['靈感0', '抽牌開始', '靈感1', '合成']);

    finishDraw();
    await running;
    expect(order).toEqual(['靈感0', '抽牌開始', '靈感1', '合成']);
  });
});
