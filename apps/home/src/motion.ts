/**
 * Single source of truth for every duration, easing, and motion budget on the
 * site. The conductor, line engine, eclipse machine, reveal choreography, and
 * CSS custom properties (via Shell.astro's define:vars) all derive from this
 * module, so there are no hand-typed duplicates.
 */
export const MOTION = {
	/** Draw-in: constant pen speed, px/s along the colophon path. */
	penSpeed: 1400,
	/** Full first-visit draw-in duration ceiling (s). */
	drawIn: 1.2,
	/** Repeat-visit settle (s). */
	settle: 0.3,
	/** Element settle easing (reveals, non-anchored properties only). */
	easeSettle: "cubic-bezier(0.3, 0.9, 0.22, 1)",
	/** Eclipse transit easing. */
	easeTransit: "cubic-bezier(0.4, 0, 0.2, 1)",
	/** Line-travel ease-out tail (ms). */
	travelTail: 80,
	/** Per-group reveal stagger (ms). */
	stagger: 60,
	/** Eclipse sub-phases (ms): transit → totality hold → corona flash → egress total. */
	eclipse: { transit: 600, hold: 250, flash: 150, egress: 900 },
	/** Interrupted animations accelerate by this factor instead of snapping. */
	interruptAccel: 3,
	/** Budgets (ms): first paper frame, fully composed page, font-gate cap. */
	budget: { paper: 400, composed: 2200, fontGate: 600 },
	/** Micro-interaction tokens: [property-delta, ms]. */
	hover: { inkDelta: 0.15, ms: 120 },
	press: { dy: 1, ms: 90 },
	release: { ms: 180 },
} as const;
