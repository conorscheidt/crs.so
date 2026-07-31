/**
 * Sim boot and per-frame state. Detect order: reduced-motion → WebGPU →
 * Canvas2D. CPU state is a handful of springs (phase accumulator, cursor,
 * tilt, excite) uploaded as one uniform block per frame. Morphs run as clock
 * jobs, inheriting latest-wins + interrupt acceleration.
 */
import type { Clock } from "../clock";
import { MOTION } from "../motion";
import { createCpuRenderer } from "./cpu";
import { createGpuRenderer, type Renderer, type Uniforms } from "./gpu";
import { BASE_PITCH, OBJECT_INDEX, type Section } from "./shapes";

export interface Sim {
	setSection: (s: Section) => void;
	setInk: () => void;
	setPointer: (x: number, y: number, active: boolean) => void;
	setTilt: (nx: number, ny: number) => void;
	excite: (strength?: number) => void;
	destroy: () => void;
	readonly kind: "gpu" | "cpu" | "static";
}

function readInk(): [number, number, number] {
	const raw = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
	const n = Number.parseInt(raw.slice(1), 16);
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export async function bootSim(
	canvas: HTMLCanvasElement,
	clock: Clock,
	initial: Section,
): Promise<Sim> {
	const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
	const dpr = Math.min(2, devicePixelRatio || 1);

	let renderer: Renderer | null = null;
	let destroyed = false;

	const initRenderer = async (): Promise<void> => {
		renderer?.destroy();
		renderer = reduced ? null : await createGpuRenderer(canvas, () => void initRenderer());
		renderer ??= createCpuRenderer(canvas);
		size();
	};

	const u: Uniforms = {
		resW: 0,
		resH: 0,
		cursorX: -1e4,
		cursorY: -1e4,
		phase: 0,
		morphT: 1,
		fromObj: OBJECT_INDEX[initial],
		toObj: OBJECT_INDEX[initial],
		yaw: 0,
		tiltX: BASE_PITCH[OBJECT_INDEX[initial]] ?? 0.16,
		tiltZ: 0,
		dimpleR: MOTION.cursorR * dpr,
		inkR: 0,
		inkG: 0,
		inkB: 0,
		cursorActive: 0,
		dotR: 1.15 * dpr,
		fade: 0,
		accentW: initial === "projects" ? 1 : 0,
	};
	[u.inkR, u.inkG, u.inkB] = readInk();

	const pointer = { x: 0, y: 0, active: false };
	const tiltFrom = { nx: 0, ny: 0 };
	let exciteLevel = 0;
	let speed = 1;
	let pitchFrom = u.tiltX;
	let pitchTo = u.tiltX;

	function size(): void {
		const r = canvas.getBoundingClientRect();
		u.resW = Math.round(r.width * dpr);
		u.resH = Math.round(r.height * dpr);
		renderer?.resize(u.resW, u.resH);
	}

	function accentTarget(): number {
		const fromW = u.fromObj === OBJECT_INDEX.projects ? 1 - u.morphT : 0;
		const toW = u.toObj === OBJECT_INDEX.projects ? u.morphT : 0;
		return fromW + toW;
	}

	await initRenderer();

	if (reduced) {
		// One static frame per (section, theme); re-rendered on demand only.
		const renderStatic = (): void => {
			[u.inkR, u.inkG, u.inkB] = readInk();
			u.fade = 1;
			u.morphT = 1;
			u.accentW = u.toObj === OBJECT_INDEX.projects ? 1 : 0;
			u.tiltX = BASE_PITCH[u.toObj] ?? 0.16;
			renderer?.frame(u);
		};
		renderStatic();
		new ResizeObserver(() => {
			size();
			renderStatic();
		}).observe(canvas);
		return {
			kind: "static",
			setSection(s) {
				u.fromObj = OBJECT_INDEX[s];
				u.toObj = OBJECT_INDEX[s];
				renderStatic();
			},
			setInk() {
				renderStatic();
			},
			setPointer() {},
			setTilt() {},
			excite() {},
			destroy() {
				renderer?.destroy();
			},
		};
	}

	let pendingResize = false;
	new ResizeObserver(() => {
		pendingResize = true;
	}).observe(canvas);

	if (import.meta.env.DEV) {
		(globalThis as { __simU?: unknown }).__simU = u;
	}
	const born = performance.now();
	const unsubscribe = clock.subscribe((t, dt) => {
		if (destroyed || !renderer) return;
		if (pendingResize) {
			pendingResize = false;
			size();
		}
		exciteLevel *= Math.exp(-dt / 0.45);
		const speedTarget = 1 + 0.9 * exciteLevel;
		speed += (speedTarget - speed) * Math.min(1, dt * 8);
		u.phase += speed * dt;
		u.yaw = u.phase * 0.2;
		u.fade = Math.min(1, (t - born) / MOTION.budget.simFade);

		const baseTilt = pitchFrom + (pitchTo - pitchFrom) * u.morphT;
		// tilt follows the pointer anywhere in the viewport, gently and slowly,
		// so the object drifts with the cursor instead of twitching
		const tiltTargetX = baseTilt + tiltFrom.ny * 0.26;
		const tiltTargetZ = tiltFrom.nx * 0.2;
		u.tiltX += (tiltTargetX - u.tiltX) * Math.min(1, dt * 1.6);
		u.tiltZ += (tiltTargetZ - u.tiltZ) * Math.min(1, dt * 1.6);
		u.cursorX = pointer.x * dpr;
		u.cursorY = pointer.y * dpr;
		u.cursorActive = pointer.active ? 1 : 0;
		u.accentW = accentTarget();
		renderer.frame(u);
	});

	return {
		kind: (renderer as Renderer | null)?.kind ?? "cpu",
		setSection(s: Section): void {
			const target = OBJECT_INDEX[s];
			if (target === u.toObj) return;
			clock.request(() => {
				u.fromObj = u.toObj;
				u.toObj = target;
				u.morphT = 0;
				pitchFrom = u.tiltX;
				pitchTo = BASE_PITCH[target] ?? 0.16;
				clock.run({
					kind: "morph",
					duration: MOTION.morph * 1000,
					step: (t01) => {
						u.morphT = 1 - (1 - t01) ** 3;
					},
					done: () => {
						u.morphT = 1;
						u.fromObj = u.toObj;
						pitchFrom = pitchTo;
					},
				});
			});
		},
		setInk(): void {
			[u.inkR, u.inkG, u.inkB] = readInk();
		},
		setPointer(x: number, y: number, active: boolean): void {
			pointer.x = x;
			pointer.y = y;
			pointer.active = active;
		},
		setTilt(nx: number, ny: number): void {
			tiltFrom.nx = nx;
			tiltFrom.ny = ny;
		},
		excite(strength = 1): void {
			exciteLevel = Math.max(exciteLevel, Math.min(1, strength));
		},
		destroy(): void {
			destroyed = true;
			unsubscribe();
			renderer?.destroy();
		},
	};
}
