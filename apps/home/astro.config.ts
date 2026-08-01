import { unified } from "@astrojs/markdown-remark";
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
	// plain cross-origin fetches (the git block against basalt) keep working.
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
	/**
	 * Astro 7 made Sätteri the default Markdown processor and moved plugins onto
	 * the processor itself; the old `markdown.remarkPlugins` top-level keys are
	 * deprecated shims.
	 *
	 * We stay on `unified` because every post here is `.mdx`, and @astrojs/mdx
	 * only inherits remarkPlugins/rehypePlugins from a unified processor. Under
	 * Sätteri it inherits `gfm` and `smartypants` and nothing else, so the maths
	 * would silently stop being typeset. Sätteri parses Markdown natively and is
	 * the better default for a site of `.md` files; this one has none.
	 */
	markdown: {
		processor: unified({
			remarkPlugins: [remarkMath],
			rehypePlugins: [
				[
					rehypeKatex,
					{
						// \htmlClass only — lets equations tag single variables for tandem
						// hover with prose readouts and figure parts.
						trust: (c: { command: string }) => c.command === "\\htmlClass",
						// Trusting the command is not enough: KaTeX gates all HTML
						// extensions behind strict mode as well, and the default
						// ("warn") printed three lines per build while quietly still
						// emitting the classes. Silence exactly the rule we opted into
						// and leave every other strictness check on warn.
						strict: (code: string) => (code === "htmlExtension" ? "ignore" : "warn"),
					},
				],
			],
		}),
	},
	vite: {
		css: {
			transformer: "lightningcss",
			lightningcss: {},
		},
		build: {
			target: "baseline-widely-available",
			// Two chunks are over the 500 kB default and both are meant to be: the
			// run worker (~990 kB, wabt with its wasm inlined) and the article code
			// editor (~710 kB, CodeMirror + five languages + vim). Neither is on any
			// critical path: the worker is fetched when a snippet is first run, the
			// editor when an article idles in. The entry the first paint waits on is
			// ~130 kB. Warn above that, so the number stays meaningful.
			chunkSizeWarningLimit: 1024,
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
