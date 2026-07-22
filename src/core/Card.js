import { getCardDef, CARD_DEFS } from './CardLibrary.js';

let uidCounter = 0;

/** 測試用：讓 uid 可預測 */
export function resetUidCounter() {
  uidCounter = 0;
}

function nextUid() {
  return `c${uidCounter++}`;
}

/**
 * 生出一張戰鬥實例。實例只活在單場戰鬥內；階級與合成結果不跨戰鬥保存。
 * 未知 defId 仍可作為純資料建立，真正的牌表驗證留給顯示／出牌端。
 */
export function createCard(defId, { rank = 1, tags = [] } = {}) {
  return {
    uid: nextUid(),
    defId,
    rank: CARD_DEFS[defId]?.rankless ? null : rank,
    tags: [...tags],
  };
}

export function hasTag(card, tag) {
  return card.tags.includes(tag);
}

export function displayName(card) {
  return getCardDef(card.defId).name;
}

/**
 * 同名同階合成後的新卡：主體階級 +1、tag 聯集，永遠產出新 uid。
 * material 只貢獻 tag；兩張卡本身都不就地修改。
 */
export function mergeCards(body, material) {
  return {
    uid: nextUid(),
    defId: body.defId,
    rank: body.rank + 1,
    tags: [...new Set([...body.tags, ...material.tags])],
  };
}

/** 忘形施放用：一張具體牌升一階，保留名字與 tag，產出新 uid。 */
export function rankUpCard(card) {
  return {
    uid: nextUid(),
    defId: card.defId,
    rank: card.rank + 1,
    tags: [...card.tags],
  };
}
