/**
 * Atom-style RSS 2.0 feed: a dated, canonical list of every post, for feed
 * readers and crawlers.
 */

import { getCollection } from "astro:content";
import rss from "@astrojs/rss";
import type { APIRoute } from "astro";

export const GET: APIRoute = async (context) => {
	const posts = (await getCollection("writing")).sort(
		(a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
	);
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
