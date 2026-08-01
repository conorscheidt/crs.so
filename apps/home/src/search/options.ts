/**
 * MiniSearch options, imported by both the build-time index endpoint and the
 * client. loadJSON silently breaks if the two sides diverge, so don't inline
 * these anywhere.
 */
export const SEARCH_FIELDS = {
	idField: "id",
	fields: ["title", "content", "tags", "project"],
	storeFields: ["title", "kind", "tags", "project", "ts", "url"],
};

export interface SearchDoc {
	id: string;
	title: string;
	content: string;
	tags: string[];
	/** the project this belongs to: a post's project slug, or a project's own */
	project: string;
	kind: "post" | "project";
	/** epoch ms of the post date / project year */
	ts: number;
	url: string;
}

export interface IndexPayload {
	index: unknown;
	/** tag → number of documents carrying it, for the `#` autocomplete */
	tags: Record<string, number>;
	/** project slug → number of posts in it, for the `@` autocomplete */
	projects: Record<string, number>;
}
