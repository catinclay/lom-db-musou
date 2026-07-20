# 合成規則（改平衡前先讀懂）

> 相關：[combat](combat.md)（招式鎖定怎麼吃附魔）、[combo](combo.md)（連段）、[status](status.md)（附魔上的 DoT）。
> 檔案責任見 [../file-map.md](../file-map.md)；改東西的入口見 [../changing-things.md](../changing-things.md)。

現行合成是**同階才能併**（類似 2048）：

- **境界軸**：兩張要**同境界**才能合成（劈一＋劈一→劈二，但劈二＋劈一**不**合成）。
- **合成結果境界只 +1**（不是相加）：兩張境界 N → 一張境界 N+1。
- **境界上限**（`tuning.maxRealm`，預設 5）：**擋下合成**而非合成後夾住 —— 到頂的牌不再併（兩張境界五不合成，忘形也吃不動境界五）。判定在 `MergeEngine.atRealmCap`。
- **數值隨境界成長，但曲線逐卡可換**：傷害/護甲**預設**吃 `tuning.realmDamageCurve`（索引＝境界−1，預設 `[1, 1.5, 2.5, 4, 6]`＝100/150/250/400/600%，高境界回報遞增；帶小數故每發**取整**）。功能牌（內力、抽牌）刻意走**線性**（`GROWTH.linear`/`step`），否則境界一升就強度爆炸（運氣調息境界三只 +3、臨機應變境界三只抽 4）。
- **名字軸**：正常只能**同名**合成。

兩種卡：

| 卡種 | 是什麼 | 合成行為 |
|------|--------|---------|
| 普通卡 | 具體 defId ＋ 境界 | 只跟「同名同境界」的卡自動合成，結果境界 +1。 |
| 忘形催化劑（`wangXing`） | 獨立卡，**不帶境界**（realmless）、無戰鬥數值、不能出牌 | 拖到**任一張**牌上（同名/跨名皆可），讓那張牌**境界 +1**，並把**忘形附魔印進**那張牌（見下「附魔」）。不改名、不參與自動合成。 |

- **自動合成**（`resolveAutoMerges` / `findFirstAutoMergePair`）：同 defId ＋ 同 realm，realmless 排除。結果 realm ＝ **主體境界 +1**。
- **玩家拖曳合成**（`applyFormlessMerge`）：`canFormlessMerge` 判定，`pickBodyMaterial` 分主體/材料。
- **忘形＝跨境界催化劑**（`MergeEngine.isCatalyst` ＝ realmless 或帶忘形 tag）：帶忘形的具體卡當材料時
  **無視境界差、跨名**、把對方 **+1**、自己被消耗、附魔倒進對方（例：境界四忘形卡拖到境界一 → 境界二）。
  主體境界基準取「非催化劑那張」，材料的境界不算數。忘形 tag 取聯集**一律保留**（不佔上限、可持續跨名）。

## 「卡片自身效果」 vs 「附魔」（兩回事，別混）

- **卡片自身狀態效果**：卡定義的 `effectStatus: { id, stacks }`（毒霧的毒、火藥的火）。`stacks` 是境界一
  基礎值；每波層數吃 `realmDamageCurve`（基礎 3 → 3/5/8/12/18），連段增加施放波數。效果綁 defId，
  **不進 enchants、不佔上限、不隨合成轉移**。這兩張已**移除直接傷害**（`base` 無 `damage`），純上狀態。
- **附魔（enchants）**：**外加**的魔（拉霸/商店/事件/合成而來），實例層資料 `card.enchants = { 狀態id: level }`。
  存的是 **level**（不是層數）；合成時匯總兩張、受**上限** `tuning.enchantCap(realm)`＝2^(境界−1) 約束，
  超過就展開成單位隨機篩到上限（`Card.combineEnchantsCapped`，吃 rng）。level-2 ＝ 2 個單位，算兩格。

**附魔實際上幾層是出牌時「按傷害動態算」**（`BattleState.playCard`）：

```
層數 = round( 卡每發「基礎傷」 × def.enchantScale × level )
```

實際層數由 `BattleState.enchantStacks(def, realm, statusId, level)` 算，三條路（由專到泛）：
1. 卡自訂 `def.enchantStacks(id, level, ctx)` —— 完全客製。
2. 附魔與卡自身 `effectStatus` **同種**（如毒霧的毒附魔）：**放大自身效果** ＝
   `境界縮放後的 statusStacks × level`（附魔本身不吃連段；疊在卡自身效果之上，level1 ⇒ 共 2 倍、
   level2 ⇒ 3 倍…），解決「無傷害卡裝不了附魔」。
3. 一般傷害卡：`round(每發基礎傷 × enchantScale × level)`。基礎傷 ＝ `resolveEffect(def, realm, 1).damage`，
   吃**境界**、不吃連段/暫時 buff。`enchantScale` 每卡自訂（貫 0.15 > 橫劈 0.08；單體未來約 0.2），沒寫走 `tuning.combat.enchantScaleDefault`。

卡面左緣彩色小點（`CardSprite.refreshEnchants`）顯示附魔的顏色與 level。

出牌時會先 tick 敵人身上的既有狀態，再套用本張牌的自身狀態與附魔；因此剛施加的層數當次不會立刻衰減
或成長，敵人頭上會先顯示與卡面一致的完整層數。
