import { describe, it, expect, beforeEach } from 'vitest';
import { BattleState } from '../../src/core/BattleState.js';
import { resetUidCounter } from '../../src/core/Card.js';
import { seededRng } from '../../src/core/rng.js';
import { TUNING } from '../../src/config/tuning.js';
import { TX } from '../../src/core/transcript.js';
import { EVENT } from '../../src/core/events.js';

const deckOf = (specs) => specs.map((s) => (typeof s === 'string' ? { defId: s } : s));

const battle = (deckList, overrides = {}) =>
  new BattleState({
    deckList,
    rng: seededRng(42),
    tuning: {
      ...TUNING,
      ...overrides,
    },
  });

beforeEach(() => resetUidCounter());

describe('戰鬥啟動', () => {
  it('抽到起手張數', () => {
    const b = battle(deckOf(['pi', 'ci', 'dang', 'buFa', 'saoTang', 'anqi', 'ci']), {
      startingHandSize: 3,
    });
    b.start();
    expect(b.hand.size).toBeGreaterThan(0);
  });

  it('起手就有同名牌時會自動合成', () => {
    const b = battle(deckOf(['pi', 'pi', 'pi', 'pi']), { startingHandSize: 4 });
    b.start();
    expect(b.hand.size).toBe(1);
    expect(b.hand.get(0).rank).toBe(3); // 四張階級1 → 兩張階級2 → 一張階級3
  });

  it('牌組不足時不崩潰', () => {
    const b = battle(deckOf(['pi']), { startingHandSize: 5 });
    expect(() => b.start()).not.toThrow();
    expect(b.hand.size).toBe(1);
  });

  it('先把牌抽完才開始合成（劇本順序）', () => {
    const b = battle(deckOf(['pi', 'pi', 'dang', 'dang']), { startingHandSize: 4 });
    const t = b.start();

    const lastDraw = t.map((e) => e.type).lastIndexOf(TX.DRAW);
    const firstMerge = t.findIndex((e) => e.type === TX.MERGE);
    expect(firstMerge).toBeGreaterThan(lastDraw);
  });
});

describe('★ 合成僅存在於當場戰鬥', () => {
  it('重開戰鬥後牌組復原，合成產物不外洩', () => {
    const deckList = deckOf(['pi', 'pi', 'pi', 'pi']);
    const b = battle(deckList, { startingHandSize: 4 });

    b.start();
    expect(b.hand.get(0).rank).toBe(3);

    b.start();
    expect(b.hand.get(0).rank).toBe(3); // 又從 4 張階級1 重新合成，而非從階級3 起跳
    expect(b.hand.size).toBe(1);
  });

  it('deckList 本身永遠不被合成改動', () => {
    const deckList = deckOf(['pi', 'pi', 'pi', 'pi']);
    const snapshot = JSON.stringify(deckList);
    const b = battle(deckList, { startingHandSize: 4 });

    b.start();
    b.start();
    b.start();

    expect(JSON.stringify(deckList)).toBe(snapshot);
  });

  it('每場的卡牌實例都是全新的物件', () => {
    const b = battle(deckOf(['pi', 'dang']), { startingHandSize: 2 });
    b.start();
    const first = b.hand.toArray().map((c) => c.uid);
    b.start();
    expect(b.hand.toArray().map((c) => c.uid)).not.toEqual(first);
  });
});

describe('出牌', () => {
  it('消耗內力', () => {
    const b = battle(deckOf(['hengPi', 'anqi']), { startingHandSize: 2, energyPerTurn: 3 });
    b.start();
    b.playCard(b.hand.get(0).uid); // 橫劈/暗器皆消耗一整格（三小格）
    expect(b.energy).toBe(0);
  });

  it('內力不足時拒絕出牌', () => {
    const b = battle(deckOf(['hengPi']), { startingHandSize: 1, energyPerTurn: 0 });
    b.start();
    expect(b.playCard(b.hand.get(0).uid)).toMatchObject({ ok: false, reason: 'no_energy' });
    expect(b.hand.size).toBe(1);
  });

  it('打出後進棄牌堆', () => {
    const b = battle(deckOf(['hengPi', 'anqi']), { startingHandSize: 2 });
    b.start();
    const card = b.hand.get(0);
    const r = b.playCard(card.uid);
    expect(b.hand.findByUid(card.uid)).toBeUndefined();
    expect(b.deck.discardCount).toBe(1);
    expect(r.result.transcript[0]).toMatchObject({ type: TX.DISCARD, card });
  });

  it('傷害走 resolveEffect（階級每發 × 連擊次數）', () => {
    const b = battle(deckOf([{ defId: 'hengPi', rank: 3 }]), {
      startingHandSize: 1,
      energyPerTurn: 9,
    });
    b.start();
    expect(b.playCard(b.hand.get(0).uid).result.damage).toBe(18); // 橫劈階級3：round(7 × 2.5)
  });

  it('連段倍率確實套用到傷害', () => {
    const b = battle(deckOf([{ defId: 'hengPi', rank: 1 }, { defId: 'hengPi', rank: 2 }]), {
      startingHandSize: 2,
      energyPerTurn: 9,
    });
    b.start();
    const r1 = b.hand.toArray().find((c) => c.rank === 1);
    const r2 = b.hand.toArray().find((c) => c.rank === 2);

    expect(b.playCard(r1.uid).result.damage).toBe(7 * 1 * 1); // 境界1 ×1
    expect(b.playCard(r2.uid).result.damage).toBe(22); // 境界2 round(7×1.5)=11、連段×2
  });

  it('中斷牌不吃既有連擊加成，結算後境界與連擊皆歸零', () => {
    const b = battle(deckOf([
      { defId: 'hengPi', rank: 1 },
      { defId: 'guan', rank: 2 },
      { defId: 'anqi', rank: 1 },
    ]), { startingHandSize: 3, energyPerTurn: 9 });
    b.start();
    const first = b.hand.toArray().find((c) => c.defId === 'hengPi');
    const second = b.hand.toArray().find((c) => c.defId === 'guan');
    b.playCard(first.uid);
    b.playCard(second.uid);

    const interruptedCard = b.hand.get(0);
    const r = b.playCard(interruptedCard.uid).result;
    expect(r.combo).toMatchObject({ realm: 0, combo: 0, multiplier: 1, interrupted: true });
    expect(r.damage).toBe(15);
    expect(b.combo.current()).toMatchObject({ realm: 0, combo: 0, multiplier: 0 });
  });

  it('功能牌中斷時只套用基礎效果，不會沿用舊連擊或減少效果', () => {
    const b = battle(deckOf([
      { defId: 'hengPi', rank: 1 },
      { defId: 'guan', rank: 2 },
      { defId: 'yunQi', rank: 1 },
    ]), { startingHandSize: 3, energyPerTurn: 9 });
    b.start();
    b.playCard(b.hand.toArray().find((c) => c.defId === 'hengPi').uid);
    b.playCard(b.hand.toArray().find((c) => c.defId === 'guan').uid);
    const before = b.energy;
    const r = b.playCard(b.hand.toArray().find((c) => c.defId === 'yunQi').uid).result;

    expect(r.combo).toMatchObject({ combo: 0, multiplier: 1, interrupted: true });
    expect(r.effect.energy).toBe(3);
    expect(b.energy).toBe(before + 3);
  });

  it('★ 暗器的連段加的是發數不是傷害', () => {
    const b = battle(deckOf([{ defId: 'hengPi', rank: 1 }, { defId: 'anqi', rank: 2 }]), {
      startingHandSize: 2,
      energyPerTurn: 9,
    });
    b.start();
    const hengPi = b.hand.toArray().find((c) => c.defId === 'hengPi');
    const anqi = b.hand.toArray().find((c) => c.defId === 'anqi');

    b.playCard(hengPi.uid); // 建立基準，境界1
    const r = b.playCard(anqi.uid).result; // 境界2 ⇒ 遞增 ⇒ ×2

    expect(r.effect.hits).toBe(6); // 3 發 × 連段2
    expect(r.effect.damage).toBe(8); // round(5 × 1.5)（境界2），未被連段影響
    expect(r.damage).toBe(48);
  });

  it('手上沒有的牌打不出來', () => {
    const b = battle(deckOf(['hengPi']), { startingHandSize: 1 });
    b.start();
    expect(b.playCard('不存在')).toMatchObject({ ok: false, reason: 'not_in_hand' });
  });
});

describe('回合', () => {
  it('回合結束手牌全棄（§2.1）', () => {
    const b = battle(deckOf(['pi', 'ci', 'dang', 'buFa', 'saoTang', 'anqi']), {
      startingHandSize: 2,
    });
    b.start();
    const handUids = b.hand.toArray().map((c) => c.uid);
    b.endTurn();
    for (const uid of handUids) expect(b.hand.findByUid(uid)).toBeUndefined();
  });

  it('★ 棄牌要進劇本，而且排在新回合抽牌之前', () => {
    // 少了 DISCARD 事件，畫面上舊手牌會殘留到最後才被 syncTo 靜默刪掉，
    // 看起來就像「回合結束沒有棄牌」。
    const b = battle(deckOf(['pi', 'ci', 'dang', 'buFa', 'saoTang', 'anqi']), {
      startingHandSize: 2,
    });
    b.start();
    const handUids = b.hand.toArray().map((c) => c.uid);

    const t = b.endTurn();
    const discards = t.filter((e) => e.type === TX.DISCARD);

    expect(discards.map((e) => e.card.uid).sort()).toEqual([...handUids].sort());

    const lastDiscard = t.map((e) => e.type).lastIndexOf(TX.DISCARD);
    const firstDraw = t.findIndex((e) => e.type === TX.DRAW);
    expect(lastDiscard).toBeLessThan(firstDraw);
  });

  it('棄掉的牌進棄牌堆', () => {
    const b = battle(deckOf(['pi', 'ci', 'dang', 'buFa', 'saoTang', 'anqi']), {
      startingHandSize: 2,
    });
    b.start();
    b.endTurn();
    expect(b.deck.discardCount).toBeGreaterThanOrEqual(2);
  });

  it('新回合內力回滿、連段重置', () => {
    const b = battle(deckOf(['hengPi', 'anqi', 'hengPi', 'anqi']), {
      startingHandSize: 2,
      energyPerTurn: 3,
    });
    b.start();
    b.playCard(b.hand.get(0).uid);
    b.endTurn();

    expect(b.energy).toBe(3);
    expect(b.combo.combo).toBe(0);
    expect(b.combo.realm).toBe(0);
  });

  it('合成次數每回合重置，靈感則跨回合保留', () => {
    const b = battle(deckOf(['pi', 'ci', 'dang', 'buFa']), {
      startingHandSize: 2,
    });
    b.start();
    b.mergesThisTurn = 4;
    b.inspiration = 1;
    b.endTurn();
    expect(b.mergesThisTurn).toBe(0);
    expect(b.inspiration).toBe(1);
  });

  it('回合數遞增', () => {
    const b = battle(deckOf(['pi', 'ci', 'dang', 'buFa']), { startingHandSize: 1 });
    b.start();
    expect(b.turn).toBe(1);
    b.endTurn();
    expect(b.turn).toBe(2);
  });
});

describe('忘形施放（透過 BattleState）', () => {
  it('拖到具體牌升階、忘形本場消耗並發事件', () => {
    const b = battle(deckOf(['wangXing', 'dang']), {
      startingHandSize: 2,
    });

    let emitted = null;
    b.bus.on(EVENT.TRANSCRIPT, (t) => (emitted = t));
    b.start();

    const wangXing = b.hand.toArray().find((c) => c.defId === 'wangXing');
    const dang = b.hand.toArray().find((c) => c.defId === 'dang');
    b.pumpCard(wangXing.uid, dang.uid);

    expect(b.hand.size).toBe(1);
    expect(b.hand.get(0).defId).toBe('dang');
    expect(b.hand.get(0).rank).toBe(2);
    expect(b.exhaustPile).toContain(wangXing);
    expect(b.deck.discardPile).not.toContain(wangXing);
    expect(emitted[0]).toMatchObject({ type: TX.EXHAUST, card: wangXing });
    expect(emitted).not.toBeNull();
  });

  it('不合法的配對回傳 null 且不動手牌', () => {
    const b = battle(deckOf(['pi', 'dang']), { startingHandSize: 2 });
    b.start();
    const [a, c] = b.hand.toArray();
    expect(b.pumpCard(a.uid, c.uid)).toBeNull();
    expect(b.hand.size).toBe(2);
  });
});

describe('忘形打出', () => {
  it('境界歸零、連擊保留，忘形本場消耗且低階牌可續擊', () => {
    const b = battle([], { startingHandSize: 0, energyPerTurn: 9 });
    b.start();
    b.debugAddCard('hengPi', { rank: 1 });
    b.playCard(b.hand.get(0).uid);
    b.debugAddCard('guan', { rank: 2 });
    b.playCard(b.hand.get(0).uid);
    expect(b.combo.current()).toMatchObject({ realm: 2, combo: 2 });

    b.debugAddCard('wangXing');
    const wangXing = b.hand.get(0);
    const forgotten = b.playCard(wangXing.uid);
    expect(forgotten.result).toMatchObject({ exhausted: true, forgotForm: true });
    expect(forgotten.result.transcript[0]).toMatchObject({ type: TX.EXHAUST, card: wangXing });
    expect(b.combo.current()).toMatchObject({ realm: 0, combo: 2 });
    expect(b.exhaustPile).toContain(wangXing);
    expect(b.deck.discardPile).not.toContain(wangXing);

    b.debugAddCard('anqi', { rank: 1 });
    const resumed = b.playCard(b.hand.get(0).uid);
    expect(resumed.result.combo).toMatchObject({ realm: 1, combo: 3, multiplier: 3, broke: true });
    expect(resumed.result.effect.hits).toBe(9);
  });
});

describe('功能牌（技能）', () => {
  it('運氣調息：不耗內力，二階每次施放回復 4 小格', () => {
    const b = battle(deckOf([{ defId: 'yunQi', rank: 2 }]), {
      startingHandSize: 1,
      energyPerTurn: 3,
    });
    b.start();
    const r = b.playCard(b.hand.get(0).uid);
    expect(r.ok).toBe(true);
    expect(b.energy).toBe(7); // 3 − 0（費）+ 4（二階）
  });

  it('臨機應變：耗一整格內力、獲得靈感，滿 3 點抽一張', () => {
    const b = battle(deckOf(['pi', 'ci', 'dang', 'buFa']), {
      startingHandSize: 0, // 起手空手，牌庫留 4 張給抽
      energyPerTurn: 3,
    });
    b.start();
    b.debugAddCard('linJi'); // 手動塞一張，避免靠洗牌運氣
    const linJi = b.hand.toArray().find((c) => c.defId === 'linJi');
    const r = b.playCard(linJi.uid);

    expect(b.energy).toBe(0); // 3 − 3
    expect(r.result.effect.inspiration).toBe(3);
    expect(r.result.transcript.filter((e) => e.type === TX.DRAW)).toHaveLength(1);
    expect(b.hand.size).toBe(1);
  });
});

describe('敵人相位', () => {
  it('嘍囉進線黃2 → 黃1 → 紅，下個敵人相位才攻擊', () => {
    const b = new BattleState({
      deckList: deckOf(['guan']), rng: seededRng(1), tuning: TUNING,
      battle: { waves: 0, rows: 1, minPerRow: 1, maxPerRow: 1, eliteChance: 0, gruntDefId: 'luo' },
    });
    b.start(); // 敵人在 rank 1
    const hp0 = b.playerHp;
    const e = b.formation.frontLivingEnemy();
    b.enemyPhase();
    expect(e).toMatchObject({ rank: 0, attackState: 'charging', prepareRemaining: 2 });
    b.enemyPhase();
    expect(e).toMatchObject({ attackState: 'charging', prepareRemaining: 1 });
    b.enemyPhase();
    expect(e.attackState).toBe('ready');
    expect(b.playerHp).toBe(hp0);
    b.enemyPhase();
    expect(b.playerHp).toBeLessThan(hp0);
    expect(e).toMatchObject({ attackState: 'charging', prepareRemaining: 2 });
  });

  it('崩山出牌會把命中的敵人往後震退（result.knockback）', () => {
    const b = battle(deckOf(['guan']), { startingHandSize: 0, energyPerTurn: 9 });
    b.start();
    b.debugAddCard('bengShan');
    const card = b.hand.toArray().find((c) => c.defId === 'bengShan');
    const before = b.formation.living.reduce((s, e) => s + e.rank, 0);
    const r = b.playCard(card.uid);
    expect(r.ok).toBe(true);
    expect(r.result.knockback).toBe(true);
    // 有人被往後推 ⇒ 全體 rank 總和變大
    expect(b.formation.living.reduce((s, e) => s + e.rank, 0)).toBeGreaterThan(before);
  });
});

describe('debug 工具', () => {
  it('debugAddCard 塞牌進手牌並引爆連鎖', () => {
    const b = battle(deckOf(['pi']), { startingHandSize: 1 });
    b.start();
    b.debugAddCard('pi');
    expect(b.hand.size).toBe(1);
    expect(b.hand.get(0).rank).toBe(2);
  });

  it('debugAddCard 可指定階級與 tags', () => {
    const b = battle(deckOf(['dang']), { startingHandSize: 1 });
    b.start();
    b.debugAddCard('anqi', { rank: 5, tags: ['debug'] });
    const anqi = b.hand.toArray().find((c) => c.defId === 'anqi');
    expect(anqi.rank).toBe(5);
    expect(anqi.tags).toContain('debug');
  });

  it('debugDraw 抽牌並解算連鎖', () => {
    const b = battle(deckOf(['pi', 'pi']), { startingHandSize: 1 });
    b.start();
    b.debugDraw(1);
    expect(b.hand.size).toBe(1);
    expect(b.hand.get(0).rank).toBe(2);
  });
});

describe('有限戰鬥（勝負判定）', () => {
  const withBattle = (battleConfig) =>
    new BattleState({ deckList: deckOf(['hengPi']), rng: seededRng(1), tuning: TUNING, battle: battleConfig });

  it('補充波用盡且敵陣清空 ⇒ 判勝並發 BATTLE_WON', () => {
    const b = withBattle({ waves: 0 });
    let won = false;
    b.bus.on(EVENT.BATTLE_WON, () => (won = true));
    b.start();
    for (const e of b.formation.living) e.alive = false; // 手動清場，測試不靠砍殺運氣
    b.checkOutcome();
    expect(b.outcome).toBe('won');
    expect(won).toBe(true);
  });

  it('還有補充波時清場不算贏（下一波會湧上）', () => {
    const b = withBattle({ waves: 2 });
    b.start();
    for (const e of b.formation.living) e.alive = false;
    b.checkOutcome();
    expect(b.outcome).toBe('ongoing');
  });

  it('主角血量歸零 ⇒ 判負並發 BATTLE_LOST', () => {
    const b = withBattle({ hp: 1, waves: 0, rows: 1, minPerRow: 1, maxPerRow: 1, eliteChance: 0, gruntDefId: 'luo' });
    let lost = false;
    b.bus.on(EVENT.BATTLE_LOST, () => (lost = true));
    b.start();
    b.enemyPhase(); // 進線，黃2
    b.enemyPhase(); // 黃1
    b.enemyPhase(); // 紅
    b.enemyPhase(); // 攻擊
    expect(b.playerHp).toBe(0);
    expect(b.outcome).toBe('lost');
    expect(lost).toBe(true);
  });

  it('預設（無 battle 設定）＝無限補充波，清場也不判勝（沙盒行為不變）', () => {
    const b = new BattleState({ deckList: deckOf(['hengPi']), rng: seededRng(1), tuning: TUNING });
    b.start();
    for (const e of b.formation.living) e.alive = false;
    b.checkOutcome();
    expect(b.outcome).toBe('ongoing');
    expect(b.wavesLeft).toBe(Infinity);
  });

  it('清場獎勵只領一次：內力 +1 格、抽一張，並等待玩家選擇', () => {
    const b = withBattle({ waves: 2, rows: 3, minPerRow: 1, maxPerRow: 1 });
    b.start();
    for (const e of b.formation.living) e.alive = false;
    const energy = b.energy;
    const reward = b.rewardClearIfNeeded();
    expect(reward).toMatchObject({ energy: TUNING.energyUnit, draw: 1 });
    expect(b.energy).toBe(energy + TUNING.energyUnit);
    expect(b.awaitingWaveChoice).toBe(true);
    expect(b.rewardClearIfNeeded()).toBeNull();
  });

  it('「再來啊」把當前波剩餘排數一次送進，完整消耗一波', () => {
    const b = withBattle({ waves: 2, rows: 3, minPerRow: 1, maxPerRow: 1 });
    b.start();
    for (const e of b.formation.living) e.alive = false;
    b.rewardClearIfNeeded();
    expect(b.challengeNextWave()).toBe(3);
    expect(b.formation.occupiedRankCount()).toBe(3);
    expect(b.wavesLeft).toBe(1);
    expect(b.rowsLeftInWave).toBe(3);
    expect(b.awaitingWaveChoice).toBe(false);
  });

  it('正常結束回合只補一排，送滿本波所有排後才讓 wavesLeft −1', () => {
    const b = withBattle({ waves: 2, rows: 3, minPerRow: 1, maxPerRow: 1 });
    b.start();
    for (const e of b.formation.living) e.alive = false;
    b.enemyPhase();
    expect(b.formation.occupiedRankCount()).toBe(1);
    expect(b.wavesLeft).toBe(2);
    expect(b.rowsLeftInWave).toBe(2);
    b.enemyPhase();
    b.enemyPhase();
    expect(b.wavesLeft).toBe(1);
    expect(b.rowsLeftInWave).toBe(3);
  });

  it('回合結束 DoT 才清場時，正常補一排，清場內力與抽牌延到下回合', () => {
    const b = new BattleState({
      deckList: deckOf(Array(20).fill('hengPi')),
      rng: seededRng(1),
      tuning: TUNING,
      battle: { waves: 2, rows: 3, minPerRow: 1, maxPerRow: 1 },
    });
    b.start();
    for (const e of b.formation.living) e.alive = false;

    const tick = b.statusTurnEnd();
    expect(tick.clearReward).toMatchObject({ energy: TUNING.energyUnit, draw: 1, deferred: true });
    expect(b.awaitingWaveChoice).toBe(false);

    b.enemyPhase();
    expect(b.formation.occupiedRankCount()).toBe(1);
    const transcript = b.endTurn();
    expect(b.energy).toBe(TUNING.energyPerTurn + TUNING.energyUnit);
    expect(transcript.filter((step) => step.type === TX.DRAW && step.source !== 'inspiration'))
      .toHaveLength(TUNING.startingHandSize + 1);
  });

  it('場地無法生成新排時不會空扣補充波內容', () => {
    const b = withBattle({ waves: 2, rows: 1, minPerRow: 1, maxPerRow: 1 });
    b.start();
    b.formation.enemies = [];
    for (let rank = 0; rank <= b.formation.maxRank; rank++) b.formation.addRow(rank, 'luo', 1);
    expect(b.spawnReinforcementRows(1)).toBe(0);
    expect(b.wavesLeft).toBe(2);
    expect(b.rowsLeftInWave).toBe(1);
  });

  it('清場且補充波用盡 ⇒ 直接判勝、不給清場獎勵', () => {
    const b = withBattle({ waves: 0 });
    b.start();
    for (const e of b.formation.living) e.alive = false;
    expect(b.rewardClearIfNeeded()).toBeNull();
    b.checkOutcome();
    expect(b.outcome).toBe('won');
  });
});

describe('遺物·秘籍（BattleState 掛鉤）', () => {
  const withRelics = (relics, deck = ['hengPi']) =>
    new BattleState({ deckList: deckOf(deck), rng: seededRng(1), tuning: TUNING, battle: { relics } });

  it('靈犀玉：戰鬥開始獲得 2 點靈感', () => {
    const b = withRelics(['lingXiYu'], ['hengPi', 'anqi']);
    const tx = b.start();
    expect(b.inspiration).toBe(2);
    expect(tx.slice(0, 2)).toEqual([
      expect.objectContaining({ type: TX.INSPIRATION, source: 'relic', amount: 1, after: 1 }),
      expect.objectContaining({ type: TX.INSPIRATION, source: 'relic', amount: 1, after: 2 }),
    ]);
  });

  it('玄鐵令：每回合內力 +1 格', () => {
    const b = withRelics(['xuanTie']);
    b.start();
    expect(b.energy).toBe(TUNING.energyPerTurn + TUNING.energyUnit);
  });

  it('百寶囊：起手多抽一張', () => {
    const deck = ['pi', 'ci', 'dang', 'buFa', 'saoTang', 'anqi']; // 6 張不同名，不會合成
    const plain = new BattleState({ deckList: deckOf(deck), rng: seededRng(1), tuning: TUNING });
    plain.start();
    const bag = new BattleState({ deckList: deckOf(deck), rng: seededRng(1), tuning: TUNING, battle: { relics: ['baiBao'] } });
    bag.start();
    expect(bag.hand.size).toBe(plain.hand.size + 1);
  });

  it('淬毒袖箭：每回合開始最前排敵人中毒 4', () => {
    const b = withRelics(['cuiDu']);
    b.start();
    expect(b.formation.frontLivingEnemy().statuses.poison).toBe(4);
  });

  it('引燃索：戰鬥開始最近一排敵人燃燒 3', () => {
    const b = withRelics(['yinRan']);
    b.start();
    const near = b.formation.enemiesInRanks(b.formation.nearestRanks(1));
    expect(near.length).toBeGreaterThan(0);
    expect(near.every((e) => e.statuses.burn === 3)).toBe(true);
  });
});

describe('主角屬性（attrs 覆蓋 tuning）', () => {
  it('內力上限：影響每回合內力', () => {
    const b = new BattleState({ deckList: deckOf(['hengPi']), rng: seededRng(1), tuning: TUNING, battle: { attrs: { energyPerTurn: 6 } } });
    b.start();
    expect(b.energy).toBe(6);
  });

  it('起手張數：影響開手張數', () => {
    const deck = ['pi', 'ci', 'dang', 'buFa', 'saoTang', 'anqi', 'guan']; // 7 張不同名，不會合成
    const b = new BattleState({ deckList: deckOf(deck), rng: seededRng(1), tuning: TUNING, battle: { attrs: { startingHandSize: 7 } } });
    b.start();
    expect(b.hand.size).toBe(7);
  });

  it('階級上限：流進合成上限（maxRank 2 → 併到階級二就停）', () => {
    const b = new BattleState({ deckList: deckOf(['pi', 'pi', 'pi', 'pi']), rng: seededRng(42), tuning: TUNING, battle: { attrs: { maxRank: 2 } } });
    b.start();
    expect(b.hand.size).toBe(2); // 四張境界一 → 兩張境界二（到頂不再併）
    expect(b.hand.toArray().every((c) => c.rank === 2)).toBe(true);
  });
});
