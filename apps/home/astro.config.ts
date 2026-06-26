import { fileURLToPath } from "node:url";
// import { cloudflareStatic } from "../../shared/cloudflare-static";
import cloudflare from "@astrojs/cloudflare";
import { unified } from "@astrojs/markdown-remark";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import type { AstroUserConfig } from "astro";
import { svgoOptimizer } from "astro/config";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { fonts } from "../../shared/fonts";

export default {
	site: "https://crsche.com",
	output: "static",
	trailingSlash: "always",
	fonts,
	build: {
		// Single-page site: inline all CSS, zero render-blocking requests
		inlineStylesheets: "auto",
	},
	integrations: [sitemap(), mdx()],
	adapter: cloudflare(),
	markdown: {
		processor: unified({
			remarkPlugins: [remarkMath],
			rehypePlugins: [rehypeKatex],
		}),
		shikiConfig: {
			theme: "vitesse-dark",
			wrap: true,
		},
	},
	vite: {
		plugins: [tailwindcss()],
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
		devtools: true,
	},
	prefetch: {
		prefetchAll: true,
		// hover instead of viewport, and no clientPrerender. Speculation-rules *prerender*
		// fully executes linked pages in the background, and each one boots its own
		// 200k-particle WebGPU field → CPU saturates → ~2fps + choppy scroll. Plain
		// hover-prefetch fetches HTML only (no execution), keeping nav snappy.
		defaultStrategy: "hover",
	},
	prerenderConflictBehavior: "error",
	image: {
		responsiveStyles: true,
		dangerouslyProcessSVG: true,
	},
	experimental: {
		contentIntellisense: true,
		chromeDevtoolsWorkspace: true,
		svgOptimizer: svgoOptimizer(),
	},
} satisfies AstroUserConfig;
