/**
 * The cursor: a ring that lags slightly behind the pointer, stretched along
 * the direction of travel by the lag and settling round at rest. It leans a
 * few pixels toward the nearest interactable and changes mode by what it is
 * over: swell on interactives, ring+dot for grabbable figure handles, small
 * over text fields. Under prefers-reduced-motion the ring stays (native
 * cursors are hidden) but follows rigidly: no lag, no stretch, no lean.
 * Ring diameter = 2 × cursorR, the same token the sim dimple uses.
 */
import type { Clock } from "./clock";
import { MOTION } from "./motion";

const REACH = 150;
const LEAN_MAX = 5;
const STRETCH_MAX = 0.42;
const INTERACTIVE = "a, button, [role=button], label, summary, .tag, [data-fig-mount]";

export function initCursor(clock: Clock): void {
	if (!matchMedia("(pointer: fine)").matches) return;
	const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

	document.documentElement.classList.add("no-native-cursor");
	const r = MOTION.cursorR;
	const ring = document.createElement("div");
	ring.id = "cursor";
	ring.setAttribute("aria-hidden", "true");
	ring.innerHTML = `<svg width="${2 * r + 2}" height="${2 * r + 2}" viewBox="0 0 ${2 * r + 2} ${2 * r + 2}"><circle cx="${r + 1}" cy="${r + 1}" r="${r}" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><circle class="dot" cx="${r + 1}" cy="${r + 1}" r="1.8" fill="currentColor"/></svg>`;
	document.body.appendChild(ring);
	const svg = ring.querySelector("svg") as SVGSVGElement;

	let tx = -100;
	let ty = -100;
	let x = -100;
	let y = -100;
	let leanX = 0;
	let leanY = 0;
	let shown = false;

	// Interactable centres, refreshed lazily since pages mutate (panels, chips).
	// Never refreshed mid-scroll: the rect reads would force layout every tick.
	let targets: { x: number; y: number }[] = [];
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
		targets = [...document.querySelectorAll<HTMLElement>(INTERACTIVE)]
			.filter((el) => el.offsetParent !== null)
			.map((el) => {
				const b = el.getBoundingClientRect();
				return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
			});
		staleAt = performance.now() + 400;
	};

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
	document.addEventListener(
		"pointermove",
		(ev) => {
			// mode follows what's under the pointer on every move, since figures flip
			// [data-cursor-mode] while the pointer stays on one canvas
			const el = ev.target as HTMLElement;
			const mode = el.closest<HTMLElement>("[data-cursor-mode]")?.dataset.cursorMode;
			ring.classList.toggle("grabm", mode === "grab");
			ring.classList.toggle("big", !mode && Boolean(el.closest(INTERACTIVE)));
			ring.classList.toggle("quiet", Boolean(el.closest("input, textarea, select, .cm-editor")));
		},
		{ passive: true },
	);

	if (reduced) {
		// rigid follow: the same ring, without physics
		document.addEventListener(
			"pointermove",
			(ev) => {
				ring.style.translate = `${ev.clientX - r - 1}px ${ev.clientY - r - 1}px`;
			},
			{ passive: true },
		);
		return;
	}

	clock.subscribe((t, dt) => {
		if (t > staleAt && t - lastScroll > 200) refresh();
		const k = Math.min(1, dt * 22);
		x += (tx - x) * k;
		y += (ty - y) * k;

		// droplet: the pull of the lag stretches the ring along travel,
		// squashes it across, and settles round once the pointer rests
		const px = tx - x;
		const py = ty - y;
		const pull = Math.min(1, Math.hypot(px, py) / 90);
		const s = STRETCH_MAX * pull * pull * (3 - 2 * pull);
		svg.style.rotate = `${Math.atan2(py, px)}rad`;
		svg.style.scale = `${1 + s} ${1 - s * 0.45}`;

		// nearest interactable within reach: the ring leans toward it
		let best: { x: number; y: number } | null = null;
		let bestD = REACH;
		for (const p of targets) {
			const d = Math.hypot(p.x - x, p.y - y);
			if (d < bestD) {
				bestD = d;
				best = p;
			}
		}
		// a few px of lean toward what is in reach
		let lx = 0;
		let ly = 0;
		if (best) {
			const a = Math.atan2(best.y - y, best.x - x);
			const lean = (1 - bestD / REACH) * LEAN_MAX;
			lx = Math.cos(a) * lean || 0;
			ly = Math.sin(a) * lean || 0;
		}
		const lk = Math.min(1, dt * 10);
		leanX += (lx - leanX) * lk;
		leanY += (ly - leanY) * lk;
		ring.style.translate = `${x - r - 1 + leanX}px ${y - r - 1 + leanY}px`;
	});
}
