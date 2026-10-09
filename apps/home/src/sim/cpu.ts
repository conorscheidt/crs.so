/**
 * Canvas2D fallback for browsers without WebGPU, and the single static frame
 * shown under prefers-reduced-motion. Same TS math as the shader on a smaller
 * pool.
 */
import { type Frame, inkGain, type Projected, pose, project, type Shade, shade } from "./camera";
import type { Renderer, Uniforms } from "./gpu";
import { evalPoint, ICO_VERTS, N, type Pt } from "./shapes";

// Squares with the same area as the GPU path's discs of radius r.
const SIDE = Math.sqrt(Math.PI);
const HALF = SIDE / 2;

const CPU_N = 900;

export function createCpuRenderer(canvas: HTMLCanvasElement): Renderer | null {
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	const p: Pt = { x: 0, y: 0, z: 0, a: 0 };
	const tmp: Pt = { x: 0, y: 0, z: 0, a: 0 };
	const pr: Projected = { sx: 0, sy: 0, depth: 0, lit: 0 };
	const sh: Shade = { a: 0, r: 0 };
	const f: Frame = {
		w: 0,
		h: 0,
		cosY: 1,
		sinY: 0,
		cosX: 1,
		sinX: 0,
		cosZ: 1,
		sinZ: 0,
		cx: 0,
		cy: 0,
		cursorActive: 0,
		dimpleR: 0,
	};

	return {
		kind: "cpu",
		frame(u: Uniforms): void {
			f.w = u.resW;
			f.h = u.resH;
			pose(f, u.yaw, u.tiltX, u.tiltZ);
			f.cx = u.cursorX;
			f.cy = u.cursorY;
			f.cursorActive = u.cursorActive;
			f.dimpleR = u.dimpleR;
			ctx.clearRect(0, 0, u.resW, u.resH);
			// One colour per frame; dots vary only in alpha.
			ctx.fillStyle = `rgb(${Math.round(u.inkR * 255)},${Math.round(u.inkG * 255)},${Math.round(u.inkB * 255)})`;
			const gain = inkGain(u.inkR, u.inkG, u.inkB);
			// Sample the pool evenly so CPU_N points cover all structures.
			const stride = N / CPU_N;
			for (let s = 0; s < CPU_N; s++) {
				const i = Math.floor(s * stride);
				evalPoint(i, u.fromObj, u.toObj, u.morphT, u.phase, p, tmp);
				project(p, f, pr);
				shade(p.a, pr.depth, pr.lit, gain, u.dotR, sh);
				ctx.globalAlpha = sh.a * u.fade;
				ctx.fillRect(pr.sx - sh.r * HALF, pr.sy - sh.r * HALF, sh.r * SIDE, sh.r * SIDE);
			}
			if (u.accentW > 0.01) {
				for (const v of ICO_VERTS) {
					p.x = v[0];
					p.y = v[1];
					p.z = v[2];
					p.a = 0.85 * u.accentW;
					project(p, f, pr);
					shade(p.a, pr.depth, pr.lit, gain, u.dotR * 1.9, sh);
					ctx.globalAlpha = sh.a * u.fade;
					ctx.fillRect(pr.sx - sh.r * HALF, pr.sy - sh.r * HALF, sh.r * SIDE, sh.r * SIDE);
				}
			}
		},
		resize(w: number, h: number): void {
			canvas.width = Math.max(1, w);
			canvas.height = Math.max(1, h);
		},
		destroy(): void {},
	};
}
