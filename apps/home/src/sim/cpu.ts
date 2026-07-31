/**
 * Canvas2D fallback: the same TS math as the shader (shapes + camera), with a
 * reduced pool. Used when WebGPU is unavailable and, as a single frame, under
 * prefers-reduced-motion.
 */
import { type Frame, type Projected, project, shade } from "./camera";
import type { Renderer, Uniforms } from "./gpu";
import { evalPoint, ICO_VERTS, N, type Pt, staggeredT } from "./shapes";

const CPU_N = 900;

export function createCpuRenderer(canvas: HTMLCanvasElement): Renderer | null {
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	const p: Pt = { x: 0, y: 0, z: 0, a: 0 };
	const tmp: Pt = { x: 0, y: 0, z: 0, a: 0 };
	const pr: Projected = { sx: 0, sy: 0, depth: 0, lit: 0 };
	const f: Frame = {
		w: 0,
		h: 0,
		yaw: 0,
		tiltX: 0,
		tiltZ: 0,
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
			f.yaw = u.yaw;
			f.tiltX = u.tiltX;
			f.tiltZ = u.tiltZ;
			f.cx = u.cursorX;
			f.cy = u.cursorY;
			f.cursorActive = u.cursorActive;
			f.dimpleR = u.dimpleR;
			ctx.clearRect(0, 0, u.resW, u.resH);
			const ink = `${Math.round(u.inkR * 255)},${Math.round(u.inkG * 255)},${Math.round(u.inkB * 255)}`;
			// Sample the pool evenly so CPU_N points cover all structures.
			const stride = N / CPU_N;
			for (let s = 0; s < CPU_N; s++) {
				const i = Math.floor(s * stride);
				evalPoint(i, u.fromObj, u.toObj, u.morphT, u.phase, p, tmp);
				project(p, f, pr);
				const sh = shade(p.a, pr.depth, pr.lit);
				const size = u.dotR * sh.s;
				ctx.fillStyle = `rgba(${ink},${(sh.a * u.fade).toFixed(3)})`;
				ctx.fillRect(pr.sx - size / 2, pr.sy - size / 2, size, size);
			}
			if (u.accentW > 0.01) {
				for (const v of ICO_VERTS) {
					p.x = v[0];
					p.y = v[1];
					p.z = v[2];
					p.a = 0.85 * u.accentW;
					project(p, f, pr);
					const sh = shade(p.a, pr.depth, pr.lit);
					const size = u.dotR * 1.9 * sh.s;
					ctx.fillStyle = `rgba(${ink},${(sh.a * u.fade).toFixed(3)})`;
					ctx.fillRect(pr.sx - size / 2, pr.sy - size / 2, size, size);
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

/** Referenced so the stagger stays part of the tested parity surface. */
export const _parity = staggeredT;
