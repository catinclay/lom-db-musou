import { defaultRng } from './rng.js';
import { TUNING } from '../config/tuning.js';
import { RELIC_IDS, getRelicDef } from './RelicLibrary.js';
import { getEventDef } from './EventLibrary.js';
import { composeOffer, offerKeyForNode } from './OfferDirector.js';

/**
 * 一局「江湖遠征」的權威狀態。零 Phaser —— 場景讀它、驅動它，戰鬥仍是同一個 BattleState。
 *
 * 分層：
 *   RunState（這裡）   一局的持久狀態：牌組、銀兩、主角血量、日程進度。跨戰鬥保存。
 *   BattleState        單場戰鬥；每次由 RunState.battleConfig() 注入配置現生，戰後結果寫回。
 *
 * 一「天」的結構：
 *   白天 = 一個個「時辰」的三選一（offer）：每時辰擲 3 個選項挑 1 個做，做完推進下一時辰，隨時可入夜。
 *   入夜 = callBoss() 召尾王（elite/boss/final，依 dayBossKind）。打贏 → 推進日程。
 *
 * 局內的階級合成每場重置（BattleState 的事），RunState 不碰。
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
  constructor({ rng = defaultRng, tuning = TUNING, deck, meta } = {}) {
    this.rng = rng;
    this.tuning = tuning;
    // 牌組是實體資料，複製一份 spec，避免共用參照被外部改動。
    this.deck = (deck ?? STARTING_DECK).map((s) => ({ ...s }));
    this.maxHp = tuning.combat.playerMaxHp;
    this.hp = this.maxHp;
    // 主角屬性（跨戰保存、可成長）：戰鬥時覆蓋 tuning 的對應值（見 battleConfig / BattleState）。
    this.attrs = {
      maxRank: tuning.maxRank,
      energyPerTurn: tuning.energyPerTurn,
      startingHandSize: tuning.startingHandSize,
    };
    this.money = tuning.run.startMoney;
    this.slotTokens = 0; // 速通拉霸代幣（Phase 2 拉霸表消化）
    this.relics = [];
    for (const id of tuning.run.startingRelics ?? []) this.addRelic(id);
    this.outcome = 'ongoing'; // 'ongoing' | 'won'（通關）| 'lost'（主角倒下）
    this.day = 0;
    /** 場景開戰前設好，戰後 finishBattle 用它結算。 */
    this.pending = null;
    // 選項導演的跨時辰記憶：抑制重複、限制客棧與低血救濟出現次數。
    this.offerHistory = [];
    this.offerSerial = 0;
    this.lastInnOfferSerial = -1000000;
    this.innOffersToday = 0;
    this.mercyUsed = 0;
    this.mercyUsedToday = 0;
    // 跨 run 的據點升級：把永久加成疊進這局的起始狀態（血/內力/銀兩/牌組/遺物）。
    if (meta) meta.applyToRun(this);
    this.beginDay();
  }

  /** 進入新的一天：day+1、當天計數歸零、offer 待生（進 RunMap 時 rollOffer）。 */
  beginDay() {
    this.day += 1;
    this.eventsDoneToday = 0;
    this.innOffersToday = 0;
    this.mercyUsedToday = 0;
    this.offer = null;
  }

  /** 今天還剩幾個可行動的時辰（歸零就只能入夜）。 */
  get roundsLeft() {
    return Math.max(0, this.tuning.run.maxRoundsPerDay - this.eventsDoneToday);
  }

  /** 確保本時辰有可選的 offer（RunMap 進場呼叫）：沒了就補一組，達上限則空。 */
  ensureOffer() {
    if (!this.offer) this.rollOffer();
    return this.offer;
  }

  /** 生成本時辰「三選一」：由 OfferDirector 保證節奏與選項多樣性。 */
  rollOffer() {
    if (this.roundsLeft <= 0) {
      this.offer = [];
      return this.offer;
    }
    this.offer = composeOffer(this);
    return this.offer;
  }

  canOfferInn() {
    const config = this.tuning.run.offer;
    return this.hp < this.maxHp
      && this.money >= this.tuning.run.shop.rest.price
      && this.innOffersToday < config.innMaxOffersPerDay
      && this.offerSerial - this.lastInnOfferSerial > config.innCooldownOffers;
  }

  noteInnOffered() {
    this.innOffersToday += 1;
    this.lastInnOfferSerial = this.offerSerial;
  }

  /**
   * 從本時辰 offer 選第 index 個去做。選了就把這組選項消化掉（其餘作廢），下次進 RunMap 進下一時辰。
   *   event → { type:'event', event, node }（完成在 resolveEventChoice 才定）
   *   service → 客棧／商販／武館／賭坊，進場即計入當天
   *   battle/elite → 設 pending（done/count 交給戰後 finishBattle），回 { type:'battle', kind, config }
   * @returns 結果，或 null（index 無效）
   */
  takeOffer(index) {
    const node = this.offer?.[index];
    if (!node) return null;
    this.offerHistory.push(offerKeyForNode(node));
    this.offer = null; // 本時辰的選項已消化，其餘選項作廢

    if (node.kind === 'event') {
      return { type: 'event', event: getEventDef(node.eventId), node };
    }
    if (['inn', 'merchant', 'dojo', 'casino'].includes(node.kind)) {
      node.done = true;
      this.eventsDoneToday += 1;
      node.shop = this.generateShop(node.kind);
      return { type: 'service', service: node.kind, shop: node.shop };
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
    // 速通：今天還沒做完的回合數 ＝ 略過的事件
    const tokens = this.roundsLeft * this.tuning.run.speedrunTokensPerSkipped;
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

  /** 花一枚速通拉霸代幣。@returns 是否花得起 */
  spendSlotToken() {
    if (this.slotTokens <= 0) return false;
    this.slotTokens -= 1;
    return true;
  }

  // ── 白天服務設施──────────────────────────────────────

  /** 依設施生成服務內容；各設施只帶自己能做的功能。 */
  generateShop(service = 'merchant') {
    const s = this.tuning.run.shop;
    if (service === 'inn') return { service, rest: { ...s.rest } };
    if (service === 'dojo') return { service, removePrice: s.removePrice };
    if (service === 'casino') return { service };

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
    return { service: 'merchant', cards, relic };
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
