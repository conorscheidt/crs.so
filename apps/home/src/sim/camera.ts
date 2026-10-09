/**
 * Rotation, projection and lighting, mirrored in sim/shader.wgsl.
 * Weak-perspective camera at a fixed distance. View space has y down the
 * screen and z toward the viewer.
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
}

const CAM_Z = 4;

/** Unit key light in view space, from the upper left front. */
export const LIGHT: readonly [number, number, number] = (() => {
	const l = Math.hypot(-0.45, -0.55, 0.7);
	return [-0.45 / l, -0.55 / l, 0.7 / l] as const;
})();
/** Tightness of the strand highlight. */
export const SPEC_POWER = 40;
/** Phase step between the two samples that give a dot its strand direction. */
export const TANGENT_EPS = 0.05;
/** A step ahead longer than this (squared) is a wrap, not a strand. */
export const WRAP_SQ = 0.01;

export interface Vec3 {
	x: number;
	y: number;
	z: number;
}

export interface Projected {
	sx: number;
	sy: number;
	/** rotated depth — positive is toward the viewer */
	depth: number;
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

/** World to view space: yaw (Y), then tiltX (X), then tiltZ (Z). */
export function rotate(f: Frame, x: number, y: number, z: number, out: Vec3): void {
	const { cosY: cy, sinY: sy, cosX: cx, sinX: sx, cosZ: cz, sinZ: sz } = f;
	const x1 = x * cy + z * sy;
	const z1 = -x * sy + z * cy;
	const y2 = y * cx - z1 * sx;
	out.x = x1 * cz - y2 * sz;
	out.y = x1 * sz + y2 * cz;
	out.z = y * sx + z1 * cx;
}

const view: Vec3 = { x: 0, y: 0, z: 0 };

export function project(p: Pt, f: Frame, out: Projected): void {
	rotate(f, p.x, p.y, p.z, view);
	const { x: x3, y: y3, z: z2 } = view;

	const k = Math.min(f.w, f.h) * 0.3;
	const persp = CAM_Z / (CAM_Z - z2 * 0.55);
	out.sx = f.w / 2 + x3 * k * persp;
	out.sy = f.h / 2 + y3 * k * persp;
	out.depth = z2;
}

export interface Strand {
	/** diffuse, 1 across the light and 0 along it */
	diff: number;
	/** highlight, 1 where the strand mirrors the light into the eye */
	spec: number;
}

/**
 * Kajiya-Kay: a dot is a short length of thread, lit by its direction rather
 * than as a ball. `t` is the view-space tangent at any length; its sign does
 * not matter. A zero tangent is taken as pointing at the viewer, which lights
 * evenly and never glints.
 */
export function strand(tx: number, ty: number, tz: number, out: Strand): void {
	const len = Math.hypot(tx, ty, tz);
	const ok = len > 1e-7;
	const x = ok ? tx / len : 0;
	const y = ok ? ty / len : 0;
	const z = ok ? tz / len : 1;
	const tl = x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2];
	const sl = Math.sqrt(Math.max(0, 1 - tl * tl));
	const sv = Math.sqrt(Math.max(0, 1 - z * z));
	out.diff = sl;
	out.spec = Math.min(1, Math.max(0, tl * z + sl * sv)) ** SPEC_POWER;
}

/** Smaller dots widen to this radius (device px) and fade to keep their ink. */
export const MIN_DOT_R = 1.4;

export interface Shade {
	a: number;
	/** radius in device px */
	r: number;
}

/**
 * Depth and strand shading, mirrored in WGSL. Alpha and size fall off smoothly
 * with depth so nothing pops, and the back of the object sits in its own
 * shadow. Light ink at night is the light itself: lit strands and glints gain
 * ink. Dark ink by day is the shadow: lit strands lose ink and a glint lets
 * the paper through. `night` (0..1) blends the two; `gain` boosts density for
 * dark ink on light paper. Below MIN_DOT_R a dot's grid coverage swings with
 * its sub-pixel offset, so it trades size for alpha instead.
 */
export function shade(
	baseAlpha: number,
	depth: number,
	diff: number,
	spec: number,
	gain: number,
	night: number,
	dotR: number,
	out: Shade,
): void {
	const c = Math.min(1, Math.max(0, (depth + 1.1) / 2.2));
	const dt = c * c * (3 - 2 * c);
	const occl = 0.35 + 0.65 * dt * dt;
	const lit = diff * occl;
	const glint = spec * occl;
	const nightTone = 0.24 + 0.63 * lit + 0.75 * glint;
	const dayTone = (0.32 + 0.7 * (1 - 0.6 * lit)) * (1 - 0.38 * glint);
	const tone = dayTone + (nightTone - dayTone) * night;
	const size = dotR * (0.62 + 0.38 * dt) * (1 + 0.3 * glint * night);
	const r = Math.max(size, MIN_DOT_R);
	const keep = size / r;
	out.a = Math.min(0.92, baseAlpha * (0.28 + 0.72 * dt) * tone * gain) * keep * keep;
	out.r = r;
}

/** Alpha gain by ink luminance, mirrored in WGSL: ≈1.55 by day, ≈1.08 at night. */
export function inkGain(r: number, g: number, b: number): number {
	return 1 + 0.62 * (1 - (0.2126 * r + 0.7152 * g + 0.0722 * b));
}

/** How far the ink is light-on-dark (1) rather than dark-on-light (0), mirrored in WGSL. */
export function inkNight(r: number, g: number, b: number): number {
	const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	return Math.min(1, Math.max(0, (lum - 0.25) / 0.5));
}
