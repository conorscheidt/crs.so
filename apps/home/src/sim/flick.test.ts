import { expect, test } from "bun:test";
import { Trail } from "../cursor";
import { flick } from "./flick";

const drag = (rate: number, until: number): Trail => {
	const tr = new Trail();
	for (let t = 0; t <= until; t += 4) tr.push(t, rate * t, -0.5 * rate * t);
	return tr;
};

test("a release mid-motion keeps the drag's rate, per second", () => {
	const out: [number, number] = [0, 0];
	flick(drag(0.001, 100), 100, 10, out);
	expect(out[0]).toBeCloseTo(1, 6);
	expect(out[1]).toBeCloseTo(-0.5, 6);
});

test("a pause before letting go slows the flick, and a long one kills it", () => {
	const out: [number, number] = [0, 0];
	flick(drag(0.001, 100), 120, 10, out);
	expect(out[0]).toBeGreaterThan(0);
	expect(out[0]).toBeLessThan(1);
	flick(drag(0.001, 100), 160, 10, out);
	expect(out).toEqual([0, 0]);
});

test("speed is capped and an empty trail lets go dead", () => {
	const out: [number, number] = [0, 0];
	flick(drag(0.05, 100), 100, 2.2, out);
	expect(out[0]).toBe(2.2);
	expect(out[1]).toBe(-2.2);
	flick(new Trail(), 0, 2.2, out);
	expect(out).toEqual([0, 0]);
});
