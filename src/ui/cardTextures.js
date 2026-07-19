import { CARD_COLORS, FORMLESS_COLOR } from './format.js';
import { TUNING } from '../config/tuning.js';

/**
 * 卡面底圖預先烘成貼圖，而不是每張牌掛一個活的 Graphics。
 *
 * 原因：Graphics 是每幀重跑一次填色路徑的，塞在會被縮放／旋轉的 Container 裡
 * 容易出現填色與形狀跑掉。烘成貼圖之後每張牌就只是一個貼圖四邊形，
 * 縮放旋轉都由 GPU 處理，既穩定又快 —— 連鎖爆抽時畫面上可能有二三十張牌。
 */

const W = TUNING.hand.cardWidth;
const H = TUNING.hand.cardHeight;
const RADIUS = 10;

export const cardTextureKey = (type, formless) => `card-${type}${formless ? '-formless' : ''}`;
export const HIGHLIGHT_KEY = 'card-highlight';

function bake(scene, key, draw, w, h) {
  if (scene.textures.exists(key)) return;
  const g = scene.add.graphics();
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

/** 在場景 create() 最前面呼叫一次 */
export function ensureCardTextures(scene) {
  for (const [type, colors] of Object.entries(CARD_COLORS)) {
    for (const formless of [false, true]) {
      bake(
        scene,
        cardTextureKey(type, formless),
        (g) => {
          g.fillStyle(colors.fill, 1);
          g.fillRoundedRect(0, 0, W, H, RADIUS);
          const lw = formless ? 4 : 2;
          g.lineStyle(lw, formless ? FORMLESS_COLOR : colors.border, 1);
          // 內縮半個線寬，否則描邊會被裁掉一半
          g.strokeRoundedRect(lw / 2, lw / 2, W - lw, H - lw, RADIUS);
        },
        W,
        H
      );
    }
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

/**
 * 附魔疊圖：把某個附魔組合的「左緣色條＋下緣小點」烘成一張**整卡大小**的透明貼圖。
 *
 * 為什麼整卡大小、擺在 (0,0)：偏移全部藏進貼圖裡，子物件跟 bg 一樣掛在容器中心 ——
 * 這是卡面上唯一在扇形縮放/旋轉/合成收尾 refresh 下都驗證過穩定的擺法
 * （帶偏移的 Image/Shape 子物件在手牌歸位後會跑位）。
 *
 * 座標用「卡面中心」空間傳入（同 CardSprite 子物件的座標系），這裡轉成貼圖左上角空間。
 * 每種附魔組合一張貼圖，key 由呼叫端組（組合數少，快取無虞）。
 */
export function ensureEnchantTexture(scene, key, w, h, segments, dots) {
  if (scene.textures.exists(key)) return key;
  const g = scene.add.graphics();
  for (const s of segments) {
    g.fillStyle(s.color, 1);
    g.fillRect(s.x - s.w / 2 + w / 2, s.y - s.h / 2 + h / 2, s.w, s.h);
  }
  for (const d of dots) {
    g.fillStyle(d.color, 1);
    g.fillCircle(d.x + w / 2, d.y + h / 2, d.r);
  }
  g.generateTexture(key, w, h);
  g.destroy();
  return key;
}
