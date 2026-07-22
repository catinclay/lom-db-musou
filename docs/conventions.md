# 關鍵不變量與慣例（改動時別踩）

> 架構背景見 [architecture.md](architecture.md)。這些是動 code 時最容易踩雷的地方。

1. **core 零 Phaser 依賴。** `src/core/` 任何檔案都不准 `import phaser`。它要能在 Node 測試裡跑。
   對外只透過 `EventBus` 發事件、或回傳 transcript。

2. **卡牌實例視為不可變。** 合成永遠產出**新 uid** 的新物件，不就地改寫舊卡
   （見 `Card.js` 的 `mergeCards`）。因此 transcript 裡放卡牌參照是安全的。

3. **邏輯一次算完，UI 只重播。** 別把合成邏輯搬進動畫、也別讓動畫回頭改 core 狀態。
   新的可演出事件：先在 `transcript.js` 加 `TX.*`，core 產生它，再到 `MergeAnimator` 加對應演出。

4. **tween 一定要用 `ui/tweens.js` 的 `tweenTo` / `stopTweensOf`，不要用 Phaser 原生的
   `killTweensOf` 或自刻 `new Promise(onComplete)`。**
   陷阱：Phaser 4 的 `tweens.killTweensOf()` 走 `Tween.destroy()`，會清掉 callbacks 且**不發任何收尾事件**——
   被它砍掉的 tween，正在 `await` 它的演出會**永遠醒不過來**（畫面鎖死）。
   `stopTweensOf` 改用 `tween.stop()`（會發 `onStop`），`tweenTo` 同時掛 `onComplete` 與 `onStop`，
   保證 promise 一定會 settle。

5. **`HandView.order` 鏡像 core `Hand` 的順序**，包含連鎖過程中每個中間狀態。
   演出若中途飄掉，`syncTo()` 會強制對齊 core 的權威狀態——它是最後的安全網，畫面永不該與 core 不一致。

6. **手牌順序有意義。** 合成採「最左配對優先」，結果卡落在較左的位置。index 不是裝飾。

7. **演出打斷 vs 排隊：**`MergeAnimator` 的多份劇本會**排隊依序播完**，彼此不打斷。
   只有「重開戰鬥」該作廢舊演出，走 `MergeAnimator.reset()`（推進 generation）。
   一般抽牌/合成不推進 generation。

8. **抽牌批次化在「送進 core 之前」。** 連點抽牌先在 `BattleScene` 累積張數，
   短窗口後一次 `debugDraw(n)`——一口氣抽完再解算整條連鎖。
   真正的「抽 N 張」卡效同理：`drawCards(N)` 後 `resolveAutoMerges` 一次，天然就是一份批次劇本。

9. **亂數要可注入。** 需要隨機的地方吃 `rng`（預設 `Math.random`），測試用 `seededRng` 重現。

10. **整局遊玩入口只有 `GameSession.dispatch`。** Scene 不直接呼叫 `RunState`／`BattleState` 的規則方法，
    不自行串 DoT→敵方相位→下一回合，也不決定戰後去哪裡。新增遊玩操作時先加 `GAME_ACTION` 與可序列化
    `snapshot()`，再讓 UI 重播 action result；如此 Node bot 與真人畫面永遠走同一套規則。

---

## 指令與測試

```bash
npm run dev     # webpack dev server，開瀏覽器看沙盒
npm run build   # production build 到 dist/
npm test        # vitest 跑一次（core 邏輯與 HandLayout 有單元測試）
npm run test:watch
```

測試集中在**可純數字驗證**的部分：合成連鎖、境界／連擊、效果解算、扇形佈局。
動畫與 Phaser 互動不寫單元測試——那些靠 `npm run dev` 用眼睛驗。
