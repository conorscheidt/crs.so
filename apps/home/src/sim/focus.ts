/**
 * Ink emphasis, mirrored in sim/shader.wgsl. A page item names a part of the
 * current object: weeks along the knot, a vertex of the icosahedron, bands of
 * latitude on the loxodrome, rings of the Borromean link. Its dots darken (or,
 * at night, brighten) and grow while every other dot recedes. Each dot eases
 * its own share of the focus, so one part crossfades into the next and a dot
 * streaming across a part's edge fades rather than flips.
 */
import { drawnT, ICO_EDGES, ICO_VERTS, icoS, knotT, LOX_SPAN, loxU, N } from "./shapes";

export type FocusSpec =
	| { weeks: number[] }
	| { vertex: number }
	| { latitudes: number[] }
	| { rings: number[] };

/** Time constant (s) of every fade in and out of focus. */
export const FOCUS_TAU = 0.11;
/** Alpha multipliers on dots outside the focus and on dots fully inside it. */
export const RECEDE = 0.35;
export const BRIGHT = 2;
/** Radius of a focused dot, as a multiple of its own. */
export const GROW = 1.5;
/** Weeks along the knot: week w is knotT in [w / 52, (w + 1) / 52). */
export const WEEKS = 52;
/** in weeks: how far a week's glow reaches past its own arc */
export const WEEK_SPREAD = 1.2;
/** Latitude bands the uniforms carry. */
export const FOCUS_LATS = 8;
/** Half-width (rad) of a latitude band, at 1/e. */
export const LAT_BAND = 0.07;
/** How much a focused vertex's edges fade toward their far end. */
export const VERTEX_FALL = 0.55;
/** Unused band slots sit here, far off the sphere. */
const NO_LAT = 1000;

/** A FocusSpec as the uniforms hold it. */
export interface Focus {
	/** the object it names, as OBJECT_INDEX; -1 for none */
	obj: number;
	/** weeks 0–31 and 32–51, one bit each */
	weeksLo: number;
	weeksHi: number;
	vertex: number;
	/** ring r is bit r */
	rings: number;
	lats: Float32Array;
}

export function noFocus(): Focus {
	return {
		obj: -1,
		weeksLo: 0,
		weeksHi: 0,
		vertex: 0,
		rings: 0,
		lats: new Float32Array(FOCUS_LATS).fill(NO_LAT),
	};
}

const whole = (n: number, below: number): boolean => Number.isInteger(n) && n >= 0 && n < below;

/** Only the first FOCUS_LATS latitudes are kept. */
export function encodeFocus(spec: FocusSpec | null, out: Focus): void {
	out.obj = -1;
	out.weeksLo = 0;
	out.weeksHi = 0;
	out.vertex = 0;
	out.rings = 0;
	out.lats.fill(NO_LAT);
	if (!spec) return;
	if ("weeks" in spec) {
		for (const w of spec.weeks) {
			if (!whole(w, WEEKS)) continue;
			if (w < 32) out.weeksLo = (out.weeksLo | (1 << w)) >>> 0;
			else out.weeksHi = (out.weeksHi | (1 << (w - 32))) >>> 0;
		}
		out.obj = 0;
	} else if ("vertex" in spec) {
		if (!whole(spec.vertex, ICO_VERTS.length)) return;
		out.vertex = spec.vertex;
		out.obj = 1;
	} else if ("latitudes" in spec) {
		const lats = spec.latitudes.filter(Number.isFinite).slice(0, FOCUS_LATS);
		out.lats.set(lats);
		out.obj = 2;
	} else {
		for (const r of spec.rings) if (whole(r, 3)) out.rings |= 1 << r;
		out.obj = 3;
	}
}

/** How much pool dot i of object `obj` belongs to the focus, 0..1. */
export function focusHot(obj: number, i: number, phase: number, f: Focus): number {
	if (obj !== f.obj) return 0;
	switch (obj) {
		case 0: {
			// A week is a short arc, so it glows a little past its ends.
			const x = knotT(i, N, phase) * WEEKS;
			const c = Math.floor(x);
			let m = 0;
			for (let w = Math.max(0, c - 2); w <= Math.min(WEEKS - 1, c + 2); w++) {
				if (!(((w >= 32 ? f.weeksHi : f.weeksLo) >>> (w % 32)) & 1)) continue;
				const d = (x - w - 0.5) / WEEK_SPREAD;
				m = Math.max(m, Math.exp(-d * d));
			}
			return m;
		}
		case 1: {
			const e = ICO_EDGES[i % 30] as readonly [number, number];
			const s = icoS(i, phase);
			if (e[0] === f.vertex) return 1 - VERTEX_FALL * s;
			if (e[1] === f.vertex) return 1 - VERTEX_FALL * (1 - s);
			return 0;
		}
		case 2: {
			const lat = (loxU(i, phase) * 2 - 1) * LOX_SPAN;
			let m = 0;
			for (const l of f.lats) m = Math.max(m, Math.exp(-(((lat - l) / LAT_BAND) ** 2)));
			return m;
		}
		default:
			return (f.rings >> (i % 3)) & 1;
	}
}

/**
 * The share pool dot i is easing toward. Mid-morph it belongs to each object
 * as far as it has been drawn into it; `k` is its draw key in the target.
 */
export function focusTarget(
	i: number,
	fromObj: number,
	toObj: number,
	morphT: number,
	k: number,
	phase: number,
	f: Focus,
): number {
	if (f.obj < 0) return 0;
	const t = morphT >= 1 || fromObj === toObj ? 1 : drawnT(morphT, k);
	return t * focusHot(toObj, i, phase, f) + (1 - t) * focusHot(fromObj, i, phase, f);
}

/** Share of the way to its target a fade covers in dt s; a held frame lands. */
export function focusEase(dt: number): number {
	return dt > 0 ? 1 - Math.exp(-dt / FOCUS_TAU) : 1;
}

export interface Emphasis {
	/** multipliers on a dot's base alpha and on its radius */
	a: number;
	r: number;
}

/** For focus fade `w` and a dot's eased share `hot`. */
export function emphasis(w: number, hot: number, out: Emphasis): void {
	const h = Math.min(hot, w);
	out.a = 1 - (1 - RECEDE) * w + (BRIGHT - RECEDE) * h;
	out.r = 1 + (GROW - 1) * h;
}

/**
 * Vertices in an order that keeps neighbours in the list apart on the solid:
 * each next one is adjacent to as few of those already taken as it can be,
 * first to none if possible. Antipodes count as no farther than two hops, so
 * an early pair is not split across the front and back.
 */
export const ICO_SPREAD: readonly number[] = (() => {
	const hops = (a: number, b: number): number =>
		ICO_EDGES.some((e) => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a)) ? 1 : 2;
	const order = [0];
	while (order.length < ICO_VERTS.length) {
		let best = -1;
		let bestSep = -1;
		let bestSum = -1;
		for (let v = 0; v < ICO_VERTS.length; v++) {
			if (order.includes(v)) continue;
			const sep = Math.min(...order.map((o) => hops(o, v)));
			const sum = order.reduce((acc, o) => acc + hops(o, v), 0);
			if (sep > bestSep || (sep === bestSep && sum > bestSum)) {
				best = v;
				bestSep = sep;
				bestSum = sum;
			}
		}
		order.push(best);
	}
	return order;
})();

/** Latitude (rad) of the post at chronological rank r of n: oldest south, newest north. */
export function postLatitude(rank: number, count: number): number {
	return count > 1 ? -1.2 + (2.4 * rank) / (count - 1) : 0;
}
