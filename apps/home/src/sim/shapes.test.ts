import { expect, test } from "bun:test";
import { type Frame, MIN_DOT_R, type Projected, pose, project, type Shade, shade } from "./camera";
import {
	ACCENT_ALPHA,
	ACCENT_SIZE,
	ARC_LIFT,
	drawnT,
	evalPoint,
	ICO_EDGES,
	ICO_HOP,
	icoKey,
	N,
	type Pt,
	SHAPES,
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
		evalPoint(i, 0, 3, 0, 2, p, tmp);
		(SHAPES[0] as (typeof SHAPES)[0])(i, N, 2, q);
		expect(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)).toBeLessThan(1e-9);
		evalPoint(i, 0, 3, 1, 2, p, tmp);
		(SHAPES[3] as (typeof SHAPES)[0])(i, N, 2, q);
		expect(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)).toBeLessThan(1e-9);
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
	// The order is visible: halfway through, the start of the drawing has
	// landed and the end has not left.
	expect(drawnT(0.55, 0)).toBe(1);
	expect(drawnT(0.45, 1)).toBe(0);
});

test("morphing dots arc outward and land without a bump", () => {
	const p = mk();
	const tmp = mk();
	const a = mk();
	const b = mk();
	let lifted = 0;
	for (let i = 0; i < N; i += 97) {
		(SHAPES[0] as (typeof SHAPES)[0])(i, N, 1, a);
		(SHAPES[2] as (typeof SHAPES)[0])(i, N, 1, b);
		const t = drawnT(0.5, b.k);
		evalPoint(i, 0, 2, 0.5, 1, p, tmp);
		const chord = Math.hypot(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
		const r = Math.hypot(p.x, p.y, p.z);
		expect(r - chord).toBeCloseTo(ARC_LIFT * Math.sin(Math.PI * t), 9);
		if (t > 0.2 && t < 0.8) lifted++;
	}
	expect(lifted).toBeGreaterThan(0);
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

test("projection is centered, depth-shaded, and dimple pushes outward", () => {
	const f: Frame = {
		w: 1000,
		h: 800,
		cosY: 0,
		sinY: 0,
		cosX: 0,
		sinX: 0,
		cosZ: 0,
		sinZ: 0,
		cx: 500,
		cy: 400,
		cursorActive: 1,
		dimpleR: 26,
	};
	pose(f, 0, 0, 0);
	const out: Projected = { sx: 0, sy: 0, depth: 0 };
	project({ x: 0, y: 0, z: 0, a: 1, k: 0 }, f, out);
	// The origin sits under the cursor: dimple pushes it off-center slightly.
	expect(Math.hypot(out.sx - 500, out.sy - 400)).toBeLessThan(f.dimpleR);
	const near: Projected = { sx: 0, sy: 0, depth: 0 };
	f.cursorActive = 0;
	project({ x: 0.5, y: 0, z: 0.5, a: 1, k: 0 }, f, near);
	expect(near.depth).toBeGreaterThan(0);
	project({ x: 0.5, y: 0, z: -0.5, a: 1, k: 0 }, f, near);
	expect(near.depth).toBeLessThan(0);
});

test("the dimple's push scales with its weight", () => {
	const f: Frame = {
		w: 1000,
		h: 800,
		cosY: 0,
		sinY: 0,
		cosX: 0,
		sinX: 0,
		cosZ: 0,
		sinZ: 0,
		cx: 0,
		cy: 0,
		cursorActive: 0,
		dimpleR: 26,
	};
	pose(f, 0, 0, 0);
	const p = { x: 0.05, y: 0, z: 0, a: 1, k: 0 };
	const at = (w: number): number => {
		const out: Projected = { sx: 0, sy: 0, depth: 0 };
		f.cursorActive = w;
		project(p, f, out);
		return out.sx;
	};
	const rest = at(0);
	f.cx = rest - 10;
	f.cy = 400;
	const full = at(1) - rest;
	expect(full).toBeGreaterThan(1);
	expect(at(0.5) - rest).toBeCloseTo(full / 2, 9);
	expect(at(0.0005)).toBe(rest);
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
		cx: 0,
		cy: 0,
		cursorActive: 0,
		dimpleR: 14,
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

test("WGSL keeps the same scalar constants", async () => {
	const src = await wgsl();
	expect(wgslConst(src, "ARC_LIFT")).toBe(ARC_LIFT);
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
