/**
 * Decides which posts exist. Drafts are visible in dev and absent from the
 * production build. Every surface (listings, pages, feed, sitemap, search
 * index, social cards) goes through here so they agree on what is published.
 */

import type { CollectionEntry } from "astro:content";
import { getCollection } from "astro:content";

export type Post = CollectionEntry<"writing">;

export async function publishedPosts(): Promise<Post[]> {
	const all = await getCollection("writing");
	return all
		.filter((p) => import.meta.env.DEV || !p.data.draft)
		.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}
