# 「我想改 X，去哪裡」對照表

> 找檔案責任 → [file-map.md](file-map.md)；系統機制先讀懂 → [systems/](systems/)。

| 我想…… | 去這裡 |
|--------|--------|
| 新增一張卡 / 改卡的數值、cost、名字 | `core/CardLibrary.js` |
| 改某張卡「階級↑ / 連擊↑ 時怎麼變強」 | `core/CardLibrary.js`（該卡的 `rankScale`/`comboScale`；常見曲線見 `GROWTH`），預設公式在 `core/Effect.js` |
| 改**傷害/護甲**階級成長曲線 | `config/tuning.js`（`rankCurve`），套用點 `core/Effect.js`（`rankMultiplier`） |
| 新增功能牌（內力、靈感…） | `core/CardLibrary.js`（`type: SKILL` ＋ `base: { energy/inspiration }` ＋ `rankScale: GROWTH.curve` ＋ `comboScale: GROWTH.repeat`）；套用在 `core/BattleState.js.playCard` |
| 改合成規則（同名同階自動合成、忘形升階、連鎖） | `core/MergeEngine.js`（機制見 [systems/merge.md](systems/merge.md)） |
| 改合成／升階產出的卡片資料 | `core/Card.js`（`mergeCards` / `rankUpCard`） |
| 改忘形的雙模式、消耗去向或升階靈感 | `core/CardLibrary.js`（定義）＋`core/BattleState.js`（打出）＋`core/MergeEngine.js`（拖曳升階、消耗、靈感）；演出在 `ui/MergeAnimator.js` |
| 改靈感滿格門檻、每次合成給多少 | `config/tuning.js`（`inspiration`）＋ `core/MergeEngine.js`（`gainInspiration`） |
| 改內力大小格、每回合內力或功能牌產量 | `config/tuning.js`（`energyUnit`／`energyPerTurn`／`skillResourceCurve`）＋卡片定義 `core/CardLibrary.js`；呈現在 `ui/format.js` |
| 改境界怎麼突破、連擊怎麼累積／放大 | `core/ComboTracker.js` ＋ `config/tuning.js`（`comboMultiplier`）；機制見 [systems/combo.md](systems/combo.md) |
| 改中毒/燃燒的傷害、衰減、疊層速度 | `config/tuning.js`（`combat.status`）＋ `core/StatusLibrary.js`（`resolveStatusTick`）；機制見 [systems/status.md](systems/status.md) |
| 改連擊每波動畫間隔、擊退間隔 | `config/tuning.js`（`anim.combatWaveDelay` / `anim.knockbackWaveDelay`）＋ `ui/FormationView.js` |
| 新增一張「純上狀態」的卡（如毒霧/火藥） | `core/CardLibrary.js`（加 `effectStatus: { id, stacks }`、`base` 不放 damage），套用在 `core/BattleState.js.playCard` |
| 改能量、起手張數、階級上限 | `config/tuning.js` |
| 改回合流程、出牌結算、抽牌時機 | `core/BattleState.js` |
| 改「合成/升階/抽牌/棄牌/消耗怎麼演」、連鎖越合越快 | `ui/MergeAnimator.js` ＋ `core/transcript.js`（事件字彙）＋`config/tuning.js`（`anim`） |
| 改扇形手牌的形狀、重疊、hover 效果 | `ui/HandLayout.js` ＋ `config/tuning.js`（`hand`） |
| 改卡面上某個元素的位置/樣式（如階級徽章） | `ui/CardSprite.js` |
| 改卡牌底圖、邊框、配色 | `ui/cardTextures.js` ＋ `ui/format.js` |
| 改拖曳手勢、箭頭、出牌 vs 忘形升階判定 | `ui/DragController.js` |
| 改連點抽牌的批次行為 | `scenes/BattleScene.js`（`requestDraw`/`pumpDraws`）＋ `config/tuning.js`（`drawBatchWindow`） |
| 改整局 phase、action、跨系統前後順序或戰後去哪裡 | `core/GameSession.js`；無頭介面見 [systems/headless.md](systems/headless.md) |
| 改 run 流程（尾王節奏、拖延加成、戰後結算） | `core/RunState.js` ＋ `config/tuning.js`（`run`）；機制見 [systems/run.md](systems/run.md) |
| 改時辰三選一的安全／風險組成、出現率、客棧冷卻或低血救濟 | `core/OfferDirector.js` ＋ `core/EventLibrary.js` 的內部標籤；所有權重／門檻在 `config/tuning.js`（`run.offer`） |
| 新增/改遺物·秘籍 | `core/RelicLibrary.js`（`battleMods`/`hooks`/`onAcquire`）；戰鬥掛鉤在 `core/BattleState.js`（`runRelicHook`/`relicMod`） |
| 改主角屬性·成長（階級上限/內力/起手/血量） | `core/RunState.js`（`attrs`，初值在 `config/tuning.js`）；覆蓋點 `core/BattleState.js` 建構子；成長來源 `RelicLibrary`（無形劍意）＋`EventLibrary`（高人指點） |
| 新增/改奇遇 | `core/EventLibrary.js`（事件＋選項＋`resolve`＋內部 `offerRisk`/`offerRole`），效果數值在 `config/tuning.js`（`run.event`）、選項權重在 `run.offer.eventWeights` |
| 改據點升級·威望（跨 run） | `core/MetaState.js`（`META_UPGRADES`）＋ `config/tuning.js`（`run.meta`）；UI 在 `scenes/BaseScene.js`、存檔 `ui/metaStore.js` |
| 改主題首頁／開始遊戲 | `scenes/TitleScene.js`＋共用視覺 `ui/menuChrome.js`；開機順序在 `index.js` |
| 改據點七設施導航／開始挑戰入口 | `scenes/BaseScene.js` |
| 新增成就、畫廊項目或解鎖條件 | `core/ArchiveLibrary.js`；呈現在 `scenes/FacilityScene.js` |
| 改卡牌／事件／遺物總表版面 | `scenes/FacilityScene.js`；內容來源分別是 `CardLibrary`／`EventLibrary`／`RelicLibrary` |
| 改戰鬥的勝負條件、敵潮規模/波數、清場獎勵 | `core/BattleState.js`（`checkOutcome`/`wavesLeft`/`rowsLeftInWave`/`challengeNextWave`）＋ `core/RunState.js`（`battleConfig`）＋ `config/tuning.js`（`run.battle`、`combat.clearReward`） |
| 新增敵種、改攻擊準備／特殊意圖／不動 | `core/EnemyLibrary.js`＋`core/Formation.js`，所有時間、機率、數值在 `config/tuning.js`（`combat.enemies`） |
| 改白天地圖版面、節點、入夜按鈕 | `scenes/RunMapScene.js` |
| 改 Scene 淡出淡入、切場節奏 | `ui/sceneTransitions.js`＋`config/tuning.js`（`anim.sceneTransition`）；局內 phase 轉場另經 `ui/sessionNavigation.js` |
| 改傷害數字/連擊的飄字演出 | `ui/Dummy.js` |
| 改 debug 面板 | `ui/DebugPanel.js` |
| 動畫卡住、tween 沒收尾 | `ui/tweens.js`（陷阱見 [conventions.md](conventions.md)） |
