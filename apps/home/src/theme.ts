/**
 * Theme resolution, pure and unit-tested. Light is the default regardless of
 * prefers-color-scheme: only a stored override changes the first paint. The
 * inline pre-paint script in Shell.astro duplicates this logic verbatim (it
 * cannot import modules); theme.test.ts defines the expected behaviour.
 */
export type Theme = "day" | "night";

export function resolveTheme(stored: string | null): Theme {
	return stored === "night" ? "night" : "day";
}

export function readTheme(): Theme {
	let stored: string | null = null;
	try {
		stored = localStorage.getItem("crs-theme");
	} catch {}
	return resolveTheme(stored);
}

/** DOM-only application (pageshow restore, boot re-assert). */
export function setThemeAttr(theme: Theme): void {
	document.documentElement.dataset.theme = theme;
}

/** User action: apply and persist. */
export function storeTheme(theme: Theme): void {
	setThemeAttr(theme);
	try {
		localStorage.setItem("crs-theme", theme);
	} catch {}
}
