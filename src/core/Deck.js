import { shuffleInPlace, defaultRng } from './rng.js';

/**
 * 牌庫與棄牌堆。
 * 只管卡牌的流動，不認識合成規則。
 */
export class Deck {
  constructor(cards = [], rng = defaultRng) {
    this.drawPile = [...cards];
    this.discardPile = [];
    this.rng = rng;
  }

  shuffleDrawPile() {
    shuffleInPlace(this.drawPile, this.rng);
  }

  /**
   * 抽一張。牌庫空了就把棄牌堆洗回去。
   * 兩邊都空時回傳 null — 呼叫端必須處理，這在長連鎖中是常態而非例外。
   */
  draw() {
    if (this.drawPile.length === 0) {
      if (this.discardPile.length === 0) return null;
      this.drawPile = this.discardPile;
      this.discardPile = [];
      this.shuffleDrawPile();
    }
    return this.drawPile.shift() ?? null;
  }

  discard(card) {
    this.discardPile.push(card);
  }

  discardAll(cards) {
    for (const c of cards) this.discardPile.push(c);
  }

  get drawCount() {
    return this.drawPile.length;
  }

  get discardCount() {
    return this.discardPile.length;
  }

  /** 牌庫與棄牌堆都空 — 再也抽不出東西了 */
  get isExhausted() {
    return this.drawPile.length === 0 && this.discardPile.length === 0;
  }
}
