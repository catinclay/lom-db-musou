# 「我想改 X，去哪裡」對照表

> 找檔案責任 → [file-map.md](file-map.md)；系統機制先讀懂 → [systems/](systems/)。

| 我想…… | 去這裡 |
|--------|--------|
| 新增一張卡 / 改卡的數值、cost、名字 | `core/CardLibrary.js` |
| 改某張卡「境界↑ / 連段↑ 時怎麼變強」 | `core/CardLibrary.js`（該卡的 `realmScale`/`comboScale`；常見曲線見 `GROWTH`），預設公式在 `core/Effect.js` |
| 改**傷害/護甲**境界成長曲線 | `config/tuning.js`（`realmDamageCurve`），套用點 `core/Effect.js`（`realmMultiplier`） |
| 新增功能牌（內力、抽牌…），且境界要走溫和曲線 | `core/CardLibrary.js`（`type: SKILL` ＋ `base: { energy/draw }` ＋ `realmScale: GROWTH.linear/step`）；套用在 `core/BattleState.js` 的 `playCard` |
| 改合成規則（同名自動合成、同境界限制、忘形合成、連鎖） | `core/MergeEngine.js`（機制見 [systems/merge.md](systems/merge.md)） |
| 改附魔累加規則、忘形保留、realmless、合成產物 | `core/Card.js`（`mergeCards` / `mergeEnchants` / `isRealmless`） |
| 新增/改忘形催化劑或其他無數值卡 | `core/CardLibrary.js`（`catalyst: true`） |
| 改補抽機率、遞減曲線 | `config/tuning.js`（`mergeDraw`）＋ `core/MergeEngine.js`（`drawChanceFor`） |
| 改連段怎麼累積、倍率 | `core/ComboTracker.js` ＋ `config/tuning.js`（`comboMultiplier`）；機制見 [systems/combo.md](systems/combo.md) |
| 改中毒/燃燒的傷害、衰減、疊層速度 | `config/tuning.js`（`combat.status`）＋ `core/StatusLibrary.js`（`resolveStatusTick`）；機制見 [systems/status.md](systems/status.md) |
| 改連段每波動畫間隔、擊退間隔 | `config/tuning.js`（`anim.combatWaveDelay` / `anim.knockbackWaveDelay`）＋ `ui/FormationView.js` |
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
| 改 run 流程（每日事件池、尾王節奏、拖延加成、戰後結算） | `core/RunState.js` ＋ `config/tuning.js`（`run`）；機制見 [systems/run.md](systems/run.md) |
| 新增/改遺物·秘籍 | `core/RelicLibrary.js`（`battleMods`/`hooks`/`onAcquire`）；戰鬥掛鉤在 `core/BattleState.js`（`runRelicHook`/`relicMod`） |
| 改主角屬性·成長（境界上限/內力/起手/血量） | `core/RunState.js`（`attrs`，初值在 `config/tuning.js`）；覆蓋點 `core/BattleState.js` 建構子；成長來源 `RelicLibrary`（無形劍意）＋`EventLibrary`（高人指點） |
| 新增/改奇遇 | `core/EventLibrary.js`（事件＋選項＋`resolve`），數值在 `config/tuning.js`（`run.event`） |
| 改據點升級·威望（跨 run） | `core/MetaState.js`（`META_UPGRADES`）＋ `config/tuning.js`（`run.meta`）；UI 在 `scenes/BaseScene.js`、存檔 `ui/metaStore.js` |
| 改主題首頁／開始遊戲 | `scenes/TitleScene.js`＋共用視覺 `ui/menuChrome.js`；開機順序在 `index.js` |
| 改據點七設施導航／開始挑戰入口 | `scenes/BaseScene.js` |
| 新增成就、畫廊項目或解鎖條件 | `core/ArchiveLibrary.js`；呈現在 `scenes/FacilityScene.js` |
| 改卡牌／事件／遺物總表版面 | `scenes/FacilityScene.js`；內容來源分別是 `CardLibrary`／`EventLibrary`／`RelicLibrary` |
| 改戰鬥的勝負條件、敵潮規模/波數、清場獎勵 | `core/BattleState.js`（`checkOutcome`/`wavesLeft`/`rowsLeftInWave`/`challengeNextWave`）＋ `core/RunState.js`（`battleConfig`）＋ `config/tuning.js`（`run.battle`、`combat.clearReward`） |
| 新增敵種、改攻擊準備／特殊意圖／不動 | `core/EnemyLibrary.js`＋`core/Formation.js`，所有時間、機率、數值在 `config/tuning.js`（`combat.enemies`） |
| 改白天地圖版面、節點、入夜按鈕 | `scenes/RunMapScene.js` |
| 改傷害數字/連段的飄字演出 | `ui/Dummy.js` |
| 改 debug 面板 | `ui/DebugPanel.js` |
| 動畫卡住、tween 沒收尾 | `ui/tweens.js`（陷阱見 [conventions.md](conventions.md)） |
