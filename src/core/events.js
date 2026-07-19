/**
 * core → UI 的事件名。
 * core 不認識 Phaser，只發事件；UI 訂閱後負責演出。
 */
export const EVENT = {
  BATTLE_STARTED: 'battle:started',
  TURN_STARTED: 'turn:started',
  TURN_ENDED: 'turn:ended',

  /** 一整條合成連鎖解算完成，payload 是 transcript（劇本） */
  TRANSCRIPT: 'transcript',

  CARD_PLAYED: 'card:played',
  CARD_PLAY_REJECTED: 'card:play_rejected',

  DAMAGE_DEALT: 'damage:dealt',
  ARMOR_GAINED: 'armor:gained',
  ENERGY_CHANGED: 'energy:changed',
  COMBO_CHANGED: 'combo:changed',

  /** 玩家攻擊命中敵人，payload { target, hits:[{uid,damage,killed}], combo } */
  ENEMIES_HIT: 'enemies:hit',
  /** 異常狀態跳動，payload { phase:'play'|'turnEnd', hits:[{uid,damage,killed,status}], changed:[uid] } */
  STATUS_TICKED: 'status:ticked',
  /** 回合結束敵人前進，payload { formation } */
  ENEMIES_ADVANCED: 'enemies:advanced',
  /** 接觸的敵人攻擊主角，payload { damage, blocked, hp } */
  PLAYER_HIT: 'player:hit',

  /** 這場戰鬥打贏了（敵陣清空且無補充波），payload { state } */
  BATTLE_WON: 'battle:won',
  /** 這場戰鬥打輸了（主角血量歸零），payload { state } */
  BATTLE_LOST: 'battle:lost',
};

/** 最小事件匯流排。core 是純 JS，不借 Phaser 的 EventEmitter。 */
export class EventBus {
  constructor() {
    this.handlers = new Map();
  }

  on(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event).add(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    this.handlers.get(event)?.delete(fn);
  }

  emit(event, payload) {
    const set = this.handlers.get(event);
    if (!set) return;
    // 複製一份再跑，避免 handler 在迴圈中退訂造成漏發
    for (const fn of [...set]) fn(payload);
  }

  clear() {
    this.handlers.clear();
  }
}
