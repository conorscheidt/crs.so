/**
 * Which posts are published. Listings, pages, the feed, sitemap, search index
 * and social cards all go through here, so they always agree. Drafts are never
 * published, in dev or production; to work on the article system, flip `draft`
 * on the kitchen-sink post in content/writing.
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
