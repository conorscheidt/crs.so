import { expect, test } from "bun:test";
import {
	exposure,
	SHUTTER_EXPOSURE,
	SHUTTER_FROM,
	SHUTTER_JUMP,
	SHUTTER_MAX,
	SHUTTER_TO,
	streak,
} from "./shutter";

const dt = 1 / 60;
/** streak length at a screen speed in CSS px/s, dpr 1 */
const at = (speed: number): number => streak(speed * dt, dt, 300, 1);

test("slow dots stay discs; fast ones streak, smoothly and no longer than the cap", () => {
	expect(at(0)).toBe(0);
	expect(at(SHUTTER_FROM)).toBeCloseTo(0, 12);
	expect(at(SHUTTER_FROM - 50)).toBe(0);
	const c = (1000 - SHUTTER_FROM) / (SHUTTER_TO - SHUTTER_FROM);
	expect(at(1000)).toBeCloseTo(1000 * SHUTTER_EXPOSURE * c * c * (3 - 2 * c), 9);
	expect(at(SHUTTER_TO)).toBe(Math.min(SHUTTER_MAX, SHUTTER_TO * SHUTTER_EXPOSURE));
	let prev = 0;
	for (let v = SHUTTER_FROM; v <= 4000; v += 25) {
		const len = at(v);
		expect(len).toBeGreaterThanOrEqual(prev);
		expect(len).toBeLessThanOrEqual(SHUTTER_MAX);
		// No step: a small change in speed is a small change in length.
		expect(len - prev).toBeLessThan(1);
		prev = len;
	}
	expect(at(4000)).toBe(SHUTTER_MAX);
});

test("no streak across an unknown frame or a wrap to the strand's far end", () => {
	expect(streak(30, 0, 300, 1)).toBe(0);
	expect(streak(SHUTTER_JUMP * 300 + 1, dt, 300, 1)).toBe(0);
	expect(streak(SHUTTER_JUMP * 300 - 1, dt, 300, 1)).toBe(SHUTTER_MAX);
});

test("streaks measure in CSS px whatever the density", () => {
	for (const v of [700, 1000, 2500]) {
		expect(streak(2 * v * dt, dt, 600, 2)).toBeCloseTo(2 * at(v), 9);
	}
});

test("a capsule lays the ink of the disc it replaces", () => {
	for (const r of [1.4, 2, 5]) {
		for (const len of [0, 3, 16]) {
			const area = Math.PI * r * r + 2 * r * len;
			expect(exposure(r, len) * area).toBeCloseTo(Math.PI * r * r, 9);
		}
	}
});

test("WGSL keeps the shutter constants", async () => {
	const src = await Bun.file(new URL("./shader.wgsl", import.meta.url)).text();
	const c = (name: string): number =>
		Number(src.match(new RegExp(`const ${name}: f32 = (-?[\\d.]+);`))?.[1]);
	expect(c("SHUTTER_FROM")).toBe(SHUTTER_FROM);
	expect(c("SHUTTER_TO")).toBe(SHUTTER_TO);
	expect(c("SHUTTER_EXPOSURE")).toBe(SHUTTER_EXPOSURE);
	expect(c("SHUTTER_MAX")).toBe(SHUTTER_MAX);
	expect(c("SHUTTER_JUMP")).toBe(SHUTTER_JUMP);
});
