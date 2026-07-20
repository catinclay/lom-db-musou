# 架構：core / UI 分層 ＋ 劇本（transcript）

> 這是整個程式的骨架。理解這頁，後面的一切都好懂。
> 檔案落點見 [file-map.md](file-map.md)；不變量與慣例見 [conventions.md](conventions.md)。

整個程式的骨架就這一句話：

> **core 在第 0 毫秒把整條連鎖同步算完，產出一份有序事件陣列（transcript／劇本），
> 交給 UI 慢慢「重播」成動畫。邏輯與動畫徹底分離。**

這是連鎖合成不會「動畫與狀態打架」的根本原因。

```
   玩家操作 / debug 按鈕
          │
          ▼
   ┌──────────────┐   同步、瞬間完成      ┌───────────────┐
   │  core (純 JS) │ ───────────────────▶ │  transcript    │  有序事件陣列
   │  零 Phaser    │   算完整條連鎖         │  (劇本)        │  DRAW/MERGE/…
   └──────────────┘                      └───────┬───────┘
          │ 也發 EVENT.*（傷害、護甲…）                  │
          ▼                                          ▼
   ┌──────────────┐                      ┌───────────────┐
   │  UI 事件訂閱   │◀──── EventBus ──────│  MergeAnimator │  照劇本逐格 tween
   │ (BattleScene) │                      │  播放、鎖輸入    │
   └──────────────┘                      └───────┬───────┘
                                                  ▼
                                         畫面（HandView / CardSprite）
```

- **core**（`src/core/`）：零 Phaser 依賴，可在 Node 測試裡跑數字。對外只發事件、回傳劇本。
- **UI**（`src/ui/`、`src/scenes/`）：認識 Phaser，訂閱事件、把劇本演成動畫。
- **設定**（`src/config/tuning.js`）：所有平衡與手感數值的**唯一來源**。

---

## 資料流：一次忘形合成的完整旅程

```
玩家拖箭頭把 A 併到 B
   → DragController.handleDragEnd 判定 mode = MERGE
   → BattleScene.formlessMerge
      → BattleState.formlessMerge
         → MergeEngine.applyFormlessMerge   ← 忘形合成，境界相加
            → 接著 resolveAutoMerges         ← 可能引爆同名同境界連鎖
         → 回傳 transcript（整條連鎖一次算完）
      → runTranscript → MergeAnimator.play（排進佇列）
         → 逐格演出 MERGE/DRAW…，播放期間鎖輸入
         → 播完 syncTo 對齊 core 權威手牌
```
