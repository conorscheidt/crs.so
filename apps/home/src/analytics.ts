/**
 * Analytics, in two halves, both cookieless.
 *
 *   pageviews  → Cloudflare Web Analytics (the beacon in Shell.astro). Nothing
 *                to write here: it is measured for us, respects Do Not Track,
 *                and needs no consent banner.
 *
 *   behaviour  → the events below, POSTed to this site's own `/api/e`, which
 *                the site's Worker writes to Analytics Engine. This half covers
 *                what people do: which posts get read to the end, which code
 *                blocks get run, which figures get dragged, what people search
 *                for.
 *
 * The endpoint is a same-origin path, not a configured URL: nothing to set, no
 * CORS, and no third-party hostname for a blocker to recognise. It is the same
 * in every environment.
 *
 * Rules: never throw into the page, never block a frame (sendBeacon), never
 * send anything identifying. Events are coarse names plus small numeric or
 * enum fields; the only free text from the visitor is their own search terms,
 * which are the point of the search event.
 */
const ENDPOINT = "/api/e";

/** The site's whole event vocabulary. Adding one means adding it here. */
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
			// text/plain is a CORS-safelisted content type, so the beacon is a
			// single request. `application/json` would earn a preflight OPTIONS
			// on every event, doubling the requests. The body
			// is JSON either way; the sink parses text.
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
		/* analytics is best-effort — swallow everything */
	}
}

/**
 * Fire once when the reader passes `ratio` of the page. Returns a teardown so
 * the same-document navigator can drop it with the rest of the article.
 */
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
