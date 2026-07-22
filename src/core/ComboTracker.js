import { TUNING } from '../config/tuning.js';

/**
 * 一回合內的境界門檻與連擊獎勵。
 *
 * 出牌階級 R 大於目前境界時，境界與連擊各 +1；否則中斷連擊並一起歸零。
 * 忘形只把境界歸零，連擊會保留到回合結束。
 */
export class ComboTracker {
  constructor(tuning = TUNING) {
    this.tuning = tuning;
    this.reset();
  }

  /** 每回合開始呼叫。 */
  reset() {
    this.realm = 0;
    this.combo = 0;
  }

  /** 忘形打出：返璞歸真，只重置門檻。 */
  forgetForm() {
    this.realm = 0;
    return this.current();
  }

  /** 記錄一張有階級的牌，回傳該牌的結算資訊。 */
  play(card) {
    const broke = card.rank > this.realm;
    if (!broke) {
      this.reset();
      // 儲存狀態已是 0/0，但中斷牌本身仍要以基礎倍率 ×1 結算。
      return this.current({ multiplier: 1, broke: false, interrupted: true });
    }
    this.realm += 1;
    this.combo += 1;
    return this.current({ broke: true, interrupted: false });
  }

  /** 不改變狀態的預覽，供 UI 判斷這張牌是否能突破。 */
  peek(card) {
    const broke = card.rank > this.realm;
    if (!broke) {
      return { realm: 0, combo: 0, multiplier: 1, broke: false, interrupted: true };
    }
    const combo = this.combo + 1;
    return {
      realm: this.realm + 1,
      combo,
      multiplier: this.tuning.comboMultiplier(combo),
      broke: true,
      interrupted: false,
    };
  }

  current(extra = {}) {
    return {
      realm: this.realm,
      combo: this.combo,
      multiplier: this.combo > 0 ? this.tuning.comboMultiplier(this.combo) : 0,
      ...extra,
    };
  }
}
