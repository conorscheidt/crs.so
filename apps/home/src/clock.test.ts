import { expect, test } from "bun:test";
import { Clock, covered, paceAfter, realTime } from "./clock";
import { MOTION } from "./motion";

/** Manual rAF: collects callbacks; step() fires them with an advancing clock. */
function harness() {
	let now = 0;
	let queue: ((t: number) => void)[] = [];
	const clock = new Clock((cb) => queue.push(cb));
	return {
		clock,
		step(ms = 16) {
			now += ms;
			const q = queue;
			queue = [];
			for (const cb of q) cb(now);
		},
	};
}

test("clock keeps ticking after a job completes (persistent loop)", () => {
	const h = harness();
	let frames = 0;
	h.clock.subscribe(() => {
		frames++;
	});
	h.clock.run({ kind: "fade", duration: 32, step: () => {} });
	for (let i = 0; i < 10; i++) h.step();
	expect(h.clock.phase).toBe("idle");
	const seen = frames;
	h.step();
	expect(frames).toBe(seen + 1);
});

test("request during a job accelerates it and only the latest request runs", () => {
	const h = harness();
	h.clock.subscribe(() => {});
	const order: string[] = [];
	h.step();
	h.clock.run({ kind: "morph", duration: 300, step: () => {}, done: () => order.push("first") });
	h.step();
	h.clock.request(() => order.push("stale"));
	h.clock.request(() => order.push("latest"));
	// The 284ms left take 95ms at 3x, plus about 40ms while the pace rises.
	for (let i = 0; i < 8; i++) h.step(16);
	expect(order).toEqual([]);
	for (let i = 0; i < 2; i++) h.step(16);
	expect(order).toEqual(["first", "latest"]);
	expect(MOTION.interruptAccel).toBe(3);
});

test("request while idle runs immediately", () => {
	const h = harness();
	let ran = false;
	h.clock.request(() => {
		ran = true;
	});
	expect(ran).toBe(true);
});

test("job step reaches exactly 1 and done fires once", () => {
	const h = harness();
	h.clock.subscribe(() => {});
	h.step();
	const steps: number[] = [];
	let done = 0;
	h.clock.run({ kind: "fade", duration: 48, step: (t) => steps.push(t), done: () => done++ });
	for (let i = 0; i < 6; i++) h.step();
	expect(steps.at(-1)).toBe(1);
	expect(done).toBe(1);
});

test("dt is clamped after a long gap (bfcache / tab resume)", () => {
	const h = harness();
	const dts: number[] = [];
	h.clock.subscribe((_t, dt) => dts.push(dt));
	h.step(16);
	h.step(5000);
	expect(Math.max(...dts)).toBeLessThanOrEqual(1 / 30);
});

test("landing predicts when a job requested now finishes", () => {
	const h = harness();
	h.clock.subscribe(() => {});
	h.step();
	expect(h.clock.landing(850)).toBe(850);
	h.clock.run({ kind: "morph", duration: 300, step: () => {} });
	h.step(16);
	const eta = h.clock.landing(850);
	const tau = MOTION.interruptRamp * 1000;
	const accel = MOTION.interruptAccel;
	expect(eta).toBeCloseTo(realTime(300 - 16, 1, accel) + 850, 9);
	// The ramp costs a little over the bare speed-up: at most (accel − 1)·tau of
	// job time, which is what it comes to once the pace has all but arrived.
	const extra = eta - 850 - (300 - 16) / accel;
	expect(extra).toBeGreaterThan(0);
	expect(extra).toBeLessThanOrEqual(((accel - 1) * tau) / accel);
	let done = -1;
	let ms = 0;
	h.clock.request(() =>
		h.clock.run({
			kind: "morph",
			duration: 850,
			step: () => {},
			done: () => {
				done = ms;
			},
		}),
	);
	while (done < 0 && ms < 2000) {
		ms += 4;
		h.step(4);
	}
	// on the first frame at or after the predicted time
	expect(done).toBeGreaterThanOrEqual(eta);
	expect(done).toBeLessThan(eta + 4);
});

test("covered() and realTime() are inverse, and the pace eases toward its target", () => {
	for (const [pace, toward] of [
		[1, 3],
		[2.2, 3],
		[1, 1],
	] as const) {
		for (const ms of [0.5, 16, 60, 400]) {
			expect(realTime(covered(ms, pace, toward), pace, toward)).toBeCloseTo(ms, 6);
		}
		expect(paceAfter(0, pace, toward)).toBe(pace);
		expect(paceAfter(1e6, pace, toward)).toBeCloseTo(toward, 12);
	}
	// Covering the job in two steps or in one gives the same answer.
	const a = covered(10, 1, 3);
	const b = covered(15, paceAfter(10, 1, 3), 3);
	expect(a + b).toBeCloseTo(covered(25, 1, 3), 9);
	expect(realTime(0, 1, 3)).toBe(0);
});

/** t01 of a job interrupted `at` ms in, sampled every `frame` ms until `until`. */
function interrupted(frame: number, at: number, until: number): Map<number, number> {
	const h = harness();
	h.clock.subscribe(() => {});
	h.step(frame);
	const seen = new Map<number, number>();
	let ms = 0;
	h.clock.run({ kind: "morph", duration: 850, step: (t) => seen.set(ms, t) });
	while (ms < until) {
		if (ms === at) h.clock.request(() => {});
		ms += frame;
		h.step(frame);
	}
	return seen;
}

test("an interrupt eases the job up to speed rather than stepping it", () => {
	const seen = interrupted(16, 160, 480);
	const steps: number[] = [];
	let prev = 0;
	for (let ms = 16; ms <= 480; ms += 16) {
		const t = seen.get(ms) ?? 1;
		steps.push(t - prev);
		prev = t;
	}
	const before = steps[9] as number;
	expect(before).toBeCloseTo(16 / 850, 9);
	// No frame moves more than a third faster than the one before it.
	for (let j = 1; j < steps.length && (seen.get(16 * (j + 1)) ?? 1) < 1; j++) {
		expect((steps[j] as number) / (steps[j - 1] as number)).toBeLessThan(1.35);
	}
	// It still gets to the full speed-up, four time constants on.
	expect((steps[24] as number) / before).toBeGreaterThan(MOTION.interruptAccel - 0.1);
});

test("a hurried job's progress does not depend on the frame rate", () => {
	const coarse = interrupted(20, 100, 300);
	const fine = interrupted(4, 100, 300);
	for (const ms of [120, 160, 200, 260, 300]) {
		expect(fine.get(ms) as number).toBeCloseTo(coarse.get(ms) as number, 9);
	}
});

test("left() is landing() once the job has been asked to hurry", () => {
	const h = harness();
	h.clock.subscribe(() => {});
	h.step();
	expect(h.clock.left()).toBe(0);
	h.clock.run({ kind: "morph", duration: 850, step: () => {} });
	h.step(16);
	expect(h.clock.left()).toBeCloseTo(850 - 16, 9);
	const hurried = h.clock.landing(0);
	h.clock.request(() => {});
	expect(h.clock.left()).toBeCloseTo(hurried, 9);
});
