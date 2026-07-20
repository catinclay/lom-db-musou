# 術語表

> 跨 agent 對齊詞彙用。深入機制見 [systems/](systems/)、架構見 [architecture.md](architecture.md)。

| 術語 | 意思 |
|------|------|
| **core / UI 分層** | `src/core/` 純 JS 零 Phaser、算邏輯；`src/ui/`＋`src/scenes/` 認識 Phaser、演動畫。兩者只透過事件與 transcript 溝通。見 [architecture.md](architecture.md)。 |
| **劇本 / transcript** | core 一次算完整條連鎖後產出的**有序事件陣列**（`TX.DRAW`/`MERGE`/`DISCARD`…）。UI 的 `MergeAnimator` 照它逐格重播成動畫。 |
| **EVENT / EventBus** | core→UI 的即時通知橋（`EVENT.*`，如 `ENEMIES_HIT`/`PLAYER_HIT`/`STATUS_TICKED`）。敵陣走事件即時結算，不進 transcript。 |
| **境界（realm）** | 卡的等級（一〜十）。合成 +1、數值隨境界成長；上限 `tuning.maxRealm`。 |
| **連段（combo）** | 依境界由小到大遞增出牌累積的 step。攻擊牌加「次數」、功能牌加法 `+(step−1)`。見 [systems/combo.md](systems/combo.md)。 |
| **合成 / merge** | 同名同境界自動合成（結果境界 +1）。見 [systems/merge.md](systems/merge.md)。 |
| **忘形催化劑（wangXing）** | realmless 的特殊卡（或帶忘形 tag 的卡當材料）：**跨境界、跨名**把對方 +1、附魔倒進對方、自己被消耗。 |
| **附魔（enchants）vs 卡自身 effectStatus** | 附魔＝外加的魔（`card.enchants = { 狀態id: level }`，隨合成轉移、受上限）；effectStatus＝卡定義的定額狀態（毒霧的毒/火藥的火，綁 defId、不轉移）。見 [systems/merge.md](systems/merge.md)。 |
| **DoT / 異常狀態** | 中毒（即時流血＋比例衰減）、燃燒（蓄力引爆）。靠出牌小 tick＋回合結束大 tick 發作。見 [systems/status.md](systems/status.md)。 |
| **割草敵陣（Formation）** | `lanes`×`maxRank` 格狀敵陣，肩後視角湧上。招式用 `TARGET`（ROW/LANE/BLAST/SCATTER…）鎖定。見 [systems/combat.md](systems/combat.md)。 |
| **run / RunState** | 「一局江湖遠征」的狀態機：牌組/血量/銀兩/屬性/遺物跨戰保存，白天三選一、入夜尾王。在 BattleState 之上、MetaState 之下。見 [systems/run.md](systems/run.md)。 |
| **三選一 offer** | 白天每輪擲 3 個選項（奇遇/戰鬥/客棧）挑 1 做，最多 `maxRoundsPerDay` 輪。 |
| **遺物·秘籍（Relic）** | 一局內被動加成，來源＝魔王打贏＋客棧。存 `RunState.relics`（id）。 |
| **主角屬性（attrs）** | `maxRealm`/`energyPerTurn`/`startingHandSize`，跨戰保存、可成長，戰鬥時覆蓋 `BattleState.tuning`。 |
| **meta / 門派據點（MetaState）** | 跨 run 的威望＋永久升級（rogue-lite meta）。存 localStorage（`ui/metaStore.js`）。 |
| **速通拉霸代幣（slotTokens）** | 提早入夜（還有沒做完的事件）換得，去拉霸機（`SlotScene`）換獎，期望值刻意弱於刷滿。 |
| **tuning** | `src/config/tuning.js`，所有平衡/手感數值的**唯一來源**。 |
