/**
 * Every duration, easing and motion token on the site. The clock, sim, cursor,
 * Lenis and the CSS custom properties all read from here.
 */
export const MOTION = {
	/** Section morph duration (s); the object and the nav dot move together. */
	morph: 0.85,
	/**
	 * Panel handoff (ms): the outgoing panel lifts out over `leave`, the incoming
	 * one waits `delay` and settles over `arrive`. The .panel CSS mirrors these.
	 */
	panel: { leave: 140, delay: 120, arrive: 220 },
	/** Interrupted jobs speed up by this factor instead of snapping. */
	interruptAccel: 3,
	/**
	 * Cursor ring radius, which is also the sim's dimple radius (CSS px). The GPU
	 * uniform gets cursorR × devicePixelRatio.
	 */
	cursorR: 7,
	/** Lenis wheel smoothing; lower is a longer glide (0.18 felt stiff). */
	scrollLerp: 0.13,
	/** Breathing room above an anchor target after an in-page jump, in px. */
	anchorInset: 28,
	/** Micro-interaction tokens (ms). */
	hover: { ms: 120 },
	press: { ms: 90 },
	/** Sim dot fade-in after init (ms). */
	budget: { simFade: 300 },
} as const;

/** The section morph's curve (cubic ease-out); anything riding the morph uses it. */
export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
