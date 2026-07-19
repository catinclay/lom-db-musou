import Phaser from 'phaser';
import { RunState } from '../core/RunState.js';
import { getCardDef } from '../core/CardLibrary.js';
import { DeckOverlay } from '../ui/DeckOverlay.js';

/**
 * 客棧（白天池中的 'inn' 節點）：買招式、歇息回血、刪去一招，也能拉霸。
 * 交易全走 RunState（buyShopCard / restAtInn / buyRemoveCard）；這裡只畫面板與接點擊。
 */
const OFFER_X = [450, 800, 1150];

export class ShopScene extends Phaser.Scene {
  constructor() {
    super('Shop');
  }

  create(data) {
    this.run = data?.run ?? new RunState();
    this.shop = data?.shop ?? this.run.generateShop();
    this.offerObjs = [];

    this.cameras.main.setBackgroundColor('#1a140e');
    this.add.text(800, 70, '🏮 客棧', {
      fontFamily: 'sans-serif', fontSize: '42px', color: '#f0dda0', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.status = this.add
      .text(800, 130, '', { fontFamily: 'sans-serif', fontSize: '22px', color: '#d8c9a8' })
      .setOrigin(0.5);
    this.add.text(800, 210, '買招式', { fontFamily: 'sans-serif', fontSize: '20px', color: '#9c8a70' }).setOrigin(0.5);

    // 服務列（建一次，refresh 只調可用度）
    this.restBtn = this.makeButton(430, 660, 260, 66,
      `歇息回血（−${this.shop.rest.price}，＋${this.shop.rest.heal}）`, 0x24445c, 0x4a8fb8,
      () => this.doRest());
    this.removeBtn = this.makeButton(720, 660, 240, 66,
      `刪去一招（−${this.shop.removePrice}）`, 0x5c2c2c, 0xc4583f,
      () => this.openRemovePicker());
    this.slotBtn = this.makeButton(985, 660, 200, 66, '拉霸機 🎰', 0x4a2c5c, 0x9b6cc0,
      () => this.goSlot());
    this.makeButton(1210, 660, 160, 66, '離開', 0x3a2f22, 0xd9b45c, () => this.leave());

    this.viewBtn = this.makeButton(230, 130, 200, 52, '檢視牌組', 0x2c4a30, 0x5aa06a,
      () => new DeckOverlay(this, this.run, { mode: 'view', title: '目前牌組' }));

    this.msg = this.add
      .text(800, 740, '', { fontFamily: 'sans-serif', fontSize: '20px', color: '#f0dda0' })
      .setOrigin(0.5);

    this.refresh();
  }

  refresh() {
    const r = this.run;
    this.status.setText(`銀兩 ${r.money}　　血量 ${r.hp}/${r.maxHp}　　代幣 ${r.slotTokens}`);
    this.restBtn.setAlpha(r.money >= this.shop.rest.price && r.hp < r.maxHp ? 1 : 0.45);
    this.removeBtn.setAlpha(r.money >= this.shop.removePrice && r.deck.length > 1 ? 1 : 0.45);
    this.renderOffers();
  }

  renderOffers() {
    for (const o of this.offerObjs) o.destroy();
    this.offerObjs = [];

    this.shop.cards.forEach((offer, i) => {
      const x = OFFER_X[i];
      const y = 360;
      const def = getCardDef(offer.defId);
      const affordable = !offer.sold && this.run.money >= offer.price;

      const rect = this.add
        .rectangle(x, y, 300, 250, offer.sold ? 0x241d17 : 0x2a221a)
        .setStrokeStyle(3, offer.sold ? 0x3a2f22 : 0xd9b45c);
      const name = this.add
        .text(x, y - 88, def.name, { fontFamily: 'sans-serif', fontSize: '30px', color: offer.sold ? '#5a4a38' : '#f5e6c8', fontStyle: 'bold' })
        .setOrigin(0.5);
      const desc = this.add
        .text(x, y - 20, def.desc ?? '', {
          fontFamily: 'sans-serif', fontSize: '16px', color: offer.sold ? '#5a4a38' : '#c9b896',
          align: 'center', wordWrap: { width: 268 },
        })
        .setOrigin(0.5);
      const price = this.add
        .text(x, y + 96, offer.sold ? '── 售出 ──' : `${offer.price} 銀兩`, {
          fontFamily: 'sans-serif', fontSize: '22px',
          color: offer.sold ? '#5a4a38' : affordable ? '#d9b45c' : '#8d5a4a', fontStyle: 'bold',
        })
        .setOrigin(0.5);

      if (!offer.sold) {
        rect.setInteractive({ useHandCursor: true });
        rect.on('pointerover', () => rect.setStrokeStyle(4, 0xffe1b0));
        rect.on('pointerout', () => rect.setStrokeStyle(3, 0xd9b45c));
        rect.on('pointerdown', () => this.buy(i));
      }
      this.offerObjs.push(rect, name, desc, price);
    });
  }

  buy(i) {
    if (this.run.buyShopCard(this.shop, i)) {
      this.flash(`買下【${getCardDef(this.shop.cards[i].defId).name}】`);
    } else {
      this.flash('銀兩不足');
    }
    this.refresh();
  }

  doRest() {
    if (this.run.restAtInn(this.shop)) this.flash('歇了口氣，回了些血');
    else this.flash(this.run.hp >= this.run.maxHp ? '已是滿血' : '銀兩不足');
    this.refresh();
  }

  // ── 刪牌：開牌組浮層，選一張、再按「刪去」才生效（不會誤觸即刪）──
  openRemovePicker() {
    if (this.run.money < this.shop.removePrice) { this.flash('銀兩不足'); return; }
    if (this.run.deck.length <= 1) { this.flash('牌組不能再薄了'); return; }
    new DeckOverlay(this, this.run, {
      mode: 'select',
      title: `刪去哪一招？（−${this.shop.removePrice} 銀兩）`,
      confirmLabel: '刪去',
      onConfirm: (index) => {
        if (this.run.buyRemoveCard(this.shop, index)) this.flash('刪去一招');
        this.refresh();
      },
    });
  }

  goSlot() {
    this.scene.start('Slot', { run: this.run, back: { scene: 'Shop', data: { run: this.run, shop: this.shop } } });
  }

  leave() {
    this.scene.start('RunMap', { run: this.run });
  }

  flash(text) {
    this.msg.setText(text);
    this.msg.setAlpha(1);
    this.tweens.add({ targets: this.msg, alpha: 0, delay: 900, duration: 600 });
  }

  makeButton(x, y, w, h, label, fill, border, onClick) {
    const rect = this.add
      .rectangle(x, y, w, h, fill, 1)
      .setStrokeStyle(3, border)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(x, y, label, { fontFamily: 'sans-serif', fontSize: '19px', color: '#f5e6c8', fontStyle: 'bold' })
      .setOrigin(0.5);
    rect.on('pointerover', () => rect.setStrokeStyle(4, 0xffe1b0));
    rect.on('pointerout', () => rect.setStrokeStyle(3, border));
    rect.on('pointerdown', onClick);
    return rect;
  }
}
