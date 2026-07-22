import { TX } from '../core/transcript.js';
import { TUNING } from '../config/tuning.js';
import { computeLayout } from './HandLayout.js';
import { tweenTo, stopTweensOf } from './tweens.js';

/**
 * 把 core 產出的 transcript（劇本）播成 Tween 時間軸。
 *
 * core 早已同步解算完整條連鎖，這裡只是「重播」，不做任何邏輯判斷。
 * 這正是為什麼連鎖合成不會出現動畫與狀態打架 ——
 * 狀態在第 0 毫秒就定案了，動畫只是說故事。
 *
 * 也因為劇本一開播就知道全長，才能照總步數「越合越快」。
 *
 * 播放期間鎖住輸入：連鎖進行到一半時玩家不該能插手。
 */
export class MergeAnimator {
  constructor(scene, handView, { deckPos, discardPos } = {}) {
    this.scene = scene;
    this.hand = handView;
    this.deckPos = deckPos ?? { x: handView.centerX + 620, y: handView.baseY + 90 };
    this.discardPos = discardPos ?? { x: handView.centerX - 620, y: handView.baseY + 90 };
    this.playing = false;
    /** 待播劇本佇列。連續操作（狂點抽牌）產生的多份劇本依序播完，不互相打斷 */
    this.queue = [];
    /**
     * 播放世代。只有 reset()（重開戰鬥）會推進它，用來作廢所有進行中與排隊中的
     * 演出。一般抽牌/合成不推進世代 —— 它們排隊，不作廢彼此。
     */
    this.generation = 0;
    /**
     * 「越做越快」的動能步數。每抽一張、每合一次就 +1，速度隨之遞增。
     *
     * 整個回合內持續累積 —— 抽牌→合成→合成補抽→再合成…這串循環速度一路疊上去，
     * 就算分成好幾次操作、中間停頓也不歸零。**只有玩家出牌或回合結束才歸零**
     * （見 BattleScene.playCard 與 playOne 的 DISCARD 分支），
     * 讓玩家清楚感覺到「是我的操作讓速度回到原速」，而不是自己莫名變快變慢。
     */
    this.chainStep = 0;
    this.onFizzle = null;
    this.onMerge = null;
    this.onInspiration = null;
  }

  d(ms) {
    return Math.max(1, ms / (this.hand.speed * this.hand.chainSpeed));
  }

  /** 由動能步數換算加速倍率（整條曲線乘上 chainSpeedScale，有上限，穩定遞增不亂跳） */
  accelFor(step) {
    const raw = Math.min(TUNING.anim.chainAccelMax, 1 + step * TUNING.anim.chainAccelPerStep);
    return TUNING.anim.chainSpeedScale * raw;
  }

  /**
   * 動能歸零，速度回到初值。
   * 只在「玩家打出牌」與「回合結束」時呼叫 —— 這是玩家節奏的自然斷點。
   * 抽牌/合成的 batch 播完不呼叫，動能因此跨 batch 累積。
   */
  resetMomentum() {
    this.chainStep = 0;
    this.hand.chainSpeed = 1;
  }

  delay(ms) {
    return new Promise((resolve) => this.scene.time.delayedCall(this.d(ms), resolve));
  }

  tween(config) {
    return tweenTo(this.scene, config);
  }

  /**
   * 排一份劇本進佇列，並確保有一條 drain 迴圈在把佇列播完。
   *
   * 為什麼要排隊而不是「新劇本作廢舊的」：連點「抽一張」會在動畫還沒播完時
   * 一連丟進好幾份劇本。若後者作廢前者，前面那批牌沒播完就被 syncTo 靜默收掉 ——
   * 合成材料無聲消失、結果卡從畫面角落飛回手牌，就是那個不自然的畫面。
   * 排隊則讓每一份劇本都完整播出。
   *
   * 真正該作廢舊演出的只有「重開戰鬥」，走 reset()。
   *
   * @param transcript core 給的劇本
   * @param finalCards 播完後的權威手牌，用來做最終對齊
   */
  async play(transcript, finalCards = null) {
    this.queue.push({ transcript, finalCards, gen: this.generation });
    if (this.playing) return; // 已有 drain 迴圈在跑，它會吃到剛排進去的這份

    this.playing = true;
    this.hand.interactive = false;
    this.hand.setFocus(null);

    try {
      while (this.queue.length) {
        const item = this.queue.shift();
        if (item.gen !== this.generation) continue; // 已被 reset() 作廢
        await this.playOne(item.transcript, item.finalCards);
      }
    } finally {
      // 整批播完，玩家取回控制權。chainSpeed 回正常速是給閒置時的 hover/relayout 用；
      // 動能 chainStep 不動，所以下一批抽牌/合成會從累積的速度接著跑。
      this.hand.chainSpeed = 1;
      this.playing = false;
      this.hand.interactive = true;
    }
  }

  /**
   * 作廢所有進行中與排隊中的演出。重開戰鬥時呼叫 ——
   * 推進世代讓正在播的 drain 迴圈在下一個事件就收手，並清掉還沒播的舊劇本，
   * 否則舊戰局的牌會在新戰局上亂演。
   */
  reset() {
    this.generation++;
    this.queue.length = 0;
    this.resetMomentum();
  }

  /** 播完單一份劇本。中途若被 reset() 接手（世代改變）就立刻收手。 */
  async playOne(transcript, finalCards) {
    const gen = this.generation;
    const pendingInspirationDraws = [];
    const flushInspirationDraws = async () => {
      if (!pendingInspirationDraws.length) return;
      await Promise.all(pendingInspirationDraws.splice(0));
    };

    for (let i = 0; i < transcript.length; i++) {
      if (gen !== this.generation) return; // 已被 reset() 接手
      const ev = transcript[i];
      const canOverlapInspiration = ev.type === TX.INSPIRATION
        || ev.type === TX.MERGE
        || ((ev.type === TX.DRAW || ev.type === TX.DRAW_FIZZLE) && ev.source === 'inspiration');
      // 靈感抽牌可與後續點亮及合成並行；合成會直接接管仍在飛行的材料牌 tween。
      // 只有棄牌／升階等其他節奏邊界才先收束背景抽牌。
      if (!canOverlapInspiration) await flushInspirationDraws();

      switch (ev.type) {
        case TX.DISCARD: {
          // 出牌／忘形升階／回合結束都是玩家節奏的斷點。
          this.resetMomentum();
          // 回合結束的整手棄牌仍併成一次並行演出，別一張一張拖。
          const cards = [ev.card];
          while (i + 1 < transcript.length && transcript[i + 1].type === TX.DISCARD) {
            cards.push(transcript[i + 1].card);
            i += 1;
          }
          await this.playDiscard(cards);
          break;
        }
        case TX.EXHAUST:
          this.resetMomentum();
          await this.playExhaust(ev.card);
          break;
        case TX.RANK_UP:
          await this.playRankUp(ev);
          break;
        case TX.INSPIRATION:
          await this.onInspiration?.(ev);
          break;
        case TX.DRAW:
          // 抽牌也吃動能 —— 一次抽很多張時越抽越快，不再每張都是慢速初速
          this.hand.chainSpeed = this.accelFor(this.chainStep);
          this.chainStep += 1;
          if (ev.source === 'inspiration') pendingInspirationDraws.push(this.playDraw(ev));
          else await this.playDraw(ev);
          break;
        case TX.MERGE:
          this.hand.chainSpeed = this.accelFor(this.chainStep);
          this.chainStep += 1;
          await this.playMerge(ev);
          break;
        case TX.DRAW_FIZZLE:
          if (ev.source === 'inspiration') pendingInspirationDraws.push(this.playFizzle());
          else await this.playFizzle();
          break;
        case TX.CHAIN_GUARD_TRIPPED:
          // 正常遊戲永遠不該走到這 —— 走到了就是邏輯有 bug
          console.error('[MergeEngine] 連鎖防護網被觸發，合成邏輯可能有 bug');
          break;
        default:
          break;
      }
    }

    // 每份劇本播完都對齊一次權威手牌。被 reset() 接手時就別對齊 —— 接手者會自己收尾。
    // 這裡不重置動能：連續的抽牌/合成 batch 要接續加速。
    await flushInspirationDraws();
    if (gen !== this.generation) return;
    if (finalCards) await this.hand.syncTo(finalCards);
  }

  /** 回合結束，整手牌一起飛向棄牌堆（並行，不逐張拖沓） */
  async playDiscard(cards) {
    const flights = cards.map((card) => {
      const s = this.hand.getSprite(card.uid);
      if (!s) return null;

      this.hand.removeCard(card.uid);
      stopTweensOf(this.scene, s);

      return this.tween({
        targets: s,
        x: this.discardPos.x,
        y: this.discardPos.y,
        rotation: -0.6,
        scaleX: 0.6,
        scaleY: 0.6,
        alpha: 0,
        duration: this.d(TUNING.anim.discardFly),
        ease: 'Cubic.easeIn',
      }).then(() => s.destroy());
    });

    await Promise.all(flights.filter(Boolean));
  }

  /** 本場消耗：不飛向棄牌堆，而是在手牌位置上浮、縮小並消散。 */
  async playExhaust(card) {
    const s = this.hand.getSprite(card.uid);
    if (!s) return;

    this.hand.removeCard(card.uid);
    stopTweensOf(this.scene, s);

    await this.tween({
      targets: s,
      y: s.y - TUNING.anim.exhaustRise,
      scaleX: s.scaleX * TUNING.anim.exhaustScale,
      scaleY: s.scaleY * TUNING.anim.exhaustScale,
      alpha: 0,
      duration: this.d(TUNING.anim.exhaustFade),
      ease: 'Cubic.easeIn',
    });
    s.destroy();
  }

  /** 忘形升階：舊卡換成新 uid，留在原位彈一下，再交回手牌排版。 */
  async playRankUp(ev) {
    const old = this.hand.getSprite(ev.consumed);
    if (!old) return;

    stopTweensOf(this.scene, old);
    const pose = {
      x: old.x,
      y: old.y,
      rotation: old.rotation,
      scaleX: old.scaleX,
      scaleY: old.scaleY,
      depth: old.depth,
    };
    this.hand.destroyCard(ev.consumed);

    const result = this.hand.addCard(ev.result, ev.handIndex);
    result.setPosition(pose.x, pose.y);
    result.setRotation(pose.rotation);
    result.setScale(pose.scaleX, pose.scaleY);
    result.setAlpha(1);
    result.setDepth(pose.depth);

    await this.tween({
      targets: result,
      scaleX: pose.scaleX * TUNING.anim.rankUpPopScale,
      scaleY: pose.scaleY * TUNING.anim.rankUpPopScale,
      duration: this.d(TUNING.anim.mergePop),
      yoyo: true,
      ease: 'Quad.easeOut',
    });
    await this.hand.relayout(true);
  }

  async playDraw(ev) {
    const s = this.hand.addCard(ev.card);
    // 從牌庫的位置飛進來。alpha 交給 relayout 收斂，避免兩條 tween 打架。
    s.setPosition(this.deckPos.x, this.deckPos.y);
    s.setScale(0.6);
    s.setAlpha(0);

    await this.hand.relayout(true, TUNING.anim.drawFly);
  }

  async playMerge(ev) {
    const [uidA, uidB] = ev.consumed;
    const a = this.hand.getSprite(uidA);
    const b = this.hand.getSprite(uidB);

    // 算出結果卡會落在哪 —— 兩張材料先撞向那個點
    const orderAfter = this.hand.order.filter((u) => u !== uidA && u !== uidB);
    orderAfter.splice(ev.handIndex, 0, ev.result.uid);
    const layoutAfter = computeLayout(orderAfter.length, {
      centerX: this.hand.centerX,
      baseY: this.hand.baseY,
    });
    const target = layoutAfter[ev.handIndex];

    const collide = [a, b].filter(Boolean).map((s) => {
      stopTweensOf(this.scene, s);
      return this.tween({
        targets: s,
        x: target.x,
        y: target.y,
        rotation: 0,
        scaleX: 0.85,
        scaleY: 0.85,
        duration: this.d(TUNING.anim.mergeCollide),
        ease: 'Cubic.easeIn',
      });
    });
    await Promise.all(collide);

    // 材料消失，結果卡誕生
    this.hand.destroyCard(uidA);
    this.hand.destroyCard(uidB);

    const result = this.hand.addCard(ev.result, ev.handIndex);
    result.setPosition(target.x, target.y);
    result.setScale(0.85);
    result.setDepth(1200);

    this.onMerge?.(ev, result);

    await this.tween({
      targets: result,
      scaleX: 1.25,
      scaleY: 1.25,
      duration: this.d(TUNING.anim.mergePop),
      yoyo: true,
      ease: 'Quad.easeOut',
    });

    await this.hand.relayout(true);
    await this.delay(TUNING.anim.chainStepGap);
  }

  async playFizzle() {
    this.onFizzle?.();
    await this.delay(TUNING.anim.chainStepGap);
  }
}
