# 檔案地圖：目錄與檔案速查表

> 用途：不必重讀整份 code，就能找到「我想改的東西在哪個檔案」。
> 想改具體某件事 → 直接看 [changing-things.md](changing-things.md)；系統機制細節 → [systems/](systems/)。

## 目錄地圖

| 目錄 | 管什麼 |
|------|--------|
| `src/core/` | 遊戲邏輯：卡牌、合成、境界／連擊、牌庫、**敵人/割草戰鬥**、戰鬥狀態機。純 JS，零 Phaser。 |
| `src/ui/` | 視覺與互動：手牌佈局、卡牌 sprite、動畫、拖曳箭頭、**肩後視角敵陣**、debug 面板。 |
| `src/scenes/` | Phaser 場景：`TitleScene`（主題首頁）→ `BaseScene`（七設施據點）⇄ `FacilityScene`（設施內容）；開始挑戰後進 `RunMapScene`（白天樞紐）⇄ `BattleScene`（單場戰鬥）⇄ `ShopScene`/`SlotScene`/`EventScene`。 |
| `src/config/` | `tuning.js` — 所有數值。**調手感只該動這裡。** |
| `test/` | vitest 單元測試，鏡像 `src/` 結構（`test/core/`、`test/ui/`）。 |

---

## 檔案速查表

### core（邏輯，零 Phaser）

| 檔案 | 責任 | 動它的時機 |
|------|------|-----------|
| `core/CardLibrary.js` | 卡牌**定義**（名字、type、cost、base、`rankScale`/`comboScale`）；忘形以 `rankless`/`forgetForm` 定義雙模式，兩種用法都會在本場消耗。 | 新增卡、改數值、改階級／連擊成長或忘形定義。 |
| `core/Card.js` | 卡牌**實例**：`createCard`、`mergeCards`（同名同階結果階級 +1、tag 聯集）、`rankUpCard`（忘形升階），一律產出新 uid。 | 改卡片資料、合成／升階產物、卡名顯示。 |
| `core/Effect.js` | 把「定義＋階級＋連擊」解算成每發與總效果；卡面顯示數值。 | 改 `rankCurve` 套用、預設發數、功能牌公式。 |
| `core/MergeEngine.js` | **合成引擎**：同名同階自動合成、忘形消耗升階（`applyWangxingPump`）、合成靈感與滿格抽牌。忘形升階本身也算一次合成，再接自動合成鏈。產出 transcript。 | 改配對、升階、消耗、靈感補牌與連鎖解算。 |
| `core/ComboTracker.js` | 回合境界門檻＋連擊：`play`、`forgetForm`、`peek`、`reset`；階級小於等於境界時兩者歸零，中斷牌以 ×1 結算。 | 改突破／中斷條件、連擊倍率、忘形重置行為。 |
| `core/GameSession.js` | **整局純 JS 流程控制器**：`dispatch(action)` 統一推進 journey/event/shop/slot/battle/runEnd phase，持有 RunState／BattleState；`snapshot()` 提供 AI 可序列化觀測，並同步回傳 UI 可重播結果。 | 新增遊玩 action、改跨系統流程、建立無頭平衡 bot。 |
| `core/OfferDirector.js` | **時辰三選一編排器**：依內部風險 pattern 組合 offer，保證安穩選項、內容去重與功能多樣；處理近期降權、客棧頻率及有限低血救濟。風險只供 core 使用，不外露 UI。 | 改選項組成、風險池、重複抑制與救濟觸發；機率／門檻在 `tuning.run.offer`。 |
| `core/RunState.js` | 一局江湖遠征狀態：牌組、資源、日程、初始／途中遺物與 `attrs`（maxRank/energyPerTurn/startingHandSize）；牌組只支援增刪。 | 改 run、起始牌組／遺物、主角屬性與戰後結算。 |
| `core/slot.js` | 三輪拉霸：金／葫蘆／毒／火給銀兩，劍給牌，囧槓龜；兩連／全不同給小銀兩。 | 改符號權重、賠付與卡池。 |
| `core/RelicLibrary.js` | **遺物·秘籍**定義（一局內被動加成）：`onAcquire(run)`（拿到即生效，如 +血量上限）、`battleMods`（每場疊 energy/handSize…）、`hooks`（`onBattleStart`/`onTurnStart`，收 battle 本體）。來源：魔王打贏＋江湖商販。持有存 `RunState.relics`（只存 id）。 | 新增/改遺物、加新的 hook 時機。 |
| `core/EventLibrary.js` | **奇遇·江湖事件**定義（白天池 'event' 節點內容）：每個事件一段敘事 ＋ 選項，選項 `resolve(run, rng)` 就地改 run、回 `{ text }`（立即）或 `{ text, battle, battleKind }`（觸發戰鬥）。文案與內部 `offerRisk`/`offerRole` 在這、數值在 `tuning.run.event`；另有只由低血救濟插入的山亭歇腳。 | 新增/改奇遇、選項、結果。 |
| `core/MetaState.js` | **跨 run 門派據點**（Phase 5，rogue-lite meta）：威望（prestige）＋永久升級表（`META_UPGRADES`：底子/內力/家底/絕學/傳家寶）、`earnFromRun`/`buyUpgrade`/`applyToRun`/`toJSON`。純資料零瀏覽器；持久化在 `ui/metaStore.js`。`RunState({ meta })` 建構時 `applyToRun` 疊起始加成。 | 新增/改據點升級、威望公式（`tuning.run.meta`）。 |
| `core/ArchiveLibrary.js` | 據點的**成就／畫廊目錄與解鎖條件**。只讀 `MetaState.stats/levels`，零 Phaser；首批解鎖對應完成首局、首次通關、首次永久升級。 | 新增成就、畫卷或調整其解鎖條件。 |
| `core/BattleState.js` | **戰鬥狀態機**：回合、內力小格、靈感、主角血量、`enemyPhase`、`playCard`、棄牌堆／`exhaustPile` 去向。成功出牌把 `DISCARD` 或 `EXHAUST` 放進 transcript。有限戰鬥另以 `wavesLeft`＋`rowsLeftInWave` 管理補充波與清場叫陣。 | 改回合流程、出牌結算、卡牌去向、抽牌／靈感時機、內力、主角血量、敵人相位、勝負判定、清場補波。 |
| `core/EnemyLibrary.js` | 敵人**定義**（hp、攻擊力、準備時間、初始 buff、特殊行動參數、顏色）與敵人 buff 說明。 | 新增敵種、改敵人數值／行為。 |
| `core/Formation.js` | **敵陣**：`lanes`×`maxRank` 格狀。`advance`（含繞道）、`refill`/`addBackRow`、`knockback`（連鎖推擠＋不動阻擋）、黃色倒數／紅色攻擊準備、特殊意圖、縱列／近排／多波爆炸鎖定。敵人帶 `attackState`、`prepareRemaining`、`intent`、`statuses`、`buffs`。 | 改敵人移動/補位、擊退、備戰、意圖、鎖定查詢。 |
| `core/combat.js` | **招式鎖定與逐波結算**：`TARGET`（SINGLE / LANE / ROW / NEAR_ROWS / BLAST / SCATTER / MULTI / RANDOM）與 `resolveAttack`；回傳每波 hits、擊退位置及火藥 `areas` 給 UI 重播。 | 改招式怎麼選敵人、新增鎖定方式。 |
| `core/StatusLibrary.js` | 敵人 **debuff**（燃燒/中毒/破甲/麻痺）：定義、`applyStatus`、`activeStatuses`、`resolveStatusTick`。**中毒/燃燒已有效果**（見 [systems/status.md](systems/status.md)），破甲/麻痺仍是 placeholder。 | 調 DoT 數值（去 `tuning.combat.status`）、加新狀態、設計破甲/麻痺效果。 |
| `core/Deck.js` | 牌庫與棄牌堆：抽牌、洗牌、棄牌堆循環。不認識合成。 | 改抽牌/洗牌/牌庫耗盡行為。 |
| `core/Hand.js` | 手牌資料結構（core 側）。順序有意義（最左配對優先）。 | 改手牌的增刪/查找 API。 |
| `core/rng.js` | 可注入亂數：`seededRng`（測試重現）、`shuffleInPlace`。 | 改洗牌演算法、測試需要固定種子。 |
| `core/events.js` | `EVENT.*` 事件名 ＋ 極簡 `EventBus`。core→UI 的橋。 | 新增一種 core 通知 UI 的事件。 |
| `core/transcript.js` | `TX.*` 劇本事件字彙（DRAW / MERGE / DISCARD / EXHAUST / RANK_UP…）。 | 新增一種需要演出的劇本事件。 |

### ui（視覺與互動，認識 Phaser）

| 檔案 | 責任 | 動它的時機 |
|------|------|-----------|
| `ui/MergeAnimator.js` | **劇本播放器**：把 transcript 逐格 tween 成動畫，播放期間鎖輸入。內含抽牌、逐點靈感、合成、升階、棄牌飛行、消耗消散，以及連鎖佇列與 `reset()`。 | 改任何卡牌去向／靈感／升階／合成演出、連鎖節奏或演出打斷邏輯。 |
| `ui/HandView.js` | 手牌的**視覺狀態管理**：哪些 sprite 存在、`relayout`（tween 到目標位）、`syncTo`（對齊 core 權威狀態的安全網）。`order` 鏡像 core 的手牌順序。 | 改 sprite 增刪、重新佈局、hover 焦點、與 core 對齊。 |
| `ui/HandLayout.js` | **純函式**扇形佈局：給定張數算出每張的 x/y/旋轉/縮放/depth。零 Phaser，可測。 | 改扇形形狀、重疊壓縮、hover 抬升/讓位。 |
| `ui/CardSprite.js` | 單張牌的視覺：名字、階級、內力大小格費用、效果數字與忘形提示。 | 改卡面上任何元素的**位置/樣式/內容**。 |
| `ui/cardTextures.js` | 把卡面底圖預先烘成貼圖（穩定、省效能）。 | 改卡牌底圖的形狀/邊框/圓角。 |
| `ui/format.js` | 階級中文標籤、卡牌顏色、內力大小格與靈感格格式。 | 改配色、階級標籤或資源符號。 |
| `ui/tweens.js` | tween 的 Promise 封裝：`tweenTo`、`stopTweensOf`。**見 [conventions.md](conventions.md) 的「陷阱」。** | 幾乎不用動；新增動畫時用它，別自己刻 `new Promise`。 |
| `ui/sceneTransitions.js` | **全場景共用轉場**：`transitionTo` 鎖輸入並淡出後切 Scene；`transitionIn` 在目標 Scene 由墨色淡入。時間與顏色由 `tuning.anim.sceneTransition` 控制。 | 改 Scene 切換的淡出淡入節奏、顏色或連點防護。 |
| `ui/sessionNavigation.js` | core `GAME_PHASE` 到 Phaser Scene 名稱的唯一對照；`transitionToSessionPhase` 把同一個 session 帶往呈現下一個 phase 的 Scene。 | 改 phase 使用哪個 Scene 呈現；遊戲規則不可放這裡。 |
| `ui/DragController.js` | 拖曳與箭頭：越過戰場線＝出牌；只有忘形拖到具體牌才進升階模式。 | 改拖曳手勢、箭頭外觀、出牌 vs 忘形升階判定。 |
| `ui/DebugPanel.js` | 原生 DOM 疊在 canvas 上的沙盒工具（塞牌、抽牌、結束回合、重開、速度、即時數據）。 | 改 debug 工具的按鈕/顯示。 |
| `ui/metaStore.js` | 據點狀態的 **localStorage 持久化**（`loadMeta`/`saveMeta`）—— 只有渲染層碰瀏覽器；`core/MetaState` 保持純資料。讀不到/壞掉回全新 MetaState。 | 改存檔 key、序列化。 |
| `ui/menuChrome.js` | 主題首頁與據點設施共用的水墨山景背景、標題與按鈕元件。 | 改主選單／據點的共用視覺。 |
| `ui/DeckOverlay.js` | **檢視本局牌組的模態浮層**（高 depth 同場景物件，非切場景，戰鬥中也能開）。用 CardSprite 縮小排格。`mode:'view'`（只看）或 `'select'`（點一張→高亮→按確定才生效，避免誤觸即刪，`onConfirm(index)` 回呼）。 | 改牌組檢視/選牌介面、確認流程。 |
| `ui/FormationView.js` | **敵陣的視覺層**：Formation 肩後投影、逐波延遲演出、火藥區域、擊退、特殊行動飄字，以及敵人 hover 意圖／狀態 tooltip。 | 改敵人怎麼演出被打、前進、死亡、特殊行動與提示。 |
| `ui/EnemySprite.js` | 單個敵人的視覺：剪影、血條、狀態／buff 點，以及黃色準備、紅色攻擊、紫色特殊行動意圖。 | 改敵人長相、血條、頭頂意圖。 |
| `ui/perspective.js` | **肩後投影**純函式：`project(dist, col, nCols)` → 螢幕 `{x,y,scale}`；`depthFor` 讓前排壓後排。 | 調透視（近大遠小、收攏、地平線）。參數在 `tuning.combat.view`。 |
| `ui/enemyTextures.js` | 烘敵人白色剪影（tint 上色）與主角肩後背影貼圖。 | 改敵人/主角剪影形狀。 |
| `ui/Dummy.js` | （已停用）里程碑 1 的木樁。敵陣上線後不再掛進場景。 | 可刪。 |

### scenes / config / entry

| 檔案 | 責任 | 動它的時機 |
|------|------|-----------|
| `scenes/RunMapScene.js` | **白天樞紐呈現**：畫 GameSession 的天、時辰、三選一與入夜按鈕；點擊只送 `chooseOffer`／`callBoss` action，再依 session phase 轉場。 | 改選項卡外觀、時辰顯示、入夜按鈕、run HUD。 |
| `scenes/BattleScene.js` | **單場戰鬥呈現／劇本播放器**：訂閱 session.battle 事件，將拖曳轉為 action，重播 transcript、命中、敵方相位；不建立 BattleState、不做戰後結算或流程判斷。 | 改戰鬥接線、動畫節奏、背景與提示文字。 |
| `scenes/ShopScene.js` | **白天服務設施共用呈現**：依 session context 顯示客棧／江湖商販／武館／賭坊，各自只開放對應功能；交易一律送 GameSession shop action。 | 改服務設施版面、商販貨架、歇息、刪牌或賭坊入口。 |
| `scenes/SlotScene.js` | **拉霸呈現**：`spinSlot` action 已同步扣代幣與套獎勵，Scene 只用回傳 reels/reward 播轉輪；離開依 session phase 返回客棧或行程。 | 改轉輪演出、按鈕、賠率小抄。 |
| `scenes/EventScene.js` | **奇遇呈現**：畫敘事與選項，送 `chooseEvent`／`continueEvent` action；是否開戰與下一站由 GameSession phase 決定。 | 改奇遇版面、選項/結果呈現。 |
| `scenes/TitleScene.js` | **開機主題畫面**：顯示遊戲題名與「開始遊戲」，不建立 run；進入 `BaseScene` 據點。 | 改遊戲首頁、主題視覺、開始按鈕。 |
| `scenes/BaseScene.js` | **七設施據點大廳＋一局結束落點**：局末結算 MetaState；「開始挑戰」建立 `GameSession({ meta })`。 | 改據點導航、局末摘要、開始挑戰入口。 |
| `scenes/FacilityScene.js` | **設施內容頁**：顯示成就、畫廊、跨局強化、卡牌／事件／遺物總表；跨局強化沿用 `MetaState` 並即時存檔。 | 改各設施版面與內容呈現。 |
| `config/tuning.js` | 所有數值：內力大小格、靈感、起手張數、`maxRank`、階級曲線、連擊倍率、動畫與 run 配置。 | **任何平衡/手感數字。禁止把數字散落到別處。** |
| `index.js` | Phaser 遊戲進入點：畫布尺寸/縮放、註冊所有場景，**開機進 Title 主題畫面**。 | 改畫布、註冊新場景、開機場景。 |
