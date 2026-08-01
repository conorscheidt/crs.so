import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
// astro:content's `z` re-export is deprecated in Astro 7; take zod from the
// astro/zod entrypoint so the version always matches the content pipeline
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
			/** Sample content is visibly marked as such in the UI. */
			sample: z.boolean().default(false),
			/** Social card + article lede image. Relative to the post file;
			 *  `image()` validates it exists and hands the build real dimensions. */
			cover: image().optional(),
			coverAlt: z.string().optional(),
		}),
});

export const collections = { writing };
