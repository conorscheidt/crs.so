import { describe, expect, test } from "bun:test";
import { cores, grid } from "./data";
import { carried, madds, pointOf, START, slice, stored } from "./format";
import { smoothed } from "./model";
import { evaluate } from "./train";

describe("the train plate", () => {
	test("the default point alternates the two nodes nearest zero", () => {
		expect(Array.from(pointOf(START), (x) => x.toFixed(4))).toEqual(
			Array.from({ length: 9 }, (_, k) => (k % 2 === 0 ? "-0.4849" : "0.4849")),
		);
	});

	test("the product of the chosen slices is the value the plate prints", () => {
		const vs = carried(START);
		expect(vs.map((v) => v.length)).toEqual([8, 8, 8, 8, 8, 8, 8, 8, 1]);
		const product = vs.at(-1)?.[0] ?? Number.NaN;
		const value = evaluate(pointOf(START));
		expect(Math.abs(product - value)).toBeLessThan(1e-12);
		expect(value.toFixed(3)).toBe("8.481");
		expect(smoothed(pointOf(START)).toFixed(3)).toBe("8.481");
	});

	test("a slice is the core read at one node", () => {
		const core = cores[1];
		if (!core) throw new Error("no second core");
		const m = slice(core, 7);
		expect(m.length).toBe(core.r0 * core.r1);
		expect(m[3 * core.r1 + 2]).toBe(core.data[(3 * core.n + 7) * core.r1 + 2] ?? Number.NaN);
	});

	test("the train stores 4,640 numbers for 10^9 grid points", () => {
		expect(stored).toBe(4640);
		expect(madds).toBe(464);
		expect(grid.nodes.length ** cores.length).toBe(1e9);
	});
});
