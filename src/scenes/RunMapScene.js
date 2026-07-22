import Phaser from 'phaser';
import { GAME_ACTION, GameSession } from '../core/GameSession.js';
import { getRelicDef } from '../core/RelicLibrary.js';
import { getEventDef } from '../core/EventLibrary.js';
import { DeckOverlay } from '../ui/DeckOverlay.js';
import { transitionIn } from '../ui/sceneTransitions.js';
import { transitionToSessionPhase } from '../ui/sessionNavigation.js';
import { TUNING } from '../config/tuning.js';
import { energyPips } from '../ui/format.js';

/**
 * 白天的江湖行程（run 的樞紐場景）。
 *   每個時辰「三選一」：擲 3 個選項給玩家挑 1 個做（戰鬥、奇遇或各種服務設施），
 *   做完推進到下一時辰，最多 maxRoundsPerDay 個時辰。隨時可「入夜決戰」召尾王（提早給速通代幣）。
 * 所有權威狀態與下一步都由 GameSession 決定；這裡只畫狀態並送 action。
 */
const KIND_STYLE = {
  battle: { label: '廝殺', color: 0x6b2b25, border: 0xc4583f },
  elite: { label: '精英仇家', color: 0x4a2c5c, border: 0x9b6cc0 },
  event: { label: '奇遇', color: 0x2c4a30, border: 0x5aa06a },
  inn: { label: '客棧', color: 0x5a4520, border: 0xd9b45c },
  merchant: { label: '江湖商販', color: 0x4c3a24, border: 0xc99655 },
  dojo: { label: '武館', color: 0x243d48, border: 0x67a2b8 },
  casino: { label: '賭坊', color: 0x4a2c5c, border: 0x9b6cc0 },
};
const BOSS_LABEL = { elite: '今夜小王', boss: '今夜魔王', final: '最終魔王決戰' };

export class RunMapScene extends Phaser.Scene {
  constructor() {
    super('RunMap');
  }

  create(data) {
    this.session = data?.session ?? new GameSession({ run: data?.run });
    this.run = this.session.run;
    this.nodeObjs = [];
    this._bossStarting = false;

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

    this.run.ensureOffer(); // 補本時辰的三選一（達上限則空）

    // 尚有時辰時是次要出口；時辰用盡後移到中央放大，成為唯一主流程選擇。
    const bossLayout = this.run.offer?.length
      ? TUNING.run.mapLayout.bossButton.normal
      : TUNING.run.mapLayout.bossButton.exhausted;
    this.bossBtn = this.makeButton(
      bossLayout.x, bossLayout.y, bossLayout.width, bossLayout.height,
      '', 0x5a2020, 0xc4583f, () => this.goBoss(), bossLayout.fontSize
    );
    this.bossTxt = this.bossBtn.txt;

    // 隨時檢視本局牌組
    this.makeButton(200, 60, 210, 56, '檢視牌組', 0x2c4a30, 0x5aa06a,
      () => new DeckOverlay(this, this.run, { mode: 'view', title: '目前牌組' }));

    this.renderHud();
    this.renderOffer();
    transitionIn(this);
  }

  renderHud() {
    const r = this.run;
    const timeLabel = r.roundsLeft > 0 ? `第 ${r.eventsDoneToday + 1} 時辰` : '日暮';
    this.title.setText(`第 ${r.day} 天 · ${timeLabel}`);
    this.stats.setText(
      `主角 ${r.hp}/${r.maxHp}　　銀兩 ${r.money}　　拉霸代幣 ${r.slotTokens}`
    );
    this.hint.setText(r.roundsLeft > 0
      ? `今日已過 ${r.eventsDoneToday} 時辰（尚餘 ${r.roundsLeft} 時辰）　選一處前往；歷練越多越強，但入夜尾王的敵潮也越大`
      : '夜色已深，今日已無別處可去——整裝迎戰。');
    const bk = r.dayBossKind();
    this.bossTxt?.setText(`入夜決戰 — ${BOSS_LABEL[bk] ?? bk}`);

    const a = r.attrs;
    this.attrText.setText(
      `階級上限 ${a.maxRank}　內力 ${energyPips(a.energyPerTurn, this.session.tuning.energyUnit)}　起手 ${a.startingHandSize}`
    );

    const relics = r.relics.map((id) => getRelicDef(id).name);
    this.relicText.setText(relics.length ? `遺物：${relics.join('　')}` : '遺物：（無）');
  }

  /** 本時辰三選一：三張並排的選項卡，點一張去做。offer 為空（達上限）＝只能入夜。 */
  renderOffer() {
    for (const o of this.nodeObjs) o.destroy();
    this.nodeObjs = [];

    const offer = this.run.offer ?? [];
    if (!offer.length) {
      const prompt = TUNING.run.mapLayout.exhaustedPrompt;
      this.nodeObjs.push(
        this.add
          .text(prompt.x, prompt.y, '今日時辰已盡', {
            fontFamily: 'sans-serif', fontSize: `${prompt.fontSize}px`, color: '#d9b45c', fontStyle: 'bold',
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
    if (node.kind === 'event') return '路上似乎發生了什麼……';
    if (node.kind === 'elite') return '前方傳來兵刃交擊之聲';
    if (node.kind === 'inn') return '燈火溫暖，正好歇口氣';
    if (node.kind === 'merchant') return '貨擔上壓著招式與奇物';
    if (node.kind === 'dojo') return '師傅願替你梳理所學';
    if (node.kind === 'casino') return '銅輪聲從簾後喀啦作響';
    return '幾名江湖人擋住了去路';
  }

  pick(index) {
    const res = this.session.dispatch(GAME_ACTION.CHOOSE_OFFER, { index });
    if (res.ok) transitionToSessionPhase(this, this.session);
  }

  goBoss() {
    if (this._bossStarting) return;
    this._bossStarting = true;
    this.input.enabled = false;
    const res = this.session.dispatch(GAME_ACTION.CALL_BOSS);
    if (!res.ok) return;
    if (res.speedrunTokens > 0) {
      this.flash(`速通！拉霸代幣 ＋${res.speedrunTokens}`, 0xd9b45c);
      this.time.delayedCall(650, () => transitionToSessionPhase(this, this.session));
    } else {
      transitionToSessionPhase(this, this.session);
    }
  }

  makeButton(x, y, w, h, label, fill, border, onClick, fontSize = 24) {
    const rect = this.add
      .rectangle(x, y, w, h, fill, 1)
      .setStrokeStyle(3, border)
      .setInteractive({ useHandCursor: true });
    const txt = this.add
      .text(x, y, label, { fontFamily: 'sans-serif', fontSize, color: '#f5e6c8', fontStyle: 'bold' })
      .setOrigin(0.5);
    rect.on('pointerover', () => rect.setStrokeStyle(4, 0xffe1b0));
    rect.on('pointerout', () => rect.setStrokeStyle(3, border));
    rect.on('pointerdown', onClick);
    rect.txt = txt;
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
