import { getEventDef } from './EventLibrary.js';

export const OFFER_RISK = Object.freeze({
  SAFE: 'safe',
  NORMAL: 'normal',
  DANGEROUS: 'dangerous',
});

const FIXED_CANDIDATES = Object.freeze([
  { kind: 'inn', risk: OFFER_RISK.SAFE, role: 'recovery', recovery: true },
  { kind: 'merchant', risk: OFFER_RISK.SAFE, role: 'trade' },
  { kind: 'dojo', risk: OFFER_RISK.SAFE, role: 'refine' },
  { kind: 'casino', risk: OFFER_RISK.NORMAL, role: 'chance' },
  { kind: 'battle', risk: OFFER_RISK.NORMAL, role: 'combat' },
  { kind: 'elite', risk: OFFER_RISK.DANGEROUS, role: 'combat' },
]);

function weightedPick(items, rng) {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (total <= 0) return items[0] ?? null;
  let roll = rng() * total;
  for (const item of items) {
    roll -= Math.max(0, item.weight);
    if (roll < 0) return item;
  }
  return items.at(-1) ?? null;
}

function candidateKey(candidate) {
  return candidate.kind === 'event' ? `event:${candidate.eventId}` : candidate.kind;
}

function candidatesFor(run, risk) {
  const config = run.tuning.run.offer;
  const fixed = FIXED_CANDIDATES
    .filter((candidate) => candidate.risk === risk)
    .filter((candidate) => candidate.kind !== 'casino' || run.slotTokens > 0)
    .filter((candidate) => candidate.kind !== 'inn' || run.canOfferInn())
    .map((candidate) => {
      let weight = config.kindWeights[candidate.kind] ?? 0;
      const cannotAfford = (candidate.kind === 'merchant' && run.money < run.tuning.run.shop.cardPrice.min)
        || (candidate.kind === 'dojo' && run.money < run.tuning.run.shop.removePrice);
      if (cannotAfford) weight *= config.unaffordableServiceWeightMultiplier;
      return { ...candidate, key: candidateKey(candidate), weight };
    });
  const events = Object.entries(config.eventWeights)
    .map(([eventId, weight]) => {
      const event = getEventDef(eventId);
      return {
        kind: 'event', eventId, risk: event.offerRisk, role: event.offerRole,
        recovery: event.offerRecovery === true,
        key: `event:${eventId}`, weight,
      };
    })
    .filter((candidate) => candidate.risk === risk);
  return [...fixed, ...events];
}

function chooseCandidate(run, risk, usedKeys, usedRoles) {
  const config = run.tuning.run.offer;
  let pool = candidatesFor(run, risk).filter((candidate) => !usedKeys.has(candidate.key));
  const freshRoles = pool.filter((candidate) => !usedRoles.has(candidate.role));
  if (freshRoles.length) pool = freshRoles;
  const recent = new Set(run.offerHistory.slice(-config.recentHistorySize));
  pool = pool.map((candidate) => ({
    ...candidate,
    weight: recent.has(candidate.key)
      ? candidate.weight * config.recentWeightMultiplier
      : candidate.weight,
  }));
  return weightedPick(pool, run.rng);
}

function shuffle(items, rng) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function toNode(run, candidate, slot) {
  const node = {
    id: `d${run.day}r${run.eventsDoneToday}s${slot}`,
    kind: candidate.kind,
    done: false,
  };
  if (candidate.eventId) node.eventId = candidate.eventId;
  return node;
}

export function offerRiskForNode(node) {
  if (node.kind === 'event') return getEventDef(node.eventId).offerRisk;
  return FIXED_CANDIDATES.find((candidate) => candidate.kind === node.kind)?.risk ?? OFFER_RISK.NORMAL;
}

export function offerRoleForNode(node) {
  if (node.kind === 'event') return getEventDef(node.eventId).offerRole;
  return FIXED_CANDIDATES.find((candidate) => candidate.kind === node.kind)?.role ?? node.kind;
}

export function offerKeyForNode(node) {
  return node.kind === 'event' ? `event:${node.eventId}` : node.kind;
}

/**
 * 依風險節奏先選「組成」，再從各池抽內容。風險只存在 core，不會顯示在 UI。
 * 同一組不重複內容，並優先讓三個選項至少涵蓋兩種功能。
 */
export function composeOffer(run) {
  const config = run.tuning.run.offer;
  const pattern = weightedPick(config.patterns, run.rng) ?? config.patterns[0];
  const usedKeys = new Set();
  const usedRoles = new Set();
  const candidates = pattern.risks.map((risk) => {
    const candidate = chooseCandidate(run, risk, usedKeys, usedRoles);
    if (!candidate) throw new Error(`無法為 offer 生成 ${risk} 選項`);
    usedKeys.add(candidate.key);
    usedRoles.add(candidate.role);
    return candidate;
  });

  const mercy = config.lowHpMercy;
  const hasUsableRecovery = candidates.some((candidate) => {
    if (!candidate.recovery) return false;
    if (candidate.kind === 'inn') return run.money >= run.tuning.run.shop.rest.price;
    if (candidate.eventId === 'langZhong') return run.money >= run.tuning.run.event.healPrice;
    return true;
  });
  const needsMercy = run.hp / run.maxHp < mercy.hpRatio
    && run.mercyUsed < mercy.maxPerRun
    && run.mercyUsedToday < mercy.maxPerDay
    && !hasUsableRecovery;
  if (needsMercy) {
    const replaceIndex = candidates.findIndex((candidate) => candidate.risk === OFFER_RISK.NORMAL);
    const index = replaceIndex >= 0 ? replaceIndex : candidates.length - 1;
    const event = getEventDef(mercy.eventId);
    candidates[index] = {
      kind: 'event', eventId: mercy.eventId, risk: event.offerRisk, role: event.offerRole,
      recovery: true, key: `event:${mercy.eventId}`, weight: 1,
    };
    run.mercyUsed += 1;
    run.mercyUsedToday += 1;
  }

  const shuffled = shuffle(candidates, run.rng);
  if (shuffled.some((candidate) => candidate.kind === 'inn')) run.noteInnOffered();
  run.offerSerial += 1;
  return shuffled.map((candidate, slot) => toNode(run, candidate, slot));
}
