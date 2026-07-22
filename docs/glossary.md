# 術語表

> 跨 agent 對齊詞彙用。深入機制見 [systems/](systems/)、架構見 [architecture.md](architecture.md)。

| 術語 | 意思 |
|------|------|
| **core / UI 分層** | `src/core/` 純 JS 零 Phaser、算邏輯；`src/ui/`＋`src/scenes/` 認識 Phaser、演動畫。兩者只透過事件與 transcript 溝通。見 [architecture.md](architecture.md)。 |
| **劇本 / transcript** | core 一次算完整條連鎖後產出的**有序事件陣列**（`DRAW`/`MERGE`/`DISCARD`/`EXHAUST`/`RANK_UP`…）。UI 的 `MergeAnimator` 照它逐格重播成動畫。 |
| **EVENT / EventBus** | core→UI 的即時通知橋（`EVENT.*`，如 `ENEMIES_HIT`/`PLAYER_HIT`/`STATUS_TICKED`）。敵陣走事件即時結算，不進 transcript。 |
| **階級（rank）** | 卡片實例的招式高度；決定每發威力與突破能力。同名同階合成 +1，每場戰鬥重建。 |
| **境界（realm）** | 角色每回合的突破門檻，起始 0；出牌階級大於境界才使境界 +1，階級小於等於境界則中斷並與連擊一起歸零。 |
| **連擊（combo）** | 每次突破 +1。攻擊、狀態與功能牌都把連擊當成「施放次數」；中斷牌固定只施放一次。忘形本身無階級，不觸發中斷。見 [systems/combo.md](systems/combo.md)。 |
| **合成 / merge** | 同名同階級自動合成（結果階級 +1），受 `tuning.maxRank` 限制；每次給 2 點靈感。忘形升階雖可突破上限，也視同一次合成。見 [systems/merge.md](systems/merge.md)。 |
| **靈感（inspiration）** | 戰鬥內的補牌充能：每滿 3 點立即抽一張，餘數跨回合保留、跨戰鬥歸零。合成／忘形升階各給 2 點，臨機應變依階級與連擊給予。 |
| **內力刻度** | core 以小格計數；3 小格組成 UI 的 1 個完整氣輪。基礎每回合 9 小格，卡面費用也用相同大小格符號。 |
| **忘形（wangXing）** | 無階級、可出的破格牌：打出使境界歸零；拖到具體牌上令其階級 +1 並獲得一次合成靈感。兩種用法都會在本場消耗忘形。 |
| **棄牌 / 消耗** | 棄牌進棄牌堆，之後可洗回；消耗進 `BattleState.exhaustPile`，本場不再出現。UI 分別播放飛往棄牌堆與原地消散。 |
| **境界歸零** | 忘形打出的效果：門檻回到 0，連擊保留，低階牌可重新突破。 |
| **附魔（已移除）／effectStatus** | 外加附魔系統已移除。`effectStatus` 仍是毒霧／火藥的卡片自身狀態，層數吃階級、連擊加施放次數。 |
| **DoT / 異常狀態** | 中毒（即時流血＋比例衰減）、燃燒（蓄力引爆）。靠出牌小 tick＋回合結束大 tick 發作。見 [systems/status.md](systems/status.md)。 |
| **割草敵陣（Formation）** | `lanes`×`maxRank` 格狀敵陣，肩後視角湧上。招式用 `TARGET`（ROW/LANE/BLAST/SCATTER…）鎖定。見 [systems/combat.md](systems/combat.md)。 |
| **GameSession** | 整局純 JS 流程控制器：用 phase 表示目前流程、`dispatch(action)` 推進規則、`snapshot()` 給 UI 或無頭 AI 觀測。Scene 不直接決定流程。見 [systems/headless.md](systems/headless.md)。 |
| **run / RunState** | 「一局江湖遠征」的狀態機：牌組/血量/銀兩/屬性/遺物跨戰保存，白天三選一、入夜尾王。在 BattleState 之上、MetaState 之下。見 [systems/run.md](systems/run.md)。 |
| **時辰** | 一天內的一次行動單位；每個時辰出現一組三選一，完成後推進下一時辰，最多 `maxRoundsPerDay` 個。舊 UI 的「樁」已停用。 |
| **三選一 offer** | 白天每個時辰由 `OfferDirector` 編排 3 個選項（奇遇／戰鬥／服務設施）挑 1 做；保證安穩選項但只以文案暗示。 |
| **遺物·秘籍（Relic）** | 一局內被動加成，來源＝初始配備、魔王打贏與江湖商販。存 `RunState.relics`（id）；目前初始遺物靈犀玉會在每場戰鬥開始給 2 點靈感。 |
| **主角屬性（attrs）** | `maxRank`/`energyPerTurn`/`startingHandSize`，跨戰保存、可成長，戰鬥時覆蓋 `BattleState.tuning`。 |
| **meta / 門派據點（MetaState）** | 跨 run 的威望＋永久升級（rogue-lite meta）。存 localStorage（`ui/metaStore.js`）。 |
| **速通拉霸代幣（slotTokens）** | 提早入夜（還有沒做完的事件）換得，去拉霸機（`SlotScene`）換獎，期望值刻意弱於刷滿。 |
| **tuning** | `src/config/tuning.js`，所有平衡/手感數值的**唯一來源**。 |
