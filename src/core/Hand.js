/**
 * 手牌。順序有意義 —— 合成採「最左配對優先」，
 * 且結果卡會落在較左的位置，所以 index 不是裝飾。
 */
export class Hand {
  constructor(cards = []) {
    this.cards = [...cards];
  }

  get size() {
    return this.cards.length;
  }

  get(index) {
    return this.cards[index];
  }

  indexOfUid(uid) {
    return this.cards.findIndex((c) => c.uid === uid);
  }

  findByUid(uid) {
    return this.cards.find((c) => c.uid === uid);
  }

  add(card) {
    this.cards.push(card);
  }

  insertAt(index, card) {
    this.cards.splice(index, 0, card);
  }

  removeAt(index) {
    return this.cards.splice(index, 1)[0];
  }

  removeByUid(uid) {
    const i = this.indexOfUid(uid);
    if (i === -1) return null;
    return this.removeAt(i);
  }

  clear() {
    const out = this.cards;
    this.cards = [];
    return out;
  }

  toArray() {
    return [...this.cards];
  }
}
