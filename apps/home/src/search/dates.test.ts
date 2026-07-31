import { expect, test } from "bun:test";
import { parseDates } from "./dates";

const NOW = new Date(Date.UTC(2026, 6, 31)); // 2026-07-31

test("bare year becomes a full-year range and leaves the term clean", () => {
	const r = parseDates("wasm 2025 compiler", NOW);
	expect(r.term).toBe("wasm compiler");
	expect(r.date?.label).toBe("2025");
	expect(new Date(r.date?.from ?? 0).getUTCFullYear()).toBe(2025);
	expect(new Date(r.date?.to ?? 0).getUTCFullYear()).toBe(2025);
});

test("month name resolves to the most recent occurrence", () => {
	const r = parseDates("may notes", NOW);
	expect(r.term).toBe("notes");
	expect(r.date?.label).toBe("may 2026");
	const s = parseDates("september", NOW); // future this year → last year
	expect(s.date?.label).toBe("september 2025");
});

test("month + year is exact", () => {
	const r = parseDates("june 2025 pen", NOW);
	expect(r.term).toBe("pen");
	expect(r.date?.label).toBe("june 2025");
});

test("seasons resolve; 'last summer' steps one back", () => {
	expect(parseDates("summer", NOW).date?.label).toBe("summer 2026");
	expect(parseDates("last summer", NOW).date?.label).toBe("summer 2025");
	const w = parseDates("winter", NOW).date;
	expect(w?.label).toBe("winter 2025");
	expect(new Date(w?.to ?? 0).getUTCFullYear()).toBe(2026); // wraps into Feb
});

test("no date tokens → null, term untouched", () => {
	const r = parseDates("gpu simulation", NOW);
	expect(r.date).toBeNull();
	expect(r.term).toBe("gpu simulation");
});
