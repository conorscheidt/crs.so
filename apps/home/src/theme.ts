/**
 * Theme resolution, pure and unit-tested. Night is the default and
 * prefers-color-scheme is ignored: only a stored override changes the first
 * paint. The inline pre-paint script in Shell.astro duplicates this logic
 * verbatim.
 */
export type Theme = "day" | "night";

export function resolveTheme(stored: string | null): Theme {
	return stored === "day" ? "day" : "night";
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
