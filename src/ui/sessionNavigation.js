import { GAME_PHASE } from '../core/GameSession.js';
import { transitionTo } from './sceneTransitions.js';

const SCENE_BY_PHASE = Object.freeze({
  [GAME_PHASE.JOURNEY]: 'RunMap',
  [GAME_PHASE.EVENT]: 'Event',
  [GAME_PHASE.SHOP]: 'Shop',
  [GAME_PHASE.SLOT]: 'Slot',
  [GAME_PHASE.BATTLE]: 'Battle',
  [GAME_PHASE.RUN_END]: 'Base',
});

/** 呈現層唯一的 phase → Phaser Scene 對照。core 不知道 Scene 名稱。 */
export function sceneForPhase(phase) {
  return SCENE_BY_PHASE[phase] ?? null;
}

export function transitionToSessionPhase(scene, session) {
  const key = sceneForPhase(session.phase);
  if (!key) return false;
  return transitionTo(scene, key, { session, run: session.run });
}
