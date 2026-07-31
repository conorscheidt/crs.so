/**
 * Closed-form point clouds, one per section. Every function maps
 * (instance i, total n, phase) → a point in object space ~[-1.1, 1.1]³ plus a
 * base alpha. `phase` is the CPU-integrated time accumulator, not raw
 * time × speed (speed changes would teleport the cloud).
 *
 * sim/shader.wgsl mirrors every formula here (shapes, morph + stagger,
 * rotation, projection, dimple, lighting); change both together. The TS side
 * is what the tests cover, and it doubles as the Canvas2D fallback.
 */
export type Section = "index" | "projects" | "writing" | "about";

export const OBJECT_INDEX: Record<Section, number> = {
	index: 0,
	projects: 1,
	writing: 2,
	about: 3,
};

/** Per-object base camera pitch (radians) — lerped through morphs. */
export const BASE_PITCH = [0.16, 0.16, 0.38, 0.32] as const;

export const N = 3000;
/** Icosahedron vertex accents ride as extra instances after the pool. */
export const N_ACCENT = 12;

const TAU = Math.PI * 2;

/** Deterministic per-instance hash in [0,1) — mirrored in WGSL. */
export function hash(i: number, salt: number): number {
	const x = Math.sin(i * 127.1 + salt * 311.7) * 43_758.5453;
	return x - Math.floor(x);
}

export interface Pt {
	x: number;
	y: number;
	z: number;
	a: number;
}

/** 0 · Index — trefoil knot, points streaming along the curve. */
export function trefoil(i: number, n: number, phase: number, out: Pt): void {
	const u = (i / n) * TAU + phase * 0.26;
	const w = 2 + Math.cos(3 * u);
	out.x = (w * Math.cos(2 * u)) / 2.75 + (hash(i, 1) - 0.5) * 0.06;
	out.y = Math.sin(3 * u) / 1.85 + (hash(i, 2) - 0.5) * 0.06;
	out.z = (w * Math.sin(2 * u)) / 2.75 + (hash(i, 3) - 0.5) * 0.06;
	out.a = 0.62;
}

/** Icosahedron geometry — 12 verts, 30 edges (computed once, both sides). */
const PHI = (1 + Math.sqrt(5)) / 2;
const VNORM = Math.hypot(1, PHI);
const RAW_VERTS: [number, number, number][] = [
	[0, 1, PHI],
	[0, 1, -PHI],
	[0, -1, PHI],
	[0, -1, -PHI],
	[1, PHI, 0],
	[1, -PHI, 0],
	[-1, PHI, 0],
	[-1, -PHI, 0],
	[PHI, 0, 1],
	[-PHI, 0, 1],
	[PHI, 0, -1],
	[-PHI, 0, -1],
];
export const ICO_VERTS: readonly (readonly [number, number, number])[] = RAW_VERTS.map(
	([x, y, z]) => [x / VNORM, y / VNORM, z / VNORM] as const,
);

export const ICO_EDGES: readonly (readonly [number, number])[] = (() => {
	const edges: [number, number][] = [];
	for (let a = 0; a < 12; a++) {
		for (let b = a + 1; b < 12; b++) {
			const [ax, ay, az] = ICO_VERTS[a] as readonly [number, number, number];
			const [bx, by, bz] = ICO_VERTS[b] as readonly [number, number, number];
			if (Math.hypot(ax - bx, ay - by, az - bz) < 1.2) edges.push([a, b]);
		}
	}
	return edges;
})();

/** 1 · Projects — ink streaming along all 30 icosahedron edges. */
export function icosahedron(i: number, _n: number, phase: number, out: Pt): void {
	const e = ICO_EDGES[i % 30] as readonly [number, number];
	const a = ICO_VERTS[e[0]] as readonly [number, number, number];
	const b = ICO_VERTS[e[1]] as readonly [number, number, number];
	const speed = 0.1 + hash(i, 4) * 0.22;
	const s = (hash(i, 5) + phase * speed) % 1;
	out.x = a[0] + (b[0] - a[0]) * s + (hash(i, 6) - 0.5) * 0.035;
	out.y = a[1] + (b[1] - a[1]) * s + (hash(i, 7) - 0.5) * 0.035;
	out.z = a[2] + (b[2] - a[2]) * s + (hash(i, 8) - 0.5) * 0.035;
	out.a = 0.55;
}

/**
 * 2 · Writing — loxodrome sphere: four interleaved rhumb lines spiralling
 * pole to pole around a solid globe, points streaming along each spiral.
 */
export function loxodrome(i: number, _n: number, phase: number, out: Pt): void {
	const STRANDS = 4;
	const k = i % STRANDS;
	const speed = 0.05 + hash(i, 4) * 0.045;
	const u = (hash(i, 5) + phase * speed) % 1;
	const lat = (u * 2 - 1) * 1.38;
	const merc = Math.log(Math.tan(Math.PI / 4 + lat / 2));
	const lon = 3.4 * merc + (k * TAU) / STRANDS + phase * 0.1;
	const cl = Math.cos(lat);
	out.x = cl * Math.cos(lon) + (hash(i, 6) - 0.5) * 0.02;
	out.y = Math.sin(lat) + (hash(i, 7) - 0.5) * 0.02;
	out.z = cl * Math.sin(lon) + (hash(i, 8) - 0.5) * 0.02;
	// fade near the poles so respawn never pops
	const edge = 1 - Math.min(1, Math.abs(u * 2 - 1) ** 6);
	out.a = 0.62 * (0.25 + 0.75 * edge);
}

/**
 * 3 · About — Borromean rings: three mutually orthogonal ellipses, each pair
 * unlinked, the three inseparable. Points stream along each ring.
 */
export function borromean(i: number, n: number, phase: number, out: Pt): void {
	const ring = i % 3;
	const t = (Math.floor(i / 3) / Math.floor(n / 3)) * TAU + phase * 0.3 + ring * 2.09;
	const a = 1.02;
	const b = 0.52;
	const ca = a * Math.cos(t);
	const sb = b * Math.sin(t);
	if (ring === 0) {
		out.x = ca;
		out.y = sb;
		out.z = 0;
	} else if (ring === 1) {
		out.x = 0;
		out.y = ca;
		out.z = sb;
	} else {
		out.x = sb;
		out.y = 0;
		out.z = ca;
	}
	out.x += (hash(i, 6) - 0.5) * 0.035;
	out.y += (hash(i, 7) - 0.5) * 0.035;
	out.z += (hash(i, 8) - 0.5) * 0.035;
	out.a = 0.58;
}

export const SHAPES = [trefoil, icosahedron, loxodrome, borromean] as const;

/** Morph stagger — per-particle cascade so the cloud doesn't move in lockstep. */
export function staggeredT(morphT: number, i: number): number {
	const raw = morphT * 1.3 - hash(i, 9) * 0.3;
	const c = Math.min(1, Math.max(0, raw));
	return c * c * (3 - 2 * c);
}

/** Evaluate the blended object for instance i (the fallback + test path). */
export function evalPoint(
	i: number,
	fromObj: number,
	toObj: number,
	morphT: number,
	phase: number,
	out: Pt,
	tmp: Pt,
): void {
	const to = SHAPES[toObj] as typeof trefoil;
	if (morphT >= 1 || fromObj === toObj) {
		to(i, N, phase, out);
		return;
	}
	const from = SHAPES[fromObj] as typeof trefoil;
	from(i, N, phase, out);
	to(i, N, phase, tmp);
	const t = staggeredT(morphT, i);
	out.x += (tmp.x - out.x) * t;
	out.y += (tmp.y - out.y) * t;
	out.z += (tmp.z - out.z) * t;
	out.a += (tmp.a - out.a) * t;
}
