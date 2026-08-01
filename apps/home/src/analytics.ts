/**
 * Analytics, in two halves, both cookieless and inert until configured.
 *
 *   pageviews  → Cloudflare Web Analytics (the beacon in Shell.astro; set
 *                PUBLIC_CF_BEACON). Nothing to write here: it is server-side
 *                measured, respects Do Not Track, and needs no consent banner.
 *
 *   behaviour  → the events below, POSTed to workers/analytics (Workers
 *                Analytics Engine) when PUBLIC_ANALYTICS_URL is set. This half
 *                covers what people do: which posts get read to the end, which
 *                code blocks get run, which figures get dragged, what people
 *                search for.
 *
 * Rules: never throw into the page, never block a frame (sendBeacon), never
 * send anything identifying. Events are coarse names plus small numeric or
 * enum fields; the only free text from the visitor is their own search terms,
 * which are the point of the search event.
 */
const ENDPOINT = import.meta.env.PUBLIC_ANALYTICS_URL as string | undefined;

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
	if (!ENDPOINT || typeof navigator === "undefined") return;
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
