import { expect, test } from "bun:test";
import { Clock } from "../clock";
import { MOTION } from "../motion";
import { CPU_N, createCpuRenderer, poolDot } from "./cpu";
import { BRIGHT, encodeFocus, type FocusSpec, GROW, noFocus, RECEDE } from "./focus";
import type { Uniforms } from "./gpu";
import { newPairing, pairDots } from "./match";
import { flightT, N, N_ACCENT, OBJECT_INDEX, type Pt, strandLap } from "./shapes";

/** Spacing (px) of the grid a fill() is sampled on to find where its polygons overlap. */
const GRID = 0.5;

/**
 * Adds the grid points inside convex polygon `poly` (flat x, y list) to
 * `into`, and returns how many there are.
 */
function sample(poly: number[], into: Set<number>): number {
	let x0 = Number.POSITIVE_INFINITY;
	let y0 = Number.POSITIVE_INFINITY;
	let x1 = Number.NEGATIVE_INFINITY;
	let y1 = Number.NEGATIVE_INFINITY;
	for (let k = 0; k < poly.length; k += 2) {
		x0 = Math.min(x0, poly[k] as number);
		x1 = Math.max(x1, poly[k] as number);
		y0 = Math.min(y0, poly[k + 1] as number);
		y1 = Math.max(y1, poly[k + 1] as number);
	}
	let count = 0;
	for (let gx = Math.ceil(x0 / GRID - 0.5); (gx + 0.5) * GRID <= x1; gx++) {
		for (let gy = Math.ceil(y0 / GRID - 0.5); (gy + 0.5) * GRID <= y1; gy++) {
			const px = (gx + 0.5) * GRID;
			const py = (gy + 0.5) * GRID;
			let left = false;
			let right = false;
			for (let k = 0; k < poly.length; k += 2) {
				const ax = poly[k] as number;
				const ay = poly[k + 1] as number;
				const bx = poly[(k + 2) % poly.length] as number;
				const by = poly[(k + 3) % poly.length] as number;
				const side = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
				if (side > 0) left = true;
				else if (side < 0) right = true;
			}
			if (left && right) continue;
			count++;
			into.add(gx * 100_000 + gy);
		}
	}
	return count;
}

/**
 * A 2D context that only tallies what would be drawn. As in Canvas2D, a
 * fill() inks the union of its path's polygons once, so where they overlap it
 * lays less ink than filling each alone would.
 */
function fakeCanvas(): {
	canvas: HTMLCanvasElement;
	/** ink laid this frame */
	ink: () => number;
	/** ink this frame would lay with every polygon filled on its own */
	alone: () => number;
	dots: () => number;
	/** centre of every square drawn this frame, x then y */
	at: number[];
	/** ink of every square drawn this frame */
	each: number[];
	streaks: () => number;
	/** fill() calls this frame */
	fills: () => number;
} {
	let alone = 0;
	/** this frame's fills, kept to find their overlap only when ink() asks */
	const filled: { alpha: number; path: number[][] }[] = [];
	let dots = 0;
	let streaks = 0;
	let fills = 0;
	let finite = true;
	const at: number[] = [];
	const each: number[] = [];
	/** the current path's closed polygons, as flat x, y lists */
	let path: number[][] = [];
	const ctx = {
		globalAlpha: 1,
		fillStyle: "",
		beginPath(): void {
			path = [];
		},
		moveTo(x: number, y: number): void {
			path.push([x, y]);
		},
		lineTo(x: number, y: number): void {
			path.at(-1)?.push(x, y);
		},
		closePath(): void {},
		fill(): void {
			fills++;
			filled.push({ alpha: this.globalAlpha, path });
			for (const poly of path) {
				let area = 0;
				for (let k = 0; k < poly.length; k += 2) {
					const x0 = poly[k] as number;
					const y0 = poly[k + 1] as number;
					const x1 = poly[(k + 2) % poly.length] as number;
					const y1 = poly[(k + 3) % poly.length] as number;
					area += x0 * y1 - x1 * y0;
				}
				if (!Number.isFinite(area + this.globalAlpha)) finite = false;
				alone += (this.globalAlpha * Math.abs(area)) / 2;
				dots++;
				streaks++;
			}
		},
		clearRect(): void {
			alone = 0;
			filled.length = 0;
			dots = 0;
			streaks = 0;
			fills = 0;
			at.length = 0;
			each.length = 0;
		},
		fillRect(x: number, y: number, w: number, h: number): void {
			if (!Number.isFinite(x + y + w + h + this.globalAlpha)) finite = false;
			alone += this.globalAlpha * w * h;
			dots++;
			at.push(x + w / 2, y + h / 2);
			each.push(this.globalAlpha * w * h);
		},
	};
	const canvas = { getContext: () => ctx, width: 0, height: 0 } as unknown as HTMLCanvasElement;
	/** ink lost where a fill's polygons overlap, measured on the sample grid */
	const lost = (): number => {
		let sum = 0;
		for (const { alpha, path: polys } of filled) {
			const union = new Set<number>();
			let sampled = 0;
			for (const poly of polys) sampled += sample(poly, union);
			sum += alpha * (sampled - union.size) * GRID * GRID;
		}
		return sum;
	};
	return {
		canvas,
		ink: () => (finite ? alone - lost() : Number.NaN),
		alone: () => (finite ? alone : Number.NaN),
		dots: () => dots,
		at,
		each,
		streaks: () => streaks,
		fills: () => fills,
	};
}

const uniforms = (obj: number, inkLum: number): Uniforms => ({
	resW: 1200,
	resH: 900,
	cursorX: -1e4,
	cursorY: -1e4,
	phase: 2.5,
	morphT: 1,
	fromObj: obj,
	toObj: obj,
	yaw: 0.6,
	tiltX: 0.2,
	tiltZ: 0,
	dpr: 1,
	inkR: inkLum,
	inkG: inkLum,
	inkB: inkLum,
	cursorActive: 0,
	// Large enough that dots sit above the minimum radius and keep their area.
	dotR: 2,
	fade: 1,
	dt: 0,
	cursorVX: 0,
	cursorVY: 0,
	focus: noFocus(),
	focusW: 0,
	morphPhase: 0,
});

test("the sampled fallback carries the ink of every dot", () => {
	for (let obj = 0; obj < 4; obj++) {
		for (const lum of [0.12, 0.9]) {
			const full = fakeCanvas();
			const some = fakeCanvas();
			createCpuRenderer(full.canvas, N)?.frame(uniforms(obj, lum));
			createCpuRenderer(some.canvas)?.frame(uniforms(obj, lum));
			// and the icosahedron's twelve vertex accents
			const accents = obj === 1 ? 12 : 0;
			expect(full.dots()).toBe(N + accents);
			expect(some.dots()).toBe(CPU_N + accents);
			expect(some.ink() / full.ink()).toBeGreaterThan(0.85);
			expect(some.ink() / full.ink()).toBeLessThan(1.15);
		}
	}
});

test("the fallback parts the dots round a moving cursor, and they heal", () => {
	const wake = fakeCanvas();
	const calm = fakeCanvas();
	const r = createCpuRenderer(wake.canvas);
	const c = createCpuRenderer(calm.canvas);
	// Hold the object still so only the wake moves the dots.
	const u = { ...uniforms(0, 0.12), dt: 1 / 60 };
	const sweep = (j: number): void => {
		u.cursorX = 300 + j * 4;
		u.cursorY = 450;
		u.cursorVX = 240;
		u.cursorActive = 1;
	};
	for (let j = 0; j < 120; j++) {
		sweep(j);
		r?.frame(u);
	}
	c?.frame({ ...u, cursorActive: 0 });
	let moved = 0;
	for (let j = 0; j < wake.at.length; j++) {
		if (Math.abs((wake.at[j] as number) - (calm.at[j] as number)) > 2) moved++;
	}
	expect(moved).toBeGreaterThan(20);
	u.cursorActive = 0;
	u.cursorVX = 0;
	for (let j = 0; j < 240; j++) r?.frame(u);
	let worst = 0;
	for (let j = 0; j < wake.at.length; j++) {
		worst = Math.max(worst, Math.abs((wake.at[j] as number) - (calm.at[j] as number)));
	}
	expect(worst).toBeLessThan(0.05);
	expect(Number.isFinite(wake.ink())).toBe(true);
});

test("the fallback streaks a fast spin without changing its ink", () => {
	const fast = fakeCanvas();
	const still = fakeCanvas();
	const r = createCpuRenderer(fast.canvas);
	for (const lum of [0.12, 0.9]) {
		const u = { ...uniforms(1, lum), dt: 1 / 60 };
		r?.reset();
		r?.frame(u);
		expect(fast.streaks()).toBe(0);
		// A slow turn stays dots.
		u.yaw += 0.002;
		r?.frame(u);
		expect(fast.streaks()).toBe(0);
		u.yaw += 0.15;
		r?.frame(u);
		createCpuRenderer(still.canvas)?.frame({ ...u, dt: 0 });
		expect(still.streaks()).toBe(0);
		expect(fast.streaks()).toBeGreaterThan(CPU_N / 2);
		expect(fast.dots()).toBe(still.dots());
		// Each streak lays its dot's ink; how little overlapping ones lose in a
		// fill is the morph tests' business.
		expect(fast.alone() / still.ink()).toBeCloseTo(1, 6);
	}
});

test("a morph's streaks go out a band of alpha at a time, with the ink of their dots", () => {
	const c = fakeCanvas();
	const r = createCpuRenderer(c.canvas);
	const u = { ...uniforms(0, 0.9), fromObj: 0, toObj: 3, morphT: 0, morphPhase: 2.5 };
	r?.frame(u);
	u.dt = 1 / 60;
	let most = 0;
	for (let f = 1; f <= 50; f++) {
		u.phase += 1 / 60;
		u.morphT = f / 51;
		r?.frame(u);
		most = Math.max(most, c.streaks());
		if (f !== 25) continue;
		// Mid-morph: hundreds of streaks in a fraction as many fills, each laying
		// exactly the ink its dot lays held still, as a disc.
		expect(c.streaks()).toBeGreaterThan(200);
		expect(c.fills()).toBeLessThan(c.streaks() / 4);
		const still = fakeCanvas();
		createCpuRenderer(still.canvas)?.frame({ ...u, dt: 0 });
		expect(still.streaks()).toBe(0);
		expect(c.dots()).toBe(still.dots());
		expect(c.alone() / still.ink()).toBeCloseTo(1, 6);
	}
	expect(most).toBeGreaterThan(200);
});

test("streaks overlapping within a fill cost a morph almost none of its ink", () => {
	// Knot and rings, both ways, are the pairs whose dots fly closest together.
	for (const [from, to] of [
		[0, 3],
		[3, 0],
	] as const) {
		const c = fakeCanvas();
		const r = createCpuRenderer(c.canvas);
		// The dot size and view the hub draws at on a desktop.
		const u = {
			...uniforms(from, 0.12),
			resW: 820,
			resH: 900,
			yaw: 0.4,
			tiltX: 0.16,
			dotR: 0.78,
			toObj: to,
			morphT: 0,
			morphPhase: 2.5,
		};
		r?.frame(u);
		u.dt = 1 / 60;
		let worst = 1;
		for (let f = 1; f <= 51; f++) {
			u.phase += 1 / 60;
			u.morphT = f / 51;
			r?.frame(u);
			worst = Math.min(worst, c.ink() / c.alone());
		}
		// With one path a band they lost 13% and 14%.
		expect(worst).toBeGreaterThan(0.98);
	}
});

test("a dot wrapping to the start of its strand jumps without a streak", () => {
	for (const obj of [1, 2]) {
		const c = fakeCanvas();
		const r = createCpuRenderer(c.canvas);
		// Streaming at the rest rate is too slow to streak.
		const u = { ...uniforms(obj, 0.9), dt: 1 / 60 };
		r?.frame(u);
		let wraps = 0;
		for (let f = 0; f < 120; f++) {
			const before = u.phase;
			u.phase += 1 / 60;
			for (let i = 0; i < N; i++) {
				if (strandLap(obj, i, u.phase) !== strandLap(obj, i, before)) wraps++;
			}
			r?.frame(u);
			expect(c.streaks()).toBe(0);
		}
		// Over a thousand dots wrapped meanwhile, each jumping an edge or from
		// pole to pole.
		expect(wraps).toBeGreaterThan(1000);
	}
});

/**
 * Uniforms for a morph from `from` to `to` on a canvas small enough that no
 * dot moves fast enough to streak, so every dot is a square with a place.
 */
const small = (from: number, to: number): Uniforms => ({
	...uniforms(from, 0.12),
	resW: 100,
	resH: 100,
	dotR: 0.78,
	toObj: to,
	morphT: 0,
	morphPhase: 2.5,
});

/** Advance `u` one 60 Hz frame, `f` frames into a 51-frame morph. */
const tick = (u: Uniforms, f: number): void => {
	u.phase += 1 / 60;
	u.morphT = Math.min(1, f / 51);
};

/** How many coordinates of two frames' squares differ, counting any one lacks. */
const apart = (a: number[], b: number[]): number => {
	let n = Math.abs(a.length - b.length);
	for (let k = 0; k < Math.min(a.length, b.length); k++) {
		if (Math.abs((a[k] as number) - (b[k] as number)) > 1e-9) n++;
	}
	return n;
};

test("a resize mid-morph leaves every dot where it was", () => {
	for (const to of [1, 2]) {
		const c = fakeCanvas();
		const r = createCpuRenderer(c.canvas);
		const u = small(0, to);
		r?.frame(u);
		u.dt = 1 / 60;
		for (let f = 1; f <= 34; f++) {
			tick(u, f);
			r?.frame(u);
		}
		expect(c.streaks()).toBe(0);
		const before = [...c.at];
		// As index.ts draws on a resize: a held frame at the same phase. Dots
		// whose strand ran past its end since the morph began stay held there.
		r?.resize(100, 100);
		r?.frame({ ...u, dt: 0 });
		expect(apart(c.at, before)).toBe(0);
	}
});

test("a renderer that missed a morph's landing draws the next as one that never saw it", () => {
	const c = fakeCanvas();
	const r = createCpuRenderer(c.canvas);
	const u = small(0, 1);
	r?.frame(u);
	u.dt = 1 / 60;
	// Into the icosahedron, drawn as far as halfway...
	for (let f = 1; f <= 30; f++) {
		tick(u, f);
		r?.frame(u);
	}
	// ...then hidden while it lands and the next morph, on to the sphere, gets
	// under way.
	for (let f = 31; f <= 51; f++) tick(u, f);
	u.fromObj = 1;
	u.toObj = 2;
	u.morphT = 0;
	u.morphPhase = u.phase;
	for (let f = 1; f <= 20; f++) tick(u, f);
	// Shown again, it draws as a renderer that never saw the first morph does.
	// index.ts sends a dt of 0 after a frame it skipped.
	const fresh = fakeCanvas();
	const f0 = createCpuRenderer(fresh.canvas);
	const shown = { ...u, dt: 0 };
	r?.frame(shown);
	f0?.frame(shown);
	expect(apart(c.at, fresh.at)).toBe(0);
	for (let f = 21; f <= 51; f++) {
		tick(u, f);
		r?.frame(u);
		f0?.frame(u);
		expect(apart(c.at, fresh.at)).toBe(0);
	}
});

test("a morph run on from a hurried one starts each dot where it was last drawn", () => {
	// Knot to icosahedron, hurried by a request for the rings: the clock lands
	// it unseen and starts the next in the same frame, as index.ts has it do.
	const queue: ((t: number) => void)[] = [];
	const clock = new Clock((cb) => queue.push(cb));
	const c = fakeCanvas();
	const r = createCpuRenderer(c.canvas);
	// Small enough that no flight streaks even hurried; a wrap taken for motion
	// would.
	const u = { ...small(0, 0), resW: 50, resH: 50, morphT: 1 };
	const begin = (to: number): void => {
		u.fromObj = u.toObj;
		u.toObj = to;
		u.morphT = 0;
		u.morphPhase = u.phase;
		clock.run({
			kind: "morph",
			duration: MOTION.morph * 1000,
			step: (t) => {
				u.morphT = t;
			},
			done: () => {
				u.morphT = 1;
				u.fromObj = u.toObj;
			},
		});
	};
	const shots: { u: Uniforms; at: number[] }[] = [];
	clock.subscribe((_t, dt) => {
		u.phase += dt;
		u.dt = shots.length > 0 ? dt : 0;
		r?.frame(u);
		shots.push({ u: { ...u }, at: [...c.at] });
		expect(c.streaks()).toBe(0);
	});
	let now = 0;
	const frame = (): void => {
		now += 1000 / 60;
		for (const cb of queue.splice(0)) cb(now);
	};
	frame();
	begin(OBJECT_INDEX.projects);
	for (let f = 0; f < 18; f++) frame();
	clock.request(() => begin(OBJECT_INDEX.about));
	while (clock.phase !== "idle") frame();
	const next = shots.findIndex((s) => s.u.toObj === OBJECT_INDEX.about);
	const { u: last, at: before } = shots[next - 1] as (typeof shots)[0];
	const { u: first, at: start } = shots[next] as (typeof shots)[0];
	// The hurried morph's last frame still had dots in flight; the next began
	// at the phase that frame was drawn at.
	expect(last.toObj).toBe(OBJECT_INDEX.projects);
	expect(last.morphT).toBeLessThan(1);
	expect(first.fromObj).toBe(OBJECT_INDEX.projects);
	expect(first.morphPhase).toBe(last.phase);
	// every dot, then the vertex accents
	expect(before.length).toBe(2 * (CPU_N + N_ACCENT));
	expect(start.length).toBe(2 * (CPU_N + N_ACCENT));
	const pairs = newPairing(CPU_N);
	const { index, projects, about } = OBJECT_INDEX;
	pairDots(projects, about, first.morphPhase, CPU_N, (s) => poolDot(s, CPU_N), pairs);
	const tmp: Pt = { x: 0, y: 0, z: 0, a: 0, k: 0 };
	let held = 0;
	let most = 0;
	for (let s = 0; s < CPU_N; s++) {
		const from = pairs.src[s] as number;
		const d = poolDot(from, CPU_N);
		const gap = Math.hypot(
			(start[2 * s] as number) - (before[2 * from] as number),
			(start[2 * s + 1] as number) - (before[2 * from + 1] as number),
		);
		// Still in flight to the icosahedron, with its edge run out since that
		// morph began: it waited at the end, and now wraps as it lands.
		const t = flightT(d, index, projects, last.morphT, last.morphPhase, tmp);
		const lap = (phase: number): number => strandLap(projects, d, phase);
		if (t < 1 && lap(last.morphPhase) !== lap(first.morphPhase)) {
			held++;
			expect(gap).toBeGreaterThan(3);
		} else most = Math.max(most, gap);
	}
	expect(held).toBeGreaterThan(0);
	// Every other dot starts on the place its source was drawn at, give or
	// take the last few hundredths of a flight.
	expect(most).toBeLessThan(1);
});

test("a morph begins with every dot where one stood, wake and all", () => {
	const c = fakeCanvas();
	const r = createCpuRenderer(c.canvas);
	const calm = fakeCanvas();
	const still = createCpuRenderer(calm.canvas);
	// The cursor sweeps across the knot and parts it.
	const u = {
		...uniforms(0, 0.12),
		dt: 1 / 60,
		cursorActive: 1,
		cursorX: 480,
		cursorY: 450,
		cursorVX: 600,
	};
	for (let f = 0; f < 30; f++) {
		u.phase += 1 / 60;
		u.cursorX += 10;
		r?.frame(u);
	}
	// Held, then the morph to the rings begins at the same phase.
	const held = { ...u, dt: 0 };
	r?.frame(held);
	still?.frame({ ...held, cursorActive: 0 });
	const before = [...c.at];
	expect(before.length).toBe(2 * CPU_N);
	r?.frame({ ...held, toObj: 3, morphT: 0, morphPhase: u.phase });
	const pairs = newPairing(CPU_N);
	pairDots(0, 3, u.phase, CPU_N, (s) => poolDot(s, CPU_N), pairs);
	let parted = 0;
	let relabelled = 0;
	for (let s = 0; s < CPU_N; s++) {
		const from = pairs.src[s] as number;
		// Each slot draws the old object where its source slot did, pushed
		// aside by the cursor as that one was.
		expect(c.at[2 * s]).toBeCloseTo(before[2 * from] as number, 6);
		expect(c.at[2 * s + 1]).toBeCloseTo(before[2 * from + 1] as number, 6);
		if (Math.abs((before[2 * s] as number) - (calm.at[2 * s] as number)) > 0.5) parted++;
		if (from !== s) relabelled++;
	}
	expect(parted).toBeGreaterThan(20);
	expect(relabelled).toBeGreaterThan(CPU_N / 2);
});

test("a morph's first frame streaks no more than the frames before it", () => {
	for (const [from, to] of [
		[0, 3],
		[1, 2],
		[2, 0],
	] as const) {
		const c = fakeCanvas();
		const r = createCpuRenderer(c.canvas);
		// Streaming at the rest rate is too slow to streak.
		const u = { ...uniforms(from, 0.9), dt: 1 / 60 };
		for (let f = 0; f < 10; f++) {
			u.phase += 1 / 60;
			r?.frame(u);
			expect(c.streaks()).toBe(0);
		}
		// The morph begins at the phase last drawn, and the next frame draws its
		// start. Each slot has moved to its source's place, and carries on from
		// where that one was drawn rather than streaking across from its own.
		Object.assign(u, { toObj: to, morphT: 0, morphPhase: u.phase });
		u.phase += 1 / 60;
		r?.frame(u);
		expect(c.streaks()).toBe(0);
		u.phase += 1 / 60;
		u.morphT = 1 / 51;
		r?.frame(u);
		expect(c.streaks()).toBe(0);
	}
});

test("a focused part gains ink and grows while the rest recedes", () => {
	const spec: Record<number, FocusSpec> = {
		0: { weeks: [10, 11, 12] },
		1: { vertex: 4 },
		2: { latitudes: [0.3] },
		3: { rings: [1] },
	};
	for (let obj = 0; obj < 4; obj++) {
		const plain = fakeCanvas();
		const lit = fakeCanvas();
		createCpuRenderer(plain.canvas)?.frame(uniforms(obj, 0.12));
		const u = { ...uniforms(obj, 0.12), focus: noFocus(), focusW: 1 };
		encodeFocus(spec[obj] ?? null, u.focus);
		// A held frame lands every dot on its share at once.
		createCpuRenderer(lit.canvas)?.frame(u);
		expect(lit.dots()).toBe(plain.dots());
		let receded = 0;
		let raised = 0;
		for (let j = 0; j < plain.each.length; j++) {
			// Same dots in the same places; only their ink differs.
			expect(lit.at[2 * j]).toBeCloseTo(plain.at[2 * j] as number, 9);
			const k = (lit.each[j] as number) / (plain.each[j] as number);
			expect(k).toBeGreaterThan(RECEDE - 1e-6);
			expect(k).toBeLessThan(BRIGHT * GROW ** 2 + 1e-6);
			if (k < RECEDE + 1e-6) receded++;
			else if (k > 1) raised++;
		}
		expect(receded).toBeGreaterThan(plain.dots() / 2);
		expect(raised).toBeGreaterThan(50);
	}
});

test("a focus fades in over its time constant, frame by frame", () => {
	const c = fakeCanvas();
	const r = createCpuRenderer(c.canvas);
	const u = { ...uniforms(3, 0.12), dt: 1 / 60, focus: noFocus(), focusW: 0 };
	r?.frame(u);
	const before = c.ink();
	encodeFocus({ rings: [0] }, u.focus);
	u.focusW = 1;
	r?.frame(u);
	const first = c.ink();
	for (let j = 0; j < 60; j++) r?.frame(u);
	const settled = c.ink();
	// Recession lands with the fade; the ring's own gain eases in after it.
	expect(first).toBeLessThan(before);
	expect(settled).toBeGreaterThan(first);
});
