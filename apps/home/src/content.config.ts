import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
// astro:content's `z` re-export is deprecated in Astro 7; astro/zod matches
// the version the content pipeline uses.
import { z } from "astro/zod";

const writing = defineCollection({
	loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/writing" }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			date: z.coerce.date(),
			minutes: z.number().int().positive(),
			tags: z.array(z.string()).default([]),
			/** Drafts are left out everywhere: pages, listings, feed, search, cards. */
			draft: z.boolean().default(false),
			/**
			 * The project this post belongs to (a slug from data/projects.ts). The post
			 * links to the project and the project lists the post.
			 */
			project: z.string().optional(),
			/** Social card and lede image, relative to the post. `image()` checks that
			 *  it exists and provides its dimensions. */
			cover: image().optional(),
			coverAlt: z.string().optional(),
		}),
});

export const collections = { writing };
