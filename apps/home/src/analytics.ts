// Pageviews come from Cloudflare Web Analytics (see Shell.astro). This module
// sends behaviour events — post reads, code runs, figure drags, searches — to
// /api/e, which the Worker writes to Analytics Engine. Fire-and-forget,
// and nothing sent identifies a visitor.
import type { EventFields, EventName } from "./events";

const ENDPOINT = "/api/e";

// Events without fields take no second argument; the rest require theirs.
type Args<E extends EventName> =
	{} extends EventFields<E> ? [fields?: EventFields<E>] : [fields: EventFields<E>];

export function track<E extends EventName>(event: E, ...[fields]: Args<E>): void {
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
export function trackReadDepth(event: "post-read", ratio = 0.9): () => void {
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
