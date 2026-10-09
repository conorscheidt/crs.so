/**
 * Release speed for the dragged object: the least-squares slope of the last
 * WINDOW ms of drag, per second and capped. The release itself counts as a
 * sample where the pointer last was, so a flick that stopped before letting go
 * slows with the pause and dies once it is stale.
 */
import type { Trail } from "../cursor";

const WINDOW = 40;
const STALE = 50;

export function flick(trail: Trail, t: number, cap: number, out: [number, number]): void {
	out[0] = 0;
	out[1] = 0;
	if (trail.size === 0) return;
	const last = trail.newest();
	if (t - last.t > STALE) return;
	trail.push(t, last.x, last.y);
	trail.velocity(WINDOW, out);
	out[0] = Math.max(-cap, Math.min(cap, out[0] * 1000));
	out[1] = Math.max(-cap, Math.min(cap, out[1] * 1000));
}
