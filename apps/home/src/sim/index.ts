/**
 * Boots the sim (reduced motion, then WebGPU, then Canvas2D) and owns its
 * per-frame state: a few springs (phase, cursor, tilt, excite) uploaded as one
 * uniform block. Morphs run as clock jobs. The state outlives the canvas: app.ts
 * swaps <main> on hub ⇄ article travel, and the next hub canvas continues from
 * the same pose with no fade-in.
 */
import type { Clock } from "../clock";
import { Trail } from "../cursor";
import { MOTION } from "../motion";
import { CPU_N, createCpuRenderer } from "./cpu";
import { flick } from "./flick";
import { encodeFocus, type FocusSpec, focusEase, noFocus } from "./focus";
import {
	acquireGpu,
	attachGpu,
	type Gpu,
	gpuNow,
	onGpuLost,
	type Renderer,
	type Uniforms,
} from "./gpu";
import { BASE_PITCH, N, OBJECT_INDEX, type Section } from "./shapes";

export type { FocusSpec } from "./focus";

export interface Sim {
	setSection: (s: Section) => void;
	setInk: () => void;
	setPointer: (x: number, y: number, active: boolean) => void;
	/**
	 * Grab the object: drag deltas (css px) spin it, and a release keeps the
	 * spin it had. `t` is the event timeStamp; `coast: false` lets go dead.
	 */
	beginDrag: (t: number) => void;
	dragBy: (dx: number, dy: number, t: number) => void;
	endDrag: (t: number, coast?: boolean) => void;
	excite: (strength?: number) => void;
	/**
	 * Emphasise part of the current object, or nothing. The part fades in and
	 * out; one part replaced by another crossfades.
	 */
	setFocus: (spec: FocusSpec | null) => void;
	/** Skip drawing while nothing can see the canvas; time keeps running. */
	setVisible: (visible: boolean) => void;
	/** Let go of the canvas. The pose and the GPU device wait for the next one. */
	detach: () => void;
	readonly kind: "gpu" | "cpu" | "static";
}

/** Radians of spin per CSS pixel dragged, and the cap on release speed. */
const DRAG_YAW = 0.0062;
const DRAG_PITCH = 0.005;
const SPIN_MAX = 2.2;
/** Smoothing on the cursor's measured velocity (s); raw pointer events bunch. */
const CURSOR_VEL_TAU = 0.04;
/** CSS px/s; past it a pointer jumped rather than moved */
const CURSOR_VEL_MAX = 4000;

const clampAbs = (v: number, max: number): number => Math.max(-max, Math.min(max, v));

interface State {
	u: Uniforms;
	/** idle rotation, accumulated so it can pause while the object is held */
	spin: number;
	yawOff: number;
	pitchOff: number;
	vYaw: number;
	vPitch: number;
	exciteLevel: number;
	speed: number;
	pitchFrom: number;
	pitchTo: number;
	/** when the first frame drew; the fade-in runs once per page load */
	born: number;
}

let state: State | null = null;

function initState(initial: Section): State {
	const obj = OBJECT_INDEX[initial];
	const tilt = BASE_PITCH[obj] ?? 0.16;
	return {
		u: {
			resW: 0,
			resH: 0,
			cursorX: -1e4,
			cursorY: -1e4,
			phase: 0,
			morphT: 1,
			fromObj: obj,
			toObj: obj,
			yaw: 0,
			tiltX: tilt,
			tiltZ: 0,
			dpr: 1,
			inkR: 0,
			inkG: 0,
			inkB: 0,
			cursorActive: 0,
			dotR: 0,
			fade: 0,
			accentW: initial === "projects" ? 1 : 0,
			dt: 0,
			cursorVX: 0,
			cursorVY: 0,
			focus: noFocus(),
			focusW: 0,
		},
		spin: 0,
		yawOff: 0,
		pitchOff: 0,
		vYaw: 0,
		vPitch: 0,
		exciteLevel: 0,
		speed: 1,
		pitchFrom: tilt,
		pitchTo: tilt,
		born: Number.NaN,
	};
}

function readInk(): [number, number, number] {
	const raw = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
	const n = Number.parseInt(raw.slice(1), 16);
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const prefersReduced = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Start bringing up the GPU device ahead of the hub, e.g. on link hover. */
export function warmSim(): void {
	if (!prefersReduced()) void acquireGpu();
}

function accentTarget(u: Uniforms): number {
	const fromW = u.fromObj === OBJECT_INDEX.projects ? 1 - u.morphT : 0;
	const toW = u.toObj === OBJECT_INDEX.projects ? u.morphT : 0;
	return fromW + toW;
}

export function bootSim(el: HTMLCanvasElement, clock: Clock, initial: Section): Sim {
	const reduced = prefersReduced();
	let dpr = Math.min(2, devicePixelRatio || 1);
	state ??= initState(initial);
	const s = state;
	const u = s.u;
	u.cursorActive = 0;
	u.cursorVX = 0;
	u.cursorVY = 0;
	// Whatever was pointed at went with the last hub.
	encodeFocus(null, u.focus);
	u.focusW = 0;
	// The theme can flip while the hub is away.
	[u.inkR, u.inkG, u.inkB] = readInk();

	if (reduced) u.toObj = OBJECT_INDEX[initial];

	let canvas = el;
	let renderer: Renderer | null = null;
	/** a canvas that has held a WebGPU context can never give out a 2D one */
	let gpuBound = false;
	let detached = false;
	let visible = true;
	/** the observer has reported this canvas's size */
	let sized = false;

	// Size from the layout box rather than getBoundingClientRect, which carries
	// the sheet layout's sink scale, and draw in the callback so the frame where
	// the box changes never shows a stretched backing store.
	const ro = new ResizeObserver((entries) => {
		const e = entries.at(-1);
		const css = e?.contentBoxSize[0];
		if (!(e && css)) return;
		// Take the scale from the observer itself, so dot size always matches the
		// buffer it lands in; devicePixelRatio can disagree with it under zoom.
		const dev = e.devicePixelContentBoxSize?.[0];
		const scale =
			dev && css.inlineSize > 0 ? dev.inlineSize / css.inlineSize : devicePixelRatio || 1;
		dpr = Math.min(2, scale);
		const k = dpr / scale;
		u.resW = Math.round(dev ? dev.inlineSize * k : css.inlineSize * dpr);
		u.resH = Math.round(dev ? dev.blockSize * k : css.blockSize * dpr);
		u.dpr = dpr;
		u.dotR = 0.78 * dpr;
		sized = true;
		draw();
	});
	const observe = (): void => {
		try {
			ro.observe(canvas, { box: "device-pixel-content-box" });
		} catch {
			ro.observe(canvas);
		}
	};
	observe();
	// Without device-pixel-content-box (Safari), moving to a screen of another
	// density changes nothing the observer sees.
	let dprQuery: MediaQueryList | null = null;
	const onDpr = (): void => {
		watchDpr();
		ro.unobserve(canvas);
		observe();
	};
	const watchDpr = (): void => {
		dprQuery?.removeEventListener("change", onDpr);
		dprQuery = matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`);
		dprQuery.addEventListener("change", onDpr);
	};
	watchDpr();

	// Off the clock, so nothing moves on: a dt of 0 holds the wake still.
	function draw(): void {
		if (!(renderer && sized)) return;
		renderer.resize(u.resW, u.resH);
		u.dt = 0;
		if (reduced) renderStatic();
		else if (visible) renderer.frame(u);
	}

	// One static frame per (section, theme); re-rendered on demand only.
	function renderStatic(): void {
		[u.inkR, u.inkG, u.inkB] = readInk();
		u.dt = 0;
		u.fade = 1;
		u.morphT = 1;
		u.fromObj = u.toObj;
		u.accentW = u.toObj === OBJECT_INDEX.projects ? 1 : 0;
		u.tiltX = BASE_PITCH[u.toObj] ?? 0.16;
		if (sized) renderer?.frame(u);
	}

	const use = (gpu: Gpu | null): void => {
		renderer?.destroy();
		renderer = gpu && attachGpu(gpu, canvas);
		if (renderer) gpuBound = true;
		else {
			if (gpuBound) {
				gpuBound = false;
				const fresh = canvas.cloneNode(false) as HTMLCanvasElement;
				ro.unobserve(canvas);
				canvas.replaceWith(fresh);
				canvas = fresh;
				sized = false;
				observe();
			}
			// The static frame draws once, so it can afford every dot.
			renderer = createCpuRenderer(canvas, reduced ? N : CPU_N);
		}
		if (!reduced && Number.isNaN(s.born)) s.born = performance.now();
		draw();
	};
	const connect = (): void => {
		// Back on the hub with the device already up: attach before the first paint.
		const now = reduced ? null : gpuNow();
		if (now === undefined)
			void acquireGpu().then((gpu) => {
				if (!detached) use(gpu);
			});
		else use(now);
	};
	const offLost = onGpuLost(() => {
		if (renderer?.kind !== "gpu") return;
		renderer.destroy();
		renderer = null;
		connect();
	});
	connect();

	if (reduced) {
		// Pointing in and out re-renders once per frame at most.
		let restage = 0;
		return {
			kind: "static",
			setSection(next) {
				u.toObj = OBJECT_INDEX[next];
				renderStatic();
			},
			setInk() {
				renderStatic();
			},
			setPointer() {},
			setVisible() {},
			beginDrag() {},
			dragBy() {},
			endDrag() {},
			excite() {},
			setFocus(spec) {
				encodeFocus(spec, u.focus);
				u.focusW = u.focus.obj >= 0 ? 1 : 0;
				restage ||= requestAnimationFrame(() => {
					restage = 0;
					renderStatic();
				});
			},
			detach() {
				detached = true;
				cancelAnimationFrame(restage);
				offLost();
				ro.disconnect();
				dprQuery?.removeEventListener("change", onDpr);
				renderer?.destroy();
				renderer = null;
			},
		};
	}

	const pointer = { x: 0, y: 0, active: false };
	let wasActive = false;
	/** clock time of the last frame drawn, and whether the last tick drew one */
	let drawnAt = Number.NaN;
	let drewLast = false;
	// Drag to spin: yaw accumulates freely; pitch is clamped and eases home.
	let dragging = false;
	/** cumulative (yawOff, pitchOff) per input sample, for the release slope */
	const trail = new Trail();
	const slope: [number, number] = [0, 0];
	const held: [number, number] = [0, 0];
	let spinW = 1;

	const unsubscribe = clock.subscribe((t, dt) => {
		if (!(renderer && sized)) return;
		s.exciteLevel *= Math.exp(-dt / 0.45);
		const speedTarget = 1 + 0.9 * s.exciteLevel;
		s.speed += (speedTarget - s.speed) * Math.min(1, dt * 8);
		u.phase += s.speed * dt;

		// Released spins coast down to the idle rotation; pitch drifts back.
		if (!dragging) {
			s.vYaw *= Math.exp(-dt / 1.1);
			s.vPitch *= Math.exp(-dt / 1.1);
			s.yawOff += s.vYaw * dt;
			s.pitchOff += s.vPitch * dt;
			s.pitchOff *= Math.exp(-dt / 6);
		}
		s.pitchOff = Math.max(-0.7, Math.min(0.7, s.pitchOff));
		spinW += ((dragging ? 0 : 1) - spinW) * Math.min(1, dt * 6);
		s.spin += 0.2 * s.speed * dt * spinW;
		// While held, follow the drag resampled slightly in the past, as the
		// cursor does, so each frame turns by an even amount however input and
		// display rates beat.
		if (dragging && trail.size > 1) {
			trail.at(t - Math.min(18, Math.max(8, 1.25 * trail.interval)), held);
		} else if (!dragging) {
			held[0] = s.yawOff;
			held[1] = s.pitchOff;
		}
		u.yaw = s.spin + held[0];
		u.fade = Math.max(0, Math.min(1, (t - s.born) / MOTION.budget.simFade));

		const baseTilt = s.pitchFrom + (s.pitchTo - s.pitchFrom) * u.morphT;
		const tiltTargetX = baseTilt + held[1];
		// the hand sets pitch directly; otherwise it eases back to the object's own
		u.tiltX += (tiltTargetX - u.tiltX) * Math.min(1, dt * (dragging ? 60 : 6));
		u.tiltZ -= u.tiltZ * Math.min(1, dt * 1.6);
		// The wake eases in and out; leaving, it fades where the cursor was last
		// seen. A cursor that has just arrived has no velocity yet.
		const ease = 1 - Math.exp(-dt / CURSOR_VEL_TAU);
		if (pointer.active) {
			const x = pointer.x * dpr;
			const y = pointer.y * dpr;
			const moving = wasActive && dt > 0;
			const vMax = CURSOR_VEL_MAX * dpr;
			const vx = moving ? clampAbs((x - u.cursorX) / dt, vMax) : 0;
			const vy = moving ? clampAbs((y - u.cursorY) / dt, vMax) : 0;
			u.cursorVX = wasActive ? u.cursorVX + (vx - u.cursorVX) * ease : 0;
			u.cursorVY = wasActive ? u.cursorVY + (vy - u.cursorVY) * ease : 0;
			u.cursorX = x;
			u.cursorY = y;
		} else {
			u.cursorVX -= u.cursorVX * ease;
			u.cursorVY -= u.cursorVY * ease;
		}
		wasActive = pointer.active;
		u.cursorActive += ((pointer.active ? 1 : 0) - u.cursorActive) * (1 - Math.exp(-14 * dt));
		u.accentW = accentTarget(u);
		u.focusW += ((u.focus.obj >= 0 ? 1 : 0) - u.focusW) * focusEase(dt);
		if (visible) {
			// Motion carries over only from the frame just before. After a long
			// pause (a hidden tab, a bfcache restore) the wake settles too.
			if (!(t - drawnAt < 1000)) renderer.reset();
			u.dt = drewLast ? dt : 0;
			renderer.frame(u);
			drawnAt = t;
		}
		drewLast = visible;
	});

	const sim: Sim = {
		get kind() {
			return renderer?.kind ?? "cpu";
		},
		setSection(next: Section): void {
			const target = OBJECT_INDEX[next];
			if (target === u.toObj) return;
			clock.request(() => {
				u.fromObj = u.toObj;
				u.toObj = target;
				u.morphT = 0;
				s.pitchFrom = u.tiltX;
				s.pitchTo = BASE_PITCH[target] ?? 0.16;
				clock.run({
					kind: "morph",
					duration: MOTION.morph * 1000,
					step: (t01) => {
						u.morphT = 1 - (1 - t01) ** 3;
					},
					done: () => {
						u.morphT = 1;
						u.fromObj = u.toObj;
						s.pitchFrom = s.pitchTo;
					},
				});
			});
		},
		setInk(): void {
			[u.inkR, u.inkG, u.inkB] = readInk();
		},
		setVisible(v: boolean): void {
			visible = v;
		},
		setPointer(x: number, y: number, active: boolean): void {
			pointer.x = x;
			pointer.y = y;
			pointer.active = active;
		},
		beginDrag(t: number): void {
			dragging = true;
			s.vYaw = 0;
			s.vPitch = 0;
			trail.clear();
			trail.push(t, s.yawOff, s.pitchOff);
		},
		dragBy(dx: number, dy: number, t: number): void {
			if (!dragging) return;
			// Dragging down tips the top toward the viewer, so dy subtracts from pitch.
			s.yawOff += dx * DRAG_YAW;
			s.pitchOff = Math.max(-0.7, Math.min(0.7, s.pitchOff - dy * DRAG_PITCH));
			trail.push(t, s.yawOff, s.pitchOff);
		},
		endDrag(t: number, coast = true): void {
			if (!dragging) return;
			dragging = false;
			// Coast from where the object was drawn, not from the newest sample.
			s.yawOff = held[0];
			s.pitchOff = held[1];
			// Capped so a hard flick doesn't launch the object.
			if (coast) flick(trail, t, SPIN_MAX, slope);
			else slope.fill(0);
			s.vYaw = slope[0];
			s.vPitch = slope[1];
		},
		excite(strength = 1): void {
			s.exciteLevel = Math.max(s.exciteLevel, Math.min(1, strength));
		},
		setFocus(spec: FocusSpec | null): void {
			encodeFocus(spec, u.focus);
		},
		detach(): void {
			detached = true;
			offLost();
			unsubscribe();
			ro.disconnect();
			dprQuery?.removeEventListener("change", onDpr);
			renderer?.destroy();
			renderer = null;
		},
	};
	// Returning to a different section than the one left morphs into it.
	sim.setSection(initial);
	return sim;
}
