import { describe, expect, test } from "bun:test";
import { readoutText, scientific } from "./readout";

describe("readout formats", () => {
	test("scientific keeps one decimal and carries a rounded-up mantissa", () => {
		expect(scientific(2.6e-7)).toEqual(["2.6", -7]);
		expect(scientific(9.96e-5)).toEqual(["1.0", -4]);
		expect(scientific(0)).toEqual(["0", 0]);
	});

	test("each format prints what the prose expects", () => {
		expect(readoutText(4840, "int")).toBe("4,840");
		expect(readoutText(0.9123, "pct")).toBe("91%");
		expect(readoutText(8.729_465_2, "fixed5")).toBe("8.72947");
		expect(readoutText(0.125, "fixed2")).toBe("0.13");
		expect(readoutText(Number.NaN, "int")).toBe("—");
		expect(readoutText(Number.NaN, "sci", "not reached")).toBe("not reached");
	});
});
