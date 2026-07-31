import { expect, test } from "bun:test";
import { Conductor } from "./conductor";
import { MOTION } from "./motion";

// Deterministic clock + rAF for the conductor's tick loop.
let now = 0;
let pending: (() => void)[] = [];
(globalThis as { performance: { now(): number } }).performance = { now: () => now };
(globalThis as { requestAnimationFrame: (cb: () => void) => number }).requestAnimationFrame = (
	cb,
) => {
	pending.push(cb);
	return pending.length;
};
(globalThis as { cancelAnimationFrame: (id: number) => void }).cancelAnimationFrame = () => {};

function advance(ms: number, frames = 60) {
	const step = ms / frames;
	for (let i = 0; i < frames; i++) {
		now += step;
		const batch = pending;
		pending = [];
		for (const cb of batch) cb();
	}
}

test("idle requests run immediately", () => {
	const c = new Conductor();
	let ran = false;
	c.request(() => {
		ran = true;
	});
	expect(ran).toBe(true);
});

test("a busy request queues and accelerates; the latest runs after it", () => {
	const c = new Conductor();
	const seen: number[] = [];
	now = 0;
	pending = [];
	c.run({ kind: "traveling", duration: 900, step: (t) => seen.push(t) });
	advance(100);
	let first = 0;
	let second = 0;
	c.request(() => {
		first += 1;
	});
	c.request(() => {
		second += 1;
	});
	// At 3× accel the remaining ~800ms of work finishes in well under 400ms.
	advance(400);
	expect(c.phase).toBe("idle");
	expect(first).toBe(0);
	expect(second).toBe(1);
	expect(seen[seen.length - 1]).toBe(1);
});

test("acceleration factor matches the motion token", () => {
	const c = new Conductor();
	now = 0;
	pending = [];
	let final = 0;
	c.run({ kind: "drawing", duration: 1200, step: (t) => (final = t) });
	advance(200); // 200ms at 1× → t ≈ 0.166
	c.request(() => {});
	// Remaining 1000ms at 3× needs ~333ms of wall time.
	advance(1000 / MOTION.interruptAccel + 20);
	expect(final).toBe(1);
	expect(c.phase).toBe("idle");
});
