// Night is the default; prefers-color-scheme is ignored and only a stored
// choice changes the first paint. Shell.astro's pre-paint script repeats
// resolveTheme inline, so keep the two in step.
export type Theme = "day" | "night";

/** Paper colour per theme, for <meta name="theme-color">. Mirrors global.css. */
export const PAPER: Record<Theme, string> = { night: "#171310", day: "#f2f0ea" };

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

export function setThemeAttr(theme: Theme): void {
	const root = document.documentElement;
	// Hover transitions on themed colours and shadows would otherwise fade
	// between themes while the paper snaps. Held until a frame has been styled.
	root.classList.add("flipping");
	root.dataset.theme = theme;
	document.querySelector('meta[name="theme-color"]')?.setAttribute("content", PAPER[theme]);
	requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("flipping")));
}

export function storeTheme(theme: Theme): void {
	setThemeAttr(theme);
	try {
		localStorage.setItem("crs-theme", theme);
	} catch {}
}
