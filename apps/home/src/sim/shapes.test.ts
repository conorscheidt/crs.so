import { expect, test } from "bun:test";
import { type Frame, type Projected, project } from "./camera";
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
		yaw: 0,
		tiltX: 0,
		tiltZ: 0,
		cx: 500,
		cy: 400,
		cursorActive: 1,
		dimpleR: 26,
	};
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
