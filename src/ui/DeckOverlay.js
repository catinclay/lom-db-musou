import { CardSprite } from './CardSprite.js';
import { createCard } from '../core/Card.js';
import { ensureCardTextures } from './cardTextures.js';

/**
 * 隨時檢視「本局牌組」（不是抽牌堆/棄牌堆，是玩家這輪構築的 deck）的模態浮層。
 * 任何場景都能 `new DeckOverlay(scene, run, opts)`；它把整組牌用 CardSprite 縮小排成格子。
 *
 * 兩種模式：
 *   view   —— 只看，一個「關閉」。
 *   select —— 點一張選起來（高亮），要再按「確定」才真的生效（避免誤觸即刪）。onConfirm(index) 回呼。
 *
 * 用純浮層（同場景的高 depth 物件）而非切場景 —— 這樣戰鬥中檢視也不會把戰鬥場景關掉。
 */
const DEPTH = 9000;

export class DeckOverlay {
  constructor(scene, run, { mode = 'view', title = '目前牌組', confirmLabel = '確定', onConfirm, onClose } = {}) {
    this.scene = scene;
    this.run = run;
    this.mode = mode;
    this.onConfirm = onConfirm;
    this.onClose = onClose;
    this.selectedIndex = null;
    this.objs = [];
    this.sprites = [];

    ensureCardTextures(scene);

    // 全螢幕遮罩：擋住底下場景的點擊（input.topOnly 讓最上層才吃到事件）
    const bg = scene.add.rectangle(800, 450, 1600, 900, 0x000000, 0.82).setDepth(DEPTH).setInteractive();
    bg.on('pointerdown', () => { if (this.mode === 'view') this.close(); });
    this.objs.push(bg);

    this.objs.push(
      scene.add
        .text(800, 44, `${title}（${run.deck.length} 張）`, {
          fontFamily: 'sans-serif', fontSize: '30px', color: '#f0dda0', fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(DEPTH + 2)
    );

    this.buildGrid();
    this.buildButtons(confirmLabel);
  }

  buildGrid() {
    const scale = 0.6;
    const cw = 140 * scale;
    const ch = 196 * scale;
    const gapX = 18;
    const gapY = 22;
    const cols = 6;
    const deck = this.run.deck;
    const gridW = cols * cw + (cols - 1) * gapX;
    const startX = 800 - gridW / 2 + cw / 2;
    const startY = 150 + ch / 2;

    deck.forEach((spec, i) => {
      const card = createCard(spec.defId, {
        realm: spec.realm ?? 1,
        tags: spec.tags ?? [],
        enchants: spec.enchants ?? {},
      });
      const s = new CardSprite(this.scene, card);
      s.setScale(scale)
        .setPosition(startX + (i % cols) * (cw + gapX), startY + Math.floor(i / cols) * (ch + gapY))
        .setDepth(DEPTH + 1);
      if (this.mode === 'select') {
        s.setInteractive({ useHandCursor: true });
        s.on('pointerdown', () => this.select(i));
      }
      this.sprites.push(s);
      this.objs.push(s);
    });
  }

  select(i) {
    this.selectedIndex = i;
    this.sprites.forEach((s, j) => s.setHighlight(j === i, 0xffe1b0));
    this.confirmBtn?.setAlpha(1);
    this.confirmTxt?.setAlpha(1);
  }

  buildButtons(confirmLabel) {
    if (this.mode === 'select') {
      const b = this.button(700, 810, 220, 60, confirmLabel, 0x2c4a30, 0x5aa06a, () => this.confirm());
      this.confirmBtn = b.rect;
      this.confirmTxt = b.txt;
      this.confirmBtn.setAlpha(0.45);
      this.confirmTxt.setAlpha(0.45);
      this.button(940, 810, 160, 60, '取消', 0x3a2f22, 0xd9b45c, () => this.close());
    } else {
      this.button(800, 810, 200, 60, '關閉', 0x3a2f22, 0xd9b45c, () => this.close());
    }
  }

  confirm() {
    if (this.selectedIndex == null) return;
    const i = this.selectedIndex;
    this.destroy();
    this.onConfirm?.(i);
    this.onClose?.();
  }

  close() {
    this.destroy();
    this.onClose?.();
  }

  destroy() {
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.sprites = [];
  }

  button(x, y, w, h, label, fill, border, onClick) {
    const rect = this.scene.add
      .rectangle(x, y, w, h, fill, 1)
      .setStrokeStyle(3, border)
      .setDepth(DEPTH + 2)
      .setInteractive({ useHandCursor: true });
    const txt = this.scene.add
      .text(x, y, label, { fontFamily: 'sans-serif', fontSize: '22px', color: '#f5e6c8', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(DEPTH + 3);
    rect.on('pointerover', () => rect.setStrokeStyle(4, 0xffe1b0));
    rect.on('pointerout', () => rect.setStrokeStyle(3, border));
    rect.on('pointerdown', onClick);
    this.objs.push(rect, txt);
    return { rect, txt };
  }
}
