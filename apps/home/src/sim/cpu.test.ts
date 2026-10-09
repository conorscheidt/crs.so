import { expect, test } from "bun:test";
import { CPU_N, createCpuRenderer } from "./cpu";
import type { Uniforms } from "./gpu";
import { N } from "./shapes";

/** A 2D context that only tallies what would be drawn. */
function fakeCanvas(): {
	canvas: HTMLCanvasElement;
	ink: () => number;
	dots: () => number;
	/** centre of every square drawn this frame, x then y */
	at: number[];
	streaks: () => number;
} {
	let ink = 0;
	let dots = 0;
	let streaks = 0;
	let finite = true;
	const at: number[] = [];
	const line = [0, 0, 0, 0];
	const ctx = {
		globalAlpha: 1,
		fillStyle: "",
		strokeStyle: "",
		lineWidth: 1,
		beginPath(): void {},
		moveTo(x: number, y: number): void {
			line[0] = x;
			line[1] = y;
		},
		lineTo(x: number, y: number): void {
			line[2] = x;
			line[3] = y;
		},
		// Butt caps: the stroke covers its length by its width.
		stroke(): void {
			const len = Math.hypot((line[2] ?? 0) - (line[0] ?? 0), (line[3] ?? 0) - (line[1] ?? 0));
			if (!Number.isFinite(len + this.lineWidth + this.globalAlpha)) finite = false;
			ink += this.globalAlpha * this.lineWidth * len;
			dots++;
			streaks++;
		},
		clearRect(): void {
			ink = 0;
			dots = 0;
			streaks = 0;
			at.length = 0;
		},
		fillRect(x: number, y: number, w: number, h: number): void {
			if (!Number.isFinite(x + y + w + h + this.globalAlpha)) finite = false;
			ink += this.globalAlpha * w * h;
			dots++;
			at.push(x + w / 2, y + h / 2);
		},
	};
	const canvas = { getContext: () => ctx, width: 0, height: 0 } as unknown as HTMLCanvasElement;
	return {
		canvas,
		ink: () => (finite ? ink : Number.NaN),
		dots: () => dots,
		at,
		streaks: () => streaks,
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
	accentW: 0,
	dt: 0,
	cursorVX: 0,
	cursorVY: 0,
});

test("the sampled fallback carries the ink of every dot", () => {
	for (let obj = 0; obj < 4; obj++) {
		for (const lum of [0.12, 0.9]) {
			const full = fakeCanvas();
			const some = fakeCanvas();
			createCpuRenderer(full.canvas, N)?.frame(uniforms(obj, lum));
			createCpuRenderer(some.canvas)?.frame(uniforms(obj, lum));
			expect(full.dots()).toBe(N);
			expect(some.dots()).toBe(CPU_N);
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
		expect(fast.ink() / still.ink()).toBeCloseTo(1, 6);
	}
});
