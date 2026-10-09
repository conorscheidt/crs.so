import { unified } from "@astrojs/markdown-remark";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { defineConfig, fontProviders, svgoOptimizer } from "astro/config";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

const serif = ["Georgia", "serif"];

export default defineConfig({
	site: "https://crs.so",
	output: "static",
	trailingSlash: "never",
	// The C/C++ runner blocks on a SharedArrayBuffer for stdin, which needs
	// cross-origin isolation. Production sets the same headers in public/_headers.
	server: {
		headers: {
			"Cross-Origin-Opener-Policy": "same-origin",
			"Cross-Origin-Embedder-Policy": "require-corp",
		},
	},
	build: {
		inlineStylesheets: "auto",
	},
	integrations: [mdx(), sitemap()],

	// All three faces come from files already in the repo or node_modules, so a
	// build never touches the network. Fraunces is instanced by
	// scripts/gen-fonts.ts; no published cut has both opsz and SOFT.
	fonts: [
		{
			provider: fontProviders.local(),
			name: "Fraunces",
			cssVariable: "--font-display",
			fallbacks: serif,
			display: "block",
			options: {
				variants: [
					{
						src: ["./src/assets/fonts/fraunces-display.woff2"],
						weight: "100 300",
						style: "normal",
					},
				],
			},
		},
		{
			provider: fontProviders.local(),
			name: "Spectral",
			cssVariable: "--font-text",
			fallbacks: serif,
			display: "block",
			options: {
				variants: [
					{
						src: ["@fontsource/spectral/files/spectral-latin-300-normal.woff2"],
						weight: 300,
						style: "normal",
					},
					{
						src: ["@fontsource/spectral/files/spectral-latin-300-italic.woff2"],
						weight: 300,
						style: "italic",
					},
				],
			},
		},
		{
			provider: fontProviders.local(),
			name: "JetBrains Mono",
			cssVariable: "--font-mark",
			fallbacks: ["ui-monospace", "monospace"],
			display: "block",
			options: {
				variants: [
					{
						src: [
							"@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
						],
						weight: "100 800",
						style: "normal",
					},
				],
			},
		},
	],

	// Every post is .mdx, and @astrojs/mdx only inherits remark/rehype plugins
	// from a unified processor. Under the default (Sätteri) the maths would stop
	// rendering.
	markdown: {
		processor: unified({
			remarkPlugins: [remarkMath],
			rehypePlugins: [
				[
					rehypeKatex,
					{
						// \htmlClass lets an equation tag a variable so it lights up with
						// the matching figure handle and prose readout.
						trust: (c: { command: string }) => c.command === "\\htmlClass",
						strict: (code: string) => (code === "htmlExtension" ? "ignore" : "warn"),
					},
				],
			],
		}),
	},

	vite: {
		css: { transformer: "lightningcss" },
		build: {
			target: "baseline-widely-available",
			cssMinify: "lightningcss",
			minify: "oxc",
			modulePreload: { polyfill: false },
			// The run worker (wabt) and the code editor (CodeMirror) are large and
			// lazy; neither is on the first-paint path.
			chunkSizeWarningLimit: 1024,
		},
	},

	// Only links into articles opt in; hub sections are already in the document.
	// clientPrerender stays off: app.ts swaps <main> in place, so a prerendered
	// page would never be activated, and each would boot its own WebGPU context.
	prefetch: {
		prefetchAll: false,
		defaultStrategy: "viewport",
	},

	prerenderConflictBehavior: "error",
	experimental: {
		contentIntellisense: true,
		svgOptimizer: svgoOptimizer(),
	},
});
