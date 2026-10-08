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
}

export interface FigureHooks {
	onParams: (params: Record<string, number>) => void;
}

export type FigureFactory = (mount: HTMLElement, hooks: FigureHooks) => FigureImpl;
