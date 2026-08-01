/**
 * Build-time search index, emitted as a static asset and fetched by the
 * client on first search intent. Options come from the shared module; don't
 * inline them here.
 */
import MiniSearch from "minisearch";
import { projects } from "../data/projects";
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
			kind: "post" as const,
			ts: p.data.date.valueOf(),
			url: `/writing/${p.id}`,
		})),
		...projects.map((p) => ({
			id: `project:${p.name}`,
			title: p.name,
			content: p.description,
			tags: p.tags,
			kind: "project" as const,
			ts: Date.UTC(p.year, 6, 1),
			url: p.href ?? "/projects",
		})),
	];
	const ms = new MiniSearch(SEARCH_FIELDS);
	ms.addAll(docs);
	const tags: Record<string, number> = {};
	for (const d of docs) {
		for (const t of d.tags) tags[t] = (tags[t] ?? 0) + 1;
	}
	return Response.json({ index: ms.toJSON(), tags });
}
