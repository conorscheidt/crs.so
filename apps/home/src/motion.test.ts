import { expect, test } from "bun:test";
import { cubicBezier, ease, MOTION, siteCurve } from "./motion";

/** Reference: solve x(s) = u by plain bisection on the Bernstein form. */
function reference(x1: number, y1: number, x2: number, y2: number, u: number): number {
	const b = (p1: number, p2: number, s: number): number =>
		3 * (1 - s) * (1 - s) * s * p1 + 3 * (1 - s) * s * s * p2 + s ** 3;
	let lo = 0;
	let hi = 1;
	for (let i = 0; i < 200; i++) {
		const mid = (lo + hi) / 2;
		if (b(x1, x2, mid) < u) lo = mid;
		else hi = mid;
	}
	return b(y1, y2, (lo + hi) / 2);
}

const CURVES: [number, number, number, number][] = [
	[0.22, 1, 0.36, 1],
	[0.42, 0, 0.58, 1],
	[0.25, 0.1, 0.25, 1],
	[0, 0, 1, 1],
	[0.68, -0.55, 0.27, 1.55],
];
/** x(s) stands still at s = ½, so y there is only defined to about 1e-5. */
const VERTICAL: [number, number, number, number] = [1, 0, 0, 1];

test("cubic-bezier() is solved to float precision", () => {
	for (const c of CURVES) {
		const curve = cubicBezier(...c);
		for (let j = 0; j <= 1000; j++) {
			const u = j / 1000;
			expect(Math.abs(curve.at(u) - reference(...c, u))).toBeLessThan(1e-9);
		}
	}
});

test("a curve starts and ends exactly, and holds outside [0, 1]", () => {
	for (const c of [...CURVES, VERTICAL]) {
		const curve = cubicBezier(...c);
		expect(curve.at(0)).toBe(0);
		expect(curve.at(1)).toBe(1);
		expect(curve.at(-0.5)).toBe(0);
		expect(curve.at(1.5)).toBe(1);
		expect(curve.at(Number.NaN)).toBe(0);
		expect(curve.slope(-0.1)).toBe(0);
		expect(curve.slope(1.1)).toBe(0);
	}
	const vertical = cubicBezier(...VERTICAL);
	expect(vertical.at(0.5)).toBeCloseTo(0.5, 4);
	expect(vertical.slope(0.5)).toBeGreaterThan(1e3);
});

test("the slope is the curve's derivative", () => {
	for (const c of CURVES) {
		const curve = cubicBezier(...c);
		const h = 1e-6;
		for (let j = 1; j < 100; j++) {
			const u = j / 100;
			const fd = (curve.at(u + h) - curve.at(u - h)) / (2 * h);
			expect(curve.slope(u)).toBeCloseTo(fd, 4);
		}
		const [x1, y1, x2, y2] = c;
		// The end tangents are the control arms.
		if (x1 > 0) expect(curve.slope(0)).toBeCloseTo(y1 / x1, 9);
		if (x2 < 1) expect(curve.slope(1)).toBeCloseTo((1 - y2) / (1 - x2), 9);
	}
});

test("the site curve is the contract's: fast out, no overshoot, flat landing", () => {
	expect(MOTION.curve).toEqual([0.22, 1, 0.36, 1]);
	expect(ease).toBe(siteCurve.at);
	expect(ease(0.2)).toBeCloseTo(0.674, 3);
	expect(ease(0.5)).toBeCloseTo(0.961, 3);
	expect(siteCurve.slope(0)).toBeCloseTo(1 / 0.22, 12);
	expect(siteCurve.slope(1)).toBe(0);
	let prev = 0;
	for (let j = 1; j <= 1000; j++) {
		const v = ease(j / 1000);
		expect(v).toBeGreaterThanOrEqual(prev);
		expect(v).toBeLessThanOrEqual(1);
		prev = v;
	}
});
