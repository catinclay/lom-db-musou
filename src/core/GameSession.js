import { TUNING } from '../config/tuning.js';
import { BattleState } from './BattleState.js';
import { choiceLabel } from './EventLibrary.js';
import { RunState } from './RunState.js';
import { applySlotReward, spinSlot } from './slot.js';

/**
 * 與呈現層無關的整局流程狀態。Phaser Scene 與無頭 AI 都只透過 dispatch 操作它。
 *
 * 規則：
 * - action 同步算完全部結果；UI 只播放回傳的 transcript / combat result。
 * - phase 是流程語意，不是 Phaser Scene 名稱；core 不知道任何 Scene。
 * - snapshot() 只回傳可序列化資料，適合平衡 bot 記錄、比較與選擇下一步。
 */
export const GAME_PHASE = Object.freeze({
  JOURNEY: 'journey',
  EVENT: 'event',
  SHOP: 'shop',
  SLOT: 'slot',
  BATTLE: 'battle',
  RUN_END: 'runEnd',
});

export const GAME_ACTION = Object.freeze({
  CHOOSE_OFFER: 'chooseOffer',
  CALL_BOSS: 'callBoss',
  CHOOSE_EVENT: 'chooseEvent',
  CONTINUE_EVENT: 'continueEvent',
  BUY_CARD: 'buyCard',
  BUY_RELIC: 'buyRelic',
  REMOVE_CARD: 'removeCard',
  REST: 'rest',
  ENTER_SLOT: 'enterSlot',
  SPIN_SLOT: 'spinSlot',
  LEAVE_SHOP: 'leaveShop',
  LEAVE_SLOT: 'leaveSlot',
  PLAY_CARD: 'playCard',
  PUMP_CARD: 'pumpCard',
  END_TURN: 'endTurn',
  CHALLENGE_WAVE: 'challengeWave',
});

const ACTIONS_BY_PHASE = Object.freeze({
  [GAME_PHASE.JOURNEY]: [GAME_ACTION.CHOOSE_OFFER, GAME_ACTION.CALL_BOSS],
  [GAME_PHASE.EVENT]: [GAME_ACTION.CHOOSE_EVENT, GAME_ACTION.CONTINUE_EVENT],
  [GAME_PHASE.SHOP]: [GAME_ACTION.LEAVE_SHOP],

  [GAME_PHASE.SLOT]: [GAME_ACTION.SPIN_SLOT, GAME_ACTION.LEAVE_SLOT],
  [GAME_PHASE.BATTLE]: [
    GAME_ACTION.PLAY_CARD,
    GAME_ACTION.PUMP_CARD,
    GAME_ACTION.END_TURN,
    GAME_ACTION.CHALLENGE_WAVE,
  ],
  [GAME_PHASE.RUN_END]: [],
});

const SERVICE_ACTIONS = Object.freeze({
  inn: [GAME_ACTION.REST, GAME_ACTION.LEAVE_SHOP],
  merchant: [GAME_ACTION.BUY_CARD, GAME_ACTION.BUY_RELIC, GAME_ACTION.LEAVE_SHOP],
  dojo: [GAME_ACTION.REMOVE_CARD, GAME_ACTION.LEAVE_SHOP],
  casino: [GAME_ACTION.ENTER_SLOT, GAME_ACTION.LEAVE_SHOP],
});

function clonePlain(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

export class GameSession {
  constructor({ rng, tuning = TUNING, deck, meta, run } = {}) {
    this.tuning = tuning;
    this.run = run ?? new RunState({ rng, tuning, deck, meta });
    this.phase = GAME_PHASE.JOURNEY;
    this.context = {};
    this.battle = null;
    this.lastResult = null;
    this.run.ensureOffer();
  }

  /** AI 的單一呼叫入口；亦接受 dispatch({ type, ...payload })。 */
  dispatch(action, payload = {}) {
    const command = typeof action === 'string' ? { type: action, ...payload } : action;
    if (!command?.type) return this.fail('missing_action');
    if (!this.availableActions().includes(command.type)) return this.fail('action_not_available');

    switch (command.type) {
      case GAME_ACTION.CHOOSE_OFFER: return this.chooseOffer(command.index);
      case GAME_ACTION.CALL_BOSS: return this.callBoss();
      case GAME_ACTION.CHOOSE_EVENT: return this.chooseEvent(command.index);
      case GAME_ACTION.CONTINUE_EVENT: return this.continueEvent();
      case GAME_ACTION.BUY_CARD: return this.shopAction('buyCard', () => this.run.buyShopCard(this.context.shop, command.index));
      case GAME_ACTION.BUY_RELIC: return this.shopAction('buyRelic', () => this.run.buyRelic(this.context.shop));
      case GAME_ACTION.REMOVE_CARD: return this.shopAction('removeCard', () => this.run.buyRemoveCard(this.context.shop, command.index));
      case GAME_ACTION.REST: return this.shopAction('rest', () => this.run.restAtInn(this.context.shop));
      case GAME_ACTION.ENTER_SLOT: return this.enterSlot();
      case GAME_ACTION.SPIN_SLOT: return this.pullSlot();
      case GAME_ACTION.LEAVE_SHOP: return this.leaveShop();
      case GAME_ACTION.LEAVE_SLOT: return this.leaveSlot();
      case GAME_ACTION.PLAY_CARD: return this.playCard(command.uid);
      case GAME_ACTION.PUMP_CARD: return this.pumpCard(command.wangxingUid, command.targetUid);
      case GAME_ACTION.END_TURN: return this.endTurn();
      case GAME_ACTION.CHALLENGE_WAVE: return this.challengeWave();
      default: return this.fail('unknown_action');
    }
  }

  availableActions() {
    const actions = [...(ACTIONS_BY_PHASE[this.phase] ?? [])];
    if (this.phase === GAME_PHASE.EVENT) {
      return this.context.result ? [GAME_ACTION.CONTINUE_EVENT] : [GAME_ACTION.CHOOSE_EVENT];
    }
    if (this.phase === GAME_PHASE.SHOP) {
      return [...(SERVICE_ACTIONS[this.context.shop?.service] ?? [GAME_ACTION.LEAVE_SHOP])];
    }
    if (this.phase === GAME_PHASE.BATTLE && !this.battle?.awaitingWaveChoice) {
      return actions.filter((x) => x !== GAME_ACTION.CHALLENGE_WAVE);
    }
    return actions;
  }

  ok(extra = {}) {
    return { ok: true, phase: this.phase, ...extra };
  }

  fail(reason) {
    return { ok: false, reason, phase: this.phase };
  }

  chooseOffer(index) {
    const result = this.run.takeOffer(index);
    if (!result) return this.fail('invalid_offer');
    if (result.type === 'battle') return this.beginBattle(result.config, { source: 'offer', kind: result.kind });
    if (result.type === 'service') {
      this.phase = GAME_PHASE.SHOP;
      this.context = { shop: result.shop, service: result.service };
    } else {
      this.phase = GAME_PHASE.EVENT;
      this.context = { node: result.node, event: result.event, result: null };
    }
    return this.ok({ result });
  }

  callBoss() {
    const result = this.run.callBoss();
    return this.beginBattle(result.config, {
      source: 'boss', kind: result.kind, speedrunTokens: result.speedrunTokens,
    });
  }

  chooseEvent(index) {
    const result = this.run.resolveEventChoice(this.context.node, index);
    if (result.battle) return this.beginBattle(result.battle, { source: 'event', eventResult: result });
    this.context.result = result;
    return this.ok({ result });
  }

  continueEvent() {
    if (!this.context.result) return this.fail('event_not_resolved');
    this.enterJourney();
    return this.ok();
  }

  shopAction(action, operation) {
    const changed = operation();
    return changed ? this.ok({ action }) : this.fail('transaction_rejected');
  }

  enterSlot() {
    if (this.run.slotTokens <= 0) return this.fail('no_slot_token');
    const shop = this.context.shop;
    this.phase = GAME_PHASE.SLOT;
    this.context = { returnPhase: GAME_PHASE.SHOP, returnContext: { shop } };
    return this.ok();
  }

  pullSlot() {
    if (!this.run.spendSlotToken()) return this.fail('no_slot_token');
    // 邏輯立即完整結算；畫面可用 reels/reward 自己重播，不得延後修改 run。
    const result = spinSlot(this.run, this.run.rng, this.tuning);
    applySlotReward(this.run, result.reward);
    return this.ok(result);
  }

  leaveShop() {
    this.enterJourney();
    return this.ok();
  }

  leaveSlot() {
    const returnPhase = this.context.returnPhase ?? GAME_PHASE.JOURNEY;
    const returnContext = this.context.returnContext ?? {};
    this.phase = returnPhase;
    this.context = returnContext;
    if (this.phase === GAME_PHASE.JOURNEY) this.run.ensureOffer();
    return this.ok();
  }

  beginBattle(config, details = {}) {
    this.phase = GAME_PHASE.BATTLE;
    this.context = { ...details, config };
    this.battle = new BattleState({
      deckList: this.run.deck,
      rng: this.run.rng,
      tuning: this.tuning,
      battle: config,
    });
    const transcript = this.battle.start();
    this.openingTranscript = transcript;
    return this.ok({ transcript, ...details });
  }

  restartBattle() {
    if (this.phase !== GAME_PHASE.BATTLE) return this.fail('action_not_available');
    return this.ok({ transcript: this.battle.start() });
  }

  playCard(uid) {
    const action = this.battle.playCard(uid);
    if (!action.ok) return this.fail(action.reason);
    const settlement = this.settleBattleIfFinished();
    return this.ok({ result: action.result, settlement });
  }

  pumpCard(wangxingUid, targetUid) {
    const transcript = this.battle.pumpCard(wangxingUid, targetUid);
    return transcript ? this.ok({ transcript }) : this.fail('invalid_merge');
  }

  endTurn() {
    const statusTick = this.battle.statusTurnEnd();
    const enemyPhase = this.battle.enemyPhase();
    let transcript = [];
    if (this.battle.outcome === 'ongoing') transcript = this.battle.endTurn();
    const settlement = this.settleBattleIfFinished();
    return this.ok({ statusTick, enemyPhase, transcript, settlement });
  }

  challengeWave() {
    const rowsAdded = this.battle.challengeNextWave();
    return rowsAdded > 0 ? this.ok({ rowsAdded }) : this.fail('wave_not_available');
  }

  settleBattleIfFinished() {
    if (this.battle.outcome === 'ongoing') return null;
    const settlement = this.run.finishBattle(this.battle);
    this.lastResult = settlement;
    if (settlement.runOver) {
      this.phase = GAME_PHASE.RUN_END;
      this.context = { settlement };
    } else if (settlement.dayAdvanced && this.run.slotTokens > 0) {
      this.phase = GAME_PHASE.SLOT;
      this.context = { returnPhase: GAME_PHASE.JOURNEY, returnContext: {}, settlement };
    } else {
      this.enterJourney();
    }
    return settlement;
  }

  enterJourney() {
    this.phase = GAME_PHASE.JOURNEY;
    this.context = {};
    this.run.ensureOffer();
  }

  /** Debug 仍走 session，避免開發面板成為繞過流程層的第二套控制路徑。 */
  debug(action, payload = {}) {
    if (this.phase !== GAME_PHASE.BATTLE) return this.fail('action_not_available');
    switch (action) {
      case 'addCard': return this.ok({ transcript: this.battle.debugAddCard(payload.defId, payload.options) });
      case 'draw': return this.ok({ transcript: this.battle.debugDraw(payload.count ?? 1) });
      case 'energy': return this.ok({ energy: this.battle.debugAddEnergy(payload.delta ?? 0) });
      case 'status': return this.ok({ enemy: this.battle.debugApplyStatus(payload.id, payload.stacks) });
      case 'restart': return this.restartBattle();
      default: return this.fail('unknown_debug_action');
    }
  }

  /** 純資料觀測面；不把函式、EventBus 或 class instance 洩漏給 bot。 */
  snapshot() {
    const run = {
      day: this.run.day,
      time: this.run.eventsDoneToday + 1,
      timesCompletedToday: this.run.eventsDoneToday,
      timesLeftToday: this.run.roundsLeft,
      hp: this.run.hp,
      maxHp: this.run.maxHp,
      money: this.run.money,
      slotTokens: this.run.slotTokens,
      outcome: this.run.outcome,
      attrs: clonePlain(this.run.attrs),
      deck: clonePlain(this.run.deck),
      relics: [...this.run.relics],
      offer: clonePlain(this.run.offer),
      mercyUsed: this.run.mercyUsed,
    };
    const out = { phase: this.phase, actions: this.availableActions(), run };
    if (this.phase === GAME_PHASE.EVENT) {
      out.event = {
        id: this.context.event.id,
        name: this.context.event.name,
        text: this.context.event.text,
        choices: this.context.event.choices.map((choice, index) => ({
          index, label: choiceLabel(choice, this.run), desc: choice.desc ?? '',
        })),
        result: clonePlain(this.context.result),
      };
    }
    if (this.phase === GAME_PHASE.SHOP) out.shop = clonePlain(this.context.shop);
    if (this.phase === GAME_PHASE.BATTLE && this.battle) {
      out.battle = {
        turn: this.battle.turn,
        energy: this.battle.energy,
        inspiration: this.battle.inspiration,
        armor: this.battle.armor,
        hp: this.battle.playerHp,
        maxHp: this.battle.playerMaxHp,
        outcome: this.battle.outcome,
        combo: { realm: this.battle.combo.realm, combo: this.battle.combo.combo },
        hand: clonePlain(this.battle.hand.toArray()),
        enemies: clonePlain(this.battle.formation.living),
        wavesLeft: this.battle.wavesLeft,
        rowsLeftInWave: this.battle.rowsLeftInWave,
        awaitingWaveChoice: this.battle.awaitingWaveChoice,
      };
    }
    if (this.phase === GAME_PHASE.RUN_END) out.result = clonePlain(this.context.settlement);
    return out;
  }
}
