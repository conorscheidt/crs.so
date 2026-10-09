/**
 * Rotation, projection and the cursor dimple, mirrored in sim/shader.wgsl.
 * Weak-perspective camera at a fixed distance; the dimple is applied in screen
 * space after projection.
 */
import type { Pt } from "./shapes";

export interface Frame {
	/** canvas size in device px */
	w: number;
	h: number;
	/** rotation as cos/sin pairs, filled once per frame by pose() */
	cosY: number;
	sinY: number;
	cosX: number;
	sinX: number;
	cosZ: number;
	sinZ: number;
	/** cursor in device px; cursorActive (0..1) scales the dimple */
	cx: number;
	cy: number;
	cursorActive: number;
	/** dimple radius in device px (cursorR × dpr) */
	dimpleR: number;
}

const CAM_Z = 4;
const LIGHT = [-0.45, -0.55, 0.7] as const;

export interface Projected {
	sx: number;
	sy: number;
	/** rotated depth — positive is toward the viewer */
	depth: number;
	/** lighting multiplier for front points */
	lit: number;
}

/** yaw already includes phase × rate */
export function pose(f: Frame, yaw: number, tiltX: number, tiltZ: number): void {
	f.cosY = Math.cos(yaw);
	f.sinY = Math.sin(yaw);
	f.cosX = Math.cos(tiltX);
	f.sinX = Math.sin(tiltX);
	f.cosZ = Math.cos(tiltZ);
	f.sinZ = Math.sin(tiltZ);
}

export function project(p: Pt, f: Frame, out: Projected): void {
	const { cosY: cy, sinY: sy, cosX: cx, sinX: sx, cosZ: cz, sinZ: sz } = f;
	const x1 = p.x * cy + p.z * sy;
	const z1 = -p.x * sy + p.z * cy;
	const y2 = p.y * cx - z1 * sx;
	const z2 = p.y * sx + z1 * cx;
	const x3 = x1 * cz - y2 * sz;
	const y3 = x1 * sz + y2 * cz;

	const k = Math.min(f.w, f.h) * 0.3;
	const persp = CAM_Z / (CAM_Z - z2 * 0.55);
	let sxp = f.w / 2 + x3 * k * persp;
	let syp = f.h / 2 + y3 * k * persp;

	if (f.cursorActive > 0.001) {
		const dx = sxp - f.cx;
		const dy = syp - f.cy;
		const r2 = dx * dx + dy * dy;
		const rr = f.dimpleR * f.dimpleR;
		const push = Math.exp(-r2 / (rr * 4)) * f.dimpleR * 0.7 * f.cursorActive;
		const d = Math.sqrt(r2) + 1e-4;
		sxp += (dx / d) * push;
		syp += (dy / d) * push;
	}

	const pl = Math.hypot(x3, y3, z2) || 1;
	const lit = Math.max(0, (x3 * LIGHT[0] + y3 * LIGHT[1] + z2 * LIGHT[2]) / pl);
	out.sx = sxp;
	out.sy = syp;
	out.depth = z2;
	out.lit = lit;
}

/** Smaller dots widen to this radius (device px) and fade to keep their ink. */
export const MIN_DOT_R = 1.4;

export interface Shade {
	a: number;
	/** radius in device px */
	r: number;
}

/**
 * Depth shading, mirrored in WGSL: alpha and size fall off smoothly with depth
 * so nothing pops. `gain` boosts density for dark ink on light paper. Below
 * MIN_DOT_R a dot's grid coverage swings with its sub-pixel offset, so it
 * trades size for alpha instead.
 */
export function shade(
	baseAlpha: number,
	depth: number,
	lit: number,
	gain: number,
	dotR: number,
	out: Shade,
): void {
	const c = Math.min(1, Math.max(0, (depth + 1.1) / 2.2));
	const dt = c * c * (3 - 2 * c);
	const size = dotR * (0.62 + 0.38 * dt);
	const r = Math.max(size, MIN_DOT_R);
	const keep = size / r;
	out.a =
		Math.min(0.92, baseAlpha * (0.28 + 0.72 * dt) * (0.6 + 0.5 * lit * dt) * gain) * keep * keep;
	out.r = r;
}

/** Alpha gain by ink luminance, mirrored in WGSL: ≈1.55 by day, ≈1.08 at night. */
export function inkGain(r: number, g: number, b: number): number {
	return 1 + 0.62 * (1 - (0.2126 * r + 0.7152 * g + 0.0722 * b));
}
