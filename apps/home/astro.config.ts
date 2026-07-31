import { fileURLToPath } from "node:url";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import type { AstroUserConfig } from "astro";
import { svgoOptimizer } from "astro/config";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

export default {
	site: "https://crs.so",
	output: "static",
	trailingSlash: "never",
	build: {
		inlineStylesheets: "auto",
	},
	integrations: [mdx(), sitemap()],
	markdown: {
		remarkPlugins: [remarkMath],
		rehypePlugins: [rehypeKatex],
	},
	vite: {
		resolve: {
			alias: { "@shared": fileURLToPath(new URL("../../shared", import.meta.url)) },
		},
		css: {
			transformer: "lightningcss",
			lightningcss: {},
		},
		build: {
			target: "baseline-widely-available",
			modulePreload: { polyfill: false },
			cssMinify: "lightningcss",
			rolldownOptions: {},
			minify: "oxc",
		},
	},
	prefetch: {
		prefetchAll: true,
		// hover instead of viewport, and no clientPrerender. Speculation-rules *prerender*
		// fully executes linked pages in the background; a page that boots a GPU
		// surface must never be pre-executed. Hover-prefetch fetches HTML only.
		defaultStrategy: "hover",
	},
	prerenderConflictBehavior: "error",
	experimental: {
		contentIntellisense: true,
		svgOptimizer: svgoOptimizer(),
	},
} satisfies AstroUserConfig;
