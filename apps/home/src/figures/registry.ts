/**
 * Figure registry. Article MDX asks for a figure by kind; implementations
 * live here as plain factories over a canvas. Keep them dependency-free and
 * monochrome.
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

export type FigureFactory = (canvas: HTMLCanvasElement, hooks: FigureHooks) => FigureImpl;
