import type { AstroUserConfig } from "astro";
import { fontProviders } from "astro/config";

/**
 * Self-hosted, build-time-optimised fonts (Astro Fonts API, local provider).
 *
 * Sources are the already-vendored @fontsource woff2 files (package imports →
 * fully offline, no Google fetch at build). Astro subsets them, emits hashed
 * `/_astro` files, generates the @font-face CSS, and (via <Font preload> in the
 * head) adds `<link rel=preload>` so above-the-fold type paints without a
 * FOUT. `optimizedFallbacks` synthesises a metric-matched fallback → ~zero CLS.
 *
 * Computer Modern (math/captions, below the fold) stays on its plain CSS import;
 * it isn't worth a preload slot.
 */
export const fonts: NonNullable<AstroUserConfig["fonts"]> = [
	{
		name: "Italiana",
		cssVariable: "--font-italiana",
		provider: fontProviders.local(),
		optimizedFallbacks: true,
		fallbacks: ["Georgia", "serif"],
		options: {
			variants: [
				{
					weight: 400,
					style: "normal",
					src: ["@fontsource/italiana/files/italiana-latin-400-normal.woff2"],
				},
			],
		},
	},
	{
		name: "Spectral",
		cssVariable: "--font-spectral",
		provider: fontProviders.local(),
		optimizedFallbacks: true,
		fallbacks: ["Georgia", "serif"],
		options: {
			variants: [
				{
					weight: 400,
					style: "normal",
					src: ["@fontsource/spectral/files/spectral-latin-400-normal.woff2"],
				},
				{
					weight: 500,
					style: "normal",
					src: ["@fontsource/spectral/files/spectral-latin-500-normal.woff2"],
				},
				{
					weight: 400,
					style: "italic",
					src: ["@fontsource/spectral/files/spectral-latin-400-italic.woff2"],
				},
			],
		},
	},
	{
		name: "JetBrains Mono",
		cssVariable: "--font-jetbrains",
		provider: fontProviders.local(),
		optimizedFallbacks: true,
		fallbacks: ["ui-monospace", "monospace"],
		options: {
			variants: [
				{
					weight: "100 800",
					style: "normal",
					src: ["@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2"],
				},
				{
					weight: "100 800",
					style: "italic",
					src: ["@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-italic.woff2"],
				},
			],
		},
	},
];
