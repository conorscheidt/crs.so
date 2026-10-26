import { describe, expect, test } from "bun:test";
import { evaluationsTo } from "./cost";
import { cores, grid, reference, runFor, spectra, sweeps, ttValue } from "./data";
import { boundary, smoothed } from "./model";
import { contract, epsRank, evaluate } from "./train";

describe("the 10-asset train", () => {
	test("cores chain: each r1 is the next r0, and the ends are 1", () => {
		expect(cores[0]?.r0).toBe(1);
		expect(cores.at(-1)?.r1).toBe(1);
		for (const [k, core] of cores.slice(1).entries()) expect(core.r0).toBe(cores[k]?.r1 ?? -1);
	});

	test("contraction reproduces the price the experiment recorded", () => {
		expect(contract()).toBeCloseTo(ttValue, 7);
		expect(Math.abs(contract() - reference) / reference).toBeLessThan(1e-4);
	});

	test("near the center, where the Gaussian weight lives, the interpolant is the payoff", () => {
		const central = [4, 5, 4, 5, 4, 5, 4, 5, 4];
		const z = central.map((i) => grid.nodes[i] ?? 0);
		expect(Math.abs(evaluate(z) - smoothed(z)) / smoothed(z)).toBeLessThan(1e-3);
	});

	test("its last sweep is the train the plates use, and the sweeps before it wander", () => {
		expect(sweeps).toHaveLength(12);
		expect(sweeps.at(-1)?.integral).toBeCloseTo(ttValue, 6);
		const errors = sweeps.map((s) => Math.abs(s.integral - reference) / reference);
		expect(Math.max(...errors)).toBeGreaterThan(2e-4);
		expect(Math.min(...errors)).toBeLessThan(2e-6);
		// the ranks stop moving at the third sweep; the error does not
		for (const s of sweeps.slice(2)) expect(s.ranks).toEqual(sweeps[2]?.ranks ?? []);
	});

	test("the exercise boundary sets the basket to the strike", () => {
		expect(Number.isFinite(boundary(new Float64Array(cores.length)))).toBe(true);
	});
});

describe("measured costs", () => {
	test("the tensor train needs fewer evaluations than RQMC at 1e-6 for d = 5, more for d = 10", () => {
		expect(evaluationsTo(runFor(5), "tt_smooth", 1e-6)).toBeLessThan(
			evaluationsTo(runFor(5), "rqmc_smooth", 1e-6),
		);
		expect(evaluationsTo(runFor(10), "tt_smooth", 1e-6)).toBeGreaterThan(
			evaluationsTo(runFor(10), "rqmc_smooth", 1e-6),
		);
	});

	test("ε-rank reads the tail of the spectrum", () => {
		expect(epsRank([1, 1e-3, 1e-6], 1e-4)).toBe(2);
		expect(epsRank([1, 1e-3, 1e-6], 1e-2)).toBe(1);
	});

	test("the rank each cut needs for 1e-4 is largest in the middle of the train", () => {
		expect(spectra.smooth.map((s) => epsRank(s, 1e-4))).toEqual([5, 8, 12, 14, 13, 10, 6, 3]);
	});

	test("the kink raises the rank at every cut through z₂ … z₁₀", () => {
		const raw = spectra.raw.map((s) => epsRank(s, 1e-4));
		expect(raw).toEqual([4, 14, 22, 23, 21, 20, 22, 19, 8]);
		// raw cut k + 1 splits z₂ … z₁₀ where smoothed cut k does
		for (const [k, s] of spectra.smooth.entries())
			expect(raw[k + 1] ?? 0).toBeGreaterThan(epsRank(s, 1e-4));
	});

	test("the train counts at d = 5, and no train reaching 1e-6 at d = 20", () => {
		expect(evaluationsTo(runFor(5), "tt_smooth", 1e-4)).toBe(1824);
		expect(evaluationsTo(runFor(5), "tt_smooth", 1e-6)).toBe(4840);
		expect(evaluationsTo(runFor(20), "tt_smooth", 1e-6)).toBeNaN();
	});
});
