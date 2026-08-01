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
		/**
		 * `viewport` issues <link rel="prefetch"> for links as they scroll into
		 * view: the HTML lands in the HTTP cache and nothing is executed. Our
		 * same-document navigator fetches the same URL, so it hits that warm
		 * cache and the swap is instant.
		 *
		 * `clientPrerender` stays off. Speculation-rules *prerender* fully runs
		 * the target page in a hidden tab (a second WebGPU context, a second
		 * clock, a second clang worker), which runs the animations offscreen and
		 * lags the browser. Prefetch is bytes; prerender is a whole extra runtime.
		 */
		defaultStrategy: "viewport",
	},
	prerenderConflictBehavior: "error",
	experimental: {
		contentIntellisense: true,
		svgOptimizer: svgoOptimizer(),
	},
} satisfies AstroUserConfig;
