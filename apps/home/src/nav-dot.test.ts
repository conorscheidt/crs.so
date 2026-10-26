import { expect, test } from "bun:test";
import { Clock } from "./clock";
import { ease, MOTION } from "./motion";
import { Glide } from "./nav-dot";

test("a glide follows the morph's curve and lands exactly", () => {
	const g = new Glide();
	g.jump(0.1, 10);
	g.go(0.3, 40, 100);
	expect(g.step(25)).toBe(true);
	expect(g.y).toBeCloseTo(10 + 30 * ease(0.25), 10);
	expect(g.step(1000)).toBe(false);
	// 0.1 + (0.3 - 0.1) * 1 is 0.30000000000000004
	expect(g.x).toBe(0.3);
	expect(g.y).toBe(40);
	expect(g.moving).toBe(false);
});

const speed = (g: Glide): number => g.velocity([0, 0])[1];

test("a redirected glide carries on at the speed it had", () => {
	for (const to of [30, 160, -40]) {
		const g = new Glide();
		g.go(0, 100, 850);
		g.step(200);
		const before = speed(g);
		const at = g.y;
		g.go(0, to, 900);
		expect(g.y).toBe(at);
		expect(speed(g)).toBeCloseTo(before, 12);
		// Stepped, too: restarting the curve would set off at 4.5 times the
		// average speed of the new trip, often the other way.
		const y0 = g.y;
		g.step(0.5);
		expect((g.y - y0) / 0.5).toBeCloseTo(before, 1);
		g.step(900);
		expect(g.y).toBe(to);
	}
});

test("a redirect never carries the dot past where it is going", () => {
	// Fast toward 100, then told to stop a few px on: holding on to all that
	// speed would overshoot and come back, a bounce.
	for (const ahead of [2, 8, 20]) {
		const g = new Glide();
		g.go(0, 100, 850);
		g.step(20);
		const to = g.y + ahead;
		g.go(0, to, 900);
		let most = g.y;
		while (g.step(2)) most = Math.max(most, g.y);
		expect(most).toBeLessThanOrEqual(to + 1e-9);
		expect(g.y).toBe(to);
	}
	// Sent back, it turns round without passing the stop it had been heading for.
	const g = new Glide();
	g.go(0, 100, 850);
	g.step(300);
	g.go(0, 0, 900);
	let most = g.y;
	while (g.step(2)) most = Math.max(most, g.y);
	expect(most).toBeLessThan(100);
	expect(g.y).toBe(0);
});

test("aim keeps progress in flight and lands when idle", () => {
	const g = new Glide();
	g.go(0, 100, 100);
	g.step(50);
	g.aim(0, 200);
	expect(g.y).toBeCloseTo(200 * ease(0.5), 10);
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

test("the dot and an interrupted morph land on the same frame", () => {
	// Frame intervals at a few refresh rates, steady and jittered.
	let seed = 7;
	const jitter = (): number => {
		seed = (seed * 16_807) % 2_147_483_647;
		return seed / 2_147_483_647;
	};
	for (const frame of [1000 / 60, 1000 / 120, 1000 / 144, 0]) {
		for (const clickAt of [100, 333, 700]) {
			let now = 0;
			let queue: ((t: number) => void)[] = [];
			const clock = new Clock((cb) => queue.push(cb));
			const tick = (): void => {
				now += frame || 6 + 14 * jitter();
				const q = queue;
				queue = [];
				for (const cb of q) cb(now);
			};
			clock.subscribe(() => {});
			tick();
			const g = new Glide();
			let frames = 0;
			let dotFrame = -1;
			let morphs = 0;
			let morphFrame = -1;
			clock.subscribe((_, dt) => {
				if (g.moving && !g.step(dt * 1000)) dotFrame = frames;
			});
			const ms = MOTION.morph * 1000;
			const morph = (): void =>
				clock.run({
					kind: "morph",
					duration: ms,
					step: () => {},
					done: () => {
						if (++morphs === 2) morphFrame = frames;
					},
				});
			g.go(0, 40, clock.landing(ms));
			clock.request(morph);
			while (now < clickAt) {
				frames++;
				tick();
			}
			g.go(0, 90, clock.landing(ms));
			clock.request(morph);
			while (morphFrame < 0 && frames < 1000) {
				frames++;
				tick();
			}
			expect(dotFrame).toBe(morphFrame);
			expect(g.y).toBe(90);
		}
	}
});
