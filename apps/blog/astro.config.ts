import { fileURLToPath } from "node:url";
import { unified } from "@astrojs/markdown-remark";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import type { AstroUserConfig } from "astro";
import { svgoOptimizer } from "astro/config";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { cloudflareStatic } from "../../shared/cloudflare-static";
import { fonts } from "../../shared/fonts";
import { remarkXref } from "../../shared/remark-xref";
import { paperShikiDark, paperShikiLight } from "../../shared/shiki-theme";

export default {
	site: "https://blog.crsche.com",
	output: "static",
	trailingSlash: "always",
	fonts,
	integrations: [sitemap(), mdx()],
	adapter: cloudflareStatic(),
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
		// hover instead of viewport, and no clientPrerender (removed below). Speculation-
		// rules *prerender* fully executes linked pages in the background, each booting
		// its own 200k-particle WebGPU field → CPU saturates → ~2fps + choppy scroll.
		defaultStrategy: "hover",
	},
	prerenderConflictBehavior: "error",
	image: {
		responsiveStyles: true,
		dangerouslyProcessSVG: true, // blog site so SVGs are controlled
	},
	markdown: {
		processor: unified({
			remarkPlugins: [remarkMath, remarkGfm, remarkXref],
			rehypePlugins: [
				// trust a tiny allowlist so equation terms can carry figure cross-refs:
				// `$\htmlData{xref=sigma}{\sigma}$` lights the matching figure part on hover
				[
					rehypeKatex,
					{
						strict: false,
						trust: (ctx: { command: string }) =>
							["\\htmlData", "\\htmlClass", "\\htmlId", "\\href"].includes(ctx.command),
					},
				],
			],
		}),
		shikiConfig: {
			// paper-pastel dual theme (twin of the CodeMirror playground); spans carry
			// --shiki-light/--shiki-dark, prose.css selects per [data-theme]
			themes: { light: paperShikiLight, dark: paperShikiDark },
			defaultColor: false,
			wrap: true,
		},
	},
	experimental: {
		contentIntellisense: true,
		chromeDevtoolsWorkspace: true,
		svgOptimizer: svgoOptimizer(),
	},
} satisfies AstroUserConfig;
