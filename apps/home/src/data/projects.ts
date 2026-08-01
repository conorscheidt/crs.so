/**
 * Projects panel data.
 *
 * Empty in production until a project has shipped something public: a running
 * system, a repository someone can read, numbers that hold up.
 *
 * The mock set below is used only in `bun dev`, so the populated layout can be
 * worked on, as with draft posts and the sample git payload.
 * `import.meta.env.DEV` is a compile-time constant, so the mocks are not in
 * the production bundle.
 */
export interface Project {
	name: string;
	description: string;
	tags: string[];
	href?: string;
	year: number;
}

const MOCK: Project[] = [
	{
		name: "basalt",
		description:
			"A git server and web frontend written from scratch in Rust — the transfer protocol, a content-addressed object store, atomic ref updates.",
		tags: ["rust", "systems"],
		href: "https://git.crs.so",
		year: 2026,
	},
	{
		name: "crs.so",
		description: "This site — the object at its centre, the article system, the in-page toolchain.",
		tags: ["web", "gpu"],
		year: 2026,
	},
	{
		name: "plankton",
		description:
			"A distributed measurement framework mapping site- and DNS-level telemetry at internet scale.",
		tags: ["distributed", "python"],
		year: 2024,
	},
];

export const projects: Project[] = import.meta.env.DEV ? MOCK : [];
