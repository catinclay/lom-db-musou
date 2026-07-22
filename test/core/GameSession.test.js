import { describe, expect, it } from 'vitest';
import { GAME_ACTION, GAME_PHASE, GameSession } from '../../src/core/GameSession.js';
import { seededRng } from '../../src/core/rng.js';
import { TX } from '../../src/core/transcript.js';

function session(seed = 1) {
  return new GameSession({ rng: seededRng(seed) });
}

describe('GameSession：無頭整局流程', () => {
  it('初始 snapshot 是可序列化的純資料，並列出目前可用 action', () => {
    const game = session();
    const view = game.snapshot();

    expect(view.phase).toBe(GAME_PHASE.JOURNEY);
    expect(view.actions).toEqual([GAME_ACTION.CHOOSE_OFFER, GAME_ACTION.CALL_BOSS]);
    expect(view.run.offer).toHaveLength(game.tuning.run.offer.size);
    expect(() => JSON.stringify(view)).not.toThrow();
  });

  it('只用 dispatch 可完成時辰選擇、進客棧、交易與離開', () => {
    const game = session();
    game.run.offer = [{ id: 'inn', kind: 'inn', done: false }];

    expect(game.dispatch({ type: GAME_ACTION.CHOOSE_OFFER, index: 0 }).ok).toBe(true);
    expect(game.phase).toBe(GAME_PHASE.SHOP);

    game.run.hp = 1;
    game.run.money = 100;
    const before = game.run.hp;
    expect(game.dispatch(GAME_ACTION.REST).ok).toBe(true);
    expect(game.run.hp).toBeGreaterThan(before);

    expect(game.dispatch(GAME_ACTION.LEAVE_SHOP).ok).toBe(true);
    expect(game.phase).toBe(GAME_PHASE.JOURNEY);
    expect(game.run.offer).toHaveLength(game.tuning.run.offer.size);
  });

  it('奇遇的立即結果必須 continue，之後才進下一時辰', () => {
    const game = session();
    game.run.rng = () => 0.1;
    game.run.offer = [{ id: 'event', kind: 'event', eventId: 'baoXiang', done: false }];

    game.dispatch(GAME_ACTION.CHOOSE_OFFER, { index: 0 });
    expect(game.phase).toBe(GAME_PHASE.EVENT);
    expect(game.availableActions()).toEqual([GAME_ACTION.CHOOSE_EVENT]);

    const result = game.dispatch(GAME_ACTION.CHOOSE_EVENT, { index: 0 });
    expect(result.ok).toBe(true);
    expect(result.result.text).toBeTruthy();
    expect(game.availableActions()).toEqual([GAME_ACTION.CONTINUE_EVENT]);

    game.dispatch(GAME_ACTION.CONTINUE_EVENT);
    expect(game.phase).toBe(GAME_PHASE.JOURNEY);
  });

  it('開戰、出牌與回合結束都走同步 action，不需要 Phaser 或動畫計時', () => {
    const game = session(3);
    game.run.offer = [{ id: 'battle', kind: 'battle', done: false }];

    const opening = game.dispatch(GAME_ACTION.CHOOSE_OFFER, { index: 0 });
    expect(game.phase).toBe(GAME_PHASE.BATTLE);
    expect(opening.transcript.length).toBeGreaterThan(0);

    const playable = game.battle.hand.toArray().find((card) => {
      const action = game.dispatch(GAME_ACTION.PLAY_CARD, { uid: card.uid });
      if (action.ok) return true;
      return false;
    });
    expect(playable).toBeTruthy();

    if (game.phase === GAME_PHASE.BATTLE) {
      const turn = game.dispatch(GAME_ACTION.END_TURN);
      expect(turn.ok).toBe(true);
      expect(turn).toHaveProperty('statusTick');
      expect(turn).toHaveProperty('enemyPhase');
      expect(Array.isArray(turn.transcript)).toBe(true);
    }
  });

  it('忘形升階也只走 pumpCard action，並同步回傳 transcript', () => {
    const game = session(7);
    game.run.offer = [{ id: 'battle', kind: 'battle', done: false }];
    game.dispatch(GAME_ACTION.CHOOSE_OFFER, { index: 0 });
    game.battle.debugAddCard('target', { rank: 5 });
    game.battle.debugAddCard('wangXing');
    const target = game.battle.hand.toArray().find((card) => card.defId === 'target');
    const wangXing = game.battle.hand.toArray().find((card) => card.defId === 'wangXing');

    const action = game.dispatch(GAME_ACTION.PUMP_CARD, { wangxingUid: wangXing.uid, targetUid: target.uid });
    expect(action.ok).toBe(true);
    expect(action.transcript[0]).toMatchObject({ type: TX.EXHAUST, card: wangXing });
    expect(action.transcript[1]).toMatchObject({
      type: TX.RANK_UP,
      consumed: target.uid,
      result: { defId: 'target', rank: 6 },
    });
    expect(game.battle.exhaustPile).toContain(wangXing);
    expect(game.battle.deck.discardPile).not.toContain(wangXing);
  });

  it('拉霸規則先同步結算，reels/reward 只供畫面重播', () => {
    const game = session(5);
    game.run.offer = [{ id: 'casino', kind: 'casino', done: false }];
    game.dispatch(GAME_ACTION.CHOOSE_OFFER, { index: 0 });
    game.run.slotTokens = 1;
    game.dispatch(GAME_ACTION.ENTER_SLOT);

    const before = JSON.stringify({ money: game.run.money, deck: game.run.deck });
    const spin = game.dispatch(GAME_ACTION.SPIN_SLOT);
    const after = JSON.stringify({ money: game.run.money, deck: game.run.deck });

    expect(spin.ok).toBe(true);
    expect(spin.reels).toHaveLength(3);
    expect(spin.reward.label).toBeTruthy();
    expect(game.run.slotTokens).toBe(0);
    expect(after === before && spin.reward.kind !== 'dud').toBe(false);
  });

  it('各服務設施只開放自己的 action', () => {
    const game = session();
    game.run.offer = [{ id: 'dojo', kind: 'dojo', done: false }];
    game.dispatch(GAME_ACTION.CHOOSE_OFFER, { index: 0 });

    expect(game.availableActions()).toEqual([GAME_ACTION.REMOVE_CARD, GAME_ACTION.LEAVE_SHOP]);
    expect(game.dispatch(GAME_ACTION.REST)).toMatchObject({ ok: false, reason: 'action_not_available' });
  });

  it('不允許在錯誤 phase 呼叫 action', () => {
    const game = session();
    expect(game.dispatch(GAME_ACTION.END_TURN)).toMatchObject({
      ok: false,
      reason: 'action_not_available',
      phase: GAME_PHASE.JOURNEY,
    });
  });
});
