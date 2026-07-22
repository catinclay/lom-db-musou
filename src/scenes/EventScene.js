import Phaser from 'phaser';
import { GAME_ACTION, GAME_PHASE, GameSession } from '../core/GameSession.js';
import { getEventDef, choiceLabel } from '../core/EventLibrary.js';
import { transitionIn } from '../ui/sceneTransitions.js';
import { transitionToSessionPhase } from '../ui/sessionNavigation.js';

/**
 * 奇遇·江湖事件：演一段敘事 ＋ 幾個選項。
 * GameSession 進入 event phase 後來到這裡；Scene 只呈現 session.context 的事件。
 * 選項送進 `GameSession.dispatch`：立即事件 → 顯示結果＋繼續回地圖；
 * 觸發戰鬥 → 直接進 Battle（戰後 finishBattle 標記節點完成）。
 */
export class EventScene extends Phaser.Scene {
  constructor() {
    super('Event');
  }

  create(data) {
    this.session = data?.session ?? new GameSession({ run: data?.run });
    this.run = this.session.run;
    this.node = this.session.context.node ?? data?.node;
    this.event = this.session.context.event ?? data?.event ?? getEventDef(this.node.eventId);
    this.dynObjs = [];

    this.cameras.main.setBackgroundColor('#141018');
    this.status = this.add
      .text(800, 56, '', { fontFamily: 'sans-serif', fontSize: '18px', color: '#9c8a70' })
      .setOrigin(0.5);
    this.add
      .text(800, 120, this.event.name, { fontFamily: 'sans-serif', fontSize: '40px', color: '#f0dda0', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add
      .text(800, 240, this.event.text, {
        fontFamily: 'sans-serif', fontSize: '22px', color: '#d8c9a8',
        align: 'center', wordWrap: { width: 1040 }, lineSpacing: 8,
      })
      .setOrigin(0.5);

    this.refreshStatus();
    this.renderChoices();
    transitionIn(this);
  }

  refreshStatus() {
    this.status.setText(`血量 ${this.run.hp}/${this.run.maxHp}　　銀兩 ${this.run.money}`);
  }

  renderChoices() {
    for (const o of this.dynObjs) o.destroy();
    this.dynObjs = [];
    const startY = 430;
    this.event.choices.forEach((c, i) => {
      const y = startY + i * 96;
      const rect = this.add
        .rectangle(800, y, 640, 78, 0x2a2233)
        .setStrokeStyle(3, 0x9b6cc0)
        .setInteractive({ useHandCursor: true });
      const txt = this.add
        .text(800, c.desc ? y - 13 : y, choiceLabel(c, this.run), {
          fontFamily: 'sans-serif', fontSize: '24px', color: '#f5e6c8', fontStyle: 'bold',
        })
        .setOrigin(0.5);
      this.dynObjs.push(rect, txt);
      if (c.desc) {
        this.dynObjs.push(
          this.add.text(800, y + 18, c.desc, { fontFamily: 'sans-serif', fontSize: '15px', color: '#c9b896' }).setOrigin(0.5)
        );
      }
      rect.on('pointerover', () => rect.setStrokeStyle(4, 0xffe1b0));
      rect.on('pointerout', () => rect.setStrokeStyle(3, 0x9b6cc0));
      rect.on('pointerdown', () => this.choose(i));
    });
  }

  choose(i) {
    const action = this.session.dispatch(GAME_ACTION.CHOOSE_EVENT, { index: i });
    if (!action.ok) return;
    if (this.session.phase === GAME_PHASE.BATTLE) {
      transitionToSessionPhase(this, this.session);
      return;
    }
    this.showResult(action.result?.text ?? '……');
  }

  showResult(text) {
    for (const o of this.dynObjs) o.destroy();
    this.dynObjs = [];
    this.refreshStatus();

    this.add
      .text(800, 470, text, {
        fontFamily: 'sans-serif', fontSize: '24px', color: '#f0dda0',
        align: 'center', wordWrap: { width: 1000 }, lineSpacing: 8,
      })
      .setOrigin(0.5);
    const rect = this.add
      .rectangle(800, 640, 220, 66, 0x3a2f22)
      .setStrokeStyle(3, 0xd9b45c)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(800, 640, '繼續', { fontFamily: 'sans-serif', fontSize: '24px', color: '#f5e6c8', fontStyle: 'bold' })
      .setOrigin(0.5);
    rect.on('pointerover', () => rect.setStrokeStyle(4, 0xffe1b0));
    rect.on('pointerout', () => rect.setStrokeStyle(3, 0xd9b45c));
    rect.on('pointerdown', () => {
      const action = this.session.dispatch(GAME_ACTION.CONTINUE_EVENT);
      if (action.ok) transitionToSessionPhase(this, this.session);
    });
  }
}
