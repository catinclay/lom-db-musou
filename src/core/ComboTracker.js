import { TUNING } from '../config/tuning.js';

/**
 * 境界連段（§4）。
 *
 * 依境界數字由小到大遞增出牌即累積連段，不需連續數字（一→三 也算）。
 * 境界 ≤ 前一張則中斷，step 歸 1。
 * 線性遞增：第 N 張遞增牌得 ×N。
 */
export class ComboTracker {
  constructor(tuning = TUNING) {
    this.tuning = tuning;
    this.reset();
  }

  /** 每回合開始呼叫 */
  reset() {
    this.lastRealm = null;
    this.step = 0;
  }

  /**
   * 記錄一次出牌，回傳這張牌的結算資訊。
   * @returns {{ step: number, multiplier: number, ascended: boolean, broken: boolean }}
   */
  play(card) {
    const isFirst = this.lastRealm === null;
    const ascended = !isFirst && card.realm > this.lastRealm;
    const broken = !isFirst && !ascended;

    if (isFirst || ascended) {
      this.step += 1;
    } else {
      this.step = 1; // 中斷，重新起算
    }

    this.lastRealm = card.realm;

    return {
      step: this.step,
      multiplier: this.tuning.comboMultiplier(this.step),
      ascended,
      broken,
    };
  }

  /** 不改變狀態的預覽 —— UI 在 hover 時顯示「打這張會是 ×幾」 */
  peek(card) {
    const isFirst = this.lastRealm === null;
    const ascended = !isFirst && card.realm > this.lastRealm;
    const step = isFirst || ascended ? this.step + 1 : 1;
    return {
      step,
      multiplier: this.tuning.comboMultiplier(step),
      ascended,
      broken: !isFirst && !ascended,
    };
  }
}
