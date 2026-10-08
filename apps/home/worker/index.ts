// Static assets are served by the asset router without running this script.
// It only sees /api/* (run_worker_first) and paths that matched no asset.
//
//   POST /api/e    behaviour events → Analytics Engine
//   GET  /api/git  basalt's activity summary, cached at the edge
//
// Analytics Engine has no per-event schema, so every event is flattened into
// one row: index1/blob1 event · blob2 path · blob3 label (lang|tag|slug|kind|to)
// · blob4 referer · double1 1 · double2 len|ms · double3 hits|ok. Nothing that
// identifies a visitor is recorded.

const GIT_SUMMARY = "https://git.crs.so/api/summary";

const first = (p: Record<string, unknown>, keys: readonly string[]): unknown =>
	keys.map((k) => p[k]).find((v) => v !== undefined);

const text = (p: Record<string, unknown>, keys: readonly string[], max: number): string =>
	String(first(p, keys) ?? "").slice(0, max);

const number = (p: Record<string, unknown>, keys: readonly string[]): number => {
	const v = first(p, keys);
	return typeof v === "boolean" ? Number(v) : Number(v) || 0;
};

async function record(req: Request, env: Env, origin: string): Promise<Response> {
	if (req.method !== "POST") return new Response(null, { status: 405 });
	// A cross-site POST can't read the response, but it would still be written.
	if (req.headers.get("origin") !== origin) return new Response(null, { status: 403 });

	let payload: Record<string, unknown>;
	try {
		// sendBeacon sends text/plain and the fetch fallback sends JSON; both are JSON text.
		payload = JSON.parse(await req.text()) as Record<string, unknown>;
	} catch {
		return new Response(null, { status: 400 });
	}
	const event = payload["event"];
	if (typeof event !== "string") return new Response(null, { status: 400 });

	env.EVENTS.writeDataPoint({
		indexes: [event.slice(0, 64)],
		blobs: [
			event.slice(0, 64),
			text(payload, ["path"], 256),
			text(payload, ["lang", "tag", "slug", "kind", "to"], 128),
			(req.headers.get("referer") ?? "").slice(0, 256),
		],
		doubles: [1, number(payload, ["len", "ms"]), number(payload, ["hits", "ok"])],
	});
	return new Response(null, { status: 204 });
}

// The browser asks this origin, never git.crs.so: no CORS on basalt, no second
// DNS + TLS handshake for visitors, and a slow or offline basalt costs one
// cached 503 instead of a broken homepage.
async function gitSummary(req: Request): Promise<Response> {
	if (req.method !== "GET") return new Response(null, { status: 405 });
	try {
		const upstream = await fetch(GIT_SUMMARY, {
			cf: { cacheTtl: 300, cacheEverything: true },
			signal: AbortSignal.timeout(3000),
		});
		if (!upstream.ok) throw new Error(`basalt ${upstream.status}`);
		return new Response(upstream.body, {
			headers: {
				"content-type": "application/json",
				"cache-control": "public, max-age=60, stale-while-revalidate=600",
			},
		});
	} catch {
		return new Response(null, { status: 503, headers: { "cache-control": "public, max-age=60" } });
	}
}

export default {
	fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname === "/api/e") return record(request, env, url.origin);
		if (url.pathname === "/api/git") return gitSummary(request);
		// No asset matched; let the asset router answer so the 404 page is served.
		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
