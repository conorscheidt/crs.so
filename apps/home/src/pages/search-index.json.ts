/**
 * Build-time search index, emitted as a static asset and fetched the first time
 * someone searches. Options come from search/options.ts.
 */
import MiniSearch from "minisearch";
import { projects, repoUrl } from "../data/projects";
import { publishedPosts } from "../lib/posts";
import { SEARCH_FIELDS, type SearchDoc } from "../search/options";

function strip(md: string): string {
	return md
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`[^`]*`/g, " ")
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/^---[\s\S]*?---/, " ")
		.replace(/[#>*_~|-]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export async function GET(): Promise<Response> {
	const posts = await publishedPosts();
	const docs: SearchDoc[] = [
		...posts.map((p) => ({
			id: `post:${p.id}`,
			title: p.data.title,
			content: strip(p.body ?? ""),
			tags: p.data.tags,
			project: p.data.project ?? "",
			kind: "post" as const,
			ts: p.data.date.valueOf(),
			url: `/writing/${p.id}`,
		})),
		...projects.map((p) => ({
			id: `project:${p.slug}`,
			title: p.name,
			content: p.description,
			tags: p.tags,
			project: p.slug,
			kind: "project" as const,
			ts: Date.UTC(p.year, 6, 1),
			url: repoUrl(p.repo),
		})),
	];
	const ms = new MiniSearch(SEARCH_FIELDS);
	ms.addAll(docs);
	const tags: Record<string, number> = {};
	const projectCounts: Record<string, number> = {};
	for (const d of docs) {
		for (const t of d.tags) tags[t] = (tags[t] ?? 0) + 1;
		// count posts only: `@basalt` filters writing
		if (d.kind === "post" && d.project) {
			projectCounts[d.project] = (projectCounts[d.project] ?? 0) + 1;
		}
	}
	return Response.json({ index: ms.toJSON(), tags, projects: projectCounts });
}
