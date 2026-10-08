/**
 * WebGPU renderer: one pipeline, one ~80-byte uniform buffer and no vertex
 * buffers (draw(4, N + accents) instanced quads). init is re-entrant, so device
 * loss, including after a bfcache restore, just runs it again.
 */
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
	dimpleR: number;
	inkR: number;
	inkG: number;
	inkB: number;
	cursorActive: number;
	dotR: number;
	fade: number;
	accentW: number;
}

export interface Renderer {
	frame: (u: Uniforms) => void;
	resize: (w: number, h: number) => void;
	destroy: () => void;
	readonly kind: "gpu" | "cpu";
}

const FLOATS = 20;

export async function createGpuRenderer(
	canvas: HTMLCanvasElement,
	onLost: () => void,
): Promise<Renderer | null> {
	if (!navigator.gpu) return null;
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

	const ctx = canvas.getContext("webgpu");
	if (!ctx) return null;
	const format = navigator.gpu.getPreferredCanvasFormat();
	ctx.configure({ device, format, alphaMode: "premultiplied" });

	let destroyed = false;
	device.lost.then((info) => {
		if (!destroyed && info.reason !== "destroyed") onLost();
	});

	const module = device.createShaderModule({ code: shaderSrc });
	const pipeline = device.createRenderPipeline({
		layout: "auto",
		vertex: { module, entryPoint: "vs" },
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
	});

	const ubo = device.createBuffer({
		size: FLOATS * 4,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});
	const bindGroup = device.createBindGroup({
		layout: pipeline.getBindGroupLayout(0),
		entries: [{ binding: 0, resource: { buffer: ubo } }],
	});
	const buf = new Float32Array(FLOATS);

	return {
		kind: "gpu",
		frame(u: Uniforms): void {
			if (destroyed) return;
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
			buf[11] = u.dimpleR;
			buf[12] = u.inkR;
			buf[13] = u.inkG;
			buf[14] = u.inkB;
			buf[15] = u.cursorActive;
			buf[16] = u.dotR;
			buf[17] = u.fade;
			buf[18] = u.accentW;
			device.queue.writeBuffer(ubo, 0, buf);
			const encoder = device.createCommandEncoder();
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
			pass.draw(4, N + N_ACCENT);
			pass.end();
			device.queue.submit([encoder.finish()]);
		},
		resize(w: number, h: number): void {
			canvas.width = Math.max(1, Math.min(w, device.limits.maxTextureDimension2D));
			canvas.height = Math.max(1, Math.min(h, device.limits.maxTextureDimension2D));
		},
		destroy(): void {
			destroyed = true;
			device.destroy();
		},
	};
}
