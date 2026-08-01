/**
 * Mock data, all commented out.
 *
 * The site has no dev or preview mode that changes what renders, so populated
 * layouts (a full Projects list, a year of git activity) have no real data to
 * develop against. The mocks live here and are switched on by hand:
 *
 *   1. uncomment the block you need, below;
 *   2. uncomment the line at its use site, named in each block's header;
 *   3. revert both when done.
 *
 * Nothing imports this file.
 */

// ─── projects ────────────────────────────────────────────────────────────────
// use site: data/projects.ts — `export const projects: Project[] = [];`
//
// import type { Project } from "./projects";
//
// export const PROJECTS: Project[] = [
// 	{
// 		slug: "basalt",
// 		name: "basalt",
// 		description:
// 			"A git server and web frontend written from scratch in Rust — the transfer protocol, a content-addressed object store, atomic ref updates.",
// 		tags: ["rust", "systems"],
// 		year: 2026,
// 		repo: "basalt",
// 	},
// 	{
// 		slug: "crs-so",
// 		name: "crs.so",
// 		description:
// 			"This site — the object at its centre, the article system, the in-page toolchain.",
// 		tags: ["web", "gpu"],
// 		year: 2026,
// 		repo: "crs.so",
// 		href: "https://crs.so",
// 	},
// 	{
// 		slug: "plankton",
// 		name: "plankton",
// 		description:
// 			"A distributed measurement framework mapping site- and DNS-level telemetry at internet scale.",
// 		tags: ["distributed", "python"],
// 		year: 2024,
// 		repo: "plankton",
// 	},
// ];
//
//// ─── git.crs.so ──────────────────────────────────────────────────────────────
// use site: git.ts — the `catch` in `initGit`, which calls renderUnreachable().
// A plausible year: hashed so the shape never flickers between reloads.
//
// import { GIT_HOST } from "./projects";
//
// const MS_DAY = 86_400_000;
// const DAYS = 364;
//
// export function gitSample(): GitData {
// 	const heat = new Map<number, number>();
// 	const today = Math.floor(Date.now() / MS_DAY);
// 	for (let d = 0; d < DAYS; d++) {
// 		const v = (Math.imul(d + 7, 2_654_435_761) >>> 8) % 100;
// 		const swell = 0.45 + 0.55 * Math.sin(d / 34) ** 2;
// 		const buckets: [number, number][] = [
// 			[38, 0],
// 			[62, 1],
// 			[82, 2],
// 			[94, 4],
// 			[101, 7],
// 		];
// 		const base = buckets.find(([cap]) => v < cap)?.[1] ?? 0;
// 		heat.set(today - d, Math.round(base * swell));
// 	}
// 	return {
// 		heat,
// 		commits: 1204,
// 		repos: 11,
// 		recent: [
// 			{
// 				repo: "basalt",
// 				message: "pack: stream thin packs without buffering",
// 				when: Date.now() - 2 * 3.6e6,
// 				url: `${GIT_HOST}/basalt/commits`,
// 			},
// 			{
// 				repo: "crs.so",
// 				message: "sim: drag-to-spin with capped inertia",
// 				when: Date.now() - 8.64e7,
// 				url: `${GIT_HOST}/crs.so/commits`,
// 			},
// 			{
// 				repo: "basalt",
// 				message: "refs: atomic transactional updates",
// 				when: Date.now() - 2 * 8.64e7,
// 				url: `${GIT_HOST}/basalt/commits`,
// 			},
// 		],
// 		popular: [
// 			{
// 				name: "basalt",
// 				description: "Git server and frontend, written from scratch in Rust.",
// 				commits: 412,
// 				updated: Date.now() - 2 * 3.6e6,
// 				url: `${GIT_HOST}/basalt`,
// 				langs: [
// 					["Rust", 0.82],
// 					["HTML", 0.12],
// 					["Shell", 0.06],
// 				],
// 			},
// 			{
// 				name: "crs.so",
// 				description: "This site — the object, the article system, the toolchain.",
// 				commits: 296,
// 				updated: Date.now() - 8.64e7,
// 				url: `${GIT_HOST}/crs.so`,
// 				langs: [
// 					["TypeScript", 0.71],
// 					["CSS", 0.2],
// 					["WGSL", 0.09],
// 				],
// 			},
// 			{
// 				name: "plankton",
// 				description: "Distributed internet-scale measurement framework.",
// 				commits: 188,
// 				updated: Date.now() - 21 * 8.64e7,
// 				url: `${GIT_HOST}/plankton`,
// 				langs: [
// 					["Python", 0.54],
// 					["Rust", 0.46],
// 				],
// 			},
// 		],
// 	};
// }

export {};
