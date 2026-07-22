# 正式流程 / 一局江湖遠征（里程碑 3）

> 相關：[combat](combat.md)（單場戰鬥）、[merge](merge.md)（局內合成）。里程碑進度見 [../roadmap.md](../roadmap.md)。
> 檔案責任見 [../file-map.md](../file-map.md)；改東西的入口見 [../changing-things.md](../changing-things.md)。

整局由純 JavaScript `GameSession` 統一驅動；它持有一局的 `RunState` 與當前單場 `BattleState`，再上面才是跨 run 的 `MetaState`（門派據點）。分層：

```
   TitleScene（主題首頁）── 開始遊戲
        ▼
   BaseScene（七設施據點）⇄ FacilityScene（成就／畫廊／強化／三種總表）
        │ 開始挑戰 → new GameSession({ meta })
        ▼
   GameSession（純 JS phase/action 流程）
        │ dispatch(chooseOffer / callBoss / playCard / endTurn / …)
        ├─ RunState：牌組、資源、日程、戰後結算
        └─ BattleState：單場同步戰鬥與 transcript
        │
        ├─ snapshot() → Node AI / 平衡 bot
        └─ action result → Phaser Scene 重播，sessionNavigation 依 phase 轉場
```

- **流程／呈現解耦**：所有局內操作都送進 `GameSession.dispatch`，Scene 不直接推進 Run 或 Battle。`snapshot()` 提供可序列化觀測，Node AI 可用固定 seed 高速反覆遊玩；詳見 [headless.md](headless.md)。
- **一天 = 數個「時辰」，每時辰三選一**（`run.offer`＝3 個選項，`rollOffer`/`takeOffer`；最多 `tuning.run.maxRoundsPerDay` 個時辰）：
  `OfferDirector` 不再讓三格各自獨立亂抽，而是先按 `tuning.run.offer.patterns` 抽內部節奏組成，再抽具體內容。
  每組保證至少一個安穩選項、通常至多一個高壓選項、三格不重複且至少涵蓋兩種功能；最近兩個已選內容降權。
  風險層級只供 core 編排，畫面僅以地名、敘述與色調暗示，不顯示「安全／危險」標籤。
  選項可為奇遇、尋常／精英戰鬥，以及拆開的服務設施：**客棧**只歇息、**江湖商販**賣招式與遺物、
  **武館**刪招、**賭坊**只在持有代幣時出現。客棧只在受傷且付得起時進池，同一天最多出現一次，跨日仍受兩個 offer 的冷卻；付不起的消費設施降權。
  每完成一個選項算過一個時辰（計入拖延）。做越多越強，但……
- **有限低血救濟**：血量低於 30%，且本輪沒有付得起的回血去處時，導演會把一個普通選項換成文案低調的
  「山亭歇腳」；只回復最大血量 15%、不給其他獎勵並照常消耗時辰。每一天最多一次、整局最多兩次，
  出現時即消耗額度，避免反覆故意壓血套利。門檻、回復量與上限都在 `tuning.run.offer.lowHpMercy`。
- **Scene 轉場**：所有 Scene 出口都走 `ui/sceneTransitions.js` 的 `transitionTo`，先鎖來源輸入、淡入墨色，
  再切換並由目標 Scene 的 `transitionIn` 淡入；同一天前往事件、戰鬥、服務設施與回到下一時辰不再硬切。
  淡出／淡入時間與墨色集中在 `tuning.anim.sceneTransition`。當天時辰全部用盡時，行程卡消失，入夜決戰按鈕
  依 `tuning.run.mapLayout` 移到中央並放大，明確呈現唯一剩餘的主流程選擇。
- **入夜召尾王**（`callBoss`）：尾王類別由 `dayBossKind` 決定 —— 平日 `elite`（小王）、
  每 `bossEveryDays` 天 `boss`（魔王）、第 `finalDay` 天 `final`（最終大魔王）。
- **多農的取捨**：尾王吃「當天拖延加成」（`battleConfig` 的 `isBoss` 分支）——
  白天做越多事件，尾王補充波與精英率越高；**提早入夜**（還有沒做完的事件）＝ 拿速通拉霸代幣
  （`slotTokens`）。
- **拉霸**（`core/slot.js` ＋ `SlotScene`）：入夜打贏尾王且有代幣時自動進 `Slot` 拉三輪
  （白天遇到賭坊也可拉），花代幣換銀兩／加牌。`spinSlot` action 在動畫開始前已同步套用獎勵，轉輪只重播結果。期望值刻意弱於乖乖刷滿 —— 速通是挑戰不是捷徑。
- **有限戰鬥**：`BattleState` 吃 `battle` 配置 —— `waves`＝初始敵陣外的補充波，`rows`＝每一波含幾排。
  正常敵方相位成功送入一排才消耗一排額度；場滿未生成不會空扣。玩家清場可按「再來啊！」把當前波剩餘排數一次叫進來，或正常結束回合只補一排。波用盡且清場 ＝ 勝，血量歸零 ＝ 負。
- **遺物·秘籍**（`core/RelicLibrary.js`，Phase 3）：一局內被動加成。每局依 `tuning.run.startingRelics` 自帶**靈犀玉**，每場開戰給 2 點靈感；其他來源 —— **魔王打贏**（`finishBattle` 的
  `boss` 分支 `grantRandomRelic`）＋**江湖商販購買**（`buyRelic`）。持有存 `RunState.relics`（id）；戰鬥時由
  `battleConfig.relics` 帶進 `BattleState`，套 `battleMods`（energy/handSize）與 `hooks`（onBattleStart/onTurnStart）。
- **主角屬性·階級上限**（`RunState.attrs`，Phase 4）：`maxRank`/`energyPerTurn`/`startingHandSize` 初始自 tuning、跨戰保存、可成長。
  `battleConfig.attrs` 帶進 `BattleState`，覆蓋自動合成上限與回合資源。成長來源：遺物**無形劍意**、奇遇**高人指點**；血量上限走 `RunState.maxHp`。
- **失敗＝硬核**：血量歸零 → run 結束回 `BaseScene`（門派據點）。跨戰保存的是**牌組/血量/銀兩/遺物/屬性**（`RunState`），
  局內階級合成每場重置（見 [../conventions.md](../conventions.md) 不變量）。
- **跨 run 據點·門派**（`MetaState`，Phase 5）：run 結束依撐到第幾天 ＋ 通關獎勵賺**威望**，並記錄遠征次數、
  通關次數與最遠天數。據點由 `TitleScene` 首頁進入，`BaseScene` 是七設施大廳；演武堂的永久升級提供更多
  起始血/內力/銀兩、牌組多牌、起手帶遺物。功名碑與影畫閣依 `ArchiveLibrary` 解鎖，藏經閣／江湖錄／秘寶庫
  顯示目前已實裝內容。存 localStorage（`ui/metaStore.js`）；按「開始挑戰」後 `new GameSession({ meta })` 建立新局並由內部 RunState 疊起始加成。
