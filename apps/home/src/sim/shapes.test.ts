import { expect, test } from "bun:test";
import { type Frame, MIN_DOT_R, type Projected, pose, project, type Shade, shade } from "./camera";
import { evalPoint, ICO_EDGES, N, type Pt, SHAPES, staggeredT } from "./shapes";

const mk = (): Pt => ({ x: 0, y: 0, z: 0, a: 0 });

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

test("morph endpoints equal the pure objects; stagger is clamped and monotone", () => {
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
		expect(staggeredT(0, i)).toBe(0);
		expect(staggeredT(1, i)).toBe(1);
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
	const out: Projected = { sx: 0, sy: 0, depth: 0, lit: 0 };
	project({ x: 0, y: 0, z: 0, a: 1 }, f, out);
	// The origin sits under the cursor: dimple pushes it off-center slightly.
	expect(Math.hypot(out.sx - 500, out.sy - 400)).toBeLessThan(f.dimpleR);
	const near: Projected = { sx: 0, sy: 0, depth: 0, lit: 0 };
	f.cursorActive = 0;
	project({ x: 0.5, y: 0, z: 0.5, a: 1 }, f, near);
	expect(near.depth).toBeGreaterThan(0);
	project({ x: 0.5, y: 0, z: -0.5, a: 1 }, f, near);
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
	const p = { x: 0.05, y: 0, z: 0, a: 1 };
	const at = (w: number): number => {
		const out: Projected = { sx: 0, sy: 0, depth: 0, lit: 0 };
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
	const a: Projected = { sx: 0, sy: 0, depth: 0, lit: 0 };
	const b: Projected = { sx: 0, sy: 0, depth: 0, lit: 0 };
	const p = { x: 0.4, y: 0.2, z: 0, a: 1 };
	pose(f, 0, 0, 0);
	project(p, f, a);
	pose(f, Math.PI, 0, 0);
	project(p, f, b);
	expect(a.sx - 300).toBeCloseTo(300 - b.sx, 6);
	expect(a.sy).toBeCloseTo(b.sy, 6);

	const front: Shade = { a: 0, r: 0 };
	const back: Shade = { a: 0, r: 0 };
	shade(0.6, 1, 0.5, 1, 4, front);
	shade(0.6, -1, 0.5, 1, 4, back);
	expect(back.a).toBeLessThan(front.a);
	expect(back.r).toBeLessThan(front.r);
});

test("dots below the minimum radius widen and fade without losing ink", () => {
	const big: Shade = { a: 0, r: 0 };
	const small: Shade = { a: 0, r: 0 };
	for (const depth of [-1.2, -0.4, 0.3, 1.1]) {
		shade(0.6, depth, 0.4, 1.3, 40, big);
		shade(0.6, depth, 0.4, 1.3, 0.8, small);
		expect(small.r).toBeGreaterThanOrEqual(MIN_DOT_R);
		// Same alpha at full size; ink (alpha × area) is what the small dot keeps.
		const size = (big.r / 40) * 0.8;
		expect(small.a * small.r ** 2).toBeCloseTo(big.a * size ** 2, 9);
	}
	shade(0.6, 0, 0.4, 1, 4, big);
	expect(big.r).toBeGreaterThan(MIN_DOT_R);
});

test("WGSL keeps the same minimum dot radius", async () => {
	const src = await Bun.file(new URL("./shader.wgsl", import.meta.url)).text();
	const m = src.match(/const MIN_DOT_R: f32 = ([\d.]+);/);
	expect(Number(m?.[1])).toBe(MIN_DOT_R);
});
