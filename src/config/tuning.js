/**
 * 所有平衡數值的唯一來源。禁止把這些數字散落到別的檔案。
 * 調手感時只該動這裡。
 */

export const TUNING = {
  // ── 資源 ──────────────────────────────────────────────
  energyPerTurn: 3,
  startingHandSize: 5,

  // ── 合成補抽 ──────────────────────────────────────────
  /**
   * 兩張就能合成，若每次必抽會太強，所以補抽是機率制。
   *
   * 機率在「同一回合內」逐次遞減，每回合重置：
   *   第1次合成 70%、第2次 60%、第3次 50%、第4次 40%、第5次以後 30%
   *
   * decayPerMerge 是「百分點」不是相對比例 —— 0.70 − 0.10 = 0.60，
   * 剛好第 5 次合成觸底 30%。
   */
  mergeDraw: {
    baseChance: 0.7,
    decayPerMerge: 0.1,
    minChance: 0.3,
  },

  /**
   * 純粹的 bug 防護網，不是遊戲規則。
   * 合成必然終止（每次消耗 2 產出 1，全系統牌數嚴格 −1），
   * 這個上限只是在邏輯被改壞時避免凍結瀏覽器。
   */
  maxChainGuard: 200,

  /**
   * 境界上限。null = 不設限。
   * 到頂的牌**不再合成**（兩張境界 5 不會併，忘形也吃不動境界 5）——
   * 是「擋下合成」而非「合成後夾住」，所以到頂的牌就停在那不動。
   */
  maxRealm: 5,

  /**
   * 每張卡的**附魔上限**（合成後 enchants 的 level 總和上限）。境界 N → 2^(N−1)：1/2/4/8/16。
   * 合成匯總兩張的附魔後若超過上限，就把附魔展開成「單位」隨機篩到上限（見 Card.combineEnchantsCapped）。
   * 二級附魔（level 2）＝ 2 個單位，所以在上限計算裡算兩個。忘形是 tag 不是 enchant，不佔上限。
   */
  enchantCap: (realm) => 2 ** Math.max(0, realm - 1),

  /**
   * 純傷害/護甲牌每發數值隨境界的成長倍率（相對境界一）。
   * 索引 = 境界−1：境界一 ×1、境界二 ×1.5 …… 境界五 ×6。
   * 不是等比 —— 高境界回報遞增（100/150/250/400/600%），鼓勵把牌養高。
   * 超出表長的境界沿用最後一格。功能牌（內力、抽牌）不吃這條，走自己的線性曲線。
   */
  realmDamageCurve: [1, 1.5, 2.5, 4, 6],

  // ── 連段（§4 境界連段）────────────────────────────────
  /**
   * 線性遞增：第 N 張遞增牌得 ×N。
   * 倍率怎麼「用」由每張卡自己決定（見 CardLibrary 的 comboScale）——
   * 劈是傷害變高，暗器是發數變多。
   */
  comboMultiplier: (step) => step,

  // ── 演出節奏（毫秒）───────────────────────────────────
  anim: {
    mergeCollide: 260,
    mergePop: 180,
    drawFly: 240,
    discardFly: 220,
    handRelayout: 200,
    /** 連鎖中每步之間的間隔，太短會看不清、太長會拖沓 */
    chainStepGap: 90,

    /**
     * 抽牌批次窗口（毫秒）。
     * 連點「抽一張」時，在這段窗口內累積的抽牌會併成一次 drawCards(n) ——
     * 一口氣抽完再解算整條連鎖，而不是抽一張合一次、抽一張合一次。
     * 每次點擊都會重置窗口，所以連續快點會一路併下去。
     */
    drawBatchWindow: 110,

    /** 境界連段的多次施放間隔；毒霧／火藥與一般多波招式共用。 */
    combatWaveDelay: 240,
    /** 崩山需在每波傷害後演出擊退，間隔略長。 */
    knockbackWaveDelay: 320,

    /**
     * 「越做越快」的加速。每抽一張、每合一次動能 +1，速度照步數遞增（有上限）。
     * 動能在整個回合內持續累積（見 MergeAnimator.chainStep）—— 抽牌與合成交替循環
     * 速度一路疊上去，只有玩家出牌或回合結束才歸零、回到初速。
     *
     * 速度倍率 ＝ chainSpeedScale × min(chainAccelMax, 1 + step × chainAccelPerStep)。
     *   chainSpeedScale 是**整條速度曲線的總倍率**：0.5 ＝ 每一步都放慢成現在的一半。
     *     （注意：回合開頭 5 張抽牌已把 step 墊高，第一次合成其實落在曲線中段而非 step 0，
     *      所以要放慢「看得到的初始合成」得用總倍率，而不是只降 step 0 的初值。）
     *   （閒置時的 hover/relayout 走 chainSpeed = 1.0，不吃這個倍率 —— 只放慢合成/抽牌連鎖。）
     * 覺得整體太快/太慢就調 chainSpeedScale；加速斜率調 chainAccelPerStep、頂速調 chainAccelMax。
     */
    chainSpeedScale: 0.5,
    chainAccelPerStep: 0.35,
    chainAccelMax: 3.5,
  },

  // ── 敵人 / 戰鬥（里程碑 2：割草）────────────────────────
  combat: {
    playerMaxHp: 80,
    /** 縱列（路）總數，固定，用來對齊各排 —— 招式「打一整路」靠它 */
    lanes: 7,
    /** 場地最遠只到這麼多排（擊退推不過這裡） */
    maxRank: 6,
    /** 場上維持的排數；不足就從最後方補新排湧上 */
    rows: 4,
    /** 每排人數（測試意圖／繞道期間先維持稀疏，會被 lanes 夾住） */
    minPerRow: 2,
    maxPerRow: 4,
    /** 生成精英池敵人的機率，其餘從雜兵池抽取。 */
    eliteChance: 0.15,
    gruntPool: ['luo', 'kuaiDao'],
    elitePool: ['han', 'dingZhuang'],

    /** 清空一批敵人時的即時獎勵；每次清場只領一次。 */
    clearReward: { energy: 1, draw: 1 },

    /** 敵人戰鬥數值與意圖節奏。名字／外觀在 EnemyLibrary。 */
    enemies: {
      luo: { hp: 14, damage: 5, prepareTurns: 2 },
      kuaiDao: { hp: 10, damage: 4, prepareTurns: 1 },
      han: { hp: 36, damage: 11, prepareTurns: 3 },
      dingZhuang: {
        hp: 28,
        damage: 8,
        prepareTurns: 3,
        initialImmovable: 1,
        special: {
          id: 'brace',
          chance: 0.35,
          chargeTurns: 1,
          cooldownTurns: 1,
          buffId: 'immovable',
          buffStacks: 1,
          buffCap: 2,
        },
      },

      /**
       * 精英/魔王（isBoss）：前面波次清完才登場（finale），視覺上鏡射一條大血條在畫面正上方。
       *   attackRange：可在 rank ≤ N 就發動攻擊（雜兵省略＝0，只在接觸位打）。到達射程即停止前進。
       *   specials：召喚/投射物/後退（Phase 2–3 加，資料驅動）。
       * 頭目＝小王（精英戰）；魔王＝魔王/最終戰。
       */
      touMu: {
        hp: 90,
        damage: 14,
        prepareTurns: 2,
        attackRange: 1,
        isBoss: true,
        specials: [
          { id: 'summon', type: 'summon', chance: 0.35, chargeTurns: 1, cooldownTurns: 2, summonDefId: 'luo', summonCount: 2 },
        ],
      },
      moWang: {
        hp: 180,
        damage: 20,
        prepareTurns: 2,
        attackRange: 2,
        isBoss: true,
        specials: [
          { id: 'summon', type: 'summon', chance: 0.4, chargeTurns: 1, cooldownTurns: 2, summonDefId: 'kuaiDao', summonCount: 3 },
        ],
      },
    },

    /**
     * 異常狀態（DoT）。兩種節拍：出牌小 tick、回合結束大 tick。
     *
     *   中毒 = 即時流血、比例衰減：**每個 tick**（出牌與回合結束都是）造成傷害後
     *          衰減 decayRate 比例層數（最少 1 層）。出牌＝1 tick；回合結束＝turnEndTicks 個
     *          連續 tick（先算好總傷與總衰減，畫面只跳一次數字，免得太亂）。
     *   燃燒 = 蓄力引爆：出牌時火自己 +growthRate 比例層（最少 1、不掉血，越燒越旺）；
     *          回合結束依層數引爆（每層 detonateDamage 傷）後**快衰**（只留 decayKeep 比例）。
     *
     * 比例衰減本身就是軟上限，不會無限爆炸；掛機殺不死人（tick 只在出牌／回合結束跳）。
     */
    status: {
      poison: { damagePerStack: 1, decayRate: 0.1, turnEndTicks: 3 },
      burn: { growthRate: 0.2, detonateDamage: 1, decayKeep: 0.34 },
    },

    /**
     * 附魔（外加，非卡片自身效果）套到敵人身上的層數：
     *   層數 = round(卡每發「基礎傷害」× enchantScale × 附魔 level)
     * 基礎傷害＝該卡「境界解算後、未吃連段/暫時 buff」的每發傷（見 BattleState.playCard）——
     * 所以境界升、傷害升，附魔層數等比升；連段或臨時增傷不影響。
     * enchantScale 每張卡自訂（打到單位越少的卡給越高，單體約 0.2）；沒寫走這個預設。
     */
    enchantScaleDefault: 0.1,

    /**
     * 肩後攝影機的投影參數（見 ui/perspective.js）。
     * 不是俯視 —— 而是主角在左下、鏡頭從肩後往前看，敵人一排排由遠而近、
     * 前排壓在後排上。dist 越小＝越近＝越低越大。
     */
    view: {
      vanishX: 860,
      horizonY: 205,
      nearY: 560,
      nearScale: 1.15,
      /** dist 每 +1 的縮退量，越大排越密、透視越強 */
      rowGap: 0.52,
      /** 同排相鄰敵人在 scale=1 時的間距 */
      colSpacing: 155,
    },
  },

  // ── 扇形手牌佈局 ──────────────────────────────────────
  hand: {
    cardWidth: 140,
    cardHeight: 196,
    /** 扇形總張角上限（度）。手牌少時用不滿 */
    maxArcAngle: 28,
    /** 每張牌之間的理想張角（度），手牌多時會被壓縮 */
    anglePerCard: 5.5,
    /** 手牌整體寬度上限（px），超過就開始重疊 */
    maxSpreadWidth: 900,
    /** 扇形的虛擬圓半徑，越大弧越平 */
    radius: 1400,
    hoverScale: 1.18,
    hoverLift: 48,
    /** hover 時左右鄰牌讓位的距離 */
    neighborNudge: 26,
  },

  // ── 正式流程 / 一局江湖遠征（里程碑 3）──────────────────
  /**
   * 一「天」= 一池事件（自由取捨）＋ 入夜一場尾王。
   * 節奏（殺戮尖塔式）：平日尾王是「小王」（elite）；每 bossEveryDays 天一個魔王（boss）；
   *   第 finalDay 天是最終大魔王（final）。
   *
   * 「多農 vs 速通」的取捨：
   *   - 尾王吃「當天拖延加成」（dally）：白天做越多事件，尾王敵潮越大（waves/eliteChance ↑）。
   *   - 提早入夜（還有沒做完的事件）＝ 拿速通拉霸代幣（每略過一個 +speedrunTokensPerSkipped），
   *     但拉霸獎勵刻意弱於乖乖刷完（Phase 2 拉霸表再定強度）。
   *
   * battle[kind] = 該類戰鬥的基準配置（waves = 初始敵陣外的補充波數）。
   * reward[kind] = 打贏該類戰鬥給的銀兩。
   */
  run: {
    finalDay: 10,
    bossEveryDays: 3, // 第 3/6/9 天魔王
    /** 白天＝一輪輪「三選一」：每輪擲 offer.size 個選項挑 1 個做，最多 maxRoundsPerDay 輪，隨時可入夜。 */
    maxRoundsPerDay: 6,
    offer: { size: 3, innChance: 0.14, eventChance: 0.42 }, // 其餘為 battle/elite（elite 吃 eliteInPoolChance）
    eliteInPoolChance: 0.25,
    startMoney: 30,
    speedrunTokensPerSkipped: 1,
    dally: { wavesPerEvent: 0.5, eliteChancePerEvent: 0.03 },
    battle: {
      battle: { waves: 2, rows: 3, eliteChance: 0.12 }, // 尋常廝殺（無王）
      elite: { waves: 3, rows: 3, eliteChance: 0.4, bossDefId: 'touMu' }, // 精英 / 小王
      boss: { waves: 4, rows: 4, eliteChance: 0.6, bossDefId: 'moWang' }, // 魔王
      final: { waves: 6, rows: 4, eliteChance: 0.85, bossDefId: 'moWang' }, // 最終大魔王
    },
    reward: { battle: 6, elite: 12, boss: 25, final: 0 },

    /** 跨 run 的「門派威望」（Phase 5）：run 結束依撐到第幾天 ＋ 通關獎勵賺取，回據點花在永久升級。 */
    meta: { prestigePerDay: 3, winBonus: 25 },

    /**
     * 稀有度（稀有武功/絕學）。只影響「取得」——不改境界機制。
     *   weights       從混合卡池加權挑一張時，各稀有度的權重（絕學越稀有）。
     *   acquireRealm  取得時擲的境界範圍 [lo, hi]（含端點，會再夾 attrs.maxRealm）。
     *                 稀有/絕學「一入手就較高境界」,順帶拉高附魔上限（enchantCap=2^(realm-1)）。
     *   shopRareChance 商店每格貨架改抽「稀有以上」卡池的機率（否則走普通池）。
     *   rarePriceMult 稀有/絕學貨架的加價倍率。
     *   parseCost     參悟服務：把牌組某張牌的境界永久 +1（一輪內、跨戰保存）的花費。
     */
    rarity: {
      weights: { common: 70, rare: 24, signature: 6 },
      acquireRealm: { common: [1, 1], rare: [2, 3], signature: [3, 5] },
      shopRareChance: 0.3,
      rarePriceMult: 1.9,
      parseCost: 40,
    },

    /** 奇遇（EventLibrary）的經濟/風險數值。內容（文案、選項）在 core/EventLibrary.js。 */
    event: {
      smallCoins: 6, // 保守選項的小銀兩
      mushroomPoison: 8, // 野菇吃壞肚子扣血
      gambleCost: 20, // 賭坊一把
      bribe: 18, // 仇家買路錢
      chestReward: 30, // 寶箱開中
      chestTrap: 12, // 寶箱機關扣血
      healPrice: 15,
      healAmount: 25,
      cardPrice: 18, // 郎中傳一招
      trainCost: 30, // 高人指點：練內力/起手張數
      realmCost: 55, // 高人指點：悟境界上限（較貴）
      manualCost: 45, // 祕笈殘卷：參詳習得一招絕學（signature）
      manualSell: 20, // 祕笈殘卷：變賣換銀兩
    },

    /**
     * 三輪連線拉霸（速通代幣消化，刻意弱於刷滿）。
     * 每輪各轉一個符號；三連＝該符號大獎、兩連＝小銀兩、全不同＝安慰銀兩。
     *   金/葫蘆 → 銀兩；劍 → 加一張攻擊牌；毒/火 → 牌組某攻擊牌附魔；囧 → 槓龜。
     * 期望值刻意壓低（多數拉出小銀兩），大獎稀有 —— 速通是挑戰而非穩定發財。
     */
    slot: {
      symbols: { coin: 28, sword: 12, poison: 12, fire: 12, gourd: 5, dud: 31 },
      jackpot: {
        coin: 35,
        gourd: 90,
        sword: 'card',
        poison: { status: 'poison', level: 2 }, // 附魔給 level（實際層數出牌時按傷害算）
        fire: { status: 'burn', level: 2 },
        dud: 0,
      },
      pairCoins: 7,
      missCoins: 3,
      rewardCardPool: ['hengPi', 'guan', 'anqi', 'bengShan', 'duWu', 'huoYao'],
    },

    /**
     * 客棧（白天池中的 'inn' 節點）：買招式、歇息回血、刪去一招，也能拉霸。
     * 買牌 ＝ 牌組變厚變強；刪牌 ＝ 提純；歇息 ＝ 拿銀兩換血量續航。
     */
    shop: {
      cardCount: 3,
      cardPool: ['hengPi', 'guan', 'anqi', 'bengShan', 'duWu', 'huoYao', 'yunQi', 'linJi', 'wangXing'],
      /** 稀有以上的專屬貨架卡池（shopRareChance 命中時從這裡挑）。 */
      rareCardPool: ['huiLongJian', 'dianPoYunGuan'],
      cardPrice: { min: 14, max: 26 },
      removePrice: 20,
      relicPrice: 45,
      rest: { price: 12, heal: 20 },
    },
  },
};
