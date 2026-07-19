import { MetaState } from '../core/MetaState.js';

/**
 * 跨 run 據點狀態的持久化（localStorage）。這是渲染層才有的事 —— core/MetaState 保持零瀏覽器依賴。
 * 讀不到/壞掉就回全新 MetaState（第一次玩、或清了存檔）。
 */
const KEY = 'lom-db-musou:meta:v1';

export function loadMeta() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    return new MetaState(raw ? JSON.parse(raw) : {});
  } catch {
    return new MetaState();
  }
}

export function saveMeta(meta) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(meta.toJSON()));
  } catch {
    /* 存不了就算了（無痕模式等），不影響遊玩 */
  }
}
