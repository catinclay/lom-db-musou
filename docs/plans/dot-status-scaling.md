# 毒霧／火藥：修「即時 tick 混淆」＋ 補上境界/連段成長

> **✅ 2026-07-20 實作完成**：連段最終採「增加獨立施放次數」，不是一次把層數乘上 step。每一波各套用一份境界縮放後層數，並由 UI 延遲重播；火藥後續波改選不同且盡量有敵人的 3×3。

> 實作交接文件（handoff）。背景與確認事項見下；動 core 前先讀 `docs/conventions.md` 的鐵律。

## Context（為什麼要改）

毒霧（中毒）與火藥（燃燒）目前有三個問題，玩家回報且經 code 確認：

1. **打出瞬間馬上 tick 一次，卡面數字對不上。** `playCard` 先套 `effectStatus` 的層數（毒 3），
   隨即在同一次呼叫尾端跑 `statusTick('play')`，把剛上的毒滴掉一次 →
   `decayRate 0.1` 讓 3 立刻掉成 2，敵人身上顯示 2，和卡面「毒 3」不符，很 confuse。
   （火藥則相反，被 play-tick +1 疊成 4，同樣「數字不是卡面值」。）

2. **境界（合成）成長沒實裝。** 兩張卡 `base` 無 `damage`，`defaultRealmScale` 只縮放 damage/armor，
   所以升境界完全不影響毒/火層數。`effectStatus.stacks` 是寫死常數，`applyStatusToHits` 直接讀 `def`。

3. **境界連擊（連段）成長沒實裝。** 連段只乘 `effect.hits`，但這兩張是 AoE（hits=1，靠 target 打整片），
   `applyStatusToHits` 又依 uid 去重，所以連段對「每人層數」毫無作用。

**目標**：讓毒/火的層數隨境界成長，連段像攻擊卡一樣增加獨立施放次數；
並讓剛打出的那張牌自己上的毒/火，當下不被 play-tick 吃掉。

**已與使用者確認**：
- 境界成長用**與攻擊卡完全相同**的 `realmDamageCurve [×1,×1.5,×2.5,×4,×6]`（基礎 3 → 3/5/8/12/18 層）。
- 連段「直接影響次數」＝ 施放 2／3 波；每波各上一次境界縮放後層數。
- 問題一採「延後首次 tick」：本張牌自己上的狀態當回合不 tick，敵人身上直接顯示卡面值。

---

## 修改內容

### A. 讓層數走 `resolveEffect` 管線（境界成長）

**`src/core/Effect.js` — `resolveEffect`（約 61–73 行）**
新增：若 `def.effectStatus`，計算並帶出縮放後層數與狀態 id。
- 境界：`round(baseStacks × realmMultiplier(realm))`（重用既有 `realmMultiplier`，與攻擊卡同曲線）。
- 連段：由既有 `hits × multiplier` 形成多波，單波 `statusStacks` 不再乘 multiplier。
```
if (def.effectStatus) {
  const realmScaled = Math.round(def.effectStatus.stacks * realmMultiplier(realm));
  result.statusId = def.effectStatus.id;
  result.statusStacks = realmScaled;                // 每波層數；連段增加 hits
}
```
（`result` 是 `resolveEffect` 回傳物件；`multiplier` 已是函式參數。）

**`src/core/CardLibrary.js` — 毒霧 `duWu`、火藥 `huoYao`**
保留預設 combo scaling，讓連段乘 `hits` 形成多波。`effectStatus.stacks: 3` 是每波的境界一基礎值。

### B. 出牌時改用縮放後層數，並延後首次 tick（問題一）

**`src/core/BattleState.js` — `playCard`（約 275–308 行）**
兩處合併調整：
1. **改讀 `effect.statusStacks`** 取代 `def.effectStatus.stacks`（原 276–278 行）：
   ```
   if (def.effectStatus) {
     this.applyStatusToHits(combat.hits, def.effectStatus.id, effect.statusStacks, { perWave: true });
   }
   ```
2. **把整個狀態套用區塊（`effectStatus` + 附魔迴圈，原 276–282 行）移到 `statusTick('play')`（原 303 行）之後**，
   讓 play-tick 只推進「既有」狀態，本張牌新上的層數當回合不被 tick。
   移動後順序：resolveAttack →（emit DAMAGE/HIT）→ armor/energy/draw → emit CARD_PLAYED 等
   → `statusTick('play')` → **逐波套用本張的 effectStatus + 附魔** → 清場獎勵／叫陣狀態 → `checkOutcome`。
   - UI 無虞：敵人狀態點靠 `ENEMIES_HIT` 的 `flashAndPop` 延遲 `s.refresh()` 讀當下狀態（`FormationView.js:94`），
     套用是同步、refresh 是延遲，所以會讀到最終層數；純毒/火（無既有狀態）此時 `statusTick` 不發事件、不會有假 tick。

**`src/core/BattleState.js` — `enchantStacks`（同種狀態路徑，約 321–323 行）**
為與卡自身效果一致，同種附魔的基礎改用「境界縮放後」的層數：
```
if (def.effectStatus && def.effectStatus.id === statusId) {
  return resolveEffect(def, realm, 1).statusStacks * level;  // 隨境界縮放後 × level
}
```
（原本 `def.effectStatus.stacks * level` 不吃境界；此調整讓附魔也跟著境界長，屬一致性修正。）

### C. 卡面數字顯示縮放後層數

**`src/core/Effect.js` — `cardFaceValue`（約 99–103 行）**
純狀態卡改顯示 `resolveEffect(def, realm, 1).statusStacks`（境界縮放、連段=1，與攻擊卡「卡面不含連段」一致），
取代目前寫死的 `def.effectStatus.stacks`。這樣升境界卡面會從 3 變 5/8/12/18。

### D. 文件同步

更新 `docs/systems/status.md` 與 `docs/systems/merge.md`／`combo.md` 相關敘述：
- 毒/火單波層數**隨境界（realmDamageCurve）成長**；連段增加多波施放，不再只改一個總層數。
- 問題一：本張牌自己上的狀態「當回合不 tick」，play-tick 只推進既有狀態。
- `CardLibrary.js` 內 `duWu`/`huoYao` 註解中「定額、不隨傷害縮放」等敘述一併更正。

---

## 原計畫後的規格修正

- `realmDamageCurve` 與中毒公式維持不動。
- 燃燒曾出現每層兩倍傷害，已將 `tuning.combat.status.burn.detonateDamage` 修正為每層 1 傷。
- 連段改成多波後，純狀態卡改以 `wave + uid` 去重，讓同一敵人每波各吃一次狀態。
- 火藥 AoE 選位配合多波調整：第一擊保留舊規則；後續擊不可完全同位，並優先挑有敵人的範圍。

---

## 驗證

1. **單元測試（Node，core 零 Phaser）**：已跑完整測試套件確認無回歸（見 `docs/conventions.md` 的指令）。
   新增／擴充針對：
   - `resolveEffect(duWu, realm, step)`：realm 1→5 的單波 `statusStacks` = 3/5/8/12/18；step 2/3 時 `hits` = 2/3。
   - `cardFaceValue(duWu, realm)`：文字隨境界顯示 3/5/8/12/18。
   - `BattleState.playCard` 打毒霧後，命中敵人 `statuses.poison === statusStacks`（**未被 play-tick 衰減**）；
     再打第二張牌時，前一張的毒才開始 tick。
   - 火藥同理：命中後 `statuses.burn === statusStacks`，當回合不 +1。
   - 2026-07-20 結果：**13 個測試檔、304 項測試全數通過；production build 成功**。
2. **後續實機試玩重點**：進戰鬥，出毒霧確認敵人頭上顯示 3（不是 2）；升境界後卡面與敵人層數同步變大；
   境界遞增連段出牌時動畫與施加確實分成多波；火藥後續波不與前一波完全重疊；回合結束毒/火照常結算。

## 關鍵檔案

- `src/core/Effect.js`（resolveEffect 帶出 statusStacks、cardFaceValue 顯示）
- `src/core/CardLibrary.js`（duWu/huoYao 使用預設多波 combo、註解更正）
- `src/core/BattleState.js`（playCard 改讀 statusStacks＋延後套用、enchantStacks 同步縮放）
- `docs/systems/status.md`、`docs/systems/combo.md`、`docs/systems/merge.md`（敘述同步）
