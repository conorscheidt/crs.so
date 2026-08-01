/**
 * Custom-event sink → Workers Analytics Engine. Optional: the site is fully
 * functional without it, and sends nothing until PUBLIC_ANALYTICS_URL points
 * here.
 *
 * The wire format is whatever `apps/home/src/analytics.ts` `track()` sends:
 * `{event, path, ...fields}` as JSON. The fields differ per event, so they are
 * flattened into one fixed schema here, since Analytics Engine has no
 * per-event shape:
 *
 *   index1    event                  (the one indexed dimension: group by this)
 *   blob1     event
 *   blob2     path                   which page it happened on
 *   blob3     label                  lang | tag | slug | kind | to
 *   blob4     referer
 *   double1   1                      so SUM(double1) is a count
 *   double2   len | ms               "how big / how long"
 *   double3   hits | ok              "how many results / did it succeed"
 *
 * Nothing identifying is recorded: no IP, no user agent, no cookie, no id.
 *
 *   bunx wrangler deploy --config workers/analytics/wrangler.jsonc
 */

// Minimal shape so this stub doesn't hard-depend on @cloudflare/workers-types.
interface AnalyticsEngineDataset {
	writeDataPoint(event: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void;
}

interface Env {
	EVENTS: AnalyticsEngineDataset;
}

/**
 * Write access is limited to the site's origin; an open endpoint would let
 * anyone write their own numbers into the dataset.
 */
const ALLOWED = new Set(["https://crs.so"]);

function cors(origin: string | null): Record<string, string> {
	const allow = origin && ALLOWED.has(origin) ? origin : "";
	return {
		"access-control-allow-origin": allow,
		"access-control-allow-methods": "POST, OPTIONS",
		"access-control-allow-headers": "content-type",
		"access-control-max-age": "86400",
		vary: "origin",
	};
}

/** The first field present wins (see the schema note above). */
function pick(p: Record<string, unknown>, keys: string[]): string {
	for (const k of keys) {
		if (p[k] !== undefined) return String(p[k]);
	}
	return "";
}

function num(p: Record<string, unknown>, keys: string[]): number {
	for (const k of keys) {
		const v = p[k];
		if (v !== undefined) return typeof v === "boolean" ? Number(v) : Number(v) || 0;
	}
	return 0;
}

export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		const origin = req.headers.get("origin");
		const headers = cors(origin);
		if (req.method === "OPTIONS") return new Response(null, { headers });
		if (req.method !== "POST") return new Response(null, { status: 405, headers });
		if (!(origin && ALLOWED.has(origin))) return new Response(null, { status: 403, headers });

		let payload: Record<string, unknown>;
		try {
			// sendBeacon posts text/plain (a safelisted type, so no preflight);
			// the fetch fallback posts application/json. Both are JSON text.
			payload = JSON.parse(await req.text()) as Record<string, unknown>;
		} catch {
			return new Response(null, { status: 400, headers });
		}
		if (typeof payload?.event !== "string") return new Response(null, { status: 400, headers });

		const event = payload.event.slice(0, 64);
		env.EVENTS.writeDataPoint({
			indexes: [event],
			blobs: [
				event,
				pick(payload, ["path"]).slice(0, 256),
				pick(payload, ["lang", "tag", "slug", "kind", "to"]).slice(0, 128),
				(req.headers.get("referer") ?? "").slice(0, 256),
			],
			doubles: [1, num(payload, ["len", "ms"]), num(payload, ["hits", "ok"])],
		});

		return new Response(null, { status: 204, headers });
	},
};
