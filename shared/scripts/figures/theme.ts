/**
 * Shared LaTeX theme for every figure. Values are read live from the page's CSS
 * custom properties so figures follow the light/paper ↔ dark/eclipse toggle.
 * Computer Modern for labels, JetBrains Mono for data, oxblood as the single
 * accent, hairline ink strokes.
 */

export interface FigTheme {
	ink: string;
	inkMuted: string;
	inkFaint: string;
	accent: string;
	accentSoft: string;
	rule: string;
	ruleSoft: string;
	paper: string;
	paper2: string;
	fontLabel: string; // Computer Modern: axis titles, node labels
	fontData: string; // JetBrains Mono: tick numbers, values
	hairline: number;
	stroke: number;
}

function v(cs: CSSStyleDeclaration, name: string, fallback: string): string {
	return cs.getPropertyValue(name).trim() || fallback;
}

export function readTheme(): FigTheme {
	const cs = getComputedStyle(document.documentElement);
	return {
		ink: v(cs, "--color-ink", "#1a1a17"),
		inkMuted: v(cs, "--color-ink-muted", "#6c6a60"),
		inkFaint: v(cs, "--color-ink-faint", "#9d9a8c"),
		accent: v(cs, "--color-accent", "#7a1f1f"),
		accentSoft: v(cs, "--color-accent-soft", "rgba(122,31,31,0.1)"),
		rule: v(cs, "--color-rule", "#d8d3c4"),
		ruleSoft: v(cs, "--color-rule-soft", "#e8e4d8"),
		paper: v(cs, "--color-paper", "#faf8f1"),
		paper2: v(cs, "--color-paper-2", "#f4f1e7"),
		fontLabel: v(cs, "--font-cm", "'CMU Serif', Georgia, serif"),
		fontData: v(cs, "--font-mono", "ui-monospace, monospace"),
		hairline: 1,
		stroke: 1.5,
	};
}

/** Observe the theme toggle; call back with a fresh theme on every flip. */
export function onThemeChange(cb: () => void): () => void {
	const mo = new MutationObserver(cb);
	mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
	return () => mo.disconnect();
}
