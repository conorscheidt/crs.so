/**
 * Cloudflare zone settings as code.
 *
 * Wrangler manages the Worker but not the zone: Rocket Loader, Polish, TLS
 * floors and the rest live in dashboard state this repo can't diff. The desired
 * state is declared here and applied idempotently: each setting is read, only
 * the ones that differ are changed, and every change is printed.
 *
 *   CLOUDFLARE_API_TOKEN=… bun scripts/cf-zone.ts --dry    # show the diff
 *   CLOUDFLARE_API_TOKEN=… bun scripts/cf-zone.ts          # apply it
 *
 * The token needs Zone → Zone Settings: Edit and Zone → Zone: Read on crs.so.
 * Terraform would also work, but for eighteen settings that's a state file and
 * a toolchain to maintain for idempotence this script already has.
 */

import process from "node:process";

const ZONE = "crs.so";
// biome-ignore lint/style/noProcessEnv: one-shot CLI script; env is its config
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const DRY = process.argv.includes("--dry");

/**
 * The first three are off because each one rewrites the built HTML:
 *   · rocket_loader defers and reorders scripts. The theme script in
 *     Shell.astro has to run before first paint; deferred, every load
 *     flashes the wrong theme.
 *   · email_obfuscation rewrites the About panel's mailto: into a script-decoded
 *     link, injecting a script into a cross-origin-isolated document.
 *   · server_side_exclude is another HTML rewriter, for a feature we don't use.
 *
 * Two more are off even though they look free:
 *   · polish recompresses images. Astro already emits AVIF at content-hashed,
 *     immutably-cached URLs; re-encoding gains nothing and can lose quality.
 *   · hotlink_protection blocks cross-site image loads, which is how Twitter,
 *     Discord, Slack and other unfurlers fetch /og/*.png. Enabling it breaks
 *     every social card.
 */
const SETTINGS: Record<string, string> = {
	rocket_loader: "off",
	email_obfuscation: "off",
	server_side_exclude: "off",
	mirage: "off",
	polish: "off",
	hotlink_protection: "off",

	// Transport. HTTP/3 and TLS 1.3 are free latency; 1.2 is the floor because
	// anything below it is broken, and anything above it excludes real clients.
	http3: "on",
	tls_1_3: "on",
	min_tls_version: "1.2",
	always_use_https: "on",
	automatic_https_rewrites: "on",
	opportunistic_encryption: "on",
	brotli: "on",

	// 0-RTT can replay a request. Cloudflare only offers it for GETs, and the
	// only thing here that is not a GET is a same-origin analytics beacon whose
	// worst case is one double-counted event.
	"0rtt": "on",

	// Early Hints promotes `Link:` headers into a 103. We emit none today (the
	// font preloads are <link> tags with content-hashed URLs), so this is inert
	// until public/_headers grows generated Link headers. Harmless meanwhile.
	early_hints: "on",
};

/**
 * HSTS is left out. Browsers keep honouring `max-age` after the header is
 * gone, so enabling it before every subdomain is reliably HTTPS-only can't be
 * undone until it expires. Turn it on by hand once crs.so and everything under
 * it are settled:
 *
 *   security_header = { strict_transport_security: {
 *     enabled: true, max_age: 31536000, include_subdomains: true, preload: false } }
 *
 * Start with a short max_age. `preload` is close to irreversible.
 */

const api = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
	const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
		method,
		headers: {
			authorization: `Bearer ${TOKEN}`,
			...(body ? { "content-type": "application/json" } : {}),
		},
		...(body ? { body: JSON.stringify(body) } : {}),
	});
	const json = (await res.json()) as { success: boolean; result: T; errors?: unknown[] };
	if (!json.success) throw new Error(`${method} ${path} — ${JSON.stringify(json.errors)}`);
	return json.result;
};

if (!TOKEN) {
	// biome-ignore lint/suspicious/noConsole: CLI output
	console.error("CLOUDFLARE_API_TOKEN is not set.");
	process.exit(1);
}

const zones = await api<{ id: string; name: string }[]>("GET", `/zones?name=${ZONE}`);
const zone = zones[0];
if (!zone) throw new Error(`zone ${ZONE} not found on this token's account`);

const say = (line: string): void => {
	// biome-ignore lint/suspicious/noConsole: CLI output
	console.log(line);
};

/** Read every declared setting at once, then report only what differs. */
const current = await Promise.all(
	Object.keys(SETTINGS).map(async (id) => {
		try {
			const { value } = await api<{ value: unknown }>("GET", `/zones/${zone.id}/settings/${id}`);
			return { id, have: value as string, readable: true };
		} catch {
			return { id, have: "", readable: false };
		}
	}),
);

const drift: { id: string; have: string; want: string }[] = [];
for (const { id, have, readable } of current) {
	const want = SETTINGS[id] as string;
	if (!readable) {
		say(`  ?  ${id.padEnd(26)} unreadable on this plan or token — skipped`);
		continue;
	}
	if (have === want) continue;
	drift.push({ id, have, want });
	say(`  ${DRY ? "~" : "→"}  ${id.padEnd(26)} ${have} → ${want}`);
}

let changed = drift.length;
if (!DRY) {
	await Promise.all(
		drift.map(({ id, want }) =>
			api<unknown>("PATCH", `/zones/${zone.id}/settings/${id}`, { value: want }),
		),
	);
}

// Bot Fight Mode is not a zone setting; it injects JS into HTML responses,
// which is the same objection as Rocket Loader.
try {
	const bm = await api<{ fight_mode?: boolean }>("GET", `/zones/${zone.id}/bot_management`);
	if (bm.fight_mode) {
		changed++;
		say(`  ${DRY ? "~" : "→"}  ${"bot_fight_mode".padEnd(26)} true → false`);
		if (!DRY) await api<unknown>("PUT", `/zones/${zone.id}/bot_management`, { fight_mode: false });
	}
} catch {
	say("  ?  bot_fight_mode             unreadable on this token — check by hand");
}

function summary(): string {
	if (changed === 0) return `${ZONE}: already as declared.`;
	if (DRY) return `${ZONE}: ${changed} setting(s) differ. Re-run without --dry to apply.`;
	return `${ZONE}: ${changed} setting(s) updated.`;
}

say(summary());
