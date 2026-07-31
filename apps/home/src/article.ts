/**
 * Article-page runtime: shared clock, lenis on the page scroll, and the
 * circular cursor. No sim and no router; articles are plain documents without
 * ClientRouter.
 */
import Lenis from "lenis";
import { Clock } from "./clock";
import { initCursor } from "./cursor";
import { MOTION } from "./motion";

const clock = new Clock();
initCursor(clock);

if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
	const lenis = new Lenis({
		autoRaf: false,
		lerp: MOTION.scrollLerp,
		wheelMultiplier: 1,
		syncTouch: false,
	});
	clock.subscribe((t) => lenis.raf(t));
}
