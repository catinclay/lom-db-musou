import Phaser from 'phaser';
import { RunState } from '../core/RunState.js';
import { spinSlot, applySlotReward, SLOT_SYMBOLS, SLOT_SYMBOL_LABEL } from '../core/slot.js';

/**
 * 三輪連線拉霸。花速通代幣拉，三連大獎（金/劍/毒/火/葫/囧）。
 * 進來的來源：每天入夜打贏尾王後（若有代幣）、以及客棧（Phase 2 step 2）。
 * 邏輯全在 core/slot.js；這裡只演轉輪、按鈕、結算顯示。
 */
const REEL_X = [640, 800, 960];
const REEL_Y = 380;

export class SlotScene extends Phaser.Scene {
  constructor() {
    super('Slot');
  }

  create(data) {
    this.run = data?.run ?? new RunState();
    this.back = data?.back ?? null; // 從客棧來時記得回客棧；否則回地圖
    this.spinning = false;
    this.reelTimers = [];
    this.pendingTimers = [];

    this.cameras.main.setBackgroundColor('#160f1c');
    this.add.text(800, 90, '🎰 拉霸機', {
      fontFamily: 'sans-serif', fontSize: '44px', color: '#f0dda0', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.status = this.add
      .text(800, 160, '', { fontFamily: 'sans-serif', fontSize: '22px', color: '#d8c9a8' })
      .setOrigin(0.5);

    // 三個轉輪框
    this.reels = REEL_X.map((x) => {
      this.add.rectangle(x, REEL_Y, 130, 150, 0x241d17).setStrokeStyle(4, 0xd9b45c);
      return this.add
        .text(x, REEL_Y, '?', { fontFamily: 'sans-serif', fontSize: '90px', color: '#f5e6c8', fontStyle: 'bold' })
        .setOrigin(0.5);
    });

    this.result = this.add
      .text(800, 500, '花代幣拉一把！', { fontFamily: 'sans-serif', fontSize: '28px', color: '#f0dda0', fontStyle: 'bold' })
      .setOrigin(0.5);

    // 賠率表小抄
    this.add
      .text(800, 590,
        '三金/三葫蘆＝銀兩　三劍＝加攻擊牌　三毒/三火＝牌組附魔　三囧＝槓龜\n兩連＝小銀兩　全不同＝安慰銀兩',
        { fontFamily: 'sans-serif', fontSize: '15px', color: '#9c8a70', align: 'center', lineSpacing: 6 })
      .setOrigin(0.5);

    this.pullBtn = this.makeButton(680, 720, 240, 70, '拉一次（−1 代幣）', 0x5a2060, 0xb06cc0, () => this.pull());
    this.makeButton(940, 720, 200, 70, '離開', 0x3a2f22, 0xd9b45c, () => this.leave());

    this.events.on('shutdown', () => this.clearTimers());
    this.refresh();
  }

  refresh() {
    this.status.setText(`代幣 ${this.run.slotTokens}　　銀兩 ${this.run.money}`);
    const canPull = !this.spinning && this.run.slotTokens > 0;
    this.pullBtn.setAlpha(canPull ? 1 : 0.45);
  }

  pull() {
    if (this.spinning) return;
    if (!this.run.spendSlotToken()) {
      this.result.setText('沒有代幣了…');
      return;
    }
    this.spinning = true;
    this.result.setText('轉！');
    this.refresh();

    const { reels, reward } = spinSlot(this.run, this.run.rng);

    // 每個轉輪先快速亂跳，再依序停在結果符號上
    reels.forEach((sym, i) => {
      const flick = this.time.addEvent({
        delay: 60,
        loop: true,
        callback: () => {
          const rnd = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
          this.reels[i].setText(SLOT_SYMBOL_LABEL[rnd]);
        },
      });
      this.reelTimers.push(flick);

      const stop = this.time.delayedCall(600 + i * 380, () => {
        flick.remove();
        this.reels[i].setText(SLOT_SYMBOL_LABEL[sym]);
      });
      this.pendingTimers.push(stop);
    });

    // 最後一輪停好後結算
    const reveal = this.time.delayedCall(600 + 2 * 380 + 250, () => {
      applySlotReward(this.run, reward);
      this.result.setText(reward.label);
      this.spinning = false;
      this.reelTimers = [];
      this.pendingTimers = [];
      this.refresh();
    });
    this.pendingTimers.push(reveal);
  }

  leave() {
    this.clearTimers();
    if (this.back) this.scene.start(this.back.scene, this.back.data);
    else this.scene.start('RunMap', { run: this.run });
  }

  clearTimers() {
    for (const t of this.reelTimers) t.remove();
    for (const t of this.pendingTimers) t.remove();
    this.reelTimers = [];
    this.pendingTimers = [];
  }

  makeButton(x, y, w, h, label, fill, border, onClick) {
    const rect = this.add
      .rectangle(x, y, w, h, fill, 1)
      .setStrokeStyle(3, border)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(x, y, label, { fontFamily: 'sans-serif', fontSize: '22px', color: '#f5e6c8', fontStyle: 'bold' })
      .setOrigin(0.5);
    rect.on('pointerover', () => rect.setStrokeStyle(4, 0xffe1b0));
    rect.on('pointerout', () => rect.setStrokeStyle(3, border));
    rect.on('pointerdown', onClick);
    return rect;
  }
}
