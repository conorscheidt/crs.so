/**
 * Article runtime: Lenis on the page scroll, in-page anchor jumps and the
 * article features. Booted and torn down by app.ts, like the hub.
 */
import type Lenis from "lenis";
import { track, trackReadDepth } from "./analytics";
import { initArticleFeatures } from "./article-features";
import type { Clock } from "./clock";
import { MOTION } from "./motion";
import { smoothScroll } from "./scroll";

/**
 * In-page anchors (ToC, footnote references, ↩ backrefs) glide with Lenis,
 * since a native jump would fight the smooth scroller and land wrong. The hash
 * is pushed so Back retraces the reading path, and focus moves with it.
 */
// biome-ignore lint/security/noSecrets: a CSS attribute selector, not a secret
const IN_PAGE = 'a[href^="#"]';

function initAnchors(lenis: Lenis | null): () => void {
	const onClick = (ev: MouseEvent): void => {
		if (ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
		const a = (ev.target as HTMLElement).closest<HTMLAnchorElement>(IN_PAGE);
		if (!a) return;
		const target = document.getElementById(decodeURIComponent(a.hash.slice(1)));
		if (!target) return;
		ev.preventDefault();
		history.pushState(null, "", a.hash);
		if (lenis) lenis.scrollTo(target, { offset: -MOTION.anchorInset });
		else
			target.scrollIntoView({
				block: "start",
				behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
			});
		target.setAttribute("tabindex", "-1");
		target.focus({ preventScroll: true });
	};
	document.addEventListener("click", onClick);
	return () => document.removeEventListener("click", onClick);
}

export function bootArticle(clock: Clock): () => void {
	if (!document.querySelector(".apage")) return () => {};
	const cleanups: (() => void)[] = [];
	const lenis = smoothScroll();

	if (lenis) {
		cleanups.push(clock.subscribe((t) => lenis.raf(t)));
		// Lenis observes html/body, whose height is pinned to the viewport, so
		// content growth never fires it and the scroll limit goes stale. Observe
		// the page grid instead.
		const page = document.querySelector(".apage");
		if (page) {
			const ro = new ResizeObserver(() => lenis.resize());
			ro.observe(page);
			cleanups.push(() => ro.disconnect());
		}
		cleanups.push(() => lenis.destroy());
	}

	track("post-open");
	cleanups.push(initAnchors(lenis));
	cleanups.push(trackReadDepth("post-read"));
	cleanups.push(initArticleFeatures());
	return () => {
		for (const c of cleanups) c();
	};
}
