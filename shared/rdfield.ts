/// <reference types="@webgpu/types" />
/**
 * Reaction-diffusion sigil field, the full-bleed background.
 *
 * A Gray-Scott reaction-diffusion system grows labyrinthine patterns that slowly
 * morph; the cursor feeds the reaction, so the pattern blooms around the
 * pointer. Coloured as fine phosphor lines with red veins on black.
 *
 * WebGPU compute (ping-pong storage textures) when available, else a WebGL2
 * float-FBO fragment fallback running the same kernel. Simulated on a coarse
 * grid and upscaled with linear filtering, so it's cheap. Pauses when hidden;
 * one settled frame under reduced motion.
 */

interface Options {
	readonly static?: boolean;
}

// Gray-Scott params tuned for morphing maze/worm sigils.
const FEED = 0.038;
const KILL = 0.061;
const DU = 0.16;
const DV = 0.08;
const STEPS = 12; // sim iterations per displayed frame
const DPR_CAP = 2;

const WGSL_COMPUTE = /* wgsl */ `
struct P {
  feed:f32, kill:f32, du:f32, dv:f32, dt:f32, inject:f32, ptrx:f32, ptry:f32,
  gw:f32, gh:f32, seed:f32, _pad:f32,
};
@group(0) @binding(0) var<uniform> u: P;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var dst: texture_storage_2d<rgba16float, write>;

fn h(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn g() -> vec2i { return vec2i(i32(u.gw), i32(u.gh)); }
fn ld(c: vec2i) -> vec2f {
  let s = g();
  let cc = (c % s + s) % s;
  return textureLoad(src, cc, 0).xy;
}

@compute @workgroup_size(8, 8)
fn seed(@builtin(global_invocation_id) gid: vec3u) {
  let s = g();
  let c = vec2i(gid.xy);
  if (c.x >= s.x || c.y >= s.y) { return; }
  let p = vec2f(c);
  var v = 0.0;
  // sparse seed spots distributed across the field; the reaction spreads them
  // into a space-filling maze during pre-roll
  if (h(floor(p / 5.0) + u.seed) > 0.82) { v = 1.0; }
  textureStore(dst, c, vec4f(1.0, v, 0.0, 1.0));
}

@compute @workgroup_size(8, 8)
fn sim(@builtin(global_invocation_id) gid: vec3u) {
  let s = g();
  let c = vec2i(gid.xy);
  if (c.x >= s.x || c.y >= s.y) { return; }
  let m = ld(c);
  let lap =
      ld(c + vec2i(-1, 0)) * 0.2 + ld(c + vec2i(1, 0)) * 0.2
    + ld(c + vec2i(0, -1)) * 0.2 + ld(c + vec2i(0, 1)) * 0.2
    + ld(c + vec2i(-1, -1)) * 0.05 + ld(c + vec2i(1, -1)) * 0.05
    + ld(c + vec2i(-1, 1)) * 0.05 + ld(c + vec2i(1, 1)) * 0.05
    - m;
  let uu = m.x; let vv = m.y;
  let r = uu * vv * vv;
  var nu = uu + (u.du * lap.x - r + u.feed * (1.0 - uu)) * u.dt;
  var nv = vv + (u.dv * lap.y + r - (u.feed + u.kill) * vv) * u.dt;
  if (u.inject > 0.0) {
    let pf = vec2f(u.ptrx * u.gw, u.ptry * u.gh);
    let d = distance(vec2f(c), pf);
    nv += u.inject * exp(-d * d / 90.0);
  }
  textureStore(dst, c, vec4f(clamp(nu, 0.0, 1.0), clamp(nv, 0.0, 1.0), 0.0, 1.0));
}`;

const WGSL_RENDER = /* wgsl */ `
@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> res: vec4f; // res.xy, grid.xy

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[i], 0.0, 1.0);
}

fn col(v: f32, edge: f32) -> vec3f {
  let line = smoothstep(0.012, 0.07, edge);
  let front = smoothstep(0.16, 0.42, v);
  let phos = vec3f(0.91, 0.90, 0.87);
  let red = vec3f(1.0, 0.18, 0.10);
  return line * mix(phos, red, front * 0.7) + red * front * 0.05;
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / res.xy;
  let px = 1.0 / res.zw;
  let v = textureSample(tex, samp, uv).y;
  let vx = textureSample(tex, samp, uv + vec2f(px.x, 0.0)).y - textureSample(tex, samp, uv - vec2f(px.x, 0.0)).y;
  let vy = textureSample(tex, samp, uv + vec2f(0.0, px.y)).y - textureSample(tex, samp, uv - vec2f(0.0, px.y)).y;
  return vec4f(col(v, length(vec2f(vx, vy))) * 0.92, 1.0);
}`;

const GLSL_VERT = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const GLSL_SIM = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_grid;
uniform vec4 u_p;        // feed, kill, du, dv
uniform vec2 u_dti;      // dt, inject
uniform vec2 u_ptr;      // 0..1
out vec4 o;
vec2 L(vec2 uv){ return texture(u_src, uv).xy; }
void main(){
  vec2 uv = gl_FragCoord.xy / u_grid;
  vec2 px = 1.0 / u_grid;
  vec2 m = L(uv);
  vec2 lap =
      L(uv + vec2(-px.x, 0.)) * 0.2 + L(uv + vec2(px.x, 0.)) * 0.2
    + L(uv + vec2(0., -px.y)) * 0.2 + L(uv + vec2(0., px.y)) * 0.2
    + L(uv + vec2(-px.x, -px.y)) * 0.05 + L(uv + vec2(px.x, -px.y)) * 0.05
    + L(uv + vec2(-px.x, px.y)) * 0.05 + L(uv + vec2(px.x, px.y)) * 0.05
    - m;
  float r = m.x * m.y * m.y;
  float nu = m.x + (u_p.z * lap.x - r + u_p.x * (1.0 - m.x)) * u_dti.x;
  float nv = m.y + (u_p.w * lap.y + r - (u_p.x + u_p.y) * m.y) * u_dti.x;
  if (u_dti.y > 0.0) {
    float d = distance(uv, u_ptr) * u_grid.x;
    nv += u_dti.y * exp(-d * d / 90.0);
  }
  o = vec4(clamp(nu, 0.0, 1.0), clamp(nv, 0.0, 1.0), 0.0, 1.0);
}`;

const GLSL_RENDER = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec2 u_grid;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 px = 1.0 / u_grid;
  float v = texture(u_tex, uv).y;
  float vx = texture(u_tex, uv + vec2(px.x, 0.)).y - texture(u_tex, uv - vec2(px.x, 0.)).y;
  float vy = texture(u_tex, uv + vec2(0., px.y)).y - texture(u_tex, uv - vec2(0., px.y)).y;
  float edge = length(vec2(vx, vy));
  float line = smoothstep(0.012, 0.07, edge);
  float front = smoothstep(0.16, 0.42, v);
  vec3 phos = vec3(0.91, 0.90, 0.87);
  vec3 red = vec3(1.0, 0.18, 0.10);
  vec3 c = line * mix(phos, red, front * 0.7) + red * front * 0.05;
  o = vec4(c * 0.92, 1.0);
}`;

const _clampf = (v: number, a: number, b: number): number => Math.min(Math.max(v, a), b);

export class RDField {
	private readonly canvas: HTMLCanvasElement;
	private readonly isStatic: boolean;
	private destroyed = false;
	private raf = 0;
	private gw = 0;
	private gh = 0;
	private cw = 0;
	private ch = 0;
	private px = 0.5;
	private py = 0.5;
	private inject = 0;

	// webgpu
	private device: GPUDevice | null = null;
	private ctx: GPUCanvasContext | null = null;
	private texA: GPUTexture | null = null;
	private texB: GPUTexture | null = null;
	private simPipe: GPUComputePipeline | null = null;
	private seedPipe: GPUComputePipeline | null = null;
	private renderPipe: GPURenderPipeline | null = null;
	private pbuf: GPUBuffer | null = null;
	private rbuf: GPUBuffer | null = null;
	private simBindAB: GPUBindGroup | null = null;
	private simBindBA: GPUBindGroup | null = null;
	private renderBindA: GPUBindGroup | null = null;
	private renderBindB: GPUBindGroup | null = null;
	private flip = false;
	private readonly pdata = new Float32Array(12);

	// webgl2
	private gl: WebGL2RenderingContext | null = null;
	private glSim: WebGLProgram | null = null;
	private glRender: WebGLProgram | null = null;
	private fboA: WebGLFramebuffer | null = null;
	private fboB: WebGLFramebuffer | null = null;
	private glTexA: WebGLTexture | null = null;
	private glTexB: WebGLTexture | null = null;
	private quad: WebGLBuffer | null = null;
	private readonly uSim: Record<string, WebGLUniformLocation | null> = {};
	private readonly uRender: Record<string, WebGLUniformLocation | null> = {};

	constructor(canvas: HTMLCanvasElement, opts: Options = {}) {
		this.canvas = canvas;
		this.isStatic = opts.static ?? false;
		this.computeGrid();
		void this.boot();
	}

	private computeGrid(): void {
		this.cw = window.innerWidth;
		this.ch = window.innerHeight;
		const scale = 0.42;
		this.gw = Math.min(680, Math.round(this.cw * scale));
		this.gh = Math.max(2, Math.round(this.gw * (this.ch / this.cw)));
	}

	private async boot(): Promise<void> {
		const ok = (await this.initWebGPU()) || this.initWebGL();
		if (!ok || this.destroyed) {
			this.failed = true;
			this.canvas.classList.add("grid-fallback");
			return;
		}
		this.resizeCanvas();
		window.addEventListener("resize", this.onResize, { passive: true });
		window.addEventListener("pointermove", this.onPointer, { passive: true });
		document.addEventListener("visibilitychange", this.onVisibility);
		// Pre-roll so the maze is already space-filling on first paint.
		for (let i = 0; i < 900; i++) this.simOnce();
		this.present();
		if (!this.isStatic) this.raf = requestAnimationFrame(this.frame);
	}

	// ── WebGPU ────────────────────────────────────────────────────────────────
	private async initWebGPU(): Promise<boolean> {
		if (!navigator.gpu) return false;
		try {
			const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
			if (!adapter) return false;
			const device = await adapter.requestDevice();
			if (this.destroyed) {
				device.destroy();
				return false;
			}
			const format = navigator.gpu.getPreferredCanvasFormat();
			this.device = device;

			const mk = (): GPUTexture =>
				device.createTexture({
					size: [this.gw, this.gh],
					format: "rgba16float",
					usage:
						GPUTextureUsage.STORAGE_BINDING |
						GPUTextureUsage.TEXTURE_BINDING |
						GPUTextureUsage.COPY_DST,
				});
			this.texA = mk();
			this.texB = mk();

			const compute = device.createShaderModule({ code: WGSL_COMPUTE });
			const render = device.createShaderModule({ code: WGSL_RENDER });
			this.seedPipe = device.createComputePipeline({
				layout: "auto",
				compute: { module: compute, entryPoint: "seed" },
			});
			this.simPipe = device.createComputePipeline({
				layout: "auto",
				compute: { module: compute, entryPoint: "sim" },
			});
			this.renderPipe = device.createRenderPipeline({
				layout: "auto",
				vertex: { module: render, entryPoint: "vs" },
				fragment: { module: render, entryPoint: "fs", targets: [{ format }] },
				primitive: { topology: "triangle-list" },
			});

			this.pbuf = device.createBuffer({
				size: 48,
				usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			});
			this.rbuf = device.createBuffer({
				size: 16,
				usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			});
			const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });

			const simBind = (src: GPUTexture, dst: GPUTexture): GPUBindGroup =>
				device.createBindGroup({
					layout: this.simPipe?.getBindGroupLayout(0),
					entries: [
						{ binding: 0, resource: { buffer: this.pbuf! } },
						{ binding: 1, resource: src.createView() },
						{ binding: 2, resource: dst.createView() },
					],
				});
			this.simBindAB = simBind(this.texA, this.texB);
			this.simBindBA = simBind(this.texB, this.texA);

			const renderBind = (src: GPUTexture): GPUBindGroup =>
				device.createBindGroup({
					layout: this.renderPipe?.getBindGroupLayout(0),
					entries: [
						{ binding: 0, resource: src.createView() },
						{ binding: 1, resource: sampler },
						{ binding: 2, resource: { buffer: this.rbuf! } },
					],
				});
			this.renderBindA = renderBind(this.texA);
			this.renderBindB = renderBind(this.texB);

			// seed into texA
			this.writeParams(0);
			const seedBind = device.createBindGroup({
				layout: this.seedPipe.getBindGroupLayout(0),
				entries: [
					{ binding: 0, resource: { buffer: this.pbuf } },
					{ binding: 1, resource: this.texB.createView() },
					{ binding: 2, resource: this.texA.createView() },
				],
			});
			const enc = device.createCommandEncoder();
			const pass = enc.beginComputePass();
			pass.setPipeline(this.seedPipe);
			pass.setBindGroup(0, seedBind);
			pass.dispatchWorkgroups(Math.ceil(this.gw / 8), Math.ceil(this.gh / 8));
			pass.end();
			device.queue.submit([enc.finish()]);
			this.flip = false;

			// Acquire the canvas context last: once a canvas is bound to "webgpu"
			// it can never fall back to "webgl2". Only bind after everything above
			// succeeded.
			const ctx = this.canvas.getContext("webgpu");
			if (!ctx) {
				device.destroy();
				this.device = null;
				return false;
			}
			ctx.configure({ device, format, alphaMode: "opaque" });
			this.ctx = ctx;
			return true;
		} catch {
			this.device?.destroy();
			this.device = null;
			return false;
		}
	}

	private writeParams(inject: number): void {
		if (!this.device || !this.pbuf) return;
		const p = this.pdata;
		p[0] = FEED;
		p[1] = KILL;
		p[2] = DU;
		p[3] = DV;
		p[4] = 1;
		p[5] = inject;
		p[6] = this.px;
		p[7] = this.py;
		p[8] = this.gw;
		p[9] = this.gh;
		p[10] = 0.123;
		this.device.queue.writeBuffer(this.pbuf, 0, p);
	}

	// ── WebGL2 fallback ─────────────────────────────────────────────────────────
	private initWebGL(): boolean {
		const gl = this.canvas.getContext("webgl2", { alpha: false, antialias: false });
		if (!gl) return false;
		if (!gl.getExtension("EXT_color_buffer_float")) return false;
		gl.getExtension("OES_texture_float_linear");
		this.gl = gl;

		const sh = (t: number, s: string): WebGLShader | null => {
			const o = gl.createShader(t);
			if (!o) return null;
			gl.shaderSource(o, s);
			gl.compileShader(o);
			return gl.getShaderParameter(o, gl.COMPILE_STATUS) ? o : null;
		};
		const prog = (fs: string): WebGLProgram | null => {
			const v = sh(gl.VERTEX_SHADER, GLSL_VERT);
			const f = sh(gl.FRAGMENT_SHADER, fs);
			if (!v || !f) return null;
			const p = gl.createProgram();
			if (!p) return null;
			gl.attachShader(p, v);
			gl.attachShader(p, f);
			gl.linkProgram(p);
			return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
		};
		this.glSim = prog(GLSL_SIM);
		this.glRender = prog(GLSL_RENDER);
		if (!this.glSim || !this.glRender) return false;
		for (const n of ["u_src", "u_grid", "u_p", "u_dti", "u_ptr"])
			this.uSim[n] = gl.getUniformLocation(this.glSim, n);
		for (const n of ["u_tex", "u_res", "u_grid"])
			this.uRender[n] = gl.getUniformLocation(this.glRender, n);

		this.quad = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

		const seed = new Float32Array(this.gw * this.gh * 4);
		for (let y = 0; y < this.gh; y++)
			for (let x = 0; x < this.gw; x++) {
				const i = (y * this.gw + x) * 4;
				seed[i] = 1;
				seed[i + 1] = Math.random() > 0.86 ? 1 : 0;
				seed[i + 3] = 1;
			}
		const mkTex = (data: Float32Array | null): WebGLTexture => {
			const t = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, t);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.gw, this.gh, 0, gl.RGBA, gl.FLOAT, data);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			return t as WebGLTexture;
		};
		this.glTexA = mkTex(seed);
		this.glTexB = mkTex(null);
		const mkFbo = (tex: WebGLTexture): WebGLFramebuffer => {
			const f = gl.createFramebuffer();
			gl.bindFramebuffer(gl.FRAMEBUFFER, f);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
			return f as WebGLFramebuffer;
		};
		this.fboA = mkFbo(this.glTexA);
		this.fboB = mkFbo(this.glTexB);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		return true;
	}

	// ── shared loop ─────────────────────────────────────────────────────────────
	private readonly onResize = (): void => {
		this.computeGrid();
		this.resizeCanvas();
		// grid textures keep their size; only the present target changes.
	};
	private resizeCanvas(): void {
		const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
		this.canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
		this.canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
		this.gl?.viewport(0, 0, this.canvas.width, this.canvas.height);
	}

	private readonly onPointer = (e: PointerEvent): void => {
		this.px = e.clientX / window.innerWidth;
		this.py = 1 - e.clientY / window.innerHeight;
		this.inject = 0.42;
	};
	private readonly onVisibility = (): void => {
		if (!document.hidden && !this.isStatic && !this.raf && !this.destroyed)
			this.raf = requestAnimationFrame(this.frame);
	};

	private simOnce(): void {
		if (this.device) {
			this.writeParams(this.inject);
			const enc = this.device.createCommandEncoder();
			const pass = enc.beginComputePass();
			pass.setPipeline(this.simPipe!);
			pass.setBindGroup(0, this.flip ? this.simBindBA! : this.simBindAB!);
			pass.dispatchWorkgroups(Math.ceil(this.gw / 8), Math.ceil(this.gh / 8));
			pass.end();
			this.device.queue.submit([enc.finish()]);
			this.flip = !this.flip;
		} else if (this.gl) {
			const gl = this.gl;
			gl.useProgram(this.glSim);
			gl.viewport(0, 0, this.gw, this.gh);
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.flip ? this.fboA : this.fboB);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, this.flip ? this.glTexB : this.glTexA);
			gl.uniform1i(this.uSim.u_src ?? null, 0);
			gl.uniform2f(this.uSim.u_grid ?? null, this.gw, this.gh);
			gl.uniform4f(this.uSim.u_p ?? null, FEED, KILL, DU, DV);
			gl.uniform2f(this.uSim.u_dti ?? null, 1, this.inject);
			gl.uniform2f(this.uSim.u_ptr ?? null, this.px, this.py);
			this.bindQuad(this.glSim);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			this.flip = !this.flip;
		}
		this.inject *= 0.86;
	}

	private bindQuad(prog: WebGLProgram | null): void {
		const gl = this.gl;
		if (!gl || !prog) return;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
		const loc = gl.getAttribLocation(prog, "p");
		gl.enableVertexAttribArray(loc);
		gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
	}

	private present(): void {
		if (this.device && this.ctx) {
			this.device.queue.writeBuffer(
				this.rbuf!,
				0,
				new Float32Array([this.canvas.width, this.canvas.height, this.gw, this.gh]),
			);
			const enc = this.device.createCommandEncoder();
			const pass = enc.beginRenderPass({
				colorAttachments: [
					{
						view: this.ctx.getCurrentTexture().createView(),
						clearValue: { r: 0, g: 0, b: 0, a: 1 },
						loadOp: "clear",
						storeOp: "store",
					},
				],
			});
			pass.setPipeline(this.renderPipe!);
			// after sim loop, latest result is in texA when flip===false
			pass.setBindGroup(0, this.flip ? this.renderBindB! : this.renderBindA!);
			pass.draw(3);
			pass.end();
			this.device.queue.submit([enc.finish()]);
		} else if (this.gl) {
			const gl = this.gl;
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.viewport(0, 0, this.canvas.width, this.canvas.height);
			gl.useProgram(this.glRender);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, this.flip ? this.glTexB : this.glTexA);
			gl.uniform1i(this.uRender.u_tex ?? null, 0);
			gl.uniform2f(this.uRender.u_res ?? null, this.canvas.width, this.canvas.height);
			gl.uniform2f(this.uRender.u_grid ?? null, this.gw, this.gh);
			this.bindQuad(this.glRender);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
		}
	}

	private readonly frame = (): void => {
		if (this.destroyed) return;
		if (document.hidden) {
			this.raf = 0;
			return;
		}
		this.raf = requestAnimationFrame(this.frame);
		for (let i = 0; i < STEPS; i++) this.simOnce();
		this.present();
	};

	public destroy(): void {
		this.destroyed = true;
		this.failed = true;
		if (this.raf) cancelAnimationFrame(this.raf);
		window.removeEventListener("resize", this.onResize);
		window.removeEventListener("pointermove", this.onPointer);
		document.removeEventListener("visibilitychange", this.onVisibility);
		this.texA?.destroy();
		this.texB?.destroy();
		this.device?.destroy();
		this.device = null;
		this.gl = null;
	}
}
