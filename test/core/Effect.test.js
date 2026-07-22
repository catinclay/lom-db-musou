import { describe, it, expect } from 'vitest';
import { resolveEffect, cardFaceValue } from '../../src/core/Effect.js';
import { getCardDef } from '../../src/core/CardLibrary.js';

const hengPi = () => getCardDef('hengPi'); // 單發傷害 7，走預設境界曲線
const anqi = () => getCardDef('anqi');
const duWu = () => getCardDef('duWu');
// 護甲牌已從遊戲移除，護甲成長用一個 inline 測試定義來驗（不依賴遊戲牌表）
const armorCard = { base: { hits: 1, armor: 8 } };

describe('預設成長（橫劈：境界加每發傷害、連段加發數）', () => {
  it('境界一、無連段 ＝ 基礎值', () => {
    const e = resolveEffect(hengPi(), 1, 1);
    expect(e).toMatchObject({ hits: 1, damage: 7, totalDamage: 7 });
  });

  it('境界依曲線提升每發傷害（境界3 ＝ ×2.5 取整）', () => {
    const e = resolveEffect(hengPi(), 3, 1);
    expect(e.damage).toBe(18); // round(7 × 2.5)
    expect(e.hits).toBe(1); // 無連段還是一發
    expect(e.totalDamage).toBe(18);
  });

  it('連段加發數（劈砍兩次…），每發傷害不變', () => {
    const e = resolveEffect(hengPi(), 1, 4);
    expect(e.hits).toBe(4); // 連段4 ⇒ 揮 4 次
    expect(e.damage).toBe(7); // 每發還是 7
    expect(e.totalDamage).toBe(28);
  });

  it('境界（每發傷害）與連段（發數）各作用一維', () => {
    const e = resolveEffect(hengPi(), 3, 2);
    expect(e.damage).toBe(18); // round(7 × 2.5)
    expect(e.hits).toBe(2); // 連段2 ⇒ 兩發
    expect(e.totalDamage).toBe(36);
  });

  it('連段確實把發數乘上去', () => {
    expect(resolveEffect(hengPi(), 5, 5).hits).toBe(5);
  });
});

describe('★ 暗器：境界加傷害、連段加發數', () => {
  it('基礎 ＝ 3 發 × 5 傷 ＝ 15', () => {
    const e = resolveEffect(anqi(), 1, 1);
    expect(e).toMatchObject({ hits: 3, damage: 5, totalDamage: 15 });
  });

  it('境界↑ ⇒ 每發更痛（依曲線），發數不變', () => {
    const e = resolveEffect(anqi(), 4, 1);
    expect(e.hits).toBe(3); // 發數沒變
    expect(e.damage).toBe(20); // 5 × 4（境界4）
    expect(e.totalDamage).toBe(60);
  });

  it('連段↑ ⇒ 發數變多，每發傷害不變', () => {
    const e = resolveEffect(anqi(), 1, 3);
    expect(e.hits).toBe(9); // 3 發 × 連段3
    expect(e.damage).toBe(5); // 每發還是 5
    expect(e.totalDamage).toBe(45);
  });

  it('境界與連段同時作用在不同維度上', () => {
    const e = resolveEffect(anqi(), 2, 3);
    expect(e.hits).toBe(9); // 3 × 連段3
    expect(e.damage).toBe(8); // round(5 × 1.5)（境界2）
    expect(e.totalDamage).toBe(72);
  });

  it('與橫劈差在基礎發數（連段機制現在相同，都是加發數）', () => {
    const p = resolveEffect(hengPi(), 2, 3);
    const a = resolveEffect(anqi(), 2, 3);
    expect(p.hits).toBe(3); // 1 基礎發 × 連段3
    expect(a.hits).toBe(9); // 3 基礎發 × 連段3
  });
});

describe('護甲成長（預設境界曲線）', () => {
  it('護甲照預設成長', () => {
    const e = resolveEffect(armorCard, 2, 3);
    expect(e.totalArmor).toBe(36); // round(8 × 1.5)（境界2）× 連段3
    expect(e.totalDamage).toBe(0);
  });

  it('攻擊牌的 totalArmor 為 0', () => {
    expect(resolveEffect(hengPi(), 3, 3).totalArmor).toBe(0);
  });
});

describe('卡面數值', () => {
  it('單發牌只顯示總量', () => {
    expect(cardFaceValue(hengPi(), 3)).toMatchObject({ tag: '傷', text: '18', isDamage: true }); // round(7 × 2.5)
  });

  it('多發牌顯示「發數 × 每發」', () => {
    expect(cardFaceValue(anqi(), 4)).toMatchObject({ tag: '傷', text: '3 × 20', hits: 3, per: 20 });
  });

  it('卡面不含連段（連段是出牌當下才知道的）', () => {
    expect(cardFaceValue(anqi(), 1).text).toBe('3 × 5');
  });

  it('護甲牌標示為非傷害', () => {
    expect(cardFaceValue(armorCard, 2)).toMatchObject({ isDamage: false, tag: '甲', text: '12' });
  });

  it('純狀態卡顯示境界縮放後層數，不含出牌當下的連段', () => {
    expect([1, 2, 3, 4, 5].map((realm) => cardFaceValue(duWu(), realm).text)).toEqual([
      '3',
      '5',
      '8',
      '12',
      '18',
    ]);
  });
});

describe('純狀態卡：境界加每次層數，連段加施放次數', () => {
  it('毒霧每次層數吃攻擊卡境界曲線', () => {
    expect([1, 2, 3, 4, 5].map((realm) => resolveEffect(duWu(), realm, 1).statusStacks)).toEqual([
      3,
      5,
      8,
      12,
      18,
    ]);
    expect(resolveEffect(duWu(), 5, 1)).toMatchObject({ statusId: 'poison', hits: 1 });
  });

  it('連段增加獨立施放次數，不改每次層數', () => {
    expect(resolveEffect(duWu(), 1, 2)).toMatchObject({ statusStacks: 3, hits: 2 });
    expect(resolveEffect(duWu(), 2, 3)).toMatchObject({ statusStacks: 5, hits: 3 });
  });
});

describe('功能牌：階級決定單次產量，連擊決定施放次數', () => {
  const yunQi = () => getCardDef('yunQi');
  const linJi = () => getCardDef('linJi');

  it('運氣調息與臨機應變皆使用 3／4／5／6／7 曲線', () => {
    expect([1, 2, 3, 4, 5].map((rank) => resolveEffect(yunQi(), rank, 1).energy)).toEqual([3, 4, 5, 6, 7]);
    expect([1, 2, 3, 4, 5].map((rank) => resolveEffect(linJi(), rank, 1).inspiration)).toEqual([3, 4, 5, 6, 7]);
  });

  it('超過五階仍取曲線最後一級', () => {
    expect(resolveEffect(yunQi(), 8, 1).energy).toBe(7);
    expect(resolveEffect(linJi(), 8, 1).inspiration).toBe(7);
  });

  it('連擊會重複完整施放：四階、連擊四次得到 24', () => {
    expect(resolveEffect(yunQi(), 4, 4).energy).toBe(24);
    expect(resolveEffect(linJi(), 4, 4).inspiration).toBe(24);
  });

  it('中斷連擊時傳入一次施放，不會沿用舊連擊', () => {
    expect(resolveEffect(yunQi(), 3, 1).energy).toBe(5);
    expect(resolveEffect(linJi(), 3, 1).inspiration).toBe(5);
  });

  it('卡面顯示：力／感標籤與單次產量', () => {
    expect(cardFaceValue(yunQi(), 3)).toMatchObject({ tag: '力', text: '＋5' });
    expect(cardFaceValue(linJi(), 2)).toMatchObject({ tag: '靈感', text: '＋4' });
  });
});

describe('自訂成長函式', () => {
  it('可以自訂成任意成長方式', () => {
    const weird = {
      base: { hits: 2, damage: 3 },
      rankScale: (e, rank) => ({ ...e, hits: e.hits + rank }),
      comboScale: (e, mult) => ({ ...e, damage: e.damage + mult }),
    };
    const e = resolveEffect(weird, 3, 4);
    expect(e.hits).toBe(5); // 2 + 3
    expect(e.damage).toBe(7); // 3 + 4
    expect(e.totalDamage).toBe(35);
  });
});
