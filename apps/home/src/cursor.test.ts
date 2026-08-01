import { describe, expect, it } from "bun:test";
import { magnetism } from "./cursor";

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
