/**
 * Optional custom-event sink → Workers Analytics Engine.
 *
 * Accepts `POST {event, path, ...fields}` (JSON or sendBeacon Blob) from
 * shared/scripts/analytics.ts and records one data point. CORS is open so the
 * static sites on their own origins can post to it. Deploy on demand; the static
 * sites work fine without it.
 */

// Minimal shape so this stub doesn't hard-depend on @cloudflare/workers-types.
interface AnalyticsEngineDataset {
	writeDataPoint(event: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void;
}

interface Env {
	EVENTS: AnalyticsEngineDataset;
}

const CORS = {
	"access-control-allow-origin": "*",
	"access-control-allow-methods": "POST, OPTIONS",
	"access-control-allow-headers": "content-type",
} as const;

export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
		if (req.method !== "POST")
			return new Response("method not allowed", { status: 405, headers: CORS });

		let payload: Record<string, unknown> = {};
		try {
			payload = (await req.json()) as Record<string, unknown>;
		} catch {
			return new Response("bad json", { status: 400, headers: CORS });
		}

		const event = String(payload.event ?? "unknown");
		const path = String(payload.path ?? "");
		const detail = String(payload.lang ?? payload.tag ?? "");

		env.EVENTS.writeDataPoint({
			indexes: [event],
			blobs: [event, path, detail, req.headers.get("referer") ?? ""],
			doubles: [1],
		});

		return new Response(null, { status: 204, headers: CORS });
	},
};
