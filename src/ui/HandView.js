import { CardSprite } from './CardSprite.js';
import { computeLayout } from './HandLayout.js';
import { tweenTo, stopTweensOf } from './tweens.js';
import { TUNING } from '../config/tuning.js';

/**
 * 手牌的視覺層：哪些 sprite 存在、各自該在哪。
 *
 * order 刻意鏡像 core 那邊 Hand 的順序，包含連鎖過程中的每一個中間狀態 ——
 * MergeAnimator 會一步步跟著 transcript 推進它。
 * 播完後 syncTo() 會強制對齊權威狀態，就算演出中途飄掉，最終狀態仍然正確。
 */
export class HandView {
  constructor(scene, { centerX = 800, baseY = 780 } = {}) {
    this.scene = scene;
    this.centerX = centerX;
    this.baseY = baseY;
    this.order = [];
    this.sprites = new Map();
    this.focusUid = null;
    /** 玩家的動畫速度滑桿 */
    this.speed = 1;
    /**
     * 目前的加速倍率，由 MergeAnimator 依其動能（chainStep）推進。
     * 閒置時回到 1（給 hover/relayout 用），但動能本身累積在 MergeAnimator，
     * 跨 batch 保留，直到玩家出牌或回合結束才歸零。
     */
    this.chainSpeed = 1;
    this.interactive = true;
    this.onCardHover = null;
    this.onCardOut = null;
  }

  /**
   * 動畫時長。
   * speed 是玩家拉的滑桿，chainSpeed 是連鎖中「越合越快」的加速，兩者相乘。
   */
  d(ms) {
    return Math.max(1, ms / (this.speed * this.chainSpeed));
  }

  get size() {
    return this.order.length;
  }

  getSprite(uid) {
    return this.sprites.get(uid);
  }

  createSprite(card) {
    const s = new CardSprite(this.scene, card);
    s.setInteractive({ useHandCursor: true, draggable: true });
    s.on('pointerover', () => {
      if (!this.interactive) return;
      this.setFocus(card.uid);
      this.onCardHover?.(s);
    });
    s.on('pointerout', () => {
      if (!this.interactive) return;
      if (this.focusUid === card.uid) this.setFocus(null);
      this.onCardOut?.(s);
    });
    this.sprites.set(card.uid, s);
    return s;
  }

  addCard(card, index = null) {
    const s = this.createSprite(card);
    if (index == null || index >= this.order.length) this.order.push(card.uid);
    else this.order.splice(index, 0, card.uid);
    return s;
  }

  removeCard(uid) {
    const i = this.order.indexOf(uid);
    if (i !== -1) this.order.splice(i, 1);
    const s = this.sprites.get(uid);
    this.sprites.delete(uid);
    return s;
  }

  destroyCard(uid) {
    this.removeCard(uid)?.destroy();
  }

  setFocus(uid) {
    if (this.focusUid === uid) return;
    this.focusUid = uid;
    this.relayout(true);
  }

  targets() {
    const focusIndex = this.focusUid ? this.order.indexOf(this.focusUid) : -1;
    return computeLayout(this.order.length, {
      centerX: this.centerX,
      baseY: this.baseY,
      focusIndex: focusIndex === -1 ? null : focusIndex,
    });
  }

  /**
   * 把每張牌 tween 到它的目標狀態。
   * 因為 computeLayout 給的是「目標」而非動畫，張數劇變時自然是平滑補間。
   *
   * alpha 也一併由這裡收斂到 1，讓新抽的牌能一邊飛入一邊淡入 ——
   * 若另外開一條 alpha tween，會被下面的 killTweensOf 砍掉。
   */
  relayout(animate = true, duration = TUNING.anim.handRelayout) {
    const layout = this.targets();
    const promises = [];

    this.order.forEach((uid, i) => {
      const s = this.sprites.get(uid);
      if (!s) return;
      const t = layout[i];
      s.setDepth(t.depth);

      // 先停掉這張牌身上還在跑的舊 tween。多次 relayout 疊在一起時
      // （hover、抽牌、合成收尾常常同時發生）會有好幾條 tween 同時搶
      // x/y/rotation/scale，卡牌最後會停在錯的位置與縮放上。
      //
      // 用 stopTweensOf 而非 tweens.killTweensOf —— relayout 隨時可能停掉
      // 別人正在 await 的 tween（例如合成的撞擊），kill 不發 onStop 會讓那條
      // 演出永遠醒不過來。詳見 tweens.js。
      stopTweensOf(this.scene, s);

      if (!animate) {
        s.setPosition(t.x, t.y);
        s.setRotation(t.rotation);
        s.setScale(t.scale);
        s.setAlpha(1);
        return;
      }

      promises.push(
        tweenTo(this.scene, {
          targets: s,
          x: t.x,
          y: t.y,
          rotation: t.rotation,
          scaleX: t.scale,
          scaleY: t.scale,
          alpha: 1,
          duration: this.d(duration),
          ease: 'Cubic.easeOut',
        })
      );
    });

    return Promise.all(promises);
  }

  /**
   * 強制對齊權威手牌。
   * 演出可能因為 bug 或中斷而飄掉，這是最後的安全網 ——
   * 畫面永遠不該與 core 的狀態不一致。
   */
  syncTo(cards) {
    const wanted = cards.map((c) => c.uid);

    for (const uid of [...this.sprites.keys()]) {
      if (!wanted.includes(uid)) this.destroyCard(uid);
    }

    // 記下這次新生的 sprite。新 CardSprite 建構在 (0,0)（畫面左上角），
    // 若直接交給 relayout tween，就會從角落飛進手牌 —— 很不自然。
    const born = new Set();
    for (const card of cards) {
      if (!this.sprites.has(card.uid)) {
        this.addCard(card);
        born.add(card.uid);
      } else {
        this.sprites.get(card.uid).refresh(card);
      }
    }
    this.order = wanted;

    // 補生的卡直接擺到定位、透明起手，讓下面的 relayout 只淡入不位移。
    // syncTo 是「對齊權威狀態」的安全網，不該演出戲劇性的飛入。
    if (born.size) {
      const layout = this.targets();
      this.order.forEach((uid, i) => {
        if (!born.has(uid)) return;
        const s = this.sprites.get(uid);
        const t = layout[i];
        s.setPosition(t.x, t.y);
        s.setRotation(t.rotation);
        s.setScale(t.scale);
        s.setAlpha(0);
      });
    }

    return this.relayout(true);
  }

  /**
   * 更新連段提示：realm 大於目前連段境界（lastRealm）的牌會亮綠邊 ——
   * 打它能讓連段續下去（境界無時 lastRealm 當 0，任何實體卡都能起手）。
   */
  /**
   * 更新手牌提示：
   *   內力不足（cost > energy）的牌灰掉，且**連段高光也一起收掉**（反正打不出）。
   *   打得出、且 realm 大於目前連段境界（lastRealm，境界無當 0）的牌亮綠邊 —— 打它能續連段。
   */
  updateCardHints(lastRealm, energy) {
    // 無境界（lastRealm null，回合開始/連段中斷後）不高光 —— 這時任何牌都能起手，
    // 全部亮綠只是雜訊。只有「連段進行中」才點亮能續段（境界更高）的牌。
    const inCombo = lastRealm != null;
    for (const s of this.sprites.values()) {
      const affordable = s.cost <= energy;
      const canCombo = affordable && inCombo && s.card.realm != null && s.card.realm > lastRealm;
      s.setAffordable(affordable);
      s.setComboHint(canCombo);
    }
  }

  clear() {
    for (const s of this.sprites.values()) s.destroy();
    this.sprites.clear();
    this.order = [];
    this.focusUid = null;
  }
}
