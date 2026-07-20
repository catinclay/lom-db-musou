# 連段怎麼加成（改卡前先讀懂）

> 相關：[combat](combat.md)（連段多波怎麼重選目標）、[merge](merge.md)（境界怎麼長）。
> 檔案責任見 [../file-map.md](../file-map.md)。

依境界數字由小到大遞增出牌就累積連段（`ComboTracker`，step 從 1 起）。連段對效果的加成**分兩類**：

- **攻擊牌 ＝ 加「次數」**（不是加每發傷害）。`comboScale` 預設把 `effect.hits` 乘上 step：
  - 暗器：3 → 6 → 9 發（散射多釘幾人）。
  - 劈砍 / 貫 / 崩山：1 → 2 → 3 **波**，每波在 `combat.js` **重新選一次目標**再打
    （劈砍重選最近排、貫重選最人多的一路），所以動畫也會**演多次**（劈砍兩次）。
  - 崩山的**擊退**也逐波施加（`resolveAttack` 收 `knockback`，打完一波推一波）。
  - 每發標 `wave`，`FormationView` 依 wave 分波錯開劈痕與傷害數字。
- **功能牌 ＝ 加法 `+（step−1）`**（不是乘）。抽牌 / 內力用 `CardLibrary` 的 `comboAdd`：
  第一張不加、第二張 +1、第三張 +2……。例：臨機應變境界三抽 4，在連段第三張出 ⇒ 抽 6。

`comboScale(effect, multiplier)` 的 `multiplier` ＝ `comboMultiplier(step)` ＝ step（見 `tuning`），
攻擊牌拿它當乘數、功能牌拿它當 `step` 做加法。攻擊牌大多不必寫 `comboScale`，走 `Effect.js` 的預設（乘 hits）。
