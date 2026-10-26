/**
 * Pre-integration on a slice of the 10-asset integrand (z₃ … z₁₀ = 0). Left:
 * payoff × φ over (z₁, z₂) with the exercise boundary. Below it: the kinked
 * slice at the chosen z₂, whose area is one point of the curve on the right,
 * the smooth E[f | z₂, …, z₁₀]·φ(z₂), labeled E[ f | z₂, … ] φ(z₂) to fit.
 * Drag z₂. Parts: the level and its handle are z₂, the boundary and the kink it
 * puts in the slice are the boundary, and the area under the slice, the smooth
 * curve and its marker are the value.
 */
import { drag } from "d3-drag";
import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import { axis, bottomAxis, buildToWidth, type G, handle, leftAxis, plate, varLabel } from "../ink";
import { parts } from "../parts";
import type { FigureFactory, FigureImpl } from "../registry";
import { boundary, dimension, payoff, smoothed } from "./model";
import { heatmap } from "./ui";

const L = 4;
const CELLS = 96;
const Z2 = 0.6;
const TICKS = [-2, 0, 2];
const phi = (x: number): number => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
const axisValues = Float64Array.from({ length: CELLS }, (_, i) => -L + ((i + 0.5) * 2 * L) / CELLS);

const point = new Float64Array(dimension);
const rest = new Float64Array(dimension - 1);
const raw = (z1: number, z2: number): number => {
	point.fill(0);
	point[0] = z1;
	point[1] = z2;
	return payoff(point) * phi(z1) * phi(z2);
};
const conditional = (z2: number): number => {
	rest.fill(0);
	rest[0] = z2;
	return smoothed(rest) * phi(z2);
};
const exercise = (z2: number): number => {
	rest.fill(0);
	rest[0] = z2;
	return boundary(rest);
};

const surface = Array.from({ length: CELLS }, (_, i) =>
	Float64Array.from(axisValues, (z1) => raw(z1, axisValues[i] ?? 0)),
);
const surfaceMax = Math.max(...surface.map((row) => Math.max(...row)));
const smoothCurve = Array.from(axisValues, conditional);
const smoothMax = Math.max(...smoothCurve);

export const ttSmooth: FigureFactory = (mount, hooks): FigureImpl => {
	const focus = parts(mount, hooks.onFocus);
	let z2 = Z2;
	let update: () => void = () => {};

	function build(): void {
		const { svg, w, h } = plate(mount);
		const svgNode = svg.node() as SVGSVGElement;
		// on a narrow column the heatmap shrinks so the curve and its label fit
		const side = Math.min(h - 86, w - 210);
		const g = svg.append("g") as G;
		heatmap(svg, g, 0, 6, side, side).update(surface, surfaceMax);
		const zx = scaleLinear([-L, L], [0, side]);
		const zy = scaleLinear([-L, L], [6 + side, 6]);
		const edge = line<number>()
			.x((v) => zx(exercise(v)))
			.y((v) => zy(v))
			.defined((v) => Math.abs(exercise(v)) < L);
		const edgePath = edge(Array.from(axisValues));
		g.append("path").attr("class", "hair").attr("data-part", "boundary").attr("d", edgePath);
		g.append("path").attr("class", "parthit").attr("data-part", "boundary").attr("d", edgePath);
		varLabel(g, side - 18, side - 2, "z₁");
		varLabel(g, 6, 22, "z₂");

		const level = g
			.append("line")
			.attr("class", "hair emph")
			.attr("data-part", "z2")
			.attr("x1", 0)
			.attr("x2", side);
		const knob = handle(g).attr("data-part", "z2");

		const stripTop = side + 22;
		const stripBottom = Math.min(h - 16, stripTop + 60);
		// the slice shares z₁ with the heatmap above it, so one set of ticks serves both
		axis(
			g.append("g").attr("transform", `translate(0,${stripBottom})`) as G,
			bottomAxis(zx).tickValues(TICKS).tickSize(3).tickSizeOuter(0),
		);
		const sliceArea = g.append("path").attr("class", "wash").attr("data-part", "value");
		const slice = g.append("path").attr("class", "curve");
		const kinkMark = g
			.append("line")
			.attr("class", "hair")
			.attr("data-part", "boundary")
			.attr("y1", stripTop)
			.attr("y2", stripBottom);

		const px = side + 70;
		const sx = scaleLinear([0, smoothMax], [px, Math.min(w - 12, px + 220)]);
		// the curve shares z₂ with the heatmap beside it
		axis(
			g.append("g").attr("transform", `translate(${px},0)`) as G,
			leftAxis(zy).tickValues(TICKS).tickSize(3).tickSizeOuter(0),
		);
		const smoothPath = line<number>()
			.x((v) => sx(v))
			.y((_, i) => zy(axisValues[i] ?? 0))(Array.from(smoothCurve));
		g.append("path").attr("class", "curve").attr("data-part", "value").attr("d", smoothPath);
		g.append("path").attr("class", "parthit").attr("data-part", "value").attr("d", smoothPath);
		varLabel(g, px + 8, 22, "E[ f | z₂, … ] φ(z₂)");
		const marker = g
			.append("circle")
			.attr("class", "dotmark")
			.attr("data-part", "value")
			.attr("r", 3.5);

		update = (): void => {
			const yy = zy(z2);
			level.attr("y1", yy).attr("y2", yy);
			knob.attr("transform", `translate(${side},${yy})`);
			const values = Array.from(axisValues, (z1) => raw(z1, z2));
			const top = Math.max(...values, 1e-300);
			const sy = scaleLinear([0, top], [stripBottom, stripTop]);
			const atZ1 = (_: number, i: number): number => zx(axisValues[i] ?? 0);
			sliceArea.attr(
				"d",
				area<number>()
					.x(atZ1)
					.y0(stripBottom)
					.y1((v) => sy(v))(values),
			);
			slice.attr(
				"d",
				line<number>()
					.x(atZ1)
					.y((v) => sy(v))(values),
			);
			const b = exercise(z2);
			kinkMark
				.attr("x1", zx(b))
				.attr("x2", zx(b))
				.attr("opacity", Math.abs(b) < L ? 1 : 0);
			marker.attr("cx", sx(conditional(z2))).attr("cy", yy);
			hooks.onParams({ z2, boundary: b, value: conditional(z2) / phi(z2) });
		};

		knob.call(
			drag<SVGGElement, unknown>()
				.on("start", () => svgNode.classList.add("dragging"))
				.on("drag", (ev: { sourceEvent: PointerEvent }) => {
					const top = svgNode.getBoundingClientRect().top;
					z2 = Math.max(-3, Math.min(3, zy.invert(ev.sourceEvent.clientY - top)));
					update();
				})
				.on("end", () => svgNode.classList.remove("dragging")),
		);
		update();
		focus.refresh();
	}

	const ro = buildToWidth(mount, build);

	return {
		reset(): void {
			z2 = Z2;
			update();
		},
		setLit(on: boolean): void {
			mount.querySelector("svg")?.classList.toggle("lit", on);
		},
		setFocus: focus.focus,
		redraw(): void {
			update();
		},
		destroy(): void {
			focus.destroy();
			ro.disconnect();
		},
	};
};
