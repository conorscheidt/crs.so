import { expect, test } from "bun:test";
import { CPU_N, poolDot } from "./cpu";
import { HILBERT_BITS, hilbert, Matcher, newPairing, pairDots } from "./match";
import {
	DRAW_W,
	flightT,
	ICO_VERTS,
	LOX_SPAN,
	N,
	N_ACCENT,
	OBJECT_INDEX,
	type Pt,
	SHAPES,
	type Shape,
	strandAnchor,
	strandLap,
	strandWrapped,
} from "./shapes";

const mk = (): Pt => ({ x: 0, y: 0, z: 0, a: 0, k: 0 });
const PAIRS = [0, 1, 2, 3].flatMap((f) =>
	[0, 1, 2, 3].filter((t) => t !== f).map((t) => [f, t] as const),
);
const identity = (s: number): number => s;

/** Mean distance from each dot of `to` to the dot of `from` it leaves from. */
function meanChord(from: number, to: number, phase: number, src: (i: number) => number): number {
	const a = mk();
	const b = mk();
	let sum = 0;
	for (let i = 0; i < N; i++) {
		(SHAPES[from] as Shape)(src(i), N, phase, a);
		(SHAPES[to] as Shape)(i, N, phase, b);
		sum += Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
	}
	return sum / N;
}

test("the Hilbert index visits every cell once, each next to the last", () => {
	const bits = 4;
	const side = 1 << bits;
	const cells = new Map<number, [number, number, number]>();
	for (let x = 0; x < side; x++) {
		for (let y = 0; y < side; y++) {
			for (let z = 0; z < side; z++) cells.set(hilbert(x, y, z, bits), [x, y, z]);
		}
	}
	expect(cells.size).toBe(side ** 3);
	for (let h = 1; h < side ** 3; h++) {
		const a = cells.get(h - 1) as [number, number, number];
		const b = cells.get(h) as [number, number, number];
		expect(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])).toBe(1);
	}
	// The full grid's indices fit an int32 and stay non-negative.
	const top = (1 << HILBERT_BITS) - 1;
	expect(hilbert(top, top, top, HILBERT_BITS)).toBeGreaterThanOrEqual(0);
	expect(hilbert(top, 0, top, HILBERT_BITS)).toBeLessThan(2 ** (3 * HILBERT_BITS));
});

test("every dot of the new object leaves from its own dot of the old", () => {
	const all = newPairing(N);
	const pool = newPairing(CPU_N);
	for (const [from, to] of PAIRS) {
		pairDots(from, to, 4.2, N, identity, all);
		expect(new Set(all.src).size).toBe(N);
		expect(Math.max(...all.src)).toBe(N - 1);
		// The fallback pairs the slots of its pool among themselves, so the old
		// object it starts from is the one it drew.
		pairDots(from, to, 4.2, CPU_N, (s) => poolDot(s, CPU_N), pool);
		expect(new Set(pool.src).size).toBe(CPU_N);
		expect(Math.max(...pool.src)).toBe(CPU_N - 1);
	}
});

test("paired dots fly about half as far as dot i to dot i", () => {
	const pairs = newPairing(N);
	let paired = 0;
	let unpaired = 0;
	for (const [from, to] of PAIRS) {
		pairDots(from, to, 7.3, N, identity, pairs);
		const near = meanChord(from, to, 7.3, (i) => pairs.src[i] as number);
		const far = meanChord(from, to, 7.3, identity);
		expect(near).toBeLessThan(0.7);
		expect(near).toBeLessThan(0.6 * far);
		paired += near / PAIRS.length;
		unpaired += far / PAIRS.length;
	}
	// About 0.56 against 1.2.
	expect(paired).toBeLessThan(0.5 * unpaired);
});

test("each dot leaves on about the chord it was paired on, however long it waited", () => {
	// A 51-frame morph at 60 Hz, the phase at its rest rate. A dot leaves on the
	// first frame it is in flight; it is paired at the frame the morph began.
	const pairs = newPairing(N);
	const a = mk();
	const b = mk();
	const tmp = mk();
	let flights = 0;
	let close = 0;
	let longer = 0;
	for (const began of [4.2, 33.3]) {
		for (const [from, to] of PAIRS) {
			pairDots(from, to, began, N, identity, pairs);
			for (let i = 0; i < N; i++) {
				const src = pairs.src[i] as number;
				(SHAPES[from] as Shape)(src, N, began, a);
				(SHAPES[to] as Shape)(i, N, began, b);
				const paired = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
				const f = leaves(i, to, began);
				const phase = began + f / 60;
				const t = flightT(i, from, to, f / 51, began, tmp);
				expect(t).toBeGreaterThan(0);
				expect(flightT(i, from, to, (f - 1) / 51, began, tmp)).toBe(0);
				const anchor = strandAnchor(t, phase, began);
				(SHAPES[from] as Shape)(src, N, phase, a, anchor);
				(SHAPES[to] as Shape)(i, N, phase, b, anchor);
				const left = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
				flights++;
				// Both objects stream on meanwhile, which is all that moves the ends.
				if (Math.abs(left - paired) < 0.35) close++;
				// Counted live, a strand that wrapped while its dot waited sent the
				// dot to or from the far side of the object, through the middle:
				// 1.26% of flights came out more than half a unit longer.
				if (left > paired + 0.5) longer++;
			}
		}
	}
	expect(close / flights).toBeGreaterThan(0.999);
	expect(longer).toBe(0);
});

/** The first frame of a 51-frame morph on which dot i of `to` is in flight. */
function leaves(i: number, to: number, began: number): number {
	const p = mk();
	(SHAPES[to] as Shape)(i, N, began, p);
	return Math.floor(p.k * (1 - DRAW_W) * 51) + 1;
}

test("a pairing is the same wherever it is built, and quick to build", () => {
	const a = newPairing(N);
	const b = newPairing(N);
	pairDots(2, 1, 9.1, N, identity, a);
	pairDots(0, 3, 1.4, N, identity, b);
	pairDots(2, 1, 9.1, N, identity, b);
	expect(b.src).toEqual(a.src);
	expect(b.leave).toEqual(a.leave);
	// Measured at about 2 ms once warm; this only guards against a slide into
	// something quadratic.
	const t0 = performance.now();
	for (let k = 0; k < 5; k++) pairDots(1, 2, 3 + k, N, identity, a);
	expect((performance.now() - t0) / 5).toBeLessThan(30);
});

test("the pairing is laid out as the shader's Pairs struct reads it", async () => {
	const pairs = newPairing(N);
	expect(pairs.leave.buffer).toBe(pairs.bytes);
	expect(pairs.src.buffer).toBe(pairs.bytes);
	expect(pairs.leave.byteOffset).toBe(0);
	expect(pairs.src.byteOffset).toBe(N_ACCENT * 4);
	expect(pairs.bytes.byteLength).toBe((N_ACCENT + N) * 4);
	const wgsl = await Bun.file(new URL("./shader.wgsl", import.meta.url)).text();
	const body = wgsl.match(/struct Pairs \{([^}]*)\}/)?.[1] ?? "";
	const fields = [...body.matchAll(/^\s*(\w+): ([\w<>, ]+),$/gm)].map((m) => [m[1], m[2]]);
	expect(fields).toEqual([
		["leave", `array<vec4f, ${N_ACCENT / 4}>`],
		["src", "array<u32>"],
	]);
});

test("leaving the icosahedron, each accent fades as the dots beside it go", () => {
	const pairs = newPairing(N);
	// Into the sphere, drawn south to north: a vertex's dots leave as the
	// sphere is drawn at its latitude.
	pairDots(OBJECT_INDEX.projects, OBJECT_INDEX.writing, 5.5, N, identity, pairs);
	const drawn = ICO_VERTS.map((v) => (Math.asin(v[1]) / LOX_SPAN + 1) / 2);
	const leave = [...pairs.leave];
	const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
	const [dm, lm] = [mean(drawn), mean(leave)];
	let cov = 0;
	let dv = 0;
	let lv = 0;
	for (let j = 0; j < N_ACCENT; j++) {
		const d = (drawn[j] as number) - dm;
		const l = (leave[j] as number) - lm;
		cov += d * l;
		dv += d * d;
		lv += l * l;
	}
	expect(cov / Math.sqrt(dv * lv)).toBeGreaterThan(0.9);
	for (let j = 0; j < N_ACCENT; j++) {
		expect(Math.abs((leave[j] as number) - (drawn[j] as number))).toBeLessThan(0.25);
	}
	// Leaving any other object, the keys go unread.
	pairDots(OBJECT_INDEX.writing, OBJECT_INDEX.projects, 5.5, N, identity, pairs);
	expect([...pairs.leave]).toEqual(new Array(N_ACCENT).fill(0.5));
});

test("warming a renderer's matcher pairs nothing it will draw", () => {
	const m = new Matcher(CPU_N, (s) => poolDot(s, CPU_N));
	m.warm();
	// The morph a page starts on is still paired on its first frame.
	const u = { fromObj: 1, toObj: 2, morphT: 0, morphPhase: 0 };
	expect(m.sync(u)).toBe(true);
	const fresh = newPairing(CPU_N);
	pairDots(1, 2, 0, CPU_N, (s) => poolDot(s, CPU_N), fresh);
	expect(m.pairing.src).toEqual(fresh.src);
	expect(m.pairing.leave).toEqual(fresh.leave);
});

test("a renderer pairs each morph once, on the first frame of it it draws", () => {
	const m = new Matcher(64, identity);
	const u = { fromObj: 0, toObj: 0, morphT: 1, morphPhase: 0 };
	expect(m.sync(u)).toBe(false);
	Object.assign(u, { toObj: 3, morphT: 0, morphPhase: 2.5 });
	expect(m.sync(u)).toBe(true);
	u.morphT = 0.4;
	expect(m.sync(u)).toBe(false);
	u.morphT = 1;
	expect(m.sync(u)).toBe(false);
	// The next morph, even between the same objects, is paired afresh.
	Object.assign(u, { fromObj: 3, toObj: 0, morphT: 0.1, morphPhase: 3.4 });
	expect(m.sync(u)).toBe(true);
	Object.assign(u, { fromObj: 0, toObj: 3, morphT: 0.1, morphPhase: 4.1 });
	expect(m.sync(u)).toBe(true);
	u.morphPhase = 4.5;
	expect(m.sync(u)).toBe(true);
});

test("a dot in flight wraps with the strand of the dot it left from", () => {
	let wraps = 0;
	for (let i = 0; i < N; i += 7) {
		const src = (i * 7919) % N;
		const lap = (p: number): number => strandLap(OBJECT_INDEX.projects, src, p);
		const wrapped = lap(3.2) !== lap(3.1);
		if (wrapped) wraps++;
		// Into the rings, which never wrap: only the strand it left counts.
		expect(strandWrapped(i, src, 1, 3, 0.5, 3.2, 3.1)).toBe(wrapped);
		expect(strandWrapped(i, src, 1, 3, 1, 3.2, 3.1)).toBe(false);
	}
	expect(wraps).toBeGreaterThan(5);
});

test("WGSL leaves each dot from its pair, and hands its mark over first", async () => {
	const wgsl = await Bun.file(new URL("./shader.wgsl", import.meta.url)).text();
	const gpu = await Bun.file(new URL("./gpu.ts", import.meta.url)).text();
	const fn = (name: string): string => {
		const at = wgsl.indexOf(`fn ${name}(`);
		return wgsl.slice(at, wgsl.indexOf("\n}\n", at));
	};
	expect(fn("pool_dot")).toMatch(/let a = shape\(u\.from_obj, src, phase, anchor\);/);
	expect(fn("pool_dot")).toMatch(/let b = shape\(u\.to_obj, i, phase, anchor\);/);
	// and arcs as evalPoint() does, by as much as the flight is long
	expect(fn("pool_dot")).toMatch(
		/let rise = ARC_LIFT \* min\(1\.0, length\(b\.p - a\.p\) \/ ARC_SPAN\);/,
	);
	expect(fn("strand_wrapped")).toMatch(/strand_lap\(u\.from_obj, src, anchor\)/);
	expect(fn("strand_wrapped")).toMatch(/strand_lap\(u\.to_obj, i, anchor\)/);
	expect(fn("accent_weight")).toMatch(/drawn_t\(u\.morph_t, pairs\.leave\[j \/ 4u\]\[j % 4u\]\)/);
	const advance = fn("advance");
	expect(advance).toMatch(/let src = select\(i, f32\(pairs\.src\[ii\]\), t < 1\.0\);/);
	// Every evaluation of the dot in advance() leaves from its pair.
	expect([...advance.matchAll(/pool_dot\(i, (\w+),/g)].map((m) => m[1])).toEqual([
		"src",
		"src",
		"src",
	]);
	// Laps count from one anchor at both ends; the anchor the dot was last
	// drawn with tells a wrap, then gives way to this frame's.
	expect(advance).toMatch(
		/let anchor = strand_anchor\(t\);\s*wrapped = strand_wrapped\(i, src, t, anchor, m\.heat\.y\);\s*m\.heat\.y = anchor;/,
	);
	expect(fn("rebase")).toMatch(/marks\[ii\] = held\[pairs\.src\[ii\]\];/);
	// gpu.ts copies the marks aside, rebases from the copy, then advances.
	const frame = gpu.slice(gpu.indexOf("const rebased = "), gpu.indexOf("step.end()"));
	const order = ["copyBufferToBuffer(marks", "setPipeline(rebase)", "setPipeline(advance)"];
	const at = order.map((s) => frame.indexOf(s));
	expect(at.every((x) => x >= 0)).toBe(true);
	expect([...at].sort((a, b) => a - b)).toEqual(at);
});
