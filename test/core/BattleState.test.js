import { describe, it, expect, beforeEach } from 'vitest';
import { BattleState } from '../../src/core/BattleState.js';
import { resetUidCounter, TAG } from '../../src/core/Card.js';
import { seededRng } from '../../src/core/rng.js';
import { TUNING } from '../../src/config/tuning.js';
import { TX } from '../../src/core/transcript.js';
import { EVENT } from '../../src/core/events.js';

const deckOf = (specs) => specs.map((s) => (typeof s === 'string' ? { defId: s } : s));

/** 預設關掉補抽機率，讓戰鬥流程的測試不受骰子干擾 */
const battle = (deckList, overrides = {}) =>
  new BattleState({
    deckList,
    rng: seededRng(42),
    tuning: {
      ...TUNING,
      mergeDraw: { baseChance: 0, decayPerMerge: 0, minChance: 0 },
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
    expect(b.hand.get(0).realm).toBe(3); // 四張境界1 → 兩張境界2 → 一張境界3
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
    expect(b.hand.get(0).realm).toBe(3);

    b.start();
    expect(b.hand.get(0).realm).toBe(3); // 又從 4 張境界1 重新合成，而非從境界3 起跳
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
    b.playCard(b.hand.get(0).uid); // 橫劈/暗器皆 1 費
    expect(b.energy).toBe(2);
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
    b.playCard(card.uid);
    expect(b.hand.findByUid(card.uid)).toBeUndefined();
    expect(b.deck.discardCount).toBe(1);
  });

  it('傷害走 resolveEffect（境界 × 連段）', () => {
    const b = battle(deckOf([{ defId: 'hengPi', realm: 3 }]), {
      startingHandSize: 1,
      energyPerTurn: 9,
    });
    b.start();
    expect(b.playCard(b.hand.get(0).uid).result.damage).toBe(18); // 橫劈境界3：round(7 × 2.5)
  });

  it('連段倍率確實套用到傷害', () => {
    const b = battle(deckOf([{ defId: 'hengPi', realm: 1 }, { defId: 'hengPi', realm: 2 }]), {
      startingHandSize: 2,
      energyPerTurn: 9,
    });
    b.start();
    const r1 = b.hand.toArray().find((c) => c.realm === 1);
    const r2 = b.hand.toArray().find((c) => c.realm === 2);

    expect(b.playCard(r1.uid).result.damage).toBe(7 * 1 * 1); // 境界1 ×1
    expect(b.playCard(r2.uid).result.damage).toBe(22); // 境界2 round(7×1.5)=11、連段×2
  });

  it('★ 暗器的連段加的是發數不是傷害', () => {
    const b = battle(deckOf([{ defId: 'hengPi', realm: 1 }, { defId: 'anqi', realm: 2 }]), {
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
    expect(b.combo.step).toBe(0);
    expect(b.combo.lastRealm).toBeNull();
  });

  it('★ 補抽機率的計數每回合重置', () => {
    const b = battle(deckOf(['pi', 'pi', 'dang', 'dang', 'ci', 'ci', 'buFa', 'buFa']), {
      startingHandSize: 4,
    });
    b.start();
    expect(b.mergesThisTurn).toBeGreaterThan(0);
    b.endTurn();
    // 新回合起手若又合成，計數是從 0 重新算的
    expect(b.mergesThisTurn).toBeLessThanOrEqual(2);
  });

  it('回合數遞增', () => {
    const b = battle(deckOf(['pi', 'ci', 'dang', 'buFa']), { startingHandSize: 1 });
    b.start();
    expect(b.turn).toBe(1);
    b.endTurn();
    expect(b.turn).toBe(2);
  });
});

describe('忘形合成（透過 BattleState）', () => {
  it('拖曳合成生效並發事件', () => {
    const b = battle(deckOf([{ defId: 'pi', tags: [TAG.FORMLESS] }, { defId: 'dang' }]), {
      startingHandSize: 2,
    });

    let emitted = null;
    b.bus.on(EVENT.TRANSCRIPT, (t) => (emitted = t));
    b.start();

    const pi = b.hand.toArray().find((c) => c.defId === 'pi');
    const dang = b.hand.toArray().find((c) => c.defId === 'dang');
    b.formlessMerge(pi.uid, dang.uid);

    expect(b.hand.size).toBe(1);
    expect(b.hand.get(0).defId).toBe('dang');
    expect(b.hand.get(0).realm).toBe(2);
    expect(emitted).not.toBeNull();
  });

  it('不合法的配對回傳 null 且不動手牌', () => {
    const b = battle(deckOf(['pi', 'dang']), { startingHandSize: 2 });
    b.start();
    const [a, c] = b.hand.toArray();
    expect(b.formlessMerge(a.uid, c.uid)).toBeNull();
    expect(b.hand.size).toBe(2);
  });
});

describe('功能牌（技能）', () => {
  it('運氣調息：不耗內力、內力 +境界', () => {
    const b = battle(deckOf([{ defId: 'yunQi', realm: 2 }]), {
      startingHandSize: 1,
      energyPerTurn: 3,
    });
    b.start();
    const r = b.playCard(b.hand.get(0).uid);
    expect(r.ok).toBe(true);
    expect(b.energy).toBe(5); // 3 − 0（費）+ 2（境界二）
  });

  it('臨機應變：耗一內力、抽（境界+1）張，並回傳抽牌 transcript', () => {
    const b = battle(deckOf(['pi', 'ci', 'dang', 'buFa']), {
      startingHandSize: 0, // 起手空手，牌庫留 4 張給抽
      energyPerTurn: 3,
    });
    b.start();
    b.debugAddCard('linJi'); // 手動塞一張，避免靠洗牌運氣
    const linJi = b.hand.toArray().find((c) => c.defId === 'linJi');
    const r = b.playCard(linJi.uid);

    expect(b.energy).toBe(2); // 3 − 1
    expect(r.result.transcript.filter((e) => e.type === TX.DRAW)).toHaveLength(2); // 境界一抽 2
    expect(b.hand.size).toBe(2); // 打掉臨機應變、抽 2 張（皆不同名，不合成）
  });
});

describe('敵人相位', () => {
  it('敵人剛到最前排先備戰，不會馬上攻擊；下回合才挨打', () => {
    const b = battle(deckOf(['guan']), { startingHandSize: 0 });
    b.start(); // 敵人在 rank 1〜4
    const hp0 = b.playerHp;
    b.enemyPhase(); // 前排前進到接觸位、亮起備戰
    expect(b.playerHp).toBe(hp0); // 這回合還沒挨打
    b.enemyPhase(); // 備戰過了，這回合才攻擊
    expect(b.playerHp).toBeLessThan(hp0);
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
    expect(b.hand.get(0).realm).toBe(2);
  });

  it('debugAddCard 可指定境界與忘形', () => {
    const b = battle(deckOf(['dang']), { startingHandSize: 1 });
    b.start();
    b.debugAddCard('anqi', { realm: 5, tags: [TAG.FORMLESS] });
    const anqi = b.hand.toArray().find((c) => c.defId === 'anqi');
    expect(anqi.realm).toBe(5);
    expect(anqi.tags).toContain(TAG.FORMLESS);
  });

  it('debugDraw 抽牌並解算連鎖', () => {
    const b = battle(deckOf(['pi', 'pi']), { startingHandSize: 1 });
    b.start();
    b.debugDraw(1);
    expect(b.hand.size).toBe(1);
    expect(b.hand.get(0).realm).toBe(2);
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
    const b = withBattle({ hp: 1, waves: 9 });
    let lost = false;
    b.bus.on(EVENT.BATTLE_LOST, () => (lost = true));
    b.start();
    b.enemyPhase(); // 前排前進到接觸位、亮起備戰
    b.enemyPhase(); // 備戰過了 → 攻擊，1 滴血扛不住
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

  it('清場但還有補充波 ⇒ 下一波當下湧上（不必等回合結束），wavesLeft −1', () => {
    const b = withBattle({ waves: 2 });
    b.start();
    for (const e of b.formation.living) e.alive = false;
    expect(b.maybeRushNextWave()).toBe(true);
    expect(b.formation.isEmpty).toBe(false); // 新一波已湧上
    expect(b.wavesLeft).toBe(1);
    b.checkOutcome();
    expect(b.outcome).toBe('ongoing'); // 還有敵人、還沒判勝
  });

  it('清場且補充波用盡 ⇒ 不補、判勝', () => {
    const b = withBattle({ waves: 0 });
    b.start();
    for (const e of b.formation.living) e.alive = false;
    expect(b.maybeRushNextWave()).toBe(false);
    b.checkOutcome();
    expect(b.outcome).toBe('won');
  });
});
