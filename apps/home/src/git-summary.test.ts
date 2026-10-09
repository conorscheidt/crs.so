import { expect, test } from "bun:test";
import * as v from "valibot";
import { derive, epochDay } from "./git-data";
import { forgeUrl, Summary } from "./git-summary";

// 2026-10-09 03:30 UTC is still 2026-10-08 in Chicago.
const NOW = Date.UTC(2026, 9, 9, 3, 30);
const TODAY = Math.floor(Date.UTC(2026, 9, 8) / 86_400_000);

const fixture = {
	v: 1,
	tz: "America/Chicago",
	owner: { name: "Conor Scheidt", url: "https://git.crs.so/conor" },
	first: Date.UTC(2023, 4, 2),
	commits: { year: 1204, all: 3120 },
	signed: 0.97,
	repos: 11,
	mirrors: 4,
	days: [
		[TODAY, 5, 812, 140],
		[TODAY - 1, 2],
		[TODAY - 400, 9],
		[TODAY + 1, 3],
	],
	hours: [[2, 23, 14]],
	langs: [
		["Rust", 0.71],
		["TypeScript", 0.18],
		["C", 0.06],
		["Shell", 0.05],
	],
	featured: [
		{
			name: "basalt",
			url: "https://git.crs.so/conor/basalt",
			commits: 412,
			updated: NOW,
			langs: [["Rust", 0.82]],
			release: {
				tag: "v0.4.0",
				when: NOW,
				url: "https://git.crs.so/conor/basalt/-/releases/v0.4.0",
			},
		},
		{ name: "evil", url: "https://evil.example/x", commits: 1, updated: NOW },
		{ name: "relative", url: "/conor/relative", commits: 2, updated: NOW },
	],
	recent: [
		{
			repo: "basalt",
			// biome-ignore lint/security/noSecrets: a commit hash
			sha: "3f9a2264c1e0",
			message: "pack: stream thin packs",
			when: NOW,
			url: "https://git.crs.so/conor/basalt/-/commit/3f9a226",
			signed: true,
		},
		{ repo: "x", sha: "0", message: "no link", when: NOW, url: "javascript:alert(1)" },
	],
	server: {
		version: "0.4.0",
		commit: "ab12cd34",
		since: NOW - 864e5,
		objects: 184_220,
		clones: 3091,
	},
};

const clean = {
	...fixture,
	featured: fixture.featured.filter((r) => r.name !== "evil"),
	recent: fixture.recent.filter((c) => c.url.startsWith("https:")),
};
const parse = (x: unknown) => v.safeParse(Summary, x);

test("days count in basalt's timezone, not UTC", () => {
	expect(epochDay(NOW, "America/Chicago")).toBe(TODAY);
	expect(epochDay(NOW, "UTC")).toBe(TODAY + 1);
});

test("validates v1 and derives the last 364 days", () => {
	const r = parse(clean);
	expect(r.success).toBe(true);
	if (!r.success) return;
	const d = derive(r.output, NOW);
	expect(d.today).toBe(TODAY);
	expect([...d.heat.keys()].sort()).toEqual([TODAY - 1, TODAY]);
	expect(d.commits).toEqual({ year: 1204, all: 3120 });
	expect(d.langs).toHaveLength(3);
	expect(d.week[2]?.[23]).toBe(14);
	expect(d.featured[1]?.url).toBe("https://git.crs.so/conor/relative");
	expect(d.recent[0]?.signed).toBe(true);
	expect(d.server?.clones).toBe(3091);
});

test("links that leave the forge fail validation", () => {
	expect(parse(fixture).success).toBe(false);
	expect(forgeUrl("https://git.crs.so.evil.example/")).toBeNull();
	expect(forgeUrl("/conor/x")).toBe("https://git.crs.so/conor/x");
});

test("bad versions, zones and shapes are rejected", () => {
	expect(parse({ ...clean, v: 2 }).success).toBe(false);
	expect(parse({ ...clean, tz: "Not/AZone" }).success).toBe(false);
	expect(parse({ ...clean, days: [[TODAY]] }).success).toBe(false);
	expect(parse(null).success).toBe(false);
});

test("optional fields default", () => {
	const { hours: _h, langs: _l, mirrors: _m, server: _s, signed: _g, ...core } = clean;
	const r = parse(core);
	expect(r.success).toBe(true);
	if (!r.success) return;
	expect(r.output.mirrors).toBe(0);
	expect(r.output.hours).toEqual([]);
	expect(r.output.server).toBeUndefined();
});
