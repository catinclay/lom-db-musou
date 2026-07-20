# 檔案地圖：目錄與檔案速查表

> 用途：不必重讀整份 code，就能找到「我想改的東西在哪個檔案」。
> 想改具體某件事 → 直接看 [changing-things.md](changing-things.md)；系統機制細節 → [systems/](systems/)。

## 目錄地圖

| 目錄 | 管什麼 |
|------|--------|
| `src/core/` | 遊戲邏輯：卡牌、合成、連段、牌庫、**敵人/割草戰鬥**、戰鬥狀態機。純 JS，零 Phaser。 |
| `src/ui/` | 視覺與互動：手牌佈局、卡牌 sprite、動畫、拖曳箭頭、**肩後視角敵陣**、debug 面板。 |
| `src/scenes/` | Phaser 場景：`BaseScene`（門派據點·開機/局間樞紐）→ `RunMapScene`（白天樞紐）⇄ `BattleScene`（單場戰鬥）⇄ `ShopScene`/`SlotScene`/`EventScene`。 |
| `src/config/` | `tuning.js` — 所有數值。**調手感只該動這裡。** |
| `test/` | vitest 單元測試，鏡像 `src/` 結構（`test/core/`、`test/ui/`）。 |

---

## 檔案速查表

### core（邏輯，零 Phaser）

| 檔案 | 責任 | 動它的時機 |
|------|------|-----------|
| `core/CardLibrary.js` | 卡牌**定義**（名字、type、cost、base、境界/連段成長）。牌型：`ATTACK`/`DEFENSE`/`SKILL`（內力/抽牌等功能）/`CATALYST`。`GROWTH` 放常見境界曲線（linear/step），忘形催化劑也在這。 | 新增卡、改數值、改成長曲線、加功能牌/催化劑。 |
| `core/Card.js` | 卡牌**實例**：`createCard`（只為催化劑旗標查牌表，defId 不必在牌表裡 —— 驗證留給渲染層；`enchants` 只放外加附魔的 level）、`mergeCards`（合成產物：**主體境界 +1**、tag 聯集、**附魔匯總受上限隨機篩** `combineEnchantsCapped`）、`cardEnchants`、忘形 Tag、`isRealmless`、`displayName`。 | 改合成怎麼產出新卡、附魔累加/上限規則、realmless 行為、卡名顯示。 |
| `core/Effect.js` | 把「定義＋境界＋連段」解算成實際傷害/護甲；卡面顯示數值。 | 改預設成長公式、改總傷計算、改卡面顯示的數字。 |
| `core/MergeEngine.js` | **合成引擎**：同名自動合成（`resolveAutoMerges`）、忘形合成（`applyFormlessMerge`）、補抽機率（`drawChanceFor`）。產出劇本。 | 改合成規則、配對邏輯、補抽觸發、連鎖解算。 |
| `core/ComboTracker.js` | 境界連段：出牌時累積 step、算倍率、`peek` 預覽。 | 改連段累積規則、中斷條件、倍率。 |
| `core/RunState.js` | **一局江湖遠征的狀態機**（零 Phaser，run-meta 之上、BattleState 之下）：牌組跨戰保存、銀兩、主角血量、**主角屬性 `attrs`**（maxRealm/energyPerTurn/startingHandSize，可成長）、日程與白天**三選一 offer**（`rollOffer`/`ensureOffer`/`takeOffer`）、尾王節奏（`dayBossKind`）、拖延加成（`battleConfig`）、速通拉霸代幣、遺物、`callBoss`/`finishBattle`/`resolveEventChoice`；牌組編輯 `addDeckCard`/`removeDeckCard`/`enchantDeckCard`。`STARTING_DECK` 在這。 | 改 run 流程、每日事件池、尾王節奏/縮放、戰後結算、起始牌組、主角屬性、牌組增刪附魔。 |
| `core/slot.js` | **三輪連線拉霸**（零 Phaser）：`spinReels`/`resolveSlotReward`（三連大獎：金/葫→銀兩、劍→加攻擊牌、毒/火→牌組附魔、囧→槓龜；兩連/全不同→小銀兩）/`spinSlot`/`applySlotReward`。速通代幣消化，數值在 `tuning.run.slot`。 | 改拉霸符號權重、賠付、獎池、附魔目標。 |
| `core/RelicLibrary.js` | **遺物·秘籍**定義（一局內被動加成）：`onAcquire(run)`（拿到即生效，如 +血量上限）、`battleMods`（每場疊 energy/handSize…）、`hooks`（`onBattleStart`/`onTurnStart`，收 battle 本體）。來源：魔王打贏＋客棧。持有存 `RunState.relics`（只存 id）。 | 新增/改遺物、加新的 hook 時機。 |
| `core/EventLibrary.js` | **奇遇·江湖事件**定義（白天池 'event' 節點內容）：每個事件一段敘事 ＋ 選項，選項 `resolve(run, rng)` 就地改 run、回 `{ text }`（立即）或 `{ text, battle, battleKind }`（觸發戰鬥）。文案在這、數值在 `tuning.run.event`。首批：野菇/賭坊/仇家堵路/荒廟寶箱/雲遊郎中/高人指點。 | 新增/改奇遇、選項、結果。 |
| `core/MetaState.js` | **跨 run 門派據點**（Phase 5，rogue-lite meta）：威望（prestige）＋永久升級表（`META_UPGRADES`：底子/內力/家底/絕學/傳家寶）、`earnFromRun`/`buyUpgrade`/`applyToRun`/`toJSON`。純資料零瀏覽器；持久化在 `ui/metaStore.js`。`RunState({ meta })` 建構時 `applyToRun` 疊起始加成。 | 新增/改據點升級、威望公式（`tuning.run.meta`）。 |
| `core/BattleState.js` | **戰鬥狀態機**：回合、能量、主角血量、`start`/`startTurn`/`endTurn`、`enemyPhase`、`playCard`、debug 操作。也是 MergeEngine 的 ctx。**有限戰鬥**：`battle` 配置（hp/maxHp/waves/rows/eliteChance…，由 RunState 注入）、`wavesLeft`、`checkOutcome` 發 `BATTLE_WON`/`BATTLE_LOST`；省略配置＝無限補充波（舊沙盒）。**割草手感**：`maybeRushNextWave` —— 出牌清空整片且還有補充波時，下一波當下湧上（不必等回合結束）。 | 改回合流程、出牌結算、抽牌時機、能量、主角血量、敵人相位、勝負判定、清場補波。 |
| `core/EnemyLibrary.js` | 敵人**定義**（hp、攻擊力、顏色）。 | 新增敵種、改敵人數值。 |
| `core/Formation.js` | **敵陣**：`lanes`×`maxRank` 格狀，敵人各佔一格 (rank,lane)。`advance`（前進補位：卡住會**側移**到隔壁路）、`refill`、`knockback`（擊退連鎖推擠＋塞滿時側擠）、`prepareFront`（攻擊準備）、縱列/近排查詢（`laneEnemies`/`nearestRanks`/`pickBlast`）。敵人帶 `prepared`（telegraph）與 `statuses`。 | 改敵人移動/補位、擊退、備戰、鎖定查詢。 |
| `core/combat.js` | **招式鎖定**：`TARGET`（SINGLE / **LANE 貫** / ROW / **NEAR_ROWS 毒霧近數排** / **BLAST 火藥 3×3** / SCATTER 暗器 / MULTI / RANDOM）與 `resolveAttack`。 | 改招式怎麼選敵人、新增鎖定方式。 |
| `core/StatusLibrary.js` | 敵人 **debuff**（燃燒/中毒/破甲/麻痺）：定義、`applyStatus`、`activeStatuses`、`resolveStatusTick`。**中毒/燃燒已有效果**（見 [systems/status.md](systems/status.md)），破甲/麻痺仍是 placeholder。 | 調 DoT 數值（去 `tuning.combat.status`）、加新狀態、設計破甲/麻痺效果。 |
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
| `ui/tweens.js` | tween 的 Promise 封裝：`tweenTo`、`stopTweensOf`。**見 [conventions.md](conventions.md) 的「陷阱」。** | 幾乎不用動；新增動畫時用它，別自己刻 `new Promise`。 |
| `ui/DragController.js` | 拖曳與箭頭：唯一手勢是「從牌拉箭頭」，**落點決定行為**（越過戰場線＝出牌、落在別張牌＝忘形合成）。 | 改拖曳手勢、箭頭外觀、出牌 vs 合成的判定。 |
| `ui/DebugPanel.js` | 原生 DOM 疊在 canvas 上的沙盒工具（塞牌、抽牌、結束回合、重開、速度、即時數據）。 | 改 debug 工具的按鈕/顯示。 |
| `ui/metaStore.js` | 據點狀態的 **localStorage 持久化**（`loadMeta`/`saveMeta`）—— 只有渲染層碰瀏覽器；`core/MetaState` 保持純資料。讀不到/壞掉回全新 MetaState。 | 改存檔 key、序列化。 |
| `ui/DeckOverlay.js` | **檢視本局牌組的模態浮層**（高 depth 同場景物件，非切場景，戰鬥中也能開）。用 CardSprite 縮小排格。`mode:'view'`（只看）或 `'select'`（點一張→高亮→按確定才生效，避免誤觸即刪，`onConfirm(index)` 回呼）。 | 改牌組檢視/選牌介面、確認流程。 |
| `ui/FormationView.js` | **敵陣的視覺層**：把 Formation 投影成肩後視角的一群 sprite。`sync`（前進時全量對齊）、`flashAndPop`（攻擊命中的閃光/傷害數字/倒地）。 | 改敵人怎麼演出被打、前進、死亡。 |
| `ui/EnemySprite.js` | 單個敵人的視覺：剪影（腳底 origin）＋ 頭上血條。 | 改敵人長相、血條。 |
| `ui/perspective.js` | **肩後投影**純函式：`project(dist, col, nCols)` → 螢幕 `{x,y,scale}`；`depthFor` 讓前排壓後排。 | 調透視（近大遠小、收攏、地平線）。參數在 `tuning.combat.view`。 |
| `ui/enemyTextures.js` | 烘敵人白色剪影（tint 上色）與主角肩後背影貼圖。 | 改敵人/主角剪影形狀。 |
| `ui/Dummy.js` | （已停用）里程碑 1 的木樁。敵陣上線後不再掛進場景。 | 可刪。 |

### scenes / config / entry

| 檔案 | 責任 | 動它的時機 |
|------|------|-----------|
| `scenes/RunMapScene.js` | **白天樞紐**：`ensureOffer` 補一輪「三選一」→ 畫 3 張並排選項卡 ＋ run HUD（天/血/銀兩/代幣/屬性/遺物）＋「入夜決戰」。點卡 → `takeOffer(i)`（開戰/進奇遇/進客棧）；入夜 → `callBoss`。 | 改選項卡外觀、入夜按鈕、run HUD。 |
| `scenes/BattleScene.js` | **單場戰鬥總指揮**：由 `scene.start('Battle',{run,config})` 進來，用 `run.deck`＋config 建 BattleState；接事件、協調演出、**抽牌批次化**、勝負判定後 `run.finishBattle` 並轉場（尾王贏且有代幣 → 先進 Slot）。 | 改戰鬥場景接線、抽牌批次、勝負轉場、背景與提示文字。 |
| `scenes/ShopScene.js` | **客棧**：白天池 'inn' 節點進來，買招式（3 貨架）／歇息回血／刪去一招（點牌組選單）／拉霸。交易全走 `RunState`（`buyShopCard`/`restAtInn`/`buyRemoveCard`）。 | 改客棧版面、貨架、服務按鈕、刪牌選單。 |
| `scenes/SlotScene.js` | **拉霸機**：花速通代幣拉三輪，演轉輪→`applySlotReward`。入夜打贏尾王（有代幣）自動進來、客棧也可進（帶 `back` 回客棧），離開回 RunMap。邏輯全在 `core/slot.js`。 | 改轉輪演出、按鈕、賠率小抄。 |
| `scenes/EventScene.js` | **奇遇**：白天池 'event' 節點進來，演敘事＋選項按鈕（`RunState.resolveEventChoice`）。立即結果 → 顯示文字＋繼續回 RunMap；觸發戰鬥 → 進 Battle。內容在 `core/EventLibrary.js`。 | 改奇遇版面、選項/結果呈現。 |
| `scenes/BaseScene.js` | **門派據點**（開機場景＋一局結束的落點，Phase 5）：帶完局的 run 進來 → `meta.earnFromRun` 賺威望、存檔；花威望買永久升級（`MetaState`）；「闖江湖」→ `new RunState({ meta })` → RunMap。存檔在 `ui/metaStore.js`。 | 改據點版面、升級商店、開局按鈕。 |
| `config/tuning.js` | 所有數值：能量、起手張數、補抽機率、境界上限、連段倍率、動畫節奏、扇形佈局、抽牌窗口、**`run`（日程/尾王節奏/拖延加成/各類戰鬥波數與獎勵）**。 | **任何平衡/手感數字。禁止把數字散落到別處。** |
| `index.js` | Phaser 遊戲進入點：畫布尺寸/縮放、註冊 `[BaseScene, RunMapScene, BattleScene, ShopScene, SlotScene, EventScene]`，**開機進 Base（門派據點）**。 | 改畫布、註冊新場景、開機場景。 |
