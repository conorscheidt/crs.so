/**
 * Article-page runtime: lenis on the page scroll plus the article features.
 * Booted and torn down by app.ts; hub/article travel is a same-document swap,
 * so everything here is reversible.
 */
import Lenis from "lenis";
import { initArticleFeatures } from "./article-features";
import type { Clock } from "./clock";
import { MOTION } from "./motion";

export function bootArticle(clock: Clock): () => void {
	if (!document.querySelector(".apage")) return () => {};
	const cleanups: (() => void)[] = [];

	if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
		const lenis = new Lenis({
			autoRaf: false,
			lerp: MOTION.scrollLerp,
			wheelMultiplier: 1,
			syncTouch: false,
		});
		cleanups.push(clock.subscribe((t) => lenis.raf(t)));
		// Lenis's own ResizeObserver watches html/body, whose boxes are locked
		// to the viewport by `height: 100%`, so content growth (idle-mounted
		// editors, font swaps) never fires it and the scroll limit goes stale,
		// cutting off the end of the page. Watch the actual page grid instead.
		const page = document.querySelector(".apage");
		if (page) {
			const ro = new ResizeObserver(() => lenis.resize());
			ro.observe(page);
			cleanups.push(() => ro.disconnect());
		}
		cleanups.push(() => lenis.destroy());
		if (import.meta.env.DEV) {
			(globalThis as { __lenis?: unknown }).__lenis = lenis;
		}
	}

	cleanups.push(initArticleFeatures());
	return () => {
		for (const c of cleanups) c();
	};
}
