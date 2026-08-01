/**
 * Decides which posts exist. Every surface (listings, pages, feed, sitemap,
 * search index, social cards) goes through here so they agree on what is
 * published.
 *
 * Drafts are never published and no build flag overrides that; `draft: true`
 * is how a post stays out. To work on the article system itself, flip the
 * flag on the bench post under content/writing, then flip it back.
 */

import type { CollectionEntry } from "astro:content";
import { getCollection } from "astro:content";

export type Post = CollectionEntry<"writing">;

export async function publishedPosts(): Promise<Post[]> {
	const all = await getCollection("writing");
	return all
		.filter((p) => !p.data.draft)
		.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}
