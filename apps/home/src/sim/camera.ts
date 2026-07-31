/**
 * Rotation, projection and cursor dimple, mirrored in sim/shader.wgsl.
 * Weak-perspective camera at a fixed distance; the screen-space cursor
 * dimple is applied after projection.
 */
import type { Pt } from "./shapes";

export interface Frame {
	/** canvas size in device px */
	w: number;
	h: number;
	/** yaw already includes phase × rate */
	yaw: number;
	tiltX: number;
	tiltZ: number;
	/** cursor in device px; active=0 disables the dimple */
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

export function project(p: Pt, f: Frame, out: Projected): void {
	const cy = Math.cos(f.yaw);
	const sy = Math.sin(f.yaw);
	const cx = Math.cos(f.tiltX);
	const sx = Math.sin(f.tiltX);
	const cz = Math.cos(f.tiltZ);
	const sz = Math.sin(f.tiltZ);
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

	if (f.cursorActive > 0.5) {
		const dx = sxp - f.cx;
		const dy = syp - f.cy;
		const r2 = dx * dx + dy * dy;
		const rr = f.dimpleR * f.dimpleR;
		const push = Math.exp(-r2 / (rr * 4)) * f.dimpleR * 0.7;
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

/**
 * Continuous depth shading (parity with WGSL): alpha and size fall off
 * smoothly with depth, so there is no front/back pop.
 */
export function shade(baseAlpha: number, depth: number, lit: number): { a: number; s: number } {
	const c = Math.min(1, Math.max(0, (depth + 1.1) / 2.2));
	const dt = c * c * (3 - 2 * c);
	return {
		a: Math.min(0.9, baseAlpha * (0.28 + 0.72 * dt) * (0.6 + 0.5 * lit * dt)),
		s: 0.62 + 0.38 * dt,
	};
}
