import { expect, test } from "bun:test";
import {
	type Frame,
	inkNight,
	LIGHT,
	pose,
	rotate,
	type Shade,
	SPEC_POWER,
	type Strand,
	shade,
	strand,
	TANGENT_EPS,
	type Vec3,
} from "./camera";
import { N, type Pt, SHAPES } from "./shapes";

const mkStrand = (): Strand => ({ diff: 0, spec: 0 });
const mkShade = (): Shade => ({ a: 0, r: 0 });

const frame = (yaw: number, tiltX: number, tiltZ: number): Frame => {
	const f: Frame = {
		w: 800,
		h: 600,
		cosY: 1,
		sinY: 0,
		cosX: 1,
		sinX: 0,
		cosZ: 1,
		sinZ: 0,
		cx: 0,
		cy: 0,
		cursorActive: 0,
		dimpleR: 0,
	};
	pose(f, yaw, tiltX, tiltZ);
	return f;
};

test("rotation keeps lengths", () => {
	const f = frame(0.9, -0.4, 0.2);
	const v: Vec3 = { x: 0, y: 0, z: 0 };
	rotate(f, 0.3, -0.7, 0.5, v);
	expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(Math.hypot(0.3, -0.7, 0.5), 12);
});

test("strand light ignores tangent sign and length", () => {
	const a = mkStrand();
	const b = mkStrand();
	for (const [x, y, z] of [
		[1, 0, 0],
		[0.3, -0.8, 0.2],
		[-0.1, 0.4, 0.9],
	] as const) {
		strand(x, y, z, a);
		strand(-3 * x, -3 * y, -3 * z, b);
		expect(b.diff).toBeCloseTo(a.diff, 12);
		expect(b.spec).toBeCloseTo(a.spec, 12);
		expect(a.diff).toBeGreaterThanOrEqual(0);
		expect(a.diff).toBeLessThanOrEqual(1);
		expect(a.spec).toBeGreaterThanOrEqual(0);
		expect(a.spec).toBeLessThanOrEqual(1);
	}
});

test("a strand along the light is dark; across it, fully lit", () => {
	const s = mkStrand();
	strand(LIGHT[0], LIGHT[1], LIGHT[2], s);
	expect(s.diff).toBeLessThan(1e-6);
	// Perpendicular to the light, in the screen plane.
	strand(-LIGHT[1], LIGHT[0], 0, s);
	expect(s.diff).toBeCloseTo(1, 12);
});

test("the highlight peaks where the strand makes equal angles with light and eye", () => {
	const s = mkStrand();
	// Perpendicular to both light and view: 90° to each.
	const cx = LIGHT[1];
	const cy = -LIGHT[0];
	strand(cx, cy, 0, s);
	expect(s.spec).toBeCloseTo(1, 9);
	// Pointing at the viewer: 0° to the eye, ~45° to the light.
	strand(0, 0, 1, s);
	expect(s.spec).toBeLessThan(0.71 ** SPEC_POWER * 1.01);
	// A zero tangent lights as one pointing at the viewer.
	const z = mkStrand();
	strand(0, 0, 0, z);
	expect(z.diff).toBeCloseTo(s.diff, 12);
	expect(z.spec).toBeCloseTo(s.spec, 12);
});

test("night ink gathers on lit strands; day ink thins there", () => {
	const lit = mkShade();
	const dark = mkShade();
	shade(0.4, 0.8, 1, 0, 1.08, 1, 4, lit);
	shade(0.4, 0.8, 0.1, 0, 1.08, 1, 4, dark);
	expect(lit.a).toBeGreaterThan(dark.a * 1.5);
	shade(0.4, 0.8, 1, 0, 1.55, 0, 4, lit);
	shade(0.4, 0.8, 0.1, 0, 1.55, 0, 4, dark);
	expect(lit.a).toBeLessThan(dark.a);
});

test("a glint brightens and widens at night, and lets paper through by day", () => {
	const plain = mkShade();
	const glint = mkShade();
	shade(0.4, 1, 0.8, 0, 1.08, 1, 4, plain);
	shade(0.4, 1, 0.8, 1, 1.08, 1, 4, glint);
	expect(glint.a).toBeGreaterThan(plain.a);
	expect(glint.r).toBeGreaterThan(plain.r);
	expect(glint.a).toBeLessThanOrEqual(0.92);
	shade(0.4, 1, 0.8, 0, 1.55, 0, 4, plain);
	shade(0.4, 1, 0.8, 1, 1.55, 0, 4, glint);
	expect(glint.a).toBeLessThan(plain.a);
	expect(glint.r).toBe(plain.r);
});

test("the back of the object sits in shadow: night strands there dim", () => {
	const front = mkShade();
	const back = mkShade();
	for (const night of [0, 1]) {
		shade(0.4, 1.1, 0.9, 0.5, 1.2, night, 4, front);
		shade(0.4, -1.1, 0.9, 0.5, 1.2, night, 4, back);
		expect(back.a).toBeLessThan(front.a);
		expect(back.r).toBeLessThan(front.r);
	}
});

test("ink reads as night only when it is light", () => {
	expect(inkNight(34 / 255, 31 / 255, 26 / 255)).toBe(0);
	expect(inkNight(232 / 255, 228 / 255, 217 / 255)).toBe(1);
	expect(inkNight(0.5, 0.5, 0.5)).toBeCloseTo(0.5, 9);
});

test("a phase step lands on the dot's own strand", () => {
	// The step must be short against each object's curvature: the chord from
	// p(phase) to p(phase + ε) should stay within a few percent of the strand.
	const a: Pt = { x: 0, y: 0, z: 0, a: 0, k: 0 };
	const b: Pt = { ...a };
	const c: Pt = { ...a };
	for (let obj = 0; obj < SHAPES.length; obj++) {
		const fn = SHAPES[obj] as (typeof SHAPES)[0];
		let bent = 0;
		let n = 0;
		for (let i = 0; i < N; i += 37) {
			fn(i, N, 4, a);
			fn(i, N, 4 + TANGENT_EPS, b);
			fn(i, N, 4 + 2 * TANGENT_EPS, c);
			const u = [b.x - a.x, b.y - a.y, b.z - a.z];
			const w = [c.x - b.x, c.y - b.y, c.z - b.z];
			const lu = Math.hypot(u[0] ?? 0, u[1] ?? 0, u[2] ?? 0);
			const lw = Math.hypot(w[0] ?? 0, w[1] ?? 0, w[2] ?? 0);
			// Skip the samples that wrap from one end of their strand to the other.
			if (lu > 0.1 || lw > 0.1) continue;
			const cos =
				((u[0] ?? 0) * (w[0] ?? 0) + (u[1] ?? 0) * (w[1] ?? 0) + (u[2] ?? 0) * (w[2] ?? 0)) /
				(lu * lw);
			if (cos < 0.97) bent++;
			n++;
		}
		expect(n).toBeGreaterThan(100);
		expect(bent / n).toBeLessThan(0.02);
	}
});

const wgsl = (): Promise<string> => Bun.file(new URL("./shader.wgsl", import.meta.url)).text();
const cameraSrc = (): Promise<string> => Bun.file(new URL("./camera.ts", import.meta.url)).text();
const literals = (src: string, decl: RegExp): number[] =>
	[...(src.match(decl)?.[1]?.matchAll(/\d+(?:\.\d+)?/g) ?? [])].map((m) => Number(m[0]));

test("WGSL lighting matches camera.ts", async () => {
	const src = await wgsl();
	const ts = await cameraSrc();
	const light = src
		.match(/const LIGHT: vec3f = vec3f\(([^)]*)\)/)?.[1]
		?.split(",")
		.map(Number);
	expect(light?.length).toBe(3);
	for (let j = 0; j < 3; j++) expect(light?.[j]).toBeCloseTo(LIGHT[j] as number, 6);
	expect(Number(src.match(/const SPEC_POWER: f32 = ([\d.]+);/)?.[1])).toBe(SPEC_POWER);
	expect(Number(src.match(/const TANGENT_EPS: f32 = ([\d.]+);/)?.[1])).toBe(TANGENT_EPS);
	for (const [tsName, wgslName] of [
		["occl", "occl"],
		["nightTone", "night_tone"],
		["dayTone", "day_tone"],
	] as const) {
		const a = literals(ts, new RegExp(`const ${tsName} = ([^;]+);`));
		const b = literals(src, new RegExp(`let ${wgslName} = ([^;]+);`));
		expect(a.length).toBeGreaterThan(0);
		expect(b).toEqual(a);
	}
});
