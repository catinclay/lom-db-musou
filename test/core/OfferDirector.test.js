import { describe, expect, it } from 'vitest';
import { offerKeyForNode, offerRiskForNode, offerRoleForNode } from '../../src/core/OfferDirector.js';
import { RunState } from '../../src/core/RunState.js';
import { seededRng } from '../../src/core/rng.js';

describe('時辰選項導演', () => {
  it('每組都有安穩選項、不重複內容，且至少涵蓋兩種功能', () => {
    const run = new RunState({ rng: seededRng(42) });

    for (let i = 0; i < 200; i++) {
      const offer = run.rollOffer();
      const risks = offer.map(offerRiskForNode);
      const keys = offer.map(offerKeyForNode);
      const roles = offer.map(offerRoleForNode);

      expect(offer).toHaveLength(run.tuning.run.offer.size);
      expect(risks).toContain('safe');
      expect(new Set(keys).size).toBe(offer.length);
      expect(new Set(roles).size).toBeGreaterThanOrEqual(2);
    }
  });

  it('客棧低頻：同一天最多只進一次候選池', () => {
    const run = new RunState({ rng: () => 0 });
    run.hp = 1;
    expect(run.rollOffer().some((node) => node.kind === 'inn')).toBe(true);

    for (let i = 0; i < 20; i++) {
      expect(run.rollOffer().some((node) => node.kind === 'inn')).toBe(false);
    }
  });

  it('沒有代幣時不出賭坊；有代幣後才可能出現', () => {
    const run = new RunState({ rng: () => 0 });
    expect(run.rollOffer().some((node) => node.kind === 'casino')).toBe(false);

    run.slotTokens = 1;
    expect(run.rollOffer().some((node) => node.kind === 'casino')).toBe(true);
  });

  it('低血救濟每天最多一次、整局最多兩次', () => {
    const run = new RunState({ rng: () => 0 });
    run.hp = 1;
    run.money = 0;

    expect(run.rollOffer().some((node) => node.eventId === 'yuanShou')).toBe(true);
    expect(run.mercyUsed).toBe(1);
    expect(run.rollOffer().some((node) => node.eventId === 'yuanShou')).toBe(false);

    run.advanceDay();
    expect(run.rollOffer().some((node) => node.eventId === 'yuanShou')).toBe(true);
    expect(run.mercyUsed).toBe(2);

    run.advanceDay();
    expect(run.rollOffer().some((node) => node.eventId === 'yuanShou')).toBe(false);
  });

  it('山亭歇腳只回血並消耗時辰，不給其他獎勵', () => {
    const run = new RunState({ rng: seededRng(7) });
    run.hp = 1;
    run.money = 0;
    run.rollOffer();
    const index = run.offer.findIndex((node) => node.eventId === 'yuanShou');
    const before = { money: run.money, deck: run.deck.length, relics: run.relics.length };

    const visit = run.takeOffer(index);
    run.resolveEventChoice(visit.node, 0);

    expect(run.hp).toBe(1 + Math.ceil(run.maxHp * run.tuning.run.offer.lowHpMercy.healMaxHpRatio));
    expect({ money: run.money, deck: run.deck.length, relics: run.relics.length }).toEqual(before);
    expect(run.eventsDoneToday).toBe(1);
  });
});
