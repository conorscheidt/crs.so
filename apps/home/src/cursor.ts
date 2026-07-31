/**
 * Compass cursor: a ring with a small gap that swings to point at the nearest
 * interactable within reach, while the ring leans a few pixels toward it. The
 * lean is cosmetic (the real pointer never moves) and capped small. Ring
 * diameter = 2 × cursorR, the same token the sim dimple uses. Fine pointers
 * only.
 */
import type { Clock } from "./clock";
import { MOTION } from "./motion";

const REACH = 150;
const LEAN_MAX = 5;
const GAP_FRACTION = 0.14;
const INTERACTIVE = "a, button, [role=button], label, summary, .tag, [data-fig-canvas]";

export function initCursor(clock: Clock): void {
	if (!matchMedia("(pointer: fine)").matches) return;
	if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

	document.documentElement.classList.add("no-native-cursor");
	const r = MOTION.cursorR;
	const c = 2 * Math.PI * r;
	const ring = document.createElement("div");
	ring.id = "cursor";
	ring.setAttribute("aria-hidden", "true");
	ring.innerHTML = `<svg width="${2 * r + 2}" height="${2 * r + 2}" viewBox="0 0 ${2 * r + 2} ${2 * r + 2}"><circle cx="${r + 1}" cy="${r + 1}" r="${r}" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><circle class="dot" cx="${r + 1}" cy="${r + 1}" r="1.8" fill="currentColor"/></svg>`;
	document.body.appendChild(ring);
	const arc = ring.querySelector("circle") as SVGCircleElement;

	let tx = -100;
	let ty = -100;
	let x = -100;
	let y = -100;
	let angle = 0;
	let gap = 0;
	let leanX = 0;
	let leanY = 0;
	let shown = false;

	// Interactable centres, refreshed lazily since pages mutate (panels, chips).
	let targets: { x: number; y: number }[] = [];
	let staleAt = 0;
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
	addEventListener(
		"scroll",
		() => {
			staleAt = 0;
		},
		{ passive: true },
	);

	clock.subscribe((t, dt) => {
		if (t > staleAt) refresh();
		const k = Math.min(1, dt * 22);
		x += (tx - x) * k;
		y += (ty - y) * k;

		// nearest interactable within reach; the compass gap points at it
		let best: { x: number; y: number } | null = null;
		let bestD = REACH;
		for (const p of targets) {
			const d = Math.hypot(p.x - x, p.y - y);
			if (d < bestD) {
				bestD = d;
				best = p;
			}
		}
		// full circle at rest; when something is in reach the gap opens toward
		// it and the ring leans a few px
		let lx = 0;
		let ly = 0;
		let gapTarget = 0;
		if (best) {
			const targetAngle = Math.atan2(best.y - y, best.x - x);
			let delta = targetAngle - angle;
			delta = ((delta + Math.PI) % (2 * Math.PI)) - Math.PI;
			if (delta < -Math.PI) delta += 2 * Math.PI;
			angle += delta * Math.min(1, dt * 9);
			const pull = (1 - bestD / REACH) * LEAN_MAX;
			lx = Math.cos(targetAngle) * pull || 0;
			ly = Math.sin(targetAngle) * pull || 0;
			gapTarget = GAP_FRACTION;
		}
		gap += (gapTarget - gap) * Math.min(1, dt * 8);
		const lk = Math.min(1, dt * 10);
		leanX += (lx - leanX) * lk;
		leanY += (ly - leanY) * lk;

		ring.style.translate = `${x - r - 1 + leanX}px ${y - r - 1 + leanY}px`;
		if (gap > 0.002) {
			// dasharray begins at 3 o'clock; the gap's centre sits (1 − gap/2)
			// of the way round; rotate so it lands on the target bearing
			arc.setAttribute("stroke-dasharray", `${(c * (1 - gap)).toFixed(2)} ${(c * gap).toFixed(2)}`);
			ring.style.rotate = `${((angle * 180) / Math.PI - (1 - gap / 2) * 360).toFixed(1)}deg`;
		} else {
			arc.removeAttribute("stroke-dasharray");
			ring.style.rotate = "0deg";
		}
	});
}
