import { mergeCards, isFormless, isRealmless } from './Card.js';
import { TX } from './transcript.js';
import { TUNING } from '../config/tuning.js';

/**
 * 合成引擎。
 *
 * 這裡同步解算整條連鎖到不動點，產出一份「劇本」(transcript) 交給 UI 播。
 * 邏輯是瞬間完成的，動畫是兩秒的事 —— 兩者不能綁在一起，否則連鎖合成
 * 必然出現動畫與狀態打架。
 *
 * 不變量：卡牌物件視為不可變。合成永遠產出新物件（新 uid），
 * 不就地改寫舊卡。因此 transcript 裡放參照是安全的。
 *
 * ctx 契約：{ hand, deck, rng, mergesThisTurn }
 *   rng            可注入，否則機率補抽會讓測試變成擲骰子
 *   mergesThisTurn 補抽機率的遞減依據，由呼叫端每回合歸零
 */

export { TX };

function clampRealm(realm, tuning) {
  if (realm == null) return realm; // realmless 不夾
  const cap = tuning.maxRealm;
  return cap == null ? realm : Math.min(realm, cap);
}

/**
 * 這張牌到頂了嗎？到頂就**不再合成**（境界 +1 會超過上限）。
 * realmless（催化劑）永遠沒到頂 —— 它自己不帶境界，是把別人 +1 的材料。
 */
function atRealmCap(realm, tuning = TUNING) {
  const cap = tuning.maxRealm;
  return cap != null && realm != null && realm >= cap;
}

/**
 * 這次合成的補抽機率。
 * 同回合內每合成一次就降一截，避免「兩張就能合成」配上必抽而失控。
 */
export function drawChanceFor(mergesThisTurn, tuning = TUNING) {
  const { baseChance, decayPerMerge, minChance } = tuning.mergeDraw;
  return Math.max(minChance, baseChance - (mergesThisTurn - 1) * decayPerMerge);
}

/**
 * 由左至右掃，回傳第一組可自動合成的配對 [i, j]（i < j）。
 *
 * 自動合成的條件是**同名且同境界**（同 defId + 同 realm）——
 * 劈一 + 劈一 → 劈二（境界 +1），但劈二 + 劈一 不會合成。
 * 帶忘形 tag 的卡照樣參與同名同境界合成，且不會被燒掉（見 mergeCards）。
 * 忘形催化劑（realmless）不參與自動合成 —— 它是玩家手動拖曳才用的萬用材料。
 *
 * 順序固定是必要的：境界 +1 雖與配對順序無關，但「中途補抽到什麼牌」會受順序影響，
 * 所以必須決定性。
 */
export function findFirstAutoMergePair(hand, tuning = TUNING) {
  for (let i = 0; i < hand.size; i++) {
    const a = hand.get(i);
    if (isRealmless(a)) continue; // 催化劑不自動合成
    if (atRealmCap(a.realm, tuning)) continue; // 到頂的牌不再併
    for (let j = i + 1; j < hand.size; j++) {
      const b = hand.get(j);
      if (a.defId === b.defId && a.realm === b.realm) return [i, j];
    }
  }
  return null;
}

/** 合成後的機率補抽。骰輸與牌庫空是兩回事，分別記事件。 */
function drawAfterMerge(ctx, transcript, tuning) {
  const chance = drawChanceFor(ctx.mergesThisTurn, tuning);

  if (ctx.rng() >= chance) {
    transcript.push({ type: TX.DRAW_MISS, chance });
    return;
  }

  const drawn = ctx.deck.draw();
  if (drawn) {
    ctx.hand.add(drawn);
    transcript.push({ type: TX.DRAW, card: drawn, chance });
  } else {
    transcript.push({ type: TX.DRAW_FIZZLE, chance });
  }
}

/**
 * 反覆解算同名自動合成直到不動點。
 *
 * 終止性：每次合成消耗 2 張產出 1 張，全系統（手牌＋牌庫＋棄牌堆）
 * 卡牌總數嚴格 −1，故合成次數 ≤ 總牌數，必然終止。機率補抽只會讓鏈更短。
 * maxChainGuard 純粹是改壞邏輯時的防凍結保險，不是遊戲規則。
 */
export function resolveAutoMerges(ctx, tuning = TUNING) {
  const { hand } = ctx;
  const transcript = [];
  let guard = 0;

  for (;;) {
    if (guard++ >= tuning.maxChainGuard) {
      transcript.push({ type: TX.CHAIN_GUARD_TRIPPED });
      break;
    }

    const pair = findFirstAutoMergePair(hand, tuning);
    if (!pair) break;

    const [i, j] = pair;
    const a = hand.get(i);
    const b = hand.get(j);

    // 同名合成兩張的 defId 相同，故主體是誰不影響名字與效果，
    // 取左邊那張只是為了決定性。附魔匯總受上限約束、超過隨機篩（見 mergeCards），故要吃 rng。
    const result = mergeCards(a, b, { rng: ctx.rng, tuning });
    result.realm = clampRealm(result.realm, tuning);

    // 先移除較大的 index，否則 i 會失效
    hand.removeAt(j);
    hand.removeAt(i);
    hand.insertAt(i, result);

    ctx.mergesThisTurn += 1;
    transcript.push({
      type: TX.MERGE,
      auto: true,
      consumed: [a.uid, b.uid],
      result,
      handIndex: i,
    });

    drawAfterMerge(ctx, transcript, tuning);
  }

  return transcript;
}

/**
 * 兩張牌能不能由玩家拖曳合成？兩條軸都要過：
 *
 *   境界軸：同境界，或其中一張是 realmless 催化劑（催化劑對境界限制免疫）。
 *   名字軸：同名，或其中一張帶忘形（忘形＝跨名通行證，催化劑本身就帶忘形）。
 *
 * 例：忘形附魔劈三 + 暗器三 ✔（同境界、靠忘形跨名）
 *     忘形附魔劈三 + 暗器五 ✘（境界不符）
 *     劈三 + 暗器三 ✘（跨名卻無忘形）
 *     催化劑 + 任意牌 ✔（realmless 且帶忘形）
 *     催化劑 + 境界五 ✘（主體已到頂，+1 會超過上限）
 *
 * 上限軸：合成後的主體是「兩張中較高境界 +1」，若那張已到頂就不能再併 ——
 * 兩張境界五不能併，忘形也吃不動境界五。
 */
/** 這張牌能不能當「催化劑材料」（無視境界差、跨名）：realmless 催化劑，或帶忘形的具體卡。 */
function isCatalyst(card) {
  return isRealmless(card) || isFormless(card);
}

/**
 * 決定合成的主體（境界基準、名字來源）與材料（被消耗、只貢獻附魔）：
 *   剛好一張是催化劑 → 催化劑當材料、另一張當主體。
 *   都是／都不是催化劑 → 落點（target）即主體，dragged 當材料。
 */
function pickBodyMaterial(dragged, target) {
  const dc = isCatalyst(dragged);
  const tc = isCatalyst(target);
  if (dc && !tc) return { body: target, material: dragged };
  if (tc && !dc) return { body: dragged, material: target };
  return { body: target, material: dragged };
}

export function canFormlessMerge(a, b, tuning = TUNING) {
  if (!a || !b || a.uid === b.uid) return false;
  const catA = isCatalyst(a);
  const catB = isCatalyst(b);
  // 境界軸：同境界，或至少一張是催化劑（realmless／忘形 —— 催化劑無視境界差）
  const realmOk = catA || catB || a.realm === b.realm;
  // 名字軸：同名，或至少一張帶忘形（跨名通行證）
  const nameOk = a.defId === b.defId || isFormless(a) || isFormless(b);
  // 上限軸：結果 ＝ 主體境界 +1，主體是「非催化劑」那張（催化劑貢獻的境界不算）
  const bodyRealm =
    catA && !catB ? b.realm : catB && !catA ? a.realm : Math.max(a.realm ?? -Infinity, b.realm ?? -Infinity);
  const capOk = bodyRealm == null || bodyRealm === -Infinity || !atRealmCap(bodyRealm, tuning);
  return realmOk && nameOk && capOk;
}

/**
 * 忘形合成（玩家拖箭頭觸發）。
 *
 * 主體（保留名字與效果）與材料（合成後消失）的選法：
 *
 *   剛好一張是催化劑：催化劑無名無境界，永遠當材料，另一張當主體。
 *     結果 ＝ 主體境界 +1，且把催化劑的忘形附魔**印進**主體（忘形一律保留）。
 *     例：忘形催化劑 + 劈五 → 忘形劈六（之後可持續跨名合成）。
 *
 *   其餘（兩張具體卡、靠忘形 tag 跨名）：落點即主體，境界 +1。
 *
 * 附魔（燃燒/中毒…）與忘形一律相加保留（見 mergeCards），合成不會丟失任何附魔。
 * 無論主體是誰，結果都落在 target 的位置 —— 玩家把牌丟到那裡，眼睛就期待它留在那裡。
 *
 * 合成後必須接著跑自動合成鏈 —— 結果卡可能立刻與手牌中既有的同名同境界卡
 * 湊成對引爆連鎖。
 *
 * @returns transcript，或 null 表示這個配對不合法
 */
export function applyFormlessMerge(ctx, draggedUid, targetUid, tuning = TUNING) {
  const { hand } = ctx;
  const di = hand.indexOfUid(draggedUid);
  const ti = hand.indexOfUid(targetUid);
  if (di === -1 || ti === -1 || di === ti) return null;

  const dragged = hand.get(di);
  const target = hand.get(ti);
  if (!canFormlessMerge(dragged, target, tuning)) return null;

  const { body, material } = pickBodyMaterial(dragged, target);

  // 主體境界 +1、附魔匯總受上限約束、忘形（tag）保留（見 mergeCards）
  const result = mergeCards(body, material, { rng: ctx.rng, tuning });
  result.realm = clampRealm(result.realm, tuning);

  const targetIndexAfterRemoval = di < ti ? ti - 1 : ti;
  hand.removeAt(di);
  hand.removeAt(targetIndexAfterRemoval);
  hand.insertAt(targetIndexAfterRemoval, result);

  ctx.mergesThisTurn += 1;
  const transcript = [
    {
      type: TX.MERGE,
      auto: false,
      consumed: [dragged.uid, target.uid],
      result,
      handIndex: targetIndexAfterRemoval,
    },
  ];

  drawAfterMerge(ctx, transcript, tuning);

  return transcript.concat(resolveAutoMerges(ctx, tuning));
}
