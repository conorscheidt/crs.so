/**
 * Article-page runtime: shared clock, lenis on the page scroll, and the
 * circular cursor. No sim and no router; articles are plain documents without
 * ClientRouter.
 */
import Lenis from "lenis";
import { initArticleFeatures } from "./article-features";
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
	// Lenis's own ResizeObserver watches html/body, whose boxes are locked to
	// the viewport by `height: 100%`, so content growth (idle-mounted editors,
	// font swaps) never fires it and the scroll limit goes stale, cutting off
	// the end of the page. Watch the actual page grid instead.
	const page = document.querySelector(".apage");
	if (page) new ResizeObserver(() => lenis.resize()).observe(page);
	if (import.meta.env.DEV) {
		(globalThis as { __lenis?: unknown }).__lenis = lenis;
	}
}

initArticleFeatures();
