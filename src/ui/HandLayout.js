import { TUNING } from '../config/tuning.js';

/**
 * 扇形手牌佈局（殺戮尖塔風格）。
 *
 * 純函式，零 Phaser 依賴 —— 因為這是要反覆調到「看起來對」的東西，
 * 能在測試裡跑數字比開瀏覽器瞇眼睛快得多。
 *
 * 輸出的是「目標狀態」，不是動畫。呼叫端拿去 tween 過去即可，
 * 所以連鎖抽牌造成張數劇變時，畫面自然是平滑補間而不是跳變。
 */

const deg2rad = (d) => (d * Math.PI) / 180;

/**
 * @param n            手牌張數
 * @param opts.centerX 扇形中心 x
 * @param opts.baseY   扇形中央那張牌的 y
 * @param opts.focusIndex 目前 hover 的牌（null = 無）
 * @returns [{ x, y, rotation, depth, scale }]  rotation 為弧度
 */
export function computeLayout(n, opts = {}) {
  const {
    centerX = 800,
    baseY = 780,
    focusIndex = null,
    cardWidth = TUNING.hand.cardWidth,
    maxArcAngle = TUNING.hand.maxArcAngle,
    anglePerCard = TUNING.hand.anglePerCard,
    maxSpreadWidth = TUNING.hand.maxSpreadWidth,
    radius = TUNING.hand.radius,
    hoverScale = TUNING.hand.hoverScale,
    hoverLift = TUNING.hand.hoverLift,
    neighborNudge = TUNING.hand.neighborNudge,
    overlapFactor = 0.72,
  } = opts;

  if (n <= 0) return [];

  // 張數越多，扇形張角越大，但有上限
  const totalAngle = Math.min(n * anglePerCard, maxArcAngle);

  // 理想間距；手牌太多時壓縮到不超過 maxSpreadWidth（此時卡牌開始重疊）
  const idealSpacing = cardWidth * overlapFactor;
  const spacing = n > 1 ? Math.min(idealSpacing, maxSpreadWidth / (n - 1)) : 0;

  const out = [];
  for (let i = 0; i < n; i++) {
    // t ∈ [-0.5, 0.5]
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    const angleDeg = t * totalAngle;
    const angleRad = deg2rad(angleDeg);

    let x = centerX + (i - (n - 1) / 2) * spacing;
    // 扇形下垂：兩端比中央低
    let y = baseY + (1 - Math.cos(angleRad)) * radius;
    let rotation = angleRad;
    let scale = 1;
    let depth = i;

    if (focusIndex != null) {
      const dist = i - focusIndex;
      if (dist === 0) {
        // 被 hover 的牌：放大、上抬、擺正、置頂
        scale = hoverScale;
        y -= hoverLift;
        rotation = 0;
        depth = 1000;
      } else {
        // 鄰牌讓位，隨距離衰減
        const falloff = Math.max(0, 1 - (Math.abs(dist) - 1) / 2);
        x += Math.sign(dist) * neighborNudge * falloff;
      }
    }

    out.push({ x, y, rotation, depth, scale });
  }

  return out;
}

/** 手牌整體佔用的寬度（含卡牌本身寬度），debug 疊圖用 */
export function layoutWidth(n, opts = {}) {
  const layout = computeLayout(n, { ...opts, focusIndex: null });
  if (layout.length === 0) return 0;
  const cardWidth = opts.cardWidth ?? TUNING.hand.cardWidth;
  return layout[layout.length - 1].x - layout[0].x + cardWidth;
}
