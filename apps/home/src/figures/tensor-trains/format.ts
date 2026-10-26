/**
 * The ten-asset train evaluated at one point of its grid. Core G_k stores ten
 * r_{k-1} × r_k matrices, one per node of x_k, and the lane under it picks the
 * node. Each chosen slice stands above the row vector it produces, with the
 * vector it multiplies immediately to the left, so the bottom row reads
 * v_k = v_{k-1} G_k(x_k) from v_0 = 1 to the 1 × 1 value. A cell is inked by
 * its magnitude against the largest entry of its own matrix or vector and drawn
 * open when negative. When article.css gives the plate two rows' height, the
 * train wraps after G_5 and the second row starts again from v_5. Parts: each
 * core's label, slice, lane and node value are g{k} and x{k}; cores 3 to 8
 * report themselves to the prose as the ⋯ of the product too, and mid lights
 * them all; slice lights every chosen matrix, as the generic G_k(x_k), and so
 * does stored; madds adds the vectors they multiply; carry is the vectors
 * between cores, what each prefix passes on; value is the last cell and the
 * train's number, exact the integrand's number, and err both numbers.
 */
import { drag } from "d3-drag";
import { scaleLinear } from "d3-scale";
import { buildToWidth, type G, handle, plate } from "../ink";
import { parts } from "../parts";
import type { FigureFactory, FigureImpl } from "../registry";
import { type Core, cores, grid } from "./data";
import { smoothed } from "./model";
import { evaluate } from "./train";

const D = cores.length;
const LAST = grid.nodes.length - 1;
/** The starting point: x = −0.48 and 0.48 alternately, the nodes nearest the origin. */
export const START: readonly number[] = Array.from({ length: D }, (_, k) => 4 + (k % 2));
/** Numbers the train stores, Σ r_{k-1} n r_k. */
export const stored = cores.reduce((s, c) => s + c.r0 * c.n * c.r1, 0);
/** Multiply–adds in one evaluation on the grid, Σ r_{k-1} r_k. */
export const madds = cores.reduce((s, c) => s + c.r0 * c.r1, 0);

const absMax = (xs: ArrayLike<number>): number => {
	let m = 0;
	for (let j = 0; j < xs.length; j++) m = Math.max(m, Math.abs(xs[j] ?? 0));
	return m;
};
const tallest = Math.max(...cores.map((c) => c.r0));
const ONE = Float64Array.of(1);
const SUB = "₀₁₂₃₄₅₆₇₈₉";
const subscript = (k: number): string => [...String(k)].map((c) => SUB[Number(c)] ?? c).join("");
const signed = (v: number, digits: number): string => v.toFixed(digits).replace("-", "−");
/** Four significant figures, at most three decimals: 8.481, 23.15, 254.3. */
const figures = (v: number): string =>
	signed(v, Math.min(3, Math.max(0, 3 - Math.floor(Math.log10(Math.abs(v) || 1)))));

/** G_k(x_i) as a row-major r_{k-1} × r_k matrix. */
export function slice(core: Core, i: number): Float64Array {
	const out = new Float64Array(core.r0 * core.r1);
	for (let a = 0; a < core.r0; a++)
		out.set(
			core.data.subarray((a * core.n + i) * core.r1, (a * core.n + i + 1) * core.r1),
			a * core.r1,
		);
	return out;
}

/** The row vectors v_k = v_{k-1} G_k(x_{i_k}) for k = 1 … d, from v_0 = 1. */
export function carried(index: readonly number[], train: readonly Core[] = cores): Float64Array[] {
	let v = ONE;
	return train.map((core, k) => {
		const m = slice(core, index[k] ?? 0);
		const next = new Float64Array(core.r1);
		for (let a = 0; a < core.r0; a++) {
			const va = v[a] ?? 0;
			for (let b = 0; b < core.r1; b++) next[b] = (next[b] ?? 0) + va * (m[a * core.r1 + b] ?? 0);
		}
		v = next;
		return next;
	});
}

export const pointOf = (index: readonly number[]): Float64Array =>
	Float64Array.from(index, (i) => grid.nodes[i] ?? 0);

/** Horizontal space between blocks, and what each row keeps free at its ends. */
const GAP = 8;
const LEFT = 2;
/** The 6px offset, then "exact 254.3": eleven 5.1px characters of 8.5px JetBrains Mono. */
const VALUE_W = 66;
const DISC_W = 36;
const MAX_CELL = 9;
/** A row's fixed height: core label, the gaps around the vector, node values. */
const ROW_FIXED = 60;
const ROW_GAP = 18;
const LANE_MIN = 44;
/** A plate this tall holds two rows; article.css sets that height on a narrow column. */
const TWO_ROWS = 300;

/** Where a row puts v_k, and whether G_k stands above it (no: the row's first vector). */
interface Block {
	readonly k: number;
	readonly lead: boolean;
}

const blocks = (from: number, to: number): Block[] => [
	{ k: from, lead: true },
	...Array.from({ length: to - from }, (_, j) => ({ k: from + j + 1, lead: false })),
];
const rank = (k: number): number => (k === 0 ? 1 : (cores[k - 1]?.r1 ?? 1));
const width = (row: readonly Block[]): number => row.reduce((s, b) => s + rank(b.k), 0);

type Painter = (values: ArrayLike<number>) => void;

/**
 * A rows × cols block of cells at (x, y) in g, framed; returns the function that
 * inks it. The frame also carries `extra`, which only a bound term can light:
 * a box over the whole block hands the pointer to g.
 */
function cells(
	g: G,
	x: number,
	y: number,
	rows: number,
	cols: number,
	c: number,
	extra = "",
): Painter {
	const s = Math.max(1, c - 1);
	const rects = Array.from({ length: rows * cols }, () => g.append("rect"));
	g.append("rect")
		.attr("class", "heatframe")
		.attr("data-part", `${g.attr("data-part") ?? ""} ${extra}`.trim() || null)
		.attr("x", x - 1.5)
		.attr("y", y - 1.5)
		.attr("width", cols * c + 2)
		.attr("height", rows * c + 2);
	g.append("rect")
		.attr("class", "hitbox")
		.attr("x", x - 2.5)
		.attr("y", y - 2.5)
		.attr("width", cols * c + 4)
		.attr("height", rows * c + 4);
	return (values) => {
		const peak = absMax(values);
		for (const [j, rect] of rects.entries()) {
			const v = values[j] ?? 0;
			const inset = v < 0 ? 0.5 : 0;
			rect
				.attr("class", v < 0 ? "cell neg" : "cell")
				.attr("x", x + (j % cols) * c + inset)
				.attr("y", y + Math.floor(j / cols) * c + inset)
				.attr("width", s - 2 * inset)
				.attr("height", s - 2 * inset)
				.attr("opacity", peak > 0 ? (Math.abs(v) / peak) ** 0.75 : 0);
		}
	};
}

/** The cores the ⋯ of G_1(x_1) G_2(x_2) ⋯ G_d(x_d) stands for. */
const MID = Array.from({ length: D - 3 }, (_, j) => `g${j + 3}`);

export const ttFormat: FigureFactory = (mount, hooks): FigureImpl => {
	// a core in the middle answers as itself here and as the ⋯ in the prose
	const focus = parts(mount, (params) =>
		hooks.onFocus(params.some((p) => MID.includes(p)) ? [...params, "mid"] : params),
	);
	const index = [...START];
	let update: () => void = () => {};

	function build(): void {
		const { svg, w, h } = plate(mount);
		const svgNode = svg.node() as SVGSVGElement;
		const g = svg.append("g") as G;
		const split = h >= TWO_ROWS ? Math.ceil(D / 2) : D;
		const rows = split === D ? [blocks(0, D)] : [blocks(0, split), blocks(split, D)];
		const rowH = (h - (rows.length - 1) * ROW_GAP) / rows.length;
		// the reset disc sits over the top right of the first row; the value ends the last
		const room = (r: number): number =>
			LEFT + (r === rows.length - 1 ? VALUE_W : DISC_W) + ((rows[r]?.length ?? 1) - 1) * GAP;
		const c = Math.min(
			MAX_CELL,
			(rowH - ROW_FIXED - LANE_MIN) / (tallest + 1),
			...rows.map((row, r) => (w - room(r)) / width(row)),
		);

		const slices: { k: number; paint: Painter }[] = [];
		const vectors: { k: number; paint: Painter }[] = [];
		const knobs: { k: number; set: (i: number) => void }[] = [];
		let valueLabel = g.append("text");
		let exactLabel = g.append("text");

		for (const [r, row] of rows.entries()) {
			const top = r * (rowH + ROW_GAP);
			const vy = top + 16 + tallest * c + 6;
			const laneTop = vy + c + 16;
			const laneBottom = top + rowH - 22;
			const ys = scaleLinear([grid.nodes[0] ?? -1, grid.nodes[LAST] ?? 1], [laneBottom, laneTop]);
			const zero = g.append("line").attr("class", "grid").attr("y1", ys(0)).attr("y2", ys(0));
			const lanes: number[] = [];
			let bx = LEFT;
			for (const b of row) {
				const cols = rank(b.k);
				const cx = bx + (cols * c) / 2;
				const vector = g.append("g");
				if (b.k === D) vector.attr("data-part", "value");
				else if (b.k > 0) vector.attr("data-part", "carry");
				vectors.push({ k: b.k, paint: cells(vector, bx, vy, 1, cols, c, "madds") });
				if (b.k === 0)
					g.append("text")
						.attr("class", "tlabel")
						.attr("x", cx)
						.attr("y", vy + c + 11)
						.attr("text-anchor", "middle")
						.text("1");
				if (b.k === D) {
					valueLabel = g
						.append("text")
						.attr("class", "vlabel")
						.attr("data-part", "value err")
						.attr("x", bx + cols * c + 6)
						.attr("y", vy + c - 0.5);
					exactLabel = g
						.append("text")
						.attr("class", "tlabel")
						.attr("data-part", "exact err")
						.attr("x", bx + cols * c + 6)
						.attr("y", vy + c + 11);
				}
				const core = cores[b.k - 1];
				if (!b.lead && core) {
					const k = b.k - 1;
					const part = `g${b.k} x${b.k}`;
					const held = g.append("g").attr("data-part", part);
					slices.push({
						k: b.k,
						paint: cells(held, bx, vy - 6 - core.r0 * c, core.r0, core.r1, c, "slice stored madds"),
					});
					g.append("text")
						.attr("class", "vlabel")
						.attr("data-part", part)
						.attr("x", cx)
						.attr("y", top + 11)
						.attr("text-anchor", "middle")
						.text(`G${subscript(b.k)}`);

					// the lane is as wide as its block, so the whole column takes a press
					const reach = Math.max(28, cols * c + GAP);
					const lane = g.append("g").attr("data-part", part);
					lane
						.append("rect")
						.attr("class", "hitbox")
						.attr("x", cx - reach / 2)
						.attr("width", reach)
						.attr("y", laneTop - 8)
						.attr("height", laneBottom - laneTop + 16);
					lane
						.append("line")
						.attr("class", "axis-line")
						.attr("x1", cx)
						.attr("x2", cx)
						.attr("y1", laneTop)
						.attr("y2", laneBottom);
					for (const x of grid.nodes)
						lane
							.append("line")
							.attr("class", "axis-line")
							.attr("x1", cx - 3)
							.attr("x2", cx + 3)
							.attr("y1", ys(x))
							.attr("y2", ys(x));
					const knob = handle(lane).attr("data-part", part);
					const node = lane
						.append("text")
						.attr("class", "tlabel")
						.attr("data-part", part)
						.attr("x", cx)
						.attr("y", top + rowH - 5)
						.attr("text-anchor", "middle");
					knobs.push({
						k,
						set: (i: number): void => {
							const x = grid.nodes[i] ?? 0;
							knob.attr("transform", `translate(${cx},${ys(x)})`);
							node.text(signed(x, 2));
						},
					});
					const pick = (y: number): void => {
						let best = 0;
						for (const [i, x] of grid.nodes.entries())
							if (Math.abs(ys(x) - y) < Math.abs(ys(grid.nodes[best] ?? 0) - y)) best = i;
						if (best === index[k]) return;
						index[k] = best;
						update();
					};
					lane.call(
						drag<SVGGElement, unknown>()
							.on("start", (ev: { y: number }) => {
								svgNode.classList.add("dragging");
								pick(ev.y);
							})
							.on("drag", (ev: { y: number }) => pick(ev.y))
							.on("end", () => svgNode.classList.remove("dragging")),
					);
					lanes.push(cx);
				}
				bx += cols * c + GAP;
			}
			const first = lanes[0] ?? 0;
			zero.attr("x1", first - 10).attr("x2", (lanes.at(-1) ?? first) + 10);
			g.append("text")
				.attr("class", "tlabel")
				.attr("x", first - 14)
				.attr("y", ys(0) + 3)
				.attr("text-anchor", "end")
				.text("0");
		}

		update = (): void => {
			const vs = carried(index);
			for (const s of slices) {
				const core = cores[s.k - 1];
				if (core) s.paint(slice(core, index[s.k - 1] ?? 0));
			}
			for (const v of vectors) v.paint(vs[v.k - 1] ?? ONE);
			for (const knob of knobs) knob.set(index[knob.k] ?? 0);
			const z = pointOf(index);
			const value = evaluate(z);
			const exact = smoothed(z);
			valueLabel.text(`= ${figures(value)}`);
			exactLabel.text(`exact ${figures(exact)}`);
			focus.refresh();
			const params: Record<string, number> = {
				value,
				exact,
				err: Math.abs(value - exact) / exact,
				stored,
				madds,
				points: grid.nodes.length ** D,
			};
			for (const [k, i] of index.entries()) {
				params[`i${k + 1}`] = i + 1;
				params[`x${k + 1}`] = z[k] ?? 0;
			}
			hooks.onParams(params);
		};
		update();
	}

	const ro = buildToWidth(mount, build);

	return {
		reset(): void {
			index.splice(0, D, ...START);
			build();
		},
		setLit(on: boolean): void {
			mount.querySelector("svg")?.classList.toggle("lit", on);
		},
		setFocus(params: readonly string[]): void {
			focus.focus(params.flatMap((p) => (p === "mid" ? MID : [p])));
		},
		redraw(): void {
			update();
		},
		destroy(): void {
			focus.destroy();
			ro.disconnect();
		},
	};
};
