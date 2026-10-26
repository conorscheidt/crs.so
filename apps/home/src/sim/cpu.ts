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
import { Matcher } from "./match";
import {
	ACCENT_ALPHA,
	ACCENT_SIZE,
	accentWeight,
	evalPoint,
	flightT,
	ICO_VERTS,
	N,
	N_ACCENT,
	type Pt,
	strandAnchor,
	strandWrapped,
} from "./shapes";
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
 * The pool dot slot s of n draws: a golden-ratio walk rather than a fixed
 * stride, which would alias with the i mod 3 / 4 / 30 structure of the objects.
 */
export const poolDot = (s: number, n: number): number =>
	n === N ? s : Math.floor(((s * GOLDEN) % 1) * N);

/**
 * Streaks are filled a band of alpha at a time rather than stroked one by
 * one, which during a morph is over a thousand draw calls a frame. Bands run
 * geometrically from BAND_MIN to 1; each streak widens or narrows to lay its
 * own ink at its band's alpha.
 */
const BANDS = 32;
const BAND_MIN = 1 / 1024;
const BAND_STEP = Math.log(1 / BAND_MIN) / (BANDS - 1);
const BAND_ALPHA = Float64Array.from(
	{ length: BANDS },
	(_, b) => BAND_MIN * Math.exp(b * BAND_STEP),
);
/**
 * A fill() inks the union of its path once, so streaks that overlap within
 * one lose the ink of the overlap. Dots on parallel paths fly side by side, so
 * each band is split into LANES paths, with neighbours in pool order in
 * different ones. With one path a band, the frame lost up to 13% of its ink
 * mid-morph against drawing each streak alone (knot to rings); with twelve,
 * under 1%.
 */
const LANES = 12;

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
	/**
	 * per drawn dot, the phase its strands counted laps from when it was last
	 * drawn (strandAnchor()), as a double, so it is exactly the phase in the
	 * uniforms
	 */
	const anchors = new Float64Array(n);
	/**
	 * The morph's pairing over the pool: a slot leaves from where slot
	 * pairs.src[s] stood. When a morph begins each slot takes over that slot's
	 * wake and anchor, kept meanwhile in the spare copies.
	 */
	const matcher = new Matcher(n, (s) => poolDot(s, n));
	const pairs = matcher.pairing;
	const heldWake = new Float32Array(n * 7);
	const heldAnchors = new Float64Array(n);
	/** this frame's streaks as quads, four corners each, listed per path */
	const quads = new Float32Array((n + N_ACCENT) * 8);
	const nextQuad = new Int32Array(n + N_ACCENT);
	/** path b * LANES + l holds band b's streaks in lane l */
	const pathHead = new Int32Array(BANDS * LANES);
	/** per slot, its lane: slots take turns in the order of the dots they draw */
	const lane = new Uint8Array(n + N_ACCENT);
	const byDot = Array.from({ length: n }, (_, s) => s).sort(
		(a, b) => poolDot(a, n) - poolDot(b, n),
	);
	for (const [rank, s] of byDot.entries()) lane[s] = rank % LANES;
	for (let j = n; j < n + N_ACCENT; j++) lane[j] = j % LANES;
	let quadCount = 0;
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
	 * it moved fast, a streak as wide that lays the same ink. A dot that
	 * `wrapped` to the start of its strand jumped rather than moved, and stays
	 * a square. `scale` is the projection's, as in camera.ts project().
	 */
	const put = (u: Uniforms, j: number, decay: number, scale: number, wrapped: boolean): void => {
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
		const len = wrapped ? 0 : streak(dist, dt, scale, u.dpr);
		if (len > 0) {
			// A butt-capped bar from half a side ahead of the dot to len behind it.
			const alpha = ((sh.a * side) / (side + len)) * u.fade;
			const band = Math.min(
				BANDS - 1,
				Math.max(0, Math.round(Math.log(alpha / BAND_MIN) / BAND_STEP)),
			);
			const half = (0.5 * side * alpha) / (BAND_ALPHA[band] as number);
			const ux = mx / dist;
			const uy = my / dist;
			const hx = x + ux * side * 0.5;
			const hy = y + uy * side * 0.5;
			const tx = x - ux * (len + side * 0.5);
			const ty = y - uy * (len + side * 0.5);
			const q = quadCount++;
			const c = q * 8;
			quads[c] = hx - uy * half;
			quads[c + 1] = hy + ux * half;
			quads[c + 2] = tx - uy * half;
			quads[c + 3] = ty + ux * half;
			quads[c + 4] = tx + uy * half;
			quads[c + 5] = ty - ux * half;
			quads[c + 6] = hx + uy * half;
			quads[c + 7] = hy - ux * half;
			const path = band * LANES + (lane[j] as number);
			nextQuad[q] = pathHead[path] as number;
			pathHead[path] = q;
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
			if (matcher.sync(u)) {
				heldWake.set(wake.subarray(0, n * 7));
				heldAnchors.set(anchors);
				for (let s = 0; s < n; s++) {
					const from = pairs.src[s] as number;
					for (let k = 0; k < 7; k++) wake[s * 7 + k] = heldWake[from * 7 + k] as number;
					anchors[s] = heldAnchors[from] as number;
				}
			}
			dt = settle ? 0 : u.dt;
			settle = false;
			ease = focusEase(dt);
			const decay = Math.exp(-WAKE_W0 * dt);
			const scale = Math.min(u.resW, u.resH) * 0.3;
			ctx.clearRect(0, 0, u.resW, u.resH);
			// One colour per frame; dots vary only in alpha.
			ctx.fillStyle = `rgb(${Math.round(u.inkR * 255)},${Math.round(u.inkG * 255)},${Math.round(u.inkB * 255)})`;
			quadCount = 0;
			pathHead.fill(-1);
			const gain = inkGain(u.inkR, u.inkG, u.inkB);
			const night = inkNight(u.inkR, u.inkG, u.inkB);
			const dotR = u.dotR * Math.sqrt(N / n);
			for (let s = 0; s < n; s++) {
				const i = poolDot(s, n);
				const t = flightT(i, u.fromObj, u.toObj, u.morphT, u.morphPhase, tmp);
				// the dot of the old object it leaves from
				const src = t < 1 ? poolDot(pairs.src[s] as number, n) : i;
				// Until it lands, the dot's strands count laps from the phase its
				// morph began at, so it flies between the places it was paired on.
				const anchor = strandAnchor(t, u.phase, u.morphPhase);
				const before = anchors[s] as number;
				anchors[s] = anchor;
				const wrapped = strandWrapped(i, src, u.fromObj, u.toObj, t, anchor, before);
				evalPoint(i, src, u.fromObj, u.toObj, t, u.phase, anchor, p, tmp);
				evalPoint(i, src, u.fromObj, u.toObj, t, u.phase + TANGENT_EPS, anchor, ahead, tmp);
				let dx = ahead.x - p.x;
				let dy = ahead.y - p.y;
				let dz = ahead.z - p.z;
				if (dx * dx + dy * dy + dz * dz > WRAP_SQ) {
					evalPoint(i, src, u.fromObj, u.toObj, t, u.phase - TANGENT_EPS, anchor, ahead, tmp);
					dx = p.x - ahead.x;
					dy = p.y - ahead.y;
					dz = p.z - ahead.z;
				}
				rotate(f, dx, dy, dz, tan);
				strand(tan.x, tan.y, tan.z, st);
				project(p, f, pr);
				focus(u, s, focusTarget(i, src, u.fromObj, u.toObj, t, u.phase, u.focus, anchor));
				shade(p.a * em.a, pr.depth, st.diff, st.spec, gain, night, dotR, sh);
				sh.r *= em.r;
				put(u, s, decay, scale, wrapped);
			}
			// A vertex has no strand; light it as one seen end-on. Hidden accents
			// still advance, as on the GPU, so none returns with a stale streak.
			strand(0, 0, 1, st);
			for (const [j, v] of ICO_VERTS.entries()) {
				p.x = v[0];
				p.y = v[1];
				p.z = v[2];
				p.a =
					ACCENT_ALPHA * accentWeight(j, u.fromObj, u.toObj, u.morphT, pairs.leave[j] as number);
				project(p, f, pr);
				focus(u, n + j, u.focus.obj === 1 && u.focus.vertex === j ? 1 : 0);
				shade(p.a * em.a, pr.depth, st.diff, st.spec, gain, night, u.dotR * ACCENT_SIZE, sh);
				sh.r *= em.r;
				put(u, n + j, decay, scale, false);
			}
			for (let path = 0; path < BANDS * LANES; path++) {
				let q = pathHead[path] as number;
				if (q < 0) continue;
				ctx.globalAlpha = BAND_ALPHA[Math.floor(path / LANES)] as number;
				ctx.beginPath();
				for (; q >= 0; q = nextQuad[q] as number) {
					const o = q * 8;
					ctx.moveTo(quads[o] as number, quads[o + 1] as number);
					ctx.lineTo(quads[o + 2] as number, quads[o + 3] as number);
					ctx.lineTo(quads[o + 4] as number, quads[o + 5] as number);
					ctx.lineTo(quads[o + 6] as number, quads[o + 7] as number);
					ctx.closePath();
				}
				ctx.fill();
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
