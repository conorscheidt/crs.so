/**
 * Section router, the pure part: route tables plus the click guards as
 * testable functions. The DOM wiring lives in hub.ts / app.ts.
 * Hub ⇄ article travel is same-document: app.ts fetches and swaps with
 * document.startViewTransition, since a cross-document navigation would
 * flash the browser's own cursor, which CSS cannot reach.
 */
export type Section = "index" | "projects" | "writing" | "about";

export const ROUTES: Record<string, Section> = {
	"/": "index",
	"/projects": "projects",
	"/writing": "writing",
	"/about": "about",
};

export const PATHS: Record<Section, string> = {
	index: "/",
	projects: "/projects",
	writing: "/writing",
	about: "/about",
};

export const TITLES: Record<Section, string> = {
	index: "Conor Scheidt",
	projects: "Projects — Conor Scheidt",
	writing: "Writing — Conor Scheidt",
	about: "About — Conor Scheidt",
};

export interface ClickInfo {
	origin: string;
	pathname: string;
	target: string;
	metaKey: boolean;
	ctrlKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
	defaultPrevented: boolean;
}

/** Section to travel to, or null when the browser must handle the click. */
export function interceptable(click: ClickInfo, pageOrigin: string): Section | null {
	if (click.defaultPrevented) return null;
	if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return null;
	if (click.origin !== pageOrigin || click.target !== "") return null;
	return ROUTES[click.pathname] ?? null;
}

export const ARTICLE_RE = /^\/writing\/[^/]+$/;

export type PageKind = "hub" | "article";

/** Which page kind a path renders, or null for anything the browser owns. */
export function pageKind(pathname: string): PageKind | null {
	if (ROUTES[pathname]) return "hub";
	if (ARTICLE_RE.test(pathname)) return "article";
	return null;
}
