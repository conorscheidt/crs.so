/**
 * Theme resolution, kept pure so it is unit-testable. The inline pre-paint
 * script in Shell.astro duplicates this logic verbatim (it cannot import
 * modules); theme.test.ts defines the behaviour both must match.
 */
export type Theme = "day" | "night";

export function resolveTheme(stored: string | null, prefersDark: boolean): Theme {
	if (stored === "day" || stored === "night") return stored;
	return prefersDark ? "night" : "day";
}

/** First visit this session gets the full draw-in; later loads get the settle. */
export function resolveReveal(sessionSeen: boolean, navigatedInternally: boolean): "draw" | "settle" {
	return sessionSeen || navigatedInternally ? "settle" : "draw";
}
