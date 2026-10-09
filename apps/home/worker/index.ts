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

import * as v from "valibot";
import { SiteEvent } from "../src/events";
import { Summary } from "../src/git-summary";

// basalt keeps its own routes under /-/ so they can't collide with a repository.
const GIT_SUMMARY = "https://git.crs.so/-/api/summary";
// basalt caps the summary at 32 KB; anything much larger isn't it.
const SUMMARY_MAX = 64 * 1024;

/** An event's label and two measures, in the row layout described above. */
function columns(e: SiteEvent): [string, number, number] {
	switch (e.event) {
		case "code-run":
			return [e.lang, e.ms, Number(e.ok)];
		case "search":
			return [e.kind, e.len, e.hits];
		case "figure-touch":
			return [e.kind, 0, 0];
		case "tag-filter":
			return [e.tag, 0, 0];
		case "project-filter":
		case "project-open":
			return [e.slug, 0, 0];
		case "theme-flip":
			return [e.to, 0, 0];
		case "post-open":
		case "post-read":
			return ["", 0, 0];
		default:
			return e satisfies never;
	}
}

async function record(req: Request, env: Env, origin: string): Promise<Response> {
	if (req.method !== "POST") return new Response(null, { status: 405 });
	// A cross-site POST can't read the response, but it would still be written.
	if (req.headers.get("origin") !== origin) return new Response(null, { status: 403 });

	if (Number(req.headers.get("content-length")) > 4096) return new Response(null, { status: 413 });
	let e: SiteEvent;
	try {
		// sendBeacon sends text/plain and the fetch fallback sends JSON; both are JSON text.
		e = v.parse(SiteEvent, JSON.parse(await req.text()));
	} catch {
		return new Response(null, { status: 400 });
	}

	const [label, a, b] = columns(e);
	env.EVENTS.writeDataPoint({
		indexes: [e.event],
		blobs: [e.event, e.path, label, (req.headers.get("referer") ?? "").slice(0, 256)],
		doubles: [1, a, b],
	});
	return new Response(null, { status: 204 });
}

// The browser asks this origin, never git.crs.so: no CORS on basalt, no second
// DNS + TLS handshake for visitors, and a slow or offline basalt costs one
// cached empty response instead of a broken homepage. That response is a 204
// rather than a 5xx so every visitor's console doesn't log an error; the
// failure is logged here instead.
async function gitSummary(req: Request): Promise<Response> {
	if (req.method !== "GET") return new Response(null, { status: 405 });
	try {
		const upstream = await fetch(GIT_SUMMARY, {
			cf: { cacheTtl: 300, cacheEverything: true },
			signal: AbortSignal.timeout(3000),
		});
		if (!upstream.ok) throw new Error(`basalt ${upstream.status}`);
		if (Number(upstream.headers.get("content-length")) > SUMMARY_MAX)
			throw new Error("basalt summary too large");
		const parsed = v.safeParse(Summary, await upstream.json());
		if (!parsed.success)
			throw new Error(`basalt summary: ${JSON.stringify(v.flatten(parsed.issues))}`);
		return new Response(JSON.stringify(parsed.output), {
			headers: {
				"content-type": "application/json",
				"cache-control": "public, max-age=60, stale-while-revalidate=600",
			},
		});
	} catch (err) {
		// biome-ignore lint/suspicious/noConsole: surfaces in Workers Logs
		console.warn("git summary unavailable:", String(err));
		return new Response(null, { status: 204, headers: { "cache-control": "public, max-age=60" } });
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
