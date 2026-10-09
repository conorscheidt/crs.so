import { expect, test } from "bun:test";
import { CPU_N, createCpuRenderer } from "./cpu";
import type { Uniforms } from "./gpu";
import { N } from "./shapes";

/** A 2D context that only tallies what would be drawn. */
function fakeCanvas(): { canvas: HTMLCanvasElement; ink: () => number; dots: () => number } {
	let ink = 0;
	let dots = 0;
	let finite = true;
	const ctx = {
		globalAlpha: 1,
		fillStyle: "",
		clearRect(): void {
			ink = 0;
			dots = 0;
		},
		fillRect(x: number, y: number, w: number, h: number): void {
			if (!Number.isFinite(x + y + w + h + this.globalAlpha)) finite = false;
			ink += this.globalAlpha * w * h;
			dots++;
		},
	};
	const canvas = { getContext: () => ctx, width: 0, height: 0 } as unknown as HTMLCanvasElement;
	return { canvas, ink: () => (finite ? ink : Number.NaN), dots: () => dots };
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
	dimpleR: 0,
	inkR: inkLum,
	inkG: inkLum,
	inkB: inkLum,
	cursorActive: 0,
	// Large enough that dots sit above the minimum radius and keep their area.
	dotR: 2,
	fade: 1,
	accentW: 0,
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
