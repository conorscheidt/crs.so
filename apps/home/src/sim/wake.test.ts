import { expect, test } from "bun:test";
import { spring, WAKE_DRAG, WAKE_PUSH, WAKE_R, WAKE_W0, wakeForce } from "./wake";

const run = (x: number, v: number, a: number, dt: number, steps: number): [number, number] => {
	const s: [number, number] = [x, v];
	for (let j = 0; j < steps; j++) spring(s[0], s[1], a, dt, Math.exp(-WAKE_W0 * dt), s);
	return s;
};

test("the spring step is exact: frame rate does not change the path", () => {
	for (const [x, v, a] of [
		[12, 0, 0],
		[0, 300, 0],
		[-4, 80, 900],
	] as const) {
		const coarse = run(x, v, a, 1 / 30, 9);
		const fine = run(x, v, a, 1 / 120, 36);
		expect(fine[0]).toBeCloseTo(coarse[0], 9);
		expect(fine[1]).toBeCloseTo(coarse[1], 9);
	}
	// dt = 0 holds everything still.
	expect(run(5, 7, 100, 0, 3)).toEqual([5, 7]);
});

test("the wake heals without overshoot and settles where a held push balances it", () => {
	let s: [number, number] = [10, 0];
	for (let j = 0; j < 240; j++) {
		s = run(s[0], s[1], 0, 1 / 60, 1);
		expect(s[0]).toBeGreaterThanOrEqual(0);
	}
	expect(s[0]).toBeLessThan(1e-3);
	const held = run(0, 0, 720, 1 / 60, 600);
	expect(held[0]).toBeCloseTo(720 / WAKE_W0 ** 2, 6);
});

test("the cursor pushes dots away, drags them along, and only within reach", () => {
	const f: [number, number] = [0, 0];
	wakeForce(10, 0, 0, 0, 1, 1, f);
	expect(f[0]).toBeCloseTo(WAKE_PUSH * (1 - 10 / WAKE_R) ** 2, 9);
	expect(f[1]).toBe(0);
	wakeForce(0, -10, 0, 0, 1, 1, f);
	expect(f[1]).toBeLessThan(0);
	// A moving cursor hands the dot a share of its velocity.
	const still: [number, number] = [0, 0];
	wakeForce(10, 0, 0, 0, 1, 1, still);
	wakeForce(10, 0, 0, 500, 1, 1, f);
	expect(f[0]).toBeCloseTo(still[0], 9);
	expect(f[1]).toBeCloseTo(500 * WAKE_DRAG * (1 - 10 / WAKE_R) ** 2, 9);
	// Fades with the cursor, and is gone at its reach.
	wakeForce(10, 0, 0, 500, 0.5, 1, f);
	expect(f[0]).toBeCloseTo(still[0] / 2, 9);
	wakeForce(WAKE_R, 0, 0, 500, 1, 1, f);
	expect(f).toEqual([0, 0]);
	wakeForce(10, 0, 0, 500, 0, 1, f);
	expect(f).toEqual([0, 0]);
	// Twice the density: the same wake, in twice the pixels.
	wakeForce(20, 0, 0, 0, 1, 2, f);
	expect(f[0]).toBeCloseTo(2 * still[0], 9);
	// Finite right under the cursor.
	wakeForce(0, 0, 0, 0, 1, 1, f);
	expect(f).toEqual([0, 0]);
});

test("WGSL keeps the wake constants", async () => {
	const src = await Bun.file(new URL("./shader.wgsl", import.meta.url)).text();
	const c = (name: string): number =>
		Number(src.match(new RegExp(`const ${name}: f32 = (-?[\\d.]+);`))?.[1]);
	expect(c("WAKE_R")).toBe(WAKE_R);
	expect(c("WAKE_PUSH")).toBe(WAKE_PUSH);
	expect(c("WAKE_DRAG")).toBe(WAKE_DRAG);
	expect(c("WAKE_W0")).toBe(WAKE_W0);
});
