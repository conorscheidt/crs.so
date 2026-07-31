/**
 * Circular cursor. Ring diameter = 2 × MOTION.cursorR, the same token the
 * sim's dimple uses, so the ring matches its interaction radius. Desktop fine
 * pointers only; absent on touch and under reduced motion. The native caret
 * stays in text inputs, where the ring recedes.
 */
import type { Clock } from "./clock";
import { MOTION } from "./motion";

export function initCursor(clock: Clock): void {
	if (!matchMedia("(pointer: fine)").matches) return;
	if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

	document.documentElement.classList.add("no-native-cursor");
	const ring = document.createElement("div");
	ring.id = "cursor";
	ring.setAttribute("aria-hidden", "true");
	ring.style.width = `${MOTION.cursorR * 2}px`;
	ring.style.height = `${MOTION.cursorR * 2}px`;
	document.body.appendChild(ring);

	let tx = -100;
	let ty = -100;
	let x = -100;
	let y = -100;
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

	const INTERACTIVE = "a, button, [role=button], label, summary";
	document.addEventListener("pointerover", (ev) => {
		const el = ev.target as HTMLElement;
		ring.classList.toggle("big", Boolean(el.closest(INTERACTIVE)));
		ring.classList.toggle("quiet", Boolean(el.closest("input, textarea, select")));
	});

	clock.subscribe((_t, dt) => {
		const k = Math.min(1, dt * 22);
		x += (tx - x) * k;
		y += (ty - y) * k;
		ring.style.translate = `${x - MOTION.cursorR}px ${y - MOTION.cursorR}px`;
	});
}
