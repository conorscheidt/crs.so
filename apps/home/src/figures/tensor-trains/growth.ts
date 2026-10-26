/**
 * Why the rank grows. Left: eigenvalues of the d-asset sector-block correlation
 * matrix, at the d of the cost runs. Right: the largest rank any cut needs for
 * 10⁻⁴ against d, for three correlation structures, measured at d = 4, 6, 8,
 * 10, 14 and 20; the marker shows only where a measurement exists. Parts: the
 * slider and the marker are d, the first three eigenvalues what they explain,
 * the others the rest.
 */
import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { axis, bottomAxis, buildToWidth, type G, leftAxis, plate, varLabel } from "../ink";
import { parts } from "../parts";
import type { FigureFactory, FigureImpl } from "../registry";
import { type Point, runs, type Structure, scaling } from "./data";
import { track, trackLabels } from "./ui";

const STRUCTURES: readonly { key: Structure; label: string; cls: string }[] = [
	{ key: "sector", label: "sector blocks", cls: "curve" },
	{ key: "one_factor", label: "one factor", cls: "curve dash" },
	{ key: "random_factors", label: "random factors", cls: "curve dot" },
];
const LAST = runs.length - 1;

export const ttGrowth: FigureFactory = (mount, hooks): FigureImpl => {
	const focus = parts(mount, hooks.onFocus);
	let index = LAST;
	let setIndex: (k: number) => void = () => {};

	function build(): void {
		const { svg, w, h } = plate(mount);
		const svgNode = svg.node() as SVGSVGElement;
		const g = svg.append("g") as G;
		const half = (w - 40) / 2;
		const bottom = h - 46;
		const ey = scaleLinear([0, 9], [bottom, 12]);
		axis(
			g.append("g").attr("transform", "translate(24,0)") as G,
			leftAxis(ey).ticks(3).tickSize(3),
		);
		g.append("line")
			.attr("class", "axis-line")
			.attr("x1", 24)
			.attr("x2", half)
			.attr("y1", bottom)
			.attr("y2", bottom);
		varLabel(g, 30, 14, "λ");
		g.append("text")
			.attr("class", "vlabel")
			.attr("x", half)
			.attr("y", 14)
			.attr("text-anchor", "end")
			.text("sector blocks");
		const bars = g.append("g");

		const x0 = half + 56;
		const rx = scaleLinear([4, 20], [x0, w - 92]);
		const ry = scaleLinear([0, 24], [bottom, 12]);
		axis(
			g.append("g").attr("transform", `translate(0,${bottom})`) as G,
			bottomAxis(rx)
				.tickValues(w - 92 - x0 < 120 ? [4, 12, 20] : [4, 8, 12, 16, 20])
				.tickSize(3),
		);
		axis(
			g.append("g").attr("transform", `translate(${x0},0)`) as G,
			leftAxis(ry).ticks(4).tickSize(3),
		);
		varLabel(g, x0 + 6, 14, "max rank");
		varLabel(g, w - 100, bottom - 6, "d");
		const marker = g
			.append("line")
			.attr("class", "hair emph")
			.attr("data-part", "d")
			.attr("y1", 12)
			.attr("y2", bottom);
		const path = line<Point>()
			.x(([d]) => rx(d))
			.y(([, r]) => ry(r));
		for (const s of STRUCTURES) {
			const pts = scaling[s.key];
			g.append("path").attr("class", s.cls).attr("d", path(pts));
			for (const [d, r] of pts)
				g.append("circle").attr("class", "mark").attr("cx", rx(d)).attr("cy", ry(r)).attr("r", 2.4);
		}
		const labeled = STRUCTURES.map((s) => ({ s, y: ry(scaling[s.key].at(-1)?.[1] ?? 0) })).sort(
			(a, b) => a.y - b.y,
		);
		let prev = Number.NEGATIVE_INFINITY;
		for (const { s, y } of labeled) {
			const yy = Math.max(y, prev + 11);
			prev = yy;
			g.append("text")
				.attr("class", "vlabel")
				.attr("x", rx(20) + 6)
				.attr("y", yy + 3)
				.text(s.label);
		}

		const knob = track(g, svgNode, 48, half - 16, h - 24, runs.length, (k) => setIndex(k), "d");
		trackLabels(g, 48, half - 16, h - 24, String(runs[0]?.d ?? ""), String(runs[LAST]?.d ?? ""));
		varLabel(g, 28, h - 20, "d");

		setIndex = (k: number): void => {
			index = k;
			const run = runs[k] ?? runs[LAST];
			if (!run) return;
			bars.selectAll("*").remove();
			const bw = (half - 32) / run.eigenvalues.length;
			run.eigenvalues.forEach((v, i) => {
				bars
					.append("rect")
					.attr("class", i < 3 ? "bar keep" : "bar")
					.attr("data-part", i < 3 ? "explained" : "rest")
					.attr("x", 28 + i * bw + bw * 0.15)
					.attr("width", bw * 0.7)
					.attr("y", ey(Math.min(v, 9)))
					.attr("height", bottom - ey(Math.min(v, 9)));
			});
			const measured = scaling.sector.some(([d]) => d === run.d);
			marker
				.attr("x1", rx(run.d))
				.attr("x2", rx(run.d))
				.attr("opacity", measured ? 1 : 0);
			const top3 = run.eigenvalues.slice(0, 3).reduce((a, b) => a + b, 0);
			focus.refresh();
			hooks.onParams({ d: run.d, explained: top3 / run.d, rest: run.d - 3 });
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
