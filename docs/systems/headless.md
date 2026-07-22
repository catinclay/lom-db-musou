# 無頭遊玩與呈現解耦

`GameSession` 是整局遊戲的純 JavaScript 流程控制器。它持有 `RunState` 與目前的 `BattleState`，但不認識 Phaser、Scene、camera、tween 或真實時間。

同一套 API 有兩個呼叫者：

- Phaser Scene：把點擊／拖曳轉成 action，再重播回傳的 transcript、命中資料與拉霸結果。
- 平衡 bot：在 Node 測試中反覆呼叫 `dispatch()`，不建立 canvas、不等待動畫。

## 最小用法

```js
import { GameSession, GAME_ACTION } from './src/core/GameSession.js';
import { seededRng } from './src/core/rng.js';

const game = new GameSession({ rng: seededRng(42) });

while (game.snapshot().phase !== 'runEnd') {
  const state = game.snapshot();
  const action = policy(state); // AI／規則 bot 只看純資料 snapshot
  const result = game.dispatch(action);
  if (!result.ok) throw new Error(result.reason);
}
```

action 可傳字串加 payload，或單一物件：

```js
game.dispatch(GAME_ACTION.CHOOSE_OFFER, { index: 1 });
game.dispatch({ type: GAME_ACTION.PLAY_CARD, uid: 'c12' });
game.dispatch({ type: GAME_ACTION.PUMP_CARD, wangxingUid: 'c3', targetUid: 'c8' });
game.dispatch(GAME_ACTION.END_TURN);
```

## phase 與 action

| phase | 可用 action |
|------|-------------|
| `journey` | `chooseOffer`、`callBoss` |
| `event` | `chooseEvent`；立即結果完成後為 `continueEvent` |
| `shop` | 依設施開放：客棧 `rest`；商販 `buyCard`/`buyRelic`；武館 `removeCard`；賭坊 `enterSlot`；皆可 `leaveShop` |
| `slot` | `spinSlot`、`leaveSlot` |
| `battle` | `playCard`、`pumpCard`、`endTurn`；清場可叫陣時另有 `challengeWave` |
| `runEnd` | 無；由呼叫端結算 meta 或建立下一個 session |

以 `snapshot().actions` 為準；同為 `shop` phase 的四種設施也只列出自己的 action。錯誤 phase／設施的 action 會回 `{ ok:false, reason:'action_not_available' }`，不改狀態。

## 同步結算原則

每次 `dispatch()` 都在回傳前完成邏輯：

- `playCard` 在 core 內先完成連擊突破／中斷、效果與卡牌去向；成功結果的 transcript 以 `DISCARD` 或 `EXHAUST` 起頭，再接該牌造成的抽牌／合成。
- `pumpCard` 會立即消耗忘形、產生新 uid 的升階牌、把升階計入一次合成並增加 2 點靈感，再接自動合成；回傳順序為 `EXHAUST`、`RANK_UP`、`INSPIRATION`、滿格抽牌、後續合成鏈。
- `endTurn` 一次完成回合末 DoT、敵方相位、勝負判定與（若仍在戰鬥）下一回合起手，並把各段結果分欄回傳給 UI 重播。
- `spinSlot` 立即扣代幣並套用獎勵；`reels`／`reward` 只是轉輪動畫的劇本，動畫不得再次套獎勵。
- 戰鬥勝負由 session 呼叫 `run.finishBattle`，設定下一個 phase；Scene 不再自行判斷應回地圖、進拉霸或回據點。

`ui/sessionNavigation.js` 是唯一知道 phase 對應哪個 Phaser Scene 的地方。改畫面結構不應修改 core；改遊玩流程也不應在 Scene 裡新增規則分支。

## 平衡測試

固定 seed 能重現整局。大量模擬時，每一步只保存需要的 `snapshot()` 欄位與 action，最後聚合通關率、血量、牌組、時辰數與戰鬥回合數即可。選項導演的保底、去重、客棧頻率與有限救濟測試見 `test/core/OfferDirector.test.js`；整局 action 入口見 `test/core/GameSession.test.js`。
