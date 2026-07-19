import Phaser from 'phaser';
import { getCardDef } from '../core/CardLibrary.js';
import { isFormless, displayName, cardEnchants } from '../core/Card.js';
import { STATUS_DEFS, STATUS_IDS } from '../core/StatusLibrary.js';
import { cardFaceValue } from '../core/Effect.js';
import { realmLabel, CARD_COLORS, FORMLESS_COLOR } from './format.js';
import { cardTextureKey, HIGHLIGHT_KEY, ensureEnchantTexture } from './cardTextures.js';
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

    // 內力與境界都貼左緣、由上而下疊。
    // 扇形是右牌蓋左牌，每張只露出左緣一條；境界原本擺右上角，手牌一多就被
    // 隔壁的牌整個蓋掉。境界是連段的核心數字，非看到不可，所以搬到必定可見的
    // 左緣。左對齊（origin 0）是為了長境界（如「二十七」）往右長進可見區，
    // 而不是置中往左溢出卡面。
    this.costText = scene.add
      .text(-this.w / 2 + 12, -this.h / 2 + 18, '', {
        fontFamily: 'sans-serif',
        fontSize: '22px',
        color: '#9fd0e8',
      })
      .setOrigin(0, 0.5);
    this.add(this.costText);

    this.realmText = scene.add
      .text(-this.w / 2 + 12, -this.h / 2 + 46, '', {
        fontFamily: 'sans-serif',
        fontSize: '24px',
        color: '#f5e6c8',
      })
      .setOrigin(0, 0.5);
    this.add(this.realmText);

    this.statText = scene.add
      .text(0, this.h / 2 - 34, '', {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#d8c9a8',
      })
      .setOrigin(0.5);
    this.add(this.statText);

    // 附魔視覺：一張整卡大小的「附魔疊圖」（色條＋小點烘成貼圖，像 bg 一樣擺在 (0,0)）
    // ＋ 層數數字的 Text 池。帶偏移的 Image/Shape 子物件在手牌歸位後會跑位（實測），
    // 所以偏移全部藏進貼圖；文字子物件（同 costText/realmText）則驗證過穩定。
    this.enchantOverlay = scene.add.image(0, 0, '__DEFAULT').setVisible(false);
    this.add(this.enchantOverlay);
    this.enchantNums = [];
    for (let k = 0; k < 6; k++) {
      const num = scene.add
        .text(0, 0, '', { fontFamily: 'sans-serif', fontSize: '17px', color: '#f5e6c8' })
        .setOrigin(0, 0.5)
        .setVisible(false);
      this.add(num);
      this.enchantNums.push(num);
    }

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
    const formless = isFormless(card);
    const colors = CARD_COLORS[def.type];

    this.bg.setTexture(cardTextureKey(def.type, formless));
    this.nameText.setText(displayName(card));
    this.nameText.setColor(formless ? '#f0dda0' : colors.text);
    this.realmText.setText(realmLabel(card.realm));
    this.costText.setText(String(def.cost));

    // 卡面數值：傷/甲/力/抽 由 cardFaceValue 的 tag 決定。
    // 催化劑無戰鬥數值（cardFaceValue 回 null），改標示用途。
    const face = cardFaceValue(def, card.realm);
    this.statText.setText(face ? `${face.tag} ${face.text}` : '萬用材料');

    this.refreshEnchants(card);
  }

  /**
   * 更新附魔的兩層視覺：
   *   左緣色條 —— 依附魔種類等分色段，只給「有哪些魔」的顏色訊號（被蓋住時也看得到）。
   *   卡面小點 —— 下緣一橫排彩色圓點＋層數（露臉/hover 才看得到的細節）。
   * 色條與小點烘成一張整卡貼圖換上（每種組合快取一張，見 ensureEnchantTexture）；
   * 層數數字用 Text 池。忘形不進這裡（它靠金框＋名字前綴表現）。
   */
  refreshEnchants(card) {
    this.enchantOverlay.setVisible(false);
    for (const n of this.enchantNums) n.setVisible(false);

    // 只取有定義（顏色）的狀態附魔，依 STATUS_IDS 穩定排序；最多顯示數字池容量
    const list = cardEnchants(card)
      .filter(([id]) => STATUS_DEFS[id])
      .sort((a, b) => STATUS_IDS.indexOf(a[0]) - STATUS_IDS.indexOf(b[0]))
      .slice(0, this.enchantNums.length);
    if (!list.length) return;

    const { segments, dots, nums } = this.enchantLayout(list);
    const key = `ench-${list.map(([id, st]) => `${id}.${st}`).join('-')}`;
    ensureEnchantTexture(this.scene, key, this.w, this.h, segments, dots);
    this.enchantOverlay.setTexture(key).setVisible(true);

    nums.forEach((n, i) => {
      this.enchantNums[i].setPosition(n.x, n.y).setText(n.text).setVisible(true);
    });
  }

  /**
   * 附魔的幾何佈局（卡面中心座標系）：
   *   segments 左緣色條的色段、dots 下緣小點、nums 層數數字（>1 才有）。
   * 純計算，畫進貼圖的事交給 ensureEnchantTexture。
   */
  enchantLayout(list) {
    // 左緣色條：內力/境界文字（x≈-58）左側的空白邊界，落在直邊、避開上下圓角
    const segments = [];
    const barTop = -60;
    const barBottom = 80;
    const seg = (barBottom - barTop) / list.length;
    list.forEach(([id], i) => {
      segments.push({
        x: -this.w / 2 + 5,
        y: barTop + seg * (i + 0.5),
        w: 6,
        h: seg,
        color: STATUS_DEFS[id].color,
      });
    });

    // 下緣小點＋層數：過寬換行、每行置中
    const R = 6;
    const gap = 7;
    const maxRowW = this.w - 24;
    const items = list.map(([id, stacks]) => {
      const showN = stacks > 1;
      return { id, stacks, showN, w: 2 * R + (showN ? 4 + String(stacks).length * 10 : 0) };
    });

    const rows = [];
    let row = [];
    let rowW = 0;
    for (const it of items) {
      if (row.length && rowW + gap + it.w > maxRowW) {
        rows.push({ items: row, width: rowW });
        row = [];
        rowW = 0;
      }
      rowW += (row.length ? gap : 0) + it.w;
      row.push(it);
    }
    if (row.length) rows.push({ items: row, width: rowW });

    const dots = [];
    const nums = [];
    const rowH = 2 * R + 6;
    const bottomY = this.h / 2 - 16; // 最後一行貼近底邊，往上疊其餘行
    rows.forEach((r, ri) => {
      const y = bottomY - (rows.length - 1 - ri) * rowH;
      let x = -r.width / 2;
      for (const it of r.items) {
        const cx = x + R;
        dots.push({ x: cx, y, r: R, color: STATUS_DEFS[it.id].color });
        if (it.showN) nums.push({ x: cx + R + 3, y, text: String(it.stacks) });
        x += it.w + gap;
      }
    });

    return { segments, dots, nums };
  }

  /** 忘形拖曳時，把合法的目標標亮 */
  setHighlight(on, color = FORMLESS_COLOR) {
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
