import Phaser from 'phaser';
import { RunState } from '../core/RunState.js';
import { getRelicDef } from '../core/RelicLibrary.js';
import { getEventDef } from '../core/EventLibrary.js';
import { DeckOverlay } from '../ui/DeckOverlay.js';

/**
 * 白天的江湖行程（run 的樞紐場景）。
 *   一輪「三選一」：擲 3 個選項給玩家挑 1 個做（battle/elite 開戰、event 進奇遇、inn 進客棧），
 *   做完補下一輪，最多 maxRoundsPerDay 輪。隨時可「入夜決戰」召尾王（提早給速通代幣）。
 * 所有權威狀態都在 RunState；這裡只讀它、把玩家操作轉成 run 的方法呼叫。
 */
const KIND_STYLE = {
  battle: { label: '廝殺', color: 0x6b2b25, border: 0xc4583f },
  elite: { label: '精英仇家', color: 0x4a2c5c, border: 0x9b6cc0 },
  event: { label: '奇遇', color: 0x2c4a30, border: 0x5aa06a },
  inn: { label: '客棧', color: 0x5a4520, border: 0xd9b45c },
};
const BOSS_LABEL = { elite: '今夜小王', boss: '今夜魔王', final: '最終魔王決戰' };

export class RunMapScene extends Phaser.Scene {
  constructor() {
    super('RunMap');
  }

  create(data) {
    this.run = data?.run ?? new RunState();
    this.nodeObjs = [];

    this.cameras.main.setBackgroundColor('#14100e');
    this.add.rectangle(800, 90, 1600, 180, 0x1c1712).setDepth(-1);

    this.title = this.add
      .text(800, 48, '', { fontFamily: 'sans-serif', fontSize: '34px', color: '#f5e6c8', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.stats = this.add
      .text(800, 100, '', { fontFamily: 'sans-serif', fontSize: '19px', color: '#d8c9a8' })
      .setOrigin(0.5);
    this.hint = this.add
      .text(800, 150, '', { fontFamily: 'sans-serif', fontSize: '15px', color: '#9c8a70' })
      .setOrigin(0.5);
    this.attrText = this.add
      .text(800, 184, '', { fontFamily: 'sans-serif', fontSize: '16px', color: '#9fd0e8' })
      .setOrigin(0.5);
    this.relicText = this.add
      .text(800, 216, '', { fontFamily: 'sans-serif', fontSize: '16px', color: '#c9a8e0' })
      .setOrigin(0.5);

    // 入夜決戰按鈕
    this.bossBtn = this.makeButton(800, 800, 420, 76, '', 0x5a2020, 0xc4583f, () => this.goBoss());

    // 隨時檢視本局牌組
    this.makeButton(200, 60, 210, 56, '檢視牌組', 0x2c4a30, 0x5aa06a,
      () => new DeckOverlay(this, this.run, { mode: 'view', title: '目前牌組' }));

    this.run.ensureOffer(); // 補一輪三選一（達上限則空）

    this.renderHud();
    this.renderOffer();
  }

  renderHud() {
    const r = this.run;
    this.title.setText(`第 ${r.day} 天 · 江湖行程`);
    this.stats.setText(
      `主角 ${r.hp}/${r.maxHp}　　銀兩 ${r.money}　　拉霸代幣 ${r.slotTokens}`
    );
    this.hint.setText(
      `今日已探 ${r.eventsDoneToday} 樁（還可 ${r.roundsLeft} 樁）　挑一樁去做；探越多越強，但入夜尾王的敵潮也越大`
    );
    const bk = r.dayBossKind();
    this.bossTxt?.setText(`入夜決戰 — ${BOSS_LABEL[bk] ?? bk}`);

    const a = r.attrs;
    this.attrText.setText(`境界上限 ${a.maxRealm}　內力 ${a.energyPerTurn}　起手 ${a.startingHandSize}`);

    const relics = r.relics.map((id) => getRelicDef(id).name);
    this.relicText.setText(relics.length ? `遺物：${relics.join('　')}` : '遺物：（無）');
  }

  /** 本輪三選一：三張並排的選項卡，點一張去做。offer 為空（達上限）＝只能入夜。 */
  renderOffer() {
    for (const o of this.nodeObjs) o.destroy();
    this.nodeObjs = [];

    const offer = this.run.offer ?? [];
    if (!offer.length) {
      this.nodeObjs.push(
        this.add
          .text(800, 460, '今日事件已盡 —— 該入夜決戰了。', {
            fontFamily: 'sans-serif', fontSize: '26px', color: '#d9b45c', fontStyle: 'bold',
          })
          .setOrigin(0.5)
      );
      return;
    }

    const cardW = 360;
    const cardH = 300;
    const gap = 60;
    const totalW = offer.length * cardW + (offer.length - 1) * gap;
    const startX = 800 - totalW / 2 + cardW / 2;
    const y = 470;

    offer.forEach((node, i) => {
      const x = startX + i * (cardW + gap);
      const style = KIND_STYLE[node.kind] ?? KIND_STYLE.battle;

      const rect = this.add
        .rectangle(x, y, cardW, cardH, style.color, 1)
        .setStrokeStyle(4, style.border)
        .setInteractive({ useHandCursor: true });
      const title = this.add
        .text(x, y - 70, this.offerTitle(node), { fontFamily: 'sans-serif', fontSize: '32px', color: '#f5e6c8', fontStyle: 'bold' })
        .setOrigin(0.5);
      const sub = this.add
        .text(x, y + 30, this.offerSub(node), {
          fontFamily: 'sans-serif', fontSize: '17px', color: '#e8dcc4', align: 'center', wordWrap: { width: cardW - 44 }, lineSpacing: 6,
        })
        .setOrigin(0.5);

      rect.on('pointerover', () => rect.setStrokeStyle(5, 0xffe1b0));
      rect.on('pointerout', () => rect.setStrokeStyle(4, style.border));
      rect.on('pointerdown', () => this.pick(i));

      this.nodeObjs.push(rect, title, sub);
    });
  }

  offerTitle(node) {
    if (node.kind === 'event') return getEventDef(node.eventId).name;
    return KIND_STYLE[node.kind]?.label ?? '廝殺';
  }

  offerSub(node) {
    if (node.kind === 'event') return '（奇遇 · 有選項）';
    if (node.kind === 'elite') return '（硬仗 · 較好報酬）';
    if (node.kind === 'inn') return '（買招 · 歇息 · 刪牌 · 拉霸）';
    return '（尋常廝殺）';
  }

  pick(index) {
    const res = this.run.takeOffer(index);
    if (!res) return;
    if (res.type === 'battle') {
      this.scene.start('Battle', { run: this.run, config: res.config });
    } else if (res.type === 'inn') {
      this.scene.start('Shop', { run: this.run, shop: res.shop });
    } else if (res.type === 'event') {
      this.scene.start('Event', { run: this.run, node: res.node, event: res.event });
    }
  }

  goBoss() {
    const res = this.run.callBoss();
    if (res.speedrunTokens > 0) {
      this.flash(`速通！拉霸代幣 ＋${res.speedrunTokens}`, 0xd9b45c);
      this.time.delayedCall(650, () => this.scene.start('Battle', { run: this.run, config: res.config }));
    } else {
      this.scene.start('Battle', { run: this.run, config: res.config });
    }
  }

  makeButton(x, y, w, h, label, fill, border, onClick) {
    const rect = this.add
      .rectangle(x, y, w, h, fill, 1)
      .setStrokeStyle(3, border)
      .setInteractive({ useHandCursor: true });
    const txt = this.add
      .text(x, y, label, { fontFamily: 'sans-serif', fontSize: '24px', color: '#f5e6c8', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.bossTxt = txt;
    rect.on('pointerover', () => rect.setStrokeStyle(4, 0xffe1b0));
    rect.on('pointerout', () => rect.setStrokeStyle(3, border));
    rect.on('pointerdown', onClick);
    return rect;
  }

  flash(text, color) {
    const t = this.add
      .text(800, 620, text, {
        fontFamily: 'sans-serif',
        fontSize: '30px',
        color: `#${color.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(6000);
    this.tweens.add({ targets: t, y: t.y - 60, alpha: 0, duration: 900, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }
}
