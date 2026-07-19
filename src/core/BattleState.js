import { Deck } from './Deck.js';
import { Hand } from './Hand.js';
import { createCard, cardEnchants } from './Card.js';
import { getCardDef } from './CardLibrary.js';
import { resolveEffect } from './Effect.js';
import { ComboTracker } from './ComboTracker.js';
import { resolveAutoMerges, applyFormlessMerge } from './MergeEngine.js';
import { Formation } from './Formation.js';
import { resolveAttack, TARGET } from './combat.js';
import { applyStatus, resolveStatusTick } from './StatusLibrary.js';
import { TX } from './transcript.js';
import { EventBus, EVENT } from './events.js';
import { TUNING } from '../config/tuning.js';
import { defaultRng } from './rng.js';

/**
 * 一場戰鬥的狀態機。零 Phaser 依賴 —— 對外只發事件。
 *
 * 牌組定義（deckList）與戰鬥實例是分開的：每次 start() 都從 deckList
 * 現生一批全新的 Card。合成只動實例，所以下一場戰鬥自然乾淨重來，
 * 境界無法跨場滾雪球。
 *
 * 也是 MergeEngine 的 ctx（提供 hand / deck / rng / mergesThisTurn）。
 */
export class BattleState {
  /**
   * @param deckList 牌組定義，形如 [{ defId, realm?, tags?, enchants? }, ...]。跨戰鬥保存，永不被合成改動。
   * @param battle   這場戰鬥的配置（由 RunState 注入）：
   *   { hp, maxHp, waves, rows, minPerRow, maxPerRow, eliteChance, gruntDefId, eliteDefId }
   *   全部可選；省略則回退 tuning，等同舊沙盒（無限補充波）。
   *   waves = 初始敵陣之外的「補充波」次數；waves 用完且敵陣清空 ＝ 勝。
   */
  constructor({ deckList, rng = defaultRng, tuning = TUNING, bus = new EventBus(), battle = {} } = {}) {
    this.deckList = deckList ?? [];
    this.rng = rng;
    this.tuning = tuning;
    this.bus = bus;
    this.battleConfig = battle;
    /** 補抽機率的遞減依據，每回合歸零 */
    this.mergesThisTurn = 0;
  }

  /** 開始（或重開）一場戰鬥。牌組永遠從定義現生，不繼承上一場的任何合成結果。 */
  start() {
    const bc = this.battleConfig;
    const cards = this.deckList.map((spec) =>
      createCard(spec.defId, { realm: spec.realm ?? 1, tags: spec.tags ?? [], enchants: spec.enchants ?? {} })
    );
    this.deck = new Deck(cards, this.rng);
    this.deck.shuffleDrawPile();
    this.hand = new Hand();
    this.combo = new ComboTracker(this.tuning);
    this.energy = this.tuning.energyPerTurn;
    this.turn = 0;
    this.damageThisTurn = 0;
    this.armor = 0;

    // 主角血量：由 RunState 注入（跨戰保存），省略則回退 tuning。
    this.playerMaxHp = bc.maxHp ?? this.tuning.combat.playerMaxHp;
    this.playerHp = bc.hp ?? this.playerMaxHp;
    // 補充波預算：Infinity ＝ 舊沙盒的無限湧上；有限值到 0 且清場 ＝ 勝。
    this.wavesLeft = bc.waves ?? Infinity;
    this.outcome = 'ongoing';
    this.formation = new Formation(this.tuning.combat.lanes, this.tuning.combat.maxRank, this.rng);
    this.formation.refill(bc.rows ?? this.tuning.combat.rows, this.enemySpec());

    this.bus.emit(EVENT.BATTLE_STARTED, { state: this });
    return this.startTurn();
  }

  /** 生成新排時用的敵種與人數（可注入 rng，測試才不會擲骰子）。數值可由 battleConfig 覆寫。 */
  enemySpec() {
    const c = this.tuning.combat;
    const bc = this.battleConfig;
    const minPerRow = bc.minPerRow ?? c.minPerRow;
    const maxPerRow = bc.maxPerRow ?? c.maxPerRow;
    const eliteChance = bc.eliteChance ?? c.eliteChance;
    const grunt = bc.gruntDefId ?? 'luo';
    const elite = bc.eliteDefId ?? 'han';
    return {
      defId: () => (this.rng() < eliteChance ? elite : grunt),
      count: () => minPerRow + Math.floor(this.rng() * (maxPerRow - minPerRow + 1)),
    };
  }

  /**
   * 判定並發出戰鬥結果（只發一次）。
   *   輸（主角血量歸零）優先於贏；贏 ＝ 敵陣清空且補充波用盡。
   * 無限補充波（沙盒，wavesLeft = Infinity）永遠不會判贏。
   */
  checkOutcome() {
    if (this.outcome !== 'ongoing') return this.outcome;
    if (this.playerHp <= 0) {
      this.outcome = 'lost';
      this.bus.emit(EVENT.BATTLE_LOST, { state: this });
    } else if (this.formation.isEmpty && this.wavesLeft <= 0) {
      this.outcome = 'won';
      this.bus.emit(EVENT.BATTLE_WON, { state: this });
    }
    return this.outcome;
  }

  /** @returns transcript */
  startTurn() {
    this.turn += 1;
    this.energy = this.tuning.energyPerTurn;
    this.damageThisTurn = 0;
    this.mergesThisTurn = 0;
    this.armor = 0; // 護甲是「格擋」，每回合重置（敵人上回合結束已結算過）
    this.combo.reset();

    // 先把該抽的牌一次抽完，再一口氣解算合成 ——
    // 不是抽一張算一次，否則玩家看不出「這批牌湊出了什麼」。
    const transcript = this.drawCards(this.tuning.startingHandSize);
    transcript.push(...resolveAutoMerges(this, this.tuning));

    this.bus.emit(EVENT.TURN_STARTED, { turn: this.turn });
    this.bus.emit(EVENT.TRANSCRIPT, transcript);
    return transcript;
  }

  /**
   * 回合結束：手牌全棄（§2.1 預設無留牌）。
   * 「被動留牌」是遺物的事，里程碑 2 再處理。
   *
   * 棄牌必須進 transcript，否則畫面上舊手牌會一路殘留到最後才被
   * syncTo 靜默刪掉，看起來就像「回合結束沒有棄牌」。
   */
  endTurn() {
    const discarded = this.hand.clear();
    this.deck.discardAll(discarded);
    const transcript = discarded.map((card) => ({ type: TX.DISCARD, card }));

    this.bus.emit(EVENT.TURN_ENDED, { turn: this.turn });
    return transcript.concat(this.startTurn());
  }

  /**
   * 割草手感：整片敵陣被清空、但還有補充波時，**當下**就把下一波湧上 ——
   * 不必等回合結束，玩家才不會清完場還杵著滿手內力與手牌卻沒得打。
   * 新一波從後方補進（非接觸位、未備戰），所以不會馬上攻擊主角。
   * @returns 是否真的補了一波
   */
  maybeRushNextWave() {
    if (this.outcome !== 'ongoing') return false;
    if (!this.formation.isEmpty || this.wavesLeft <= 0) return false;
    this.formation.refill(this.battleConfig.rows ?? this.tuning.combat.rows, this.enemySpec());
    this.wavesLeft -= 1;
    this.bus.emit(EVENT.ENEMIES_ADVANCED, { formation: this.formation, rushIn: true });
    return true;
  }

  /**
   * 敵人相位（玩家按下結束回合時，跑手牌 endTurn 之前呼叫）：
   *   1. 已備戰的接觸敵人攻擊主角（護甲先擋）。
   *   2. 前進補位（advance）—— 被卡住的會側移到隔壁一路補位。
   *   3. 從後方補排湧上。
   *   4. 新到接觸位的敵人進入備戰（telegraph），下回合才攻擊。
   *
   * 攻擊在前進之前結算，所以「這回合剛到最前排」的敵人不會馬上打人，只會亮起備戰。
   *
   * @returns { contactDamage, blocked, hpDamage, playerHp, defeated }
   */
  enemyPhase() {
    // 1. 備戰的接觸敵人攻擊
    const contactDamage = this.formation.contactDamage();
    const blocked = Math.min(this.armor, contactDamage);
    this.armor -= blocked;
    const hpDamage = contactDamage - blocked;
    this.playerHp = Math.max(0, this.playerHp - hpDamage);
    if (contactDamage > 0) {
      this.bus.emit(EVENT.PLAYER_HIT, { damage: hpDamage, blocked, hp: this.playerHp });
    }

    // 2. 前進補位　3. 補排湧上（只在還有補充波時）　4. 新到最前排的進入備戰
    this.formation.advance();
    if (this.wavesLeft > 0) {
      this.formation.refill(this.battleConfig.rows ?? this.tuning.combat.rows, this.enemySpec());
      this.wavesLeft -= 1;
    }
    this.formation.prepareFront();
    this.bus.emit(EVENT.ENEMIES_ADVANCED, { formation: this.formation });

    this.checkOutcome();
    return {
      contactDamage,
      blocked,
      hpDamage,
      playerHp: this.playerHp,
      defeated: this.playerHp <= 0,
      outcome: this.outcome,
    };
  }

  /** @returns transcript 片段（只含 DRAW / DRAW_FIZZLE，不解算合成） */
  drawCards(n) {
    const transcript = [];
    for (let i = 0; i < n; i++) {
      const card = this.deck.draw();
      if (card) {
        this.hand.add(card);
        transcript.push({ type: TX.DRAW, card });
      } else {
        transcript.push({ type: TX.DRAW_FIZZLE });
      }
    }
    return transcript;
  }

  /** 出牌。@returns {{ ok: boolean, reason?: string, result?: object }} */
  playCard(uid) {
    const card = this.hand.findByUid(uid);
    if (!card) return { ok: false, reason: 'not_in_hand' };

    const def = getCardDef(card.defId);
    if (def.catalyst) {
      // 忘形催化劑無戰鬥數值，只能當合成材料，不能單獨出牌
      this.bus.emit(EVENT.CARD_PLAY_REJECTED, { card, reason: 'catalyst' });
      return { ok: false, reason: 'catalyst' };
    }
    if (this.energy < def.cost) {
      this.bus.emit(EVENT.CARD_PLAY_REJECTED, { card, reason: 'no_energy' });
      return { ok: false, reason: 'no_energy' };
    }

    this.energy -= def.cost;
    const combo = this.combo.play(card);
    const effect = resolveEffect(def, card.realm, combo.multiplier);

    // 先把打出的牌移出手牌，之後若這張牌會抽牌/引爆合成，才不會把自己算進去
    this.hand.removeByUid(uid);
    this.deck.discard(card);

    const result = { card, def, combo, effect, damage: effect.totalDamage, armor: effect.totalArmor };

    // 依「效果欄位」逐項套用，而不是硬綁牌型 —— 一張牌可同時做好幾件事
    if (effect.totalDamage > 0 || def.target) {
      // 擊退在 resolveAttack 內逐波施加（崩山連段會多波擊退），這裡把幅度傳進去
      const combat = resolveAttack(
        effect,
        def.target ?? TARGET.SINGLE,
        this.formation,
        this.rng,
        def.knockback ?? 0,
        { rows: def.rows, size: def.blast }
      );
      result.combat = combat;
      this.damageThisTurn += combat.hits.reduce((s, h) => s + h.damage, 0);
      if (def.knockback) result.knockback = true;

      this.bus.emit(EVENT.DAMAGE_DEALT, result);
      this.bus.emit(EVENT.ENEMIES_HIT, { ...combat, combo, knockback: result.knockback });

      // 卡片「自身」的狀態效果（毒霧的毒、火藥的火）：定額，命中即上
      if (def.effectStatus) {
        this.applyStatusToHits(combat.hits, def.effectStatus.id, def.effectStatus.stacks);
      }
      // 附魔（外加）：層數由 enchantStacks 算（傷害卡按傷害縮放；無傷害卡走客製效果）。
      for (const [id, level] of cardEnchants(card)) {
        this.applyStatusToHits(combat.hits, id, this.enchantStacks(def, card.realm, id, level));
      }
    }
    if (effect.totalArmor > 0) {
      this.armor += effect.totalArmor;
      this.bus.emit(EVENT.ARMOR_GAINED, result);
    }
    if (effect.energy) {
      this.energy += effect.energy;
    }
    if (effect.draw) {
      // 抽牌會引爆合成，產出一份 transcript 交給場景演出（跟 debugDraw 同路數）
      const tx = this.drawCards(effect.draw);
      tx.push(...resolveAutoMerges(this, this.tuning));
      result.transcript = tx;
    }

    this.bus.emit(EVENT.CARD_PLAYED, result);
    this.bus.emit(EVENT.ENERGY_CHANGED, { energy: this.energy });
    this.bus.emit(EVENT.COMBO_CHANGED, combo);

    // 出牌＝流逝一格時間：異常狀態跳一次小 tick（中毒滴傷、燃燒疊層）
    this.statusTick('play');

    // 清空整片但還有補充波 ⇒ 下一波立刻湧上（割草手感）
    this.maybeRushNextWave();
    // 這張牌可能清空了最後一波敵陣（且無補充波）⇒ 判勝
    this.checkOutcome();
    return { ok: true, result };
  }

  /**
   * 一個附魔（statusId、level）套到敵人身上是幾層。三條路（由專到泛）：
   *   1. 卡自訂 `def.enchantStacks(id, level, ctx)` —— 完全客製。
   *   2. 附魔與卡「自身狀態效果」同種（如毒霧的毒附魔）：放大自身效果 ＝ effectStatus.stacks × level
   *      （疊在 effectStatus 的定額之上：level 1 ⇒ 總共 2 倍、level 2 ⇒ 3 倍…）。
   *   3. 一般傷害卡：round(每發基礎傷 × enchantScale × level)。無傷害又無上述客製 ⇒ 0。
   */
  enchantStacks(def, realm, statusId, level) {
    if (def.enchantStacks) return def.enchantStacks(statusId, level, { def, realm });
    if (def.effectStatus && def.effectStatus.id === statusId) {
      return def.effectStatus.stacks * level;
    }
    const baseDmg = resolveEffect(def, realm, 1).damage ?? 0;
    const scale = def.enchantScale ?? this.tuning.combat.enchantScaleDefault;
    return Math.round(baseDmg * scale * level);
  }

  /** 對命中且存活的敵人各上 stacks 層某狀態（連段多波打到同一人只上一次）。 */
  applyStatusToHits(hits, id, stacks) {
    if (stacks <= 0) return;
    const seen = new Set();
    for (const h of hits) {
      if (h.killed || seen.has(h.uid)) continue;
      seen.add(h.uid);
      const e = this.formation.findByUid(h.uid);
      if (e?.alive) applyStatus(e, id, stacks);
    }
  }

  /**
   * 結算一次異常狀態的跳動並發事件給 UI。
   * @param phase 'play'（出牌小 tick）或 'turnEnd'（回合結束大 tick）
   * @returns resolveStatusTick 的結果
   */
  statusTick(phase) {
    const result = resolveStatusTick(this.formation, phase, this.tuning);
    if (result.hits.length || result.changed.length) {
      this.bus.emit(EVENT.STATUS_TICKED, result);
    }
    return result;
  }

  /** 回合結束大 tick（場景在敵人前進之前呼叫，讓 DoT 先收割）。 */
  statusTurnEnd() {
    return this.statusTick('turnEnd');
  }

  /** 玩家拉箭頭把 dragged 併進 target。@returns transcript 或 null（配對不合法） */
  formlessMerge(draggedUid, targetUid) {
    const transcript = applyFormlessMerge(this, draggedUid, targetUid, this.tuning);
    if (transcript) this.bus.emit(EVENT.TRANSCRIPT, transcript);
    return transcript;
  }

  /** Debug 用：把一個狀態施加到最前方的敵人（預設 3 層，看得出 DoT 效果）。 */
  debugApplyStatus(id, stacks = 3) {
    const enemy = this.formation.frontLivingEnemy();
    if (enemy) applyStatus(enemy, id, stacks);
    return enemy;
  }

  /** Debug 用：調整內力（下限 0，不設上限方便測試多費卡），並發事件更新 UI。 */
  debugAddEnergy(delta) {
    this.energy = Math.max(0, this.energy + delta);
    this.bus.emit(EVENT.ENERGY_CHANGED, { energy: this.energy });
    return this.energy;
  }

  /** Debug 用：抽 n 張，並解算隨之引爆的連鎖。@returns transcript */
  debugDraw(n = 1) {
    const transcript = this.drawCards(n);
    transcript.push(...resolveAutoMerges(this, this.tuning));
    this.bus.emit(EVENT.TRANSCRIPT, transcript);
    return transcript;
  }

  /** Debug 用：直接塞一張牌進手牌，並解算隨之引爆的連鎖。@returns transcript */
  debugAddCard(defId, { realm = 1, tags = [], enchants = {} } = {}) {
    const card = createCard(defId, { realm, tags, enchants });
    this.hand.add(card);
    const transcript = [{ type: TX.DRAW, card }];
    transcript.push(...resolveAutoMerges(this, this.tuning));
    this.bus.emit(EVENT.TRANSCRIPT, transcript);
    return transcript;
  }
}
