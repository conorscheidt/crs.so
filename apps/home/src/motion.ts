/**
 * Every duration, easing and motion token on the site. The clock, sim, cursor,
 * Lenis and the CSS custom properties all read from here.
 */
export const MOTION = {
	/** Section morph duration (s); the object and the nav dot move together. */
	morph: 0.85,
	/** The site's one easing, as cubic-bezier() control points; the CSS uses the same. */
	curve: [0.22, 1, 0.36, 1],
	/**
	 * Panel handoff (ms): the outgoing panel lifts out over `leave`, the incoming
	 * one waits `delay` and settles over `arrive`. The .panel CSS mirrors these.
	 */
	panel: { leave: 140, delay: 120, arrive: 220 },
	/**
	 * Arriving titles dry from SOFT 64 over `ms` (mirrored in .drying), `stagger`
	 * apart, at most `count` of them.
	 */
	dry: { ms: 600, stagger: 30, count: 6 },
	/** Interrupted jobs speed up by this factor instead of snapping. */
	interruptAccel: 3,
	/**
	 * Time constant (s) of that speed-up. Jumping to full speed in one frame
	 * would triple every moving dot's velocity at once, which reads as a lurch.
	 */
	interruptRamp: 0.06,
	/** Cursor ring radius (CSS px). */
	cursorR: 7,
	/** Lenis wheel smoothing; lower is a longer glide (0.18 felt stiff). */
	scrollLerp: 0.13,
	/** Breathing room above an anchor target after an in-page jump, in px. */
	anchorInset: 28,
	/** Micro-interaction tokens (ms). */
	hover: { ms: 120 },
	press: { ms: 90 },
	/** Sim dot fade-in after init (ms). */
	budget: { simFade: 300 },
} as const;

export interface Curve {
	/** Eased progress at time u in [0, 1]; flat outside it. */
	at: (u: number) => number;
	/** d(progress)/du at time u; 0 outside [0, 1]. */
	slope: (u: number) => number;
}

/**
 * A CSS cubic-bezier() timing function, solved to float precision: Newton's
 * method on x(s) = u, falling back to bisection where x(s) is too flat for
 * Newton to be trusted. The control points' x must lie in [0, 1], as in CSS.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Curve {
	// Power-basis coefficients: x(s) = ((ax·s + bx)·s + cx)·s, likewise y.
	const cx = 3 * x1;
	const bx = 3 * (x2 - x1) - cx;
	const ax = 1 - cx - bx;
	const cy = 3 * y1;
	const by = 3 * (y2 - y1) - cy;
	const ay = 1 - cy - by;
	const x = (s: number): number => ((ax * s + bx) * s + cx) * s;
	const y = (s: number): number => ((ay * s + by) * s + cy) * s;
	const dx = (s: number): number => (3 * ax * s + 2 * bx) * s + cx;
	const dy = (s: number): number => (3 * ay * s + 2 * by) * s + cy;
	const EPS = 1e-12;

	/** The curve parameter s at which x(s) = u, for u in [0, 1]. */
	const solve = (u: number): number => {
		let s = u;
		for (let i = 0; i < 8; i++) {
			const err = x(s) - u;
			if (Math.abs(err) < EPS) return s;
			const d = dx(s);
			if (Math.abs(d) < 1e-6) break;
			s -= err / d;
		}
		// x(s) rises monotonically from 0 to 1, so halving always closes in.
		let lo = 0;
		let hi = 1;
		s = u;
		for (let i = 0; i < 64; i++) {
			const err = x(s) - u;
			if (Math.abs(err) < EPS) break;
			if (err > 0) hi = s;
			else lo = s;
			s = (lo + hi) / 2;
		}
		return s;
	};

	return {
		at(u) {
			if (!(u > 0)) return 0;
			if (u >= 1) return 1;
			return y(solve(u));
		},
		slope(u) {
			if (!(u >= 0 && u <= 1)) return 0;
			const s = solve(u);
			const d = dx(s);
			if (d > EPS) return dy(s) / d;
			// x stands still here, so the curve is vertical, or flat if y does too.
			return Math.sign(dy(s)) * Number.POSITIVE_INFINITY || 0;
		},
	};
}

/** The site curve. Anything that rides the section morph eases on it. */
export const siteCurve: Curve = cubicBezier(...MOTION.curve);
export const ease = siteCurve.at;
