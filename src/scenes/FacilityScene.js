import Phaser from 'phaser';
import { ACHIEVEMENT_DEFS, GALLERY_DEFS, unlockedEntries } from '../core/ArchiveLibrary.js';
import { CARD_DEFS } from '../core/CardLibrary.js';
import { EVENT_DEFS } from '../core/EventLibrary.js';
import { META_UPGRADE_IDS, getUpgrade } from '../core/MetaState.js';
import { RELIC_DEFS } from '../core/RelicLibrary.js';
import { CARD_COLORS } from '../ui/format.js';
import { loadMeta, saveMeta } from '../ui/metaStore.js';
import { addMenuHeader, drawMenuBackdrop, makeMenuButton } from '../ui/menuChrome.js';

const HEADERS = {
  achievements: ['功名碑', '已解鎖成就與尚待完成的江湖功名'],
  gallery: ['影畫閣', '隨遠征經歷解鎖的畫卷'],
  upgrades: ['演武堂', '花費門派威望，強化之後每一局的起始'],
  cards: ['藏經閣', '目前版本的已知卡牌總表'],
  events: ['江湖錄', '目前版本的已知奇遇總表'],
  relics: ['秘寶庫', '目前版本的已知遺物總表'],
};

const TYPE_LABEL = { attack: '攻擊', defense: '防禦', skill: '技能', catalyst: '催化' };

/** 據點內各設施的內容頁。共用一個場景，資料仍由各 core Library 提供。 */
export class FacilityScene extends Phaser.Scene {
  constructor() {
    super('Facility');
  }

  create(data) {
    this.facility = data?.facility;
    if (!HEADERS[this.facility]) {
      this.scene.start('Base');
      return;
    }
    this.meta = loadMeta();
    this.dynamicObjs = [];

    drawMenuBackdrop(this, { moonX: 1390, moonY: 80 });
    addMenuHeader(this, ...HEADERS[this.facility]);
    makeMenuButton(this, {
      x: 115, y: 58, w: 160, h: 50, label: '返回據點', fill: 0x1d2427, border: 0x64747a,
      onClick: () => this.scene.start('Base'), fontSize: 18,
    });

    switch (this.facility) {
      case 'achievements': this.renderAchievements(); break;
      case 'gallery': this.renderGallery(); break;
      case 'upgrades': this.renderUpgradePage(); break;
      case 'cards': this.renderCards(); break;
      case 'events': this.renderEvents(); break;
      case 'relics': this.renderRelics(); break;
    }
  }

  renderAchievements() {
    const unlocked = new Set(unlockedEntries(ACHIEVEMENT_DEFS, this.meta).map((x) => x.id));
    this.add
      .text(800, 150, `已解鎖 ${unlocked.size} / ${ACHIEVEMENT_DEFS.length}`, {
        fontFamily: 'sans-serif', fontSize: '20px', color: '#d9b45c', fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const xs = [360, 800, 1240];
    ACHIEVEMENT_DEFS.forEach((def, i) => {
      const open = unlocked.has(def.id);
      const x = xs[i];
      const y = 430;
      this.add.rectangle(x, y, 370, 350, open ? 0x26382f : 0x1b2022, 0.97)
        .setStrokeStyle(4, open ? 0x73a879 : 0x465156);
      this.add.circle(x, y - 95, 54, open ? 0xd9b45c : 0x343d40).setStrokeStyle(3, open ? 0xf0dda0 : 0x596266);
      this.add
        .text(x, y - 95, open ? '成' : '？', {
          fontFamily: 'serif', fontSize: '38px', color: open ? '#3b251d' : '#7c878a', fontStyle: 'bold',
        })
        .setOrigin(0.5);
      this.add
        .text(x, y, open ? def.name : '尚未解鎖', {
          fontFamily: 'sans-serif', fontSize: '27px', color: open ? '#f5e6c8' : '#788386', fontStyle: 'bold',
        })
        .setOrigin(0.5);
      this.add
        .text(x, y + 70, open ? def.desc : def.hint, {
          fontFamily: 'sans-serif', fontSize: '16px', color: open ? '#bfcdbd' : '#687376',
          align: 'center', wordWrap: { width: 310 }, lineSpacing: 6,
        })
        .setOrigin(0.5);
    });
  }

  renderGallery() {
    const unlocked = new Set(unlockedEntries(GALLERY_DEFS, this.meta).map((x) => x.id));
    this.add
      .text(800, 145, `已解鎖 ${unlocked.size} / ${GALLERY_DEFS.length}`, {
        fontFamily: 'sans-serif', fontSize: '20px', color: '#d9b45c', fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const xs = [350, 800, 1250];
    GALLERY_DEFS.forEach((def, i) => {
      const open = unlocked.has(def.id);
      const x = xs[i];
      const y = 440;
      this.add.rectangle(x, y, 390, 470, 0x17191a, 0.98).setStrokeStyle(5, open ? 0xb89453 : 0x3e4649);
      this.add.rectangle(x, y - 70, 330, 250, open ? def.palette[1] : 0x22282a).setStrokeStyle(2, open ? def.palette[0] : 0x465156);
      if (open) this.drawGalleryThumbnail(x, y - 70, def);
      else {
        this.add.text(x, y - 70, '封', { fontFamily: 'serif', fontSize: '72px', color: '#4c5659' }).setOrigin(0.5);
      }
      this.add
        .text(x, y + 105, open ? def.name : '未解鎖畫卷', {
          fontFamily: 'serif', fontSize: '27px', color: open ? '#f0dda0' : '#687376', fontStyle: 'bold',
        })
        .setOrigin(0.5);
      this.add
        .text(x, y + 155, open ? def.caption : def.hint, {
          fontFamily: 'sans-serif', fontSize: '15px', color: open ? '#b9aa91' : '#687376',
          align: 'center', wordWrap: { width: 320 },
        })
        .setOrigin(0.5);
    });
  }

  drawGalleryThumbnail(x, y, def) {
    const [light, dark, accent] = def.palette;
    this.add.circle(x + 90, y - 55, 38, light, 0.85);
    const g = this.add.graphics();
    g.fillStyle(dark, 0.95);
    g.fillPoints([
      { x: x - 165, y: y + 45 }, { x: x - 75, y: y - 35 }, { x, y: y + 25 },
      { x: x + 70, y: y - 30 }, { x: x + 165, y: y + 35 }, { x: x + 165, y: y + 125 },
      { x: x - 165, y: y + 125 },
    ], true);
    g.fillStyle(accent, 0.7);
    g.fillRect(x - 3, y + 25, 6, 74);
    g.fillTriangle(x - 42, y + 26, x + 42, y + 26, x, y - 25);
  }

  renderUpgradePage() {
    this.prestigeText = this.add
      .text(800, 145, '', { fontFamily: 'sans-serif', fontSize: '22px', color: '#d9b45c', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.msg = this.add
      .text(800, 820, '', { fontFamily: 'sans-serif', fontSize: '18px', color: '#f0dda0' })
      .setOrigin(0.5);
    this.refreshUpgrades();
  }

  refreshUpgrades() {
    for (const obj of this.dynamicObjs) obj.destroy();
    this.dynamicObjs = [];
    this.prestigeText.setText(`可用門派威望：${this.meta.prestige}`);

    META_UPGRADE_IDS.forEach((id, i) => {
      const def = getUpgrade(id);
      const level = this.meta.level(id);
      const cost = this.meta.costOf(id);
      const maxed = cost == null;
      const affordable = this.meta.canBuy(id);
      const y = 235 + i * 105;
      const panel = this.add.rectangle(800, y, 960, 88, 0x211d19, 0.97)
        .setStrokeStyle(3, maxed ? 0x5a9e4a : 0x725c41);
      const name = this.add
        .text(350, y - 19, `${def.name}　Lv ${level}/${def.maxLevel}`, {
          fontFamily: 'sans-serif', fontSize: '22px', color: '#f5e6c8', fontStyle: 'bold',
        })
        .setOrigin(0, 0.5);
      const desc = this.add
        .text(350, y + 18, def.desc, { fontFamily: 'sans-serif', fontSize: '15px', color: '#b9aa91' })
        .setOrigin(0, 0.5);
      this.dynamicObjs.push(panel, name, desc);

      if (maxed) {
        this.dynamicObjs.push(
          this.add.text(1200, y, '已滿級', { fontFamily: 'sans-serif', fontSize: '19px', color: '#8fd06a', fontStyle: 'bold' }).setOrigin(0.5)
        );
      } else {
        const btn = makeMenuButton(this, {
          x: 1190, y, w: 210, h: 56, label: `升級 · ${cost} 威望`,
          fill: affordable ? 0x3c3021 : 0x292725, border: affordable ? 0xd9b45c : 0x504b43,
          onClick: () => this.buyUpgrade(id), fontSize: 17,
        });
        btn.setAlpha(affordable ? 1 : 0.55);
        if (btn.subTxt) this.dynamicObjs.push(btn.subTxt);
        this.dynamicObjs.push(btn, btn.txt);
      }
    });
  }

  buyUpgrade(id) {
    if (this.meta.buyUpgrade(id)) {
      saveMeta(this.meta);
      this.showMessage(`升級完成：${getUpgrade(id).name}`);
    } else {
      this.showMessage('門派威望不足');
    }
    this.refreshUpgrades();
  }

  showMessage(text) {
    this.msg.setText(text);
    this.time.delayedCall(1500, () => this.msg?.setText(''));
  }

  renderCards() {
    const cards = Object.values(CARD_DEFS);
    this.add.text(800, 145, `已知 ${cards.length} / ${cards.length}`, {
      fontFamily: 'sans-serif', fontSize: '20px', color: '#d9b45c', fontStyle: 'bold',
    }).setOrigin(0.5);
    const xs = [350, 800, 1250];
    const ys = [260, 455, 650];
    cards.forEach((def, i) => {
      const color = CARD_COLORS[def.type] ?? CARD_COLORS.attack;
      const x = xs[i % 3];
      const y = ys[Math.floor(i / 3)];
      this.add.rectangle(x, y, 400, 165, color.fill, 0.92).setStrokeStyle(3, color.border);
      this.add.text(x - 170, y - 48, def.name, {
        fontFamily: 'sans-serif', fontSize: '24px', color: color.text, fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      this.add.text(x + 170, y - 48, `${TYPE_LABEL[def.type] ?? def.type} · 內力 ${def.cost}`, {
        fontFamily: 'sans-serif', fontSize: '14px', color: '#d7c8b1',
      }).setOrigin(1, 0.5);
      this.add.text(x, y + 18, def.desc ?? '尚無說明', {
        fontFamily: 'sans-serif', fontSize: '15px', color: '#dfd4c2', align: 'center',
        wordWrap: { width: 350 }, lineSpacing: 4,
      }).setOrigin(0.5);
    });
  }

  renderEvents() {
    const events = Object.values(EVENT_DEFS);
    this.add.text(800, 145, `已知 ${events.length} / ${events.length}`, {
      fontFamily: 'sans-serif', fontSize: '20px', color: '#d9b45c', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.renderTextCatalog(events, {
      title: (def) => def.name,
      body: (def) => def.text,
      meta: (def) => `${def.choices.length} 種抉擇`,
      fill: 0x28352d,
      border: 0x5f8c69,
    });
  }

  renderRelics() {
    const relics = Object.values(RELIC_DEFS);
    this.add.text(800, 145, `已知 ${relics.length} / ${relics.length}`, {
      fontFamily: 'sans-serif', fontSize: '20px', color: '#d9b45c', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.renderTextCatalog(relics, {
      title: (def) => def.name,
      body: (def) => def.desc,
      meta: () => '遺物 · 秘籍',
      fill: 0x2e2940,
      border: 0x8675b4,
    });
  }

  renderTextCatalog(items, style) {
    const xs = [500, 1100];
    const ys = [260, 465, 670];
    items.forEach((def, i) => {
      const x = xs[i % 2];
      const y = ys[Math.floor(i / 2)];
      this.add.rectangle(x, y, 540, 170, style.fill, 0.94).setStrokeStyle(3, style.border);
      this.add.text(x - 235, y - 48, style.title(def), {
        fontFamily: 'sans-serif', fontSize: '23px', color: '#f5e6c8', fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      this.add.text(x + 235, y - 48, style.meta(def), {
        fontFamily: 'sans-serif', fontSize: '14px', color: '#c9b896',
      }).setOrigin(1, 0.5);
      this.add.text(x, y + 22, style.body(def), {
        fontFamily: 'sans-serif', fontSize: '15px', color: '#d5cbbb', align: 'center',
        wordWrap: { width: 470 }, lineSpacing: 3,
      }).setOrigin(0.5);
    });
  }
}
