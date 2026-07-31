import { expect, test } from "bun:test";
import {
	interpolatePairs,
	matchSegments,
	pathLength,
	resample,
	segLength,
	toSvgPath,
} from "./segments";

test("resample preserves endpoints and count", () => {
	const pts = resample(
		[
			[0, 0],
			[10, 0],
			[10, 10],
		],
		9,
	);
	expect(pts.length).toBe(9);
	expect(pts[0]).toEqual([0, 0]);
	expect(pts[8]).toEqual([10, 10]);
	expect(segLength(pts)).toBeCloseTo(20, 0);
});

test("resample of zero-length polyline stays put", () => {
	const pts = resample(
		[
			[5, 5],
			[5, 5],
		],
		4,
	);
	expect(pts.length).toBe(4);
	for (const p of pts) expect(p).toEqual([5, 5]);
});

test("matched segments interpolate between shapes", () => {
	const pairs = matchSegments(
		[{ name: "axis", points: [[0, 0], [0, 100]] }],
		[{ name: "axis", points: [[50, 0], [50, 100]] }],
		8,
	);
	const mid = interpolatePairs(pairs, 0.5);
	expect(mid[0]!.points[0]![0]).toBeCloseTo(25);
	expect(mid[0]!.points[7]![1]).toBeCloseTo(100);
});

test("segment absent in target collapses to its join", () => {
	const pairs = matchSegments(
		[
			{ name: "axis", points: [[0, 0], [0, 50]] },
			{ name: "rail", points: [[0, 50], [40, 50]] },
		],
		[{ name: "axis", points: [[0, 0], [0, 50]] }],
		6,
	);
	const done = interpolatePairs(pairs, 1);
	const rail = done.find((s) => s.name === "rail")!;
	expect(segLength(rail.points)).toBeCloseTo(0);
	expect(rail.points[0]![1]).toBeCloseTo(50);
});

test("segment absent in source grows from its join", () => {
	const pairs = matchSegments(
		[{ name: "axis", points: [[0, 0], [0, 50]] }],
		[
			{ name: "axis", points: [[0, 0], [0, 50]] },
			{ name: "rail", points: [[0, 50], [40, 50]] },
		],
		6,
	);
	const start = interpolatePairs(pairs, 0);
	expect(segLength(start.find((s) => s.name === "rail")!.points)).toBeCloseTo(0);
	const done = interpolatePairs(pairs, 1);
	expect(segLength(done.find((s) => s.name === "rail")!.points)).toBeCloseTo(40, 0);
});

test("union order never backtracks: new segments sit at their position, not the end", () => {
	const hub = ["crown", "sweep", "flank", "under", "drop", "shelf", "foot", "tick"];
	const work = ["crown", "sweep", "flank", "under", "drop", "shelf", "leaf-gate", "leaf-rail", "foot", "tick"];
	const seg = (n: string) => ({ name: n, points: [[0, 0], [1, 1]] as [number, number][] });
	const pairs = matchSegments(hub.map(seg), work.map(seg), 4);
	expect(pairs.map((p) => p.name)).toEqual(work);
	const back = matchSegments(work.map(seg), hub.map(seg), 4);
	expect(back.map((p) => p.name)).toEqual(work);
});

test("svg path is one continuous stroke", () => {
	const d = toSvgPath([
		{ name: "a", points: [[0, 0], [0, 10]] },
		{ name: "b", points: [[0, 10], [20, 10]] },
	]);
	expect(d.startsWith("M0.0 0.0")).toBe(true);
	expect(d.match(/M/g)!.length).toBe(1);
	expect(pathLength([{ name: "x", points: [[0, 0], [3, 4]] }])).toBe(5);
});
