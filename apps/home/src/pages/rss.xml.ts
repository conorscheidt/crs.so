/**
 * Atom-style RSS 2.0 feed: a dated, canonical list of every post, for feed
 * readers and crawlers.
 */

import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { publishedPosts } from "../lib/posts";

export const GET: APIRoute = async (context) => {
	const posts = await publishedPosts();
	return rss({
		title: "Conor Scheidt — Writing",
		description:
			"Writing by Conor Scheidt.",
		site: context.site ?? "https://crs.so",
		trailingSlash: false,
		items: posts.map((p) => ({
			title: p.data.title,
			description: p.data.description,
			pubDate: p.data.date,
			link: `/writing/${p.id}`,
			categories: p.data.tags,
		})),
		customData: "<language>en-us</language>",
	});
};
