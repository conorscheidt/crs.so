/**
 * The post's runnable snippets, executed the way the playground executes them:
 * sucrase strips the types and the result runs as a plain script. Each test
 * pins the numbers the prose quotes.
 */
import { describe, expect, test } from "bun:test";
import { transform } from "sucrase";
import { runnable } from "../../lib/snippet";

async function run(name: string): Promise<string> {
	const source = await Bun.file(
		new URL(`../../content/writing/tensor-trains/${name}.ts`, import.meta.url),
	).text();
	const js = transform(runnable(source), { transforms: ["typescript"] }).code;
	const lines: string[] = [];
	const print = (...parts: unknown[]): void => {
		lines.push(parts.map(String).join(" "));
	};
	new Function("console", `"use strict";\n${js}`)({ log: print });
	return lines.join("\n");
}

/** A count printed with thousands separators. */
const count = (printed: string | undefined): number => Number(printed?.replaceAll(",", ""));

/** The first number after a label at the start of a line. */
const field = (out: string, label: string): number =>
	count(new RegExp(`^${label}\\s+(\\S+)`, "mu").exec(out)?.[1]);

/** The whitespace-separated fields after a label at the start of a line. */
const fields = (out: string, label: string): string[] =>
	new RegExp(`^${label}\\s+(.+)$`, "mu").exec(out)?.[1]?.split(/\s+/u) ?? [];

/** The multiply–add count on a labeled line. */
const cost = (out: string, label: string): number =>
	count(new RegExp(`^${label}.*?([\\d,]+) multiply–adds`, "mu").exec(out)?.[1]);

describe("tensor-train snippets", () => {
	test("contraction matches the brute-force sum at a fraction of the cost", async () => {
		const out = await run("evaluate");
		expect(field(out, "entries")).toBe(4096);
		expect(field(out, "contraction")).toBeCloseTo(field(out, "brute force"), 12);
		expect(cost(out, "brute force")).toBe(196_608);
		expect(cost(out, "contraction")).toBe(210);
	});

	test("the rank-2 train multiplies out to the sum, and the call on the sum needs rank 30", async () => {
		const out = await run("sum");
		const rows = [...out.matchAll(/^d = (\d+)\s+rank (\d+)\s+product (\S+)\s+sum (\S+)$/gmu)];
		expect(rows.map(([, d]) => d)).toEqual(["5", "10", "20"]);
		for (const [, , rank, product, sum] of rows) {
			expect(rank).toBe("2");
			expect(product).toBe(sum);
		}
		expect(out).toContain(
			"middle cut of d = 4 on 8 points per variable\nrank 2 for s, rank 30 for (s − 100)⁺",
		);
	});

	test("the dense sum and TT-cross price the five-asset basket to the quoted errors and costs", async () => {
		const out = await run("cross");
		const [, denseError, denseCost] = fields(out, "dense sum");
		const [, crossError, crossCost] = fields(out, "TT-cross");
		expect(denseError).toBe("8.2e-12");
		expect(count(denseCost)).toBe(65_536);
		expect(crossError).toBe("5.6e-9");
		expect(count(crossCost)).toBe(19_968);
		expect(count(/evaluated (\S+) distinct grid points/u.exec(out)?.[1])).toBe(11_275);
	});

	test("every control-variate interval covers the exact value", async () => {
		const out = await run("control");
		const exact = field(out, "exact");
		const rows = [...out.matchAll(/^(?:plain MC|degree \d+)\s+(\S+) ± (\S+)/gmu)];
		expect(rows).toHaveLength(5);
		for (const [, estimate, half] of rows)
			expect(Math.abs(Number(estimate) - exact)).toBeLessThan(Number(half));
		const ratio = (degree: number): number =>
			count(new RegExp(`^degree ${degree}\\s.*variance ÷ (\\S+)$`, "mu").exec(out)?.[1]);
		expect(ratio(1)).toBe(0.73);
		expect(ratio(8)).toBe(4190);
	});
});
