import Phaser from 'phaser';
import { GAME_ACTION, GAME_PHASE, GameSession } from '../core/GameSession.js';
import { EVENT } from '../core/events.js';
import { getRelicDef } from '../core/RelicLibrary.js';
import { DeckOverlay } from '../ui/DeckOverlay.js';
import { HandView } from '../ui/HandView.js';
import { MergeAnimator } from '../ui/MergeAnimator.js';
import { DragController } from '../ui/DragController.js';
import { DebugPanel } from '../ui/DebugPanel.js';
import { FormationView } from '../ui/FormationView.js';
import { project } from '../ui/perspective.js';
import { ensureCardTextures } from '../ui/cardTextures.js';
import { ensureEnemyTextures, PLAYER_TEX } from '../ui/enemyTextures.js';
import { comboLabel, energyPips, inspirationGauge, rankLabel } from '../ui/format.js';
import { stopTweensOf, tweenTo } from '../ui/tweens.js';
import { transitionIn } from '../ui/sceneTransitions.js';
import { transitionToSessionPhase } from '../ui/sessionNavigation.js';
import { TUNING } from '../config/tuning.js';

const BATTLEFIELD_Y = 600;
const HAND_CENTER_X = 800;
const HAND_BASE_Y = 790;

/**
 * 一場戰鬥的場景（割草）。牌組、血量、敵潮規模全由 RunState 注入的配置決定：
 *   GameSession 進入 battle phase 後，由 sessionNavigation 帶同一個 session 進場
 * 打贏 → 回 RunMap 推進日程；打輸（血量歸零）/ 通關 → 回 Base（門派據點）。
 *
 * 戰鬥內部的接線（core↔UI、合成劇本、敵陣演出）沿用原沙盒，不動。
 */
export class BattleScene extends Phaser.Scene {
  constructor() {
    super('Battle');
  }

  create(data) {
    // 獨立啟動（沒帶 session）時仍透過 GameSession 開一場尾王，方便單場調試。
    this.session = data?.session ?? new GameSession({ run: data?.run });
    if (this.session.phase !== GAME_PHASE.BATTLE) {
      if (data?.config) this.session.beginBattle(data.config, { source: 'debug' });
      else this.session.dispatch(GAME_ACTION.CALL_BOSS);
    }
    this.run = this.session.run;
    this.config = this.session.context.config;
    this._concluded = false;

    ensureCardTextures(this);
    ensureEnemyTextures(this);
    this.drawBackdrop();
    this.drawRankLines();

    this.battle = this.session.battle;
    this.presentedInspiration = 0;

    this.formationView = new FormationView(this);
    this.formationView.attackOrigin = { x: 250, y: 720 }; // 暗器從主角這邊飛出
    this.drawPlayerAndHud();

    this.handView = new HandView(this, { centerX: HAND_CENTER_X, baseY: HAND_BASE_Y });
    this.animator = new MergeAnimator(this, this.handView, {
      deckPos: { x: HAND_CENTER_X + 620, y: HAND_BASE_Y + 40 },
      discardPos: { x: HAND_CENTER_X - 620, y: HAND_BASE_Y + 40 },
    });

    this.animator.onFizzle = () => this.flash('牌庫已空', 0x8d7a5e);
    this.animator.onInspiration = (ev) => this.playInspirationStep(ev);

    this.drag = new DragController(this, this.handView, {
      battlefieldY: BATTLEFIELD_Y,
      getCard: (uid) => this.battle.hand.findByUid(uid),
      onPlay: (uid) => this.playCard(uid),
      onPump: (wangxingUid, targetUid) => this.pumpCard(wangxingUid, targetUid),
    });

    // 玩家攻擊命中敵人 → 打擊特效、閃光、傷害數字、倒地
    this.battle.bus.on(EVENT.ENEMIES_HIT, (r) => {
      if (r.knockback && r.waveLayouts?.length) {
        this.formationView.playKnockbackWaves(r.hits, r.waveLayouts, this.battle.formation);
      } else {
        this.formationView.playHitFlourish(r.target, r.hits, r.areas, this.battle.formation);
        this.formationView.flashAndPop(r.hits);
      }
    });
    this.battle.bus.on(EVENT.STATUS_TICKED, (r) => this.formationView.playStatusTick(r));
    // 遺物在回合開始可能給敵人上狀態 —— 刷新一下敵陣狀態點（sprite 已存在時才有作用）
    this.battle.bus.on(EVENT.TURN_STARTED, () => this.formationView.refresh());
    // 清場後由玩家主動叫陣時，一次同步整個補充波。
    this.battle.bus.on(EVENT.ENEMIES_ADVANCED, (r) => {
      if (r.challenge) {
        this.formationView.sync(this.battle.formation);
        this.flash('再來啊！', 0xd9b45c);
      }
    });
    this.battle.bus.on(EVENT.ARMOR_GAINED, (r) =>
      this.flash(`＋${r.armor} 甲${r.combo.multiplier > 1 ? `  ×${r.combo.multiplier}` : ''}`, 0x4a8fb8)
    );
    this.battle.bus.on(EVENT.PLAYER_HIT, (r) => this.onPlayerHit(r));
    this.battle.bus.on(EVENT.CARD_PLAY_REJECTED, () => this.flash('內力不足', 0xc4583f));

    // 抽牌批次化：連點累積張數，短窗口後一次抽完
    this.pendingDraws = 0;
    this.drawPumpRunning = false;
    this.drawTimer = null;

    this.panel = new DebugPanel({
      onSpawn: (defId, opts) => this.runTranscript(this.session.debug('addCard', { defId, options: opts }).transcript),
      onDraw: () => this.requestDraw(),
      onEndTurn: () => this.endTurnFlow(),
      onEnergy: (delta) => this.session.debug('energy', { delta }),
      onStatus: (id) => {
        this.session.debug('status', { id });
        this.formationView.refresh();
      },
      onRestart: () => this.restart(),
      onSpeed: (v) => {
        this.handView.speed = v;
        this.formationView.speed = v;
      },
    });

    this.events.on('shutdown', () => {
      this.drawTimer?.remove();
      this.panel.destroy();
    });
    this.resetBattlePresentation(this.session.openingTranscript);
    transitionIn(this);
  }

  update() {
    if (this.battle.hand) {
      this.panel.update(this.battle);
      this.updateHud();
      this.handView.updateCardHints(this.battle.combo.realm, this.battle.energy);
      // 演出進行中不讓按結束回合（避免打斷連鎖）
      this.endTurnBtn?.setAlpha(this.animator.playing || this._concluded ? 0.4 : 1);
      const canChallenge = this.battle.awaitingWaveChoice && this.battle.formation.isEmpty && this.battle.hasReinforcements;
      this.setSideButtonVisible(this.challengeBtn, canChallenge);
      this.challengeBtn?.setAlpha(this.animator.playing || this._concluded ? 0.4 : 1);
    }
  }

  /** 這場戰鬥的目標提示（波數/尾王類別），顯示在頂端。 */
  battleBanner() {
    const wavesLeft = this.battle.wavesLeft;
    const w = wavesLeft === Infinity ? '∞' : wavesLeft;
    const p = this.run.pending;
    const kind = p?.kind ?? '—';
    const label = { elite: '小王', boss: '魔王', final: '最終魔王', battle: '廝殺' }[kind] ?? kind;
    const rows = this.battle.rowsLeftInWave;
    return `第 ${this.run.day} 天 · ${label}　補充波剩 ${w}　·　本波未進場 ${rows} 排`;
  }

  drawRankLines() {
    const { lanes, maxRank, view } = TUNING.combat;
    const g = this.add.graphics().setDepth(-70);
    for (let r = maxRank; r >= 0; r--) {
      const l = project(r, 0, lanes, view);
      const rt = project(r, lanes - 1, lanes, view);
      const x0 = l.x - 50 * l.scale;
      const x1 = rt.x + 50 * rt.scale;
      if (r === 0) g.lineStyle(4, 0x9c3a2f, 0.7);
      else g.lineStyle(2, 0x4a3a2a, 0.3);
      g.beginPath();
      g.moveTo(x0, l.y);
      g.lineTo(x1, l.y);
      g.strokePath();
    }
    const c = project(0, 0, lanes, view);
    this.add
      .text(c.x - 60 * c.scale, c.y, '攻擊線', {
        fontFamily: 'sans-serif',
        fontSize: '15px',
        color: '#b8564a',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0.5)
      .setDepth(-69);
  }

  drawBackdrop() {
    const { horizonY } = TUNING.combat.view;
    const g = this.add.graphics().setDepth(-100);
    g.fillStyle(0x0e0b09, 1);
    g.fillRect(0, 0, 1600, horizonY);
    const bands = 10;
    const lerp = (a, b, t) => Math.round(a + (b - a) * t);
    const near = { r: 0x24, g: 0x1a, b: 0x13 };
    const far = { r: 0x15, g: 0x11, b: 0x0f };
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const y0 = horizonY + ((900 - horizonY) * i) / bands;
      const y1 = horizonY + ((900 - horizonY) * (i + 1)) / bands;
      const col = (lerp(far.r, near.r, t) << 16) | (lerp(far.g, near.g, t) << 8) | lerp(far.b, near.b, t);
      g.fillStyle(col, 1);
      g.fillRect(0, y0, 1600, y1 - y0 + 1);
    }
    g.fillStyle(0x3a2a1e, 0.5);
    g.fillRect(0, horizonY - 2, 1600, 3);

    const label = { fontFamily: 'sans-serif', fontSize: '14px', color: '#5a4a38' };
    this.add.text(HAND_CENTER_X - 680, HAND_BASE_Y + 20, '棄牌堆', label).setDepth(10);
    this.add.text(HAND_CENTER_X + 580, HAND_BASE_Y + 20, '牌庫', label).setDepth(10);
    this.add
      .text(1584, BATTLEFIELD_Y - 10, '↑ 拉過這條線 ＝ 出招　　忘形拉到別張牌上 ＝ 階級＋1', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#5a4a38',
      })
      .setOrigin(1, 1)
      .setDepth(10);
  }

  drawPlayerAndHud() {
    this.player = this.add.image(215, 940, PLAYER_TEX).setOrigin(0.5, 1).setDepth(-5);

    const barX = 40;
    const barY = 690;
    const barW = 300;
    this.add.rectangle(barX, barY, barW, 22, 0x000000, 0.5).setOrigin(0, 0.5).setDepth(5000);
    this.hpBar = this.add.rectangle(barX + 2, barY, barW - 4, 16, 0xc4583f).setOrigin(0, 0.5).setDepth(5001);
    this.hpText = this.add
      .text(barX + barW / 2, barY, '', { fontFamily: 'sans-serif', fontSize: '15px', color: '#fff', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(5002);
    this.hpBarW = barW - 4;

    this.energyText = this.add
      .text(barX, barY + 22, '', { fontFamily: 'sans-serif', fontSize: '17px', color: '#9fd0e8', fontStyle: 'bold' })
      .setOrigin(0, 0)
      .setDepth(5002);
    this.inspirationText = this.add
      .text(barX, barY + 46, '', { fontFamily: 'sans-serif', fontSize: '17px', color: '#d9b45c', fontStyle: 'bold' })
      .setOrigin(0, 0)
      .setDepth(5002);

    // 頂端：這場戰鬥的目標（第幾天 / 尾王類別 / 補充波剩幾波）
    this.bannerText = this.add
      .text(HAND_CENTER_X, 30, '', { fontFamily: 'sans-serif', fontSize: '20px', color: '#d9b45c', fontStyle: 'bold' })
      .setOrigin(0.5, 0)
      .setDepth(5002);

    this.realmText = this.add
      .text(1560, 300, '', { fontFamily: 'sans-serif', fontSize: '30px', color: '#f5e6c8', fontStyle: 'bold', align: 'right' })
      .setOrigin(1, 0.5)
      .setDepth(5002);
    this.comboText = this.add
      .text(1560, 342, '', { fontFamily: 'sans-serif', fontSize: '20px', color: '#d9b45c', align: 'right' })
      .setOrigin(1, 0.5)
      .setDepth(5002);

    // 清場後才出現的叫陣按鈕；玩家也可照常結束回合，只補一排。
    this.challengeBtn = this.sideButton(1480, 380, 170, 58, '再來啊！', 0x5a2020, 0xc4583f, () => {
      if (this.animator.playing || this._concluded) return;
      this.challengeNextWave();
    });
    this.setSideButtonVisible(this.challengeBtn, false);

    // 右側操作按鈕：結束回合（免開沙盒）、隨時檢視本局牌組
    this.endTurnBtn = this.sideButton(1480, 460, 170, 62, '結束回合', 0x5a4520, 0xd9b45c, () => {
      if (this.animator.playing || this._concluded) return;
      this.endTurnFlow();
    });
    this.sideButton(1480, 540, 170, 54, '檢視牌組', 0x2c4a30, 0x5aa06a,
      () => new DeckOverlay(this, this.run, { mode: 'view', title: '目前牌組' }));
  }

  sideButton(x, y, w, h, label, fill, border, onClick) {
    const rect = this.add
      .rectangle(x, y, w, h, fill, 1)
      .setStrokeStyle(3, border)
      .setDepth(5002)
      .setInteractive({ useHandCursor: true });
    const txt = this.add
      .text(x, y, label, { fontFamily: 'sans-serif', fontSize: '20px', color: '#f5e6c8', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(5003);
    rect.on('pointerover', () => rect.setStrokeStyle(4, 0xffe1b0));
    rect.on('pointerout', () => rect.setStrokeStyle(3, border));
    rect.on('pointerdown', onClick);
    rect.txt = txt;
    return rect;
  }

  setSideButtonVisible(button, visible) {
    if (!button) return;
    button.setVisible(visible);
    button.txt?.setVisible(visible);
    if (visible && !button.input?.enabled) button.setInteractive({ useHandCursor: true });
    if (!visible) button.disableInteractive();
  }

  updateHud() {
    const b = this.battle;
    this.energyText.setText(`內力　${energyPips(b.energy, b.tuning.energyUnit)}`);
    this.inspirationText.setText(
      `靈感　${inspirationGauge(this.presentedInspiration, b.tuning.inspiration.threshold)}`
    );
    this.bannerText.setText(this.battleBanner());

    this.realmText.setText(`境界　${rankLabel(b.combo.realm)}`);
    const combo = b.combo.combo;
    const label = comboLabel(combo);
    this.comboText.setText(label).setVisible(Boolean(label));
  }

  updateHp() {
    const r = Math.max(0, this.battle.playerHp / this.battle.playerMaxHp);
    this.hpBar.setSize(Math.max(0.001, this.hpBarW * r), 16);
    this.hpBar.fillColor = r > 0.5 ? 0x5a9e4a : r > 0.25 ? 0xd9b45c : 0xc4583f;
    this.hpText.setText(`主角  ${this.battle.playerHp} / ${this.battle.playerMaxHp}`);
  }

  onPlayerHit(r) {
    this.updateHp();
    if (r.damage <= 0) {
      if (r.blocked > 0) this.flash(`格擋 ${r.blocked}`, 0x4a8fb8);
      return;
    }
    this.cameras.main.shake(220, 0.006);
    this.flashRedEdge();
    this.flash(`− ${r.damage}`, 0xc4583f);
  }

  flashRedEdge() {
    const o = this.add.rectangle(800, 450, 1600, 900, 0xc4583f, 0).setDepth(5500);
    this.tweens.add({ targets: o, fillAlpha: 0.28, duration: 90, yoyo: true, onComplete: () => o.destroy() });
  }

  /** 逐點重播靈感；第三顆只等同一次普通點亮，滿格特效改在背景自行播放。 */
  async playInspirationStep(ev) {
    const triggered = ev.draws > 0;
    this.presentedInspiration = triggered ? ev.threshold : ev.after;
    this.updateHud();

    stopTweensOf(this, this.inspirationText);
    this.inspirationText.setScale(1).setColor(triggered ? '#fff1a8' : '#d9b45c');
    const pulseHalf = this.animator.d(TUNING.anim.inspirationStep) / 2;
    await tweenTo(this, {
      targets: this.inspirationText,
      scaleX: TUNING.anim.inspirationPulseScale,
      scaleY: TUNING.anim.inspirationPulseScale,
      duration: pulseHalf,
      yoyo: true,
      ease: 'Back.easeOut',
    });
    this.inspirationText.setScale(1).setColor('#d9b45c');

    if (!triggered) return;

    this.playInspirationTrigger();
    this.presentedInspiration = ev.after;
    this.updateHud();
  }

  /** 滿格提示不回傳給 transcript await；抽牌飛行與下一輪靈感可立刻同時開始。 */
  playInspirationTrigger() {
    const burstX = this.inspirationText.x + this.inspirationText.width - 12;
    const burstY = this.inspirationText.y + this.inspirationText.height / 2;
    const burst = this.add.circle(burstX, burstY, 10, 0xd9b45c, 0.55).setDepth(5100);
    const cue = this.add
      .text(burstX + 18, burstY, '靈感滿溢 · 抽一張', {
        fontFamily: 'sans-serif',
        fontSize: '17px',
        color: '#fff1a8',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
      .setDepth(5101);
    const burstDuration = this.animator.d(TUNING.anim.inspirationBurstDuration);
    const cueDuration = this.animator.d(TUNING.anim.inspirationCueDuration);
    Promise.all([
      tweenTo(this, {
        targets: burst,
        scaleX: TUNING.anim.inspirationBurstScale,
        scaleY: TUNING.anim.inspirationBurstScale,
        alpha: 0,
        duration: burstDuration,
        ease: 'Quad.easeOut',
      }),
      tweenTo(this, {
        targets: cue,
        y: cue.y - TUNING.anim.inspirationRise,
        alpha: 0,
        duration: cueDuration,
        ease: 'Sine.easeOut',
      }),
    ]).then(() => {
      burst.destroy();
      cue.destroy();
    });
  }

  async resetBattlePresentation(dealTranscript) {
    this.animator.reset();
    this.presentedInspiration = 0;
    this.drawTimer?.remove();
    this.pendingDraws = 0;
    this.handView.clear();
    this.formationView.clear();

    this.formationView.sync(this.battle.formation, { animate: false });
    this.updateHp();
    await this.runTranscript(dealTranscript);
  }

  async restart() {
    const action = this.session.debug('restart');
    if (action.ok) await this.resetBattlePresentation(action.transcript);
  }

  requestDraw() {
    this.pendingDraws += 1;
    this.drawTimer?.remove();
    this.drawTimer = this.time.delayedCall(TUNING.anim.drawBatchWindow, () => this.pumpDraws());
  }

  async pumpDraws() {
    if (this.drawPumpRunning) return;
    this.drawPumpRunning = true;
    try {
      while (this.pendingDraws > 0) {
        const n = this.pendingDraws;
        this.pendingDraws = 0;
        await this.runTranscript(this.session.debug('draw', { count: n }).transcript);
      }
    } finally {
      this.drawPumpRunning = false;
    }
  }

  async endTurnFlow() {
    if (this._concluded) return;
    const action = this.session.dispatch(GAME_ACTION.END_TURN);
    if (!action.ok) return;
    const tick = action.statusTick;
    if (tick.hits.length) await this.wait(300 + Math.min(tick.hits.length, 8) * 60);
    if (tick.clearReward) {
      this.flash(
        `清場！下回合內力 ＋${energyPips(tick.clearReward.energy, this.battle.tuning.energyUnit)}、多抽 ${tick.clearReward.draw} 張`,
        0xd9b45c
      );
    }

    const phase = action.enemyPhase;
    this.formationView.sync(this.battle.formation);
    this.formationView.playSpecialActions(phase.specials);
    if (phase.defeated) this.flash('主角倒下！', 0xc4583f);
    await this.wait(360);

    // 敵人相位可能已判定勝負（清場無補充波 ＝ 勝、血量歸零 ＝ 負）
    if (action.settlement) {
      this.maybeConclude(action.settlement);
      return;
    }
    await this.runTranscript(action.transcript);
  }

  wait(ms) {
    return new Promise((resolve) =>
      this.time.delayedCall(Math.max(1, ms / this.handView.speed), resolve)
    );
  }

  runTranscript(transcript) {
    if (!transcript) return Promise.resolve();
    return this.animator.play(transcript, this.battle.hand.toArray()).then(() => {
      this.presentedInspiration = this.battle.inspiration;
      this.updateHud();
    });
  }

  playCard(uid) {
    if (this._concluded) return;
    const r = this.session.dispatch(GAME_ACTION.PLAY_CARD, { uid });
    if (!r.ok) return;

    if (r.result.effect.energy) {
      this.flash(`內力 ＋${energyPips(r.result.effect.energy, this.battle.tuning.energyUnit)}`, 0x5aa06a);
    }
    if (r.result.forgotForm) this.flash('返璞歸真　境界歸零', 0xd9b45c);
    if (r.result.clearReward) {
      this.flash(
        `清場！內力 ＋${energyPips(r.result.clearReward.energy, this.battle.tuning.energyUnit)}、抽 ${r.result.clearReward.draw} 張`,
        0xd9b45c
      );
    }

    this.runTranscript(r.result.transcript);

    // 這張牌可能砍光了最後一波敵陣
    this.maybeConclude(r.settlement);
  }

  challengeNextWave() {
    const action = this.session.dispatch(GAME_ACTION.CHALLENGE_WAVE);
    const rows = action.rowsAdded ?? 0;
    if (rows > 0) this.setSideButtonVisible(this.challengeBtn, false);
  }

  pumpCard(wangxingUid, targetUid) {
    if (this._concluded) return;
    const action = this.session.dispatch(GAME_ACTION.PUMP_CARD, { wangxingUid, targetUid });
    const transcript = action.transcript;
    if (!transcript) {
      this.flash('忘形只能施放到具體牌上', 0x8d7a5e);
      return;
    }
    this.flash('階級 ＋1', 0xd9b45c);
    this.runTranscript(transcript);
  }

  /** GameSession 已完成戰後結算；這裡只播提示並呈現它決定的下一個 phase。 */
  maybeConclude(settlement) {
    if (this._concluded) return;
    if (!settlement) return;
    const outcome = settlement.outcome;
    this._concluded = true;

    if (outcome === 'won') this.flash('殲滅！', 0xd9b45c);
    if (settlement.relic) {
      this.time.delayedCall(Math.max(1, 400 / this.handView.speed), () =>
        this.flash(`獲得遺物：${getRelicDef(settlement.relic).name}`, 0xb06cc0)
      );
    }

    this.time.delayedCall(Math.max(1, (settlement.relic ? 1500 : 800) / this.handView.speed), () =>
      transitionToSessionPhase(this, this.session)
    );
  }

  flash(text, color) {
    const t = this.add
      .text(HAND_CENTER_X, 500, text, {
        fontFamily: 'sans-serif',
        fontSize: '30px',
        color: `#${color.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(6000);

    this.tweens.add({
      targets: t,
      y: t.y - 60,
      alpha: 0,
      duration: Math.max(1, 800 / this.handView.speed),
      ease: 'Quad.easeOut',
      onComplete: () => t.destroy(),
    });
  }
}
