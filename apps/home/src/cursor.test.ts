import { describe, expect, it } from "bun:test";
import { magnetism, Trail } from "./cursor";

const rect = (left: number, top: number, w: number, h: number) => ({
	left,
	top,
	right: left + w,
	bottom: top + h,
});

describe("cursor magnetism", () => {
	it("is inert when nothing is in reach", () => {
		const p = magnetism(0, 0, [rect(1000, 1000, 50, 20)]);
		expect(p.x).toBe(0);
		expect(p.y).toBe(0);
		expect(p.d).toBe(Number.POSITIVE_INFINITY);
	});

	it("pulls toward a target below the pointer", () => {
		const p = magnetism(100, 100, [rect(80, 130, 60, 20)]);
		expect(p.y).toBeGreaterThan(0);
		expect(Math.abs(p.x)).toBeLessThan(0.001);
		expect(p.d).toBeCloseTo(30, 5);
	});

	it("attracts from the nearest edge of a wide row", () => {
		// a wide row; the pointer sits above its left end. A centre-based pull
		// would drag right — an edge-based one pulls straight down.
		const wide = rect(0, 100, 600, 20);
		const p = magnetism(20, 70, [wide]);
		expect(Math.abs(p.x)).toBeLessThan(0.001);
		expect(p.y).toBeGreaterThan(0);
	});

	it("strengthens as the target nears, and never exceeds the cap", () => {
		const target = [rect(0, 100, 100, 20)];
		const far = magnetism(50, 20, target); // 80px away
		const near = magnetism(50, 90, target); // 10px away
		expect(near.y).toBeGreaterThan(far.y);
		expect(near.y).toBeLessThanOrEqual(6.0001);
	});

	it("chooses the closest of several targets", () => {
		const p = magnetism(0, 0, [rect(60, -10, 20, 20), rect(20, -10, 20, 20)]);
		expect(p.d).toBeCloseTo(20, 5);
		expect(p.x).toBeGreaterThan(0);
	});
});

describe("cursor field continuity", () => {
	const row = rect(0, 100, 200, 20);

	it("has no step at a target's edge", () => {
		const outside = magnetism(50, 99.99, [row]);
		const inside = magnetism(50, 100.01, [row]);
		expect(Math.abs(outside.y - inside.y)).toBeLessThan(0.1);
	});

	it("cancels smoothly in the gap between two targets", () => {
		const pair = [rect(0, 0, 20, 20), rect(60, 0, 20, 20)];
		const mid = magnetism(40, 10, pair);
		const left = magnetism(39.9, 10, pair);
		const right = magnetism(40.1, 10, pair);
		expect(Math.abs(mid.x)).toBeLessThan(1e-9);
		expect(Math.abs(left.x - right.x)).toBeLessThan(0.1);
	});
});

describe("cursor trail", () => {
	it("interpolates between samples and holds the newest past the end", () => {
		const tr = new Trail();
		tr.push(0, 0, 0);
		tr.push(10, 100, 50);
		const out: [number, number] = [0, 0];
		tr.at(5, out);
		expect(out).toEqual([50, 25]);
		tr.at(30, out);
		expect(out).toEqual([100, 50]);
	});

	it("moves evenly per frame when input and frames beat", () => {
		const tr = new Trail();
		const steps: number[] = [];
		const out: [number, number] = [0, 0];
		let last = Number.NaN;
		let input = 0;
		// 1000 px/s, input every ~8 ms with jitter, frames every 8.33 ms
		for (let f = 0; f < 240; f++) {
			const t = f * 8.333;
			while (input <= t) {
				tr.push(input, input, 0);
				input += 8 + ((input * 7919) % 3) - 1;
			}
			tr.at(t - Math.min(18, Math.max(8, 1.25 * tr.interval)), out);
			if (f > 20 && !Number.isNaN(last)) steps.push(out[0] - last);
			last = out[0];
		}
		const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
		const sd = Math.sqrt(steps.reduce((a, b) => a + (b - mean) ** 2, 0) / steps.length);
		expect(mean).toBeCloseTo(8.333, 1);
		expect(sd / mean).toBeLessThan(0.05);
	});

	it("estimates velocity from the recent samples", () => {
		const tr = new Trail();
		for (let t = 0; t <= 40; t += 8) tr.push(t, 2 * t, -t);
		const v: [number, number] = [0, 0];
		tr.velocity(30, v);
		expect(v[0]).toBeCloseTo(2, 6);
		expect(v[1]).toBeCloseTo(-1, 6);
	});

	it("starts a new gesture after a pause", () => {
		const tr = new Trail();
		tr.push(0, 0, 0);
		tr.push(200, 10, 10);
		expect(tr.size).toBe(1);
	});
});
