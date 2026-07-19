import Phaser from 'phaser';
import { RunState } from '../core/RunState.js';

/**
 * 一局結束（通關或敗北）。Phase 1 的「據點」佔位：顯示結果與戰績，一鍵再闖。
 * 之後這裡會長成真正的據點/門派經營（跨 run 永久解鎖）。
 */
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create(data) {
    const run = data?.run;
    const won = data?.result === 'won' || data?.cleared;

    this.cameras.main.setBackgroundColor(won ? '#16210f' : '#210f0f');

    this.add
      .text(800, 300, won ? '通關！江湖再會' : '敗北 · 江湖路遠', {
        fontFamily: 'sans-serif',
        fontSize: '52px',
        color: won ? '#a8d878' : '#e08a7a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    if (run) {
      this.add
        .text(800, 400, `撐到第 ${run.day} 天　　銀兩 ${run.money}　　拉霸代幣 ${run.slotTokens}`, {
          fontFamily: 'sans-serif',
          fontSize: '22px',
          color: '#d8c9a8',
        })
        .setOrigin(0.5);
    }

    const rect = this.add
      .rectangle(800, 560, 360, 74, 0x3a2f22, 1)
      .setStrokeStyle(3, 0xd9b45c)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(800, 560, '再闖江湖', { fontFamily: 'sans-serif', fontSize: '26px', color: '#f5e6c8', fontStyle: 'bold' })
      .setOrigin(0.5);
    rect.on('pointerover', () => rect.setStrokeStyle(4, 0xffe1b0));
    rect.on('pointerout', () => rect.setStrokeStyle(3, 0xd9b45c));
    rect.on('pointerdown', () => this.scene.start('RunMap', { run: new RunState() }));
  }
}
