import Phaser from 'phaser';
import { RunState } from '../core/RunState.js';
import { META_UPGRADE_IDS, getUpgrade } from '../core/MetaState.js';
import { loadMeta, saveMeta } from '../ui/metaStore.js';

/**
 * 門派據點（Phase 5，rogue-lite meta 樞紐）。也是開機場景與一局結束的落點。
 *   進來若帶 `run`（剛結束的一局）→ 依成績賺威望、存檔、顯示結果。
 *   花威望做永久升級（`MetaState`），影響之後每一局起始。
 *   「闖江湖」→ 用 meta 生一局新 RunState → RunMap。
 * 存檔在 localStorage（見 ui/metaStore.js）；core/MetaState 不碰瀏覽器。
 */
export class BaseScene extends Phaser.Scene {
  constructor() {
    super('Base');
  }

  create(data) {
    this.meta = loadMeta();
    this.upgradeObjs = [];

    let resultLine = '';
    if (data?.run) {
      const gained = this.meta.earnFromRun(data.run);
      saveMeta(this.meta);
      const won = data.run.outcome === 'won';
      resultLine = `${won ? '通關！江湖再會' : '敗北…江湖路遠'}　撐到第 ${data.run.day} 天　威望 ＋${gained}`;
    }

    this.cameras.main.setBackgroundColor('#12100f');
    this.add
      .text(800, 54, '⛩ 門派據點', { fontFamily: 'sans-serif', fontSize: '44px', color: '#f0dda0', fontStyle: 'bold' })
      .setOrigin(0.5);
    if (resultLine) {
      this.add.text(800, 116, resultLine, { fontFamily: 'sans-serif', fontSize: '22px', color: '#d8c9a8' }).setOrigin(0.5);
    }
    this.prestigeText = this.add
      .text(800, 168, '', { fontFamily: 'sans-serif', fontSize: '26px', color: '#d9b45c', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add
      .text(800, 208, '花門派威望做永久升級 —— 影響之後每一局的起始', { fontFamily: 'sans-serif', fontSize: '15px', color: '#9c8a70' })
      .setOrigin(0.5);

    this.msg = this.add.text(800, 720, '', { fontFamily: 'sans-serif', fontSize: '20px', color: '#f0dda0' }).setOrigin(0.5);

    this.makeButton(800, 806, 360, 72, '闖江湖', 0x5a2020, 0xc4583f, () => {
      this.scene.start('RunMap', { run: new RunState({ meta: this.meta }) });
    });

    this.refresh();
  }

  refresh() {
    this.prestigeText.setText(`門派威望：${this.meta.prestige}`);
    this.renderUpgrades();
  }

  renderUpgrades() {
    for (const o of this.upgradeObjs) o.destroy();
    this.upgradeObjs = [];
    const startY = 268;
    const rowH = 86;

    META_UPGRADE_IDS.forEach((id, i) => {
      const u = getUpgrade(id);
      const lvl = this.meta.level(id);
      const cost = this.meta.costOf(id);
      const maxed = cost == null;
      const affordable = this.meta.canBuy(id);
      const y = startY + i * rowH;

      const rect = this.add.rectangle(800, y, 920, 74, 0x241d17).setStrokeStyle(3, maxed ? 0x5a9e4a : 0x6a5540);
      const name = this.add
        .text(360, y - 15, `${u.name}　Lv ${lvl}/${u.maxLevel}`, { fontFamily: 'sans-serif', fontSize: '22px', color: '#f5e6c8', fontStyle: 'bold' })
        .setOrigin(0, 0.5);
      const desc = this.add
        .text(360, y + 15, u.desc, { fontFamily: 'sans-serif', fontSize: '15px', color: '#c9b896' })
        .setOrigin(0, 0.5);
      this.upgradeObjs.push(rect, name, desc);

      if (maxed) {
        this.upgradeObjs.push(
          this.add.text(1180, y, '已滿級', { fontFamily: 'sans-serif', fontSize: '20px', color: '#8fd06a', fontStyle: 'bold' }).setOrigin(0.5)
        );
      } else {
        const btn = this.add
          .rectangle(1180, y, 210, 54, 0x3a2f22)
          .setStrokeStyle(3, affordable ? 0xd9b45c : 0x4a3b2a)
          .setInteractive({ useHandCursor: true });
        const btxt = this.add
          .text(1180, y, `升級（威望 ${cost}）`, { fontFamily: 'sans-serif', fontSize: '18px', color: affordable ? '#f5e6c8' : '#6a5a48', fontStyle: 'bold' })
          .setOrigin(0.5);
        btn.setAlpha(affordable ? 1 : 0.6);
        btn.on('pointerover', () => rect && btn.setStrokeStyle(4, 0xffe1b0));
        btn.on('pointerout', () => btn.setStrokeStyle(3, affordable ? 0xd9b45c : 0x4a3b2a));
        btn.on('pointerdown', () => this.buy(id));
        this.upgradeObjs.push(btn, btxt);
      }
    });
  }

  buy(id) {
    if (this.meta.buyUpgrade(id)) {
      saveMeta(this.meta);
      this.flash(`升級了：${getUpgrade(id).name}`);
    } else {
      this.flash('門派威望不足');
    }
    this.refresh();
  }

  flash(text) {
    this.msg.setText(text);
    this.msg.setAlpha(1);
    this.tweens.add({ targets: this.msg, alpha: 0, delay: 900, duration: 600 });
  }

  makeButton(x, y, w, h, label, fill, border, onClick) {
    const rect = this.add.rectangle(x, y, w, h, fill, 1).setStrokeStyle(3, border).setInteractive({ useHandCursor: true });
    this.add.text(x, y, label, { fontFamily: 'sans-serif', fontSize: '26px', color: '#f5e6c8', fontStyle: 'bold' }).setOrigin(0.5);
    rect.on('pointerover', () => rect.setStrokeStyle(4, 0xffe1b0));
    rect.on('pointerout', () => rect.setStrokeStyle(3, border));
    rect.on('pointerdown', onClick);
    return rect;
  }
}
