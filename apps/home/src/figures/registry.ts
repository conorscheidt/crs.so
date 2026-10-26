/**
 * A figure factory owns a mount element, renders an SVG plate into it with d3
 * and reports live parameters through hooks.onParams. Emphasis is the `lit`
 * class on the svg root, so strokes ease with the site's CSS.
 */
export interface FigureImpl {
	reset: () => void;
	setLit: (on: boolean) => void;
	redraw: () => void;
	destroy: () => void;
	/**
	 * Emphasize only the parts of the plate that carry these parameters (none
	 * clears). Plates whose parameters live in distinct parts implement it, and
	 * a bound term then answers with its own part instead of the whole plate.
	 */
	setFocus?: (params: readonly string[]) => void;
}

export interface FigureHooks {
	onParams: (params: Record<string, number>) => void;
	/** The pointer is over the part carrying these parameters (empty: none). */
	onFocus: (params: readonly string[]) => void;
}

export type FigureFactory = (mount: HTMLElement, hooks: FigureHooks) => FigureImpl;
