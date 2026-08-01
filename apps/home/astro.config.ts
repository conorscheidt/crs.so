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
	// cross-origin isolation in dev/preview: terminal stdin blocks the clang
	// worker on a SharedArrayBuffer. `credentialless` (not require-corp) so
	// plain cross-origin fetches (the Forgejo git block) keep working.
	// Production mirrors these in public/_headers.
	server: {
		headers: {
			"Cross-Origin-Opener-Policy": "same-origin",
			"Cross-Origin-Embedder-Policy": "credentialless",
		},
	},
	build: {
		inlineStylesheets: "auto",
	},
	integrations: [mdx(), sitemap()],
	markdown: {
		remarkPlugins: [remarkMath],
		// \htmlClass only — lets equations tag single variables for tandem
		// hover with prose readouts and figure parts.
		rehypePlugins: [
			[rehypeKatex, { trust: (c: { command: string }) => c.command === "\\htmlClass" }],
		],
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
