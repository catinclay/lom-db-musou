import { spinSlot, applySlotReward, SLOT_SYMBOL_LABEL } from './slot.js';
import { getCardDef } from './CardLibrary.js';

/**
 * 奇遇·江湖事件：白天池中的 'event' 節點內容。零 Phaser。
 *
 * 每個事件有一段敘事 ＋ 幾個選項。選項的 `resolve(run, rng)` 就地改動 RunState，
 * 回傳結果物件：
 *   { text }                 —— 立即事件，顯示這段結果文字後結束（RunState 標記完成、計入當天）。
 *   { text?, battle, battleKind } —— 觸發一場戰鬥（交給戰鬥流程結算 done/count，見 RunState.resolveEventChoice）。
 *
 * label 可以是字串或 (run)=>字串（想在標籤裡顯示花費時用）。
 * 每個事件都保證有一個「無風險」選項，玩家點進來不會被逼著冒險。
 */
export const EVENT_DEFS = {
  yeGu: {
    id: 'yeGu',
    offerRisk: 'normal',
    offerRole: 'story',
    name: '路邊野菇',
    text: '路邊冒出一叢顏色詭異的菇，聞起來有股說不上來的味道。看起來……能吃？',
    choices: [
      {
        label: '吃下去',
        desc: '也許有奇效，也許拉肚子',
        resolve: (run, rng) => {
          if (rng() < 0.5) {
            const pool = run.tuning.run.shop.cardPool;
            const defId = pool[Math.floor(rng() * pool.length)];
            run.addDeckCard(defId);
            return { text: `菇有奇效！你恍然悟出一招【${getCardDef(defId).name}】。` };
          }
          const dmg = run.tuning.run.event.mushroomPoison;
          run.hp = Math.max(1, run.hp - dmg);
          return { text: `毒菇！你上吐下瀉，扣了 ${dmg} 點血。` };
        },
      },
      {
        label: '不吃、繞道',
        desc: '安全第一',
        resolve: (run) => {
          const g = run.tuning.run.event.smallCoins;
          run.money += g;
          return { text: `你繞過菇叢，草裡撿到 ${g} 銀兩。` };
        },
      },
    ],
  },

  duFang: {
    id: 'duFang',
    offerRisk: 'normal',
    offerRole: 'chance',
    name: '賭坊',
    text: '煙霧瀰漫的賭坊，老闆搖著骰盅朝你笑：「客官，來一把？」',
    choices: [
      {
        label: (run) => `押 ${run.tuning.run.event.gambleCost} 銀兩試手氣`,
        desc: '拉一把三輪，聽天由命',
        resolve: (run, rng) => {
          const cost = run.tuning.run.event.gambleCost;
          if (run.money < cost) return { text: '你摸摸空空的錢袋，被老闆轟了出去。' };
          run.money -= cost;
          const { reels, reward } = spinSlot(run, rng);
          applySlotReward(run, reward);
          return { text: `${reels.map((r) => SLOT_SYMBOL_LABEL[r]).join(' ')}　—　${reward.label}` };
        },
      },
      { label: '不賭、走人', resolve: () => ({ text: '你搖搖頭，轉身離開。' }) },
    ],
  },

  chouJia: {
    id: 'chouJia',
    offerRisk: 'dangerous',
    offerRole: 'conflict',
    name: '仇家堵路',
    text: '一夥仇家攔在路中央，刀已出鞘：「此路是我開！」',
    choices: [
      {
        label: '拔刀相向',
        desc: '硬剛一場（精英），報酬較好',
        resolve: (run) => ({ text: '你迎上前去！', battle: run.battleConfig('elite', false), battleKind: 'elite' }),
      },
      {
        label: (run) => `塞 ${run.tuning.run.event.bribe} 銀兩買路`,
        desc: '花錢消災',
        resolve: (run) => {
          const b = run.tuning.run.event.bribe;
          if (run.money < b) {
            return { text: '你掏不出買路錢，只好硬著頭皮開打！', battle: run.battleConfig('elite', false), battleKind: 'elite' };
          }
          run.money -= b;
          return { text: `你塞了 ${b} 銀兩，仇家嘿嘿一笑讓開了路。` };
        },
      },
    ],
  },

  baoXiang: {
    id: 'baoXiang',
    offerRisk: 'normal',
    offerRole: 'story',
    name: '荒廟寶箱',
    text: '荒廟角落一口上鎖的舊木箱，鎖已鏽蝕。',
    choices: [
      {
        label: '撬開',
        desc: '也許有寶，也許有詐',
        resolve: (run, rng) => {
          const e = run.tuning.run.event;
          if (rng() < 0.7) {
            run.money += e.chestReward;
            return { text: `箱裡是白花花的 ${e.chestReward} 銀兩！` };
          }
          run.hp = Math.max(1, run.hp - e.chestTrap);
          return { text: `是機關！暗箭齊發，扣了你 ${e.chestTrap} 點血。` };
        },
      },
      { label: '不碰', resolve: () => ({ text: '你決定別惹麻煩，轉身離開。' }) },
    ],
  },

  langZhong: {
    id: 'langZhong',
    offerRisk: 'safe',
    offerRole: 'recovery',
    offerRecovery: true,
    name: '雲遊郎中',
    text: '一位雲遊郎中在樹下歇腳，藥箱敞開，笑瞇瞇地看著你。',
    choices: [
      {
        label: (run) => `求醫（${run.tuning.run.event.healPrice} 銀兩，回 ${run.tuning.run.event.healAmount} 血）`,
        resolve: (run) => {
          const e = run.tuning.run.event;
          if (run.hp >= run.maxHp) return { text: '郎中把脈後笑道：「你氣血充盈，回吧。」' };
          if (run.money < e.healPrice) return { text: '郎中搖頭：「沒錢，可治不了病。」' };
          run.money -= e.healPrice;
          run.hp = Math.min(run.maxHp, run.hp + e.healAmount);
          return { text: `郎中替你施針，回復了 ${e.healAmount} 點血。` };
        },
      },
      {
        label: (run) => `學一手（${run.tuning.run.event.cardPrice} 銀兩，加一張牌）`,
        resolve: (run, rng) => {
          const e = run.tuning.run.event;
          if (run.money < e.cardPrice) return { text: '郎中攤手：「束脩都出不起？」' };
          run.money -= e.cardPrice;
          const pool = run.tuning.run.shop.cardPool;
          const defId = pool[Math.floor(rng() * pool.length)];
          run.addDeckCard(defId);
          return { text: `郎中傳你一招【${getCardDef(defId).name}】。` };
        },
      },
      { label: '婉拒', resolve: () => ({ text: '你拱手道別，繼續趕路。' }) },
    ],
  },

  gaoRen: {
    id: 'gaoRen',
    offerRisk: 'safe',
    offerRole: 'growth',
    name: '高人指點',
    text: '崖邊一位白鬚高人閉目打坐，忽然睜眼：「小子，想練點什麼？」',
    choices: [
      {
        label: (run) => `練內力（${run.tuning.run.event.trainCost} 銀兩，內力 +1 格）`,
        resolve: (run) => {
          const c = run.tuning.run.event.trainCost;
          if (run.money < c) return { text: '高人搖頭：「連束脩都沒有，練什麼功。」' };
          run.money -= c;
          run.attrs.energyPerTurn += run.tuning.energyUnit;
          return { text: '高人拍你天靈，內力 +1 格。' };
        },
      },
      {
        label: (run) => `練身法（${run.tuning.run.event.trainCost} 銀兩，每回合起手 +1 張）`,
        resolve: (run) => {
          const c = run.tuning.run.event.trainCost;
          if (run.money < c) return { text: '高人搖頭：「沒錢免談。」' };
          run.money -= c;
          run.attrs.startingHandSize += 1;
          return { text: '一番指點，你身法更快，起手 +1 張。' };
        },
      },
      {
        label: (run) => `悟階級（${run.tuning.run.event.rankCost} 銀兩，階級上限 +1）`,
        resolve: (run) => {
          const c = run.tuning.run.event.rankCost;
          if (run.money < c) return { text: '高人嘆道：「悟透招式階級的機緣，可不便宜。」' };
          run.money -= c;
          run.attrs.maxRank += 1;
          return { text: '你福至心靈，階級上限 +1。' };
        },
      },
      { label: '婉拒', resolve: () => ({ text: '你搖頭：「晚輩緣分未到。」拱手離去。' }) },
    ],
  },

  yuanShou: {
    id: 'yuanShou',
    offerRisk: 'safe',
    offerRole: 'recovery',
    offerRecovery: true,
    specialOfferOnly: true,
    name: '山亭歇腳',
    text: '山雨忽至，路旁恰有一座無人的舊亭。簷下乾燥，石凳上還留著半壺溫水。',
    choices: [
      {
        label: '坐下調息片刻',
        desc: '雨聲掩去江湖喧囂',
        resolve: (run) => {
          const ratio = run.tuning.run.offer.lowHpMercy.healMaxHpRatio;
          const heal = Math.max(1, Math.ceil(run.maxHp * ratio));
          const before = run.hp;
          run.hp = Math.min(run.maxHp, run.hp + heal);
          return { text: `你運氣調息，恢復了 ${run.hp - before} 點血。除此之外，什麼也沒帶走。` };
        },
      },
    ],
  },
};

export const EVENT_IDS = Object.keys(EVENT_DEFS);

export function getEventDef(id) {
  const def = EVENT_DEFS[id];
  if (!def) throw new Error(`未知的奇遇: ${id}`);
  return def;
}

/** 選項標籤可能是字串或 (run)=>字串。 */
export function choiceLabel(choice, run) {
  return typeof choice.label === 'function' ? choice.label(run) : choice.label;
}
