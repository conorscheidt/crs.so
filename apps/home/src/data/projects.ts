/**
 * Projects panel data. Professional experience lives in about.ts. Entries
 * marked sample are placeholders until real copy is written.
 */
export interface Project {
	name: string;
	description: string;
	tags: string[];
	href?: string;
	year: number;
	sample?: boolean;
}

export const projects: Project[] = [
	{
		name: "clang.wasm",
		description:
			"A full C/C++ toolchain compiled to WebAssembly — edit, compile and run in the browser, off-thread.",
		tags: ["systems", "wasm"],
		year: 2026,
	},
	{
		name: "figures",
		description: "Interactive mathematical diagrams with the finish of a printed plate.",
		tags: ["math", "svg"],
		year: 2026,
	},
	{
		name: "crs.so",
		description: "This site — the engine, the type system, the object at its centre.",
		tags: ["web", "gpu"],
		href: "https://git.crs.so",
		year: 2026,
	},
	{
		name: "particle life",
		description: "Emergent behaviour from pairwise force matrices, tuned until it feels alive.",
		tags: ["sim", "gpu"],
		year: 2025,
		sample: true,
	},
];

export const projectTags: string[] = [...new Set(projects.flatMap((p) => p.tags))].sort();
