/**
 * Single source of truth for every duration, easing, and motion token on the
 * site. The clock, sim, cursor, lenis setup, and CSS custom properties all
 * derive from this module, so there are no hand-typed duplicates.
 */
export const MOTION = {
	/** Section morph duration (s); object and panel travel together. */
	morph: 0.85,
	/** Panel crossfade (ms). */
	panel: 240,
	/** Interrupted jobs accelerate by this factor instead of snapping. */
	interruptAccel: 3,
	/**
	 * Cursor ring radius == sim dimple radius, in CSS px.
	 * The GPU uniform receives cursorR × devicePixelRatio.
	 */
	cursorR: 13,
	/** Lenis wheel smoothing (good range 0.16–0.22, tested on a trackpad). */
	scrollLerp: 0.18,
	/** Micro-interaction tokens (ms). */
	hover: { ms: 120 },
	press: { ms: 90 },
	/** Budgets (ms): sim dot fade-in after init, font-gate cap. */
	budget: { simFade: 300, fontGate: 600 },
} as const;
