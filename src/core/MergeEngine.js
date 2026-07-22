import { mergeCards, rankUpCard } from './Card.js';
import { TX } from './transcript.js';
import { TUNING } from '../config/tuning.js';

/**
 * 合成引擎：同步解算整條連鎖，UI 只重播 transcript。
 * 卡牌實例不可變；合成與忘形升階都產出新 uid。
 * ctx 契約：{ hand, deck, exhaustPile, inspiration, mergesThisTurn }。
 */
export { TX };

function atRankCap(rank, tuning = TUNING) {
  const cap = tuning.maxRank;
  return cap != null && rank >= cap;
}

/** 由左至右找第一組同名、同階、尚未到自動合成上限的牌。 */
export function findFirstAutoMergePair(hand, tuning = TUNING) {
  for (let i = 0; i < hand.size; i++) {
    const a = hand.get(i);
    if (a.rank == null || atRankCap(a.rank, tuning)) continue;
    for (let j = i + 1; j < hand.size; j++) {
      const b = hand.get(j);
      if (a.defId === b.defId && a.rank === b.rank) return [i, j];
    }
  }
  return null;
}

/**
 * 增加靈感並把每滿 threshold 的份額立即換成抽牌；餘數跨回合留在 ctx。
 * 抽出的牌只加入手牌，是否合成由呼叫端接著 resolveAutoMerges 統一解算。
 */
export function gainInspiration(ctx, amount, transcript, tuning = TUNING, source = 'effect') {
  const threshold = tuning.inspiration.threshold;
  const points = Math.max(0, Math.floor(amount));
  let current = ctx.inspiration ?? 0;
  let draws = 0;

  // 一點一個事件；第三點後立刻穿插 DRAW，讓 UI 能忠實重播「逐顆長出 → 滿格抽牌」。
  for (let i = 0; i < points; i++) {
    const before = current;
    const filled = before + 1;
    const triggered = filled >= threshold;
    current = triggered ? 0 : filled;
    transcript.push({
      type: TX.INSPIRATION,
      source,
      amount: 1,
      before,
      after: current,
      draws: triggered ? 1 : 0,
      threshold,
    });

    if (triggered) {
      draws += 1;
      const drawn = ctx.deck.draw();
      if (drawn) {
        ctx.hand.add(drawn);
        transcript.push({ type: TX.DRAW, card: drawn, source: 'inspiration' });
      } else {
        transcript.push({ type: TX.DRAW_FIZZLE, source: 'inspiration' });
      }
    }
  }
  ctx.inspiration = current;
  return draws;
}

/** 反覆解算同名同階自動合成，直到不動點。 */
export function resolveAutoMerges(ctx, tuning = TUNING) {
  const transcript = [];
  let guard = 0;

  for (;;) {
    if (guard++ >= tuning.maxChainGuard) {
      transcript.push({ type: TX.CHAIN_GUARD_TRIPPED });
      break;
    }
    const pair = findFirstAutoMergePair(ctx.hand, tuning);
    if (!pair) break;

    const [i, j] = pair;
    const a = ctx.hand.get(i);
    const b = ctx.hand.get(j);
    const result = mergeCards(a, b);

    ctx.hand.removeAt(j);
    ctx.hand.removeAt(i);
    ctx.hand.insertAt(i, result);
    ctx.mergesThisTurn += 1;
    transcript.push({
      type: TX.MERGE,
      auto: true,
      consumed: [a.uid, b.uid],
      result,
      handIndex: i,
    });
    gainInspiration(ctx, tuning.inspiration.perMerge, transcript, tuning, 'merge');
  }

  return transcript;
}

/** 忘形必須由玩家拖到一張具體、有階級且不是忘形的牌上。 */
export function canWangxingPump(wangxing, target) {
  return Boolean(
    wangxing
      && target
      && wangxing.uid !== target.uid
      && wangxing.defId === 'wangXing'
      && target.defId !== 'wangXing'
      && target.rank != null
  );
}

/**
 * 忘形施放：目標升一階（可超過 maxRank）、忘形本場消耗，接著跑自動合成鏈。
 * 升階本身視同一次合成：增加 mergesThisTurn，並獲得合成靈感。
 */
export function applyWangxingPump(ctx, wangxingUid, targetUid, tuning = TUNING) {
  const wi = ctx.hand.indexOfUid(wangxingUid);
  const ti = ctx.hand.indexOfUid(targetUid);
  if (wi === -1 || ti === -1 || wi === ti) return null;

  const wangxing = ctx.hand.get(wi);
  const target = ctx.hand.get(ti);
  if (!canWangxingPump(wangxing, target)) return null;

  const result = rankUpCard(target);
  const targetIndexAfterWangxing = wi < ti ? ti - 1 : ti;
  ctx.hand.removeAt(wi);
  ctx.hand.removeAt(targetIndexAfterWangxing);
  ctx.hand.insertAt(targetIndexAfterWangxing, result);
  ctx.exhaustPile.push(wangxing);

  const transcript = [
    { type: TX.EXHAUST, card: wangxing },
    {
      type: TX.RANK_UP,
      consumed: target.uid,
      result,
      handIndex: targetIndexAfterWangxing,
    },
  ];
  ctx.mergesThisTurn += 1;
  gainInspiration(ctx, tuning.inspiration.perMerge, transcript, tuning, 'wangxing');
  return transcript.concat(resolveAutoMerges(ctx, tuning));
}
