import { getCardDef, CARD_DEFS } from './CardLibrary.js';
import { shuffleInPlace, defaultRng } from './rng.js';
import { TUNING } from '../config/tuning.js';

export const TAG = {
  /** 忘形：萬用合成材料。合成後即消失（一次性資源） */
  FORMLESS: 'formless',
};

let uidCounter = 0;

/** 測試用：讓 uid 可預測 */
export function resetUidCounter() {
  uidCounter = 0;
}

function nextUid() {
  return `c${uidCounter++}`;
}

/**
 * 兩份附魔相加：同一種魔 level 相加、不同種魔並存。永遠回傳新物件（不就地改寫）。
 * （enchants 存的是 level，不是層數；實際層數在出牌時依卡效果動態算 —— 見 BattleState.playCard）
 */
export function mergeEnchants(a = {}, b = {}) {
  const out = { ...a };
  for (const [id, n] of Object.entries(b)) out[id] = (out[id] ?? 0) + n;
  return out;
}

/**
 * 合成時匯總兩張的附魔，受**上限**約束：把每個附魔展開成「單位」（level-L ＝ L 個單位），
 * 兩張的單位倒進同一池；若總數超過 cap 就**隨機篩**到 cap（用注入的 rng，測試可重現），
 * 最後把留下的單位併回 level。忘形是 tag 不進這裡，不佔上限。
 */
export function combineEnchantsCapped(a = {}, b = {}, cap = Infinity, rng = defaultRng) {
  const units = [];
  for (const src of [a, b]) {
    for (const [id, level] of Object.entries(src)) {
      for (let i = 0; i < level; i++) units.push(id);
    }
  }
  const kept = units.length > cap ? shuffleInPlace(units.slice(), rng).slice(0, cap) : units;
  const out = {};
  for (const id of kept) out[id] = (out[id] ?? 0) + 1;
  return out;
}

/**
 * 生出一張戰鬥實例。實例只活在單場戰鬥內，合成改的都是實例。
 *
 * 只有「催化劑」旗標需要查牌表；其餘欄位都是純資料，不強制 defId 一定在牌表裡
 * —— 卡片實例是資料，不該綁死牌庫目錄。真正的 defId 驗證留給渲染層（displayName /
 * CardSprite 會查 getCardDef，打錯的 defId 在那裡就會爆）。
 *
 * enchants（附魔）是實例層資料（{ 狀態id: level }）：只放「外加」的附魔（拉霸/商店/事件/合成而來），
 * 卡片「自身」的狀態效果（毒霧的毒、火藥的火）走定義的 effectStatus，不進這裡。合成時 level 相加。
 *
 * 忘形催化劑（def.catalyst）是特例：不帶境界（realm = null）、強制帶忘形 tag，生成時釘死。
 */
export function createCard(defId, { realm = 1, tags = [], enchants = {} } = {}) {
  const catalyst = CARD_DEFS[defId]?.catalyst === true;
  return {
    uid: nextUid(),
    defId,
    realm: catalyst ? null : realm,
    tags: catalyst ? [...new Set([...tags, TAG.FORMLESS])] : [...tags],
    enchants: { ...enchants },
  };
}

export function hasTag(card, tag) {
  return card.tags.includes(tag);
}

/** 卡身上還有的附魔（層數 > 0），回傳 [[狀態id, 層數], ...]（未排序）。 */
export function cardEnchants(card) {
  return Object.entries(card.enchants ?? {}).filter(([, n]) => n > 0);
}

export function isFormless(card) {
  return hasTag(card, TAG.FORMLESS);
}

/**
 * 不帶境界的卡 —— 即忘形催化劑。
 * realmless 卡對「同境界才能合成」的限制免疫：它可以跟任何境界的卡合成。
 */
export function isRealmless(card) {
  return card.realm == null;
}

/**
 * 卡面顯示名。
 * 「忘形附魔卡」（帶境界又帶忘形 tag）加「忘形」前綴；
 * 催化劑本身就叫「忘形」，不加前綴，否則會變成「忘形忘形」。
 */
export function displayName(card) {
  const base = getCardDef(card.defId).name;
  return isFormless(card) && !isRealmless(card) ? `忘形${base}` : base;
}

/**
 * 合成後的新卡。
 *
 * @param body     主體 — 名字、效果、**境界基準**全取這張的（結果 ＝ 主體境界 +1）
 * @param material 材料 — 只貢獻附魔，然後消失（**它的境界被忽略**）
 * @param opts.rng    附魔超上限時的隨機篩選用
 * @param opts.tuning 附魔上限公式來源（tuning.enchantCap）
 *
 * 結果一律拿新 uid：對 UI 而言這是一個新生的物件，不是誰變身。
 *
 * 境界：**主體境界 +1**（不是取 max）—— 忘形/催化劑當材料時，它自己的境界不算數，
 *   所以「境界四忘形卡 拖到 境界一」＝ 境界二（見 MergeEngine 的催化劑判定）。主體 realmless 才回傳 null。
 * 附魔：兩張匯總，受主體新境界的**上限**約束，超過就隨機篩（見 combineEnchantsCapped）。
 * Tag 取聯集（忘形因此一律保留、不佔上限）。
 */
export function mergeCards(body, material, { rng = defaultRng, tuning = TUNING } = {}) {
  const tags = [...new Set([...body.tags, ...material.tags])];
  const realm = body.realm != null ? body.realm + 1 : material.realm != null ? material.realm + 1 : null;
  const cap = realm != null ? tuning.enchantCap(realm) : Infinity;
  return {
    uid: nextUid(),
    defId: body.defId,
    realm,
    tags,
    enchants: combineEnchantsCapped(body.enchants, material.enchants, cap, rng),
  };
}
