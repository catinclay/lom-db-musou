import { TUNING } from '../config/tuning.js';

/**
 * 肩後攝影機的假 3D 投影。
 *
 * 不是俯視 —— 主角在左下、鏡頭從肩後往前看，敵人一排排由遠而近。
 * dist 越小＝越近＝越低越大；越遠＝越高（趨近地平線）越小、且向消失點收攏，
 * 所以前排會自然壓在後排上（配合 depth）。
 *
 * 純函式、零 Phaser，方便在測試裡驗數字。
 *
 * @param dist  該排到主角的步數（0 = 接觸，最近）
 * @param col   敵人在該排的第幾個（0-based）
 * @param nCols 該排總人數
 * @returns { x, y, scale }
 */
export function project(dist, col, nCols, view = TUNING.combat.view) {
  const { vanishX, horizonY, nearY, nearScale, rowGap, colSpacing } = view;

  // 透視收縮因子：dist 0 → 1，越遠越小
  const f = 1 / (1 + dist * rowGap);
  const scale = nearScale * f;

  // y 與 scale 用同一個因子，近的低、遠的貼地平線
  const y = horizonY + (nearY - horizonY) * f;

  // 同排向消失點收攏：近排展得寬、遠排窄
  const x = vanishX + (col - (nCols - 1) / 2) * colSpacing * scale;

  return { x, y, scale };
}

/**
 * 前排壓後排：dist 越小 depth 越高。
 * 用負值區間，讓整個敵陣落在手牌（depth ≥ 0）與主角背影之後。
 */
export function depthFor(dist) {
  return -10 - dist * 8;
}
