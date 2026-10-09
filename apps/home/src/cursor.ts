// The cursor ring. It trails the pointer with frame-rate-independent
// exponential smoothing, leans toward the nearest interactive element, and
// tightens while the pointer is over one. Reduced motion gets a rigid ring.
// The native cursor is hidden in global.css with a transparent cursor image;
// nothing here should set style.cursor.
import type { Clock } from "./clock";
import { MOTION } from "./motion";

/** Seconds for the ring to close 90% of the distance to the pointer. */
const SETTLE = 0.04;
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
	".gitbrush",
	"[data-fig-mount]",
	"[data-cursor-target]",
].join(",");

/** 1 − e^(−rate·dt): the same feel at 30, 60, 120 or 144 Hz. */
const ease = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

/** Wrap a DOM write so it only runs when the value differs from the last one. */
const latch = (write: (value: string) => void): ((value: string) => void) => {
	let last = "";
	return (value) => {
		if (value === last) return;
		last = value;
		write(value);
	};
};

export interface Pull {
	x: number;
	y: number;
	/** Distance to the nearest target, or Infinity when nothing is in reach. */
	d: number;
}

/**
 * Lean toward the nearest point of the nearest rect, so a wide row attracts
 * along its whole edge. Quadratic in closeness, capped at `max`.
 */
export function magnetism(
	x: number,
	y: number,
	rects: readonly { left: number; top: number; right: number; bottom: number }[],
	reach = REACH,
	max = PULL_MAX,
): Pull {
	let bx = 0;
	let by = 0;
	let bd = reach;
	for (const b of rects) {
		const nx = Math.max(b.left, Math.min(x, b.right));
		const ny = Math.max(b.top, Math.min(y, b.bottom));
		const d = Math.hypot(nx - x, ny - y);
		if (d < bd) {
			bd = d;
			bx = nx;
			by = ny;
		}
	}
	if (bd >= reach) return { x: 0, y: 0, d: Number.POSITIVE_INFINITY };
	const closeness = 1 - bd / reach;
	const strength = closeness * closeness * max;
	const len = Math.hypot(bx - x, by - y) || 1;
	return { x: ((bx - x) / len) * strength, y: ((by - y) / len) * strength, d: bd };
}

export function initCursor(clock: Clock): void {
	if (!matchMedia("(pointer: fine)").matches) return;
	const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

	const root = document.documentElement;
	root.classList.add("no-native-cursor");
	const r = MOTION.cursorR;
	const box = 2 * r + 2;
	const ring = document.createElement("div");
	ring.id = "cursor";
	ring.setAttribute("aria-hidden", "true");
	ring.innerHTML = `<svg width="${box}" height="${box}" viewBox="0 0 ${box} ${box}"><circle cx="${r + 1}" cy="${r + 1}" r="${r}" fill="none" stroke="currentColor" stroke-width="1"/></svg>`;
	document.body.append(ring);
	const svg = ring.firstElementChild as SVGSVGElement;
	const circle = svg.firstElementChild as SVGCircleElement;

	// Real pointer, and the target the ring chases (the predicted pointer while
	// input is arriving).
	let px = -100;
	let py = -100;
	let movedAt = 0;
	let tx = px;
	let ty = py;
	let x = tx;
	let y = ty;
	let shown = false;
	let over = false;

	const show = (): void => {
		if (shown) return;
		shown = true;
		x = tx;
		y = ty;
		ring.classList.add("on");
	};

	document.addEventListener(
		"pointermove",
		(ev) => {
			px = ev.clientX;
			py = ev.clientY;
			movedAt = ev.timeStamp;
			// Aim at where the pointer is about to be, where the browser predicts it.
			const predicted = ev.getPredictedEvents?.().at(-1);
			tx = predicted?.clientX ?? px;
			ty = predicted?.clientY ?? py;
			show();
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
	document.addEventListener("pointerdown", () => ring.classList.add("press"));
	document.addEventListener("pointerup", () => ring.classList.remove("press"));
	root.addEventListener("pointerleave", () => {
		shown = false;
		ring.classList.remove("on");
	});
	// Re-entering from the browser chrome doesn't always fire a pointermove.
	root.addEventListener("pointerenter", (ev) => {
		px = ev.clientX;
		py = ev.clientY;
		tx = px;
		ty = py;
		show();
	});

	// Each setter touches the DOM only when its value changes, so a resting
	// ring costs nothing per frame. Position goes on `translate`, not
	// `transform`: the press `scale` would otherwise scale the offset too.
	const setPlace = latch((v) => {
		ring.style.translate = v;
	});
	const place = (cx: number, cy: number): void =>
		setPlace(`${(cx - r - 1).toFixed(2)}px ${(cy - r - 1).toFixed(2)}px`);

	if (reduced) {
		clock.subscribe(() => {
			place(px, py);
			ring.classList.toggle("over", over);
		});
		return;
	}

	// Target rects for the lean. Refreshed every 400 ms but never mid-scroll,
	// where the reads would force layout on every frame.
	let rects: DOMRect[] = [];
	let staleAt = 0;
	let lastScroll = 0;
	addEventListener(
		"scroll",
		() => {
			lastScroll = performance.now();
		},
		{ passive: true, capture: true },
	);
	const refresh = (now: number): void => {
		rects = [...document.querySelectorAll(INTERACTIVE)]
			.filter((el) => el.getClientRects().length > 0)
			.map((el) => el.getBoundingClientRect());
		staleAt = now + 400;
	};

	const setShape = latch((v) => {
		svg.style.transform = v;
	});
	const setR = latch((v) => circle.setAttribute("r", v));
	const setWeight = latch((v) => circle.setAttribute("stroke-width", v));
	let pullX = 0;
	let pullY = 0;
	let grip = 0;

	clock.subscribe((t, dt) => {
		if (!shown) return;
		if (t > staleAt && t - lastScroll > 200) refresh(t);
		// Once input stops, settle on the real pointer rather than the last prediction.
		if (t - movedAt > 50) {
			tx = px;
			ty = py;
		}

		const k = ease(FOLLOW, dt);
		x += (tx - x) * k;
		y += (ty - y) * k;

		// Stretch along the direction of travel; settles round at rest.
		const lagX = tx - x;
		const lagY = ty - y;
		const lag = Math.min(1, Math.hypot(lagX, lagY) / 90);
		const s = STRETCH_MAX * lag * lag * (3 - 2 * lag);
		const angle = Math.atan2(lagY, lagX).toFixed(3);
		setShape(
			s < 1e-3
				? "none"
				: `rotate(${angle}rad) scale(${(1 + s).toFixed(3)}, ${(1 - s * 0.45).toFixed(3)})`,
		);

		const pull = magnetism(x, y, rects);
		const pk = ease(LEAN, dt);
		pullX += (pull.x - pullX) * pk;
		pullY += (pull.y - pullY) * pk;
		place(x + pullX, y + pullY);

		grip += ((over ? 1 : 0) - grip) * ease(GRIP_RATE, dt);
		setR((r - GRIP * grip).toFixed(2));
		setWeight((1 + GRIP_WEIGHT * grip).toFixed(2));
		ring.classList.toggle("over", grip > 0.5);
	});
}
