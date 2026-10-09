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
	WRAP_SQ,
} from "./camera";
import { type Emphasis, emphasis, focusEase, focusTarget } from "./focus";
import type { Renderer, Uniforms } from "./gpu";
import { ACCENT_ALPHA, ACCENT_SIZE, evalPoint, ICO_VERTS, N, N_ACCENT, type Pt } from "./shapes";
import { streak } from "./shutter";
import { spring, WAKE_W0, wakeForce } from "./wake";

// Squares with the same area as the GPU path's discs of radius r.
const SIDE = Math.sqrt(Math.PI);

/** Dots drawn per animated frame. */
export const CPU_N = 3000;
/** Phones on the fallback are the slowest devices the site meets. */
export const CPU_N_TOUCH = 1500;
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
	const em: Emphasis = { a: 1, r: 1 };
	/**
	 * per drawn dot, then per accent: wake offset x, y, its velocity x, y,
	 * where the dot was last drawn, and its eased share of the focus
	 */
	const wake = new Float32Array((n + N_ACCENT) * 7);
	const force: [number, number] = [0, 0];
	const sx: [number, number] = [0, 0];
	const sy: [number, number] = [0, 0];
	/** the next frame starts the wake and the streaks afresh */
	let settle = true;
	let dt = 0;
	let ease = 1;

	/** Ease slot j's share of the focus toward `hot`, and shade for it. */
	const focus = (u: Uniforms, j: number, hot: number): void => {
		const o = j * 7 + 6;
		const h = (wake[o] as number) + (hot - (wake[o] as number)) * ease;
		wake[o] = h;
		emphasis(u.focusW, h, em);
	};

	/**
	 * Advance slot j's wake and draw it as a square of the shaded size or, when
	 * it moved fast, a butt-capped stroke as wide that lays the same ink.
	 * `scale` is the projection's, as in camera.ts project().
	 */
	const put = (u: Uniforms, j: number, decay: number, scale: number): void => {
		const o = j * 7;
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
		spring(ox, wake[o + 2] as number, force[0], dt, decay, sx);
		spring(oy, wake[o + 3] as number, force[1], dt, decay, sy);
		wake[o] = sx[0];
		wake[o + 1] = sy[0];
		wake[o + 2] = sx[1];
		wake[o + 3] = sy[1];
		const x = pr.sx + sx[0];
		const y = pr.sy + sy[0];
		const mx = x - (wake[o + 4] as number);
		const my = y - (wake[o + 5] as number);
		wake[o + 4] = x;
		wake[o + 5] = y;
		// a hidden dot keeps its place, so it returns without a stale streak
		if (sh.a * u.fade < 1 / 1024) return;
		const side = sh.r * SIDE;
		const dist = Math.hypot(mx, my);
		const len = streak(dist, dt, scale, u.dpr);
		if (len > 0) {
			const ux = mx / dist;
			const uy = my / dist;
			ctx.globalAlpha = ((sh.a * side) / (side + len)) * u.fade;
			ctx.lineWidth = side;
			ctx.beginPath();
			ctx.moveTo(x + ux * side * 0.5, y + uy * side * 0.5);
			ctx.lineTo(x - ux * (len + side * 0.5), y - uy * (len + side * 0.5));
			ctx.stroke();
			return;
		}
		ctx.globalAlpha = sh.a * u.fade;
		ctx.fillRect(x - side * 0.5, y - side * 0.5, side, side);
	};

	return {
		kind: "cpu",
		frame(u: Uniforms): void {
			f.w = u.resW;
			f.h = u.resH;
			pose(f, u.yaw, u.tiltX, u.tiltZ);
			if (settle) wake.fill(0);
			dt = settle ? 0 : u.dt;
			settle = false;
			ease = focusEase(dt);
			const decay = Math.exp(-WAKE_W0 * dt);
			const scale = Math.min(u.resW, u.resH) * 0.3;
			ctx.clearRect(0, 0, u.resW, u.resH);
			// One colour per frame; dots vary only in alpha.
			ctx.fillStyle = `rgb(${Math.round(u.inkR * 255)},${Math.round(u.inkG * 255)},${Math.round(u.inkB * 255)})`;
			ctx.strokeStyle = ctx.fillStyle;
			const gain = inkGain(u.inkR, u.inkG, u.inkB);
			const night = inkNight(u.inkR, u.inkG, u.inkB);
			const dotR = u.dotR * Math.sqrt(N / n);
			for (let s = 0; s < n; s++) {
				// A golden-ratio walk rather than a fixed stride, which would alias
				// with the i mod 3 / 4 / 30 structure of the objects.
				const i = n === N ? s : Math.floor(((s * GOLDEN) % 1) * N);
				evalPoint(i, u.fromObj, u.toObj, u.morphT, u.phase, p, tmp);
				evalPoint(i, u.fromObj, u.toObj, u.morphT, u.phase + TANGENT_EPS, ahead, tmp);
				let dx = ahead.x - p.x;
				let dy = ahead.y - p.y;
				let dz = ahead.z - p.z;
				if (dx * dx + dy * dy + dz * dz > WRAP_SQ) {
					evalPoint(i, u.fromObj, u.toObj, u.morphT, u.phase - TANGENT_EPS, ahead, tmp);
					dx = p.x - ahead.x;
					dy = p.y - ahead.y;
					dz = p.z - ahead.z;
				}
				rotate(f, dx, dy, dz, tan);
				strand(tan.x, tan.y, tan.z, st);
				project(p, f, pr);
				focus(u, s, focusTarget(i, u.fromObj, u.toObj, u.morphT, p.k, u.phase, u.focus));
				shade(p.a * em.a, pr.depth, st.diff, st.spec, gain, night, dotR, sh);
				sh.r *= em.r;
				put(u, s, decay, scale);
			}
			// A vertex has no strand; light it as one seen end-on. Hidden accents
			// still advance, as on the GPU, so none returns with a stale streak.
			strand(0, 0, 1, st);
			for (const [j, v] of ICO_VERTS.entries()) {
				p.x = v[0];
				p.y = v[1];
				p.z = v[2];
				p.a = ACCENT_ALPHA * u.accentW;
				project(p, f, pr);
				focus(u, n + j, u.focus.obj === 1 && u.focus.vertex === j ? 1 : 0);
				shade(p.a * em.a, pr.depth, st.diff, st.spec, gain, night, u.dotR * ACCENT_SIZE, sh);
				sh.r *= em.r;
				put(u, n + j, decay, scale);
			}
		},
		resize(w: number, h: number): void {
			canvas.width = Math.max(1, w);
			canvas.height = Math.max(1, h);
			settle = true;
		},
		reset(): void {
			settle = true;
		},
		destroy(): void {},
	};
}
