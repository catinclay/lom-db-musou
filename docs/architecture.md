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
   │  零 Phaser    │   算完整條連鎖         │  (劇本)        │  DRAW/MERGE/DISCARD/EXHAUST/…
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

## 整局流程：GameSession action 邊界

`GameSession` 是 `RunState` 與 `BattleState` 上方的純 JS 流程控制器。玩家畫面與平衡 bot 都呼叫同一個 `dispatch(action)`：

```
玩家輸入 / AI policy
        │ action
        ▼
GameSession.dispatch ──▶ RunState / BattleState / slot
        │ 同步完成規則、設定下一個 phase
        ├── snapshot() ──▶ AI（純資料，不需 Phaser）
        └── result ──────▶ Scene（只重播 transcript／命中／轉輪）
```

- Scene 不直接呼叫 `takeOffer`、`finishBattle`、`enemyPhase` 或 `applySlotReward`，也不判斷下一站。
- `OfferDirector` 在 core 內編排每個時辰的三選一；風險／功能標籤只供規則選池，Scene 不據此顯示明牌提示。
- `ui/sessionNavigation.js` 才把 core phase 對應為 Phaser Scene；core 不知道 Scene 名稱。
- 回合結束與拉霸都在 action 回傳前完成邏輯，動畫永遠不能延後或重複修改狀態。

完整 action API 與無頭範例見 [systems/headless.md](systems/headless.md)。

---

## 資料流：一次忘形升階的完整旅程

```
玩家把忘形拖到具體牌 B
   → DragController.handleDragEnd 判定 mode = PUMP
   → BattleScene.pumpCard
      → GameSession.dispatch(PUMP_CARD)
         → BattleState.pumpCard
         → MergeEngine.applyWangxingPump    ← B 階級 +1、忘形本場消耗
            → 增加 2 點靈感                 ← 升階本身算一次合成
               → 每滿 3 點立即抽一張
            → 接著 resolveAutoMerges         ← 可能引爆同名同階級連鎖
         → 回傳 transcript（整條連鎖一次算完）
      → runTranscript → MergeAnimator.play（排進佇列）
         → 逐格演出 EXHAUST/RANK_UP/INSPIRATION/DRAW/MERGE…，播放期間鎖輸入
         → 播完 syncTo 對齊 core 權威手牌
```

一般出牌也走相同原則：core 先把牌移到棄牌堆或 `exhaustPile`，再把 `DISCARD`／`EXHAUST` 放在該次 action 的 transcript 開頭。UI 不自行猜去向；棄牌飛向棄牌堆，消耗牌原地上浮、縮小並淡出，後續抽牌與合成依劇本順序播放。
