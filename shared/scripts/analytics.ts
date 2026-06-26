/**
 * Custom-event tracking — privacy-light, and inert until configured.
 *
 * Pageviews come from the Cloudflare Web Analytics beacon (set PUBLIC_CF_BEACON
 * in the layout). Custom events (code-run, tag-filter, …) are POSTed to an
 * optional Workers Analytics Engine endpoint and no-op unless PUBLIC_ANALYTICS_URL
 * is set — so nothing leaves the page until you deploy workers/analytics and wire
 * the env var. Tracking must never throw into the page.
 */
const ENDPOINT = import.meta.env.PUBLIC_ANALYTICS_URL as string | undefined;

export function track(event: string, fields: Record<string, string | number> = {}): void {
	if (!ENDPOINT || typeof navigator === "undefined") return;
	try {
		const body = JSON.stringify({ event, path: location.pathname, ...fields });
		if (navigator.sendBeacon) {
			navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
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
