# CLAUDE.md — 程式碼地圖與慣例

> 這份文件的用途：不必重讀整份 code，就能找到「我想改的東西在哪個檔案」。
> 每次改動若動到了架構或慣例，順手更新這裡。

活俠傳同人遊戲 — Roguelike 牌組構築 ＋ 割草無雙。核心戰鬥（合成連鎖、境界連段、割草敵陣、
附魔）已成形；**里程碑 3「江湖遠征」run 結構進行中（Phase 1–3 已上線：run loop、拉霸、客棧商店、遺物、奇遇事件）** ——
一天一池事件自由取捨、入夜打尾王，殺戮尖塔式節奏推進到最終魔王（見「§四·九 正式流程」）。

---

## 一、最重要的一件事：core / UI 分層 ＋ 劇本（transcript）

整個程式的骨架就這一句話：

> **core 在第 0 毫秒把整條連鎖同步算完，產出一份有序事件陣列（transcript／劇本），
> 交給 UI 慢慢「重播」成動畫。邏輯與動畫徹底分離。**

這是連鎖合成不會「動畫與狀態打架」的根本原因。理解這點，後面的一切都好懂。

```
   玩家操作 / debug 按鈕
          │
          ▼
   ┌──────────────┐   同步、瞬間完成      ┌───────────────┐
   │  core (純 JS) │ ───────────────────▶ │  transcript    │  有序事件陣列
   │  零 Phaser    │   算完整條連鎖         │  (劇本)        │  DRAW/MERGE/…
   └──────────────┘                      └───────┬───────┘
          │ 也發 EVENT.*（傷害、護甲…）                  │
          ▼                                          ▼
   ┌──────────────┐                      ┌───────────────┐
   │  UI 事件訂閱   │◀──── EventBus ──────│  MergeAnimator │  照劇本逐格 tween
   │ (BattleScene) │                      │  播放、鎖輸入    │
   └──────────────┘                      └───────┬───────┘
                                                  ▼
                                         畫面（HandView / CardSprite）
```

- **core**（`src/core/`）：零 Phaser 依賴，可在 Node 測試裡跑數字。對外只發事件、回傳劇本。
- **UI**（`src/ui/`、`src/scenes/`）：認識 Phaser，訂閱事件、把劇本演成動畫。
- **設定**（`src/config/tuning.js`）：所有平衡與手感數值的**唯一來源**。

---

## 二、目錄地圖

| 目錄 | 管什麼 |
|------|--------|
| `src/core/` | 遊戲邏輯：卡牌、合成、連段、牌庫、**敵人/割草戰鬥**、戰鬥狀態機。純 JS，零 Phaser。 |
| `src/ui/` | 視覺與互動：手牌佈局、卡牌 sprite、動畫、拖曳箭頭、**肩後視角敵陣**、debug 面板。 |
| `src/scenes/` | Phaser 場景：`RunMapScene`（白天樞紐）⇄ `BattleScene`（單場戰鬥）⇄ `GameOverScene`（據點佔位）。 |
| `src/config/` | `tuning.js` — 所有數值。**調手感只該動這裡。** |
| `test/` | vitest 單元測試，鏡像 `src/` 結構（`test/core/`、`test/ui/`）。 |

---

## 三、檔案速查表

### core（邏輯，零 Phaser）

| 檔案 | 責任 | 動它的時機 |
|------|------|-----------|
| `core/CardLibrary.js` | 卡牌**定義**（名字、type、cost、base、境界/連段成長）。牌型：`ATTACK`/`DEFENSE`/`SKILL`（內力/抽牌等功能）/`CATALYST`。`GROWTH` 放常見境界曲線（linear/step），忘形催化劑也在這。 | 新增卡、改數值、改成長曲線、加功能牌/催化劑。 |
| `core/Card.js` | 卡牌**實例**：`createCard`（只為催化劑旗標查牌表，defId 不必在牌表裡 —— 驗證留給渲染層；`enchants` 只放外加附魔的 level）、`mergeCards`（合成產物：**主體境界 +1**、tag 聯集、**附魔匯總受上限隨機篩** `combineEnchantsCapped`）、`cardEnchants`、忘形 Tag、`isRealmless`、`displayName`。 | 改合成怎麼產出新卡、附魔累加/上限規則、realmless 行為、卡名顯示。 |
| `core/Effect.js` | 把「定義＋境界＋連段」解算成實際傷害/護甲；卡面顯示數值。 | 改預設成長公式、改總傷計算、改卡面顯示的數字。 |
| `core/MergeEngine.js` | **合成引擎**：同名自動合成（`resolveAutoMerges`）、忘形合成（`applyFormlessMerge`）、補抽機率（`drawChanceFor`）。產出劇本。 | 改合成規則、配對邏輯、補抽觸發、連鎖解算。 |
| `core/ComboTracker.js` | 境界連段：出牌時累積 step、算倍率、`peek` 預覽。 | 改連段累積規則、中斷條件、倍率。 |
| `core/RunState.js` | **一局江湖遠征的狀態機**（零 Phaser，run-meta 之上、BattleState 之下）：牌組跨戰保存、銀兩、主角血量、日程與事件池、尾王節奏（`dayBossKind`）、拖延加成（`battleConfig`）、速通拉霸代幣、`takeNode`/`callBoss`/`finishBattle`/`advanceDay`；牌組編輯 `addDeckCard`/`removeDeckCard`/`enchantDeckCard`（商店/拉霸/事件共用）。`STARTING_DECK` 在這。 | 改 run 流程、每日事件池、尾王節奏/縮放、戰後結算、起始牌組、牌組增刪附魔。 |
| `core/slot.js` | **三輪連線拉霸**（零 Phaser）：`spinReels`/`resolveSlotReward`（三連大獎：金/葫→銀兩、劍→加攻擊牌、毒/火→牌組附魔、囧→槓龜；兩連/全不同→小銀兩）/`spinSlot`/`applySlotReward`。速通代幣消化，數值在 `tuning.run.slot`。 | 改拉霸符號權重、賠付、獎池、附魔目標。 |
| `core/RelicLibrary.js` | **遺物·秘籍**定義（一局內被動加成）：`onAcquire(run)`（拿到即生效，如 +血量上限）、`battleMods`（每場疊 energy/handSize…）、`hooks`（`onBattleStart`/`onTurnStart`，收 battle 本體）。來源：魔王打贏＋客棧。持有存 `RunState.relics`（只存 id）。 | 新增/改遺物、加新的 hook 時機。 |
| `core/EventLibrary.js` | **奇遇·江湖事件**定義（白天池 'event' 節點內容）：每個事件一段敘事 ＋ 選項，選項 `resolve(run, rng)` 就地改 run、回 `{ text }`（立即）或 `{ text, battle, battleKind }`（觸發戰鬥）。文案在這、數值在 `tuning.run.event`。首批：野菇/賭坊/仇家堵路/荒廟寶箱/雲遊郎中。 | 新增/改奇遇、選項、結果。 |
| `core/BattleState.js` | **戰鬥狀態機**：回合、能量、主角血量、`start`/`startTurn`/`endTurn`、`enemyPhase`、`playCard`、debug 操作。也是 MergeEngine 的 ctx。**有限戰鬥**：`battle` 配置（hp/maxHp/waves/rows/eliteChance…，由 RunState 注入）、`wavesLeft`、`checkOutcome` 發 `BATTLE_WON`/`BATTLE_LOST`；省略配置＝無限補充波（舊沙盒）。**割草手感**：`maybeRushNextWave` —— 出牌清空整片且還有補充波時，下一波當下湧上（不必等回合結束）。 | 改回合流程、出牌結算、抽牌時機、能量、主角血量、敵人相位、勝負判定、清場補波。 |
| `core/EnemyLibrary.js` | 敵人**定義**（hp、攻擊力、顏色）。 | 新增敵種、改敵人數值。 |
| `core/Formation.js` | **敵陣**：`lanes`×`maxRank` 格狀，敵人各佔一格 (rank,lane)。`advance`（前進補位：卡住會**側移**到隔壁路）、`refill`、`knockback`（擊退連鎖推擠＋塞滿時側擠）、`prepareFront`（攻擊準備）、縱列/近排查詢（`laneEnemies`/`nearestRanks`/`pickBlast`）。敵人帶 `prepared`（telegraph）與 `statuses`。 | 改敵人移動/補位、擊退、備戰、鎖定查詢。 |
| `core/combat.js` | **招式鎖定**：`TARGET`（SINGLE / **LANE 貫** / ROW / **NEAR_ROWS 毒霧近數排** / **BLAST 火藥 3×3** / SCATTER 暗器 / MULTI / RANDOM）與 `resolveAttack`。 | 改招式怎麼選敵人、新增鎖定方式。 |
| `core/StatusLibrary.js` | 敵人 **debuff**（燃燒/中毒/破甲/麻痺）：定義、`applyStatus`、`activeStatuses`、`resolveStatusTick`。**中毒/燃燒已有效果**（見「§四·八 異常狀態」），破甲/麻痺仍是 placeholder。 | 調 DoT 數值（去 `tuning.combat.status`）、加新狀態、設計破甲/麻痺效果。 |
| `core/Deck.js` | 牌庫與棄牌堆：抽牌、洗牌、棄牌堆循環。不認識合成。 | 改抽牌/洗牌/牌庫耗盡行為。 |
| `core/Hand.js` | 手牌資料結構（core 側）。順序有意義（最左配對優先）。 | 改手牌的增刪/查找 API。 |
| `core/rng.js` | 可注入亂數：`seededRng`（測試重現）、`shuffleInPlace`。 | 改洗牌演算法、測試需要固定種子。 |
| `core/events.js` | `EVENT.*` 事件名 ＋ 極簡 `EventBus`。core→UI 的橋。 | 新增一種 core 通知 UI 的事件。 |
| `core/transcript.js` | `TX.*` 劇本事件字彙（DRAW / MERGE / DISCARD…）。 | 新增一種需要演出的劇本事件。 |

### ui（視覺與互動，認識 Phaser）

| 檔案 | 責任 | 動它的時機 |
|------|------|-----------|
| `ui/MergeAnimator.js` | **劇本播放器**：把 transcript 逐格 tween 成動畫，播放期間鎖輸入。內含抽牌/合成/棄牌各自的演出、連鎖佇列、`reset()`。 | 改任何「合成/抽牌/棄牌怎麼演」、連鎖節奏、演出打斷邏輯。 |
| `ui/HandView.js` | 手牌的**視覺狀態管理**：哪些 sprite 存在、`relayout`（tween 到目標位）、`syncTo`（對齊 core 權威狀態的安全網）。`order` 鏡像 core 的手牌順序。 | 改 sprite 增刪、重新佈局、hover 焦點、與 core 對齊。 |
| `ui/HandLayout.js` | **純函式**扇形佈局：給定張數算出每張的 x/y/旋轉/縮放/depth。零 Phaser，可測。 | 改扇形形狀、重疊壓縮、hover 抬升/讓位。 |
| `ui/CardSprite.js` | 單張牌的視覺：名字、境界徽章、cost、傷害/護甲文字、忘形高亮。 | 改卡面上任何元素的**位置/樣式/內容**。 |
| `ui/cardTextures.js` | 把卡面底圖預先烘成貼圖（穩定、省效能）。 | 改卡牌底圖的形狀/邊框/圓角。 |
| `ui/format.js` | 境界中文標籤（一〜十）、卡牌顏色常數、忘形色。 | 改配色、境界標籤文字規則。 |
| `ui/tweens.js` | tween 的 Promise 封裝：`tweenTo`、`stopTweensOf`。**見下方「陷阱」。** | 幾乎不用動；新增動畫時用它，別自己刻 `new Promise`。 |
| `ui/DragController.js` | 拖曳與箭頭：唯一手勢是「從牌拉箭頭」，**落點決定行為**（越過戰場線＝出牌、落在別張牌＝忘形合成）。 | 改拖曳手勢、箭頭外觀、出牌 vs 合成的判定。 |
| `ui/DebugPanel.js` | 原生 DOM 疊在 canvas 上的沙盒工具（塞牌、抽牌、結束回合、重開、速度、即時數據）。 | 改 debug 工具的按鈕/顯示。 |
| `ui/DeckOverlay.js` | **檢視本局牌組的模態浮層**（高 depth 同場景物件，非切場景，戰鬥中也能開）。用 CardSprite 縮小排格。`mode:'view'`（只看）或 `'select'`（點一張→高亮→按確定才生效，避免誤觸即刪，`onConfirm(index)` 回呼）。 | 改牌組檢視/選牌介面、確認流程。 |
| `ui/FormationView.js` | **敵陣的視覺層**：把 Formation 投影成肩後視角的一群 sprite。`sync`（前進時全量對齊）、`flashAndPop`（攻擊命中的閃光/傷害數字/倒地）。 | 改敵人怎麼演出被打、前進、死亡。 |
| `ui/EnemySprite.js` | 單個敵人的視覺：剪影（腳底 origin）＋ 頭上血條。 | 改敵人長相、血條。 |
| `ui/perspective.js` | **肩後投影**純函式：`project(dist, col, nCols)` → 螢幕 `{x,y,scale}`；`depthFor` 讓前排壓後排。 | 調透視（近大遠小、收攏、地平線）。參數在 `tuning.combat.view`。 |
| `ui/enemyTextures.js` | 烘敵人白色剪影（tint 上色）與主角肩後背影貼圖。 | 改敵人/主角剪影形狀。 |
| `ui/Dummy.js` | （已停用）里程碑 1 的木樁。敵陣上線後不再掛進場景。 | 可刪。 |

### scenes / config / entry

| 檔案 | 責任 | 動它的時機 |
|------|------|-----------|
| `scenes/RunMapScene.js` | **白天樞紐**：讀 RunState 畫出當天事件池（5×2 可點節點）＋ run HUD（天/血/銀兩/代幣）＋「入夜決戰」。點節點 → `takeNode`（開戰或立即結算）；入夜 → `callBoss`。 | 改地圖版面、節點外觀、入夜按鈕、run HUD。 |
| `scenes/BattleScene.js` | **單場戰鬥總指揮**：由 `scene.start('Battle',{run,config})` 進來，用 `run.deck`＋config 建 BattleState；接事件、協調演出、**抽牌批次化**、勝負判定後 `run.finishBattle` 並轉場（尾王贏且有代幣 → 先進 Slot）。 | 改戰鬥場景接線、抽牌批次、勝負轉場、背景與提示文字。 |
| `scenes/ShopScene.js` | **客棧**：白天池 'inn' 節點進來，買招式（3 貨架）／歇息回血／刪去一招（點牌組選單）／拉霸。交易全走 `RunState`（`buyShopCard`/`restAtInn`/`buyRemoveCard`）。 | 改客棧版面、貨架、服務按鈕、刪牌選單。 |
| `scenes/SlotScene.js` | **拉霸機**：花速通代幣拉三輪，演轉輪→`applySlotReward`。入夜打贏尾王（有代幣）自動進來、客棧也可進（帶 `back` 回客棧），離開回 RunMap。邏輯全在 `core/slot.js`。 | 改轉輪演出、按鈕、賠率小抄。 |
| `scenes/EventScene.js` | **奇遇**：白天池 'event' 節點進來，演敘事＋選項按鈕（`RunState.resolveEventChoice`）。立即結果 → 顯示文字＋繼續回 RunMap；觸發戰鬥 → 進 Battle。內容在 `core/EventLibrary.js`。 | 改奇遇版面、選項/結果呈現。 |
| `scenes/GameOverScene.js` | 一局結束（通關/敗北）的**據點佔位**：顯示戰績、一鍵再闖（`new RunState`）。 | 改結束畫面；之後長成真正的據點/門派經營。 |
| `config/tuning.js` | 所有數值：能量、起手張數、補抽機率、境界上限、連段倍率、動畫節奏、扇形佈局、抽牌窗口、**`run`（日程/尾王節奏/拖延加成/各類戰鬥波數與獎勵）**。 | **任何平衡/手感數字。禁止把數字散落到別處。** |
| `index.js` | 進入點：註冊 `[RunMapScene, BattleScene, GameOverScene]`，開機進 RunMap。 | 改畫布、註冊新場景、開機場景。 |
| `index.js` | Phaser 遊戲進入點（畫布尺寸、縮放、掛載場景）。 | 改畫布大小、註冊新場景。 |

---

## 四、「我想改 X，去哪裡」對照表

| 我想…… | 去這裡 |
|--------|--------|
| 新增一張卡 / 改卡的數值、cost、名字 | `core/CardLibrary.js` |
| 改某張卡「境界↑ / 連段↑ 時怎麼變強」 | `core/CardLibrary.js`（該卡的 `realmScale`/`comboScale`；常見曲線見 `GROWTH`），預設公式在 `core/Effect.js` |
| 改**傷害/護甲**境界成長曲線 | `config/tuning.js`（`realmDamageCurve`），套用點 `core/Effect.js`（`realmMultiplier`） |
| 新增功能牌（內力、抽牌…），且境界要走溫和曲線 | `core/CardLibrary.js`（`type: SKILL` ＋ `base: { energy/draw }` ＋ `realmScale: GROWTH.linear/step`）；套用在 `core/BattleState.js` 的 `playCard` |
| 改合成規則（同名自動合成、同境界限制、忘形合成、連鎖） | `core/MergeEngine.js`（見上「四·五、合成規則」） |
| 改附魔累加規則、忘形保留、realmless、合成產物 | `core/Card.js`（`mergeCards` / `mergeEnchants` / `isRealmless`） |
| 新增/改忘形催化劑或其他無數值卡 | `core/CardLibrary.js`（`catalyst: true`） |
| 改補抽機率、遞減曲線 | `config/tuning.js`（`mergeDraw`）＋ `core/MergeEngine.js`（`drawChanceFor`） |
| 改連段怎麼累積、倍率 | `core/ComboTracker.js` ＋ `config/tuning.js`（`comboMultiplier`） |
| 改中毒/燃燒的傷害、衰減、疊層速度 | `config/tuning.js`（`combat.status`）＋ `core/StatusLibrary.js`（`resolveStatusTick`） |
| 新增一張「純上狀態」的卡（如毒霧/火藥） | `core/CardLibrary.js`（加 `effectStatus: { id, stacks }`、`base` 不放 damage），套用在 `core/BattleState.js.playCard` |
| 改附魔強度（層數＝傷 × scale × level） | `core/CardLibrary.js`（各卡 `enchantScale`）＋ `config/tuning.js`（`combat.enchantScaleDefault`）＋ 套用在 `core/BattleState.js.playCard` |
| 改附魔在卡面怎麼顯示（彩色小點） | `ui/CardSprite.js`（`refreshEnchants`） |
| 改能量、起手張數、境界上限 | `config/tuning.js` |
| 改回合流程、出牌結算、抽牌時機 | `core/BattleState.js` |
| 改「合成/抽牌/棄牌怎麼演」、連鎖越合越快 | `ui/MergeAnimator.js` ＋ `config/tuning.js`（`anim`） |
| 改扇形手牌的形狀、重疊、hover 效果 | `ui/HandLayout.js` ＋ `config/tuning.js`（`hand`） |
| 改卡面上某個元素的位置/樣式（如境界徽章） | `ui/CardSprite.js` |
| 改卡牌底圖、邊框、配色 | `ui/cardTextures.js` ＋ `ui/format.js` |
| 改拖曳手勢、箭頭、出牌 vs 合成判定 | `ui/DragController.js` |
| 改連點抽牌的批次行為 | `scenes/BattleScene.js`（`requestDraw`/`pumpDraws`）＋ `config/tuning.js`（`drawBatchWindow`） |
| 改 run 流程（每日事件池、尾王節奏、拖延加成、戰後結算） | `core/RunState.js` ＋ `config/tuning.js`（`run`） |
| 新增/改遺物·秘籍 | `core/RelicLibrary.js`（`battleMods`/`hooks`/`onAcquire`）；戰鬥掛鉤在 `core/BattleState.js`（`runRelicHook`/`relicMod`） |
| 改戰鬥的勝負條件、敵潮規模/波數 | `core/BattleState.js`（`checkOutcome`/`wavesLeft`）＋ `core/RunState.js`（`battleConfig`）＋ `config/tuning.js`（`run.battle`） |
| 改白天地圖版面、節點、入夜按鈕 | `scenes/RunMapScene.js` |
| 改傷害數字/連段的飄字演出 | `ui/Dummy.js` |
| 改 debug 面板 | `ui/DebugPanel.js` |
| 動畫卡住、tween 沒收尾 | `ui/tweens.js`（見下方陷阱） |

---

## 四·五、合成規則（改平衡前先讀懂）

現行合成是**同階才能併**（類似 2048）：

- **境界軸**：兩張要**同境界**才能合成（劈一＋劈一→劈二，但劈二＋劈一**不**合成）。
- **合成結果境界只 +1**（不是相加）：兩張境界 N → 一張境界 N+1。
- **境界上限**（`tuning.maxRealm`，預設 5）：**擋下合成**而非合成後夾住 —— 到頂的牌不再併（兩張境界五不合成，忘形也吃不動境界五）。判定在 `MergeEngine.atRealmCap`。
- **數值隨境界成長，但曲線逐卡可換**：傷害/護甲**預設**吃 `tuning.realmDamageCurve`（索引＝境界−1，預設 `[1, 1.5, 2.5, 4, 6]`＝100/150/250/400/600%，高境界回報遞增；帶小數故每發**取整**）。功能牌（內力、抽牌）刻意走**線性**（`GROWTH.linear`/`step`），否則境界一升就強度爆炸（運氣調息境界三只 +3、臨機應變境界三只抽 4）。
- **名字軸**：正常只能**同名**合成。

兩種卡：

| 卡種 | 是什麼 | 合成行為 |
|------|--------|---------|
| 普通卡 | 具體 defId ＋ 境界 | 只跟「同名同境界」的卡自動合成，結果境界 +1。 |
| 忘形催化劑（`wangXing`） | 獨立卡，**不帶境界**（realmless）、無戰鬥數值、不能出牌 | 拖到**任一張**牌上（同名/跨名皆可），讓那張牌**境界 +1**，並把**忘形附魔印進**那張牌（見下「附魔」）。不改名、不參與自動合成。 |

- **自動合成**（`resolveAutoMerges` / `findFirstAutoMergePair`）：同 defId ＋ 同 realm，realmless 排除。結果 realm ＝ **主體境界 +1**。
- **玩家拖曳合成**（`applyFormlessMerge`）：`canFormlessMerge` 判定，`pickBodyMaterial` 分主體/材料。
- **忘形＝跨境界催化劑**（`MergeEngine.isCatalyst` ＝ realmless 或帶忘形 tag）：帶忘形的具體卡當材料時
  **無視境界差、跨名**、把對方 **+1**、自己被消耗、附魔倒進對方（例：境界四忘形卡拖到境界一 → 境界二）。
  主體境界基準取「非催化劑那張」，材料的境界不算數。忘形 tag 取聯集**一律保留**（不佔上限、可持續跨名）。

### 「卡片自身效果」 vs 「附魔」（兩回事，別混）

- **卡片自身狀態效果**：卡定義的 `effectStatus: { id, stacks }`（毒霧的毒、火藥的火）。定額、綁 defId、
  **不進 enchants、不佔上限、不隨合成轉移**。這兩張已**移除直接傷害**（`base` 無 `damage`），純上狀態。
- **附魔（enchants）**：**外加**的魔（拉霸/商店/事件/合成而來），實例層資料 `card.enchants = { 狀態id: level }`。
  存的是 **level**（不是層數）；合成時匯總兩張、受**上限** `tuning.enchantCap(realm)`＝2^(境界−1) 約束，
  超過就展開成單位隨機篩到上限（`Card.combineEnchantsCapped`，吃 rng）。level-2 ＝ 2 個單位，算兩格。

**附魔實際上幾層是出牌時「按傷害動態算」**（`BattleState.playCard`）：

```
層數 = round( 卡每發「基礎傷」 × def.enchantScale × level )
```

實際層數由 `BattleState.enchantStacks(def, realm, statusId, level)` 算，三條路（由專到泛）：
1. 卡自訂 `def.enchantStacks(id, level, ctx)` —— 完全客製。
2. 附魔與卡自身 `effectStatus` **同種**（如毒霧的毒附魔）：**放大自身效果** ＝ `effectStatus.stacks × level`
   （疊在 effectStatus 定額之上：level1 ⇒ 共 2 倍、level2 ⇒ 3 倍…），解決「無傷害卡裝不了附魔」。
3. 一般傷害卡：`round(每發基礎傷 × enchantScale × level)`。基礎傷 ＝ `resolveEffect(def, realm, 1).damage`，
   吃**境界**、不吃連段/暫時 buff。`enchantScale` 每卡自訂（貫 0.15 > 橫劈 0.08；單體未來約 0.2），沒寫走 `tuning.combat.enchantScaleDefault`。

卡面左緣彩色小點（`CardSprite.refreshEnchants`）顯示附魔的顏色與 level。

---

## 四·六、割草戰鬥（里程碑 2）

敵人一排排肩後湧上，玩家出招砍殺，回合結束敵人前進一步、接觸主角就攻擊。

- **敵陣**（`Formation`）：`rows[0]` 最前排；每排有 `dist`（到主角步數，0 = 接觸）。
  `advance()` 整體前進一步並維持排距；`refill()` 從最後方補排到維持排數（`tuning.combat.rows`）。
- **敵陣是格狀**：`lanes`（7）×`maxRank`（6），敵人各佔一格 (rank, lane)。rank 0 = 接觸。
- **移動不排隊**（`advance`）：每回合前進一格；正前方被卡住時**側移**到隔壁一路的前方補位，差超過一路就卡住。
- **攻擊準備**（telegraph）：敵人剛到最前排先 `prepared`（頭上紅色！＋轉紅熱），**下回合**才攻擊。
- **擊退**（`knockback`）：往後推、連鎖推擠後方；整路塞滿到 `maxRank` 時最後一個往左右擠，無空間則推不動。
- **招式鎖定**（`combat.TARGET`，卡的 `target`）：
  - `ROW`（橫劈 / 崩山）：只打**最近那一排**（rank 最小那排的所有人），不是每路的最前。崩山另帶 `knockback`。
  - `LANE`（貫）：打最近一路（同近時挑**人最多**的縱列，再同才隨機），整條縱列由前貫到後。
  - `NEAR_ROWS`（毒霧）：打**最近的 N 排**（`area.rows`，跳過空排取最近幾個有人的 rank）的全部。
  - `BLAST`（火藥）：一個 `area.size`×`area.size` 方塊，**必含至少一個最近排敵人**、在此前提下涵蓋最多人
    （`Formation.pickBlast`；由最近排往後延伸，lane 滑動取最多）。**預留之後開放玩家指定中心**。
  - `SCATTER`（暗器）：每根隨機釘最前排一人。
  - `SINGLE` / `MULTI` / `RANDOM`：已實作，暫無卡用。
  - **連段＝次數**：`effect.hits` 隨連段變多，ROW/LANE 就**重打幾波**（劈砍兩次、貫兩次…），
    每波**重新選一次目標**、各標 `wave` 給 UI 分波演出；崩山的擊退也**逐波**施加。詳見下「§連段」。
- **目前牌組**：攻擊 = 橫劈（整列）、貫（縱列）、崩山（整列＋擊退）、暗器（散射）、
  毒霧（近三排上中毒）、火藥（3×3 上燃燒）；技能 = 運氣調息（內力）、臨機應變（抽牌）；忘形（催化劑）。
  防禦（護甲）機制還在，暫無卡產生護甲。
- **上狀態的卡**：`playCard` 對命中且存活的敵人上狀態，兩條來源（見「§四·五」）——
  (1) 卡自身 `effectStatus`（毒霧/火藥，定額）；(2) 卡的 `enchants` 附魔（層數＝基礎傷 × `enchantScale` × level，動態）。
  連段多波打同一人只上一次。範圍卡另帶 `rows`（NEAR_ROWS）或 `blast`（BLAST 邊長），
  由 playCard 以 `{ rows, size }` 傳進 `resolveAttack`。（毒霧/火藥**無直接傷害**，`combat.js` 的 strike 已把 undefined 傷害當 0。）
- **debuff（`StatusLibrary`）**：中毒/燃燒**已有實際效果**（見「§四·八」）；破甲/麻痺仍是 placeholder
  （能施加、能顯示小點，但無 tick 效果）。
- **回合流程**（場景 `endTurnFlow` 串接）：玩家出招（`playCard` → `resolveAttack` 打進敵陣）
  → 按結束回合 → `battle.enemyPhase()`（前進 → 接觸攻擊主角、護甲先擋 → 補排）
  → 再跑手牌 `endTurn()`（棄牌 + 新回合抽牌/合成）。
- **主角血量/護甲**：`playerHp`；護甲（`armor`）是「格擋」，每回合 `startTurn` 重置，敵人攻擊時先扣護甲再扣血。
- **視覺**：core 只出狀態與事件（`ENEMIES_HIT`/`ENEMIES_ADVANCED`/`PLAYER_HIT`），
  `FormationView` 用 `perspective.project()` 投影成肩後視角。core 零 Phaser 的分層照舊。

---

## 四·七、連段怎麼加成（改卡前先讀懂）

依境界數字由小到大遞增出牌就累積連段（`ComboTracker`，step 從 1 起）。連段對效果的加成**分兩類**：

- **攻擊牌 ＝ 加「次數」**（不是加每發傷害）。`comboScale` 預設把 `effect.hits` 乘上 step：
  - 暗器：3 → 6 → 9 發（散射多釘幾人）。
  - 劈砍 / 貫 / 崩山：1 → 2 → 3 **波**，每波在 `combat.js` **重新選一次目標**再打
    （劈砍重選最近排、貫重選最人多的一路），所以動畫也會**演多次**（劈砍兩次）。
  - 崩山的**擊退**也逐波施加（`resolveAttack` 收 `knockback`，打完一波推一波）。
  - 每發標 `wave`，`FormationView` 依 wave 分波錯開劈痕與傷害數字。
- **功能牌 ＝ 加法 `+（step−1）`**（不是乘）。抽牌 / 內力用 `CardLibrary` 的 `comboAdd`：
  第一張不加、第二張 +1、第三張 +2……。例：臨機應變境界三抽 4，在連段第三張出 ⇒ 抽 6。

`comboScale(effect, multiplier)` 的 `multiplier` ＝ `comboMultiplier(step)` ＝ step（見 `tuning`），
攻擊牌拿它當乘數、功能牌拿它當 `step` 做加法。攻擊牌大多不必寫 `comboScale`，走 `Effect.js` 的預設（乘 hits）。

---

## 四·八、異常狀態（DoT，改數值前先讀懂）

中毒/燃燒是 DoT，靠**兩種節拍的 tick** 發作（不走 transcript —— 敵陣本來就是即時結算＋發事件）：

- **出牌小 tick**：每成功出一張牌（`playCard` 尾端呼叫 `statusTick('play')`）＝ 流逝一格時間。
- **回合結束大 tick**：`endTurnFlow` 在敵人前進**之前**呼叫 `statusTurnEnd()`，讓 DoT 先收割。

兩種狀態的性格（數值都在 `tuning.combat.status`，邏輯在 `StatusLibrary.resolveStatusTick`）：

| | 中毒（即時流血、比例衰減） | 燃燒（蓄力引爆）|
|---|---|---|
| 每個 tick | 滴 `N × damagePerStack` 傷，**造成傷害後衰減 `decayRate` 比例層（最少 1）** | （出牌）火自己 +`growthRate` 比例層（最少 1，**不掉血**）|
| 出牌小 tick | 就是 1 個 tick（滴＋衰） | 疊層（見上）|
| 回合結束大 tick | 連跑 `turnEndTicks`（3）個 tick，**先算好總傷與最終層數，畫面只跳一次數字**（免太亂）| 依層數引爆（每層 `detonateDamage`）後**快衰**（只留 `decayKeep` 比例）|
| 手感 | 當下就痛、比例衰減黏一陣 | 蓄力、回合結束轟一下、得一直搧風 |

- **比例衰減＝軟上限**：層數收斂，不會無限爆炸，**不需要硬上限**。毒每 tick 都衰（含出牌）。
- **掛機殺不死**：tick 只在出牌／回合結束跳，中途放著＝ 0 跳；且每留一回合都得吃一次敵人相位。
- **結算順序**：同體先中毒後燃燒 —— 毒把敵人滴死，燃燒就不再引爆（`resolveStatusTick` 有 `e.alive` 護欄）。
- **UI**：`resolveStatusTick` 回傳 `{ hits, changed }`，core 發 `EVENT.STATUS_TICKED`，
  `FormationView.playStatusTick` 依狀態色跳傷害數字/倒地（`hits`）、只變層數的刷狀態點（`changed`）。
  敵人頭上的狀態點（`EnemySprite`）層數 > 1 會疊上數字。

---

## 四·九、正式流程 / 一局江湖遠征（里程碑 3，Phase 1 已上線）

在戰鬥之上加一層 `RunState`，戰鬥仍是同一個 `BattleState`。分層：

```
   RunMapScene（白天樞紐）
        │ takeNode / callBoss → { config }
        ▼
   BattleScene ── new BattleState({ deckList: run.deck, battle: config })
        │ 打完 BATTLE_WON / BATTLE_LOST
        ▼
   run.finishBattle(battle) → 血量寫回、給獎、推進日程 or 結束
        │
        ├─ 續跑 → 回 RunMapScene（下一節點 / 隔天）
        └─ runOver → GameOverScene（通關 / 敗北）
```

- **一天 = 一池事件**（`run.dayPool`，`tuning.run.eventsPerDay` 個）：玩家自由挑做。
  `event` 型是**有分支選項的奇遇**（`EventScene`＋`EventLibrary`，選項可能加錢/附魔/回血/加牌/賭一把/開打）；
  `battle`/`elite` 型開一場戰鬥；`inn` 型進客棧（買招/歇息/刪牌/拉霸/買遺物）。
  每種都算一次「當天事件」（計入拖延）。做越多越強，但……
- **入夜召尾王**（`callBoss`）：尾王類別由 `dayBossKind` 決定 —— 平日 `elite`（小王）、
  每 `bossEveryDays` 天 `boss`（魔王）、第 `finalDay` 天 `final`（最終大魔王）。
- **多農的取捨**：尾王吃「當天拖延加成」（`battleConfig` 的 `isBoss` 分支）——
  白天做越多事件，尾王補充波與精英率越高；**提早入夜**（還有沒做完的事件）＝ 拿速通拉霸代幣
  （`slotTokens`）。
- **拉霸**（`core/slot.js` ＋ `SlotScene`）：入夜打贏尾王且有代幣時自動進 `Slot` 拉三輪
  （之後客棧也可拉），花代幣換銀兩/加牌/牌組附魔。期望值刻意弱於乖乖刷滿 —— 速通是挑戰不是捷徑。
- **有限戰鬥**：`BattleState` 吃 `battle` 配置 —— `waves`＝初始敵陣外的補充波；波用盡且清場 ＝ 勝，
  血量歸零 ＝ 負（`checkOutcome` 發事件，`BattleScene.maybeConclude` 轉場）。
- **遺物·秘籍**（`core/RelicLibrary.js`，Phase 3）：一局內被動加成。來源 —— **魔王打贏**（`finishBattle` 的
  `boss` 分支 `grantRandomRelic`）＋**客棧購買**（`buyRelic`）。持有存 `RunState.relics`（id）；戰鬥時由
  `battleConfig.relics` 帶進 `BattleState`，套 `battleMods`（energy/handSize）與 `hooks`（onBattleStart/onTurnStart）。
- **失敗＝硬核**：血量歸零 → run 結束回 GameOver（據點佔位）。跨戰保存的是**牌組/血量/銀兩/遺物**（`RunState`），
  局內境界合成照舊每場重置（見「§五」不變量）。
- **後續階段**：Phase 1–3 已上線（run loop、拉霸、客棧商店、遺物、奇遇事件）—— **Phase 2/3 內容大致完備**。
  剩 Phase 4 主角屬性·境界上限、Phase 5 據點·門派跨 run 經營。數值都在 `tuning.run`。

## 五、關鍵不變量與慣例（改動時別踩）

1. **core 零 Phaser 依賴。** `src/core/` 任何檔案都不准 `import phaser`。它要能在 Node 測試裡跑。
   對外只透過 `EventBus` 發事件、或回傳 transcript。

2. **卡牌實例視為不可變。** 合成永遠產出**新 uid** 的新物件，不就地改寫舊卡
   （見 `Card.js` 的 `mergeCards`）。因此 transcript 裡放卡牌參照是安全的。

3. **邏輯一次算完，UI 只重播。** 別把合成邏輯搬進動畫、也別讓動畫回頭改 core 狀態。
   新的可演出事件：先在 `transcript.js` 加 `TX.*`，core 產生它，再到 `MergeAnimator` 加對應演出。

4. **tween 一定要用 `ui/tweens.js` 的 `tweenTo` / `stopTweensOf`，不要用 Phaser 原生的
   `killTweensOf` 或自刻 `new Promise(onComplete)`。**
   陷阱：Phaser 4 的 `tweens.killTweensOf()` 走 `Tween.destroy()`，會清掉 callbacks 且**不發任何收尾事件**——
   被它砍掉的 tween，正在 `await` 它的演出會**永遠醒不過來**（畫面鎖死）。
   `stopTweensOf` 改用 `tween.stop()`（會發 `onStop`），`tweenTo` 同時掛 `onComplete` 與 `onStop`，
   保證 promise 一定會 settle。

5. **`HandView.order` 鏡像 core `Hand` 的順序**，包含連鎖過程中每個中間狀態。
   演出若中途飄掉，`syncTo()` 會強制對齊 core 的權威狀態——它是最後的安全網，畫面永不該與 core 不一致。

6. **手牌順序有意義。** 合成採「最左配對優先」，結果卡落在較左的位置。index 不是裝飾。

7. **演出打斷 vs 排隊：**`MergeAnimator` 的多份劇本會**排隊依序播完**，彼此不打斷。
   只有「重開戰鬥」該作廢舊演出，走 `MergeAnimator.reset()`（推進 generation）。
   一般抽牌/合成不推進 generation。

8. **抽牌批次化在「送進 core 之前」。** 連點抽牌先在 `BattleScene` 累積張數，
   短窗口後一次 `debugDraw(n)`——一口氣抽完再解算整條連鎖。
   真正的「抽 N 張」卡效同理：`drawCards(N)` 後 `resolveAutoMerges` 一次，天然就是一份批次劇本。

9. **亂數要可注入。** 需要隨機的地方吃 `rng`（預設 `Math.random`），測試用 `seededRng` 重現。

---

## 六、資料流：一次忘形合成的完整旅程

```
玩家拖箭頭把 A 併到 B
   → DragController.handleDragEnd 判定 mode = MERGE
   → BattleScene.formlessMerge
      → BattleState.formlessMerge
         → MergeEngine.applyFormlessMerge   ← 忘形合成，境界相加
            → 接著 resolveAutoMerges         ← 可能引爆同名同境界連鎖
         → 回傳 transcript（整條連鎖一次算完）
      → runTranscript → MergeAnimator.play（排進佇列）
         → 逐格演出 MERGE/DRAW…，播放期間鎖輸入
         → 播完 syncTo 對齊 core 權威手牌
```

---

## 七、指令

```bash
npm run dev     # webpack dev server，開瀏覽器看沙盒
npm run build   # production build 到 dist/
npm test        # vitest 跑一次（core 邏輯與 HandLayout 有單元測試）
npm run test:watch
```

測試集中在**可純數字驗證**的部分：合成連鎖、連段、效果解算、扇形佈局。
動畫與 Phaser 互動不寫單元測試——那些靠 `npm run dev` 用眼睛驗。
