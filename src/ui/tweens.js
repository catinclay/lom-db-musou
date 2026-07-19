/**
 * Tween 的 Promise 化。
 *
 * 演出整條是 await 串起來的（見 MergeAnimator），所以這裡只有一條鐵律：
 * **promise 一定要 settle**。正常播完要 settle，被中途接手停掉也要 settle。
 * 少 settle 一次，await 的人就永遠醒不過來 —— 手牌鎖在 interactive = false，
 * 玩家連拖都拖不動，整個畫面就這麼卡死。
 */

/**
 * 建一條 tween，回傳它結束時 resolve 的 promise。
 * 播完（onComplete）與被 stopTweensOf 停掉（onStop）都算結束。
 */
export function tweenTo(scene, config) {
  return new Promise((resolve) => {
    scene.tweens.add({ ...config, onComplete: resolve, onStop: resolve });
  });
}

/**
 * 停掉目標身上還在跑的 tween，讓新的 tween 接手。
 *
 * 不可以改用 scene.tweens.killTweensOf() —— 它走的是 Tween.destroy()，
 * 會把 callbacks 直接清成 null 又 removeAllListeners()，連 onStop 都不發。
 * 被它砍掉的 tween，tweenTo 的 promise 就此石沉大海（這正是忘形合成整個
 * 卡死的原因）。stop() 會發 onStop，且停掉的 tween 之後不再改動目標，
 * 該有的效果一樣不少。
 */
export function stopTweensOf(scene, target) {
  for (const tween of scene.tweens.getTweensOf(target)) tween.stop();
}
