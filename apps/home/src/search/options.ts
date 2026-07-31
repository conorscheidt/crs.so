/**
 * MiniSearch options, imported by both the build-time index endpoint and the
 * client. loadJSON silently breaks if the two sides diverge, so don't inline
 * these anywhere.
 */
export const SEARCH_FIELDS = {
	idField: "id",
	fields: ["title", "content", "tags"],
	storeFields: ["title", "kind", "tags", "ts", "url"],
};

export interface SearchDoc {
	id: string;
	title: string;
	content: string;
	tags: string[];
	kind: "post" | "project";
	/** epoch ms of the post date / project year */
	ts: number;
	url: string;
}

export interface IndexPayload {
	index: unknown;
	tags: Record<string, number>;
}
