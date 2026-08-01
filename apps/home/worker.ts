/**
 * The site's Worker. It handles a single route: the `/api/e` event sink.
 *
 * Static assets are served from the edge without invoking this script, so page
 * loads cost nothing extra. Only `/api/*` is routed here first
 * (`run_worker_first` in wrangler.jsonc); anything else that reaches this
 * script matched no asset and is handed back to the asset router for the 404
 * page.
 *
 * Keeping the event sink here instead of in a second Worker makes it
 * same-origin: no CORS, no preflight, no origin allowlist, no third-party
 * hostname for a blocker to recognise, and no URL to configure. The page always
 * posts to `/api/e`.
 *
 * Pageviews come from Cloudflare Web Analytics (the beacon in Shell.astro).
 * This records what people do: which posts get finished, which snippets get
 * run, which figures get dragged, what people search for.
 *
 * Schema: Analytics Engine has no per-event shape, so every event's fields
 * flatten into one fixed row:
 *
 *   index1   event                 the one indexed dimension; group by this
 *   blob1    event
 *   blob2    path                  where it happened
 *   blob3    label                 lang | tag | slug | kind | to
 *   blob4    referer
 *   double1  1                     so SUM(double1) is a count
 *   double2  len | ms              how big / how long
 *   double3  hits | ok             how many results / did it succeed
 *
 * Nothing identifying is recorded: no IP, no user agent, no cookie, no id.
 * There is no dashboard for this data; query it with the SQL API.
 */

// Minimal shapes, so this does not hard-depend on @cloudflare/workers-types.
interface AnalyticsEngineDataset {
	writeDataPoint: (event: { indexes?: string[]; blobs?: string[]; doubles?: number[] }) => void;
}

interface Env {
	EVENTS: AnalyticsEngineDataset;
	ASSETS: { fetch: (request: Request) => Promise<Response> };
}

/** First field present wins — see the schema note above. */
const pick = (p: Record<string, unknown>, keys: string[]): string => {
	for (const k of keys) {
		if (p[k] !== undefined) return String(p[k]);
	}
	return "";
};

const num = (p: Record<string, unknown>, keys: string[]): number => {
	for (const k of keys) {
		const v = p[k];
		if (v !== undefined) return typeof v === "boolean" ? Number(v) : Number(v) || 0;
	}
	return 0;
};

async function record(req: Request, env: Env, origin: string): Promise<Response> {
	if (req.method !== "POST") return new Response(null, { status: 405 });
	// Same-origin only. A cross-site POST would be blocked from reading the
	// response, but it would still be written to the dataset.
	if (req.headers.get("origin") !== origin) return new Response(null, { status: 403 });

	let payload: Record<string, unknown>;
	try {
		// sendBeacon posts text/plain; the fetch fallback posts JSON. Both text.
		payload = JSON.parse(await req.text()) as Record<string, unknown>;
	} catch {
		return new Response(null, { status: 400 });
	}
	if (typeof payload?.event !== "string") return new Response(null, { status: 400 });

	env.EVENTS.writeDataPoint({
		indexes: [payload.event.slice(0, 64)],
		blobs: [
			payload.event.slice(0, 64),
			pick(payload, ["path"]).slice(0, 256),
			pick(payload, ["lang", "tag", "slug", "kind", "to"]).slice(0, 128),
			(req.headers.get("referer") ?? "").slice(0, 256),
		],
		doubles: [1, num(payload, ["len", "ms"]), num(payload, ["hits", "ok"])],
	});
	return new Response(null, { status: 204 });
}

export default {
	fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/api/e") return record(request, env, url.origin);
		// Reached here only because no asset matched: let the asset router
		// answer, so `not_found_handling: "404-page"` still serves 404.html.
		return env.ASSETS.fetch(request);
	},
};
