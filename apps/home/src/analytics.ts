// Pageviews come from Cloudflare Web Analytics (see Shell.astro). This module
// sends behaviour events — post reads, code runs, figure drags, searches — to
// /api/e, which the Worker writes to Analytics Engine. Fire-and-forget,
// and nothing sent identifies a visitor.
const ENDPOINT = "/api/e";

/** Every event the site sends. */
export type Event =
	| "post-open" // an article was opened
	| "post-read" // scrolled past 90% of an article
	| "code-run" // a snippet was compiled/run (field: lang, ok, ms)
	| "figure-touch" // a plate was dragged or reset (field: kind)
	| "search" // a query ran (field: kind, len, hits)
	| "tag-filter" // a tag chip was applied (field: tag)
	| "project-filter" // writing was filtered to one project (field: slug)
	| "project-open" // a repository or live link was followed (field: slug)
	| "theme-flip"; // day/night toggled (field: to)

export function track(event: Event, fields: Record<string, string | number> = {}): void {
	if (typeof navigator === "undefined") return;
	try {
		const body = JSON.stringify({ event, path: location.pathname, ...fields });
		if (navigator.sendBeacon) {
			// text/plain is CORS-safelisted, so this avoids a preflight per event.
			navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain;charset=UTF-8" }));
		} else {
			void fetch(ENDPOINT, {
				method: "POST",
				body,
				keepalive: true,
				headers: { "content-type": "application/json" },
			});
		}
	} catch {
		// best effort
	}
}

/** Fire once when the reader passes `ratio` of the page; returns a teardown. */
export function trackReadDepth(event: Event, ratio = 0.9): () => void {
	let fired = false;
	const onScroll = (): void => {
		if (fired) return;
		const max = document.documentElement.scrollHeight - innerHeight;
		if (max > 0 && scrollY / max >= ratio) {
			fired = true;
			track(event);
		}
	};
	addEventListener("scroll", onScroll, { passive: true });
	return () => removeEventListener("scroll", onScroll);
}
