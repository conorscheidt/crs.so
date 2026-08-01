/**
 * Per-page social cards, rendered at build time (one PNG per article plus the
 * four hub routes). Static output → they land in dist as plain files and are
 * served with the immutable-ish asset headers.
 */
import { getCollection } from "astro:content";
import type { APIRoute, GetStaticPaths } from "astro";
import { renderOg } from "../../lib/og";

export const getStaticPaths: GetStaticPaths = async () => {
	const posts = await getCollection("writing");
	return [
		{
			params: { slug: "index" },
			props: { title: "Conor Scheidt", kicker: "software · mathematics" },
		},
		{ params: { slug: "projects" }, props: { title: "Projects", kicker: "conor scheidt" } },
		{ params: { slug: "writing" }, props: { title: "Writing", kicker: "conor scheidt" } },
		{ params: { slug: "about" }, props: { title: "About", kicker: "conor scheidt" } },
		...posts.map((p) => ({
			params: { slug: `writing/${p.id}` },
			props: {
				title: p.data.title,
				kicker: p.data.date.toLocaleDateString("en-US", {
					year: "numeric",
					month: "long",
					day: "numeric",
				}),
			},
		})),
	];
};

export const GET: APIRoute = async ({ props }) => {
	const png = await renderOg(props as { title: string; kicker?: string });
	return new Response(new Uint8Array(png), {
		headers: {
			"content-type": "image/png",
			"cache-control": "public, max-age=604800, must-revalidate",
		},
	});
};
