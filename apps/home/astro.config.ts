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
	// Astro hashes every script and style it emits into a <meta> policy. Styles
	// keep 'unsafe-inline' because KaTeX and view-transition names are style
	// attributes, which a hash can't cover.
	security: {
		csp: {
			directives: [
				"default-src 'self'",
				"connect-src 'self' https://cloudflareinsights.com",
				"img-src 'self' data:",
				"worker-src 'self'",
				"object-src 'none'",
				"base-uri 'none'",
				"form-action 'none'",
			],
			scriptDirective: { resources: ["'self'", "https://static.cloudflareinsights.com"] },
			styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
		},
	},
	integrations: [mdx(), sitemap()],

	// All three faces come from files already in the repo or node_modules, so a
	// build never touches the network. Fraunces is instanced by
	// scripts/gen-fonts.ts; no published cut has both opsz and SOFT. The text faces
	// block for ~100 ms, then show the metric-matched fallback until they arrive.
	fonts: [
		{
			provider: fontProviders.local(),
			name: "Fraunces",
			cssVariable: "--font-display",
			fallbacks: serif,
			display: "fallback",
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
			display: "fallback",
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
			display: "swap",
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
		// Code blocks are <Code> components; Shiki's inline styles would also need
		// style-src exceptions.
		syntaxHighlight: false,
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
			// Small KaTeX fonts would otherwise be inlined as data: URIs, which the
			// CSP's font-src rightly refuses (and which bloat render-blocking CSS).
			assetsInlineLimit: (file) => (/\.(woff2?|ttf)$/.test(file) ? false : undefined),
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
