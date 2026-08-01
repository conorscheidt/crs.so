/**
 * Projects panel data, and the link between repositories and posts:
 *
 *     git.crs.so repo  ←→  project  ←→  0..n posts
 *
 * A project names its repository by slug (`repo`), and a post names its
 * project by slug in frontmatter (`project`). Both resolve at build time;
 * `lib/relations.ts` derives the reverse direction.
 *
 * Empty in production until something ships. `bun dev` gets a mock set so
 * the populated layout can be worked on; `import.meta.env.DEV` is
 * compile-time, so the mocks are not in the bundle.
 */
export interface Project {
	/** stable id; posts reference this in frontmatter */
	slug: string;
	name: string;
	description: string;
	tags: string[];
	year: number;
	/** repository slug on git.crs.so; the URL is derived from it */
	repo?: string;
	/** anything other than a repo: a live deployment, a paper */
	href?: string;
}

export const GIT_HOST = "https://git.crs.so";
export const repoUrl = (repo: string): string => `${GIT_HOST}/${repo}`;

const MOCK: Project[] = [
	{
		slug: "basalt",
		name: "basalt",
		description:
			"A git server and web frontend written from scratch in Rust — the transfer protocol, a content-addressed object store, atomic ref updates.",
		tags: ["rust", "systems"],
		year: 2026,
		repo: "basalt",
	},
	{
		slug: "crs-so",
		name: "crs.so",
		description: "This site — the object at its centre, the article system, the in-page toolchain.",
		tags: ["web", "gpu"],
		year: 2026,
		repo: "crs.so",
		href: "https://crs.so",
	},
	{
		slug: "plankton",
		name: "plankton",
		description:
			"A distributed measurement framework mapping site- and DNS-level telemetry at internet scale.",
		tags: ["distributed", "python"],
		year: 2024,
		repo: "plankton",
	},
];

export const projects: Project[] = import.meta.env.DEV ? MOCK : [];

export const projectBySlug = (slug: string): Project | undefined =>
	projects.find((p) => p.slug === slug);
