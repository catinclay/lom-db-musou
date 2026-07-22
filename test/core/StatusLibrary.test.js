import { describe, it, expect, beforeEach } from 'vitest';
import {
  STATUS,
  applyStatus,
  activeStatuses,
  getStatusDef,
  resolveStatusTick,
} from '../../src/core/StatusLibrary.js';
import { Formation, createEnemy, resetEnemyUid } from '../../src/core/Formation.js';
import { BattleState } from '../../src/core/BattleState.js';
import { seededRng } from '../../src/core/rng.js';
import { TUNING } from '../../src/config/tuning.js';

const enemy = () => ({ statuses: {} });

describe('狀態定義與施加', () => {
  it('四種狀態都有定義（名字、顏色）', () => {
    for (const id of Object.values(STATUS)) {
      const def = getStatusDef(id);
      expect(def.name).toBeTruthy();
      expect(typeof def.color).toBe('number');
    }
  });

  it('applyStatus 累加層數', () => {
    const e = enemy();
    expect(applyStatus(e, STATUS.BURN)).toBe(1);
    expect(applyStatus(e, STATUS.BURN, 2)).toBe(3);
    expect(e.statuses[STATUS.BURN]).toBe(3);
  });

  it('activeStatuses 只列出層數 > 0 的，依定義順序', () => {
    const e = enemy();
    applyStatus(e, STATUS.POISON);
    applyStatus(e, STATUS.BURN);
    expect(activeStatuses(e)).toEqual([STATUS.BURN, STATUS.POISON]); // burn 在 poison 前
  });

  it('未知狀態會爆', () => {
    expect(() => applyStatus(enemy(), 'nope')).toThrow();
  });
});

describe('resolveStatusTick', () => {
  beforeEach(() => resetEnemyUid());

  /** 一個 luo（hp 14）在接觸位，方便觀察 tick */
  const lone = (defId = 'luo') => {
    const f = new Formation();
    const e = createEnemy(defId, 0, 0);
    f.enemies.push(e);
    return { f, e };
  };

  describe('中毒（即時流血、比例衰減）', () => {
    it('出牌小 tick（1 tick）：滴 N 傷後衰減 10%（最少 1 層）', () => {
      const { f, e } = lone();
      applyStatus(e, STATUS.POISON, 3);
      const r = resolveStatusTick(f, 'play', TUNING);
      expect(e.hp).toBe(e.maxHp - 3); // 3 層 × 1
      expect(e.statuses.poison).toBe(2); // 3 − max(1, floor(3×0.1)) = 3 − 1
      expect(r.hits).toHaveLength(1);
      expect(r.hits[0].status).toBe('poison');
    });

    it('回合結束大 tick（3 tick）：逐 tick 滴傷＋衰減，只跳一次總傷', () => {
      const { f, e } = lone();
      applyStatus(e, STATUS.POISON, 3);
      const r = resolveStatusTick(f, 'turnEnd', TUNING);
      // 3→(滴3,衰1)→2→(滴2,衰1)→1→(滴1,衰1)→0；總傷 6、層數 0
      expect(e.hp).toBe(e.maxHp - 6);
      expect(e.statuses.poison).toBe(0);
      expect(r.hits).toHaveLength(1); // 只跳一次數字（總傷）
      expect(r.hits[0].damage).toBe(6);
    });

    it('滴到死就停，總傷不超過血量、只跳一次', () => {
      const { f, e } = lone(); // hp 14
      applyStatus(e, STATUS.POISON, 14); // 第一 tick 就致死
      const r = resolveStatusTick(f, 'turnEnd', TUNING);
      expect(e.alive).toBe(false);
      expect(r.hits).toHaveLength(1);
      expect(r.hits[0].killed).toBe(true);
      expect(r.hits[0].damage).toBe(14);
    });
  });

  describe('燃燒（蓄力引爆）', () => {
    it('出牌小 tick：火自己疊層 +playGrowth，不掉血', () => {
      const { f, e } = lone();
      applyStatus(e, STATUS.BURN, 3);
      const r = resolveStatusTick(f, 'play', TUNING);
      expect(e.hp).toBe(e.maxHp); // 出牌不掉血
      expect(e.statuses.burn).toBe(4); // 3 + 1
      expect(r.hits).toHaveLength(0);
      expect(r.changed).toContain(e.uid);
    });

    it('回合結束大 tick：依層數引爆（每層 detonateDamage）後快衰', () => {
      const { f, e } = lone();
      applyStatus(e, STATUS.BURN, 3);
      const r = resolveStatusTick(f, 'turnEnd', TUNING);
      expect(e.hp).toBe(e.maxHp - 3); // 3 層 × 每層 1 傷
      expect(e.statuses.burn).toBe(1); // floor(3 × 0.34)
      expect(r.hits[0].damage).toBe(3);
      expect(r.hits[0].status).toBe('burn');
    });

    it('引爆致死時層數歸零', () => {
      const { f, e } = lone(); // hp 14
      applyStatus(e, STATUS.BURN, 14); // 14 層 × 每層 1 傷 = 14
      const r = resolveStatusTick(f, 'turnEnd', TUNING);
      expect(e.alive).toBe(false);
      expect(e.statuses.burn).toBe(0);
      expect(r.hits[0].killed).toBe(true);
    });
  });

  it('中毒先結算：若毒把敵人滴死，燃燒就不再引爆', () => {
    const { f, e } = lone();
    applyStatus(e, STATUS.POISON, 14); // 一滴致死
    applyStatus(e, STATUS.BURN, 5);
    const r = resolveStatusTick(f, 'turnEnd', TUNING);
    expect(e.alive).toBe(false);
    expect(r.hits.every((h) => h.status === 'poison')).toBe(true); // 沒有燃燒傷害
  });
});

describe('出牌卡上狀態（BattleState.playCard）', () => {
  beforeEach(() => resetEnemyUid());

  it('毒霧籠罩最近三排並上毒（無直接傷害），新上的毒延到下次出牌才 tick', () => {
    const battle = new BattleState({
      deckList: [{ defId: 'duWu' }, { defId: 'yunQi' }],
      rng: seededRng(1),
      tuning: TUNING,
    });
    battle.start();
    // 換成已知的四排，只有最近三排該中毒
    battle.formation.enemies = [];
    battle.formation.addRow(0, 'luo', 2);
    battle.formation.addRow(1, 'luo', 2);
    battle.formation.addRow(2, 'luo', 2);
    battle.formation.addRow(3, 'luo', 2); // 第四排不該被籠罩
    const near = battle.formation.enemiesInRanks([0, 1, 2]);
    const far = battle.formation.enemiesInRanks([3]);

    const card = battle.hand.toArray().find((c) => c.defId === 'duWu');
    const played = battle.playCard(card.uid);
    expect(played.ok).toBe(true);

    for (const e of near) {
      expect(e.statuses.poison).toBe(played.result.effect.statusStacks); // 新上的 3 層當次不 tick
      expect(e.hp).toBe(e.maxHp); // 純上狀態，首次毒傷延到下一張牌
    }
    for (const e of far) {
      expect(e.statuses.poison ?? 0).toBe(0); // 第四排沒事
      expect(e.hp).toBe(e.maxHp);
    }

    const next = battle.hand.toArray().find((c) => c.defId === 'yunQi');
    battle.playCard(next.uid);
    for (const e of near) {
      expect(e.statuses.poison).toBe(2); // 下一次出牌才滴 3 傷、衰減 1 層
      expect(e.hp).toBe(e.maxHp - 3);
    }
  });

  it('火藥炸開一片並上燃燒（無直接傷害），新上的火延到下次出牌才成長', () => {
    const battle = new BattleState({
      deckList: [{ defId: 'huoYao' }, { defId: 'yunQi' }],
      rng: seededRng(1),
      tuning: TUNING,
    });
    battle.start();
    battle.formation.enemies = [];
    battle.formation.addRow(0, 'luo', 1); // 單獨一人在最近排，方塊必含它
    const e = battle.formation.frontLivingEnemy();

    const card = battle.hand.toArray().find((c) => c.defId === 'huoYao');
    const played = battle.playCard(card.uid);

    expect(e.statuses.burn).toBe(played.result.effect.statusStacks); // 新上的 3 層當次不成長
    expect(e.hp).toBe(e.maxHp); // 無直接傷害，燃燒出牌也不掉血

    const next = battle.hand.toArray().find((c) => c.defId === 'yunQi');
    battle.playCard(next.uid);
    expect(e.statuses.burn).toBe(4); // 下一次出牌才從 3 疊到 4
  });

  it('階級決定每波層數，連擊多波會各自套用到命中敵人', () => {
    const battle = new BattleState({ deckList: [], rng: seededRng(1), tuning: TUNING });
    battle.start();
    battle.formation.enemies = [];
    battle.formation.addRow(0, 'han', 1);
    const e = battle.formation.frontLivingEnemy();

    battle.debugAddCard('yunQi', { rank: 1 });
    battle.playCard(battle.hand.toArray().find((c) => c.defId === 'yunQi').uid);
    battle.debugAddCard('duWu', { rank: 2 });
    const played = battle.playCard(battle.hand.toArray().find((c) => c.defId === 'duWu').uid);

    expect(played.result.combo.combo).toBe(2);
    expect(played.result.effect).toMatchObject({ statusStacks: 5, hits: 2 }); // 每波 round(3×1.5)，共兩波
    expect(e.statuses.poison).toBe(10); // 同一敵人每波各吃 5
    expect(e.hp).toBe(e.maxHp);
  });

});
