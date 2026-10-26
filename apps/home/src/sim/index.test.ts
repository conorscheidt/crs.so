/**
 * The sim end to end against the real Clock, drawing through gpu.ts onto a
 * fake WebGPU device that keeps the last uniform upload and logs each frame's
 * work. Globals stand in for the browser only for the length of this file.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { Clock } from "../clock";
import { MOTION } from "../motion";
import { createCpuRenderer } from "./cpu";
import { noFocus } from "./focus";
import type { Uniforms } from "./gpu";
import type { Sim } from "./index";
import { newPairing, pairDots } from "./match";
import { BASE_PITCH, N, OBJECT_INDEX } from "./shapes";

/** Uniform slots by Uniforms field, read from gpu.ts the way gpu.test.ts checks them. */
const SLOT: Record<string, number> = {};

let uniforms = new Float32Array(64);
const at = (name: string): number => uniforms[SLOT[name] as number] as number;

/** What the device was given for one frame. */
interface Drawn {
	uniforms: Float32Array;
	/** the pairing uploaded, if one was */
	pairs: Uint32Array | null;
	/** buffer copies and compute dispatches, in order, by entry point */
	work: string[];
}
const drawn: Drawn[] = [];
let pending: Drawn = { uniforms, pairs: null, work: [] };

const USAGE = { UNIFORM: 64, COPY_DST: 8, COPY_SRC: 4, STORAGE: 128, VERTEX: 32 };

const device = {
	limits: { maxTextureDimension2D: 8192 },
	lost: new Promise(() => {}),
	pushErrorScope(): void {},
	popErrorScope: async (): Promise<null> => null,
	addEventListener(): void {},
	createShaderModule: () => ({}),
	createComputePipelineAsync: async (d: { compute: { entryPoint: string } }) => ({
		entry: d.compute.entryPoint,
		getBindGroupLayout: () => ({}),
	}),
	createRenderPipelineAsync: async () => ({ getBindGroupLayout: () => ({}) }),
	createBuffer: (d: { size: number; usage: number }) => ({ ...d }),
	createBindGroup: () => ({}),
	createCommandEncoder: () => ({
		clearBuffer(): void {},
		copyBufferToBuffer(): void {
			pending.work.push("copy");
		},
		beginComputePass: () => {
			let entry = "";
			return {
				setPipeline(p: { entry: string }): void {
					entry = p.entry;
				},
				setBindGroup(): void {},
				dispatchWorkgroups(): void {
					pending.work.push(entry);
				},
				end(): void {},
			};
		},
		beginRenderPass: () => ({
			setPipeline(): void {},
			setBindGroup(): void {},
			setVertexBuffer(): void {},
			draw(): void {},
			end(): void {},
		}),
		finish: () => ({}),
	}),
	queue: {
		writeBuffer(
			buffer: { usage: number },
			_offset: number,
			data: Float32Array | ArrayBuffer,
		): void {
			if (buffer.usage & USAGE.UNIFORM) {
				uniforms = (data as Float32Array).slice();
				pending.uniforms = uniforms;
			} else {
				// the pairing: a key per vertex accent, then a source per dot
				pending.pairs = new Uint32Array((data as ArrayBuffer).slice(12 * 4));
			}
		},
		submit(): void {
			drawn.push(pending);
			pending = { uniforms, pairs: null, work: [] };
		},
	},
	destroy(): void {},
};

const canvas = {
	width: 0,
	height: 0,
	getContext: (kind: string) =>
		kind === "webgpu"
			? {
					configure(): void {},
					unconfigure(): void {},
					getCurrentTexture: () => ({ createView: () => ({}) }),
				}
			: null,
	replaceWith(): void {},
	cloneNode(): unknown {
		return canvas;
	},
} as unknown as HTMLCanvasElement;

const STUBS: Record<string, unknown> = {
	matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
	ResizeObserver: class {
		private readonly cb: (entries: unknown[]) => void;
		constructor(cb: (entries: unknown[]) => void) {
			this.cb = cb;
		}
		observe(): void {
			const box = [{ inlineSize: 820, blockSize: 900 }];
			this.cb([{ contentBoxSize: box, devicePixelContentBoxSize: box }]);
		}
		unobserve(): void {}
		disconnect(): void {}
	},
	getComputedStyle: () => ({ getPropertyValue: () => "#ffffff" }),
	document: { documentElement: {} },
	devicePixelRatio: 1,
	GPUBufferUsage: USAGE,
};
const saved = new Map<string, PropertyDescriptor | undefined>();

let now = 0;
let queue: ((t: number) => void)[] = [];
const clock = new Clock((cb) => queue.push(cb));
const frame = (ms = 1000 / 60): void => {
	now += ms;
	const q = queue;
	queue = [];
	for (const cb of q) cb(now);
};
/** Run frames until the object has settled, and a few more. */
const settle = (): void => {
	for (let f = 0; f < 600 && !(at("morphT") === 1 && clock.phase === "idle"); f++) frame();
	for (let f = 0; f < 10; f++) frame();
};

let sim: Sim;

/** A recorded frame as Uniforms, for a canvas `size` px a side. */
function replayed(d: Drawn, size: number): Uniforms {
	const u: Record<string, number> = {};
	for (const [name, slot] of Object.entries(SLOT)) u[name] = d.uniforms[slot] as number;
	return { ...(u as unknown as Uniforms), resW: size, resH: size, focus: noFocus() };
}

/** A 2D canvas that keeps the centre of every square drawn in the last frame. */
function squares(): { canvas: HTMLCanvasElement; at: number[]; streaks: () => number } {
	const centres: number[] = [];
	let streaks = 0;
	const ctx = {
		globalAlpha: 1,
		fillStyle: "",
		beginPath(): void {},
		moveTo(): void {
			streaks++;
		},
		lineTo(): void {},
		closePath(): void {},
		fill(): void {},
		clearRect(): void {
			centres.length = 0;
			streaks = 0;
		},
		fillRect(x: number, y: number, w: number, h: number): void {
			centres.push(x + w / 2, y + h / 2);
		},
	};
	const view = { getContext: () => ctx, width: 0, height: 0 } as unknown as HTMLCanvasElement;
	return { canvas: view, at: centres, streaks: () => streaks };
}

const gap = (a: number[], j: number, b: number[], k: number): number =>
	Math.hypot(
		(a[2 * j] as number) - (b[2 * k] as number),
		(a[2 * j + 1] as number) - (b[2 * k + 1] as number),
	);

beforeAll(async () => {
	const gpu = await Bun.file(new URL("./gpu.ts", import.meta.url)).text();
	for (const m of gpu.matchAll(/buf\[(\d+)\] = u\.(\w+);/g)) SLOT[m[2] as string] = Number(m[1]);
	SLOT.dt = Number(gpu.match(/buf\[(\d+)\] = settle \? 0 : u\.dt;/)?.[1]);
	const g = globalThis as Record<string, unknown>;
	for (const [name, value] of Object.entries(STUBS)) {
		saved.set(name, Object.getOwnPropertyDescriptor(g, name));
		Object.defineProperty(g, name, { value, configurable: true, writable: true });
	}
	saved.set("navigator.gpu", Object.getOwnPropertyDescriptor(navigator, "gpu"));
	Object.defineProperty(navigator, "gpu", {
		configurable: true,
		value: {
			requestAdapter: async () => ({ requestDevice: async () => device }),
			getPreferredCanvasFormat: () => "bgra8unorm",
		},
	});
	const { bootSim } = await import("./index");
	const { acquireGpu } = await import("./gpu");
	sim = bootSim(canvas, clock, "index");
	// The device comes up asynchronously; the sim attaches as it does.
	await acquireGpu();
	settle();
});

afterAll(() => {
	sim?.detach();
	const g = globalThis as Record<string, unknown>;
	for (const [name, d] of saved) {
		const [owner, key] = name === "navigator.gpu" ? [navigator, "gpu"] : [g, name];
		if (d) Object.defineProperty(owner, key, d);
		else delete (owner as Record<string, unknown>)[key];
	}
});

test("the sim draws the morph where the clock has it this frame, not the last", () => {
	expect(sim.kind).toBe("gpu");
	expect(at("toObj")).toBe(OBJECT_INDEX.index);
	sim.setSection("about");
	frame(16);
	expect(at("toObj")).toBe(OBJECT_INDEX.about);
	expect(at("morphT")).toBeCloseTo(16 / (MOTION.morph * 1000), 6);
	settle();
	sim.setSection("index");
	settle();
});

test("the morph's drawing order is read at the phase it began", () => {
	sim.setSection("writing");
	frame();
	const began = at("morphPhase");
	expect(began).toBeLessThan(at("phase"));
	for (let f = 0; f < 20; f++) {
		frame();
		expect(at("morphPhase")).toBe(began);
	}
	settle();
});

test("going A to B, then C, then back to B mid-morph ends on B when it said it would", () => {
	sim.setSection("index");
	settle();
	sim.setSection("projects");
	for (let ms = 0; ms < 200; ms += 1000 / 60) frame();
	sim.setSection("writing");
	for (let ms = 0; ms < 100; ms += 1000 / 60) frame();
	const eta = sim.setSection("projects");
	// The morph in flight is already bound for it, so no second morph follows.
	expect(eta).toBeLessThan(MOTION.morph * 1000);
	let ms = 0;
	while (!(at("morphT") === 1 && at("fromObj") === at("toObj")) && ms < 3000) {
		frame(4);
		ms += 4;
	}
	expect(ms).toBeGreaterThanOrEqual(eta);
	expect(ms).toBeLessThan(eta + 4 + 1e-9);
	for (let f = 0; f < 120; f++) frame();
	expect(at("toObj")).toBe(OBJECT_INDEX.projects);
	expect(at("morphT")).toBe(1);
	expect(sim.setSection("projects")).toBe(0);
});

test("an interrupting click speeds the object up without a lurch", () => {
	sim.setSection("about");
	const steps: number[] = [];
	let last = 0;
	for (let f = 0; f < 60 && clock.phase !== "idle"; f++) {
		if (f === 15) sim.setSection("writing");
		frame();
		if (at("toObj") !== OBJECT_INDEX.about) break;
		steps.push(at("morphT") - last);
		last = at("morphT");
	}
	for (let j = 1; j < steps.length - 1; j++) {
		expect((steps[j] as number) / (steps[j - 1] as number)).toBeLessThan(1.35);
	}
	expect((steps.at(-2) as number) / (steps[0] as number)).toBeGreaterThan(2.5);
	settle();
});

test("a section change after a vertical drag eases to the new pitch without a nod", () => {
	sim.setSection("index");
	settle();
	// Drag the top toward the viewer, then let go without a coast.
	sim.beginDrag(now);
	for (let k = 0; k < 40; k++) {
		frame(8);
		sim.dragBy(0, -3.5, now);
	}
	for (let f = 0; f < 6; f++) frame();
	sim.endDrag(now, false);
	for (let f = 0; f < 24; f++) frame();
	const start = at("tiltX");
	expect(start).toBeGreaterThan((BASE_PITCH[0] as number) + 0.4);
	sim.setSection("about");
	let most = start;
	for (let f = 0; f < 60; f++) {
		frame();
		most = Math.max(most, at("tiltX"));
	}
	// It rises by the change in base pitch and no further, less the drag's
	// slow drift home.
	const rise = (BASE_PITCH[3] as number) - (BASE_PITCH[0] as number);
	expect(most).toBeLessThan(start + rise + 0.005);
	settle();
});

test("a morph asked for mid-flight starts each dot where the last one left it", () => {
	sim.setSection("index");
	settle();
	const rest = drawn.length - 1;
	sim.setSection("about");
	for (let ms = 0; ms < 200; ms += 1000 / 60) frame();
	sim.setSection("writing");
	settle();
	const frames = drawn.slice(rest);
	const read = (d: Drawn, name: string): number => d.uniforms[SLOT[name] as number] as number;
	const next = frames.findIndex((d) => read(d, "toObj") === OBJECT_INDEX.writing);
	const first = frames[next] as Drawn;
	const last = frames[next - 1] as Drawn;
	// The clock lets the hurried morph land before the next begins, from the
	// object the dots landed on, every one of them at its start. The landing
	// itself is never drawn: the frame before it still has the last dots in.
	expect(read(last, "toObj")).toBe(OBJECT_INDEX.about);
	expect(read(last, "morphT")).toBeLessThan(1);
	expect(read(first, "fromObj")).toBe(OBJECT_INDEX.about);
	expect(read(first, "morphT")).toBe(0);
	// Each morph is paired once, on its first frame, where every dot takes over
	// the mark of the dot it leaves from before any moves.
	const paired = frames.flatMap((d, k) => (d.pairs ? [k] : []));
	expect(paired).toEqual([1, next]);
	for (const [k, d] of frames.entries()) {
		expect(d.work).toEqual(paired.includes(k) ? ["copy", "rebase", "advance"] : ["advance"]);
	}
	const src = first.pairs as Uint32Array;
	expect([...src].sort((a, b) => a - b)).toEqual(Array.from({ length: N }, (_, i) => i));

	// Through the fallback with every dot, the TS mirror of the shader: each
	// dot takes up where the one it leaves from was drawn the frame before.
	const view = squares();
	const cpu = createCpuRenderer(view.canvas, N);
	const shots: number[][] = [];
	for (const d of frames.slice(0, next + 1)) {
		cpu?.frame(replayed(d, 40));
		shots.push([...view.at]);
		expect(view.streaks()).toBe(0);
	}
	const [before, end, start] = shots.slice(-3) as [number[], number[], number[]];
	for (const shot of [before, end, start]) expect(shot.length).toBeGreaterThanOrEqual(2 * N);
	// The fallback paired at the phase as the uniforms carry it, rounded to
	// f32, which moves a few dots across a cell of the Hilbert grid.
	const pairs = newPairing(N);
	pairDots(OBJECT_INDEX.about, OBJECT_INDEX.writing, read(first, "morphPhase"), N, (i) => i, pairs);
	let differ = 0;
	for (let i = 0; i < N; i++) if (pairs.src[i] !== src[i]) differ++;
	expect(differ).toBeLessThan(N / 100);
	let jump = 0;
	let step = 0;
	let unpaired = 0;
	for (let i = 0; i < N; i++) {
		jump = Math.max(jump, gap(start, i, end, pairs.src[i] as number));
		step = Math.max(step, gap(end, i, before, i));
		unpaired += gap(start, i, end, i) / N;
	}
	// No dot moves across the handover as far as the flights moved the frame
	// before; had each dot started from its own place in the old object
	// instead, they would have jumped across it.
	expect(jump).toBeLessThan(step / 2);
	expect(unpaired).toBeGreaterThan(25 * jump);
});
