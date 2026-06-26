import type { AstroIntegration } from "astro";

/**
 * Minimal adapter marker for fully-prerendered Cloudflare deployments.
 *
 * astro-static-headers selects its `_headers` output format from the
 * configured adapter's name. A fully static site needs no server adapter,
 * and the real `@astrojs/cloudflare` (peer: astro ^6.3) deadlocks under
 * astro 7 alpha, so this shim provides only the name.
 *
 * TODO: swap for the real adapter when it supports astro 7.
 */
export function cloudflareStatic(): AstroIntegration {
	return { name: "@astrojs/cloudflare", hooks: {} };
}
