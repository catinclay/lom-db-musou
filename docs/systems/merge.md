# 階級、合成與忘形

> 相關：[combo](combo.md)（境界／連擊）、[combat](combat.md)（多波招式）、[status](status.md)（卡片自身狀態）。

卡片實例以 `rank` 表示**階級**。階級只活在單場戰鬥；每次 `BattleState.start()` 都由 run 的 deck list 重新建立基礎牌，因此不跨戰滾雪球。

## 自動合成

- 只有**同名、同階級**的兩張牌會自動合成：階級 N ＋階級 N → 階級 N+1。
- 合成結果是新物件、新 uid；tag 取聯集，材料不會被就地修改。
- `tuning.maxRank`（預設 5）是自動合成上限；到頂牌不再自動合成。`null` 表示無上限。
- `resolveAutoMerges` 由左到右反覆找第一組配對，直到不動點；補到的牌也會繼續引爆連鎖。
- 每次真正合成獲得 **2 點靈感**。靈感每滿 **3 點**立即抽一張，超出的餘數保留；靈感跨回合保留、每場戰鬥重新歸零。數值在 `tuning.inspiration`。
- transcript 將靈感拆成**一點一個 `INSPIRATION`**；每個第三點後立即穿插一個 `DRAW`／`DRAW_FIZZLE`。UI 因此能逐顆點亮、滿三顆提示抽牌，再繼續下一輪，而不是直接跳到最終餘數。
- 每發傷害、護甲與卡片自身狀態層數查 `tuning.rankCurve`（預設 `[1, 1.5, 2.5, 4, 6]`）。功能牌每次施放的產量改走 `tuning.skillResourceCurve`（預設 `[3, 4, 5, 6, 7]`）。

## 忘形的兩種用法

忘形（`wangXing`）是一張可出的無階級技能牌，不再是 catalyst，也沒有可遷移 tag。

1. **打出：返璞歸真**
   - `ComboTracker.forgetForm()` 把角色境界歸零，連擊保留。
   - 不進連擊、不造成傷害，`cost = 0`。
   - 本場消耗到 `BattleState.exhaustPile`，不進棄牌堆；下一場由 deck list 重建後自然回來。
   - transcript 產生 `EXHAUST`，UI 以原地上浮、縮小、淡出呈現，不飛向棄牌堆。
2. **拖到具體牌上：升一階**
   - `applyWangxingPump` 讓目標 `rank + 1`，產出新 uid；可突破 `maxRank`。
   - 忘形本場消耗，不進棄牌堆；不能施放到忘形。
   - 升階本身視同一次合成：增加 `mergesThisTurn` 並獲得 2 點靈感。
   - 升階後會接 `resolveAutoMerges`；若湊成同名同階，每次後續合成都會繼續累計次數並各給 2 點靈感。
   - transcript 先產生忘形的 `EXHAUST`，再以 `RANK_UP` 將目標替換成新 uid，接著播放 `INSPIRATION`、滿格抽牌與自動合成劇本。

## 初始補償

每局開局自帶遺物**靈犀玉**：每場戰鬥開始獲得 2 點靈感。因此前兩次合成的節奏是 `2 → 4（抽 1、留 1）→ 3（抽 1、留 0）`，避免開場自動合成先吃掉手牌卻沒有補牌的虧損感。

## 卡片自身狀態

毒霧／火藥用 `effectStatus: { id, stacks }` 表示卡片自身效果。每波層數吃 `rankCurve`，連擊增加獨立施放波數；它綁在卡定義上，不隨合成轉移。

舊的 `card.enchants`、附魔上限、附魔獎勵與卡面色條已移除。出牌仍會先 tick 敵人既有狀態，再套用本張牌的 `effectStatus`，所以新狀態首次 tick 會延到下一次出牌。
