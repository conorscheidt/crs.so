/**
 * The four objects as closed-form point clouds. Each maps (instance i, total n,
 * phase) to a point in roughly [-1.1, 1.1]³, a base alpha, and a draw key: where
 * the point falls in the order a hand would draw the object, which sequences
 * morphs. `phase` is integrated on the CPU; raw time × speed would teleport the
 * cloud whenever the speed changed.
 *
 * sim/shader.wgsl mirrors every formula here. Change one, change the other;
 * this side is tested and also drives the Canvas2D fallback.
 */
export type Section = "index" | "projects" | "writing" | "about";

export const OBJECT_INDEX: Record<Section, number> = {
	index: 0,
	projects: 1,
	writing: 2,
	about: 3,
};

/** Base camera pitch per object (radians), interpolated during morphs. */
export const BASE_PITCH = [0.16, 0.16, 0.38, 0.32] as const;

/** Dot count; gpu.ts hands it to the shader too. */
export const N = 12_000;
/** Icosahedron vertex accents ride as extra instances after the pool. */
export const N_ACCENT = 12;
/** Accent radius as a multiple of a dot's, and its alpha at full weight. */
export const ACCENT_SIZE = 2.5;
export const ACCENT_ALPHA = 0.85;

const TAU = Math.PI * 2;

/**
 * Deterministic per-instance hash in [0, 1), mirrored in WGSL. A PCG step on
 * integers, so both sides agree bit for bit; a sin() hash loses precision on
 * some GPUs at these arguments and clumps the dots.
 */
export function hash(i: number, salt: number): number {
	let h = (Math.imul(i, 747_796_405) + Math.imul(salt, 2_891_336_453)) >>> 0;
	h = Math.imul((h >>> ((h >>> 28) + 4)) ^ h, 277_803_737);
	return (((h >>> 22) ^ h) >>> 8) / 16_777_216;
}

export interface Pt {
	x: number;
	y: number;
	z: number;
	a: number;
	/** draw key in [0, 1] */
	k: number;
}

/**
 * Where a dot is along a strand it streams round, from how far it has run in
 * all: the fraction of its current lap, with laps counted from where it had
 * run to at `anchorRun`. Normally that is the same moment, and the dot wraps
 * to the start as it reaches the end. A dot in a morph counts from the moment
 * the morph began instead (strandAnchor()): one that reaches the end waits
 * there, and wraps as it lands.
 */
export function lapAt(run: number, anchorRun: number): number {
	return Math.min(1, Math.max(0, run - Math.floor(anchorRun)));
}

/** Where dot i sits along the trefoil, as a fraction of the knot from its start. */
export function knotT(i: number, n: number, phase: number): number {
	const t = i / n + phase * (0.26 / TAU);
	return t - Math.floor(t);
}

/** 0 · Index: trefoil knot, points streaming along the curve. */
export function trefoil(i: number, n: number, phase: number, out: Pt): void {
	const u = (i / n) * TAU + phase * 0.26;
	const w = 2 + Math.cos(3 * u);
	out.x = (w * Math.cos(2 * u)) / 2.75 + (hash(i, 1) - 0.5) * 0.06;
	out.y = Math.sin(3 * u) / 1.85 + (hash(i, 2) - 0.5) * 0.06;
	out.z = (w * Math.sin(2 * u)) / 2.75 + (hash(i, 3) - 0.5) * 0.06;
	out.a = 0.41;
	out.k = i / n;
}

/** Icosahedron: 12 vertices, 30 edges. */
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

/** Edge hops from vertex 0, the icosahedron's drawing order. */
export const ICO_HOP: readonly number[] = (() => {
	const hop = new Array<number>(12).fill(Number.POSITIVE_INFINITY);
	hop[0] = 0;
	const queue = [0];
	for (const v of queue) {
		for (const e of ICO_EDGES) {
			if (e[0] !== v && e[1] !== v) continue;
			const w = e[0] === v ? e[1] : e[0];
			if (hop[w] === Number.POSITIVE_INFINITY) {
				hop[w] = (hop[v] as number) + 1;
				queue.push(w);
			}
		}
	}
	return hop;
})();
const ICO_DEPTH = Math.max(...ICO_HOP);

/**
 * Draw key at fraction s along an edge whose ends sit h0 and h1 hops out.
 * Edges grow away from the nearer vertex; an edge between two vertices at the
 * same depth grows in from both ends.
 */
export function icoKey(h0: number, h1: number, s: number): number {
	let along = Math.min(s, 1 - s);
	if (h0 < h1) along = s;
	else if (h1 < h0) along = 1 - s;
	return (Math.min(h0, h1) + along) / ICO_DEPTH;
}

/** Edge lengths dot i has run along its edge, ICO_EDGES[i % 30], in all. */
export function icoRun(i: number, phase: number): number {
	return hash(i, 5) + phase * (0.1 + hash(i, 4) * 0.22);
}

/** How far dot i is along its edge from the first vertex; `anchor` as in lapAt(). */
export function icoS(i: number, phase: number, anchor = phase): number {
	return lapAt(icoRun(i, phase), icoRun(i, anchor));
}

/** 1 · Projects: points streaming along the 30 icosahedron edges. */
export function icosahedron(i: number, _n: number, phase: number, out: Pt, anchor = phase): void {
	const e = ICO_EDGES[i % 30] as readonly [number, number];
	const a = ICO_VERTS[e[0]] as readonly [number, number, number];
	const b = ICO_VERTS[e[1]] as readonly [number, number, number];
	const s = icoS(i, phase, anchor);
	out.x = a[0] + (b[0] - a[0]) * s + (hash(i, 6) - 0.5) * 0.035;
	out.y = a[1] + (b[1] - a[1]) * s + (hash(i, 7) - 0.5) * 0.035;
	out.z = a[2] + (b[2] - a[2]) * s + (hash(i, 8) - 0.5) * 0.035;
	out.a = 0.36;
	out.k = icoKey(ICO_HOP[e[0]] as number, ICO_HOP[e[1]] as number, s);
}

/** Latitude reach of the loxodrome (rad); a dot's latitude is (u·2 − 1)·LOX_SPAN. */
export const LOX_SPAN = 1.38;

/** Pole-to-pole climbs dot i has made up its rhumb line, in all. */
export function loxRun(i: number, phase: number): number {
	return hash(i, 5) + phase * (0.05 + hash(i, 4) * 0.045);
}

/** How far dot i has climbed its rhumb line, pole to pole; `anchor` as in lapAt(). */
export function loxU(i: number, phase: number, anchor = phase): number {
	return lapAt(loxRun(i, phase), loxRun(i, anchor));
}

/**
 * 2 · Writing: a loxodrome sphere, four interleaved rhumb lines spiralling pole
 * to pole, points streaming along each.
 */
export function loxodrome(i: number, _n: number, phase: number, out: Pt, anchor = phase): void {
	const STRANDS = 4;
	const k = i % STRANDS;
	const u = loxU(i, phase, anchor);
	const lat = (u * 2 - 1) * LOX_SPAN;
	const merc = Math.log(Math.tan(Math.PI / 4 + lat / 2));
	const lon = 3.4 * merc + (k * TAU) / STRANDS + phase * 0.1;
	const cl = Math.cos(lat);
	out.x = cl * Math.cos(lon) + (hash(i, 6) - 0.5) * 0.02;
	out.y = Math.sin(lat) + (hash(i, 7) - 0.5) * 0.02;
	out.z = cl * Math.sin(lon) + (hash(i, 8) - 0.5) * 0.02;
	// fade near the poles so respawn never pops
	const edge = 1 - Math.min(1, Math.abs(u * 2 - 1) ** 6);
	out.a = 0.41 * (0.25 + 0.75 * edge);
	out.k = u;
}

/**
 * 3 · About: Borromean rings, three mutually orthogonal ellipses. No two are
 * linked, but the three can't be separated.
 */
export function borromean(i: number, n: number, phase: number, out: Pt): void {
	const ring = i % 3;
	const along = Math.floor(i / 3) / Math.floor(n / 3);
	const t = along * TAU + phase * 0.3 + ring * 2.09;
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
	out.a = 0.38;
	out.k = (ring + along) / 3;
}

/**
 * One object: dot i of n at `phase`, written to `out`. Objects whose dots
 * stream round strands also take an anchor phase (lapAt()).
 */
export type Shape = (i: number, n: number, phase: number, out: Pt, anchor?: number) => void;

export const SHAPES: readonly Shape[] = [trefoil, icosahedron, loxodrome, borromean];

/**
 * The lap dot i of `obj` is on at `phase`, for objects whose strands wrap; a
 * change between frames means it jumped back to the start of its strand.
 */
export function strandLap(obj: number, i: number, phase: number): number {
	if (obj === 1) return Math.floor(icoRun(i, phase));
	if (obj === 2) return Math.floor(loxRun(i, phase));
	return 0;
}

/**
 * The phase from which a dot `t` of the way through its flight counts its
 * strands' laps (lapAt()). Until it lands, that is `morphPhase`: the phase it
 * was paired at (match.ts) and its draw key read at (flightT()). No strand
 * wraps under it between the two, so however long it waits to leave, it flies
 * between the places it was paired on; counted live, a strand that wrapped
 * meanwhile would send it to or from the far side of the object. A dot that
 * reaches the end of a strand waits there and wraps as it lands. Once it has
 * landed, or with no morph under way, laps count from `phase`.
 */
export function strandAnchor(t: number, phase: number, morphPhase: number): number {
	return t < 1 ? morphPhase : phase;
}

/**
 * Whether a dot jumped back to the start of a strand between the last frame,
 * which counted laps from phase `before`, and this one, which counts them from
 * `anchor`. It lands on dot i of `toObj` and leaves from dot `src` of
 * `fromObj` (match.ts); only an object it has some weight in counts. Each
 * renderer keeps the anchor each dot was last drawn with, and hands it over
 * with the rest of the dot's state when a morph pairs the dots afresh.
 */
export function strandWrapped(
	i: number,
	src: number,
	fromObj: number,
	toObj: number,
	t: number,
	anchor: number,
	before: number,
): boolean {
	return (
		(t < 1 && strandLap(fromObj, src, anchor) !== strandLap(fromObj, src, before)) ||
		(t > 0 && strandLap(toObj, i, anchor) !== strandLap(toObj, i, before))
	);
}

/**
 * Height of a morphing dot's arc, outward from the centre, for a flight of
 * ARC_SPAN or longer; a shorter flight arcs in proportion to its length.
 * Paired dots (match.ts) fly about half a unit. Were every arc this high, a
 * dot hopping a tenth of a unit would rise half as far again as it travels,
 * and the object would swell about four times as much mid-morph.
 */
export const ARC_LIFT = 0.15;
export const ARC_SPAN = 1;
/**
 * Within about this radius of the centre the arc gives way, falling to
 * nothing at the centre itself. Scaling by 1/|p| alone would flip a dot whose
 * path crosses the middle from one side to the other in a single frame.
 */
export const ARC_CORE = 0.4;

/** Share of the morph each dot spends in flight. */
export const DRAW_W = 0.55;

/**
 * Morph progress for a dot with draw key k: the target object is traced in its
 * own order, a short flight per dot, so the old object is undone as the new
 * one is drawn rather than both dissolving.
 */
export function drawnT(morphT: number, k: number): number {
	const c = Math.min(1, Math.max(0, (morphT - k * (1 - DRAW_W)) / DRAW_W));
	return c * c * (3 - 2 * c);
}

/**
 * How far dot i is through its flight from `fromObj` to `toObj`. The draw key
 * is read at `morphPhase`, the phase when the morph began, so the drawing
 * order holds still while the strands stream on: a key read live would jump
 * whenever its strand wrapped.
 */
export function flightT(
	i: number,
	fromObj: number,
	toObj: number,
	morphT: number,
	morphPhase: number,
	tmp: Pt,
): number {
	if (morphT >= 1 || fromObj === toObj) return 1;
	(SHAPES[toObj] as Shape)(i, N, morphPhase, tmp);
	return drawnT(morphT, tmp.k);
}

/**
 * Instance i, `t` of the way through its flight (flightT()) from dot `src` of
 * `fromObj` (match.ts) to dot i of `toObj`, with strands counted from
 * `anchor` (lapAt()). Used by the fallback and tests.
 */
export function evalPoint(
	i: number,
	src: number,
	fromObj: number,
	toObj: number,
	t: number,
	phase: number,
	anchor: number,
	out: Pt,
	tmp: Pt,
): void {
	const to = SHAPES[toObj] as Shape;
	if (t >= 1) {
		to(i, N, phase, out, anchor);
		return;
	}
	const from = SHAPES[fromObj] as Shape;
	from(src, N, phase, out, anchor);
	to(i, N, phase, tmp, anchor);
	const dx = tmp.x - out.x;
	const dy = tmp.y - out.y;
	const dz = tmp.z - out.z;
	out.x += dx * t;
	out.y += dy * t;
	out.z += dz * t;
	out.a += (tmp.a - out.a) * t;
	out.k = tmp.k;
	// A straight chord would cut through the middle of the object.
	const rise = ARC_LIFT * Math.min(1, Math.hypot(dx, dy, dz) / ARC_SPAN);
	const r2 = out.x * out.x + out.y * out.y + out.z * out.z;
	const lift = (rise * Math.sin(Math.PI * t)) / Math.sqrt(r2 + ARC_CORE * ARC_CORE);
	out.x += out.x * lift;
	out.y += out.y * lift;
	out.z += out.z * lift;
}

/**
 * Weight of icosahedron vertex accent j. Arriving, each lights as the edges
 * drawn out toward it reach it. Leaving, each fades as the dots beside it
 * leave, which they do around draw key `leave` of the next object (match.ts).
 */
export function accentWeight(
	j: number,
	fromObj: number,
	toObj: number,
	morphT: number,
	leave: number,
): number {
	const ico = OBJECT_INDEX.projects;
	if (morphT >= 1 || fromObj === toObj) return toObj === ico ? 1 : 0;
	if (toObj === ico) return drawnT(morphT, (ICO_HOP[j] as number) / ICO_DEPTH);
	if (fromObj === ico) return 1 - drawnT(morphT, leave);
	return 0;
}
