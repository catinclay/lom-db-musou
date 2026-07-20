import { defaultRng } from './rng.js';
import { TUNING } from '../config/tuning.js';
import { RELIC_IDS, getRelicDef } from './RelicLibrary.js';
import { EVENT_IDS, getEventDef } from './EventLibrary.js';
import { getCardDef, CARD_TYPE, cardRarity, RARITY } from './CardLibrary.js';
import { weightedPickDefId, rollAcquireRealm } from './rarity.js';

/**
 * 一局「江湖遠征」的權威狀態。零 Phaser —— 場景讀它、驅動它，戰鬥仍是同一個 BattleState。
 *
 * 分層：
 *   RunState（這裡）   一局的持久狀態：牌組、銀兩、主角血量、日程進度。跨戰鬥保存。
 *   BattleState        單場戰鬥；每次由 RunState.battleConfig() 注入配置現生，戰後結果寫回。
 *
 * 一「天」的結構：
 *   白天 = 一輪輪「三選一」（offer）：每輪擲 3 個選項挑 1 個做，做完補下一輪，隨時可入夜。
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
  constructor({ rng = defaultRng, tuning = TUNING, deck, meta } = {}) {
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
    // 跨 run 的據點升級：把永久加成疊進這局的起始狀態（血/內力/銀兩/牌組/遺物）。
    if (meta) meta.applyToRun(this);
    this.beginDay();
  }

  /** 進入新的一天：day+1、當天計數歸零、offer 待生（進 RunMap 時 rollOffer）。 */
  beginDay() {
    this.day += 1;
    this.eventsDoneToday = 0;
    this.offer = null;
  }

  /** 今天還能再做幾樁事件（達上限就只能入夜）。 */
  get roundsLeft() {
    return Math.max(0, this.tuning.run.maxRoundsPerDay - this.eventsDoneToday);
  }

  /** 確保有一輪可選的 offer（RunMap 進場呼叫）：沒了就補一輪，達上限則空。 */
  ensureOffer() {
    if (!this.offer) this.rollOffer();
    return this.offer;
  }

  /** 生成一輪「三選一」的選項（達當天上限則空陣列）。 */
  rollOffer() {
    if (this.roundsLeft <= 0) {
      this.offer = [];
      return this.offer;
    }
    this.offer = Array.from({ length: this.tuning.run.offer.size }, (_, s) => this.rollNode(s));
    return this.offer;
  }

  /** 擲一個選項節點（隨機類別，event 再抽一個 eventId）。 */
  rollNode(slot) {
    const o = this.tuning.run.offer;
    const x = this.rng();
    let kind;
    if (x < o.innChance) kind = 'inn';
    else if (x < o.innChance + o.eventChance) kind = 'event';
    else if (this.rng() < this.tuning.run.eliteInPoolChance) kind = 'elite';
    else kind = 'battle';
    const node = { id: `d${this.day}r${this.eventsDoneToday}s${slot}`, kind, done: false };
    if (kind === 'event') node.eventId = EVENT_IDS[Math.floor(this.rng() * EVENT_IDS.length)];
    return node;
  }

  /**
   * 從本輪 offer 選第 index 個去做。選了就把整輪消化掉（其餘作廢），下次進 RunMap 補新一輪。
   *   event → { type:'event', event, node }（完成在 resolveEventChoice 才定）
   *   inn   → 進客棧、計入當天，回 { type:'inn', shop }
   *   battle/elite → 設 pending（done/count 交給戰後 finishBattle），回 { type:'battle', kind, config }
   * @returns 結果，或 null（index 無效）
   */
  takeOffer(index) {
    const node = this.offer?.[index];
    if (!node) return null;
    this.offer = null; // 這一輪消化掉，其餘選項作廢

    if (node.kind === 'event') {
      return { type: 'event', event: getEventDef(node.eventId), node };
    }
    if (node.kind === 'inn') {
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
      bossDefId: base.bossDefId ?? null, // 精英/魔王 finale（尋常廝殺無王）
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

  /** 加一張牌進牌組。extra 可帶 realm（取得境界）/enchants。@returns 新 spec */
  addDeckCard(defId, extra = {}) {
    const spec = { defId, ...extra };
    this.deck.push(spec);
    return spec;
  }

  /**
   * 依稀有度「取得」一張牌:擲取得境界（夾主角 maxRealm）後加進牌組。
   * 普通卡境界一、稀有/絕學直接較高境界。事件/郎中傳招等管道用。
   * @returns 新 spec
   */
  acquireDeckCard(defId, rng = this.rng) {
    const realm = rollAcquireRealm(defId, rng, this.tuning, this.attrs.maxRealm);
    return this.addDeckCard(defId, realm > 1 ? { realm } : {});
  }

  /**
   * 參悟服務:把牌組第 index 張的境界永久 +1（夾主角 maxRealm）。戰鬥外調整,
   * 寫回牌組境界（spec.realm）,一輪內跨戰保存;新 run 重建牌組即回歸。
   * @returns 新境界,或 null（index 無效）
   */
  upgradeDeckCardRealm(index) {
    const spec = this.deck[index];
    if (!spec) return null;
    const next = Math.min((spec.realm ?? 1) + 1, this.attrs.maxRealm);
    spec.realm = next;
    return next;
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

  /**
   * 生成一間客棧的貨架：cardCount 張待售招式（各帶價與取得境界）＋ 刪牌/歇息服務 ＋（有的話）一件遺物。
   * 每格以 shopRareChance 改抽「稀有以上」專屬池,否則普通池;皆依稀有度權重挑,取得境界隨稀有度。
   */
  generateShop() {
    const s = this.tuning.run.shop;
    const rr = this.tuning.run.rarity;
    const used = new Set();
    const cards = [];
    for (let i = 0; i < s.cardCount; i++) {
      const useRare = this.rng() < rr.shopRareChance;
      const source = (useRare ? s.rareCardPool ?? [] : s.cardPool).filter((id) => !used.has(id));
      const pool = source.length ? source : s.cardPool.filter((id) => !used.has(id));
      const defId = weightedPickDefId(pool, this.rng, this.tuning);
      if (!defId) break;
      used.add(defId);
      const realm = rollAcquireRealm(defId, this.rng, this.tuning, this.attrs.maxRealm);
      let price = s.cardPrice.min + Math.floor(this.rng() * (s.cardPrice.max - s.cardPrice.min + 1));
      if (cardRarity(defId) !== RARITY.COMMON) price = Math.round(price * rr.rarePriceMult);
      cards.push({ defId, price, realm, sold: false });
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
    this.addDeckCard(offer.defId, offer.realm > 1 ? { realm: offer.realm } : {});
    offer.sold = true;
    return true;
  }

  /**
   * 花錢參悟：把牌組第 index 張的境界 +1（戰鬥外調整,寫回牌組境界）。
   * 已達 maxRealm 或錢不夠則不收錢。@returns 新境界,或 null（不成交）
   */
  buyParseCard(index) {
    const cost = this.tuning.run.rarity.parseCost;
    const spec = this.deck[index];
    if (!spec || this.money < cost) return null;
    if ((spec.realm ?? 1) >= this.attrs.maxRealm) return null;
    this.money -= cost;
    return this.upgradeDeckCardRealm(index);
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
