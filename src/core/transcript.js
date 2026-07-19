/**
 * 劇本（transcript）的事件字彙。
 *
 * core 同步解算完一整輪之後產出一份有序事件陣列，UI 拿去當劇本播。
 * 邏輯在第 0 毫秒就定案，動畫只是說故事 —— 這是連鎖合成不會與狀態打架的根本原因。
 */
export const TX = {
  DRAW: 'draw',
  /** 補抽的機率骰輸了（牌庫還有牌，只是沒抽成） */
  DRAW_MISS: 'draw_miss',
  /** 骰贏了但牌庫與棄牌堆都空 —— 與 DRAW_MISS 是兩回事，演出也不同 */
  DRAW_FIZZLE: 'draw_fizzle',
  MERGE: 'merge',
  DISCARD: 'discard',
  /** 防護網被觸發 ＝ 有 bug，正常遊戲永遠不該出現 */
  CHAIN_GUARD_TRIPPED: 'chain_guard_tripped',
};
