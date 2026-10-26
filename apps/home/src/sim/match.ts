/**
 * Pairs the dots of one object with the dots of the next, so a morph carries
 * each dot a short way and the object flows into the next one instead of
 * scattering across it. Both clouds are ranked along one 3D Hilbert curve,
 * which keeps points near each other in rank near each other in space, and
 * dots of equal rank are paired: the dot drawing rank r of the new object
 * leaves from rank r of the old. A paired dot flies about 0.56 units on
 * average, against 1.2 from dot i of one object to dot i of the next.
 *
 * Morphs never overlap (clock.ts runs the next one once the last has landed),
 * so when one begins every dot rests on the old object and the pairing only
 * relabels it: dot i takes over the place of dot src[i], and whatever a
 * renderer carries from frame to frame for a dot (its wake, where it was last
 * drawn, its share of the focus, the phase its laps were counted from) moves
 * with it then.
 *
 * Both objects are ranked at the phase the morph began at, and until a dot
 * lands its strands count laps from that phase (strandAnchor() in shapes.ts),
 * so a dot that waits to leave still flies between the two places it was
 * paired on: no strand wraps under it to the far end of the object.
 *
 * The pairing is a function of the two objects and the phase the morph began
 * at, so each renderer builds its own, over the dots it draws, on the first
 * frame of a morph it draws: one that comes in mid-morph builds the same.
 */
import { ICO_EDGES, icoS, N, N_ACCENT, OBJECT_INDEX, type Pt, SHAPES, type Shape } from "./shapes";

/** Bits per axis of the Hilbert grid; three axes of 10 bits fit an int32. */
export const HILBERT_BITS = 10;
/** Half-width of the cube the grid spans; every object fits inside it. */
const BOX = 1.25;
const GRID = 1 << HILBERT_BITS;
/** Bits of the Hilbert index sorted per pass. */
const RADIX_BITS = 10;
const RADIX = 1 << RADIX_BITS;
/**
 * The dots that leave a vertex: those within this share of an edge of it.
 * Its accent fades as they go.
 */
const NEAR = 0.25;

/**
 * Index of the integer point (x, y, z) along a 3D Hilbert curve through a cube
 * of 2^bits cells a side: Skilling's transpose ("Programming the Hilbert
 * curve", 2004), then its bits interleaved. Consecutive indices are cells that
 * share a face. Each test of a bit picks between two updates by mask rather
 * than by branch, which on scattered points runs twice as fast.
 */
export function hilbert(x: number, y: number, z: number, bits: number): number {
	let a = x;
	let b = y;
	let c = z;
	for (let level = bits - 1; level > 0; level--) {
		const low = (1 << level) - 1;
		// Where a coordinate has this level's bit, a's low bits flip; where it
		// has not, they swap with that coordinate's.
		a ^= low & (0 - ((a >> level) & 1));
		let set = 0 - ((b >> level) & 1);
		let swap = (a ^ b) & low & ~set;
		a ^= swap ^ (low & set);
		b ^= swap;
		set = 0 - ((c >> level) & 1);
		swap = (a ^ c) & low & ~set;
		a ^= swap ^ (low & set);
		c ^= swap;
	}
	b ^= a;
	c ^= b;
	// Bit i of the flip is the parity of c's bits above i.
	let flip = c >> 1;
	flip ^= flip >> 1;
	flip ^= flip >> 2;
	flip ^= flip >> 4;
	flip ^= flip >> 8;
	return (spread(a ^ flip) << 2) | (spread(b ^ flip) << 1) | spread(c ^ flip);
}

/** The low 10 bits of v, moved to every third bit: bit i to bit 3i. */
function spread(v: number): number {
	let s = v & 0x3_ff;
	s = (s | (s << 16)) & 0x03_00_00_ff;
	s = (s | (s << 8)) & 0x03_00_f0_0f;
	s = (s | (s << 4)) & 0x03_0c_30_c3;
	return (s | (s << 2)) & 0x09_24_92_49;
}

/** The grid cell a coordinate falls in, clamped to the grid. */
function cell(v: number): number {
	const c = ((v + BOX) * (GRID / (2 * BOX))) | 0;
	return c < 0 ? 0 : Math.min(c, GRID - 1);
}

export interface Pairing {
	/** per slot, the slot whose dot it leaves from */
	readonly src: Uint32Array;
	/**
	 * per icosahedron vertex, leaving the icosahedron: the median draw key of
	 * the dots that leave from beside it (accentWeight() in shapes.ts)
	 */
	readonly leave: Float32Array;
	/** both, as the shader's Pairs struct reads them: leave, then src */
	readonly bytes: ArrayBuffer;
}

export function newPairing(n: number): Pairing {
	const bytes = new ArrayBuffer((N_ACCENT + n) * 4);
	return {
		src: new Uint32Array(bytes, N_ACCENT * 4, n),
		leave: new Float32Array(bytes, 0, N_ACCENT),
		bytes,
	};
}

/** Scratch for pairDots() and rank(), grown to the largest pool paired so far. */
let keys: Uint32Array = new Uint32Array(0);
let spareKeys: Uint32Array = new Uint32Array(0);
let spareSlots: Uint32Array = new Uint32Array(0);
let fromOrder: Uint32Array = new Uint32Array(0);
let toOrder: Uint32Array = new Uint32Array(0);
let toKeys: Float32Array = new Float32Array(0);
let beside: Int8Array = new Int8Array(0);
let leaving: Float32Array = new Float32Array(0);
const count = new Uint32Array(RADIX);
const start = new Int32Array(N_ACCENT + 1);
const next = new Int32Array(N_ACCENT);

function grow(n: number): void {
	if (keys.length >= n) return;
	keys = new Uint32Array(n);
	spareKeys = new Uint32Array(n);
	spareSlots = new Uint32Array(n);
	fromOrder = new Uint32Array(n);
	toOrder = new Uint32Array(n);
	toKeys = new Float32Array(n);
	beside = new Int8Array(n);
	leaving = new Float32Array(n);
}

/**
 * The slots in the Hilbert order of the dots they draw of `obj` at `phase`,
 * written to `order`; slots on one cell keep their own order. `drawKeys`, if
 * given, takes each slot's draw key.
 */
function rank(
	obj: number,
	phase: number,
	n: number,
	dot: (s: number) => number,
	order: Uint32Array,
	drawKeys?: Float32Array,
): void {
	const shape = SHAPES[obj] as Shape;
	const p: Pt = { x: 0, y: 0, z: 0, a: 0, k: 0 };
	for (let s = 0; s < n; s++) {
		shape(dot(s), N, phase, p);
		keys[s] = hilbert(cell(p.x), cell(p.y), cell(p.z), HILBERT_BITS);
		order[s] = s;
		if (drawKeys) drawKeys[s] = p.k;
	}
	// A radix sort, low digit first; every pass is stable.
	let k0 = keys;
	let s0 = order;
	let k1 = spareKeys;
	let s1 = spareSlots;
	for (let shift = 0; shift < 3 * HILBERT_BITS; shift += RADIX_BITS) {
		count.fill(0);
		for (let r = 0; r < n; r++) {
			const d = ((k0[r] as number) >>> shift) & (RADIX - 1);
			count[d] = (count[d] as number) + 1;
		}
		let sum = 0;
		for (let d = 0; d < RADIX; d++) {
			const c = count[d] as number;
			count[d] = sum;
			sum += c;
		}
		for (let r = 0; r < n; r++) {
			const k = k0[r] as number;
			const d = (k >>> shift) & (RADIX - 1);
			const at = count[d] as number;
			count[d] = at + 1;
			k1[at] = k;
			s1[at] = s0[r] as number;
		}
		[k0, k1] = [k1, k0];
		[s0, s1] = [s1, s0];
	}
	if (s0 !== order) order.set(s0.subarray(0, n));
}

/**
 * Pair `n` slots, each drawing dot(s), for a morph from `fromObj` to `toObj`
 * begun at `phase`: slot s lands on its own dot of the new object and leaves
 * from where slot out.src[s] stands in the old one. Every slot is the source
 * of exactly one, so the old object is all there at the start.
 */
export function pairDots(
	fromObj: number,
	toObj: number,
	phase: number,
	n: number,
	dot: (s: number) => number,
	out: Pairing,
): void {
	grow(n);
	rank(fromObj, phase, n, dot, fromOrder);
	rank(toObj, phase, n, dot, toOrder, toKeys);
	for (let r = 0; r < n; r++) out.src[toOrder[r] as number] = fromOrder[r] as number;
	out.leave.fill(0.5);
	if (fromObj !== OBJECT_INDEX.projects) return;
	// The draw keys each vertex's departing dots leave at, as the morph reads
	// them (flightT()), laid out vertex by vertex: vertex j's run from
	// start[j] to start[j + 1].
	start.fill(0);
	for (let s = 0; s < n; s++) {
		const d = dot(out.src[s] as number);
		const e = ICO_EDGES[d % 30] as readonly [number, number];
		const along = icoS(d, phase);
		let v = -1;
		if (along < NEAR) v = e[0];
		else if (along > 1 - NEAR) v = e[1];
		beside[s] = v;
		if (v >= 0) start[v + 1] = (start[v + 1] as number) + 1;
	}
	for (let j = 0; j < N_ACCENT; j++) start[j + 1] = (start[j + 1] as number) + (start[j] as number);
	next.set(start.subarray(0, N_ACCENT));
	for (let s = 0; s < n; s++) {
		const v = beside[s] as number;
		if (v < 0) continue;
		const at = next[v] as number;
		leaving[at] = toKeys[s] as number;
		next[v] = at + 1;
	}
	for (let j = 0; j < N_ACCENT; j++) {
		const ks = leaving.subarray(start[j], start[j + 1]).sort();
		if (ks.length > 0) out.leave[j] = ks[ks.length >> 1] as number;
	}
}

/** What a renderer knows of the morph in hand (gpu.ts Uniforms). */
export interface MorphState {
	fromObj: number;
	toObj: number;
	morphT: number;
	morphPhase: number;
}

/** A renderer's pairing, built afresh as each morph begins. */
export class Matcher {
	readonly pairing: Pairing;
	private readonly n: number;
	private readonly dot: (s: number) => number;
	private from = -1;
	private to = -1;
	private began = Number.NaN;

	/** For `n` slots, each drawing dot(s). */
	constructor(n: number, dot: (s: number) => number) {
		this.n = n;
		this.dot = dot;
		this.pairing = newPairing(n);
	}

	/**
	 * Pair two morphs and throw them away. The page's first pairing takes two
	 * or three times as long as the ones after it, which is better spent here,
	 * ahead of time, than on the first frame of the first morph. Between them
	 * the two rank all four objects and the icosahedron's accents; the next
	 * sync() pairs as before.
	 */
	warm(): void {
		pairDots(OBJECT_INDEX.projects, OBJECT_INDEX.writing, 0, this.n, this.dot, this.pairing);
		pairDots(OBJECT_INDEX.about, OBJECT_INDEX.index, 0, this.n, this.dot, this.pairing);
	}

	/**
	 * Pair the morph in `u` if this is the first frame of it drawn here. True
	 * then: from this frame each slot stands where its source slot stood, and
	 * whatever follows a dot from frame to frame must move over with it.
	 */
	sync(u: MorphState): boolean {
		if (u.morphT >= 1 || u.fromObj === u.toObj) return false;
		if (u.fromObj === this.from && u.toObj === this.to && u.morphPhase === this.began) {
			return false;
		}
		this.from = u.fromObj;
		this.to = u.toObj;
		this.began = u.morphPhase;
		pairDots(u.fromObj, u.toObj, u.morphPhase, this.n, this.dot, this.pairing);
		return true;
	}
}
