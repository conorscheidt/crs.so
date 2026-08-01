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
	/** grab the object: drag deltas (css px) spin it; release keeps inertia */
	beginDrag: () => void;
	dragBy: (dx: number, dy: number) => void;
	endDrag: () => void;
	excite: (strength?: number) => void;
	destroy: () => void;
	readonly kind: "gpu" | "cpu" | "static";
}

/** Drag feel: radians of spin per css pixel, and the release cap. */
const DRAG_YAW = 0.0062;
const DRAG_PITCH = 0.005;
const SPIN_MAX = 2.2;

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
	// drag to spin: the visitor grabs the object.
	// Yaw offset accumulates freely; pitch offset is clamped and eases home.
	let dragging = false;
	let yawOff = 0;
	let pitchOff = 0;
	let vYaw = 0;
	let vPitch = 0;
	let lastDragAt = 0;
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
			beginDrag() {},
			dragBy() {},
			endDrag() {},
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

		// inertia: released spins coast, then hand the object back to its own
		// slow rotation; pitch drifts home so the composition always recovers
		if (!dragging) {
			vYaw *= Math.exp(-dt / 1.1);
			vPitch *= Math.exp(-dt / 1.1);
			yawOff += vYaw * dt;
			pitchOff += vPitch * dt;
			pitchOff *= Math.exp(-dt / 6);
		}
		pitchOff = Math.max(-0.7, Math.min(0.7, pitchOff));
		u.yaw = u.phase * 0.2 + yawOff;
		u.fade = Math.min(1, (t - born) / MOTION.budget.simFade);

		const baseTilt = pitchFrom + (pitchTo - pitchFrom) * u.morphT;
		const tiltTargetX = baseTilt + pitchOff;
		u.tiltX += (tiltTargetX - u.tiltX) * Math.min(1, dt * 6);
		u.tiltZ -= u.tiltZ * Math.min(1, dt * 1.6);
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
		beginDrag(): void {
			dragging = true;
			vYaw = 0;
			vPitch = 0;
			lastDragAt = performance.now();
		},
		dragBy(dx: number, dy: number): void {
			if (!dragging) return;
			const now = performance.now();
			const step = Math.max(8, Math.min(64, now - lastDragAt)) / 1000;
			lastDragAt = now;
			yawOff += dx * DRAG_YAW;
			pitchOff = Math.max(-0.7, Math.min(0.7, pitchOff + dy * DRAG_PITCH));
			// rad/s from the real pointer rate, smoothed, then capped so a hard
			// flick spins the object without launching it
			const clamp = (v: number): number => Math.max(-SPIN_MAX, Math.min(SPIN_MAX, v));
			vYaw = clamp(vYaw * 0.55 + ((dx * DRAG_YAW) / step) * 0.45);
			vPitch = clamp(vPitch * 0.55 + ((dy * DRAG_PITCH) / step) * 0.45);
		},
		endDrag(): void {
			dragging = false;
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
