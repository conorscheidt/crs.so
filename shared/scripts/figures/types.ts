/** Declarative figure specs. Authored in MDX, rendered by the D3 layer. */

export interface ChartDatum {
	x: string | number;
	y: number;
	label?: string;
	/** cross-ref key → links to a [[key]] term in the prose */
	xref?: string;
	/** draw emphasised (accent) */
	highlight?: boolean;
}
export interface ChartSpec {
	type: "chart";
	kind: "bar" | "line";
	data: ChartDatum[];
	xLabel?: string;
	yLabel?: string;
	/** d3-format string for the y axis + tooltip, e.g. ".0f", "$.2s" */
	yFormat?: string;
	yUnit?: string;
	height?: number;
	/** log y scale (wide dynamic range) */
	logY?: boolean;
}

export interface FlowNode {
	id: string;
	label: string;
	/** column index, left→right */
	rank: number;
	kind?: "process" | "decision" | "io";
	xref?: string;
}
export interface FlowEdge {
	from: string;
	to: string;
	label?: string;
	/** self-loop (e.g. "integrate") */
	loop?: boolean;
}
export interface FlowSpec {
	type: "flow";
	nodes: FlowNode[];
	edges: FlowEdge[];
	height?: number;
}

export interface CellRow {
	label: string;
	cells: string[];
	accent?: boolean;
	xref?: string;
	note?: string;
}
export interface CellsSpec {
	type: "cells";
	rows: CellRow[];
	height?: number;
}

export type FigSpec = ChartSpec | FlowSpec | CellsSpec;

export interface RenderCtx {
	/** current scrollytelling step (−1 = none), renderers may emphasise by step */
	step: number;
}
