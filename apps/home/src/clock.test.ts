import { expect, test } from "bun:test";
import { Clock } from "./clock";
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
	// 300ms at 3x accel completes in ~100ms of frames.
	for (let i = 0; i < 8; i++) h.step(16);
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
