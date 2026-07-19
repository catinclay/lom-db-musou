import { describe, it, expect, beforeEach } from 'vitest';
import { Hand } from '../../src/core/Hand.js';
import { Deck } from '../../src/core/Deck.js';
import { createCard, resetUidCounter, TAG, isFormless, cardEnchants } from '../../src/core/Card.js';
import {
  resolveAutoMerges,
  applyFormlessMerge,
  canFormlessMerge,
  findFirstAutoMergePair,
  drawChanceFor,
} from '../../src/core/MergeEngine.js';
import { TX } from '../../src/core/transcript.js';
import { TUNING } from '../../src/config/tuning.js';
import { seededRng } from '../../src/core/rng.js';

/** 預設把補抽關掉，讓合成邏輯的測試不受機率干擾 */
const tuning = (overrides = {}) => ({
  ...TUNING,
  mergeDraw: { baseChance: 0, decayPerMerge: 0, minChance: 0 },
  ...overrides,
});

/** 必定補抽 */
const alwaysDraw = (overrides = {}) =>
  tuning({ mergeDraw: { baseChance: 1, decayPerMerge: 0, minChance: 1 }, ...overrides });

const ctx = (handCards, deckCards = [], rng = seededRng(1)) => ({
  hand: new Hand(handCards),
  deck: new Deck(deckCards, rng),
  rng,
  mergesThisTurn: 0,
});

beforeEach(() => resetUidCounter());

describe('同名自動合成', () => {
  it('兩張同名同境界合成，境界 +1', () => {
    const c = ctx([createCard('pi'), createCard('pi')]);
    const t = resolveAutoMerges(c, tuning());

    expect(c.hand.size).toBe(1);
    expect(c.hand.get(0).defId).toBe('pi');
    expect(c.hand.get(0).realm).toBe(2); // 境界1 + 境界1 → 境界2
    expect(t.filter((e) => e.type === TX.MERGE)).toHaveLength(1);
  });

  it('同名但不同境界 ⇒ 不自動合成（同境界才合成）', () => {
    const c = ctx([createCard('pi', { realm: 2 }), createCard('pi', { realm: 1 })]);
    expect(resolveAutoMerges(c, tuning())).toHaveLength(0);
    expect(c.hand.size).toBe(2);
  });

  it('境界差很多的同名牌也不合成', () => {
    const c = ctx([createCard('pi', { realm: 7 }), createCard('pi', { realm: 1 })]);
    expect(resolveAutoMerges(c, tuning())).toHaveLength(0);
    expect(c.hand.size).toBe(2);
  });

  it('不同名不合成', () => {
    const c = ctx([createCard('pi'), createCard('dang')]);
    expect(resolveAutoMerges(c, tuning())).toHaveLength(0);
    expect(c.hand.size).toBe(2);
  });

  it('結果卡落在較左的位置', () => {
    const c = ctx([
      createCard('dang'), // 0
      createCard('pi'), // 1  ← 結果該落在這
      createCard('ci'), // 2
      createCard('pi'), // 3
    ]);
    resolveAutoMerges(c, tuning());

    expect(c.hand.toArray().map((x) => x.defId)).toEqual(['dang', 'pi', 'ci']);
    expect(c.hand.get(1).realm).toBe(2);
  });

  it('結果拿到新 uid（對 UI 而言是新生的物件）', () => {
    const a = createCard('pi');
    const b = createCard('pi');
    const c = ctx([a, b]);
    resolveAutoMerges(c, tuning());

    expect(c.hand.get(0).uid).not.toBe(a.uid);
    expect(c.hand.get(0).uid).not.toBe(b.uid);
  });

  it('累計 mergesThisTurn', () => {
    const c = ctx([createCard('pi'), createCard('pi'), createCard('dang'), createCard('dang')]);
    resolveAutoMerges(c, tuning());
    expect(c.mergesThisTurn).toBe(2);
  });
});

describe('最左配對優先（決定性）', () => {
  it('三張同名同境界時取最左的兩張', () => {
    const a = createCard('pi');
    const b = createCard('pi');
    const cc = createCard('pi');
    const c = ctx([a, b, cc]);
    const t = resolveAutoMerges(c, tuning());

    // 最左兩張先合（a+b → 境界2），剩下的境界1 湊不成同境界對，鏈停
    const firstMerge = t.find((e) => e.type === TX.MERGE);
    expect(firstMerge.consumed).toEqual([a.uid, b.uid]);
    expect(c.hand.toArray().map((x) => x.realm)).toEqual([2, 1]);
  });

  it('同輸入必得同輸出', () => {
    const run = () => {
      resetUidCounter();
      const c = ctx(
        [createCard('pi'), createCard('dang'), createCard('pi'), createCard('pi')],
        [createCard('ci'), createCard('dang'), createCard('pi')],
        seededRng(9)
      );
      resolveAutoMerges(c, alwaysDraw());
      return c.hand.toArray().map((x) => `${x.defId}:${x.realm}`);
    };
    expect(run()).toEqual(run());
  });

  it('findFirstAutoMergePair 回傳最左配對', () => {
    const hand = new Hand([
      createCard('dang'),
      createCard('pi'),
      createCard('dang'),
      createCard('pi'),
    ]);
    expect(findFirstAutoMergePair(hand)).toEqual([0, 2]);
  });
});

describe('連鎖與終止性', () => {
  it('同名同境界可 2048 式層層合成，且必然終止', () => {
    // 四張境界1 → 兩張境界2 → 一張境界3（合成只 +1，不相加）
    const c = ctx([createCard('pi'), createCard('pi'), createCard('pi'), createCard('pi')]);
    const t = resolveAutoMerges(c, tuning());

    expect(t.some((e) => e.type === TX.CHAIN_GUARD_TRIPPED)).toBe(false);
    expect(c.hand.size).toBe(1);
    expect(c.hand.get(0).realm).toBe(3);
    expect(t.filter((e) => e.type === TX.MERGE)).toHaveLength(3);
  });

  it('★ 補抽的牌可再引爆合成（連鎖引擎的核心）', () => {
    // 手牌 [劈, 劈, 擋]，牌庫只有一張擋。
    // 劈+劈 合成 → 補抽出那張擋 → 新抽的擋與手上的擋湊對 → 第二次合成。
    // 若補抽不會觸發重新檢查，第二次合成永遠不會發生。
    const c = ctx([createCard('pi'), createCard('pi'), createCard('dang')], [createCard('dang')]);
    const t = resolveAutoMerges(c, alwaysDraw());

    const merges = t.filter((e) => e.type === TX.MERGE);
    expect(merges).toHaveLength(2);

    const firstDrawAt = t.findIndex((e) => e.type === TX.DRAW);
    const secondMergeAt = t.lastIndexOf(merges[1]);
    expect(secondMergeAt).toBeGreaterThan(firstDrawAt);

    expect(c.hand.toArray().map((x) => `${x.defId}:${x.realm}`)).toEqual(['pi:2', 'dang:2']);
  });

  it('骰贏了但牌庫與棄牌堆皆空 ⇒ DRAW_FIZZLE，不崩潰', () => {
    const c = ctx([createCard('pi'), createCard('pi')]);
    const t = resolveAutoMerges(c, alwaysDraw());

    expect(t.filter((e) => e.type === TX.DRAW_FIZZLE)).toHaveLength(1);
    expect(c.hand.size).toBe(1);
  });

  it('補抽會把棄牌堆洗回牌庫', () => {
    const c = ctx([createCard('pi'), createCard('pi')]);
    c.deck.discard(createCard('dang'));
    resolveAutoMerges(c, alwaysDraw());

    expect(c.hand.size).toBe(2);
    expect(c.hand.toArray().some((x) => x.defId === 'dang')).toBe(true);
  });
});

describe('機率補抽', () => {
  it('機率依同回合的合成次數遞減：70/60/50/40/30', () => {
    const t = TUNING;
    expect(drawChanceFor(1, t)).toBeCloseTo(0.7, 5);
    expect(drawChanceFor(2, t)).toBeCloseTo(0.6, 5);
    expect(drawChanceFor(3, t)).toBeCloseTo(0.5, 5);
    expect(drawChanceFor(4, t)).toBeCloseTo(0.4, 5);
    expect(drawChanceFor(5, t)).toBeCloseTo(0.3, 5);
  });

  it('觸底 30% 之後不再往下掉', () => {
    for (const n of [6, 10, 50]) expect(drawChanceFor(n, TUNING)).toBeCloseTo(0.3, 5);
  });

  it('骰輸 ⇒ DRAW_MISS，牌庫沒被動到', () => {
    const c = ctx([createCard('pi'), createCard('pi')], [createCard('dang')]);
    const t = resolveAutoMerges(c, tuning()); // baseChance 0 ⇒ 必定骰輸

    expect(t.filter((e) => e.type === TX.DRAW_MISS)).toHaveLength(1);
    expect(t.filter((e) => e.type === TX.DRAW)).toHaveLength(0);
    expect(c.deck.drawCount).toBe(1);
  });

  it('DRAW_MISS 與 DRAW_FIZZLE 是兩回事', () => {
    // 骰輸：牌庫還有牌
    const miss = ctx([createCard('pi'), createCard('pi')], [createCard('dang')]);
    const t1 = resolveAutoMerges(miss, tuning());
    expect(t1.some((e) => e.type === TX.DRAW_MISS)).toBe(true);
    expect(t1.some((e) => e.type === TX.DRAW_FIZZLE)).toBe(false);

    // 骰贏但沒牌可抽
    const fizzle = ctx([createCard('pi'), createCard('pi')], []);
    const t2 = resolveAutoMerges(fizzle, alwaysDraw());
    expect(t2.some((e) => e.type === TX.DRAW_FIZZLE)).toBe(true);
    expect(t2.some((e) => e.type === TX.DRAW_MISS)).toBe(false);
  });

  it('事件記錄下當時的機率（debug 用）', () => {
    // 用真實的 70%，但把骰子固定成必輸，才驗得到記下來的是 0.7 而不是 0
    const alwaysLose = () => 0.99;
    const c = ctx([createCard('pi'), createCard('pi')], [createCard('dang')], alwaysLose);
    const t = resolveAutoMerges(c, TUNING);
    expect(t.find((e) => e.type === TX.DRAW_MISS).chance).toBeCloseTo(0.7, 5);
  });

  it('機率隨同回合合成次數遞減，且事件如實記下', () => {
    const alwaysLose = () => 0.99;
    const c = ctx(
      [createCard('pi'), createCard('pi'), createCard('dang'), createCard('dang')],
      [],
      alwaysLose
    );
    const t = resolveAutoMerges(c, TUNING);
    const misses = t.filter((e) => e.type === TX.DRAW_MISS);
    expect(misses.map((e) => Math.round(e.chance * 100))).toEqual([70, 60]);
  });

  it('同一顆種子 ⇒ 同樣的補抽結果（測試不靠運氣）', () => {
    const run = () => {
      resetUidCounter();
      const c = ctx(
        Array.from({ length: 4 }, () => createCard('pi')),
        Array.from({ length: 10 }, () => createCard('pi')),
        seededRng(123)
      );
      const t = resolveAutoMerges(c, TUNING);
      return t.map((e) => e.type).join(',');
    };
    expect(run()).toBe(run());
  });

  it('機率補抽下連鎖仍必然終止', () => {
    const c = ctx(
      Array.from({ length: 6 }, () => createCard('pi')),
      Array.from({ length: 30 }, () => createCard('pi')),
      seededRng(5)
    );
    const t = resolveAutoMerges(c, TUNING);
    expect(t.some((e) => e.type === TX.CHAIN_GUARD_TRIPPED)).toBe(false);
  });
});

describe('境界上限', () => {
  it('maxRealm 為 null 時不設限', () => {
    const c = ctx([createCard('pi', { realm: 50 }), createCard('pi', { realm: 50 })]);
    resolveAutoMerges(c, tuning({ maxRealm: null }));
    expect(c.hand.get(0).realm).toBe(51); // 50 → +1
  });

  it('未到頂前照常合成', () => {
    const c = ctx([createCard('pi', { realm: 4 }), createCard('pi', { realm: 4 })]);
    resolveAutoMerges(c, tuning({ maxRealm: 5 }));
    expect(c.hand.size).toBe(1);
    expect(c.hand.get(0).realm).toBe(5); // 4 → 到頂的 5
  });

  it('到頂的兩張不再合成（擋下、非夾住）', () => {
    const c = ctx([createCard('pi', { realm: 5 }), createCard('pi', { realm: 5 })]);
    resolveAutoMerges(c, tuning({ maxRealm: 5 }));
    expect(c.hand.size).toBe(2); // 兩張都留著，沒併
    expect([c.hand.get(0).realm, c.hand.get(1).realm]).toEqual([5, 5]);
  });
});

describe('★ 忘形一律保留（合成後不消耗，是會留下的附魔）', () => {
  it('同名自動合成：忘形保留（忘形劈1 + 劈1 = 忘形劈2）', () => {
    const c = ctx([createCard('pi', { tags: [TAG.FORMLESS] }), createCard('pi')]);
    resolveAutoMerges(c, tuning());

    expect(c.hand.size).toBe(1);
    expect(c.hand.get(0).defId).toBe('pi');
    expect(c.hand.get(0).realm).toBe(2);
    expect(isFormless(c.hand.get(0))).toBe(true); // 忘形還在
  });

  it('忘形長在材料上也一樣傳下去（Tag 取聯集）', () => {
    // 普通劈在左（主體），忘形劈在右（材料）
    const c = ctx([createCard('pi'), createCard('pi', { tags: [TAG.FORMLESS] })]);
    resolveAutoMerges(c, tuning());
    expect(isFormless(c.hand.get(0))).toBe(true);
  });

  it('兩張都是忘形 ⇒ 結果仍是忘形', () => {
    const c = ctx([
      createCard('pi', { tags: [TAG.FORMLESS] }),
      createCard('pi', { tags: [TAG.FORMLESS] }),
    ]);
    resolveAutoMerges(c, tuning());
    expect(isFormless(c.hand.get(0))).toBe(true);
  });

  it('跨名人工合成：忘形保留（忘形劈1 + 暗器1 = 忘形暗器2，可再跨名）', () => {
    const pi = createCard('pi', { tags: [TAG.FORMLESS] });
    const anqi = createCard('anqi');
    const c = ctx([pi, anqi]);

    applyFormlessMerge(c, pi.uid, anqi.uid, tuning());

    expect(c.hand.size).toBe(1);
    expect(c.hand.get(0).defId).toBe('anqi');
    expect(c.hand.get(0).realm).toBe(2);
    expect(isFormless(c.hand.get(0))).toBe(true); // 忘形留下來
  });

  it('忘形卡＝催化劑材料：反拖（非忘形拖到忘形）也是非忘形卡當主體', () => {
    const pi = createCard('pi', { tags: [TAG.FORMLESS] });
    const anqi = createCard('anqi');
    const c = ctx([anqi, pi]);

    // 拖 anqi 到忘形 pi ⇒ 忘形 pi 當催化劑、anqi 當主體
    applyFormlessMerge(c, anqi.uid, pi.uid, tuning());
    expect(c.hand.get(0).defId).toBe('anqi');
    expect(c.hand.get(0).realm).toBe(2);
    expect(isFormless(c.hand.get(0))).toBe(true); // 忘形 tag 保留（不佔上限、一律傳下）
  });

  it('連鎖中途的同名同境界合成也不會誤吃忘形', () => {
    // 忘形劈1 + 劈1 → 忘形劈2（保留）→ 補抽到劈2 → 忘形劈2 + 劈2 → 忘形劈3（仍保留）
    const c = ctx(
      [createCard('pi', { tags: [TAG.FORMLESS] }), createCard('pi')],
      [createCard('pi', { realm: 2 })]
    );
    resolveAutoMerges(c, alwaysDraw());

    expect(c.hand.size).toBe(1);
    expect(c.hand.get(0).realm).toBe(3);
    expect(isFormless(c.hand.get(0))).toBe(true);
  });
});

describe('忘形合成（人工拖曳）', () => {
  it('落點即主體：拖忘形【劈】到同境界【擋】⇒ 得【擋】，境界 +1', () => {
    const pi = createCard('pi', { realm: 2, tags: [TAG.FORMLESS] });
    const dang = createCard('dang', { realm: 2 });
    const c = ctx([pi, dang]);

    applyFormlessMerge(c, pi.uid, dang.uid, tuning());

    expect(c.hand.get(0).defId).toBe('dang');
    expect(c.hand.get(0).realm).toBe(3); // 境界2 + 境界2 → 境界3
  });

  it('雙向：反過來拖【擋】到忘形【劈】⇒ 忘形劈當催化劑、得【擋】+1', () => {
    const pi = createCard('pi', { realm: 2, tags: [TAG.FORMLESS] });
    const dang = createCard('dang', { realm: 2 });
    const c = ctx([pi, dang]);

    applyFormlessMerge(c, dang.uid, pi.uid, tuning());

    expect(c.hand.get(0).defId).toBe('dang'); // 忘形 pi 是催化劑 → dang 當主體
    expect(c.hand.get(0).realm).toBe(3);
  });

  it('兩張都不帶忘形 ⇒ 不合法', () => {
    const a = createCard('pi');
    const b = createCard('dang');
    const c = ctx([a, b]);

    expect(applyFormlessMerge(c, a.uid, b.uid, tuning())).toBeNull();
    expect(c.hand.size).toBe(2);
  });

  it('拖到自己身上 ⇒ 不合法', () => {
    const a = createCard('pi', { tags: [TAG.FORMLESS] });
    const c = ctx([a, createCard('dang')]);

    expect(applyFormlessMerge(c, a.uid, a.uid, tuning())).toBeNull();
    expect(c.hand.size).toBe(2);
  });

  it('結果落在 target 的位置', () => {
    const other = createCard('ci');
    const pi = createCard('pi', { tags: [TAG.FORMLESS] });
    const dang = createCard('dang');
    const c = ctx([pi, other, dang]);

    applyFormlessMerge(c, pi.uid, dang.uid, tuning());
    expect(c.hand.toArray().map((x) => x.defId)).toEqual(['ci', 'dang']);
  });

  it('忘形合成也走機率補抽', () => {
    const pi = createCard('pi', { tags: [TAG.FORMLESS] });
    const dang = createCard('dang');
    const c = ctx([pi, dang], [createCard('ci')]);

    const t = applyFormlessMerge(c, pi.uid, dang.uid, alwaysDraw());
    expect(t.filter((e) => e.type === TX.DRAW)).toHaveLength(1);
  });

  it('★ 忘形合成後引爆後續自動合成鏈', () => {
    // 忘形劈1 拖到 擋1 → 忘形擋2 → 與手上另一張 擋2 同境界自動合成 → 忘形擋3
    const pi = createCard('pi', { realm: 1, tags: [TAG.FORMLESS] });
    const dang1 = createCard('dang', { realm: 1 });
    const dang2 = createCard('dang', { realm: 2 });
    const c = ctx([pi, dang1, dang2]);

    const t = applyFormlessMerge(c, pi.uid, dang1.uid, tuning());

    const merges = t.filter((e) => e.type === TX.MERGE);
    expect(merges).toHaveLength(2); // 人工合成 1 次 + 自動連鎖 1 次
    expect(merges[0].auto).toBe(false);
    expect(merges[1].auto).toBe(true);

    expect(c.hand.size).toBe(1);
    expect(c.hand.get(0).defId).toBe('dang');
    expect(c.hand.get(0).realm).toBe(3);
  });

  it('canFormlessMerge 判定（同境界）', () => {
    const plain = createCard('pi');
    const other = createCard('dang');
    const formless = createCard('ci', { tags: [TAG.FORMLESS] });

    expect(canFormlessMerge(plain, other)).toBe(false); // 跨名卻無忘形
    expect(canFormlessMerge(formless, other)).toBe(true); // 同境界靠忘形跨名
    expect(canFormlessMerge(other, formless)).toBe(true);
    expect(canFormlessMerge(formless, formless)).toBe(false); // 同一張
  });
});

describe('忘形＝跨境界催化劑', () => {
  it('忘形卡可跨境界合成：主體境界 +1，材料境界被忽略', () => {
    const f4 = createCard('pi', { realm: 4, tags: [TAG.FORMLESS] });
    const a1 = createCard('anqi', { realm: 1 });
    const c = ctx([f4, a1]);
    applyFormlessMerge(c, f4.uid, a1.uid, tuning());
    expect(c.hand.size).toBe(1);
    expect(c.hand.get(0).defId).toBe('anqi');
    expect(c.hand.get(0).realm).toBe(2); // 主體 a1 的 1 +1，忽略 f4 的 4
  });

  it('canFormlessMerge：忘形不同境界也過（主體未到頂）', () => {
    const f3 = createCard('pi', { realm: 3, tags: [TAG.FORMLESS] });
    const a1 = createCard('anqi', { realm: 1 });
    expect(canFormlessMerge(f3, a1, tuning())).toBe(true);
  });

  it('但主體已到頂（境界五）仍擋下', () => {
    const f3 = createCard('pi', { realm: 3, tags: [TAG.FORMLESS] });
    const a5 = createCard('anqi', { realm: 5 });
    expect(canFormlessMerge(f3, a5, tuning())).toBe(false); // a5 當主體、已到頂
    const c = ctx([f3, a5]);
    expect(applyFormlessMerge(c, f3.uid, a5.uid, tuning())).toBeNull();
  });
});

describe('★ 附魔上限與隨機篩', () => {
  const ench = (card) => Object.fromEntries(cardEnchants(card));
  const totalLevel = (card) => Object.values(ench(card)).reduce((s, n) => s + n, 0);

  it('未超上限 ⇒ 全留（2^(境界-1)）', () => {
    // 兩張境界二各 poison level2（共 4 單位）→ 境界三、上限 4 → 全留
    const c = ctx([
      createCard('hengPi', { realm: 2, enchants: { poison: 2 } }),
      createCard('hengPi', { realm: 2, enchants: { poison: 2 } }),
    ]);
    resolveAutoMerges(c, tuning());
    expect(c.hand.get(0).realm).toBe(3);
    expect(ench(c.hand.get(0))).toEqual({ poison: 4 });
  });

  it('超過上限 ⇒ 隨機篩到上限（總 level = cap）', () => {
    // 兩張境界一各 poison level2（共 4 單位）→ 境界二、上限 2 → 篩到 2
    const c = ctx(
      [
        createCard('hengPi', { realm: 1, enchants: { poison: 2 } }),
        createCard('hengPi', { realm: 1, enchants: { poison: 2 } }),
      ],
      [],
      seededRng(1)
    );
    resolveAutoMerges(c, tuning());
    expect(c.hand.get(0).realm).toBe(2);
    expect(totalLevel(c.hand.get(0))).toBe(2);
  });

  it('忘形跨境界時材料附魔也倒入、超上限一起隨機篩', () => {
    const f4 = createCard('hengPi', { realm: 4, tags: [TAG.FORMLESS], enchants: { poison: 8 } });
    const a1 = createCard('anqi', { realm: 1 });
    const c = ctx([f4, a1], [], seededRng(1));
    applyFormlessMerge(c, f4.uid, a1.uid, tuning());
    expect(c.hand.get(0).defId).toBe('anqi');
    expect(c.hand.get(0).realm).toBe(2);
    expect(totalLevel(c.hand.get(0))).toBe(2); // 上限 2
  });
});

describe('到頂（maxRealm）不再合成', () => {
  it('催化劑吃不動已到頂的牌', () => {
    const cat = createCard('wangXing'); // realmless 催化劑
    const a5 = createCard('anqi', { realm: 5 });
    expect(canFormlessMerge(cat, a5, tuning({ maxRealm: 5 }))).toBe(false);

    const c = ctx([cat, a5]);
    expect(applyFormlessMerge(c, cat.uid, a5.uid, tuning({ maxRealm: 5 }))).toBeNull();
    expect(c.hand.size).toBe(2); // 沒併，兩張都在
  });

  it('未到頂時催化劑照常 +1', () => {
    const cat = createCard('wangXing');
    const a4 = createCard('anqi', { realm: 4 });
    const c = ctx([cat, a4]);
    expect(applyFormlessMerge(c, cat.uid, a4.uid, tuning({ maxRealm: 5 }))).not.toBeNull();
    expect(c.hand.size).toBe(1);
    expect(c.hand.get(0).realm).toBe(5); // 4 → 到頂的 5
  });
});

describe('忘形催化劑（realmless）', () => {
  it('不帶境界、且本質帶忘形 tag', () => {
    const w = createCard('wangXing');
    expect(w.realm).toBeNull();
    expect(isFormless(w)).toBe(true);
  });

  it('不參與自動合成（兩張催化劑也不會自動合）', () => {
    const c = ctx([createCard('wangXing'), createCard('wangXing')]);
    expect(resolveAutoMerges(c, tuning())).toHaveLength(0);
    expect(c.hand.size).toBe(2);
  });

  it('與任一張卡合成 ⇒ 那張卡境界 +1，並被印上忘形（催化劑把忘形附魔留下）', () => {
    const w = createCard('wangXing');
    const pi = createCard('pi', { realm: 3 });
    const c = ctx([w, pi]);

    applyFormlessMerge(c, w.uid, pi.uid, tuning());

    expect(c.hand.size).toBe(1);
    expect(c.hand.get(0).defId).toBe('pi');
    expect(c.hand.get(0).realm).toBe(4); // 境界 +1
    expect(isFormless(c.hand.get(0))).toBe(true); // 忘形被印進這張牌
  });

  it('反向拖（把真牌拖到催化劑上）也一樣：真牌 +1 並帶忘形', () => {
    const w = createCard('wangXing');
    const pi = createCard('pi', { realm: 3 });
    const c = ctx([pi, w]);

    applyFormlessMerge(c, pi.uid, w.uid, tuning());

    expect(c.hand.size).toBe(1);
    expect(c.hand.get(0).defId).toBe('pi');
    expect(c.hand.get(0).realm).toBe(4);
    expect(isFormless(c.hand.get(0))).toBe(true);
  });

  it('可加在不同名的任一張卡上（跨名也行，因為只是 +1）', () => {
    const w = createCard('wangXing');
    const anqi = createCard('anqi', { realm: 3 });
    const c = ctx([w, anqi]);

    applyFormlessMerge(c, w.uid, anqi.uid, tuning());

    expect(c.hand.size).toBe(1);
    expect(c.hand.get(0).defId).toBe('anqi');
    expect(c.hand.get(0).realm).toBe(4);
  });
});

describe('★ 附魔隨合成累加（level）', () => {
  /** 卡身上的附魔攤成 { 狀態: level } 方便斷言 */
  const ench = (card) => Object.fromEntries(cardEnchants(card));

  it('createCard 只帶「外加」附魔（毒霧/火藥的毒火是卡效果、不進 enchants）', () => {
    expect(ench(createCard('duWu'))).toEqual({});
    expect(ench(createCard('hengPi'))).toEqual({});
    expect(ench(createCard('hengPi', { enchants: { poison: 2 } }))).toEqual({ poison: 2 });
  });

  it('同名同魔自動合成 ⇒ level 相加', () => {
    const c = ctx([
      createCard('hengPi', { enchants: { poison: 1 } }),
      createCard('hengPi', { enchants: { poison: 1 } }),
    ]);
    resolveAutoMerges(c, tuning());
    expect(c.hand.size).toBe(1);
    expect(c.hand.get(0).realm).toBe(2);
    expect(ench(c.hand.get(0))).toEqual({ poison: 2 }); // 1 + 1
  });

  it('跨名人工合成 ⇒ 不同種魔並存', () => {
    const pi = createCard('hengPi', { tags: [TAG.FORMLESS], enchants: { poison: 1 } });
    const anqi = createCard('anqi', { enchants: { burn: 1 } });
    const c = ctx([pi, anqi]);

    applyFormlessMerge(c, pi.uid, anqi.uid, tuning());

    expect(c.hand.size).toBe(1);
    expect(c.hand.get(0).defId).toBe('anqi');
    expect(ench(c.hand.get(0))).toEqual({ poison: 1, burn: 1 });
  });

  it('無魔的牌併進附魔牌不會稀釋附魔', () => {
    const pi = createCard('hengPi', { tags: [TAG.FORMLESS] }); // 無魔
    const anqi = createCard('anqi', { enchants: { burn: 2 } });
    const c = ctx([pi, anqi]);

    applyFormlessMerge(c, pi.uid, anqi.uid, tuning());
    expect(ench(c.hand.get(0))).toEqual({ burn: 2 });
  });
});
