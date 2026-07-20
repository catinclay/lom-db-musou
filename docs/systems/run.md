# 正式流程 / 一局江湖遠征（里程碑 3）

> 相關：[combat](combat.md)（單場戰鬥）、[merge](merge.md)（局內合成）。里程碑進度見 [../roadmap.md](../roadmap.md)。
> 檔案責任見 [../file-map.md](../file-map.md)；改東西的入口見 [../changing-things.md](../changing-things.md)。

在戰鬥之上加一層 `RunState`，戰鬥仍是同一個 `BattleState`；再上面一層是跨 run 的 `MetaState`（門派據點）。分層：

```
   TitleScene（主題首頁）── 開始遊戲
        ▼
   BaseScene（七設施據點）⇄ FacilityScene（成就／畫廊／強化／三種總表）
        │ 開始挑戰 → new RunState({ meta }) —— meta.applyToRun 疊起始加成
        ▼
   RunMapScene（白天樞紐）
        │ takeNode / callBoss → { config }
        ▼
   BattleScene ── new BattleState({ deckList: run.deck, battle: config })
        │ 打完 BATTLE_WON / BATTLE_LOST
        ▼
   run.finishBattle(battle) → 血量寫回、給獎、推進日程 or 結束
        │
        ├─ 續跑 → 回 RunMapScene（下一節點 / 隔天）
        └─ runOver → BaseScene（earnFromRun 賺威望、記錄統計、存檔）
```

- **一天 = 一輪輪「三選一」**（`run.offer`＝3 個選項，`rollOffer`/`takeOffer`；最多 `tuning.run.maxRoundsPerDay` 輪）：
  每輪擲 3 個隨機選項挑 1 個做，做完補下一輪 —— 把「攤開 10 格最佳化」的策略負擔拆成一連串輕鬆的小挑選，也更鬧。
  選項類別：**奇遇**（`event`，有分支選項 `EventScene`＋`EventLibrary`）、`battle`/`elite` 戰鬥、`inn` 客棧。
  每做一樁算一次「當天事件」（計入拖延）。做越多越強，但……
- **入夜召尾王**（`callBoss`）：尾王類別由 `dayBossKind` 決定 —— 平日 `elite`（小王）、
  每 `bossEveryDays` 天 `boss`（魔王）、第 `finalDay` 天 `final`（最終大魔王）。
- **多農的取捨**：尾王吃「當天拖延加成」（`battleConfig` 的 `isBoss` 分支）——
  白天做越多事件，尾王補充波與精英率越高；**提早入夜**（還有沒做完的事件）＝ 拿速通拉霸代幣
  （`slotTokens`）。
- **拉霸**（`core/slot.js` ＋ `SlotScene`）：入夜打贏尾王且有代幣時自動進 `Slot` 拉三輪
  （之後客棧也可拉），花代幣換銀兩/加牌/牌組附魔。期望值刻意弱於乖乖刷滿 —— 速通是挑戰不是捷徑。
- **有限戰鬥**：`BattleState` 吃 `battle` 配置 —— `waves`＝初始敵陣外的補充波，`rows`＝每一波含幾排。
  正常敵方相位成功送入一排才消耗一排額度；場滿未生成不會空扣。玩家清場可按「再來啊！」把當前波剩餘排數一次叫進來，或正常結束回合只補一排。波用盡且清場 ＝ 勝，血量歸零 ＝ 負。
- **遺物·秘籍**（`core/RelicLibrary.js`，Phase 3）：一局內被動加成。來源 —— **魔王打贏**（`finishBattle` 的
  `boss` 分支 `grantRandomRelic`）＋**客棧購買**（`buyRelic`）。持有存 `RunState.relics`（id）；戰鬥時由
  `battleConfig.relics` 帶進 `BattleState`，套 `battleMods`（energy/handSize）與 `hooks`（onBattleStart/onTurnStart）。
- **主角屬性·境界上限**（`RunState.attrs`，Phase 4）：`maxRealm`/`energyPerTurn`/`startingHandSize` 初始自 tuning、跨戰保存、可成長。
  `battleConfig.attrs` 帶進 `BattleState`，**覆蓋 `this.tuning` 的對應值**（連合成上限 `maxRealm` 一起流進 merge）。
  成長來源：遺物**無形劍意**（境界上限 +1）、奇遇**高人指點**（花銀兩練內力/起手/境界上限）；血量上限走 `RunState.maxHp`（金鐘罩）。
- **失敗＝硬核**：血量歸零 → run 結束回 `BaseScene`（門派據點）。跨戰保存的是**牌組/血量/銀兩/遺物/屬性**（`RunState`），
  局內境界合成照舊每場重置（見 [../conventions.md](../conventions.md) 不變量）。
- **跨 run 據點·門派**（`MetaState`，Phase 5）：run 結束依撐到第幾天 ＋ 通關獎勵賺**威望**，並記錄遠征次數、
  通關次數與最遠天數。據點由 `TitleScene` 首頁進入，`BaseScene` 是七設施大廳；演武堂的永久升級提供更多
  起始血/內力/銀兩、牌組多牌、起手帶遺物。功名碑與影畫閣依 `ArchiveLibrary` 解鎖，藏經閣／江湖錄／秘寶庫
  顯示目前已實裝內容。存 localStorage（`ui/metaStore.js`）；按「開始挑戰」後 `new RunState({ meta })` 疊起始加成。
