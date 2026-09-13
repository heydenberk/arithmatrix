/**
 * Scoring calibration, derived from the corpus by scripts/calibrate-scoring.ts
 * under scoring version 2 on 2026-09-13.
 * Generated; do not edit by hand. Re-run the script after a scoring change.
 *
 * Per-size quantiles assign the named band within a size (bottom 20% easiest
 * ... top 20% expert). Cross-size anchors map a raw score to the 0-100 display
 * number the same way for every size.
 */

export const CALIBRATION_SCORING_VERSION = 2;

/** Raw-score q20, q40, q60, q80 within each size. */
export const SIZE_BAND_QUANTILES: Record<number, [number, number, number, number]> = {
  4: [5.2, 5.5, 5.9, 6.4],
  5: [7.3, 7.7, 8.2, 9],
  6: [9.8, 10.8, 12.1, 32.5],
  7: [12.9, 22, 73.3, 180.9],
};

/** Raw-score q20, q40, q60, q80 over every size, and the largest raw score seen. */
export const CROSS_SIZE_ANCHORS: [number, number, number, number] = [6.4, 8.4, 11.4, 34.5];
export const CROSS_SIZE_MAX = 4293.7;
