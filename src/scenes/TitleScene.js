import Phaser from 'phaser';
import { makeMenuButton } from '../ui/menuChrome.js';

/** 開機主題畫面。只負責定調與進入據點，不建立 run。 */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    this.drawInkTitleBackdrop();

    this.add
      .text(390, 270, '活俠傳', {
        fontFamily: 'serif', fontSize: '112px', color: '#242523', fontStyle: 'bold',
        stroke: '#242523', strokeThickness: 2,
      })
      .setOrigin(0.5);
    this.add
      .text(405, 382, '江 湖 無 雙', {
        fontFamily: 'serif', fontSize: '42px', color: '#6d312b', fontStyle: 'bold', letterSpacing: 14,
      })
      .setOrigin(0.5);
    this.add
      .text(400, 444, '牌組構築 × 割草敵陣', {
        fontFamily: 'sans-serif', fontSize: '18px', color: '#57574f', letterSpacing: 3,
      })
      .setOrigin(0.5);

    // 題款朱印，呼應水墨卷軸的落款，但不直接使用參考圖資產。
    this.add.rectangle(565, 350, 48, 78, 0x9e3328, 0.9).setStrokeStyle(2, 0x7d281f);
    this.add
      .text(565, 350, '唐\n門', { fontFamily: 'serif', fontSize: '20px', color: '#f2dfc3', align: 'center', lineSpacing: 4 })
      .setOrigin(0.5);

    const start = () => this.scene.start('Base');
    makeMenuButton(this, {
      x: 815, y: 505, w: 330, h: 78, label: '開始遊戲', sub: '進入唐門據點',
      fill: 0x3f4642, border: 0x7d3930, onClick: start, fontSize: 27,
    });
    this.input.keyboard?.once('keydown-ENTER', start);

    this.add
      .text(34, 866, '同人作品 · 開發版本', { fontFamily: 'sans-serif', fontSize: '13px', color: '#716e64' })
      .setOrigin(0, 0.5);
  }

  drawInkTitleBackdrop() {
    this.cameras.main.setBackgroundColor('#d8d0ba');
    this.add.rectangle(800, 450, 1600, 900, 0xd8d0ba);

    // 淡墨遠山與霧：大量半透明輪廓保留水彩邊緣與中央留白。
    const wash = this.add.graphics();
    wash.fillStyle(0x8c9a91, 0.22);
    wash.fillPoints([
      { x: 0, y: 520 }, { x: 120, y: 215 }, { x: 250, y: 410 }, { x: 390, y: 160 },
      { x: 535, y: 455 }, { x: 650, y: 330 }, { x: 790, y: 500 }, { x: 790, y: 900 }, { x: 0, y: 900 },
    ], true);
    wash.fillStyle(0x60746e, 0.18);
    wash.fillPoints([
      { x: 950, y: 420 }, { x: 1090, y: 220 }, { x: 1190, y: 365 }, { x: 1360, y: 105 },
      { x: 1600, y: 220 }, { x: 1600, y: 900 }, { x: 1040, y: 900 },
    ], true);
    wash.fillStyle(0x536762, 0.16);
    wash.fillCircle(1430, 85, 220);
    wash.fillCircle(1550, 180, 245);
    wash.fillCircle(1325, 175, 165);
    wash.fillStyle(0xbcc2b5, 0.34);
    wash.fillEllipse(800, 520, 1040, 250);
    wash.fillEllipse(695, 680, 1250, 210);

    // 右側崖面與俠客剪影。
    wash.fillStyle(0x33443f, 0.72);
    wash.fillPoints([
      { x: 1110, y: 900 }, { x: 1165, y: 630 }, { x: 1260, y: 560 }, { x: 1370, y: 585 },
      { x: 1600, y: 520 }, { x: 1600, y: 900 },
    ], true);
    const hero = this.add.graphics();
    hero.fillStyle(0x151a18, 1);
    hero.fillCircle(1290, 446, 20);
    hero.fillTriangle(1260, 478, 1328, 478, 1305, 590);
    hero.fillEllipse(1292, 525, 58, 120);
    hero.lineStyle(7, 0x151a18, 1);
    hero.lineBetween(1268, 500, 1238, 568);
    hero.lineBetween(1316, 505, 1348, 552);
    hero.lineBetween(1279, 575, 1258, 642);
    hero.lineBetween(1306, 575, 1320, 640);
    hero.lineStyle(4, 0x242b28, 1);
    hero.lineBetween(1218, 472, 1218, 655);
    hero.lineBetween(1208, 486, 1228, 486);
  }
}
