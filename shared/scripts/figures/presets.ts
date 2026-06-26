/**
 * Typed builders for the common figure shapes. Import in MDX and pass the result
 * straight to `<Fig spec={…} />`. Each returns a typed FigSpec subtype, so the
 * editor autocompletes the arguments and `astro check` catches mistakes. They run
 * at build time and emit plain JSON, so there's no client cost.
 *
 *   import { barChart, pipeline, comparison } from '../../scripts/figures/presets';
 *   <Fig n={1} spec={barChart([["naive", 100], ["SIMD", 46], ["GPU", 20]], { yUnit: "ms" })} />
 */
import type {
	CellRow,
	CellsSpec,
	ChartDatum,
	ChartSpec,
	FlowEdge,
	FlowNode,
	FlowSpec,
} from "./types";

type ChartOpts = Omit<ChartSpec, "type" | "kind" | "data">;
type BarInput = ChartDatum | [x: string | number, y: number];

const toDatum = (d: BarInput): ChartDatum => (Array.isArray(d) ? { x: d[0], y: d[1] } : d);

/** A bar chart. Pass `["label", value]` tuples, or full data for xref/highlight. */
export function barChart(data: BarInput[], opts: ChartOpts = {}): ChartSpec {
	return { type: "chart", kind: "bar", data: data.map(toDatum), ...opts };
}

/** A line chart. Same inputs as {@link barChart}. */
export function lineChart(data: BarInput[], opts: ChartOpts = {}): ChartSpec {
	return { type: "chart", kind: "line", data: data.map(toDatum), ...opts };
}

type Stage =
	| string
	| {
			label: string;
			id?: string;
			kind?: FlowNode["kind"];
			xref?: string;
			/** add a self-loop with this label (e.g. "integrate") */
			loop?: string;
	  };

/** A linear left→right pipeline: stages in order, edges wired between neighbours. */
export function pipeline(stages: Stage[], opts: { height?: number } = {}): FlowSpec {
	const nodes: FlowNode[] = [];
	const edges: FlowEdge[] = [];
	stages.forEach((s, i) => {
		const stage = typeof s === "string" ? { label: s } : s;
		const id = stage.id ?? `s${i}`;
		nodes.push({ id, label: stage.label, rank: i, kind: stage.kind, xref: stage.xref });
		if (i > 0) edges.push({ from: nodes[i - 1].id, to: id });
		if (typeof s === "object" && s.loop)
			edges.push({ from: id, to: id, loop: true, label: s.loop });
	});
	return { type: "flow", nodes, edges, ...opts };
}

/** A general flow/DAG: typed passthrough for branches the linear {@link pipeline} can't express. */
export function flow(
	nodes: FlowNode[],
	edges: FlowEdge[],
	opts: { height?: number } = {},
): FlowSpec {
	return { type: "flow", nodes, edges, ...opts };
}

type RowInput = CellRow | [label: string, cells: string[]];

/** A row-of-cells comparison (e.g. memory layouts). Pass `[label, cells]` or full rows. */
export function comparison(rows: RowInput[], opts: { height?: number } = {}): CellsSpec {
	return {
		type: "cells",
		rows: rows.map((r) => (Array.isArray(r) ? { label: r[0], cells: r[1] } : r)),
		...opts,
	};
}
