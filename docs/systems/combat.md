# 割草戰鬥（里程碑 2）

> 相關：[combo](combo.md)（連段＝次數）、[status](status.md)（中毒/燃燒的 tick）、[merge](merge.md)（上狀態的兩條來源）。
> 檔案責任見 [../file-map.md](../file-map.md)。

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
    每波**重新選一次目標**、各標 `wave` 給 UI 分波演出；崩山的擊退也**逐波**施加。詳見 [combo](combo.md)。
- **目前牌組**：攻擊 = 橫劈（整列）、貫（縱列）、崩山（整列＋擊退）、暗器（散射）、
  毒霧（近三排上中毒）、火藥（3×3 上燃燒）；技能 = 運氣調息（內力）、臨機應變（抽牌）；忘形（催化劑）。
  防禦（護甲）機制還在，暫無卡產生護甲。
- **上狀態的卡**：`playCard` 對命中且存活的敵人上狀態，兩條來源（見 [merge](merge.md) 的「卡片自身效果 vs 附魔」）——
  (1) 卡自身 `effectStatus`（毒霧/火藥，定額）；(2) 卡的 `enchants` 附魔（層數＝基礎傷 × `enchantScale` × level，動態）。
  連段多波打同一人只上一次。範圍卡另帶 `rows`（NEAR_ROWS）或 `blast`（BLAST 邊長），
  由 playCard 以 `{ rows, size }` 傳進 `resolveAttack`。（毒霧/火藥**無直接傷害**，`combat.js` 的 strike 已把 undefined 傷害當 0。）
- **debuff（`StatusLibrary`）**：中毒/燃燒**已有實際效果**（見 [status](status.md)）；破甲/麻痺仍是 placeholder
  （能施加、能顯示小點，但無 tick 效果）。
- **回合流程**（場景 `endTurnFlow` 串接）：玩家出招（`playCard` → `resolveAttack` 打進敵陣）
  → 按結束回合 → `battle.enemyPhase()`（前進 → 接觸攻擊主角、護甲先擋 → 補排）
  → 再跑手牌 `endTurn()`（棄牌 + 新回合抽牌/合成）。
- **主角血量/護甲**：`playerHp`；護甲（`armor`）是「格擋」，每回合 `startTurn` 重置，敵人攻擊時先扣護甲再扣血。
- **視覺**：core 只出狀態與事件（`ENEMIES_HIT`/`ENEMIES_ADVANCED`/`PLAYER_HIT`），
  `FormationView` 用 `perspective.project()` 投影成肩後視角。core 零 Phaser 的分層照舊。
