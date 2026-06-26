/**
 * WebGPU primary backend: ink black hole / drift field.
 *
 * Compute integrates ~150k particles: under gravity toward a singularity on the
 * homepage hero (the eclipse), or a calm curl-noise drift on every blog page.
 * Rendered as fine round dust motes (a hair of velocity elongation on the fast
 * eclipse particles) so the field stays legible over prose and cheap to
 * composite while scrolling.
 *
 * Shaders live in ./shaders/*.wgsl (real files → editor intellisense via
 * wgsl-analyzer). WGSL has no #include, so the shared uniform block is prepended
 * to each module here. WGSL is compiled by the driver at pipeline creation; we
 * use the async variants so that one-time compile never blocks the first frame.
 */

import type { SigilBackend, SigilUniforms } from "./renderer";
import computeSrc from "./shaders/compute.wgsl?raw";
import renderSrc from "./shaders/render.wgsl?raw";
import ringSrc from "./shaders/ring.wgsl?raw";
import shadowSrc from "./shaders/shadow.wgsl?raw";
import uniformsSrc from "./shaders/uniforms.wgsl?raw";

const COUNT = 150000;
const HORIZON = 0.4;

// Prepend the shared uniform block (struct + bindings + consts) to each module.
const COMPUTE_WGSL = `${uniformsSrc}\n${computeSrc}`;
const RENDER_WGSL = `${uniformsSrc}\n${renderSrc}`;
const RING_WGSL = `${uniformsSrc}\n${ringSrc}`;
const SHADOW_WGSL = `${uniformsSrc}\n${shadowSrc}`;

export async function createWebGPUBackend(
	canvas: HTMLCanvasElement,
	ambient = false,
): Promise<SigilBackend | null> {
	const gpu = navigator.gpu;
	if (!gpu) return null;
	const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
	if (!adapter) return null;
	const device = await adapter.requestDevice();
	device.addEventListener("uncapturederror", (e) => {
		console.error("[blackhole/webgpu]", (e as GPUUncapturedErrorEvent).error.message);
	});
	const ctx = canvas.getContext("webgpu");
	if (!ctx) return null;

	const format = gpu.getPreferredCanvasFormat();
	ctx.configure({ device, format, alphaMode: "premultiplied" });

	const computeModule = device.createShaderModule({ code: COMPUTE_WGSL });
	const renderModule = device.createShaderModule({ code: RENDER_WGSL });
	const ringModule = device.createShaderModule({ code: RING_WGSL });
	const shadowModule = device.createShaderModule({ code: SHADOW_WGSL });

	const addBlend = {
		color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
		alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
	} as const;
	const additive = {
		color: { srcFactor: "one", dstFactor: "one", operation: "add" },
		alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
	} as const;

	// async pipeline creation → driver compiles WGSL off the critical path
	const [computePipeline, renderPipeline, ringPipeline, shadowPipeline] = await Promise.all([
		device.createComputePipelineAsync({
			layout: "auto",
			compute: { module: computeModule, entryPoint: "cs" },
		}),
		device.createRenderPipelineAsync({
			layout: "auto",
			vertex: { module: renderModule, entryPoint: "vs" },
			fragment: { module: renderModule, entryPoint: "fs", targets: [{ format, blend: addBlend }] },
			primitive: { topology: "triangle-list" },
		}),
		device.createRenderPipelineAsync({
			layout: "auto",
			vertex: { module: ringModule, entryPoint: "vs" },
			fragment: { module: ringModule, entryPoint: "fs", targets: [{ format, blend: additive }] },
			primitive: { topology: "triangle-list" },
		}),
		device.createRenderPipelineAsync({
			layout: "auto",
			vertex: { module: shadowModule, entryPoint: "vs" },
			fragment: { module: shadowModule, entryPoint: "fs", targets: [{ format, blend: addBlend }] },
			primitive: { topology: "triangle-list" },
		}),
	]);

	const init = new Float32Array(COUNT * 4);
	for (let i = 0; i < COUNT; i++) {
		if (ambient) {
			// blog drift: spread evenly across the field box so it reads as an even,
			// textured drift (not a collapsing disk)
			init[i * 4] = (Math.random() * 2 - 1) * 1.9;
			init[i * 4 + 1] = (Math.random() * 2 - 1) * 1.2;
			init[i * 4 + 2] = (Math.random() * 2 - 1) * 0.12;
			init[i * 4 + 3] = (Math.random() * 2 - 1) * 0.12;
		} else {
			// hero: trailing log-spiral arms, broadly jittered so the initial frame
			// already reads as a full accretion disk, not two bare spokes
			const arm = Math.floor(Math.random() * 2);
			const rad = 0.42 + Math.random() * 1.15;
			const ang = arm * Math.PI + 2.5 * Math.log(rad / HORIZON) + (Math.random() - 0.5) * 0.95;
			const speed = Math.sqrt(0.1 / rad) * (0.9 + Math.random() * 0.3);
			init[i * 4] = Math.cos(ang) * rad;
			init[i * 4 + 1] = Math.sin(ang) * rad;
			init[i * 4 + 2] = -Math.sin(ang) * speed;
			init[i * 4 + 3] = Math.cos(ang) * speed;
		}
	}
	const particles = device.createBuffer({
		size: init.byteLength,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});
	device.queue.writeBuffer(particles, 0, init);

	const ubo = device.createBuffer({
		size: 56,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});
	const scratch = new Float32Array(14);

	const computeBG = device.createBindGroup({
		layout: computePipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: { buffer: ubo } },
			{ binding: 1, resource: { buffer: particles } },
		],
	});
	const renderBG = device.createBindGroup({
		layout: renderPipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: { buffer: ubo } },
			{ binding: 1, resource: { buffer: particles } },
		],
	});
	const ringBG = device.createBindGroup({
		layout: ringPipeline.getBindGroupLayout(0),
		entries: [{ binding: 0, resource: { buffer: ubo } }],
	});
	const shadowBG = device.createBindGroup({
		layout: shadowPipeline.getBindGroupLayout(0),
		entries: [{ binding: 0, resource: { buffer: ubo } }],
	});

	const groups = Math.ceil(COUNT / 64);
	let last = -1;
	let lost = false;
	device.lost.then(() => {
		lost = true;
	});

	return {
		label: "webgpu",
		render(u: SigilUniforms): void {
			if (lost) return;
			let dt = last < 0 ? 0.016 : (u.time - last) * 0.001;
			last = u.time;
			// orbital pace near the hero, easing to a calm drift pace as it dissolves
			const driftAmt = Math.max(u.ambient, u.scroll);
			dt = Math.min(Math.max(dt, 0.0), 0.033) * (1.75 - 0.9 * driftAmt);

			scratch[0] = u.w;
			scratch[1] = u.h;
			scratch[2] = u.time * 0.001;
			scratch[3] = dt;
			scratch[4] = u.px;
			scratch[5] = u.py;
			scratch[6] = u.present;
			scratch[7] = u.down;
			scratch[8] = COUNT;
			scratch[9] = u.ambient;
			scratch[10] = u.dark;
			scratch[11] = u.scroll;
			scratch[12] = u.scrollVel;
			scratch[13] = 0;
			device.queue.writeBuffer(ubo, 0, scratch);

			const encoder = device.createCommandEncoder();
			const cpass = encoder.beginComputePass();
			cpass.setPipeline(computePipeline);
			cpass.setBindGroup(0, computeBG);
			cpass.dispatchWorkgroups(groups);
			cpass.end();

			const view = ctx.getCurrentTexture().createView();
			const rpass = encoder.beginRenderPass({
				colorAttachments: [
					{ view, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" },
				],
			});
			rpass.setPipeline(shadowPipeline);
			rpass.setBindGroup(0, shadowBG);
			rpass.draw(3);
			rpass.setPipeline(renderPipeline);
			rpass.setBindGroup(0, renderBG);
			rpass.draw(6, COUNT);
			rpass.setPipeline(ringPipeline);
			rpass.setBindGroup(0, ringBG);
			rpass.draw(3);
			rpass.end();

			device.queue.submit([encoder.finish()]);
		},
		resize(): void {},
		destroy(): void {
			particles.destroy();
			ubo.destroy();
			device.destroy();
		},
	};
}
