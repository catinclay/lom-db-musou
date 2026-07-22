# 異常狀態（DoT，改數值前先讀懂）

> 相關：[combat](combat.md)（怎麼上狀態）、[merge](merge.md)（階級如何放大卡片自身狀態）。
> 檔案責任見 [../file-map.md](../file-map.md)。

中毒/燃燒是 DoT，靠**兩種節拍的 tick** 發作（不走 transcript —— 敵陣本來就是即時結算＋發事件）：

- **出牌小 tick**：每成功出一張牌（`playCard` 呼叫 `statusTick('play')`）＝ 流逝一格時間；只推進出牌前
  已存在的狀態。本張牌自己上的狀態在 tick 後才套用，首次 tick 延到下一次出牌。
- **回合結束大 tick**：`endTurnFlow` 在敵人前進**之前**呼叫 `statusTurnEnd()`，讓 DoT 先收割。

毒霧／火藥的卡片自身層數不是定額：`effectStatus.stacks` 是階級一基礎值，每次施加先乘
`tuning.rankCurve` 並取整。基礎 3 層因此在階級一至五是 3/5/8/12/18 層。
連擊不放大單次層數，而是增加施放波數：連擊二施加 2 次、連擊三施加 3 次。

兩種狀態的性格（數值都在 `tuning.combat.status`，邏輯在 `StatusLibrary.resolveStatusTick`）：

| | 中毒（即時流血、比例衰減） | 燃燒（蓄力引爆）|
|---|---|---|
| 每個 tick | 滴 `N × damagePerStack` 傷，**造成傷害後衰減 `decayRate` 比例層（最少 1）** | （出牌）火自己 +`growthRate` 比例層（最少 1，**不掉血**）|
| 出牌小 tick | 就是 1 個 tick（滴＋衰） | 疊層（見上）|
| 回合結束大 tick | 連跑 `turnEndTicks`（3）個 tick，**先算好總傷與最終層數，畫面只跳一次數字**（免太亂）| 依層數引爆（`detonateDamage`＝每層 1 傷，總傷＝層數）後**快衰**（只留 `decayKeep` 比例）|
| 手感 | 既有毒每次出牌就痛、比例衰減黏一陣 | 蓄力、回合結束轟一下、得一直搧風 |

- **比例衰減＝軟上限**：層數收斂，不會無限爆炸，**不需要硬上限**。毒每 tick 都衰（含出牌）。
- **新狀態延後首次 tick**：打出毒霧／火藥後，敵人先完整顯示本張卡施加的層數；
  下一次成功出牌時才開始滴毒／長火。原本已在敵人身上的狀態仍會在本次出牌正常 tick。
- **掛機殺不死**：tick 只在出牌／回合結束跳，中途放著＝ 0 跳；且每留一回合都得吃一次敵人相位。
- **結算順序**：同體先中毒後燃燒 —— 毒把敵人滴死，燃燒就不再引爆（`resolveStatusTick` 有 `e.alive` 護欄）。
- **UI**：`resolveStatusTick` 回傳 `{ hits, changed }`，core 發 `EVENT.STATUS_TICKED`，
  `FormationView.playStatusTick` 依狀態色跳傷害數字/倒地（`hits`）、只變層數的刷狀態點（`changed`）。
  敵人頭上的狀態點（`EnemySprite`）層數 > 1 會疊上數字。
