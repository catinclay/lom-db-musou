/**
 * 所有平衡數值的唯一來源。禁止把這些數字散落到別的檔案。
 * 調手感時只該動這裡。
 */

export const TUNING = {
  // ── 資源 ──────────────────────────────────────────────
  /** 內力以小格儲存；3 小格在 UI 組成 1 個完整氣輪。 */
  energyUnit: 3,
  energyPerTurn: 9,
  startingHandSize: 5,

  // ── 功能牌資源／合成補牌 ──────────────────────────────
  /** 階級一到五的單次功能牌產量；超階沿用最後一格。 */
  skillResourceCurve: [3, 4, 5, 6, 7],
  inspiration: {
    threshold: 3,
    perMerge: 2,
  },

  /**
   * 純粹的 bug 防護網，不是遊戲規則。
   * 合成必然終止（每次消耗 2 產出 1，全系統牌數嚴格 −1），
   * 這個上限只是在邏輯被改壞時避免凍結瀏覽器。
   */
  maxChainGuard: 200,

  /** 自動合成的階級上限。null = 不設限；忘形施放可突破此上限。 */
  maxRank: 5,

  /** 每發傷害／護甲與卡片自身狀態的階級曲線；超出表長沿用最後一格。 */
  rankCurve: [1, 1.5, 2.5, 4, 6],

  // ── 連擊 ──────────────────────────────────────────────
  /**
   * 線性：連擊 N 得 ×N 次數。
   * 倍率怎麼「用」由每張卡自己決定（見 CardLibrary 的 comboScale）——
   * 劈是傷害變高，暗器是發數變多。
   */
  comboMultiplier: (combo) => combo,

  // ── 演出節奏（毫秒）───────────────────────────────────
  anim: {
    /** Scene 切換統一先淡入墨色、再由墨色淡入新畫面，避免 1 frame 硬切。 */
    sceneTransition: {
      fadeOut: 220,
      fadeIn: 280,
      color: 0x100c09,
    },
    mergeCollide: 260,
    mergePop: 180,
    drawFly: 240,
    discardFly: 220,
    exhaustFade: 260,
    exhaustRise: 90,
    exhaustScale: 0.25,
    rankUpPopScale: 1.25,
    inspirationStep: 180,
    inspirationPulseScale: 1.2,
    inspirationBurstDuration: 280,
    inspirationCueDuration: 800,
    inspirationRise: 38,
    inspirationBurstScale: 2.6,
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

    /** 連擊的多次施放間隔；毒霧／火藥與一般多波招式共用。 */
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
    clearReward: { energy: 3, draw: 1 },

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
    startingRelics: ['lingXiYu'],
    finalDay: 10,
    bossEveryDays: 3, // 第 3/6/9 天魔王
    /** 白天分成數個「時辰」；每時辰擲 offer.size 個選項挑 1 個做，隨時可入夜。 */
    maxRoundsPerDay: 6,
    /** 行程畫面的入夜決戰焦點：時辰用盡後移到中央並放大，凸顯唯一主流程出口。 */
    mapLayout: {
      bossButton: {
        normal: { x: 800, y: 800, width: 420, height: 76, fontSize: 24 },
        exhausted: { x: 800, y: 525, width: 640, height: 118, fontSize: 34 },
      },
      exhaustedPrompt: { x: 800, y: 395, fontSize: 28 },
    },
    /**
     * 時辰選項導演：先抽內部風險組成，再抽具體內容；UI 不顯示風險標籤。
     * 權重只決定同一風險池內的相對機率。
     */
    offer: {
      size: 3,
      patterns: [
        { risks: ['safe', 'normal', 'normal'], weight: 50 },
        { risks: ['safe', 'normal', 'dangerous'], weight: 30 },
        { risks: ['safe', 'safe', 'dangerous'], weight: 15 },
        { risks: ['safe', 'dangerous', 'dangerous'], weight: 5 },
      ],
      kindWeights: {
        inn: 11,
        merchant: 25,
        dojo: 20,
        casino: 10,
        battle: 30,
        elite: 20,
      },
      eventWeights: {
        yeGu: 15,
        duFang: 10,
        chouJia: 12,
        baoXiang: 15,
        langZhong: 24,
        gaoRen: 20,
      },
      recentHistorySize: 2,
      recentWeightMultiplier: 0.25,
      unaffordableServiceWeightMultiplier: 0.2,
      innMaxOffersPerDay: 1,
      innCooldownOffers: 2,
      lowHpMercy: {
        eventId: 'yuanShou',
        hpRatio: 0.3,
        healMaxHpRatio: 0.15,
        maxPerRun: 2,
        maxPerDay: 1,
      },
    },
    startMoney: 30,
    speedrunTokensPerSkipped: 1,
    dally: { wavesPerEvent: 0.5, eliteChancePerEvent: 0.03 },
    battle: {
      battle: { waves: 2, rows: 3, eliteChance: 0.12 }, // 尋常廝殺
      elite: { waves: 3, rows: 3, eliteChance: 0.4 }, // 精英 / 小王
      boss: { waves: 4, rows: 4, eliteChance: 0.6 }, // 魔王
      final: { waves: 6, rows: 4, eliteChance: 0.85 }, // 最終大魔王
    },
    reward: { battle: 6, elite: 12, boss: 25, final: 0 },

    /** 跨 run 的「門派威望」（Phase 5）：run 結束依撐到第幾天 ＋ 通關獎勵賺取，回據點花在永久升級。 */
    meta: { prestigePerDay: 3, winBonus: 25 },

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
      rankCost: 55, // 高人指點：提升自動合成階級上限（較貴）
    },

    /**
     * 三輪連線拉霸（速通代幣消化，刻意弱於刷滿）。
     * 每輪各轉一個符號；三連＝該符號大獎、兩連＝小銀兩、全不同＝安慰銀兩。
     *   金/葫蘆/毒/火 → 銀兩；劍 → 加一張攻擊牌；囧 → 槓龜。
     * 期望值刻意壓低（多數拉出小銀兩），大獎稀有 —— 速通是挑戰而非穩定發財。
     */
    slot: {
      symbols: { coin: 28, sword: 12, poison: 12, fire: 12, gourd: 5, dud: 31 },
      jackpot: {
        coin: 35,
        gourd: 90,
        sword: 'card',
        poison: 20,
        fire: 20,
        dud: 0,
      },
      pairCoins: 7,
      missCoins: 3,
      rewardCardPool: ['hengPi', 'guan', 'anqi', 'bengShan', 'duWu', 'huoYao'],
    },

    /**
     * 白天服務設施共用數值：客棧只歇息、江湖商販賣牌與遺物、武館刪牌、賭坊消耗代幣。
     */
    shop: {
      cardCount: 3,
      cardPool: ['hengPi', 'guan', 'anqi', 'bengShan', 'duWu', 'huoYao', 'yunQi', 'linJi', 'wangXing'],
      cardPrice: { min: 14, max: 26 },
      removePrice: 20,
      relicPrice: 45,
      rest: { price: 12, heal: 20 },
    },
  },
};
