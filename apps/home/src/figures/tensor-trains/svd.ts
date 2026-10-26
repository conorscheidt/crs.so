/**
 * Truncated SVD of the two-asset integrand. Drag r along the spectrum, drawn as
 * σ/σ₁; the reconstruction, its Frobenius error, the error of its sum and the
 * storage count follow. F already carries the density, so the relative error
 * of the integral is that of the plain sum. Parts: the kept singular values and
 * the slider are r (and what r costs in storage), and the reconstruction
 * carries both errors.
 */
import { scaleBand } from "d3-scale";
import { buildToWidth, type G, plate, varLabel } from "../ink";
import { parts } from "../parts";
import type { FigureFactory, FigureImpl } from "../registry";
import { field, fieldMax, fieldSvd, N } from "./field";
import { lowRank, type Matrix, relativeError } from "./linalg";
import { heatmap, logScale, pow10, track, trackLabels } from "./ui";

const R_MAX = 12;
const SHOWN = 16;
const R0 = 3;
const SUB = "₀₁₂₃₄₅₆₇₈₉";
const subscript = (k: number): string => [...String(k)].map((c) => SUB[Number(c)] ?? c).join("");
const total = (m: Matrix): number => m.reduce((s, row) => row.reduce((t, v) => t + v, s), 0);
const integral = total(field);

export const ttSvd: FigureFactory = (mount, hooks): FigureImpl => {
	const dec = fieldSvd();
	const sigma0 = dec.s[0] ?? 1;
	const focus = parts(mount, hooks.onFocus);
	let rank = R0;
	let setRank: (r: number) => void = () => {};

	function build(): void {
		const { svg, w, h } = plate(mount);
		const svgNode = svg.node() as SVGSVGElement;
		// on a narrow column the heatmaps shrink and the spectrum keeps 120px
		const side = Math.min(h - 44, (w - 172) / 2);
		const labelY = side + 26;
		const trackY = side + 14;
		const g = svg.append("g") as G;
		heatmap(svg, g, 0, 6, side, side).update(field, fieldMax);
		const approx = heatmap(svg, g, side + 18, 6, side, side, "err ierr");
		varLabel(g, side / 2, labelY, "F");
		const label = g
			.append("text")
			.attr("class", "vlabel")
			.attr("data-part", "err ierr")
			.attr("x", side * 1.5 + 18)
			.attr("y", labelY)
			.attr("text-anchor", "middle");

		const x0 = 2 * side + 52;
		const { scale: y, decades } = logScale([1e-4, 1], [side + 6, 8]);
		const band = scaleBand<number>()
			.domain(Array.from({ length: SHOWN }, (_, k) => k))
			.range([x0, w - 4])
			.padding(0.25);
		for (const e of decades.filter((dec2) => dec2 % 2 === 0)) {
			const v = 10 ** e;
			g.append("line")
				.attr("class", "grid")
				.attr("x1", x0)
				.attr("x2", w - 4)
				.attr("y1", y(v))
				.attr("y2", y(v));
			g.append("text")
				.attr("class", "tlabel")
				.attr("x", x0 - 6)
				.attr("y", y(v) + 3)
				.attr("text-anchor", "end")
				.text(pow10(e));
		}
		const bars = Array.from({ length: SHOWN }, (_, k) => {
			const top = y(Math.max((dec.s[k] ?? 0) / sigma0, 1e-4));
			return g
				.append("rect")
				.attr("x", band(k) ?? x0)
				.attr("width", band.bandwidth())
				.attr("y", top)
				.attr("height", side + 6 - top);
		});
		// left of the reset disc, which covers the plate's top right corner
		g.append("text")
			.attr("class", "vlabel")
			.attr("x", w - 40)
			.attr("y", 12)
			.attr("text-anchor", "end")
			.text("σ/σ₁");

		const first = (band(0) ?? x0) + band.bandwidth() / 2;
		const last = (band(R_MAX - 1) ?? x0) + band.bandwidth() / 2;
		const knob = track(g, svgNode, first, last, trackY, R_MAX, (k) => setRank(k + 1), "r");
		trackLabels(g, first, last, trackY, "1", String(R_MAX));

		setRank = (r: number): void => {
			rank = r;
			const a = lowRank(dec, r);
			approx.update(a, fieldMax);
			label.text(`F${subscript(r)}`);
			bars.forEach((b, k) => {
				b.attr("class", k < r ? "bar keep" : "bar").attr("data-part", k < r ? "r stored" : null);
			});
			focus.refresh();
			hooks.onParams({
				r,
				stored: 2 * N * r + r,
				err: relativeError(field, a),
				ierr: Math.abs(total(a) - integral) / integral,
			});
		};
		knob.set(rank - 1);
	}

	const ro = buildToWidth(mount, build);

	return {
		reset(): void {
			rank = R0;
			build();
		},
		setLit(on: boolean): void {
			mount.querySelector("svg")?.classList.toggle("lit", on);
		},
		setFocus: focus.focus,
		redraw(): void {
			setRank(rank);
		},
		destroy(): void {
			focus.destroy();
			ro.disconnect();
		},
	};
};
