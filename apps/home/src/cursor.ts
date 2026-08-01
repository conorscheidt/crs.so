/**
 * The cursor: a single ring, one size, no mode variants. A large ring made
 * small targets (the year's week segments) hard to aim at.
 *
 *   · droplet lag: the gap stretches the ring along travel, and it settles
 *     round when the pointer rests
 *   · magnetism toward the nearest point of the nearest interactable, so a
 *     wide row attracts along its whole edge rather than from its centre.
 *     Only the ring leans; the pointer never moves. Every interactive element
 *     is in one selector, so the pull is uniform.
 *
 * Under prefers-reduced-motion the ring stays (native cursors are hidden
 * site-wide) but follows rigidly: no lag, no stretch, no magnetism.
 */
import type { Clock } from "./clock";
import { MOTION } from "./motion";

/** How far a target can reach for the ring, in css px. */
const REACH = 120;
/** Maximum lean toward a target. Kept subtle. */
const PULL_MAX = 6;
const STRETCH_MAX = 0.4;

/**
 * Every interactive surface, in one place. Anything clickable, draggable, or
 * typable belongs here so the magnetism applies uniformly across the site.
 */
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

export interface Pull {
	x: number;
	y: number;
	/** distance to the nearest target, or Infinity when nothing is in reach */
	d: number;
}

/**
 * Magnetism as a pure function, so it can be tested. Pulls toward the nearest
 * point of the nearest rect (a wide row attracts along its whole edge), easing
 * in quadratically with closeness, capped at PULL_MAX. Returns a zero vector
 * when nothing is within REACH.
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
	const dx = bx - x;
	const dy = by - y;
	const len = Math.hypot(dx, dy) || 1;
	return { x: (dx / len) * strength, y: (dy / len) * strength, d: bd };
}

export function initCursor(clock: Clock): void {
	if (!matchMedia("(pointer: fine)").matches) return;
	const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

	document.documentElement.classList.add("no-native-cursor");
	const r = MOTION.cursorR;
	const ring = document.createElement("div");
	ring.id = "cursor";
	ring.setAttribute("aria-hidden", "true");
	ring.innerHTML = `<svg width="${2 * r + 2}" height="${2 * r + 2}" viewBox="0 0 ${2 * r + 2} ${2 * r + 2}"><circle cx="${r + 1}" cy="${r + 1}" r="${r}" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>`;
	document.body.appendChild(ring);
	const svg = ring.querySelector("svg") as SVGSVGElement;

	let tx = -100;
	let ty = -100;
	let x = -100;
	let y = -100;
	let pullX = 0;
	let pullY = 0;
	let shown = false;

	document.addEventListener("pointermove", (ev) => {
		tx = ev.clientX;
		ty = ev.clientY;
		if (!shown) {
			shown = true;
			x = tx;
			y = ty;
			ring.classList.add("on");
		}
	});
	document.addEventListener("pointerdown", () => ring.classList.add("press"));
	document.addEventListener("pointerup", () => ring.classList.remove("press"));
	document.documentElement.addEventListener("pointerleave", () => {
		shown = false;
		ring.classList.remove("on");
	});

	if (reduced) {
		document.addEventListener(
			"pointermove",
			(ev) => {
				ring.style.translate = `${ev.clientX - r - 1}px ${ev.clientY - r - 1}px`;
			},
			{ passive: true },
		);
		return;
	}

	// Target rects, refreshed lazily since pages mutate (panels, chips, results).
	// Never refreshed mid-scroll: the reads would force layout every frame.
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
	const refresh = (): void => {
		rects = [...document.querySelectorAll<HTMLElement>(INTERACTIVE)]
			.filter((el) => el.getClientRects().length > 0)
			.map((el) => el.getBoundingClientRect());
		staleAt = performance.now() + 400;
	};

	clock.subscribe((t, dt) => {
		if (t > staleAt && t - lastScroll > 200) refresh();
		const k = Math.min(1, dt * 22);
		x += (tx - x) * k;
		y += (ty - y) * k;

		// droplet: the lag pulls the ring along travel and squashes it across
		const lagX = tx - x;
		const lagY = ty - y;
		const lag = Math.min(1, Math.hypot(lagX, lagY) / 90);
		const s = STRETCH_MAX * lag * lag * (3 - 2 * lag);
		svg.style.rotate = `${Math.atan2(lagY, lagX)}rad`;
		svg.style.scale = `${1 + s} ${1 - s * 0.45}`;

		// magnetism toward the nearest point of the nearest target
		const pull = magnetism(x, y, rects);
		const pk = Math.min(1, dt * 12);
		pullX += (pull.x - pullX) * pk;
		pullY += (pull.y - pullY) * pk;
		ring.style.translate = `${x - r - 1 + pullX}px ${y - r - 1 + pullY}px`;
	});
}
