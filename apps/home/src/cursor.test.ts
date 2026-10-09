import { describe, expect, it } from "bun:test";
import { bezier, glide, magnetism, Trail } from "./cursor";

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

describe("composited glide", () => {
	// Reference: solve x(s) = u by bisection on the exact curve.
	const exact = (x1: number, y1: number, x2: number, y2: number, u: number): number => {
		const c = (p1: number, p2: number, s: number): number =>
			3 * (1 - s) * (1 - s) * s * p1 + 3 * (1 - s) * s * s * p2 + s ** 3;
		let lo = 0;
		let hi = 1;
		for (let i = 0; i < 60; i++) {
			const mid = (lo + hi) / 2;
			if (c(x1, x2, mid) < u) lo = mid;
			else hi = mid;
		}
		return c(y1, y2, (lo + hi) / 2);
	};

	it("tabulates cubic-bezier() closely", () => {
		const curves: [number, number, number, number][] = [
			[0.22, 1, 0.36, 1],
			[0.42, 0, 0.58, 1],
			[0.25, 0.1, 0.25, 1],
		];
		for (const [x1, y1, x2, y2] of curves) {
			const b = bezier(x1, y1, x2, y2);
			for (let u = 0; u <= 1; u += 0.01) {
				expect(Math.abs(b(u) - exact(x1, y1, x2, y2, u))).toBeLessThan(0.01);
			}
			expect(b(0)).toBe(0);
			expect(b(1)).toBe(1);
			expect(b(-1)).toBe(0);
			expect(b(2)).toBe(1);
		}
	});

	it("trails the set value and arrives after the duration", () => {
		const g = glide(80, bezier(0.22, 1, 0.36, 1));
		const out: [number, number] = [0, 0];
		g.jump(0, 0);
		g.to(1000, 100, 50);
		g.at(1000, out);
		expect(out).toEqual([0, 0]);
		g.at(1020, out);
		expect(out[0]).toBeGreaterThan(0);
		expect(out[0]).toBeLessThan(100);
		expect(out[1]).toBeCloseTo(out[0] / 2, 9);
		g.at(1080, out);
		expect(out).toEqual([100, 50]);
	});

	it("restarts from the point already reached when retargeted", () => {
		const g = glide(80, bezier(0.22, 1, 0.36, 1));
		const mid: [number, number] = [0, 0];
		const out: [number, number] = [0, 0];
		g.jump(0, 0);
		g.to(0, 100, 0);
		g.at(20, mid);
		g.to(20, 200, 0);
		g.at(20, out);
		expect(out[0]).toBeCloseTo(mid[0], 9);
		g.at(99, out);
		expect(out[0]).toBeLessThan(200);
		g.at(100, out);
		expect(out[0]).toBe(200);
	});

	it("draws where the value is set when not transitioning", () => {
		const g = glide(80, bezier(0.22, 1, 0.36, 1));
		const out: [number, number] = [0, 0];
		g.to(0, 100, 0);
		g.jump(40, 30);
		g.at(1, out);
		expect(out).toEqual([40, 30]);
	});
});
