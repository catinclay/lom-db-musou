import Phaser from 'phaser';
import { BattleState } from '../core/BattleState.js';
import { RunState } from '../core/RunState.js';
import { EVENT } from '../core/events.js';
import { DeckOverlay } from '../ui/DeckOverlay.js';
import { HandView } from '../ui/HandView.js';
import { MergeAnimator } from '../ui/MergeAnimator.js';
import { DragController } from '../ui/DragController.js';
import { DebugPanel } from '../ui/DebugPanel.js';
import { FormationView } from '../ui/FormationView.js';
import { project } from '../ui/perspective.js';
import { ensureCardTextures } from '../ui/cardTextures.js';
import { ensureEnemyTextures, PLAYER_TEX } from '../ui/enemyTextures.js';
import { realmLabel } from '../ui/format.js';
import { TUNING } from '../config/tuning.js';

const BATTLEFIELD_Y = 600;
const HAND_CENTER_X = 800;
const HAND_BASE_Y = 790;

/**
 * 一場戰鬥的場景（割草）。牌組、血量、敵潮規模全由 RunState 注入的配置決定：
 *   scene.start('Battle', { run, config })
 * 打贏 → 回 RunMap 推進日程；打輸（血量歸零）→ GameOver。
 *
 * 戰鬥內部的接線（core↔UI、合成劇本、敵陣演出）沿用原沙盒，不動。
 */
export class BattleScene extends Phaser.Scene {
  constructor() {
    super('Battle');
  }

  create(data) {
    // 獨立啟動（沒帶 run）時給一個新 run + 一場尾王，方便單場調試。
    this.run = data?.run ?? new RunState();
    this.config = data?.config ?? this.run.callBoss().config;
    this._concluded = false;

    ensureCardTextures(this);
    ensureEnemyTextures(this);
    this.drawBackdrop();
    this.drawRankLines();

    this.battle = new BattleState({
      deckList: this.run.deck,
      tuning: TUNING,
      battle: this.config,
    });
    this.formationView = new FormationView(this);
    this.formationView.attackOrigin = { x: 250, y: 720 }; // 暗器從主角這邊飛出
    this.drawPlayerAndHud();

    this.handView = new HandView(this, { centerX: HAND_CENTER_X, baseY: HAND_BASE_Y });
    this.animator = new MergeAnimator(this, this.handView, {
      deckPos: { x: HAND_CENTER_X + 620, y: HAND_BASE_Y + 40 },
      discardPos: { x: HAND_CENTER_X - 620, y: HAND_BASE_Y + 40 },
    });

    this.animator.onFizzle = () => this.flash('牌庫已空', 0x8d7a5e);
    this.animator.onDrawMiss = (ev) =>
      this.flash(`補抽失敗（${Math.round(ev.chance * 100)}%）`, 0x6f5f4a);

    this.drag = new DragController(this, this.handView, {
      battlefieldY: BATTLEFIELD_Y,
      getCard: (uid) => this.battle.hand.findByUid(uid),
      onPlay: (uid) => this.playCard(uid),
      onMerge: (draggedUid, targetUid) => this.formlessMerge(draggedUid, targetUid),
    });

    // 玩家攻擊命中敵人 → 打擊特效、閃光、傷害數字、倒地
    this.battle.bus.on(EVENT.ENEMIES_HIT, (r) => {
      if (r.knockback && r.waveLayouts?.length) {
        this.formationView.playKnockbackWaves(r.hits, r.waveLayouts, this.battle.formation);
      } else {
        this.formationView.playHitFlourish(r.target, r.hits);
        this.formationView.flashAndPop(r.hits);
      }
    });
    this.battle.bus.on(EVENT.STATUS_TICKED, (r) => this.formationView.playStatusTick(r));
    // 出牌清空整片後下一波「立刻湧上」（BattleState.maybeRushNextWave）—— 補間演出＋提示
    this.battle.bus.on(EVENT.ENEMIES_ADVANCED, (r) => {
      if (r.rushIn) {
        this.formationView.sync(this.battle.formation);
        this.flash('敵潮補上！', 0xd9b45c);
      }
    });
    this.battle.bus.on(EVENT.ARMOR_GAINED, (r) =>
      this.flash(`＋${r.armor} 甲${r.combo.multiplier > 1 ? `  ×${r.combo.multiplier}` : ''}`, 0x4a8fb8)
    );
    this.battle.bus.on(EVENT.PLAYER_HIT, (r) => this.onPlayerHit(r));
    this.battle.bus.on(EVENT.CARD_PLAY_REJECTED, (r) =>
      this.flash(r.reason === 'catalyst' ? '忘形無法單獨出牌' : '內力不足', 0xc4583f)
    );

    // 抽牌批次化：連點累積張數，短窗口後一次抽完
    this.pendingDraws = 0;
    this.drawPumpRunning = false;
    this.drawTimer = null;

    this.panel = new DebugPanel({
      onSpawn: (defId, opts) => this.runTranscript(this.battle.debugAddCard(defId, opts)),
      onDraw: () => this.requestDraw(),
      onEndTurn: () => this.endTurnFlow(),
      onEnergy: (delta) => this.battle.debugAddEnergy(delta),
      onStatus: (id) => {
        this.battle.debugApplyStatus(id);
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
    this.restart();
  }

  update() {
    if (this.battle.hand) {
      this.panel.update(this.battle);
      this.updateHud();
      this.handView.updateCardHints(this.battle.combo.lastRealm, this.battle.energy);
      // 演出進行中不讓按結束回合（避免打斷連鎖）
      this.endTurnBtn?.setAlpha(this.animator.playing || this._concluded ? 0.4 : 1);
    }
  }

  /** 這場戰鬥的目標提示（波數/尾王類別），顯示在頂端。 */
  battleBanner() {
    const wavesLeft = this.battle.wavesLeft;
    const w = wavesLeft === Infinity ? '∞' : wavesLeft;
    const p = this.run.pending;
    const kind = p?.kind ?? '—';
    const label = { elite: '小王', boss: '魔王', final: '最終魔王', battle: '廝殺' }[kind] ?? kind;
    return `第 ${this.run.day} 天 · ${label}　補充波剩 ${w}`;
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
      .text(1584, BATTLEFIELD_Y - 10, '↑ 拉過這條線 ＝ 出招　　拉到別張牌上 ＝ 忘形合成', {
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
    this.add
      .text(x, y, label, { fontFamily: 'sans-serif', fontSize: '20px', color: '#f5e6c8', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(5003);
    rect.on('pointerover', () => rect.setStrokeStyle(4, 0xffe1b0));
    rect.on('pointerout', () => rect.setStrokeStyle(3, border));
    rect.on('pointerdown', onClick);
    return rect;
  }

  updateHud() {
    const b = this.battle;
    this.energyText.setText(`內力  ${b.energy} / ${b.tuning.energyPerTurn}`);
    this.bannerText.setText(this.battleBanner());

    const realm = b.combo.lastRealm;
    this.realmText.setText(`境界　${realm == null ? '無' : realmLabel(realm)}`);
    const step = b.combo.step;
    this.comboText.setText(step > 0 ? `連段 ×${step}` : '連段　—');
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

  async restart() {
    this.animator.reset();
    this.drawTimer?.remove();
    this.pendingDraws = 0;
    this.handView.clear();
    this.formationView.clear();

    const dealTranscript = this.battle.start();
    this.formationView.sync(this.battle.formation, { animate: false });
    this.updateHp();
    await this.runTranscript(dealTranscript);
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
        await this.runTranscript(this.battle.debugDraw(n));
      }
    } finally {
      this.drawPumpRunning = false;
    }
  }

  async endTurnFlow() {
    if (this._concluded) return;
    const tick = this.battle.statusTurnEnd();
    if (tick.hits.length) await this.wait(300 + Math.min(tick.hits.length, 8) * 60);

    const phase = this.battle.enemyPhase();
    this.formationView.sync(this.battle.formation);
    if (phase.defeated) this.flash('主角倒下！', 0xc4583f);
    await this.wait(360);

    // 敵人相位可能已判定勝負（清場無補充波 ＝ 勝、血量歸零 ＝ 負）
    if (this.battle.outcome !== 'ongoing') {
      this.maybeConclude();
      return;
    }
    await this.runTranscript(this.battle.endTurn());
  }

  wait(ms) {
    return new Promise((resolve) =>
      this.time.delayedCall(Math.max(1, ms / this.handView.speed), resolve)
    );
  }

  runTranscript(transcript) {
    if (!transcript) return Promise.resolve();
    return this.animator.play(transcript, this.battle.hand.toArray());
  }

  playCard(uid) {
    if (this._concluded) return;
    const r = this.battle.playCard(uid);
    if (!r.ok) return;

    this.animator.resetMomentum();
    this.handView.destroyCard(uid);

    if (r.result.effect.energy) this.flash(`內力 ＋${r.result.effect.energy}`, 0x5aa06a);

    if (r.result.transcript) this.runTranscript(r.result.transcript);
    else this.handView.relayout(true);

    // 這張牌可能砍光了最後一波敵陣
    this.maybeConclude();
  }

  formlessMerge(draggedUid, targetUid) {
    if (this._concluded) return;
    const transcript = this.battle.formlessMerge(draggedUid, targetUid);
    if (!transcript) {
      this.flash('這兩張不能合成', 0x8d7a5e);
      return;
    }
    this.runTranscript(transcript);
  }

  /** 戰鬥判定出勝負後：結算回 RunState、轉場（回地圖 / 通關 / 敗北）。只跑一次。 */
  maybeConclude() {
    if (this._concluded) return;
    const outcome = this.battle.outcome;
    if (outcome === 'ongoing') return;
    this._concluded = true;

    if (outcome === 'won') this.flash('殲滅！', 0xd9b45c);

    this.time.delayedCall(Math.max(1, 800 / this.handView.speed), () => {
      const res = this.run.finishBattle(this.battle);
      if (res.runOver) {
        this.scene.start('GameOver', { run: this.run, result: res.outcome, cleared: res.cleared });
      } else if (res.dayAdvanced && this.run.slotTokens > 0) {
        // 入夜打贏尾王、手上有速通代幣 ⇒ 先去拉霸機，拉完再進隔天
        this.scene.start('Slot', { run: this.run });
      } else {
        this.scene.start('RunMap', { run: this.run, lastResult: res });
      }
    });
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
