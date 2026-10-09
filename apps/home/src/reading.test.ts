import { describe, expect, it } from "bun:test";
import {
	activeSection,
	countWords,
	dismissed,
	type HeadState,
	minutesLeft,
	stepHead,
	wordsLeft,
} from "./reading";

describe("activeSection", () => {
	const tops = [100, 500, 900];

	it("is -1 before the first heading", () => {
		expect(activeSection(tops, 50, false)).toBe(-1);
	});

	it("is the last heading above the line", () => {
		expect(activeSection(tops, 501, false)).toBe(1);
		expect(activeSection(tops, 2000, false)).toBe(2);
	});

	it("gives the page bottom to the last section", () => {
		expect(activeSection(tops, 600, true)).toBe(2);
		expect(activeSection([], 600, true)).toBe(-1);
	});
});

describe("countWords", () => {
	it("counts runs of non-space", () => {
		expect(countWords("  a damped\n oscillator,  with ")).toBe(4);
		expect(countWords("")).toBe(0);
	});
});

describe("wordsLeft", () => {
	const blocks = [
		{ top: 0, height: 100, words: 50 },
		{ top: 120, height: 100, words: 100 },
	];

	it("counts everything below the line", () => {
		expect(wordsLeft(blocks, 0)).toBe(150);
		expect(wordsLeft(blocks, 110)).toBe(100);
	});

	it("prorates the block the line crosses", () => {
		expect(wordsLeft(blocks, 50)).toBe(125);
		expect(wordsLeft(blocks, 170)).toBe(50);
	});

	it("is zero past the last block", () => {
		expect(wordsLeft(blocks, 400)).toBe(0);
	});
});

describe("minutesLeft", () => {
	it("scales the stated reading time by the words left", () => {
		expect(minutesLeft(1000, 1000, 4)).toBe(4);
		expect(minutesLeft(500, 1000, 4)).toBe(2);
		// a sliver over a whole minute doesn't round up
		expect(minutesLeft(510, 1000, 4)).toBe(2);
		expect(minutesLeft(530, 1000, 4)).toBe(3);
	});

	it("holds at one minute until the words run out", () => {
		expect(minutesLeft(1, 1000, 4)).toBe(1);
		expect(minutesLeft(0, 1000, 4)).toBe(0);
		expect(minutesLeft(10, 0, 4)).toBe(0);
	});
});

describe("stepHead", () => {
	const opts = { titleOut: true, nearEnd: false, threshold: 10 };
	const run = (ys: number[], o = opts, s: HeadState = { shown: false, pivot: 0 }): HeadState => {
		let st = s;
		for (const y of ys) st = stepHead(st, y, o);
		return st;
	};

	it("stays hidden while the title is in view", () => {
		expect(run([300, 200, 100], { ...opts, titleOut: false }).shown).toBe(false);
	});

	it("stays hidden on the way down", () => {
		expect(run([200, 400, 800]).shown).toBe(false);
	});

	it("returns after the threshold on the way up", () => {
		expect(run([800, 795]).shown).toBe(false);
		expect(run([800, 789]).shown).toBe(true);
	});

	it("hides after the threshold on the way down", () => {
		const up = run([800, 700]);
		expect(run([705], opts, up).shown).toBe(true);
		expect(run([711], opts, up).shown).toBe(false);
	});

	it("measures from the extreme, not the last frame", () => {
		// down to 900, back up 8, down again: still hidden, then up 11 from 900
		expect(run([800, 900, 892, 895, 889]).shown).toBe(true);
	});

	it("shows near the end whatever the direction", () => {
		expect(run([800, 900], { ...opts, nearEnd: true }).shown).toBe(true);
	});
});

describe("dismissed", () => {
	it("lets go past a third of the height", () => {
		expect(dismissed(120, 300, 0)).toBe(true);
		expect(dismissed(90, 300, 0)).toBe(false);
	});

	it("lets go on a flick that moved it", () => {
		expect(dismissed(20, 300, 0.8)).toBe(true);
		expect(dismissed(6, 300, 0.8)).toBe(false);
		expect(dismissed(20, 300, 0.2)).toBe(false);
	});
});
