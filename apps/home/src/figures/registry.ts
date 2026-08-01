/**
 * Figure registry contract. A figure factory owns a mount element, renders an
 * SVG plate into it (d3), and reports live parameters to the prose through
 * hooks.onParams. Emphasis is a CSS class ("lit" on the svg root) so strokes
 * ease on the site's transition curve. Plates are monochrome ink.
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
