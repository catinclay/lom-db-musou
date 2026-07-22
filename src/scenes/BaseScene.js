import Phaser from 'phaser';
import { GameSession } from '../core/GameSession.js';
import { loadMeta, saveMeta } from '../ui/metaStore.js';
import { addMenuHeader, drawMenuBackdrop, makeMenuButton } from '../ui/menuChrome.js';
import { transitionIn, transitionTo } from '../ui/sceneTransitions.js';

const FACILITIES = [
  { id: 'achievements', name: '功名碑', desc: '展示已解鎖成就', icon: '碑', fill: 0x26363b, border: 0x7699a0 },
  { id: 'gallery', name: '影畫閣', desc: '展示已解鎖畫廊', icon: '畫', fill: 0x3d2d3f, border: 0xa875a5 },
  { id: 'upgrades', name: '演武堂', desc: '花威望進行跨局強化', icon: '武', fill: 0x462b24, border: 0xc16b4f },
  { id: 'cards', name: '藏經閣', desc: '已知卡牌總表', icon: '招', fill: 0x263a2e, border: 0x62a071 },
  { id: 'events', name: '江湖錄', desc: '已知事件總表', icon: '錄', fill: 0x3e3523, border: 0xc2a251 },
  { id: 'relics', name: '秘寶庫', desc: '已知遺物總表', icon: '寶', fill: 0x2e2944, border: 0x8474bd },
];

/**
 * 唐門據點設施大廳。局末回到這裡結算威望；功能內容由 FacilityScene 承接。
 * 「開始挑戰」才會建立新的 RunState，進據點本身不會偷偷開局。
 */
export class BaseScene extends Phaser.Scene {
  constructor() {
    super('Base');
  }

  create(data) {
    this.meta = loadMeta();
    let resultLine = '';
    if (data?.run) {
      const gained = this.meta.earnFromRun(data.run);
      saveMeta(this.meta);
      const won = data.run.outcome === 'won';
      resultLine = `${won ? '凱旋歸來' : '折戟而歸'} · 第 ${data.run.day} 天 · 威望 ＋${gained}`;
    }

    drawMenuBackdrop(this, { moonX: 1330, moonY: 100 });
    addMenuHeader(this, '唐門據點', '選擇一處設施，或整裝踏入江湖');

    makeMenuButton(this, {
      x: 135, y: 58, w: 190, h: 50, label: '返回主題畫面', fill: 0x1d2427, border: 0x64747a,
      onClick: () => transitionTo(this, 'Title'), fontSize: 17,
    });

    this.add
      .text(800, 145, `門派威望 ${this.meta.prestige}　·　遠征 ${this.meta.stats.runs} 次　·　通關 ${this.meta.stats.wins} 次`, {
        fontFamily: 'sans-serif', fontSize: '19px', color: '#d9b45c', fontStyle: 'bold',
      })
      .setOrigin(0.5);
    if (resultLine) {
      this.add
        .text(800, 180, resultLine, { fontFamily: 'sans-serif', fontSize: '18px', color: '#f5d6a1' })
        .setOrigin(0.5);
    }

    const xs = [360, 800, 1240];
    const ys = [310, 510];
    FACILITIES.forEach((facility, i) => {
      const x = xs[i % 3];
      const y = ys[Math.floor(i / 3)];
      const rect = makeMenuButton(this, {
        x, y, w: 370, h: 150, label: facility.name, sub: facility.desc,
        fill: facility.fill, border: facility.border,
        onClick: () => transitionTo(this, 'Facility', { facility: facility.id }),
        fontSize: 26,
      });
      this.add
        .text(x - 140, y - 15, facility.icon, {
          fontFamily: 'serif', fontSize: '34px', color: '#f0dda0', fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(rect.depth + 1);
    });

    makeMenuButton(this, {
      x: 800, y: 735, w: 470, h: 92, label: '開始挑戰', sub: '建立新遠征 · 闖江湖',
      fill: 0x54221e, border: 0xd46349,
      onClick: () => {
        const session = new GameSession({ meta: this.meta });
        transitionTo(this, 'RunMap', { session, run: session.run });
      },
      fontSize: 30,
    });

    transitionIn(this);
  }
}
