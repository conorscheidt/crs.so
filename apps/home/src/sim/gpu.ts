/**
 * WebGPU renderer: a compute pass places and shades every dot into a storage
 * buffer, which the render pass then reads as an instance vertex buffer
 * (draw(4, N + accents) quads); vertex-stage storage reads are not available
 * in compatibility mode. The device, pipelines and buffers are built once and
 * outlive any canvas, since the hub's canvas is replaced on every hub ⇄
 * article swap; a new canvas only configures a context. Device loss, including
 * after a bfcache restore, rebuilds them.
 */
import type { Focus } from "./focus";
import shaderSrc from "./shader.wgsl?raw";
import { N, N_ACCENT } from "./shapes";

export interface Uniforms {
	resW: number;
	resH: number;
	cursorX: number;
	cursorY: number;
	phase: number;
	morphT: number;
	fromObj: number;
	toObj: number;
	yaw: number;
	tiltX: number;
	tiltZ: number;
	/** device px per CSS px */
	dpr: number;
	inkR: number;
	inkG: number;
	inkB: number;
	cursorActive: number;
	dotR: number;
	fade: number;
	accentW: number;
	/** s since the last drawn frame; 0 holds the wake still */
	dt: number;
	/** device px/s */
	cursorVX: number;
	cursorVY: number;
	focus: Focus;
	/** 0..1, the fade in and out of any focus */
	focusW: number;
}

export interface Renderer {
	frame: (u: Uniforms) => void;
	/** Also settles the wake, which is in device px of the old size. */
	resize: (w: number, h: number) => void;
	/** Settle every dot's wake at once. */
	reset: () => void;
	/** Release the canvas. A GPU renderer leaves the shared device alive. */
	destroy: () => void;
	readonly kind: "gpu" | "cpu";
}

export interface Gpu {
	readonly device: GPUDevice;
	readonly format: GPUTextureFormat;
	readonly pipeline: GPURenderPipeline;
	readonly bindGroup: GPUBindGroup;
	readonly advance: GPUComputePipeline;
	readonly advanceGroup: GPUBindGroup;
	readonly ubo: GPUBuffer;
	readonly marks: GPUBuffer;
}

const FLOATS = 36;
const COUNT = N + N_ACCENT;
/** Bytes per instance in the marks buffer: WGSL struct Mark. */
const MARK_BYTES = 48;
const WORKGROUP = 64;
const buf = new Float32Array(FLOATS);
const words = new Uint32Array(buf.buffer);

let pending: Promise<Gpu | null> | null = null;
/** undefined while nothing has settled, so callers can attach synchronously */
let ready: Gpu | null | undefined;
let losses = 0;
let lostAt = 0;
let broken = false;
const lostHandlers = new Set<() => void>();

/** The device if it is already up, null if WebGPU is out, undefined if pending. */
export function gpuNow(): Gpu | null | undefined {
	return broken ? null : ready;
}

export function acquireGpu(): Promise<Gpu | null> {
	if (broken) return Promise.resolve(null);
	pending ??= build().then((g) => {
		ready = g;
		// No adapter right after a loss is usually the GPU process restarting:
		// fall back for now, and let the next boot try again.
		if (!g && navigator.gpu) pending = null;
		return g;
	});
	return pending;
}

/** Runs when the device goes away; attached canvases must drop their context. */
export function onGpuLost(fn: () => void): () => void {
	lostHandlers.add(fn);
	return () => {
		lostHandlers.delete(fn);
	};
}

function lose(): void {
	pending = null;
	ready = undefined;
	// A device that keeps dying is not worth chasing; the 2D path takes over.
	// Losses a minute apart (bfcache restores, driver updates) don't add up.
	const now = performance.now();
	if (now - lostAt > 60_000) losses = 0;
	lostAt = now;
	if (++losses > 3) broken = true;
	for (const fn of [...lostHandlers]) fn();
}

async function build(): Promise<Gpu | null> {
	if (!navigator.gpu) return null;
	if (losses > 1) await new Promise((r) => setTimeout(r, 250 * 4 ** (losses - 2)));
	// Try a compatibility-mode adapter first, then a plain one.
	let adapter: GPUAdapter | null = null;
	try {
		adapter = await navigator.gpu.requestAdapter({
			powerPreference: "low-power",
			featureLevel: "compatibility",
		} as GPURequestAdapterOptions);
	} catch {}
	if (!adapter) {
		try {
			adapter = await navigator.gpu.requestAdapter({ powerPreference: "low-power" });
		} catch {}
	}
	if (!adapter) return null;
	const device = await adapter.requestDevice().catch(() => null);
	if (!device) return null;
	const format = navigator.gpu.getPreferredCanvasFormat();

	// No canvas has a context yet, so a failure here still leaves the 2D path open.
	device.pushErrorScope("validation");
	const module = device.createShaderModule({ code: `const N: f32 = ${N}.0;\n${shaderSrc}` });
	const advance = device
		.createComputePipelineAsync({ layout: "auto", compute: { module, entryPoint: "advance" } })
		.catch(() => null);
	const render = device
		.createRenderPipelineAsync({
			layout: "auto",
			vertex: {
				module,
				entryPoint: "vs",
				buffers: [
					{
						arrayStride: MARK_BYTES,
						stepMode: "instance",
						attributes: [
							{ shaderLocation: 0, offset: 16, format: "float32x2" },
							{ shaderLocation: 1, offset: 24, format: "float32x2" },
							{ shaderLocation: 2, offset: 32, format: "float32x2" },
						],
					},
				],
			},
			fragment: {
				module,
				entryPoint: "fs",
				targets: [
					{
						format,
						blend: {
							color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
							alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
						},
					},
				],
			},
			primitive: { topology: "triangle-strip" },
		})
		.catch(() => null);
	const [step, pipeline] = await Promise.all([advance, render]);
	const invalid = await device.popErrorScope().catch(() => null);
	if (!(step && pipeline) || invalid) {
		device.destroy();
		return null;
	}

	let gone = false;
	device.lost.then((info) => {
		if (gone || info.reason === "destroyed") return;
		gone = true;
		lose();
	});
	// A validation error at draw time leaves a blank canvas and nothing else
	// reports it, so give up on WebGPU for the page.
	device.addEventListener("uncapturederror", () => {
		if (gone) return;
		gone = true;
		broken = true;
		device.destroy();
		lose();
	});

	const ubo = device.createBuffer({
		size: FLOATS * 4,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});
	const marks = device.createBuffer({
		size: COUNT * MARK_BYTES,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
	});
	const bindGroup = device.createBindGroup({
		layout: pipeline.getBindGroupLayout(0),
		entries: [{ binding: 0, resource: { buffer: ubo } }],
	});
	const advanceGroup = device.createBindGroup({
		layout: step.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: { buffer: ubo } },
			{ binding: 1, resource: { buffer: marks } },
		],
	});
	return { device, format, pipeline, bindGroup, advance: step, advanceGroup, ubo, marks };
}

export function attachGpu(gpu: Gpu, canvas: HTMLCanvasElement): Renderer | null {
	const ctx = canvas.getContext("webgpu");
	if (!ctx) return null;
	const { device, pipeline, bindGroup, advance, advanceGroup, ubo, marks } = gpu;
	ctx.configure({ device, format: gpu.format, alphaMode: "premultiplied" });
	let live = true;
	// The wake belongs to whatever canvas drew it last.
	let settle = true;

	return {
		kind: "gpu",
		frame(u: Uniforms): void {
			if (!live) return;
			buf[0] = u.resW;
			buf[1] = u.resH;
			buf[2] = u.cursorX;
			buf[3] = u.cursorY;
			buf[4] = u.phase;
			buf[5] = u.morphT;
			buf[6] = u.fromObj;
			buf[7] = u.toObj;
			buf[8] = u.yaw;
			buf[9] = u.tiltX;
			buf[10] = u.tiltZ;
			buf[11] = u.dpr;
			buf[12] = u.inkR;
			buf[13] = u.inkG;
			buf[14] = u.inkB;
			buf[15] = u.cursorActive;
			buf[16] = u.dotR;
			buf[17] = u.fade;
			buf[18] = u.accentW;
			buf[19] = settle ? 0 : u.dt;
			buf[20] = u.cursorVX;
			buf[21] = u.cursorVY;
			buf[22] = u.focus.obj;
			buf[23] = u.focusW;
			words[24] = u.focus.weeksLo;
			words[25] = u.focus.weeksHi;
			buf[26] = u.focus.vertex;
			buf[27] = u.focus.rings;
			buf.set(u.focus.lats, 28);
			device.queue.writeBuffer(ubo, 0, buf);
			const encoder = device.createCommandEncoder();
			if (settle) encoder.clearBuffer(marks);
			settle = false;
			const step = encoder.beginComputePass();
			step.setPipeline(advance);
			step.setBindGroup(0, advanceGroup);
			step.dispatchWorkgroups(Math.ceil(COUNT / WORKGROUP));
			step.end();
			const pass = encoder.beginRenderPass({
				colorAttachments: [
					{
						view: ctx.getCurrentTexture().createView(),
						clearValue: { r: 0, g: 0, b: 0, a: 0 },
						loadOp: "clear",
						storeOp: "store",
					},
				],
			});
			pass.setPipeline(pipeline);
			pass.setBindGroup(0, bindGroup);
			pass.setVertexBuffer(0, marks);
			pass.draw(4, COUNT);
			pass.end();
			device.queue.submit([encoder.finish()]);
		},
		resize(w: number, h: number): void {
			canvas.width = Math.max(1, Math.min(w, device.limits.maxTextureDimension2D));
			canvas.height = Math.max(1, Math.min(h, device.limits.maxTextureDimension2D));
			settle = true;
		},
		reset(): void {
			settle = true;
		},
		destroy(): void {
			live = false;
			ctx.unconfigure();
		},
	};
}
