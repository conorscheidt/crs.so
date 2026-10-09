/**
 * The cursor's wake, mirrored in sim/shader.wgsl. Every dot carries a
 * screen-space offset on a critically damped spring. A cursor passing within
 * WAKE_R pushes the dots it meets away and drags them a little along with
 * it; the dots keep streaming along their strands while the offset heals, so
 * a parted wake drifts downstream. Lengths are CSS px, scaled by dpr.
 */

/** Reach of the cursor (CSS px). */
export const WAKE_R = 46;
/** Push straight away from the cursor at its centre (CSS px/s²). */
export const WAKE_PUSH = 1700;
/** Share of the cursor's velocity handed per second to a dot at its centre. */
export const WAKE_DRAG = 0.7;
/** Spring rate home (rad/s); critically damped, so it settles without a wobble. */
export const WAKE_W0 = 6;

/**
 * Acceleration (device px/s²) on a dot at (dx, dy) device px from the cursor,
 * which moves at (cvx, cvy) device px/s. `active` (0..1) fades the cursor in
 * and out.
 */
export function wakeForce(
	dx: number,
	dy: number,
	cvx: number,
	cvy: number,
	active: number,
	dpr: number,
	out: [number, number],
): void {
	const r = WAKE_R * dpr;
	const d = Math.hypot(dx, dy);
	if (d >= r || active <= 0) {
		out[0] = 0;
		out[1] = 0;
		return;
	}
	const f = (1 - d / r) ** 2 * active;
	const push = (WAKE_PUSH * dpr) / Math.max(d, 1e-4);
	out[0] = (dx * push + cvx * WAKE_DRAG) * f;
	out[1] = (dy * push + cvy * WAKE_DRAG) * f;
}

/**
 * One exact step of x'' = a − w²x − 2wx' over dt, holding a constant, so the
 * wake looks the same at any frame rate. `decay` is exp(−WAKE_W0 · dt),
 * shared by every dot in a frame. Writes (x, v).
 */
export function spring(
	x: number,
	v: number,
	a: number,
	dt: number,
	decay: number,
	out: [number, number],
): void {
	const w = WAKE_W0;
	const rest = a / (w * w);
	const y = x - rest;
	const c = v + w * y;
	out[0] = rest + (y + c * dt) * decay;
	out[1] = (v - w * c * dt) * decay;
}
