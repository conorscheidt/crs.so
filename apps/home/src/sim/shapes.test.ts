import { expect, test } from "bun:test";
import { type Frame, MIN_DOT_R, type Projected, pose, project, type Shade, shade } from "./camera";
import { newPairing, pairDots } from "./match";
import {
	ACCENT_ALPHA,
	ACCENT_SIZE,
	ARC_CORE,
	ARC_LIFT,
	ARC_SPAN,
	accentWeight,
	DRAW_W,
	drawnT,
	evalPoint,
	flightT,
	hash,
	ICO_EDGES,
	ICO_HOP,
	icoKey,
	N,
	type Pt,
	SHAPES,
	strandAnchor,
	strandLap,
	strandWrapped,
} from "./shapes";

const mk = (): Pt => ({ x: 0, y: 0, z: 0, a: 0, k: 0 });

test("every object stays finite and inside the ~unit stage for all i", () => {
	const p = mk();
	for (let obj = 0; obj < SHAPES.length; obj++) {
		const fn = SHAPES[obj] as (typeof SHAPES)[0];
		for (let i = 0; i < N; i += 7) {
			for (const phase of [0, 3.7, 100.1]) {
				fn(i, N, phase, p);
				expect(Number.isFinite(p.x + p.y + p.z + p.a)).toBe(true);
				expect(Math.hypot(p.x, p.y, p.z)).toBeLessThan(1.9);
				expect(p.a).toBeGreaterThan(0);
			}
		}
	}
});

test("positions are continuous in phase (speed steps cannot teleport the cloud)", () => {
	// Position depends only on phase, so a speed change can't make it jump.
	const a = mk();
	const b = mk();
	const eps = 1e-3;
	for (let obj = 0; obj < SHAPES.length; obj++) {
		const fn = SHAPES[obj] as (typeof SHAPES)[0];
		let worst = 0;
		for (let i = 0; i < N; i += 11) {
			fn(i, N, 5, a);
			fn(i, N, 5 + eps, b);
			worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
		}
		expect(worst).toBeLessThan(0.05);
	}
});

test("morph endpoints equal the pure objects", () => {
	const p = mk();
	const q = mk();
	const tmp = mk();
	for (let i = 0; i < 50; i++) {
		// a dot leaves from the dot of the old object it is paired with
		const src = (i * 7919) % N;
		for (const [from, to] of [
			[0, 3],
			[1, 2],
		] as const) {
			expect(flightT(i, from, to, 0, 2, tmp)).toBe(0);
			expect(flightT(i, from, to, 1, 2, tmp)).toBe(1);
			evalPoint(i, src, from, to, 0, 2, 2, p, tmp);
			(SHAPES[from] as (typeof SHAPES)[0])(src, N, 2, q);
			expect(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)).toBeLessThan(1e-9);
			evalPoint(i, src, from, to, 1, 2, 2, p, tmp);
			(SHAPES[to] as (typeof SHAPES)[0])(i, N, 2, q);
			expect(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)).toBeLessThan(1e-9);
		}
	}
});

test("every draw key lies in [0, 1]", () => {
	const p = mk();
	for (let obj = 0; obj < SHAPES.length; obj++) {
		const fn = SHAPES[obj] as (typeof SHAPES)[0];
		for (let i = 0; i < N; i += 13) {
			for (const phase of [0, 2.2, 61.7]) {
				fn(i, N, phase, p);
				expect(p.k).toBeGreaterThanOrEqual(0);
				expect(p.k).toBeLessThanOrEqual(1);
			}
		}
	}
});

test("drawn arrival: exact endpoints, monotone in time, earlier keys lead", () => {
	const keys = Array.from({ length: 21 }, (_, j) => j / 20);
	for (const k of keys) {
		expect(drawnT(0, k)).toBe(0);
		expect(drawnT(1, k)).toBe(1);
		let prev = 0;
		for (let m = 0; m <= 1; m += 1 / 256) {
			const t = drawnT(m, k);
			expect(t).toBeGreaterThanOrEqual(prev);
			expect(t).toBeLessThanOrEqual(drawnT(m, Math.max(0, k - 0.05)));
			prev = t;
		}
	}
	// The order is visible: the start of the drawing has landed by the time
	// the end leaves, give or take a little overlap.
	expect(drawnT(DRAW_W, 0)).toBe(1);
	expect(drawnT(1 - DRAW_W - 1e-9, 1)).toBe(0);
	expect(Math.abs(DRAW_W - 0.5)).toBeLessThan(0.1);
	// Each dot is in flight for DRAW_W of the morph.
	expect(drawnT(0.5 * (1 - DRAW_W), 0.5)).toBe(0);
	expect(drawnT(0.5 * (1 - DRAW_W) + DRAW_W, 0.5)).toBe(1);
});

test("morphing dots arc outward, short hops less, and land without a bump", () => {
	const p = mk();
	const tmp = mk();
	const a = mk();
	const b = mk();
	let lifted = 0;
	let short = 0;
	for (let i = 0; i < N; i += 97) {
		const src = (i * 7919) % N;
		(SHAPES[0] as (typeof SHAPES)[0])(src, N, 1, a);
		(SHAPES[2] as (typeof SHAPES)[0])(i, N, 1, b);
		const t = drawnT(0.5, b.k);
		expect(flightT(i, 0, 2, 0.5, 1, tmp)).toBe(t);
		evalPoint(i, src, 0, 2, t, 1, 1, p, tmp);
		// how far out the straight chord would be, and how far the dot flies
		const straight = Math.hypot(
			a.x + (b.x - a.x) * t,
			a.y + (b.y - a.y) * t,
			a.z + (b.z - a.z) * t,
		);
		const span = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
		const rise = ARC_LIFT * Math.min(1, span / ARC_SPAN);
		const r = Math.hypot(p.x, p.y, p.z);
		const lift = (rise * Math.sin(Math.PI * t) * straight) / Math.hypot(straight, ARC_CORE);
		expect(r - straight).toBeCloseTo(lift, 9);
		if (t > 0.2 && t < 0.8) lifted++;
		if (t > 0.2 && t < 0.8 && span < ARC_SPAN) short++;
	}
	expect(lifted).toBeGreaterThan(0);
	expect(short).toBeGreaterThan(0);
});

test("a path through the centre is lifted smoothly, never flipped across it", () => {
	const p = mk();
	const tmp = mk();
	// Trefoil to rings, dot i to dot i, where many chords pass close to the
	// middle. Step the flight finely and look for the jump a 1/|p| lift makes
	// at the centre.
	let worst = 0;
	for (let i = 0; i < N; i += 7) {
		let px = 0;
		let py = 0;
		let pz = 0;
		for (let j = 0; j <= 400; j++) {
			evalPoint(i, i, 0, 3, j / 400, 7.3, 7.3, p, tmp);
			if (j > 0) worst = Math.max(worst, Math.hypot(p.x - px, p.y - py, p.z - pz));
			px = p.x;
			py = p.y;
			pz = p.z;
		}
	}
	// A flight crosses at most ~2.6 units; split 400 ways with smoothstep's
	// 1.5x peak and the lift's 1 + ARC_LIFT / ARC_CORE gain near the centre.
	expect(worst).toBeLessThan((2.6 / 400) * 1.5 * (1 + ARC_LIFT / ARC_CORE));
});

/**
 * One whole morph from `from` to `to`, frame by frame, as the renderers run
 * it: dots paired at the morph's start, the draw key read then too, laps
 * counted from then until each dot lands, and wraps detected from the anchor
 * each dot was last drawn with. Phase runs at `pace`× its rest rate.
 */
function morph(
	from: number,
	to: number,
	opts: { frames: number; pace: number; every: number },
	visit: (i: number, step: number, t: number, lastT: number, wrapped: boolean) => void,
): void {
	const p = mk();
	const tmp = mk();
	const dots: number[] = [];
	for (let i = 0; i < N; i += opts.every) dots.push(i);
	const at = new Float64Array(dots.length * 3);
	const lastT = new Float64Array(dots.length);
	const morphPhase = 7.3;
	// Before the morph, every dot was drawn live at the phase it began at.
	const anchors = new Float64Array(dots.length).fill(morphPhase);
	const pairs = newPairing(N);
	pairDots(from, to, morphPhase, N, (s) => s, pairs);
	let phase = morphPhase;
	for (let f = 0; f <= opts.frames; f++) {
		const m = f / opts.frames;
		for (const [j, i] of dots.entries()) {
			const t = flightT(i, from, to, m, morphPhase, tmp);
			const src = pairs.src[i] as number;
			const anchor = strandAnchor(t, phase, morphPhase);
			const wrapped = strandWrapped(i, src, from, to, t, anchor, anchors[j] as number);
			anchors[j] = anchor;
			evalPoint(i, src, from, to, t, phase, anchor, p, tmp);
			const o = j * 3;
			const step = Math.hypot(
				p.x - (at[o] as number),
				p.y - (at[o + 1] as number),
				p.z - (at[o + 2] as number),
			);
			if (f > 0) visit(i, step, t, lastT[j] as number, wrapped);
			at[o] = p.x;
			at[o + 1] = p.y;
			at[o + 2] = p.z;
			lastT[j] = t;
		}
		phase += (opts.pace * 0.85) / opts.frames;
	}
}

const PAIRS = [0, 1, 2, 3].flatMap((f) =>
	[0, 1, 2, 3].filter((t) => t !== f).map((t) => [f, t] as const),
);

test("the drawing order holds still: no dot's progress jumps or runs backwards", () => {
	for (const [from, to] of PAIRS) {
		const frames = 204;
		// smoothstep's steepest slope over its share of the morph
		const most = (1.5 / DRAW_W / frames) * (1 + 1e-9);
		let bad = 0;
		morph(from, to, { frames, pace: 1.9, every: 13 }, (_i, _step, t, lastT) => {
			if (t < lastT || t - lastT > most) bad++;
		});
		expect(bad).toBe(0);
	}
});

test("no strand wraps under a dot from its pairing to its landing; wraps wait for it to land", () => {
	for (const [from, to] of PAIRS) {
		let jumps = 0;
		let early = 0;
		let landed = 0;
		morph(from, to, { frames: 204, pace: 1.9, every: 11 }, (_i, step, t, lastT, wrapped) => {
			// At 240 frames a second nothing honest moves a tenth of a unit.
			if (step > 0.1 && !wrapped) jumps++;
			// Neither while it waits to leave nor in flight.
			if (wrapped && t < 1) early++;
			if (wrapped && t === 1 && lastT < 1) landed++;
		});
		expect(jumps).toBe(0);
		expect(early).toBe(0);
		// Into a streaming object, some dots do hold a wrap until they land.
		if (to === 1 || to === 2) expect(landed).toBeGreaterThan(0);
	}
});

test("a dot counts its laps from its morph's start until it lands", () => {
	const began = 4;
	// Waiting to leave, then in flight, then landed.
	expect(strandAnchor(0, 4.2, began)).toBe(began);
	expect(strandAnchor(0.6, 4.6, began)).toBe(began);
	expect(strandAnchor(1, 4.9, began)).toBe(4.9);
});

test("a strand's lap changes exactly when its dot jumps back to the start", () => {
	const a = mk();
	const b = mk();
	for (const obj of [1, 2]) {
		const fn = SHAPES[obj] as (typeof SHAPES)[0];
		let laps = 0;
		for (let i = 0; i < N; i += 17) {
			for (let f = 0; f < 240; f++) {
				const p0 = 3 + f / 60;
				const p1 = p0 + 1 / 60;
				fn(i, N, p0, a);
				fn(i, N, p1, b);
				const jumped = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 0.3;
				const lap = strandLap(obj, i, p0) !== strandLap(obj, i, p1);
				expect(lap).toBe(jumped);
				if (lap) laps++;
			}
		}
		expect(laps).toBeGreaterThan(10);
	}
	// The other objects close on themselves and never wrap.
	expect(strandLap(0, 5, 1e3)).toBe(0);
	expect(strandLap(3, 5, 1e3)).toBe(0);
});

test("vertex accents light as their edges arrive and fade as the dots beside them leave", () => {
	for (let j = 0; j < 12; j++) {
		expect(accentWeight(j, 1, 1, 1, 0.5)).toBe(1);
		expect(accentWeight(j, 0, 0, 1, 0.5)).toBe(0);
		expect(accentWeight(j, 0, 1, 1, 0.5)).toBe(1);
		expect(accentWeight(j, 1, 2, 1, 0.5)).toBe(0);
		expect(accentWeight(j, 0, 2, 0.5, 0.5)).toBe(0);
		const hop = (ICO_HOP[j] as number) / 3;
		const leave = j / 11;
		for (let m = 0; m <= 1; m += 1 / 64) {
			// Arriving: with the dots drawn out to the vertex.
			expect(accentWeight(j, 3, 1, m, leave)).toBe(drawnT(m, hop));
			// Leaving: with the dots that leave from beside it.
			expect(accentWeight(j, 1, 3, m, leave)).toBe(1 - drawnT(m, leave));
		}
	}
});

test("the icosahedron is drawn outward from vertex 0, edge by edge", () => {
	expect(ICO_HOP[0]).toBe(0);
	// 1 seed, 5 neighbours, 5 beyond, 1 antipode
	expect([0, 1, 2, 3].map((h) => ICO_HOP.filter((x) => x === h).length)).toEqual([1, 5, 5, 1]);
	for (const [a, b] of ICO_EDGES) {
		const h0 = ICO_HOP[a] as number;
		const h1 = ICO_HOP[b] as number;
		expect(Math.abs(h0 - h1)).toBeLessThanOrEqual(1);
		// Keys meet at the vertices, so the drawing never jumps.
		expect(icoKey(h0, h1, 0)).toBeCloseTo(h0 / 3, 12);
		expect(icoKey(h0, h1, 1)).toBeCloseTo(h1 / 3, 12);
		for (let s = 0; s <= 1; s += 0.125) {
			expect(icoKey(h0, h1, s)).toBeGreaterThanOrEqual(Math.min(h0, h1) / 3);
		}
	}
});

test("WGSL icosahedron edge table matches the TS-computed edges exactly", async () => {
	const src = await Bun.file(new URL("./shader.wgsl", import.meta.url)).text();
	const table = src.slice(src.indexOf("ICO_EDGES"), src.indexOf("fn hash"));
	const pairs = [...table.matchAll(/vec2u\((\d+)u,\s*(\d+)u\)/g)].map((m) => [
		Number(m[1]),
		Number(m[2]),
	]);
	expect(pairs.length).toBe(30);
	expect(pairs).toEqual(ICO_EDGES.map((e) => [e[0], e[1]]));
});

test("projection is centered and depth-signed", () => {
	const f: Frame = {
		w: 1000,
		h: 800,
		cosY: 0,
		sinY: 0,
		cosX: 0,
		sinX: 0,
		cosZ: 0,
		sinZ: 0,
	};
	pose(f, 0, 0, 0);
	const out: Projected = { sx: 0, sy: 0, depth: 0 };
	project({ x: 0, y: 0, z: 0, a: 1, k: 0 }, f, out);
	expect(out.sx).toBe(500);
	expect(out.sy).toBe(400);
	project({ x: 0.5, y: 0, z: 0.5, a: 1, k: 0 }, f, out);
	expect(out.depth).toBeGreaterThan(0);
	project({ x: 0.5, y: 0, z: -0.5, a: 1, k: 0 }, f, out);
	expect(out.depth).toBeLessThan(0);
});

test("a half turn of yaw mirrors the cloud; back dots shade smaller and fainter", () => {
	const f: Frame = {
		w: 600,
		h: 600,
		cosY: 0,
		sinY: 0,
		cosX: 0,
		sinX: 0,
		cosZ: 0,
		sinZ: 0,
	};
	const a: Projected = { sx: 0, sy: 0, depth: 0 };
	const b: Projected = { sx: 0, sy: 0, depth: 0 };
	const p = { x: 0.4, y: 0.2, z: 0, a: 1, k: 0 };
	pose(f, 0, 0, 0);
	project(p, f, a);
	pose(f, Math.PI, 0, 0);
	project(p, f, b);
	expect(a.sx - 300).toBeCloseTo(300 - b.sx, 6);
	expect(a.sy).toBeCloseTo(b.sy, 6);

	const front: Shade = { a: 0, r: 0 };
	const back: Shade = { a: 0, r: 0 };
	shade(0.6, 1, 0.5, 0, 1, 0, 4, front);
	shade(0.6, -1, 0.5, 0, 1, 0, 4, back);
	expect(back.a).toBeLessThan(front.a);
	expect(back.r).toBeLessThan(front.r);
});

test("dots below the minimum radius widen and fade without losing ink", () => {
	const big: Shade = { a: 0, r: 0 };
	const small: Shade = { a: 0, r: 0 };
	for (const depth of [-1.2, -0.4, 0.3, 1.1]) {
		shade(0.6, depth, 0.4, 0, 1.3, 0, 40, big);
		shade(0.6, depth, 0.4, 0, 1.3, 0, 0.8, small);
		expect(small.r).toBeGreaterThanOrEqual(MIN_DOT_R);
		// Same alpha at full size; ink (alpha × area) is what the small dot keeps.
		const size = (big.r / 40) * 0.8;
		expect(small.a * small.r ** 2).toBeCloseTo(big.a * size ** 2, 9);
	}
	shade(0.6, 0, 0.4, 0, 1, 0, 4, big);
	expect(big.r).toBeGreaterThan(MIN_DOT_R);
});

const wgsl = (): Promise<string> => Bun.file(new URL("./shader.wgsl", import.meta.url)).text();
const wgslConst = (src: string, name: string): number =>
	Number(src.match(new RegExp(`const ${name}: f32 = (-?[\\d.]+);`))?.[1]);

test("WGSL icosahedron hop table matches the TS BFS", async () => {
	const src = await wgsl();
	const m = src.match(/const ICO_HOP = array<f32, 12>\(([^)]*)\)/);
	expect(m?.[1]?.split(",").map(Number)).toEqual([...ICO_HOP]);
	expect(wgslConst(src, "ICO_DEPTH")).toBe(Math.max(...ICO_HOP));
});

test("WGSL counts laps from the morph's start until a dot lands, as strandAnchor() does", async () => {
	const src = await wgsl();
	const body = src.slice(src.indexOf("fn strand_anchor("), src.indexOf("fn strand_wrapped("));
	expect(body).toMatch(/return select\(u\.phase, u\.morph_phase, t < 1\.0\);/);
});

test("WGSL keeps the same scalar constants", async () => {
	const src = await wgsl();
	expect(wgslConst(src, "ARC_LIFT")).toBe(ARC_LIFT);
	expect(wgslConst(src, "ARC_SPAN")).toBe(ARC_SPAN);
	expect(wgslConst(src, "ARC_CORE")).toBe(ARC_CORE);
	expect(wgslConst(src, "DRAW_W")).toBe(DRAW_W);
	expect(wgslConst(src, "MIN_DOT_R")).toBe(MIN_DOT_R);
	expect(wgslConst(src, "ACCENT_SIZE")).toBe(ACCENT_SIZE);
	expect(wgslConst(src, "ACCENT_ALPHA")).toBe(ACCENT_ALPHA);
});

test("the dot count has one source: the shader takes N from gpu.ts", async () => {
	expect(await wgsl()).not.toMatch(/const N\b/);
	const gpu = await Bun.file(new URL("./gpu.ts", import.meta.url)).text();
	expect(gpu).toMatch(/const N: f32 = \$\{N\}\.0;/);
	// Borromean rings split the pool three ways.
	expect(N % 3).toBe(0);
});

test("the dot hash is uniform in [0, 1) and independent across salts", () => {
	for (let salt = 1; salt <= 8; salt++) {
		const bins = new Array<number>(16).fill(0);
		for (let i = 0; i < N; i++) {
			const h = hash(i, salt);
			expect(h).toBeGreaterThanOrEqual(0);
			expect(h).toBeLessThan(1);
			bins[Math.floor(h * 16)] = (bins[Math.floor(h * 16)] ?? 0) + 1;
		}
		for (const b of bins) expect(Math.abs(b - N / 16) / (N / 16)).toBeLessThan(0.12);
	}
	let c = 0;
	for (let i = 0; i < N; i++) c += (hash(i, 6) - 0.5) * (hash(i, 7) - 0.5);
	expect(Math.abs(c / N)).toBeLessThan(0.005);
});
