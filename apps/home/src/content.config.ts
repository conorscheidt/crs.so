import { glob } from "astro/loaders";
import { defineCollection, z } from "astro:content";

const writing = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/writing" }),
	schema: z.object({
		title: z.string(),
		description: z.string(),
		date: z.coerce.date(),
		minutes: z.number().int().positive(),
		/** Sample content is visibly marked as such in the UI. */
		sample: z.boolean().default(false),
	}),
});

export const collections = { writing };
