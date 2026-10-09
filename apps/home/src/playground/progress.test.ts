import { describe, expect, it } from "bun:test";
import { Downloads, toolchainLine } from "./progress";

describe("Downloads", () => {
	it("sums every file it has seen", () => {
		const d = new Downloads();
		d.begin("a", 100);
		d.begin("b", 300);
		d.add("a", 40);
		d.add("b", 60);
		expect(d.loaded).toBe(100);
		expect(d.total).toBe(400);
		expect(d.active).toBe(true);
	});

	it("keeps finished files in the totals", () => {
		const d = new Downloads();
		d.begin("a", 100);
		d.add("a", 100);
		d.end("a");
		d.begin("b", 50);
		expect(d.loaded).toBe(100);
		expect(d.total).toBe(150);
		d.add("b", 50);
		expect(d.active).toBe(false);
	});

	it("grows the total past a short or missing length", () => {
		const d = new Downloads();
		d.begin("a", 0);
		d.add("a", 70);
		expect(d.total).toBe(70);
		d.begin("b", 10);
		d.add("b", 25);
		expect(d.total).toBe(95);
	});

	it("settles a stream that ended early", () => {
		const d = new Downloads();
		d.begin("a", 100);
		d.add("a", 30);
		d.end("a");
		expect(d.active).toBe(false);
		expect(d.total).toBe(30);
	});

	it("ignores bytes for files it never began", () => {
		const d = new Downloads();
		d.add("x", 10);
		expect(d.loaded).toBe(0);
		expect(d.active).toBe(false);
	});
});

describe("toolchainLine", () => {
	it("counts megabytes while fetching", () => {
		expect(toolchainLine(6_200_000, 19_075_363)).toBe("fetching toolchain 6.2 / 19.1 MB");
		expect(toolchainLine(0, 1_814_583)).toBe("fetching toolchain 0.0 / 1.8 MB");
	});

	it("turns to compiling once everything has arrived", () => {
		expect(toolchainLine(19_075_363, 19_075_363)).toBe("compiling…");
	});
});
