import { getCardDef, CARD_TYPE } from './CardLibrary.js';
import { TUNING } from '../config/tuning.js';

/**
 * 三輪連線拉霸。零 Phaser —— 只算符號與獎勵，動畫交給 SlotScene。
 *
 * 每輪各轉一個符號；三連＝該符號大獎、兩連＝小銀兩、全不同＝安慰銀兩。
 * 速通代幣消化用，期望值刻意壓低（見 tuning.run.slot）。
 */

export const SLOT_SYMBOLS = ['coin', 'sword', 'poison', 'fire', 'gourd', 'dud'];
export const SLOT_SYMBOL_LABEL = {
  coin: '金',
  sword: '劍',
  poison: '毒',
  fire: '火',
  gourd: '葫',
  dud: '囧',
};

/** 依權重抽一個符號 */
function pickSymbol(rng, weights) {
  const total = SLOT_SYMBOLS.reduce((s, k) => s + (weights[k] ?? 0), 0);
  let r = rng() * total;
  for (const k of SLOT_SYMBOLS) {
    r -= weights[k] ?? 0;
    if (r < 0) return k;
  }
  return SLOT_SYMBOLS[SLOT_SYMBOLS.length - 1];
}

/** 轉三輪，回傳三個符號 */
export function spinReels(rng, tuning = TUNING) {
  const w = tuning.run.slot.symbols;
  return [pickSymbol(rng, w), pickSymbol(rng, w), pickSymbol(rng, w)];
}

/** 牌組中「攻擊牌」的索引（附魔只對攻擊牌有意義） */
function attackIndexes(deck) {
  const out = [];
  deck.forEach((spec, i) => {
    if (getCardDef(spec.defId).type === CARD_TYPE.ATTACK) out.push(i);
  });
  return out;
}

/**
 * 依三個符號算出獎勵描述（不套用，交給 applySlotReward）。
 * 需要 run 是因為「附魔」要挑一張牌組裡的攻擊牌當目標。
 * @returns { kind:'coins'|'card'|'enchant'|'dud', ...細節, label }
 */
export function resolveSlotReward(reels, run, rng, tuning = TUNING) {
  const slot = tuning.run.slot;
  const counts = {};
  for (const s of reels) counts[s] = (counts[s] ?? 0) + 1;
  const trip = SLOT_SYMBOLS.find((s) => counts[s] === 3);

  if (trip) {
    const jp = slot.jackpot[trip];
    if (trip === 'dud') return { kind: 'dud', label: '三囧…槓龜' };
    if (trip === 'coin') return { kind: 'coins', amount: jp, label: `三金！＋${jp} 銀兩` };
    if (trip === 'gourd') return { kind: 'coins', amount: jp, label: `葫蘆大獎！＋${jp} 銀兩` };
    if (trip === 'sword') {
      const pool = slot.rewardCardPool;
      const defId = pool[Math.floor(rng() * pool.length)];
      return { kind: 'card', defId, label: `三劍！獲得【${getCardDef(defId).name}】` };
    }
    // poison / fire → 牌組某攻擊牌附魔（給 level，實際層數出牌時按傷害算）
    const targets = attackIndexes(run.deck);
    if (!targets.length) return { kind: 'coins', amount: slot.pairCoins, label: `＋${slot.pairCoins} 銀兩` };
    const idx = targets[Math.floor(rng() * targets.length)];
    const zh = jp.status === 'poison' ? '毒' : '火';
    return {
      kind: 'enchant',
      targetIndex: idx,
      statusId: jp.status,
      level: jp.level,
      label: `三${SLOT_SYMBOL_LABEL[trip]}！【${getCardDef(run.deck[idx].defId).name}】附${zh} Lv${jp.level}`,
    };
  }

  const pair = SLOT_SYMBOLS.find((s) => counts[s] === 2);
  if (pair) return { kind: 'coins', amount: slot.pairCoins, label: `兩連 ＋${slot.pairCoins} 銀兩` };
  return { kind: 'coins', amount: slot.missCoins, label: `沒對上… ＋${slot.missCoins} 銀兩` };
}

/** 轉一次：回傳 { reels, reward }。reward 尚未套用（讓 UI 先演轉輪再結算）。 */
export function spinSlot(run, rng, tuning = TUNING) {
  const reels = spinReels(rng, tuning);
  const reward = resolveSlotReward(reels, run, rng, tuning);
  return { reels, reward };
}

/** 把獎勵套用到 run。@returns reward（方便串接） */
export function applySlotReward(run, reward) {
  switch (reward.kind) {
    case 'coins':
      run.money += reward.amount;
      break;
    case 'card':
      run.addDeckCard(reward.defId);
      break;
    case 'enchant':
      run.enchantDeckCard(reward.targetIndex, reward.statusId, reward.level);
      break;
    case 'dud':
    default:
      break;
  }
  return reward;
}
