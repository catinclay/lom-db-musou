import { defaultRng } from './rng.js';
import { TUNING } from '../config/tuning.js';
import { RELIC_IDS, getRelicDef } from './RelicLibrary.js';
import { EVENT_IDS, getEventDef } from './EventLibrary.js';
import { getCardDef, CARD_TYPE } from './CardLibrary.js';

/**
 * 一局「江湖遠征」的權威狀態。零 Phaser —— 場景讀它、驅動它，戰鬥仍是同一個 BattleState。
 *
 * 分層：
 *   RunState（這裡）   一局的持久狀態：牌組、銀兩、主角血量、日程進度。跨戰鬥保存。
 *   BattleState        單場戰鬥；每次由 RunState.battleConfig() 注入配置現生，戰後結果寫回。
 *
 * 一「天」的結構：
 *   白天 = 一池事件（dayPool），玩家自由挑著做（battle/elite 型開戰、event 型立即結算）。
 *   入夜 = callBoss() 召尾王（elite/boss/final，依 dayBossKind）。打贏 → 推進日程。
 *
 * 局內的境界合成照舊每場重置（BattleState 的事），RunState 不碰 —— 變強靠的是牌組/銀兩/遺物。
 */

/** 初始牌組（Phase 1 沿用沙盒那套唐門牌）。之後由據點/商店改動。 */
export const STARTING_DECK = [
  { defId: 'hengPi' },
  { defId: 'hengPi' },
  { defId: 'hengPi' },
  { defId: 'guan' },
  { defId: 'guan' },
  { defId: 'guan' },
  { defId: 'anqi' },
  { defId: 'anqi' },
  { defId: 'anqi' },
  { defId: 'bengShan' },
  { defId: 'duWu' },
  { defId: 'duWu' },
  { defId: 'huoYao' },
  { defId: 'huoYao' },
  { defId: 'linJi' },
  { defId: 'yunQi' },
  { defId: 'wangXing' },
];

export class RunState {
  constructor({ rng = defaultRng, tuning = TUNING, deck } = {}) {
    this.rng = rng;
    this.tuning = tuning;
    // 牌組是實體資料，複製一份 spec，避免共用參照被外部改動。
    this.deck = (deck ?? STARTING_DECK).map((s) => ({ ...s }));
    this.maxHp = tuning.combat.playerMaxHp;
    this.hp = this.maxHp;
    // 主角屬性（跨戰保存、可成長）：戰鬥時覆蓋 tuning 的對應值（見 battleConfig / BattleState）。
    this.attrs = {
      maxRealm: tuning.maxRealm,
      energyPerTurn: tuning.energyPerTurn,
      startingHandSize: tuning.startingHandSize,
    };
    this.money = tuning.run.startMoney;
    this.slotTokens = 0; // 速通拉霸代幣（Phase 2 拉霸表消化）
    this.relics = [];
    this.outcome = 'ongoing'; // 'ongoing' | 'won'（通關）| 'lost'（主角倒下）
    this.day = 0;
    /** 場景開戰前設好，戰後 finishBattle 用它結算。 */
    this.pending = null;
    this.beginDay();
  }

  /** 進入新的一天：day+1、重生事件池、當天計數歸零。 */
  beginDay() {
    this.day += 1;
    this.eventsDoneToday = 0;
    this.dayPool = this.generateDay(this.day);
  }

  /** 生成當天的事件池：battle/elite 廝殺 + event 佔位事件 + inn 客棧交錯。 */
  generateDay(day) {
    const n = this.tuning.run.eventsPerDay;
    const pool = [];
    for (let i = 0; i < n; i++) {
      let kind;
      if (i > 0 && i % 4 === 0) kind = 'inn'; // 每 4 格一間客棧
      else if (i % 3 === 2) kind = 'event';
      else if (this.rng() < this.tuning.run.eliteInPoolChance) kind = 'elite';
      else kind = 'battle';
      const node = { id: `d${day}n${i}`, index: i, kind, done: false };
      if (kind === 'event') node.eventId = EVENT_IDS[Math.floor(this.rng() * EVENT_IDS.length)];
      pool.push(node);
    }
    return pool;
  }

  get remainingNodes() {
    return this.dayPool.filter((n) => !n.done);
  }

  node(id) {
    return this.dayPool.find((n) => n.id === id);
  }

  /**
   * 白天挑一個節點。
   *   event 型 → 立即給獎、標記完成、回 { type:'reward' }。
   *   battle/elite 型 → 設 pending，回 { type:'battle', kind, config } 交給場景開戰。
   * @returns 結果物件，或 null（節點不存在／已完成）
   */
  takeNode(id) {
    const node = this.node(id);
    if (!node || node.done) return null;

    if (node.kind === 'event') {
      // 交給 EventScene 演敘事＋選項；完成與否在 resolveEventChoice 才定
      return { type: 'event', event: getEventDef(node.eventId), node };
    }

    if (node.kind === 'inn') {
      // 客棧：進去就算花掉一段白天（計入拖延），店內買賣多次到離開為止
      node.done = true;
      this.eventsDoneToday += 1;
      node.shop = this.generateShop();
      return { type: 'inn', shop: node.shop };
    }

    this.pending = { node, kind: node.kind, isBoss: false };
    return { type: 'battle', kind: node.kind, config: this.battleConfig(node.kind, false) };
  }

  /**
   * 玩家在奇遇中選了第 i 個選項。就地套用結果。
   *   立即事件 → 標記節點完成、計入當天，回 { text }。
   *   觸發戰鬥 → 設 pending（done/count 交給戰後 finishBattle），回 { text?, battle, ... }。
   * @returns 結果物件（含 text，可能含 battle 配置）
   */
  resolveEventChoice(node, choiceIndex) {
    const event = getEventDef(node.eventId);
    const result = event.choices[choiceIndex].resolve(this, this.rng) ?? {};
    if (result.battle) {
      this.pending = { node, kind: result.battleKind ?? 'battle', isBoss: false };
    } else {
      node.done = true;
      this.eventsDoneToday += 1;
    }
    return result;
  }

  /** 隨機挑牌組裡一張攻擊牌，附上 level 級的某狀態。@returns 那張牌的名字，或 null（沒攻擊牌） */
  enchantRandomAttackCard(statusId, level, rng = this.rng) {
    const idxs = this.deck.map((s, i) => i).filter((i) => getCardDef(this.deck[i].defId).type === CARD_TYPE.ATTACK);
    if (!idxs.length) return null;
    const i = idxs[Math.floor(rng() * idxs.length)];
    this.enchantDeckCard(i, statusId, level);
    return getCardDef(this.deck[i].defId).name;
  }

  /** 今天尾王的類別：最終日 → final；每 bossEveryDays 天 → boss（魔王）；其餘 → elite（小王）。 */
  dayBossKind(day = this.day) {
    const r = this.tuning.run;
    if (day >= r.finalDay) return 'final';
    if (day % r.bossEveryDays === 0) return 'boss';
    return 'elite';
  }

  /**
   * 入夜召尾王。還有沒做完的事件 ＝ 速通，按略過數發拉霸代幣（弱於乖乖刷完的獎勵）。
   * @returns { type:'battle', kind, config, speedrunTokens }
   */
  callBoss() {
    const kind = this.dayBossKind();
    const tokens = this.remainingNodes.length * this.tuning.run.speedrunTokensPerSkipped;
    this.slotTokens += tokens;
    this.pending = { node: null, kind, isBoss: true, tokensAwarded: tokens };
    return { type: 'battle', kind, config: this.battleConfig(kind, true), speedrunTokens: tokens };
  }

  /**
   * 某類戰鬥的配置（注入 BattleState）。
   * 尾王（isBoss）吃「當天拖延加成」：白天做越多事件，補充波與精英率越高。
   */
  battleConfig(kind, isBoss) {
    const r = this.tuning.run;
    const base = r.battle[kind];
    let waves = base.waves;
    let eliteChance = base.eliteChance;
    if (isBoss) {
      const d = this.eventsDoneToday;
      waves += Math.floor(d * r.dally.wavesPerEvent);
      eliteChance = Math.min(1, eliteChance + d * r.dally.eliteChancePerEvent);
    }
    return {
      hp: this.hp,
      maxHp: this.maxHp,
      waves,
      rows: base.rows,
      eliteChance,
      relics: [...this.relics],
      attrs: { ...this.attrs },
    };
  }

  /**
   * 戰後結算（場景在 BattleState 打完後呼叫）：血量寫回、給獎、可能推進日程或結束 run。
   * @param battle 打完的 BattleState（讀 playerHp / outcome）
   * @returns { outcome:'won'|'lost', runOver, dayAdvanced, cleared?, money? }
   */
  finishBattle(battle) {
    // pending 正常由 takeNode/callBoss 設好；null 是「獨立開戰」的保險（當尾王結算）。
    const p = this.pending ?? { kind: 'elite', isBoss: true, node: null };
    this.pending = null;
    this.hp = Math.max(0, battle.playerHp);

    if (battle.outcome === 'lost' || this.hp <= 0) {
      this.outcome = 'lost';
      return { outcome: 'lost', runOver: true, dayAdvanced: false };
    }

    const money = this.tuning.run.reward[p.kind] ?? 0;
    this.money += money;

    if (!p.isBoss) {
      // 白天池中的廝殺打贏：標記完成、計入當天事件數
      if (p.node) p.node.done = true;
      this.eventsDoneToday += 1;
      return { outcome: 'won', runOver: false, dayAdvanced: false, money };
    }

    // 尾王打贏
    if (p.kind === 'final') {
      this.outcome = 'won';
      return { outcome: 'won', runOver: true, dayAdvanced: false, cleared: true, money };
    }
    // 魔王（每 bossEveryDays 天）打贏給一件遺物
    const relic = p.kind === 'boss' ? this.grantRandomRelic() : null;
    this.advanceDay();
    return { outcome: 'won', runOver: false, dayAdvanced: true, money, relic };
  }

  /** 推進到隔天（尾王打贏後）。 */
  advanceDay() {
    this.beginDay();
  }

  // ── 遺物·秘籍 ────────────────────────────────────────

  ownsRelic(id) {
    return this.relics.includes(id);
  }

  /** 拿到一件遺物（重複則跳過）：記錄 id、觸發 onAcquire。@returns 是否新拿到 */
  addRelic(id) {
    if (this.ownsRelic(id)) return false;
    this.relics.push(id);
    getRelicDef(id).onAcquire?.(this);
    return true;
  }

  /** 隨機給一件「還沒有的」遺物。@returns 遺物 id，或 null（全收集了） */
  grantRandomRelic() {
    const pool = RELIC_IDS.filter((id) => !this.ownsRelic(id));
    if (!pool.length) return null;
    const id = pool[Math.floor(this.rng() * pool.length)];
    this.addRelic(id);
    return id;
  }

  // ── 牌組編輯（商店/拉霸/事件共用）──────────────────────
  // deck 是 spec 陣列；spec.enchants 由 BattleState.start 的 createCard 種進戰鬥實例，
  // 所以「附魔到牌組某張牌」＝改該 spec 的 enchants，就會在之後每場戰鬥生效。

  /** 加一張牌進牌組。@returns 新 spec */
  addDeckCard(defId, extra = {}) {
    const spec = { defId, ...extra };
    this.deck.push(spec);
    return spec;
  }

  /** 從牌組移除第 index 張。@returns 是否成功 */
  removeDeckCard(index) {
    if (index < 0 || index >= this.deck.length) return false;
    this.deck.splice(index, 1);
    return true;
  }

  /** 把某狀態附魔的 level 疊到牌組第 index 張（累加 level；實際層數出牌時按傷害算）。@returns 是否成功 */
  enchantDeckCard(index, statusId, level = 1) {
    const spec = this.deck[index];
    if (!spec) return false;
    const cur = spec.enchants ? { ...spec.enchants } : {};
    cur[statusId] = (cur[statusId] ?? 0) + level;
    spec.enchants = cur;
    return true;
  }

  /** 花一枚速通拉霸代幣。@returns 是否花得起 */
  spendSlotToken() {
    if (this.slotTokens <= 0) return false;
    this.slotTokens -= 1;
    return true;
  }

  // ── 客棧（商店）──────────────────────────────────────

  /** 生成一間客棧的貨架：cardCount 張待售招式（各帶價）＋ 刪牌/歇息服務 ＋（有的話）一件遺物。 */
  generateShop() {
    const s = this.tuning.run.shop;
    const pool = [...s.cardPool];
    const cards = [];
    for (let i = 0; i < s.cardCount && pool.length; i++) {
      const defId = pool.splice(Math.floor(this.rng() * pool.length), 1)[0];
      const price = s.cardPrice.min + Math.floor(this.rng() * (s.cardPrice.max - s.cardPrice.min + 1));
      cards.push({ defId, price, sold: false });
    }
    const relicPool = RELIC_IDS.filter((id) => !this.ownsRelic(id));
    const relic = relicPool.length
      ? { id: relicPool[Math.floor(this.rng() * relicPool.length)], price: s.relicPrice, sold: false }
      : null;
    return { cards, relic, removePrice: s.removePrice, rest: { ...s.rest } };
  }

  /** 買下貨架上的遺物。@returns 是否成交 */
  buyRelic(shop) {
    const offer = shop?.relic;
    if (!offer || offer.sold || this.money < offer.price) return false;
    if (!this.addRelic(offer.id)) return false;
    this.money -= offer.price;
    offer.sold = true;
    return true;
  }

  /** 買下貨架第 i 張招式（加進牌組）。@returns 是否成交 */
  buyShopCard(shop, i) {
    const offer = shop?.cards?.[i];
    if (!offer || offer.sold || this.money < offer.price) return false;
    this.money -= offer.price;
    this.addDeckCard(offer.defId);
    offer.sold = true;
    return true;
  }

  /** 花錢刪去牌組第 index 張。@returns 是否成交 */
  buyRemoveCard(shop, index) {
    const price = shop?.removePrice ?? this.tuning.run.shop.removePrice;
    if (this.money < price) return false;
    if (!this.removeDeckCard(index)) return false;
    this.money -= price;
    return true;
  }

  /** 歇息回血（付錢、補血，滿血或錢不夠則不做）。@returns 是否成交 */
  restAtInn(shop) {
    const rest = shop?.rest ?? this.tuning.run.shop.rest;
    if (this.money < rest.price || this.hp >= this.maxHp) return false;
    this.money -= rest.price;
    this.hp = Math.min(this.maxHp, this.hp + rest.heal);
    return true;
  }
}
