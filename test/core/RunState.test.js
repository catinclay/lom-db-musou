import { describe, it, expect } from 'vitest';
import { RunState, STARTING_DECK } from '../../src/core/RunState.js';
import { seededRng } from '../../src/core/rng.js';

const run = () => new RunState({ rng: seededRng(1) });

describe('起始狀態', () => {
  it('第一天開局，血/錢/牌組就位', () => {
    const r = run();
    expect(r.day).toBe(1);
    expect(r.hp).toBe(r.maxHp);
    expect(r.money).toBe(r.tuning.run.startMoney);
    expect(r.dayPool).toHaveLength(r.tuning.run.eventsPerDay);
    expect(r.outcome).toBe('ongoing');
  });

  it('牌組是 STARTING_DECK 的複本（不共用參照）', () => {
    const r = run();
    expect(r.deck).not.toBe(STARTING_DECK);
    expect(r.deck.map((s) => s.defId)).toEqual(STARTING_DECK.map((s) => s.defId));
  });
});

describe('尾王節奏（殺戮尖塔式）', () => {
  it('平日小王、每 3 天魔王、第 10 天最終', () => {
    const r = run();
    const kinds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => r.dayBossKind(d));
    expect(kinds).toEqual([
      'elite', 'elite', 'boss', 'elite', 'elite', 'boss', 'elite', 'elite', 'boss', 'final',
    ]);
  });
});

describe('白天事件池', () => {
  it('event 型節點回傳奇遇（延後到選項才結算）', () => {
    const r = run();
    const ev = r.dayPool.find((n) => n.kind === 'event');
    const res = r.takeNode(ev.id);
    expect(res.type).toBe('event');
    expect(res.event.id).toBe(ev.eventId);
    expect(ev.done).toBe(false); // 還沒選，尚未完成
  });

  it('battle 型節點回傳戰鬥配置並設 pending', () => {
    const r = run();
    const bn = r.dayPool.find((n) => n.kind === 'battle' || n.kind === 'elite');
    const res = r.takeNode(bn.id);
    expect(res.type).toBe('battle');
    expect(res.config.hp).toBe(r.hp);
    expect(res.config).toHaveProperty('waves');
    expect(r.pending).not.toBeNull();
  });

  it('inn 型節點回傳客棧貨架、計入當天事件、不設 pending', () => {
    const r = run();
    const inn = r.dayPool.find((n) => n.kind === 'inn');
    const res = r.takeNode(inn.id);
    expect(res.type).toBe('inn');
    expect(res.shop.cards.length).toBe(r.tuning.run.shop.cardCount);
    expect(inn.done).toBe(true);
    expect(r.eventsDoneToday).toBe(1);
    expect(r.pending).toBeNull();
  });

  it('已完成或不存在的節點回 null', () => {
    const r = run();
    const n = r.dayPool[0];
    n.done = true;
    expect(r.takeNode(n.id)).toBeNull();
    expect(r.takeNode('沒這節點')).toBeNull();
  });
});

describe('奇遇（EventLibrary）', () => {
  it('每個 event 節點都帶 eventId', () => {
    const r = run();
    for (const n of r.dayPool.filter((n) => n.kind === 'event')) expect(n.eventId).toBeTruthy();
  });

  it('立即事件：選項結算後標記完成、計入當天', () => {
    const r = run();
    const node = { id: 'ev-x', kind: 'event', eventId: 'baoXiang', done: false };
    r.dayPool.push(node);
    r.rng = () => 0.1; // 寶箱開中（rng < 0.7）
    const res = r.resolveEventChoice(node, 0); // 撬開
    expect(res.text).toBeTruthy();
    expect(res.battle).toBeUndefined();
    expect(node.done).toBe(true);
    expect(r.eventsDoneToday).toBe(1);
  });

  it('戰鬥事件：設 pending、節點先不完成（交給戰後 finishBattle）', () => {
    const r = run();
    const node = { id: 'ev-y', kind: 'event', eventId: 'chouJia', done: false };
    r.dayPool.push(node);
    const res = r.resolveEventChoice(node, 0); // 拔刀相向 → 戰鬥
    expect(res.battle).toBeTruthy();
    expect(node.done).toBe(false);
    expect(r.pending).not.toBeNull();
    r.finishBattle({ playerHp: 30, outcome: 'won' });
    expect(node.done).toBe(true); // 戰後才標記完成
  });

  it('enchantRandomAttackCard：附魔到牌組某攻擊牌', () => {
    const r = run();
    const name = r.enchantRandomAttackCard('poison', 1, () => 0);
    expect(name).toBeTruthy();
    expect(r.deck.some((s) => s.enchants?.poison)).toBe(true);
  });
});

describe('尾王吃「拖延加成」（多農越硬）', () => {
  it('白天做越多事件，尾王補充波與精英率越高', () => {
    const r = run();
    const at0 = r.battleConfig('boss', true);
    r.eventsDoneToday = 6;
    const at6 = r.battleConfig('boss', true);
    expect(at6.waves).toBeGreaterThan(at0.waves);
    expect(at6.eliteChance).toBeGreaterThan(at0.eliteChance);
  });

  it('白天廝殺（非尾王）不吃拖延加成', () => {
    const r = run();
    const a = r.battleConfig('battle', false);
    r.eventsDoneToday = 8;
    const b = r.battleConfig('battle', false);
    expect(b.waves).toBe(a.waves);
    expect(b.eliteChance).toBe(a.eliteChance);
  });
});

describe('入夜召尾王 / 速通獎賞', () => {
  it('還有沒做完的事件 ⇒ 按略過數發拉霸代幣', () => {
    const r = run();
    expect(r.remainingNodes).toHaveLength(10);
    const res = r.callBoss();
    expect(res.speedrunTokens).toBe(10 * r.tuning.run.speedrunTokensPerSkipped);
    expect(r.slotTokens).toBe(res.speedrunTokens);
    expect(r.pending.isBoss).toBe(true);
  });
});

describe('戰後結算', () => {
  it('白天廝殺打贏：血量寫回、給銀兩、標記節點、計入當天事件數', () => {
    const r = run();
    const bn = r.dayPool.find((n) => n.kind !== 'event');
    r.takeNode(bn.id);
    const res = r.finishBattle({ playerHp: 50, outcome: 'won' });
    expect(res).toMatchObject({ outcome: 'won', dayAdvanced: false });
    expect(bn.done).toBe(true);
    expect(r.eventsDoneToday).toBe(1);
    expect(r.hp).toBe(50);
  });

  it('尾王打贏 ⇒ 推進到隔天', () => {
    const r = run();
    r.callBoss();
    const before = r.day;
    const res = r.finishBattle({ playerHp: 40, outcome: 'won' });
    expect(res.dayAdvanced).toBe(true);
    expect(r.day).toBe(before + 1);
    expect(r.eventsDoneToday).toBe(0); // 新的一天歸零
  });

  it('最終魔王打贏 ⇒ 通關（outcome won、runOver）', () => {
    const r = run();
    while (r.day < r.tuning.run.finalDay) r.advanceDay();
    expect(r.dayBossKind()).toBe('final');
    r.callBoss();
    const res = r.finishBattle({ playerHp: 10, outcome: 'won' });
    expect(res).toMatchObject({ outcome: 'won', runOver: true, cleared: true });
    expect(r.outcome).toBe('won');
  });

  it('打輸（血量歸零）⇒ run 結束', () => {
    const r = run();
    r.callBoss();
    const res = r.finishBattle({ playerHp: 0, outcome: 'lost' });
    expect(res).toMatchObject({ outcome: 'lost', runOver: true });
    expect(r.outcome).toBe('lost');
  });
});

describe('牌組編輯（商店/拉霸/事件共用）', () => {
  it('addDeckCard 加牌、removeDeckCard 刪牌', () => {
    const r = run();
    const n = r.deck.length;
    r.addDeckCard('anqi');
    expect(r.deck).toHaveLength(n + 1);
    expect(r.removeDeckCard(r.deck.length - 1)).toBe(true);
    expect(r.deck).toHaveLength(n);
    expect(r.removeDeckCard(999)).toBe(false); // 越界不崩潰
  });

  it('enchantDeckCard 累加附魔到 spec.enchants', () => {
    const r = run();
    const i = r.deck.findIndex((s) => s.defId === 'guan');
    expect(r.enchantDeckCard(i, 'poison', 3)).toBe(true);
    r.enchantDeckCard(i, 'poison', 2);
    r.enchantDeckCard(i, 'burn', 1);
    expect(r.deck[i].enchants).toEqual({ poison: 5, burn: 1 });
  });

  it('spendSlotToken 花得起才扣', () => {
    const r = run();
    r.slotTokens = 2;
    expect(r.spendSlotToken()).toBe(true);
    expect(r.slotTokens).toBe(1);
    r.spendSlotToken();
    expect(r.spendSlotToken()).toBe(false); // 沒代幣了
    expect(r.slotTokens).toBe(0);
  });
});

describe('客棧（商店）', () => {
  it('買招式：付得起就加牌、標記售出、扣銀兩', () => {
    const r = run();
    r.money = 100;
    const shop = r.generateShop();
    const n = r.deck.length;
    const price = shop.cards[0].price;
    expect(r.buyShopCard(shop, 0)).toBe(true);
    expect(r.deck).toHaveLength(n + 1);
    expect(r.money).toBe(100 - price);
    expect(shop.cards[0].sold).toBe(true);
    expect(r.buyShopCard(shop, 0)).toBe(false); // 售出了不能再買
  });

  it('買招式：錢不夠不成交', () => {
    const r = run();
    r.money = 0;
    const shop = r.generateShop();
    expect(r.buyShopCard(shop, 0)).toBe(false);
    expect(r.deck.some((s) => s.defId === shop.cards[0].defId && s.__bought)).toBe(false);
  });

  it('刪招式：付錢刪牌', () => {
    const r = run();
    r.money = 50;
    const shop = r.generateShop();
    const n = r.deck.length;
    expect(r.buyRemoveCard(shop, 0)).toBe(true);
    expect(r.deck).toHaveLength(n - 1);
    expect(r.money).toBe(50 - shop.removePrice);
  });

  it('歇息回血：付錢補血、不超過上限', () => {
    const r = run();
    r.money = 50;
    r.hp = 10;
    const shop = r.generateShop();
    expect(r.restAtInn(shop)).toBe(true);
    expect(r.hp).toBe(Math.min(r.maxHp, 10 + shop.rest.heal));
    expect(r.money).toBe(50 - shop.rest.price);
  });

  it('歇息回血：滿血就不做', () => {
    const r = run();
    r.money = 50;
    r.hp = r.maxHp;
    expect(r.restAtInn(r.generateShop())).toBe(false);
  });
});

describe('遺物·秘籍', () => {
  it('addRelic：不重複、觸發 onAcquire（金鐘罩 +25 血上限並回血）', () => {
    const r = run();
    const before = r.maxHp;
    expect(r.addRelic('jinZhong')).toBe(true);
    expect(r.maxHp).toBe(before + 25);
    expect(r.addRelic('jinZhong')).toBe(false); // 重複不再拿
    expect(r.relics).toEqual(['jinZhong']);
  });

  it('grantRandomRelic：給沒有的；全收集了回 null', () => {
    const r = run();
    const id = r.grantRandomRelic();
    expect(id).toBeTruthy();
    expect(r.ownsRelic(id)).toBe(true);
    let guard = 20;
    while (r.grantRandomRelic() && guard-- > 0);
    expect(r.grantRandomRelic()).toBeNull();
  });

  it('battleConfig 帶上目前遺物', () => {
    const r = run();
    r.addRelic('xuanTie');
    expect(r.battleConfig('battle', false).relics).toContain('xuanTie');
  });

  it('客棧賣遺物、買得起就入手', () => {
    const r = run();
    r.money = 100;
    const shop = r.generateShop();
    expect(shop.relic).not.toBeNull(); // 第一天沒收集任何遺物，必有貨
    const id = shop.relic.id;
    expect(r.buyRelic(shop)).toBe(true);
    expect(r.ownsRelic(id)).toBe(true);
    expect(shop.relic.sold).toBe(true);
    expect(r.buyRelic(shop)).toBe(false); // 售出了
  });

  it('魔王打贏給一件遺物、小王不給', () => {
    const r = run();
    while (r.day < 3) r.advanceDay(); // 第 3 天 = 魔王
    expect(r.dayBossKind()).toBe('boss');
    r.callBoss();
    const res = r.finishBattle({ playerHp: 40, outcome: 'won' });
    expect(res.relic).toBeTruthy();
    expect(r.relics).toContain(res.relic);

    // 隔天（第 4 天）= 小王，不給遺物
    r.callBoss();
    const res2 = r.finishBattle({ playerHp: 40, outcome: 'won' });
    expect(res2.relic).toBeNull();
  });
});
