/**
 * 敵人與主角的剪影貼圖，預先烘一次。
 *
 * 敵人烘成白色剪影，之後用 setTint 上敵種顏色 —— 縮放（透視）時穩定又快，
 * 一次二三十個也撐得住。主角是肩後前景，烘成深色背影。
 */

export const ENEMY_TEX = 'enemy-silhouette';
export const PLAYER_TEX = 'player-back';

const EW = 100;
const EH = 150;

function bakeEnemy(scene) {
  if (scene.textures.exists(ENEMY_TEX)) return;
  const g = scene.add.graphics();
  // 白色，好讓 tint 上色。正面朝主角的粗略人形：頭 + 肩 + 身。
  g.fillStyle(0xffffff, 1);
  g.fillCircle(EW / 2, 26, 22); // 頭
  g.fillRoundedRect(EW / 2 - 40, 44, 80, 40, 16); // 肩
  g.fillRoundedRect(EW / 2 - 30, 74, 60, EH - 74, 12); // 身
  g.generateTexture(ENEMY_TEX, EW, EH);
  g.destroy();
}

const PW = 420;
const PH = 380;

function bakePlayer(scene) {
  if (scene.textures.exists(PLAYER_TEX)) return;
  const g = scene.add.graphics();
  // 深色背影：後腦 + 一大片肩背，佔住左下前景
  g.fillStyle(0x120d0a, 1);
  g.fillCircle(PW / 2, 120, 76); // 後腦
  g.fillRoundedRect(30, 190, PW - 60, PH - 190, 60); // 肩背
  // 一道暖色描邊，讓輪廓從暗背景裡浮出來
  g.lineStyle(4, 0x3a2a1e, 1);
  g.strokeCircle(PW / 2, 120, 76);
  g.strokeRoundedRect(30, 190, PW - 60, PH - 190, 60);
  g.generateTexture(PLAYER_TEX, PW, PH);
  g.destroy();
}

/** 在場景 create() 呼叫一次 */
export function ensureEnemyTextures(scene) {
  bakeEnemy(scene);
  bakePlayer(scene);
}
