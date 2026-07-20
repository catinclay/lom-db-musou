import { TUNING } from '../config/tuning.js';

/**
 * 跨 run 的「門派據點」永久狀態（Phase 5，rogue-lite meta）。零 Phaser、純資料，可測。
 * 持久化（localStorage）是渲染層的事 —— 見 ui/metaStore.js；這裡只認 { prestige, levels, stats }。
 *
 * 威望（prestige）：一局結束依「撐到第幾天 ＋ 通關獎勵」賺取，回據點花在永久升級。
 * 升級（upgrades）：買了就永久 +級，`applyToRun` 在**每局 RunState 建構時**把加成疊上去
 * （更多起始血/內力/銀兩、牌組多牌、起手帶遺物…）。
 */
export const META_UPGRADES = {
  guts: {
    id: 'guts',
    name: '紮實底子',
    desc: '每局起始血量上限 +15',
    maxLevel: 5,
    cost: (lvl) => 25 + lvl * 20,
    apply: (run, lvl) => {
      run.maxHp += 15 * lvl;
      run.hp = run.maxHp;
    },
  },
  innerQi: {
    id: 'innerQi',
    name: '渾厚內力',
    desc: '每局起始內力上限 +1',
    maxLevel: 2,
    cost: (lvl) => 60 + lvl * 60,
    apply: (run, lvl) => {
      run.attrs.energyPerTurn += lvl;
    },
  },
  funds: {
    id: 'funds',
    name: '殷實家底',
    desc: '每局起始銀兩 +20',
    maxLevel: 4,
    cost: (lvl) => 20 + lvl * 15,
    apply: (run, lvl) => {
      run.money += 20 * lvl;
    },
  },
  heirloom: {
    id: 'heirloom',
    name: '祖傳絕學',
    desc: '每局牌組多帶一張【貫】',
    maxLevel: 3,
    cost: (lvl) => 30 + lvl * 25,
    apply: (run, lvl) => {
      for (let i = 0; i < lvl; i++) run.addDeckCard('guan');
    },
  },
  treasure: {
    id: 'treasure',
    name: '傳家寶',
    desc: '每局起始帶一件隨機遺物',
    maxLevel: 1,
    cost: () => 90,
    apply: (run) => {
      run.grantRandomRelic();
    },
  },
};

export const META_UPGRADE_IDS = Object.keys(META_UPGRADES);

export function getUpgrade(id) {
  const u = META_UPGRADES[id];
  if (!u) throw new Error(`未知的據點升級: ${id}`);
  return u;
}

export class MetaState {
  constructor({ prestige = 0, levels = {}, stats = {} } = {}) {
    this.prestige = prestige;
    this.levels = { ...levels };
    this.stats = {
      runs: stats.runs ?? 0,
      wins: stats.wins ?? 0,
      bestDay: stats.bestDay ?? 0,
    };
  }

  level(id) {
    return this.levels[id] ?? 0;
  }

  /** 下一級的花費，或 null（已滿級）。 */
  costOf(id) {
    const u = getUpgrade(id);
    const lvl = this.level(id);
    return lvl >= u.maxLevel ? null : u.cost(lvl);
  }

  canBuy(id) {
    const c = this.costOf(id);
    return c != null && this.prestige >= c;
  }

  /** 買一級升級。@returns 是否成交 */
  buyUpgrade(id) {
    const c = this.costOf(id);
    if (c == null || this.prestige < c) return false;
    this.prestige -= c;
    this.levels[id] = this.level(id) + 1;
    return true;
  }

  /** 一局結束後賺威望（撐到第幾天 ＋ 通關獎勵）。@returns 賺到多少 */
  earnFromRun(run, tuning = TUNING) {
    const m = tuning.run.meta;
    const gained = run.day * m.prestigePerDay + (run.outcome === 'won' ? m.winBonus : 0);
    this.prestige += gained;
    this.stats.runs += 1;
    if (run.outcome === 'won') this.stats.wins += 1;
    this.stats.bestDay = Math.max(this.stats.bestDay, run.day);
    return gained;
  }

  /** 把已買升級疊進一局新 run（RunState 建構時呼叫）。 */
  applyToRun(run) {
    for (const id of META_UPGRADE_IDS) {
      const lvl = this.level(id);
      if (lvl > 0) getUpgrade(id).apply(run, lvl);
    }
  }

  toJSON() {
    return { prestige: this.prestige, levels: { ...this.levels }, stats: { ...this.stats } };
  }
}
