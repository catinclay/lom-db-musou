import { CARD_COLORS } from './format.js';
import { TUNING } from '../config/tuning.js';

/** 卡面底圖預先烘成貼圖，避免大量可縮放 Graphics。 */
const W = TUNING.hand.cardWidth;
const H = TUNING.hand.cardHeight;
const RADIUS = 10;

export const cardTextureKey = (type) => `card-${type}`;
export const HIGHLIGHT_KEY = 'card-highlight';

function bake(scene, key, draw, w, h) {
  if (scene.textures.exists(key)) return;
  const g = scene.add.graphics();
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

/** 在場景 create() 最前面呼叫一次。 */
export function ensureCardTextures(scene) {
  for (const [type, colors] of Object.entries(CARD_COLORS)) {
    bake(
      scene,
      cardTextureKey(type),
      (g) => {
        g.fillStyle(colors.fill, 1);
        g.fillRoundedRect(0, 0, W, H, RADIUS);
        g.lineStyle(2, colors.border, 1);
        g.strokeRoundedRect(1, 1, W - 2, H - 2, RADIUS);
      },
      W,
      H
    );
  }

  const pad = 6;
  bake(
    scene,
    HIGHLIGHT_KEY,
    (g) => {
      g.lineStyle(5, 0xffffff, 1);
      g.strokeRoundedRect(2.5, 2.5, W + pad * 2 - 5, H + pad * 2 - 5, RADIUS + 3);
    },
    W + pad * 2,
    H + pad * 2
  );
}
