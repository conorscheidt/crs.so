/**
 * A fast dot is drawn as the stroke a short exposure would catch: a capsule
 * back along its motion since the last frame, thinned so it lays the same ink
 * as the disc. Slow drift and ordinary drags stay discs; hard flicks and
 * quick morphs streak. Mirrored in sim/shader.wgsl.
 */

/** Screen speeds (CSS px/s) where a streak begins and where it is whole. */
export const SHUTTER_FROM = 500;
export const SHUTTER_TO = 1400;
/** Exposure (s), and the longest streak (CSS px). */
export const SHUTTER_EXPOSURE = 0.012;
export const SHUTTER_MAX = 16;
/**
 * A step longer than this share of the projection's scale is a dot wrapping
 * to the far end of its strand, not motion.
 */
export const SHUTTER_JUMP = 0.4;

/**
 * Streak length (device px) behind a dot that moved `step` device px in `dt`
 * s, with the projection `scale` device px to the unit.
 */
export function streak(step: number, dt: number, scale: number, dpr: number): number {
	if (!(dt > 0) || step > SHUTTER_JUMP * scale) return 0;
	const speed = step / dt;
	const c = Math.min(1, Math.max(0, (speed / dpr - SHUTTER_FROM) / (SHUTTER_TO - SHUTTER_FROM)));
	return Math.min(speed * SHUTTER_EXPOSURE, SHUTTER_MAX * dpr) * c * c * (3 - 2 * c);
}

/** Alpha kept by a capsule of radius r and core length len, to lay a disc's ink. */
export function exposure(r: number, len: number): number {
	return (Math.PI * r) / (Math.PI * r + 2 * len);
}
