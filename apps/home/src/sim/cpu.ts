/**
 * Canvas2D fallback for browsers without WebGPU, and the single static frame
 * shown under prefers-reduced-motion. Same TS math as the shader, on a sample
 * of the dots when animating.
 */
import {
	type Frame,
	inkGain,
	inkNight,
	type Projected,
	pose,
	project,
	rotate,
	type Shade,
	type Strand,
	shade,
	strand,
	TANGENT_EPS,
	type Vec3,
} from "./camera";
import type { Renderer, Uniforms } from "./gpu";
import { ACCENT_ALPHA, ACCENT_SIZE, evalPoint, ICO_VERTS, N, N_ACCENT, type Pt } from "./shapes";
import { spring, WAKE_W0, wakeForce } from "./wake";

// Squares with the same area as the GPU path's discs of radius r.
const SIDE = Math.sqrt(Math.PI);
const HALF = SIDE / 2;

/** Dots drawn per animated frame. */
export const CPU_N = 3000;
const GOLDEN = 0.618_033_988_75;

/**
 * `pool` dots stand in for all N: each one carries the ink of N / pool, as
 * extra area so the dots stay fine.
 */
export function createCpuRenderer(canvas: HTMLCanvasElement, pool = CPU_N): Renderer | null {
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	const p: Pt = { x: 0, y: 0, z: 0, a: 0, k: 0 };
	const tmp: Pt = { x: 0, y: 0, z: 0, a: 0, k: 0 };
	const ahead: Pt = { x: 0, y: 0, z: 0, a: 0, k: 0 };
	const tan: Vec3 = { x: 0, y: 0, z: 0 };
	const st: Strand = { diff: 0, spec: 0 };
	const pr: Projected = { sx: 0, sy: 0, depth: 0 };
	const sh: Shade = { a: 0, r: 0 };
	const f: Frame = { w: 0, h: 0, cosY: 1, sinY: 0, cosX: 1, sinX: 0, cosZ: 1, sinZ: 0 };
	const n = Math.min(pool, N);
	/** per drawn dot, then per accent: wake offset x, y and velocity x, y */
	const wake = new Float32Array((n + N_ACCENT) * 4);
	const force: [number, number] = [0, 0];
	const sx: [number, number] = [0, 0];
	const sy: [number, number] = [0, 0];

	/** Advance slot j's wake and draw it as a square of the shaded size. */
	const put = (u: Uniforms, j: number, decay: number): void => {
		const o = j * 4;
		const ox = wake[o] as number;
		const oy = wake[o + 1] as number;
		wakeForce(
			pr.sx + ox - u.cursorX,
			pr.sy + oy - u.cursorY,
			u.cursorVX,
			u.cursorVY,
			u.cursorActive,
			u.dpr,
			force,
		);
		spring(ox, wake[o + 2] as number, force[0], u.dt, decay, sx);
		spring(oy, wake[o + 3] as number, force[1], u.dt, decay, sy);
		wake[o] = sx[0];
		wake[o + 1] = sy[0];
		wake[o + 2] = sx[1];
		wake[o + 3] = sy[1];
		ctx.globalAlpha = sh.a * u.fade;
		ctx.fillRect(
			pr.sx + sx[0] - sh.r * HALF,
			pr.sy + sy[0] - sh.r * HALF,
			sh.r * SIDE,
			sh.r * SIDE,
		);
	};

	return {
		kind: "cpu",
		frame(u: Uniforms): void {
			f.w = u.resW;
			f.h = u.resH;
			pose(f, u.yaw, u.tiltX, u.tiltZ);
			const decay = Math.exp(-WAKE_W0 * u.dt);
			ctx.clearRect(0, 0, u.resW, u.resH);
			// One colour per frame; dots vary only in alpha.
			ctx.fillStyle = `rgb(${Math.round(u.inkR * 255)},${Math.round(u.inkG * 255)},${Math.round(u.inkB * 255)})`;
			const gain = inkGain(u.inkR, u.inkG, u.inkB);
			const night = inkNight(u.inkR, u.inkG, u.inkB);
			const dotR = u.dotR * Math.sqrt(N / n);
			for (let s = 0; s < n; s++) {
				// A golden-ratio walk rather than a fixed stride, which would alias
				// with the i mod 3 / 4 / 30 structure of the objects.
				const i = n === N ? s : Math.floor(((s * GOLDEN) % 1) * N);
				evalPoint(i, u.fromObj, u.toObj, u.morphT, u.phase, p, tmp);
				evalPoint(i, u.fromObj, u.toObj, u.morphT, u.phase + TANGENT_EPS, ahead, tmp);
				rotate(f, ahead.x - p.x, ahead.y - p.y, ahead.z - p.z, tan);
				strand(tan.x, tan.y, tan.z, st);
				project(p, f, pr);
				shade(p.a, pr.depth, st.diff, st.spec, gain, night, dotR, sh);
				put(u, s, decay);
			}
			if (u.accentW > 0.01) {
				// A vertex has no strand; light it as one seen end-on.
				strand(0, 0, 1, st);
				for (const [j, v] of ICO_VERTS.entries()) {
					p.x = v[0];
					p.y = v[1];
					p.z = v[2];
					p.a = ACCENT_ALPHA * u.accentW;
					project(p, f, pr);
					shade(p.a, pr.depth, st.diff, st.spec, gain, night, u.dotR * ACCENT_SIZE, sh);
					put(u, n + j, decay);
				}
			}
		},
		resize(w: number, h: number): void {
			canvas.width = Math.max(1, w);
			canvas.height = Math.max(1, h);
			wake.fill(0);
		},
		reset(): void {
			wake.fill(0);
		},
		destroy(): void {},
	};
}
