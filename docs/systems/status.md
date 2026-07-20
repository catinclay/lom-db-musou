# 異常狀態（DoT，改數值前先讀懂）

> 相關：[combat](combat.md)（怎麼上狀態）、[merge](merge.md)（附魔如何放大狀態層數）。
> 檔案責任見 [../file-map.md](../file-map.md)。

中毒/燃燒是 DoT，靠**兩種節拍的 tick** 發作（不走 transcript —— 敵陣本來就是即時結算＋發事件）：

- **出牌小 tick**：每成功出一張牌（`playCard` 尾端呼叫 `statusTick('play')`）＝ 流逝一格時間。
- **回合結束大 tick**：`endTurnFlow` 在敵人前進**之前**呼叫 `statusTurnEnd()`，讓 DoT 先收割。

兩種狀態的性格（數值都在 `tuning.combat.status`，邏輯在 `StatusLibrary.resolveStatusTick`）：

| | 中毒（即時流血、比例衰減） | 燃燒（蓄力引爆）|
|---|---|---|
| 每個 tick | 滴 `N × damagePerStack` 傷，**造成傷害後衰減 `decayRate` 比例層（最少 1）** | （出牌）火自己 +`growthRate` 比例層（最少 1，**不掉血**）|
| 出牌小 tick | 就是 1 個 tick（滴＋衰） | 疊層（見上）|
| 回合結束大 tick | 連跑 `turnEndTicks`（3）個 tick，**先算好總傷與最終層數，畫面只跳一次數字**（免太亂）| 依層數引爆（每層 `detonateDamage`）後**快衰**（只留 `decayKeep` 比例）|
| 手感 | 當下就痛、比例衰減黏一陣 | 蓄力、回合結束轟一下、得一直搧風 |

- **比例衰減＝軟上限**：層數收斂，不會無限爆炸，**不需要硬上限**。毒每 tick 都衰（含出牌）。
- **掛機殺不死**：tick 只在出牌／回合結束跳，中途放著＝ 0 跳；且每留一回合都得吃一次敵人相位。
- **結算順序**：同體先中毒後燃燒 —— 毒把敵人滴死，燃燒就不再引爆（`resolveStatusTick` 有 `e.alive` 護欄）。
- **UI**：`resolveStatusTick` 回傳 `{ hits, changed }`，core 發 `EVENT.STATUS_TICKED`，
  `FormationView.playStatusTick` 依狀態色跳傷害數字/倒地（`hits`）、只變層數的刷狀態點（`changed`）。
  敵人頭上的狀態點（`EnemySprite`）層數 > 1 會疊上數字。
