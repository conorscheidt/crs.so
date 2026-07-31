import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const writing = defineCollection({
	loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/writing" }),
	schema: z.object({
		title: z.string(),
		description: z.string(),
		date: z.coerce.date(),
		minutes: z.number().int().positive(),
		tags: z.array(z.string()).default([]),
		/** Sample content is visibly marked as such in the UI. */
		sample: z.boolean().default(false),
	}),
});

export const collections = { writing };
