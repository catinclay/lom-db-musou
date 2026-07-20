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
import { getRelicDef } from './RelicLibrary.js';
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
    // 主角屬性覆蓋 tuning 的 maxRealm/energyPerTurn/startingHandSize（其餘 nested 值照舊共用）——
    // 這樣屬性成長會流進回合資源與**合成上限**（merge 吃 this.tuning）。
    this.tuning = battle.attrs ? { ...tuning, ...battle.attrs } : tuning;
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
    // 一個補充波包含固定排數；成功生成一排才消耗內容，避免場滿時波次空扣。
    this.reinforcementRowsPerWave = bc.rows ?? this.tuning.combat.rows;
    this.wavesLeft = bc.waves ?? Infinity;
    this.rowsLeftInWave = this.wavesLeft > 0 ? this.reinforcementRowsPerWave : 0;
    // 精英/魔王：正常補充波清完後才從最後方登場（finale）。省略 bossDefId ＝ 無王，行為照舊。
    this.bossDefId = bc.bossDefId ?? null;
    this.bossSpawned = false;
    this.awaitingWaveChoice = false;
    this.clearRewardClaimed = false;
    this.pendingClearReward = null;
    this.outcome = 'ongoing';
    this.formation = new Formation(this.tuning.combat.lanes, this.tuning.combat.maxRank, this.rng);
    this.formation.refill(this.reinforcementRowsPerWave, this.enemySpec());
    this.formation.planSpecialIntents();

    this.runRelicHook('onBattleStart'); // 遺物：戰鬥開場一次性效果（如給敵陣上狀態）
    this.bus.emit(EVENT.BATTLE_STARTED, { state: this });
    return this.startTurn();
  }

  /** 這場戰鬥帶的遺物定義（由 battleConfig.relics 的 id 解算）。 */
  relicDefs() {
    return (this.battleConfig.relics ?? []).map(getRelicDef);
  }

  /** 匯總所有遺物 battleMods 的某個數值（energy / handSize…）。 */
  relicMod(key) {
    return this.relicDefs().reduce((s, r) => s + (r.battleMods?.[key] ?? 0), 0);
  }

  /** 依序呼叫遺物的某個 hook（收到 battle 本體）。 */
  runRelicHook(name, ...args) {
    for (const r of this.relicDefs()) r.hooks?.[name]?.(this, ...args);
  }

  /** 生成新排時用的敵種與人數（可注入 rng，測試才不會擲骰子）。數值可由 battleConfig 覆寫。 */
  enemySpec() {
    const c = this.tuning.combat;
    const bc = this.battleConfig;
    const minPerRow = bc.minPerRow ?? c.minPerRow;
    const maxPerRow = bc.maxPerRow ?? c.maxPerRow;
    const eliteChance = bc.eliteChance ?? c.eliteChance;
    const gruntPool = bc.gruntDefIds ?? (bc.gruntDefId ? [bc.gruntDefId] : c.gruntPool);
    const elitePool = bc.eliteDefIds ?? (bc.eliteDefId ? [bc.eliteDefId] : c.elitePool);
    return {
      defId: () => {
        const pool = this.rng() < eliteChance ? elitePool : gruntPool;
        return pool[Math.floor(this.rng() * pool.length)];
      },
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
    } else if (this.formation.isEmpty && !this.hasReinforcements && !this.hasPendingBoss) {
      this.outcome = 'won';
      this.bus.emit(EVENT.BATTLE_WON, { state: this });
    }
    return this.outcome;
  }

  /** 還有未登場的王（正常波清完後才登場，因此王未死不算勝）。 */
  get hasPendingBoss() {
    return Boolean(this.bossDefId) && !this.bossSpawned;
  }

  /**
   * 正常補充波用盡後，讓王從最後方登場（單體置中）。
   * @returns 是否生成了王（成功才發事件）
   */
  maybeSpawnBoss() {
    if (!this.hasPendingBoss || this.hasReinforcements) return false;
    const added = this.formation.addBackRow({ defId: () => this.bossDefId, count: () => 1 });
    if (!added) return false;
    this.bossSpawned = true;
    return true;
  }

  /** @returns transcript */
  startTurn() {
    const pendingClearReward = this.pendingClearReward;
    this.pendingClearReward = null;
    this.turn += 1;
    this.energy = this.tuning.energyPerTurn + this.relicMod('energy') + (pendingClearReward?.energy ?? 0); // 遺物／清場加成
    this.damageThisTurn = 0;
    this.mergesThisTurn = 0;
    this.armor = 0; // 護甲是「格擋」，每回合重置（敵人上回合結束已結算過）
    this.combo.reset();

    // 先把該抽的牌一次抽完，再一口氣解算合成 ——
    // 不是抽一張算一次，否則玩家看不出「這批牌湊出了什麼」。
    const handSize = this.tuning.startingHandSize + this.relicMod('handSize') + (pendingClearReward?.draw ?? 0);
    const transcript = this.drawCards(handSize);
    transcript.push(...resolveAutoMerges(this, this.tuning));

    this.runRelicHook('onTurnStart'); // 遺物：每回合開始效果（如給敵人上狀態）
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

  get hasReinforcements() {
    return this.wavesLeft === Infinity || this.wavesLeft > 0;
  }

  /** 成功送進指定排數才消耗波次內容；場地塞滿時不會空扣。 */
  spawnReinforcementRows(maxRows = 1) {
    let rowsAdded = 0;
    while (rowsAdded < maxRows && this.hasReinforcements) {
      if (!this.formation.addBackRow(this.enemySpec())) break;
      rowsAdded += 1;
      this.rowsLeftInWave -= 1;
      if (this.rowsLeftInWave <= 0) {
        if (this.wavesLeft !== Infinity) this.wavesLeft -= 1;
        this.rowsLeftInWave = this.hasReinforcements ? this.reinforcementRowsPerWave : 0;
      }
    }
    if (rowsAdded > 0) {
      this.awaitingWaveChoice = false;
      this.clearRewardClaimed = false;
    }
    return rowsAdded;
  }

  /** 清場後叫陣：把當前補充波尚未進場的排數一次送進來。 */
  challengeNextWave() {
    if (this.outcome !== 'ongoing' || !this.awaitingWaveChoice || !this.formation.isEmpty || !this.hasReinforcements) return 0;
    const rowsAdded = this.spawnReinforcementRows(this.rowsLeftInWave);
    if (rowsAdded > 0) {
      this.formation.planSpecialIntents();
      this.bus.emit(EVENT.ENEMIES_ADVANCED, { formation: this.formation, challenge: true, rowsAdded });
    }
    return rowsAdded;
  }

  /** 玩家出牌清空敵陣時，送內力與抽牌一次，接著等待叫陣或正常結束回合。 */
  rewardClearIfNeeded() {
    if (!this.formation.isEmpty || !this.hasReinforcements || this.clearRewardClaimed) return null;
    const reward = this.tuning.combat.clearReward;
    this.clearRewardClaimed = true;
    this.awaitingWaveChoice = true;
    this.energy += reward.energy;
    const transcript = this.drawCards(reward.draw);
    transcript.push(...resolveAutoMerges(this, this.tuning));
    return { energy: reward.energy, draw: reward.draw, transcript };
  }

  /** 敵人相位：攻擊 → 準備倒數／特殊行動 → 前進繞道 → 正常補一排 → 規劃下回合意圖。 */
  enemyPhase() {
    this.formation.tickSpecialCooldowns();
    const attackers = this.formation.consumeContactAttacks();
    const contactDamage = attackers.reduce((sum, e) => sum + e.damage, 0);
    const blocked = Math.min(this.armor, contactDamage);
    this.armor -= blocked;
    const hpDamage = contactDamage - blocked;
    this.playerHp = Math.max(0, this.playerHp - hpDamage);
    if (contactDamage > 0) {
      this.bus.emit(EVENT.PLAYER_HIT, { damage: hpDamage, blocked, hp: this.playerHp });
    }

    this.formation.progressContactPreparation(new Set(attackers.map((e) => e.uid)));
    const specials = this.formation.resolveSpecialActions();
    this.formation.advance({ stay: specials.stayed });
    const rowsAdded = this.spawnReinforcementRows(1);
    const bossEntered = this.maybeSpawnBoss(); // 正常波清完 → 王登場
    this.formation.initializeContactPreparation();
    this.formation.planSpecialIntents();
    this.bus.emit(EVENT.ENEMIES_ADVANCED, {
      formation: this.formation,
      rowsAdded,
      bossEntered,
      specials: specials.resolved,
    });

    this.checkOutcome();
    return {
      contactDamage,
      blocked,
      hpDamage,
      playerHp: this.playerHp,
      defeated: this.playerHp <= 0,
      outcome: this.outcome,
      attackers: attackers.map((e) => e.uid),
      rowsAdded,
      specials: specials.resolved,
    };
  }

  /**
   * 投射物前進一步（每次出牌呼叫）：命中玩家者先扣護甲再扣血並消失。
   * @returns advanceProjectiles 的結果,或 null（沒有投射物）
   */
  advanceProjectiles() {
    const res = this.formation.advanceProjectiles();
    if (!res.moved) return null;
    if (res.damage > 0) {
      const blocked = Math.min(this.armor, res.damage);
      this.armor -= blocked;
      const hpDamage = res.damage - blocked;
      this.playerHp = Math.max(0, this.playerHp - hpDamage);
      this.bus.emit(EVENT.PLAYER_HIT, { damage: hpDamage, blocked, hp: this.playerHp });
    }
    this.bus.emit(EVENT.ENEMIES_ADVANCED, { formation: this.formation, projectiles: true, hits: res.hits });
    return res;
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

    // 出牌＝流逝一格時間：先推進敵人身上的既有狀態。
    // 本張牌命中後新增的狀態在下方才套用，因此首次 tick 會延到下一次出牌。
    this.statusTick('play');

    if (result.combat) {
      // 卡片「自身」的狀態效果（毒霧的毒、火藥的火）：吃境界與連段縮放後，對每個命中者上一次。
      if (def.effectStatus) {
        this.applyStatusToHits(result.combat.hits, def.effectStatus.id, effect.statusStacks, { perWave: true });
      }
      // 附魔（外加）：層數由 enchantStacks 算（傷害卡按傷害縮放；無傷害卡走客製效果）。
      for (const [id, level] of cardEnchants(card)) {
        this.applyStatusToHits(
          result.combat.hits,
          id,
          this.enchantStacks(def, card.realm, id, level),
          { perWave: Boolean(def.effectStatus) }
        );
      }
    }

    // 出牌＝一格時間流逝：玩家出招（可能已打掉投射物）後,存活的投射物前進一格、可能命中玩家。
    const proj = this.advanceProjectiles();
    if (proj) result.projectiles = proj;

    const clearReward = this.rewardClearIfNeeded();
    if (clearReward) {
      result.clearReward = { energy: clearReward.energy, draw: clearReward.draw };
      result.transcript = [...(result.transcript ?? []), ...clearReward.transcript];
      this.bus.emit(EVENT.ENERGY_CHANGED, { energy: this.energy });
    }
    // 清空正常波後,王當回合就從最後方登場（而非等下一次敵方相位）。
    if (this.maybeSpawnBoss()) {
      this.formation.initializeContactPreparation();
      result.bossEntered = true;
      this.bus.emit(EVENT.ENEMIES_ADVANCED, { formation: this.formation, bossEntered: true, rowsAdded: 0 });
    }
    // 這張牌可能清空了最後一波敵陣（且無補充波、無待登場王）⇒ 判勝
    this.checkOutcome();
    return { ok: true, result };
  }

  /**
   * 一個附魔（statusId、level）套到敵人身上是幾層。三條路（由專到泛）：
   *   1. 卡自訂 `def.enchantStacks(id, level, ctx)` —— 完全客製。
   *   2. 附魔與卡「自身狀態效果」同種（如毒霧的毒附魔）：放大境界縮放後的自身效果 × level
   *      （疊在 effectStatus 之上：level 1 ⇒ 總共 2 倍、level 2 ⇒ 3 倍…）。
   *   3. 一般傷害卡：round(每發基礎傷 × enchantScale × level)。無傷害又無上述客製 ⇒ 0。
   */
  enchantStacks(def, realm, statusId, level) {
    if (def.enchantStacks) return def.enchantStacks(statusId, level, { def, realm });
    if (def.effectStatus && def.effectStatus.id === statusId) {
      return resolveEffect(def, realm, 1).statusStacks * level;
    }
    const baseDmg = resolveEffect(def, realm, 1).damage ?? 0;
    const scale = def.enchantScale ?? this.tuning.combat.enchantScaleDefault;
    return Math.round(baseDmg * scale * level);
  }

  /** 對命中且存活的敵人上狀態；純狀態卡每波各套一次，一般附魔整張牌仍只套一次。 */
  applyStatusToHits(hits, id, stacks, { perWave = false } = {}) {
    if (stacks <= 0) return;
    const seen = new Set();
    for (const h of hits) {
      const key = perWave ? `${h.wave ?? 0}:${h.uid}` : h.uid;
      if (h.killed || seen.has(key)) continue;
      seen.add(key);
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
    const result = this.statusTick('turnEnd');
    // DoT 可能在玩家已按下「結束回合」後才清場。此時已無法選擇叫陣，
    // 所以仍照正常敵方相位只補一排，獎勵則延到下一個玩家回合，避免抽到的牌立刻被棄掉。
    if (this.formation.isEmpty && this.hasReinforcements && !this.clearRewardClaimed) {
      const reward = this.tuning.combat.clearReward;
      this.clearRewardClaimed = true;
      this.pendingClearReward = { energy: reward.energy, draw: reward.draw };
      result.clearReward = { ...this.pendingClearReward, deferred: true };
    }
    return result;
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
