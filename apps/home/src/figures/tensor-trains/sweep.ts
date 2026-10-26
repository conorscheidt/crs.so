/**
 * The construction of the 10-asset train replayed: its integral after each of
 * the twelve TT-cross sweeps, against the evaluations spent so far, with the
 * reference price and a band of ±10⁻⁴ relative error around it. The ranks of
 * the chosen sweep stand above. Drag the sweep. Parts: the slider and the
 * hairline under it are the sweep and its evaluations, the curve and its marks
 * the integral, the drop from the reference to the chosen mark its error, and
 * the level of the sweep before it the change between the two.
 */
import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { axis, bottomAxis, buildToWidth, type G, leftAxis, plate } from "../ink";
import { parts } from "../parts";
import type { FigureFactory, FigureImpl } from "../registry";
import { reference, type Sweep, sweeps } from "./data";
import { pow10, trackAt, trackLabels } from "./ui";

const LAST = sweeps.length - 1;
const X_MAX = 120_000;
/** Relative half-height of the plate, and of the band. */
const SPAN = 3e-4;
const BAND = 1e-4;
const TICKS = [8.727, 8.728, 8.729, 8.73, 8.731, 8.732];

export const ttSweep: FigureFactory = (mount, hooks): FigureImpl => {
	const focus = parts(mount, hooks.onFocus);
	let index = LAST;
	let setIndex: (k: number) => void = () => {};

	function build(): void {
		const { svg, w, h } = plate(mount);
		const svgNode = svg.node() as SVGSVGElement;
		const left = 40;
		const right = w - 12;
		const top = 30;
		const bottom = h - 50;
		const trackY = h - 20;
		const x = scaleLinear([0, X_MAX], [left, right]);
		const y = scaleLinear([reference * (1 - SPAN), reference * (1 + SPAN)], [bottom, top]);
		const g = svg.append("g") as G;
		for (const v of TICKS)
			g.append("line")
				.attr("class", "grid")
				.attr("x1", left)
				.attr("x2", right)
				.attr("y1", y(v))
				.attr("y2", y(v));
		axis(
			g.append("g").attr("transform", `translate(0,${bottom})`) as G,
			bottomAxis(x)
				.tickValues(w < 480 ? [0, 40_000, 80_000] : [0, 20_000, 40_000, 60_000, 80_000, 100_000])
				.tickFormat((v) => Number(v).toLocaleString("en-US"))
				.tickSize(3),
		);
		axis(
			g.append("g").attr("transform", `translate(${left},0)`) as G,
			leftAxis(y)
				.tickValues(TICKS)
				.tickFormat((v) => Number(v).toFixed(3))
				.tickSize(3),
		);
		const hi = y(reference * (1 + BAND));
		const lo = y(reference * (1 - BAND));
		g.append("rect")
			.attr("class", "wash")
			.attr("x", left)
			.attr("width", right - left)
			.attr("y", hi)
			.attr("height", lo - hi);
		// bottom left, under the first sweeps and clear of the hairline at the last
		g.append("text")
			.attr("class", "tlabel")
			.attr("x", left + 4)
			.attr("y", lo - 4)
			.text(`±${pow10(-4)}`);
		g.append("line")
			.attr("class", "hair emph")
			.attr("x1", left)
			.attr("x2", right)
			.attr("y1", y(reference))
			.attr("y2", y(reference));
		g.append("text")
			.attr("class", "vlabel")
			.attr("x", left + 4)
			.attr("y", y(reference) - 5)
			.text("reference");
		g.append("text")
			.attr("class", "vlabel")
			.attr("x", left + 6)
			.attr("y", 18)
			.text("integral");
		g.append("text")
			.attr("class", "vlabel")
			.attr("x", right)
			.attr("y", bottom + 14)
			.attr("text-anchor", "end")
			.text("evaluations");
		const ranks = g
			.append("text")
			.attr("x", w - 40)
			.attr("y", 18)
			.attr("text-anchor", "end");
		ranks.append("tspan").attr("class", "vlabel").text("ranks");
		const rankList = ranks.append("tspan").attr("class", "tlabel").attr("dx", 6);

		const now = g
			.append("line")
			.attr("class", "hair")
			.attr("data-part", "sweep evals")
			.attr("y1", top)
			.attr("y2", bottom);
		const level = g.append("line").attr("class", "hair").attr("data-part", "change");
		const drop = g.append("line").attr("class", "hair emph").attr("data-part", "err");
		const path = line<Sweep>()
			.x((s) => x(s.evals))
			.y((s) => y(s.integral));
		const d = path(sweeps);
		g.append("path").attr("class", "curve").attr("data-part", "integral").attr("d", d);
		g.append("path").attr("class", "parthit").attr("data-part", "integral").attr("d", d);
		for (const s of sweeps)
			g.append("circle")
				.attr("class", "mark")
				.attr("data-part", "integral")
				.attr("cx", x(s.evals))
				.attr("cy", y(s.integral))
				.attr("r", 2.2);
		const chosen = g
			.append("circle")
			.attr("class", "mark solid")
			.attr("data-part", "integral")
			.attr("r", 3.2);

		const xs = sweeps.map((s) => x(s.evals));
		const x0 = xs[0] ?? left;
		const knob = trackAt(g, svgNode, xs, trackY, (k) => setIndex(k), "sweep evals");
		trackLabels(g, x0, xs[LAST] ?? right, trackY, "1", String(sweeps.length));
		g.append("text")
			.attr("class", "vlabel")
			.attr("x", x0 - 12)
			.attr("y", trackY + 4)
			.attr("text-anchor", "end")
			.text("sweep");

		setIndex = (k: number): void => {
			index = k;
			const s = sweeps[k];
			if (!s) return;
			const prev = sweeps[k - 1];
			const sx = x(s.evals);
			now.attr("x1", sx).attr("x2", sx);
			drop.attr("x1", sx).attr("x2", sx).attr("y1", y(reference)).attr("y2", y(s.integral));
			if (prev)
				level
					.attr("x1", x(prev.evals))
					.attr("x2", sx)
					.attr("y1", y(prev.integral))
					.attr("y2", y(prev.integral))
					.attr("visibility", null);
			else level.attr("visibility", "hidden");
			chosen.attr("cx", sx).attr("cy", y(s.integral));
			rankList.text(s.ranks.slice(1, -1).join(" "));
			focus.refresh();
			hooks.onParams({
				sweep: k + 1,
				evals: s.evals,
				integral: s.integral,
				err: Math.abs(s.integral - reference) / reference,
				change: prev ? Math.abs(s.integral - prev.integral) / Math.abs(s.integral) : Number.NaN,
			});
		};
		knob.set(index);
	}

	const ro = buildToWidth(mount, build);

	return {
		reset(): void {
			index = LAST;
			build();
		},
		setLit(on: boolean): void {
			mount.querySelector("svg")?.classList.toggle("lit", on);
		},
		setFocus: focus.focus,
		redraw(): void {
			setIndex(index);
		},
		destroy(): void {
			focus.destroy();
			ro.disconnect();
		},
	};
};
