import Phaser from 'phaser';
import { GAME_ACTION, GameSession } from '../core/GameSession.js';
import { getCardDef } from '../core/CardLibrary.js';
import { getRelicDef } from '../core/RelicLibrary.js';
import { DeckOverlay } from '../ui/DeckOverlay.js';
import { transitionIn } from '../ui/sceneTransitions.js';
import { transitionToSessionPhase } from '../ui/sessionNavigation.js';
import { stopTweensOf, tweenTo } from '../ui/tweens.js';

/**
 * 白天服務設施共用畫面。客棧、商販、武館、賭坊各自只呈現自己的功能。
 * 交易全走 GameSession action；這裡只畫面板、送 action、刷新呈現。
 */
const OFFER_X = [450, 800, 1150];
const SERVICE_VIEW = Object.freeze({
  inn: { title: '🏮 客棧', intro: '熱茶已沏，房內也收拾乾淨了。要不要歇口氣？' },
  merchant: { title: '🧳 江湖商販', intro: '南來北往的招式與奇物，都攤在這張舊布上。' },
  dojo: { title: '🥋 武館', intro: '師傅翻過你的招式簿：「雜念太多，何不捨去一招？」' },
  casino: { title: '🎰 賭坊', intro: '銅輪喀啦作響。懷裡的代幣，似乎也跟著發燙。' },
});

export class ShopScene extends Phaser.Scene {
  constructor() {
    super('Shop');
  }

  create(data) {
    this.session = data?.session ?? new GameSession({ run: data?.run });
    this.run = this.session.run;
    this.shop = this.session.context.shop ?? data?.shop ?? this.run.generateShop('merchant');
    this.service = this.shop.service ?? 'merchant';
    this.offerObjs = [];
    this.relicObjs = [];
    const view = SERVICE_VIEW[this.service] ?? SERVICE_VIEW.merchant;

    this.cameras.main.setBackgroundColor('#1a140e');
    this.add.text(800, 70, view.title, {
      fontFamily: 'sans-serif', fontSize: '42px', color: '#f0dda0', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.status = this.add
      .text(800, 130, '', { fontFamily: 'sans-serif', fontSize: '22px', color: '#d8c9a8' })
      .setOrigin(0.5);
    this.add.text(800, 190, view.intro, {
      fontFamily: 'sans-serif', fontSize: '20px', color: '#c9b896',
      align: 'center', wordWrap: { width: 900 },
    }).setOrigin(0.5);

    if (this.service === 'merchant') {
      this.add.text(800, 235, '挑一件合眼緣的', {
        fontFamily: 'sans-serif', fontSize: '18px', color: '#9c8a70',
      }).setOrigin(0.5);
    } else if (this.service === 'inn') {
      this.restBtn = this.makeButton(800, 500, 420, 82,
        '歇息回血（−' + this.shop.rest.price + '，＋' + this.shop.rest.heal + '）', 0x24445c, 0x4a8fb8,
        () => this.doRest());
    } else if (this.service === 'dojo') {
      this.removeBtn = this.makeButton(800, 500, 380, 82,
        '刪去一招（−' + this.shop.removePrice + '）', 0x5c2c2c, 0xc4583f,
        () => this.openRemovePicker());
    } else if (this.service === 'casino') {
      this.slotBtn = this.makeButton(800, 500, 340, 82, '投入代幣', 0x4a2c5c, 0x9b6cc0,
        () => this.goSlot());
    }

    this.makeButton(800, 680, 180, 66, '離開', 0x3a2f22, 0xd9b45c, () => this.leave());
    if (this.service === 'merchant' || this.service === 'dojo') {
      this.viewBtn = this.makeButton(230, 130, 200, 52, '檢視牌組', 0x2c4a30, 0x5aa06a,
        () => new DeckOverlay(this, this.run, { mode: 'view', title: '目前牌組' }));
    }
    this.msg = this.add
      .text(800, 740, '', { fontFamily: 'sans-serif', fontSize: '20px', color: '#f0dda0' })
      .setOrigin(0.5);

    this.refresh();
    transitionIn(this);
  }

  refresh() {
    const r = this.run;
    this.status.setText(`銀兩 ${r.money}　　血量 ${r.hp}/${r.maxHp}　　代幣 ${r.slotTokens}`);
    this.restBtn?.setAlpha(r.money >= this.shop.rest?.price && r.hp < r.maxHp ? 1 : 0.45);
    this.removeBtn?.setAlpha(r.money >= this.shop.removePrice && r.deck.length > 1 ? 1 : 0.45);
    this.slotBtn?.setAlpha(r.slotTokens > 0 ? 1 : 0.45);
    if (this.service === 'merchant') {
      this.renderOffers();
      this.renderRelicOffer();
    }
  }

  renderRelicOffer() {
    for (const o of this.relicObjs) o.destroy();
    this.relicObjs = [];
    const offer = this.shop.relic;
    if (!offer) return;
    const def = getRelicDef(offer.id);
    const affordable = !offer.sold && this.run.money >= offer.price;
    const y = 545;

    const rect = this.add
      .rectangle(800, y, 640, 84, offer.sold ? 0x241d17 : 0x2c2440)
      .setStrokeStyle(3, offer.sold ? 0x3a2f22 : 0xb06cc0);
    const title = this.add
      .text(800, y - 22, `【遺物】${def.name}`, {
        fontFamily: 'sans-serif', fontSize: '22px', color: offer.sold ? '#5a4a38' : '#e0c8f0', fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const desc = this.add
      .text(800, y + 12, offer.sold ? '── 售出 ──' : `${def.desc}　（${offer.price} 銀兩）`, {
        fontFamily: 'sans-serif', fontSize: '16px',
        color: offer.sold ? '#5a4a38' : affordable ? '#d8c9a8' : '#8d5a4a',
      })
      .setOrigin(0.5);

    if (!offer.sold) {
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerover', () => rect.setStrokeStyle(4, 0xffe1b0));
      rect.on('pointerout', () => rect.setStrokeStyle(3, 0xb06cc0));
      rect.on('pointerdown', () => this.buyRelicClick());
    }
    this.relicObjs.push(rect, title, desc);
  }

  buyRelicClick() {
    if (this.session.dispatch(GAME_ACTION.BUY_RELIC).ok) this.flash(`入手遺物：${getRelicDef(this.shop.relic.id).name}`);
    else this.flash('銀兩不足');
    this.refresh();
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
    if (this.session.dispatch(GAME_ACTION.BUY_CARD, { index: i }).ok) {
      this.flash(`買下【${getCardDef(this.shop.cards[i].defId).name}】`);
    } else {
      this.flash('銀兩不足');
    }
    this.refresh();
  }

  doRest() {
    if (this.session.dispatch(GAME_ACTION.REST).ok) this.flash('歇了口氣，回了些血');
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
        if (this.session.dispatch(GAME_ACTION.REMOVE_CARD, { index }).ok) this.flash('刪去一招');
        this.refresh();
      },
    });
  }

  goSlot() {
    const action = this.session.dispatch(GAME_ACTION.ENTER_SLOT);
    if (action.ok) transitionToSessionPhase(this, this.session);
    else this.flash('身上沒有代幣');
  }

  leave() {
    const action = this.session.dispatch(GAME_ACTION.LEAVE_SHOP);
    if (action.ok) transitionToSessionPhase(this, this.session);
  }

  flash(text) {
    stopTweensOf(this, this.msg);
    this.msg.setText(text);
    this.msg.setAlpha(1);
    void tweenTo(this, { targets: this.msg, alpha: 0, delay: 900, duration: 600 });
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
