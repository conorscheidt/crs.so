/**
 * Cross approximation of the two-asset integrand F. Each step evaluates one row
 * of the black box and pivots on its largest residual, then evaluates the column
 * through the pivot, whose largest residual among the rows not yet used picks the
 * next row. Drag k to add or remove crosses. The readouts count distinct entries
 * and set the error beside that of the truncated SVD of the same rank. Parts: the
 * slider is k, the crosses are the entries evaluated, the reconstruction is its
 * error, and the rank label beneath it carries that error and the SVD's.
 */
import { buildToWidth, type G, plate, varLabel } from "../ink";
import { parts } from "../parts";
import type { FigureFactory, FigureImpl } from "../registry";
import { field, fieldMax, fieldSvd, N } from "./field";
import { cross, lowRank, relativeError } from "./linalg";
import { heatmap, track, trackLabels } from "./ui";

const K_MAX = 8;
const K0 = 3;

export const ttCross: FigureFactory = (mount, hooks): FigureImpl => {
	const result = cross((i, j) => field[i]?.[j] ?? 0, N, N, K_MAX);
	const dec = fieldSvd();
	const optimal = Array.from({ length: K_MAX + 1 }, (_, k) =>
		k === 0 ? 1 : relativeError(field, lowRank(dec, k)),
	);
	const focus = parts(mount, hooks.onFocus);
	let steps = K0;
	let setSteps: (k: number) => void = () => {};

	function build(): void {
		const { svg, w, h } = plate(mount);
		const svgNode = svg.node() as SVGSVGElement;
		const side = Math.min(h - 70, (w - 40) / 2);
		const trackY = Math.min(h - 30, side + 48);
		const g = svg.append("g") as G;
		heatmap(svg, g, 0, 6, side, side).update(field, fieldMax);
		const marks = g.append("g");
		const approx = heatmap(svg, g, side + 32, 6, side, side, "err");
		varLabel(g, side / 2, side + 22, "F");
		const label = g
			.append("text")
			.attr("class", "vlabel")
			.attr("data-part", "err opt")
			.attr("x", side * 1.5 + 32)
			.attr("y", side + 22)
			.attr("text-anchor", "middle");
		const cell = side / N;
		const x0 = side * 0.25;
		const x1 = side * 1.75 + 32;
		const knob = track(g, svgNode, x0, x1, trackY, K_MAX + 1, (k) => setSteps(k), "k");
		trackLabels(g, x0, x1, trackY, "0", String(K_MAX));

		setSteps = (k: number): void => {
			steps = k;
			marks.selectAll("*").remove();
			for (const p of result.pivots.slice(0, k)) {
				marks
					.append("rect")
					.attr("class", "cross")
					.attr("data-part", "k evaluated")
					.attr("x", 0)
					.attr("width", side)
					.attr("y", 6 + side - (p.row + 1) * cell)
					.attr("height", cell);
				marks
					.append("rect")
					.attr("class", "cross")
					.attr("data-part", "k evaluated")
					.attr("x", p.col * cell)
					.attr("width", cell)
					.attr("y", 6)
					.attr("height", side);
			}
			const a = result.approximation(k);
			approx.update(a, fieldMax);
			label.text(`rank ${k}`);
			focus.refresh();
			hooks.onParams({
				k,
				evaluated: result.pivots[k - 1]?.evaluated ?? 0,
				err: k === 0 ? 1 : relativeError(field, a),
				opt: optimal[k] ?? 1,
			});
		};
		knob.set(steps);
	}

	const ro = buildToWidth(mount, build);

	return {
		reset(): void {
			steps = K0;
			build();
		},
		setLit(on: boolean): void {
			mount.querySelector("svg")?.classList.toggle("lit", on);
		},
		setFocus: focus.focus,
		redraw(): void {
			setSteps(steps);
		},
		destroy(): void {
			focus.destroy();
			ro.disconnect();
		},
	};
};
