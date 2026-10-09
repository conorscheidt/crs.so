import { expect, test } from "bun:test";
import { easeOutCubic } from "./motion";
import { Glide } from "./nav-dot";

test("a glide follows the morph's curve and lands exactly", () => {
	const g = new Glide();
	g.jump(0.1, 10);
	g.go(0.3, 40, 100);
	expect(g.step(25)).toBe(true);
	expect(g.y).toBeCloseTo(10 + 30 * easeOutCubic(0.25), 10);
	expect(g.step(1000)).toBe(false);
	// 0.1 + (0.3 - 0.1) * 1 is 0.30000000000000004
	expect(g.x).toBe(0.3);
	expect(g.y).toBe(40);
	expect(g.moving).toBe(false);
});

test("an interrupted glide heads off from where it is", () => {
	const g = new Glide();
	g.go(0, 100, 100);
	g.step(50);
	const mid = g.y;
	g.go(0, 0, 100);
	expect(g.y).toBe(mid);
	g.step(1);
	expect(g.y).toBeLessThan(mid);
	g.step(100);
	expect(g.y).toBe(0);
});

test("aim keeps progress in flight and lands when idle", () => {
	const g = new Glide();
	g.go(0, 100, 100);
	g.step(50);
	g.aim(0, 200);
	expect(g.y).toBeCloseTo(200 * easeOutCubic(0.5), 10);
	expect(g.moving).toBe(true);
	g.step(50);
	expect(g.y).toBe(200);
	g.aim(0, 50);
	expect(g.y).toBe(50);
	expect(g.moving).toBe(false);
});

test("a zero-length glide is a jump", () => {
	const g = new Glide();
	g.go(5, 6, 0);
	expect([g.x, g.y, g.moving]).toEqual([5, 6, false]);
	expect(g.step(16)).toBe(false);
});
