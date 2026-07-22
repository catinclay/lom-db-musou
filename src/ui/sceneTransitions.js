import { TUNING } from '../config/tuning.js';

const FADE_OUT_COMPLETE = 'camerafadeoutcomplete';

function transitionColor() {
  const color = TUNING.anim.sceneTransition.color;
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

/**
 * Scene 建好後由墨色淡入。Camera effect 不改 core 狀態，也不參與遊戲邏輯。
 */
export function transitionIn(scene) {
  // Phaser 會重用 Scene 實例；離場旗標必須在每次重新進場時歸零。
  scene.__sceneTransitioning = false;
  scene.input.enabled = true;
  const [r, g, b] = transitionColor();
  scene.cameras.main.fadeIn(TUNING.anim.sceneTransition.fadeIn, r, g, b);
}

/**
 * 統一 Scene 出口：鎖住來源場景輸入，淡出完成後才真正 start 目標 Scene。
 * 回傳 false 表示轉場已在進行，可安全忽略連點或 Enter／滑鼠同時觸發。
 */
export function transitionTo(scene, key, data) {
  if (scene.__sceneTransitioning) return false;
  scene.__sceneTransitioning = true;
  scene.input.enabled = false;

  const [r, g, b] = transitionColor();
  const camera = scene.cameras.main;
  camera.once(FADE_OUT_COMPLETE, () => scene.scene.start(key, data));
  camera.fadeOut(TUNING.anim.sceneTransition.fadeOut, r, g, b);
  return true;
}
