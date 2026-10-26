import { describe, expect, test } from "bun:test";
import { scientific } from "../readout";
import { field, fieldSvd, N } from "./field";
import { cross, lowRank, type Matrix, relativeError } from "./linalg";

const total = (m: Matrix): number => m.reduce((s, row) => row.reduce((t, v) => t + v, s), 0);

describe("the two-asset matrix", () => {
	const result = cross((i, j) => field[i]?.[j] ?? 0, N, N, 8);

	test("cross approximation counts an entry once where its row and column meet", () => {
		expect(result.pivots.map((p) => p.evaluated)).toEqual([127, 252, 375, 496, 615, 732, 847, 960]);
	});

	test("three crosses against the rank-3 truncated SVD", () => {
		expect(scientific(relativeError(field, result.approximation(3)))).toEqual(["9.5", -2]);
		expect(scientific(relativeError(field, lowRank(fieldSvd(), 3)))).toEqual(["4.1", -2]);
	});

	test("the rank-3 truncation integrates far more accurately than it approximates", () => {
		const integral = total(field);
		const error = Math.abs(total(lowRank(fieldSvd(), 3)) - integral) / integral;
		expect(scientific(error)).toEqual(["5.0", -4]);
	});
});
