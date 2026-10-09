import { expect, test } from "bun:test";
import {
	BRIGHT,
	type Emphasis,
	emphasis,
	encodeFocus,
	FOCUS_LATS,
	FOCUS_TAU,
	focusEase,
	focusHot,
	focusTarget,
	GROW,
	ICO_SPREAD,
	LAT_BAND,
	noFocus,
	postLatitude,
	RECEDE,
	VERTEX_FALL,
	WEEK_SPREAD,
	WEEKS,
} from "./focus";
import {
	borromean,
	ICO_EDGES,
	ICO_VERTS,
	icoS,
	icosahedron,
	knotT,
	LOX_SPAN,
	loxodrome,
	loxU,
	N,
	type Pt,
	trefoil,
} from "./shapes";

const mk = (): Pt => ({ x: 0, y: 0, z: 0, a: 0, k: 0 });
const TAU = Math.PI * 2;
const adjacent = (a: number, b: number): boolean =>
	ICO_EDGES.some((e) => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a));

test("knotT is where the dot sits on the trefoil", () => {
	const p = mk();
	for (const phase of [0, 1.7, 40.3]) {
		for (let i = 0; i < N; i += 97) {
			trefoil(i, N, phase, p);
			const t = knotT(i, N, phase);
			expect(t).toBeGreaterThanOrEqual(0);
			expect(t).toBeLessThan(1);
			const u = t * TAU;
			const w = 2 + Math.cos(3 * u);
			const off = Math.hypot(
				p.x - (w * Math.cos(2 * u)) / 2.75,
				p.y - Math.sin(3 * u) / 1.85,
				p.z - (w * Math.sin(2 * u)) / 2.75,
			);
			// Only the jitter separates them.
			expect(off).toBeLessThan(0.06);
		}
	}
});

test("icoS and loxU are the parameters the shapes place dots by", () => {
	const p = mk();
	for (const phase of [0, 2.2, 31]) {
		for (let i = 0; i < N; i += 89) {
			icosahedron(i, N, phase, p);
			const e = ICO_EDGES[i % 30] as readonly [number, number];
			const a = ICO_VERTS[e[0]] as readonly number[];
			const b = ICO_VERTS[e[1]] as readonly number[];
			const s = icoS(i, phase);
			const at = [0, 1, 2].map((c) => (a[c] as number) + ((b[c] as number) - (a[c] as number)) * s);
			expect(
				Math.hypot(p.x - (at[0] as number), p.y - (at[1] as number), p.z - (at[2] as number)),
			).toBeLessThan(0.035);
			loxodrome(i, N, phase, p);
			expect(p.y).toBeCloseTo(Math.sin((loxU(i, phase) * 2 - 1) * LOX_SPAN), 1);
		}
	}
});

test("a spec encodes to the object it names", () => {
	const f = noFocus();
	encodeFocus({ weeks: [0, 31, 32, 51, 52, -1, 3.5] }, f);
	expect(f.obj).toBe(0);
	expect(f.weeksLo).toBe((1 | (1 << 31)) >>> 0);
	expect(f.weeksHi).toBe((1 | (1 << 19)) >>> 0);
	encodeFocus({ vertex: 7 }, f);
	expect([f.obj, f.vertex, f.weeksLo, f.weeksHi]).toEqual([1, 7, 0, 0]);
	encodeFocus({ vertex: 12 }, f);
	expect(f.obj).toBe(-1);
	encodeFocus({ latitudes: [0.5, -0.25, ...new Array(20).fill(0.1)] }, f);
	expect(f.obj).toBe(2);
	expect(f.lats.length).toBe(FOCUS_LATS);
	expect(f.lats[0]).toBe(0.5);
	expect(f.lats[1]).toBe(-0.25);
	encodeFocus({ latitudes: [0.5] }, f);
	// Unused slots light nothing on the sphere.
	for (const l of f.lats.subarray(1)) expect(Math.abs(l)).toBeGreaterThan(100);
	encodeFocus({ rings: [0, 2, 3] }, f);
	expect([f.obj, f.rings]).toEqual([3, 0b101]);
	encodeFocus(null, f);
	expect(f.obj).toBe(-1);
});

test("weeks light their arcs of the knot, glowing a little past each end", () => {
	const f = noFocus();
	const on = [3, 33, 51];
	encodeFocus({ weeks: on }, f);
	for (const phase of [0, 5.5]) {
		for (let i = 0; i < N; i += 7) {
			const x = knotT(i, N, phase) * WEEKS;
			const near = Math.min(...on.map((w) => Math.abs(x - w - 0.5)));
			const h = focusHot(0, i, phase, f);
			if (near <= 0.5) expect(h).toBeGreaterThan(0.8);
			else if (near >= 2.5) expect(h).toBe(0);
			else expect(h).toBeCloseTo(Math.exp(-((near / WEEK_SPREAD) ** 2)), 9);
		}
	}
	// Only the object it names.
	expect(focusHot(1, 0, 0, f)).toBe(0);
});

test("a vertex lights its five edges, strongest at the vertex", () => {
	const f = noFocus();
	for (let v = 0; v < 12; v++) {
		encodeFocus({ vertex: v }, f);
		const lit = new Set<number>();
		for (let i = 0; i < 3000; i++) {
			const h = focusHot(1, i, 1.3, f);
			const e = ICO_EDGES[i % 30] as readonly [number, number];
			if (h === 0) {
				expect(e).not.toContain(v);
				continue;
			}
			lit.add(i % 30);
			const s = icoS(i, 1.3);
			const fromV = e[0] === v ? s : 1 - s;
			expect(h).toBeCloseTo(1 - VERTEX_FALL * fromV, 12);
		}
		expect(lit.size).toBe(5);
	}
});

test("a latitude lights a band that falls off around it", () => {
	const f = noFocus();
	encodeFocus({ latitudes: [0.4, -0.9] }, f);
	let peak = 0;
	for (let i = 0; i < N; i++) {
		const lat = (loxU(i, 0.7) * 2 - 1) * LOX_SPAN;
		const h = focusHot(2, i, 0.7, f);
		const d = Math.min(Math.abs(lat - 0.4), Math.abs(lat + 0.9));
		// The uniforms hold latitudes as f32.
		expect(h).toBeCloseTo(Math.exp(-((d / LAT_BAND) ** 2)), 5);
		if (d > 4 * LAT_BAND) expect(h).toBeLessThan(1e-6);
		peak = Math.max(peak, h);
	}
	expect(peak).toBeGreaterThan(0.99);
});

test("rings light by mask", () => {
	const f = noFocus();
	encodeFocus({ rings: [0, 2] }, f);
	const p = mk();
	for (let i = 0; i < 300; i++) {
		borromean(i, N, 0, p);
		expect(focusHot(3, i, 0, f)).toBe(i % 3 === 1 ? 0 : 1);
	}
});

test("mid-morph, a dot belongs to each object as far as it is drawn into it", () => {
	const f = noFocus();
	encodeFocus({ rings: [0, 1, 2] }, f);
	// Into the rings from the knot: nothing at the start, all at the end.
	expect(focusTarget(5, 0, 3, 0, 0.4, 0, f)).toBe(0);
	expect(focusTarget(5, 0, 3, 1, 0.4, 0, f)).toBe(1);
	const mid = focusTarget(5, 0, 3, 0.5, 0.4, 0, f);
	expect(mid).toBeGreaterThan(0);
	expect(mid).toBeLessThan(1);
	// Out of the rings, the other way round.
	expect(focusTarget(5, 3, 0, 1, 0.4, 0, f)).toBe(0);
	expect(focusTarget(5, 3, 0, 0, 0.4, 0, f)).toBe(1);
	encodeFocus(null, f);
	expect(focusTarget(5, 3, 3, 1, 0.4, 0, f)).toBe(0);
});

test("the fade covers about two thirds of the way in one time constant", () => {
	expect(focusEase(FOCUS_TAU)).toBeCloseTo(1 - Math.exp(-1), 12);
	// A held frame lands at once.
	expect(focusEase(0)).toBe(1);
	let w = 0;
	for (let t = 0; t < 0.11; t += 1 / 120) w += (1 - w) * focusEase(1 / 120);
	expect(w).toBeGreaterThan(0.6);
	expect(w).toBeLessThan(0.7);
});

test("emphasis: rest recedes, the part brightens and grows, none at rest", () => {
	const e: Emphasis = { a: 0, r: 0 };
	emphasis(0, 0, e);
	expect([e.a, e.r]).toEqual([1, 1]);
	emphasis(1, 0, e);
	expect(e.a).toBeCloseTo(RECEDE, 12);
	expect(e.r).toBe(1);
	emphasis(1, 1, e);
	expect(e.a).toBeCloseTo(BRIGHT, 12);
	expect(e.r).toBeCloseTo(GROW, 12);
	// A share ahead of the fade is held to it.
	emphasis(0.5, 1, e);
	const ahead = e.a;
	emphasis(0.5, 0.5, e);
	expect(ahead).toBe(e.a);
});

test("projects spread over vertices apart from one another", () => {
	expect([...ICO_SPREAD].sort((x, y) => x - y)).toEqual([...new Array(12).keys()]);
	// Three is as many as the icosahedron can hold with no two adjacent.
	const [a, b, c] = ICO_SPREAD as [number, number, number];
	expect(adjacent(a, b) || adjacent(a, c) || adjacent(b, c)).toBe(false);
	// Nor straight across from one another, where one would always sit behind.
	const dot = (p: number, q: number): number =>
		(ICO_VERTS[p] as readonly number[]).reduce(
			(acc, x, k) => acc + x * ((ICO_VERTS[q] as readonly number[])[k] as number),
			0,
		);
	for (const [p, q] of [
		[a, b],
		[a, c],
		[b, c],
	] as const)
		expect(dot(p, q)).toBeGreaterThan(-0.99);
});

test("posts run south to north by age", () => {
	expect(postLatitude(0, 1)).toBe(0);
	expect(postLatitude(0, 5)).toBeCloseTo(-1.2, 12);
	expect(postLatitude(4, 5)).toBeCloseTo(1.2, 12);
	for (let r = 1; r < 9; r++) expect(postLatitude(r, 9)).toBeGreaterThan(postLatitude(r - 1, 9));
	// Inside the loxodrome's reach.
	expect(1.2).toBeLessThan(LOX_SPAN);
});

const wgsl = (): Promise<string> => Bun.file(new URL("./shader.wgsl", import.meta.url)).text();

test("WGSL keeps the focus constants", async () => {
	const src = await wgsl();
	const c = (name: string): number =>
		Number(src.match(new RegExp(`const ${name}: f32 = (-?[\\d.]+);`))?.[1]);
	expect(c("FOCUS_TAU")).toBe(FOCUS_TAU);
	expect(c("RECEDE")).toBe(RECEDE);
	expect(c("BRIGHT")).toBe(BRIGHT);
	expect(c("GROW")).toBe(GROW);
	expect(c("WEEKS")).toBe(WEEKS);
	expect(c("LAT_BAND")).toBe(LAT_BAND);
	expect(c("VERTEX_FALL")).toBe(VERTEX_FALL);
	expect(c("LOX_SPAN")).toBe(LOX_SPAN);
	expect(Number(src.match(/const FOCUS_LATS: u32 = (\d+)u;/)?.[1])).toBe(FOCUS_LATS);
	// The band array holds FOCUS_LATS latitudes, four to a vec4f.
	expect(Number(src.match(/focus_lat: array<vec4f, (\d+)>/)?.[1]) * 4).toBe(FOCUS_LATS);
});

test("WGSL places dots by the same parameters", async () => {
	const src = await wgsl();
	const ts = await Bun.file(new URL("./shapes.ts", import.meta.url)).text();
	const body = (s: string, fn: string): string =>
		s.slice(s.indexOf(fn), s.indexOf("}", s.indexOf(fn)));
	const nums = (s: string): number[] => [...s.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
	for (const [tsFn, wgslFn] of [
		["function knotT", "fn knot_t"],
		["function icoS", "fn ico_s"],
		["function loxU", "fn lox_u"],
	] as const) {
		// `% 1` in the TS is fract() in WGSL.
		const a = nums(
			body(ts, tsFn)
				.replace(/^[^{]*\{/, "")
				.replace(/ % 1\b/, ""),
		);
		const b = nums(body(src, wgslFn).replace(/^[^{]*\{/, ""));
		expect(a.length).toBeGreaterThan(0);
		expect(b).toEqual(a);
	}
});
