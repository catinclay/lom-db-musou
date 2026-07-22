import Phaser from 'phaser';
import { getCardDef } from '../core/CardLibrary.js';
import { displayName } from '../core/Card.js';
import { cardFaceValue } from '../core/Effect.js';
import { energyPips, rankLabel, CARD_COLORS, WANGXING_COLOR } from './format.js';
import { cardTextureKey, HIGHLIGHT_KEY } from './cardTextures.js';
import { TUNING } from '../config/tuning.js';

/**
 * 一張牌的視覺。
 * 底圖走預先烘好的貼圖（見 cardTextures.js），不用活的 Graphics ——
 * 縮放旋轉時穩定得多，連鎖爆抽時也撐得住張數。
 */
export class CardSprite extends Phaser.GameObjects.Container {
  constructor(scene, card) {
    super(scene, 0, 0);
    this.card = card;
    this.w = TUNING.hand.cardWidth;
    this.h = TUNING.hand.cardHeight;

    // 綠色連段提示光暈：打這張能繼續 combo 時亮起（在卡底圖後面，只露出邊框）
    this.comboGlow = scene.add.image(0, 0, HIGHLIGHT_KEY).setVisible(false).setTint(0x8fd06a);
    this.add(this.comboGlow);

    this.highlight = scene.add.image(0, 0, HIGHLIGHT_KEY).setVisible(false);
    this.add(this.highlight);

    this.bg = scene.add.image(0, 0, cardTextureKey('attack', false));
    this.add(this.bg);

    this.nameText = scene.add
      .text(0, -18, '', { fontFamily: 'sans-serif', fontSize: '34px', color: '#fff' })
      .setOrigin(0.5);
    this.add(this.nameText);

    // 內力費用以氣輪大小格呈現，階級保留為卡面唯一的數字。
    // 扇形是右牌蓋左牌，每張只露出左緣一條；境界原本擺右上角，手牌一多就被
    // 隔壁的牌整個蓋掉。境界是連段的核心數字，非看到不可，所以搬到必定可見的
    // 左緣。左對齊（origin 0）是為了長境界（如「二十七」）往右長進可見區，
    // 而不是置中往左溢出卡面。
    this.costText = scene.add
      .text(-this.w / 2 + 12, -this.h / 2 + 18, '', {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: '#9fd0e8',
      })
      .setOrigin(0, 0.5);
    this.add(this.costText);

    this.rankText = scene.add
      .text(-this.w / 2 + 12, -this.h / 2 + 46, '', {
        fontFamily: 'sans-serif',
        fontSize: '24px',
        color: '#f5e6c8',
      })
      .setOrigin(0, 0.5);
    this.add(this.rankText);

    this.statText = scene.add
      .text(0, this.h / 2 - 34, '', {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#d8c9a8',
      })
      .setOrigin(0.5);
    this.add(this.statText);

    // 內力不足時蓋一層灰遮罩（放最上層）。用遮罩而非 container alpha ——
    // relayout 會把 container alpha tween 回 1，會跟變灰打架。
    this.dimOverlay = scene.add
      .rectangle(0, 0, this.w, this.h, 0x14100e, 0.5)
      .setVisible(false);
    this.add(this.dimOverlay);

    this.setSize(this.w, this.h);
    this.refresh(card);
    scene.add.existing(this);
  }

  /** 重畫。合成後是新的卡物件，但 sprite 可以沿用 */
  refresh(card) {
    this.card = card;
    const def = getCardDef(card.defId);
    this.cost = def.cost;
    const colors = CARD_COLORS[def.type];

    this.bg.setTexture(cardTextureKey(def.type));
    this.nameText.setText(displayName(card));
    this.nameText.setColor(def.forgetForm ? '#f0dda0' : colors.text);
    this.rankText.setText(rankLabel(card.rank));
    this.costText.setText(energyPips(def.cost, TUNING.energyUnit));

    // 內力沿用大小格；靈感由 cardFaceValue 直接提供全名與數字。
    const face = cardFaceValue(def, card.rank);
    if (face?.tag === '力') {
      this.statText.setText(`力 ${energyPips(face.amount, TUNING.energyUnit)}`);
    } else {
      this.statText.setText(face ? `${face.tag} ${face.text}` : '境界歸零／升階');
    }
  }

  /** 忘形拖曳時，把合法的目標標亮 */
  setHighlight(on, color = WANGXING_COLOR) {
    this.highlight.setVisible(on);
    if (on) this.highlight.setTint(color);
  }

  setDimmed(on) {
    this.setAlpha(on ? 0.45 : 1);
  }

  /** 連段提示：打這張能繼續 combo 時亮綠邊 */
  setComboHint(on) {
    this.comboGlow.setVisible(on);
  }

  /** 內力不足打不出時，牌面灰掉 */
  setAffordable(affordable) {
    this.dimOverlay.setVisible(!affordable);
  }
}
