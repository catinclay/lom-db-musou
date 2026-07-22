/**
 * 劇本（transcript）的事件字彙。
 *
 * core 同步解算完一整輪之後產出一份有序事件陣列，UI 拿去當劇本播。
 * 邏輯在第 0 毫秒就定案，動畫只是說故事 —— 這是連鎖合成不會與狀態打架的根本原因。
 */
export const TX = {
  DRAW: 'draw',
  /** 靈感滿格但牌庫與棄牌堆都空。 */
  DRAW_FIZZLE: 'draw_fizzle',
  MERGE: 'merge',
  DISCARD: 'discard',
  /** 卡片在本場戰鬥中消耗，不會進棄牌堆。 */
  EXHAUST: 'exhaust',
  /** 忘形施放到具體牌：舊實例換成升階後的新 uid。 */
  RANK_UP: 'rank_up',
  /** 靈感增加一點；滿 threshold 時該事件後緊接一個抽牌事件。 */
  INSPIRATION: 'inspiration',
  /** 防護網被觸發 ＝ 有 bug，正常遊戲永遠不該出現 */
  CHAIN_GUARD_TRIPPED: 'chain_guard_tripped',
};
