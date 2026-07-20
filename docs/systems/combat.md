# 割草戰鬥（里程碑 2）

> 相關：[combo](combo.md)（連段＝次數）、[status](status.md)（中毒/燃燒的 tick）、[merge](merge.md)（上狀態的兩條來源）。
> 檔案責任見 [../file-map.md](../file-map.md)。

敵人一排排肩後湧上，玩家出招砍殺；回合結束時敵人依意圖行動、前進或備戰，再由補充波送入一排。

- **敵陣**（`Formation`）：`rows[0]` 最前排；每排有 `dist`（到主角步數，0 = 接觸）。
  `advance()` 整體前進一步並維持排距；`refill()` 從最後方補排到維持排數（`tuning.combat.rows`）。
- **敵陣是格狀**：`lanes`（7）×`maxRank`（6），敵人各佔一格 (rank, lane)。rank 0 = 接觸。
- **移動不排隊**（`advance`）：每回合前進一格；正前方被卡住時**側移**到隔壁一路的前方補位，差超過一路就卡住。
- **攻擊準備**（telegraph）：敵人進入 rank 0 才開始準備。黃色 `! N` 是剩餘準備回合；倒數完變紅色 `!`，再到下一次敵方相位才攻擊。攻擊後重置完整準備時間；準備期間若被推出 rank 0，下次接近時重新倒數。每個敵種的 `prepareTurns` 可不同。
- **特殊意圖**：攻擊距離外的敵人不一定前進；例如定樁力士會先顯示紫色「扎馬」意圖，下回合停在原地取得「不動」。後方仍想前進者會照 `advance` 規則嘗試繞道。移動意圖不顯示，避免畫面過亂。
- **擊退與不動**（`knockback`）：一般情況往後推並連鎖推擠。帶「不動」者被推時消耗一層並免疫該次位移；若他在被推者後方，也會成為推擠鏈的硬擋點。其前方敵人會優先嘗試往斜後方空格擠，成功時仍後退一格；沒有側方空格則整次推擠停止。
- **招式鎖定**（`combat.TARGET`，卡的 `target`）：
  - `ROW`（橫劈 / 崩山）：只打**最近那一排**（rank 最小那排的所有人），不是每路的最前。崩山另帶 `knockback`。
  - `LANE`（貫）：打最近一路（同近時挑**人最多**的縱列，再同才隨機），整條縱列由前貫到後。
  - `NEAR_ROWS`（毒霧）：打**最近的 N 排**（`area.rows`，跳過空排取最近幾個有人的 rank）的全部。
  - `BLAST`（火藥）：一個 `area.size`×`area.size` 方塊。第一擊沿用「必含最近排、涵蓋最多人」；連段後續擊會改選不同方塊，優先命中最多敵人並盡量不炸空位，營造分散爆炸。**預留之後開放玩家指定中心**。
  - `SCATTER`（暗器）：每根隨機釘最前排一人。
  - `SINGLE` / `MULTI` / `RANDOM`：已實作，暫無卡用。
  - **連段＝次數**：`effect.hits` 隨連段變多，攻擊與純狀態範圍牌都會**重打幾波**，每波重新選目標並標 `wave`。UI 依 `tuning.anim.combatWaveDelay` 錯開動畫；崩山的擊退也逐波施加。詳見 [combo](combo.md)。
- **目前牌組**：攻擊 = 橫劈（整列）、貫（縱列）、崩山（整列＋擊退）、暗器（散射）、
  毒霧（近三排上中毒）、火藥（3×3 上燃燒）；技能 = 運氣調息（內力）、臨機應變（抽牌）；忘形（催化劑）。
  防禦（護甲）機制還在，暫無卡產生護甲。
- **上狀態的卡**：`playCard` 對命中且存活的敵人上狀態，兩條來源（見 [merge](merge.md) 的「卡片自身效果 vs 附魔」）——
  (1) 卡自身 `effectStatus`（毒霧/火藥，每波層數隨境界曲線成長，連段增加波數）；
  (2) 卡的 `enchants` 附魔（一般為基礎傷 × `enchantScale` × level，同種狀態卡則按境界縮放後層數 × level）。
  純狀態卡每一波都會施加一次，因此同一敵人被兩波命中會吃兩次層數。範圍卡另帶 `rows`（NEAR_ROWS）或 `blast`（BLAST 邊長），
  由 playCard 以 `{ rows, size }` 傳進 `resolveAttack`。（毒霧/火藥**無直接傷害**，`combat.js` 的 strike 已把 undefined 傷害當 0。）
- **debuff（`StatusLibrary`）**：中毒/燃燒**已有實際效果**（見 [status](status.md)）；破甲/麻痺仍是 placeholder
  （能施加、能顯示小點，但無 tick 效果）。
- **清場選擇**：玩家出牌清空敵陣且仍有補充波時，立即獲得 1 內力並抽 1 張，畫面顯示「再來啊！」。按它會把**當前波剩餘排數**一次送入；也可照常結束回合。若 DoT 在按下結束回合後才清場，獎勵延到下個玩家回合，避免抽到的牌立即被棄掉。
- **回合流程**（場景 `endTurnFlow` 串接）：玩家出招（`playCard` → `resolveAttack` 打進敵陣）
  → 按結束回合 → DoT 大 tick → `battle.enemyPhase()`（攻擊 → 準備／特殊行動 → 前進 → **正常只補一排**）
  → 再跑手牌 `endTurn()`（棄牌 + 新回合抽牌/合成）。
- **主角血量/護甲**：`playerHp`；護甲（`armor`）是「格擋」，每回合 `startTurn` 重置，敵人攻擊時先扣護甲再扣血。
- **視覺與說明**：core 只出狀態與事件（`ENEMIES_HIT`/`ENEMIES_ADVANCED`/`PLAYER_HIT`），`FormationView` 用 `perspective.project()` 投影。敵人頭上只顯示攻擊／特殊行動意圖；hover 會列出敵種、攻擊準備、下回合意圖與身上所有狀態／buff 說明。core 零 Phaser 的分層照舊。

## 精英／魔王（boss）

具名王單位（`touMu` 頭目＝精英、`moWang` 魔王；`isBoss` in `EnemyLibrary`／`tuning.combat.enemies`），
`RunState` 依戰鬥類別（elite/boss/final）注入 `battleConfig.bossDefId`。

- **登場（finale）**：正常補充波（`wavesLeft`）清完後才從最後方走入（`BattleState.maybeSpawnBoss`）。
  王未登場／未死不判勝（`hasPendingBoss` 併入 `checkOutcome`）。尋常廝殺無王（`bossDefId` 省略 ⇒ 行為照舊）。
- **大血條**：`BattleScene` 在畫面正上方鏡射王的血量（`drawBossBar`/`updateBossBar`）；王剪影放大、頭頂小血條隱藏。
- **攻擊距離**：`def.attackRange`（雜兵省略＝0，只在 rank 0 近戰）。`Formation.inAttackRange` 一般化了原本
  硬綁 rank 0 的攻擊準備／前進；遠程王在 `rank ≤ attackRange` 就備戰、到達射程即停止前進。
- **特殊行動**（`specials` 陣列，資料驅動；`Formation.applySpecial` 依 `type` 分派）：
  - `buff`（扎馬取得不動，定樁力士；行為不變）
  - `summon`：在王前方最近空排放一排小兵（`summonAt`）。
  - `retreat`：玩家逼近（`maxRankToTrigger`）時後退一格拉開距離（`retreatEnemy`）。
  - `projectile`：只在遠距離（`minRank`）施放。投射物以「1 滴血的敵人」存在（`createProjectile`，`isProjectile`），
    **每次「出牌」前進一格**（`BattleState.advanceProjectiles`，非敵方相位）；越過最前線即扣玩家血後消失；
    因是 formation 內的單位,玩家攻擊天生就能鎖定把它打掉。
  - 每個 special 各自 `chargeTurns`（預告蓄力）與 `cooldownTurns`（`specialCooldowns` 逐 id 記）。
