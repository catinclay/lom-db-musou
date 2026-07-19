import Phaser from 'phaser';
import { canFormlessMerge } from '../core/MergeEngine.js';
import { FORMLESS_COLOR } from './format.js';

const ARROW_PLAY = 0xc4583f;
const ARROW_MERGE = FORMLESS_COLOR;
const ARROW_INVALID = 0x555555;

const MODE = { NONE: 'none', PLAY: 'play', MERGE: 'merge', INVALID: 'invalid' };

/**
 * 拖曳與箭頭。
 *
 * 全作只有一個手勢：從牌上拉出箭頭。**落點決定行為** ——
 *   落在戰場   ＝ 出牌
 *   落在手牌   ＝ 忘形合成（落點即主體）
 * 不需要模式切換，也不需要額外 UI。箭頭尖端就是玩家做決定的地方，
 * 所以箭頭本身必須是視覺主角：牌只是微微抬起留在原位，動的是箭頭。
 */
export class DragController {
  constructor(scene, handView, { battlefieldY, onPlay, onMerge, getCard }) {
    this.scene = scene;
    this.hand = handView;
    this.battlefieldY = battlefieldY;
    this.onPlay = onPlay;
    this.onMerge = onMerge;
    this.getCard = getCard;

    this.arrow = scene.add.graphics().setDepth(5000);
    this.dragUid = null;
    this.mode = MODE.NONE;
    this.hoverTargetUid = null;

    scene.input.on('dragstart', this.handleDragStart, this);
    scene.input.on('drag', this.handleDrag, this);
    scene.input.on('dragend', this.handleDragEnd, this);
  }

  handleDragStart(pointer, sprite) {
    if (!this.hand.interactive) return;
    if (!sprite.card) return;

    this.dragUid = sprite.card.uid;
    this.hand.setFocus(this.dragUid);
    sprite.setDepth(4000);
  }

  handleDrag(pointer) {
    if (!this.dragUid) return;

    const source = this.hand.getSprite(this.dragUid);
    if (!source) return;

    const target = this.findCardUnder(pointer, this.dragUid);
    this.mode = this.resolveMode(pointer, target);
    this.updateHighlight(target);

    const color =
      this.mode === MODE.MERGE ? ARROW_MERGE : this.mode === MODE.PLAY ? ARROW_PLAY : ARROW_INVALID;

    // 箭頭從牌的上緣出發，不從中心 —— 中心會被牌自己遮住
    this.drawArrow(source.x, source.y - source.h / 2, pointer.worldX, pointer.worldY, color);
  }

  handleDragEnd(pointer) {
    if (!this.dragUid) return;

    const draggedUid = this.dragUid;
    const target = this.findCardUnder(pointer, draggedUid);
    const mode = this.resolveMode(pointer, target);

    this.arrow.clear();
    this.clearHighlights();
    this.dragUid = null;
    this.mode = MODE.NONE;
    this.hoverTargetUid = null;

    if (mode === MODE.MERGE && target) {
      this.onMerge?.(draggedUid, target.card.uid);
    } else if (mode === MODE.PLAY) {
      this.onPlay?.(draggedUid);
    }

    // 無論成不成，牌都回歸佈局 —— 誤放不該懲罰玩家
    this.hand.setFocus(null);
    this.hand.relayout(true);
  }

  resolveMode(pointer, target) {
    if (target) {
      const dragged = this.getCard(this.dragUid);
      const other = this.getCard(target.card.uid);
      return canFormlessMerge(dragged, other) ? MODE.MERGE : MODE.INVALID;
    }
    if (pointer.worldY < this.battlefieldY) return MODE.PLAY;
    return MODE.INVALID;
  }

  findCardUnder(pointer, excludeUid) {
    // 由上往下找（order 越後面越上層）
    for (let i = this.hand.order.length - 1; i >= 0; i--) {
      const uid = this.hand.order[i];
      if (uid === excludeUid) continue;
      const s = this.hand.getSprite(uid);
      if (!s) continue;
      if (s.getBounds().contains(pointer.worldX, pointer.worldY)) return s;
    }
    return null;
  }

  updateHighlight(target) {
    const uid = target?.card.uid ?? null;
    if (uid === this.hoverTargetUid) return;

    this.clearHighlights();
    this.hoverTargetUid = uid;
    if (target && this.mode === MODE.MERGE) target.setHighlight(true, ARROW_MERGE);
  }

  clearHighlights() {
    for (const s of this.hand.sprites.values()) s.setHighlight(false);
  }

  drawArrow(fromX, fromY, toX, toY, color) {
    this.arrow.clear();
    this.arrow.lineStyle(6, color, 0.92);

    // 往上拱的貝茲曲線，像殺戮尖塔的指向箭頭
    const ctrl = new Phaser.Math.Vector2((fromX + toX) / 2, Math.min(fromY, toY) - 130);
    const curve = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(fromX, fromY),
      ctrl,
      new Phaser.Math.Vector2(toX, toY)
    );

    const pts = curve.getPoints(24);
    this.arrow.beginPath();
    this.arrow.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) this.arrow.lineTo(pts[i].x, pts[i].y);
    this.arrow.strokePath();

    // 箭頭尖端，方向取曲線末段的切線
    const tip = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const ang = Math.atan2(tip.y - prev.y, tip.x - prev.x);
    const size = 18;
    this.arrow.fillStyle(color, 0.95);
    this.arrow.beginPath();
    this.arrow.moveTo(tip.x, tip.y);
    this.arrow.lineTo(
      tip.x - size * Math.cos(ang - Math.PI / 7),
      tip.y - size * Math.sin(ang - Math.PI / 7)
    );
    this.arrow.lineTo(
      tip.x - size * Math.cos(ang + Math.PI / 7),
      tip.y - size * Math.sin(ang + Math.PI / 7)
    );
    this.arrow.closePath();
    this.arrow.fillPath();
  }

  destroy() {
    this.scene.input.off('dragstart', this.handleDragStart, this);
    this.scene.input.off('drag', this.handleDrag, this);
    this.scene.input.off('dragend', this.handleDragEnd, this);
    this.arrow.destroy();
  }
}
