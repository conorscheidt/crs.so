// The cursor ring. Input samples are buffered with their timestamps and the
// ring follows a point resampled a few milliseconds in the past, so it moves
// by an even amount every frame however input and display rates beat against
// each other. On top of that: exponential follow, a continuous magnetic lean
// toward interactive elements, a hover tighten and a motion stretch. Reduced
// motion gets a rigid ring. The native cursor is hidden in global.css with a
// transparent cursor image; nothing here should set style.cursor.
import type { Clock } from "./clock";
import { MOTION } from "./motion";

/** Seconds for the ring to close 90% of the distance to the resampled pointer. */
const SETTLE = 0.025;
const FOLLOW = Math.LN10 / SETTLE;
/** Rates for the magnetic lean and the hover tightening, per second. */
const LEAN = 12;
const GRIP_RATE = 16;

/** How far a target reaches for the ring, and the most it can pull, in px. */
const REACH = 120;
const PULL_MAX = 6;
const STRETCH_MAX = 0.4;
/** Hover: radius reduction and extra stroke weight, in px. */
const GRIP = 1.1;
const GRIP_WEIGHT = 0.25;
/** The compositor-run follow used where rAF is capped below the display rate. */
const GLIDE_MS = 80;
const GLIDE_CURVE = [0.22, 1, 0.36, 1] as const;

const INTERACTIVE = [
	"a[href]",
	"button",
	"[role=button]",
	"label",
	"summary",
	"input",
	"textarea",
	"select",
	".tag",
	".chip",
	".xref",
	".repo",
	".commit",
	"[data-fig-mount]",
	"[data-cursor-target]",
].join(",");

/** 1 − e^(−rate·dt): the same feel at 30, 60, 120 or 144 Hz. */
const ease = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);
const smoothstep = (a: number, b: number, v: number): number => {
	const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
	return t * t * (3 - 2 * t);
};

/**
 * A CSS cubic-bezier() timing function: progress in [0, 1] to eased output.
 * Tabulated once and inverted by bisection; x(s) is monotonic for any valid
 * curve, and 64 segments keep the error well under a hundredth.
 */
export function bezier(x1: number, y1: number, x2: number, y2: number): (u: number) => number {
	const n = 64;
	const xs = new Float64Array(n + 1);
	const ys = new Float64Array(n + 1);
	for (let i = 0; i <= n; i++) {
		const s = i / n;
		const a = 3 * (1 - s) * (1 - s) * s;
		const b = 3 * (1 - s) * s * s;
		xs[i] = a * x1 + b * x2 + s * s * s;
		ys[i] = a * y1 + b * y2 + s * s * s;
	}
	return (u) => {
		if (!(u > 0)) return 0;
		if (u >= 1) return 1;
		let lo = 0;
		let hi = n;
		while (hi - lo > 1) {
			const mid = (lo + hi) >> 1;
			if ((xs[mid] ?? 0) <= u) lo = mid;
			else hi = mid;
		}
		const x0 = xs[lo] ?? 0;
		const y0 = ys[lo] ?? 0;
		const f = (u - x0) / ((xs[hi] ?? 1) - x0);
		return y0 + ((ys[hi] ?? 1) - y0) * f;
	};
}

/**
 * Where a CSS transition is drawing a point it keeps being retargeted to. Each
 * retarget starts a fresh transition from wherever the last one had reached,
 * which is what the browser does when a transitioned value changes mid-flight.
 */
export interface Glide {
	at: (t: number, out: [number, number]) => void;
	/** The transitioned value changed to (x, y) at time t, ms. */
	to: (t: number, x: number, y: number) => void;
	/** No transition: the value is drawn where it is set. */
	jump: (x: number, y: number) => void;
}

export function glide(ms: number, curve: (u: number) => number): Glide {
	let fx = 0;
	let fy = 0;
	let tx = 0;
	let ty = 0;
	let t0 = Number.NEGATIVE_INFINITY;
	const p: [number, number] = [0, 0];
	const at = (t: number, out: [number, number]): void => {
		const e = curve((t - t0) / ms);
		out[0] = fx + (tx - fx) * e;
		out[1] = fy + (ty - fy) * e;
	};
	return {
		at,
		to(t, x, y) {
			at(t, p);
			[fx, fy] = p;
			tx = x;
			ty = y;
			t0 = t;
		},
		jump(x, y) {
			fx = x;
			fy = y;
			tx = x;
			ty = y;
			t0 = Number.NEGATIVE_INFINITY;
		},
	};
}

/** Wrap a DOM write so it only runs when the value differs from the last one. */
const latch = (write: (value: string) => void): ((value: string) => void) => {
	let last = "";
	return (value) => {
		if (value === last) return;
		last = value;
		write(value);
	};
};

/**
 * Timestamped pointer samples in a fixed ring buffer. `at(q)` interpolates the
 * pointer position at time q, which is what lets the ring move smoothly between
 * input events instead of jumping whenever one lands.
 */
export class Trail {
	// enough for 50 ms of a 1 kHz mouse's coalesced samples
	static readonly SIZE = 64;
	/** Samples further apart than this are treated as separate gestures. */
	static readonly GAP = 50;
	private readonly t = new Float64Array(Trail.SIZE);
	private readonly x = new Float64Array(Trail.SIZE);
	private readonly y = new Float64Array(Trail.SIZE);
	private n = 0;
	private head = 0;
	/** Smoothed interval between samples, ms. */
	interval = 8;

	clear(): void {
		this.n = 0;
	}

	get size(): number {
		return this.n;
	}

	private idx(back: number): number {
		return (this.head - 1 - back + Trail.SIZE * 2) % Trail.SIZE;
	}

	push(t: number, x: number, y: number): void {
		if (this.n > 0) {
			const dt = t - (this.t[this.idx(0)] ?? 0);
			if (dt > Trail.GAP) this.n = 0;
			else if (dt <= 0) {
				// same timestamp: keep the newer position
				const i = this.idx(0);
				this.x[i] = x;
				this.y[i] = y;
				return;
			} else this.interval = Math.min(34, Math.max(4, this.interval + (dt - this.interval) * 0.2));
		}
		this.t[this.head] = t;
		this.x[this.head] = x;
		this.y[this.head] = y;
		this.head = (this.head + 1) % Trail.SIZE;
		this.n = Math.min(Trail.SIZE, this.n + 1);
	}

	newest(): { t: number; x: number; y: number } {
		const i = this.idx(0);
		return { t: this.t[i] ?? 0, x: this.x[i] ?? 0, y: this.y[i] ?? 0 };
	}

	/** Position at time q, interpolated between the samples either side of it. */
	at(q: number, out: [number, number]): void {
		if (this.n === 0) return;
		let j = this.idx(0);
		if (q >= (this.t[j] ?? 0)) {
			out[0] = this.x[j] ?? 0;
			out[1] = this.y[j] ?? 0;
			return;
		}
		for (let b = 1; b < this.n; b++) {
			const i = this.idx(b);
			const ti = this.t[i] ?? 0;
			if (ti <= q) {
				const tj = this.t[j] ?? 0;
				const f = tj > ti ? (q - ti) / (tj - ti) : 1;
				out[0] = (this.x[i] ?? 0) + ((this.x[j] ?? 0) - (this.x[i] ?? 0)) * f;
				out[1] = (this.y[i] ?? 0) + ((this.y[j] ?? 0) - (this.y[i] ?? 0)) * f;
				return;
			}
			j = i;
		}
		out[0] = this.x[j] ?? 0;
		out[1] = this.y[j] ?? 0;
	}

	/** Least-squares velocity over the last `window` ms, px/ms. */
	velocity(window: number, out: [number, number]): void {
		out[0] = 0;
		out[1] = 0;
		if (this.n < 2) return;
		const t0 = this.t[this.idx(0)] ?? 0;
		let m = 0;
		let st = 0;
		let sx = 0;
		let sy = 0;
		let stt = 0;
		let stx = 0;
		let sty = 0;
		for (let b = 0; b < this.n; b++) {
			const i = this.idx(b);
			const t = (this.t[i] ?? 0) - t0;
			if (t < -window) break;
			const x = this.x[i] ?? 0;
			const y = this.y[i] ?? 0;
			m++;
			st += t;
			sx += x;
			sy += y;
			stt += t * t;
			stx += t * x;
			sty += t * y;
		}
		const den = m * stt - st * st;
		if (m < 2 || den <= 1e-9) return;
		out[0] = (m * stx - st * sx) / den;
		out[1] = (m * sty - st * sy) / den;
	}
}

export interface Pull {
	x: number;
	y: number;
	/** Distance to the nearest target, or Infinity when nothing is in reach. */
	d: number;
}

/**
 * Lean toward nearby targets as one continuous field: each rect pulls toward
 * its nearest point with a weight that is zero on its border, peaks about
 * 10 px out and fades to zero at `reach`. Pulls from opposite sides cancel
 * smoothly, so the ring never jumps at an edge or in the gap between targets.
 */
export function magnetism(
	x: number,
	y: number,
	rects: readonly { left: number; top: number; right: number; bottom: number }[],
	reach = REACH,
	max = PULL_MAX,
): Pull {
	let sx = 0;
	let sy = 0;
	let sw = 0;
	let near = Number.POSITIVE_INFINITY;
	for (const b of rects) {
		const nx = Math.max(b.left, Math.min(x, b.right));
		const ny = Math.max(b.top, Math.min(y, b.bottom));
		const d = Math.hypot(nx - x, ny - y);
		if (d >= reach) continue;
		near = Math.min(near, d);
		if (d < 1e-6) continue;
		const w = smoothstep(0, 10, d) * (1 - d / reach) ** 2;
		sx += (w * (nx - x)) / d;
		sy += (w * (ny - y)) / d;
		sw += w;
	}
	if (near === Number.POSITIVE_INFINITY) return { x: 0, y: 0, d: near };
	const k = max / Math.max(1, sw);
	return { x: sx * k, y: sy * k, d: near };
}

/** Safari (and every iOS browser, all WebKit): rAF holds at 60 Hz on faster displays. */
export const safari = (): boolean =>
	/Safari\//.test(navigator.userAgent) && !/Chrom(e|ium)\//.test(navigator.userAgent);

/** Where the ring is drawn this frame, for anything that should agree with it. */
export const ring = { x: 0, y: 0, shown: false, live: false };

let invalidate = (): void => {};
/** Re-measure lean targets after the page changes under the cursor. */
export const invalidateTargets = (): void => invalidate();

export function initCursor(clock: Clock): void {
	if (!matchMedia("(pointer: fine)").matches) return;
	const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

	const root = document.documentElement;
	root.classList.add("no-native-cursor");
	const r = MOTION.cursorR;
	const box = 2 * r + 2;
	const el = document.createElement("div");
	el.id = "cursor";
	el.setAttribute("aria-hidden", "true");
	el.innerHTML = `<svg width="${box}" height="${box}" viewBox="0 0 ${box} ${box}"><circle cx="${r + 1}" cy="${r + 1}" r="${r}" fill="none" stroke="currentColor" stroke-width="1"/></svg>`;
	document.body.append(el);
	const svg = el.firstElementChild as SVGSVGElement;
	const circle = svg.firstElementChild as SVGCircleElement;
	ring.live = true;

	const trail = new Trail();
	const p: [number, number] = [-100, -100];
	const v: [number, number] = [0, 0];
	let x = -100;
	let y = -100;
	let over = false;

	const record = (ev: PointerEvent): void => {
		const all = ev.getCoalescedEvents?.();
		for (const s of all?.length ? all : [ev]) trail.push(s.timeStamp, s.clientX, s.clientY);
	};
	const show = (ev: PointerEvent): void => {
		if (ring.shown) return;
		ring.shown = true;
		trail.clear();
		trail.push(ev.timeStamp, ev.clientX, ev.clientY);
		x = ev.clientX;
		y = ev.clientY;
		el.classList.add("on");
	};

	document.addEventListener(
		"pointermove",
		(ev) => {
			show(ev);
			record(ev);
		},
		{ passive: true },
	);
	// Hover comes from the browser's own hit test, so the ring tightens on
	// exactly the element a click would reach.
	document.addEventListener(
		"pointerover",
		(ev) => {
			over = ev.target instanceof Element && ev.target.closest(INTERACTIVE) !== null;
		},
		{ passive: true },
	);
	document.addEventListener("pointerdown", () => el.classList.add("press"));
	document.addEventListener("pointerup", () => el.classList.remove("press"));
	root.addEventListener("pointerleave", () => {
		ring.shown = false;
		el.classList.remove("on");
	});
	// Re-entering from the browser chrome doesn't always fire a pointermove.
	root.addEventListener("pointerenter", show);

	// Each setter touches the DOM only when its value changes, so a resting
	// ring costs nothing per frame. Position goes on `translate`, not
	// `transform`: the press `scale` would otherwise scale the offset too.
	//
	// When the compositor runs the follow (below), the ring is drawn partway
	// through a transition rather than at the value set, so `ring` publishes
	// the modelled drawn point for anything that has to line up with it.
	let composited = false;
	const drawnAt = glide(GLIDE_MS, bezier(...GLIDE_CURVE));
	const drawn: [number, number] = [0, 0];
	let placed = "";
	const place = (cx: number, cy: number, t: number): void => {
		const val = `${(cx - r - 1).toFixed(2)}px ${(cy - r - 1).toFixed(2)}px`;
		if (val !== placed) {
			placed = val;
			el.style.translate = val;
			if (composited) drawnAt.to(t, cx, cy);
		}
		if (!composited) drawnAt.jump(cx, cy);
		drawnAt.at(t, drawn);
		ring.x = drawn[0];
		ring.y = drawn[1];
	};

	if (reduced) {
		clock.subscribe((t) => {
			if (!ring.shown) return;
			const s = trail.newest();
			place(s.x, s.y, t);
			el.classList.toggle("over", over);
		});
		return;
	}

	// Lean targets: re-measured when something may have moved them, never on
	// a timer. Hidden panels and rows scrolled out of their list don't count.
	let rects: DOMRect[] = [];
	let stale = true;
	let measuredAt = 0;
	invalidate = () => {
		stale = true;
	};
	addEventListener("scroll", invalidate, { passive: true, capture: true });
	addEventListener("resize", invalidate, { passive: true });
	const measure = (): void => {
		const clips = new Map<Element, DOMRect>();
		rects = [];
		for (const t of document.querySelectorAll(INTERACTIVE)) {
			// Mid-crossfade the outgoing panel still reads as visible and the
			// incoming one as transparent; only the current section counts.
			const panel = t.closest<HTMLElement>(".panel");
			if (panel && panel.dataset.panel !== panel.closest<HTMLElement>(".hub")?.dataset.section)
				continue;
			// Inside a panel the section test above decides; the incoming panel is
			// still transparent when it's measured.
			if (t.checkVisibility?.({ opacityProperty: !panel, visibilityProperty: true }) === false)
				continue;
			let b = t.getBoundingClientRect();
			const wrap = t.closest("[data-scroll]");
			if (wrap) {
				let c = clips.get(wrap);
				if (!c) {
					c = wrap.getBoundingClientRect();
					clips.set(wrap, c);
				}
				const left = Math.max(b.left, c.left);
				const top = Math.max(b.top, c.top);
				const right = Math.min(b.right, c.right);
				const bottom = Math.min(b.bottom, c.bottom);
				if (right <= left || bottom <= top) continue;
				b = new DOMRect(left, top, right - left, bottom - top);
			}
			rects.push(b);
		}
	};

	const setShape = latch((val) => {
		svg.style.transform = val;
	});
	const setR = latch((val) => circle.setAttribute("r", val));
	const setWeight = latch((val) => circle.setAttribute("stroke-width", val));
	const setTransition = latch((val) => {
		el.style.transition = val;
	});
	const base = "scale 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease";
	let pullX = 0;
	let pullY = 0;
	let grip = 0;
	let vx = 0;
	let vy = 0;
	let angle = 0;
	let frame = 1 / 120;
	// Only Safari holds rAF below the display rate; elsewhere a slow frame
	// means a slow display, where interpolating would only add latency.
	const capped = safari();
	const follow = `${base}, translate ${GLIDE_MS}ms cubic-bezier(${GLIDE_CURVE.join(", ")})`;

	clock.subscribe((t, dt) => {
		// Where rAF is held near 60 Hz on a faster display (Safari's default on
		// ProMotion), the follow moves to a CSS transition: the compositor runs
		// it at the display's rate, which no 60 Hz script can.
		frame += (dt - frame) * 0.05;
		composited = capped && frame > 0.014;
		setTransition(composited ? follow : base);

		if (!ring.shown || trail.size === 0) return;
		if (stale && t - measuredAt > 50) {
			stale = false;
			measuredAt = t;
			measure();
		}

		// Sample the pointer slightly in the past, where there are samples on
		// both sides, then lead by the measured velocity to win the delay back.
		// The lead fades as the newest sample ages, so it never overshoots a stop.
		const delay = Math.min(18, Math.max(8, 1.25 * trail.interval));
		trail.at(t - delay, p);
		trail.velocity(30, v);
		const lead = Math.min(delay, 8) * Math.exp(-(t - trail.newest().t) / 15);
		const tx = p[0] + v[0] * lead;
		const ty = p[1] + v[1] * lead;

		const k = composited ? 1 : ease(FOLLOW, dt);
		const px = x;
		const py = y;
		x += (tx - x) * k;
		y += (ty - y) * k;

		// Stretch along the ring's own smoothed velocity; round at rest.
		const kv = ease(1 / 0.03, dt);
		vx += ((x - px) / dt - vx) * kv;
		vy += ((y - py) / dt - vy) * kv;
		const speed = Math.hypot(vx, vy);
		if (speed > 150) angle = Math.atan2(vy, vx);
		const s = STRETCH_MAX * smoothstep(0, 2500, speed);
		setShape(
			s < 0.02
				? "none"
				: `rotate(${angle.toFixed(3)}rad) scale(${(1 + s).toFixed(3)}, ${(1 - s * 0.45).toFixed(3)})`,
		);

		const pull = magnetism(tx, ty, rects);
		const pk = ease(LEAN, dt);
		pullX += (pull.x - pullX) * pk;
		pullY += (pull.y - pullY) * pk;
		place(x + pullX, y + pullY, t);

		grip += ((over ? 1 : 0) - grip) * ease(GRIP_RATE, dt);
		setR((r - GRIP * grip).toFixed(2));
		setWeight((1 + GRIP_WEIGHT * grip).toFixed(2));
		el.classList.toggle("over", grip > 0.5);
	});
}
