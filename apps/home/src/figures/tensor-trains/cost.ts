/**
 * Relative error against integrand evaluations for six estimators, from the
 * measured runs; tensor-train cost includes construction. Drag d. Parts: the
 * slider is d, and each smoothed series carries the evaluation counts read off it.
 */
import { line } from "d3-shape";
import { axis, bottomAxis, buildToWidth, type G, leftAxis, plate } from "../ink";
import { parts } from "../parts";
import type { FigureFactory, FigureImpl } from "../registry";
import { type MethodKey, type Point, type Run, runs } from "./data";
import { logScale, pow10, track, trackLabels } from "./ui";

interface Series {
	readonly key: MethodKey;
	readonly label: string;
	readonly cls: string;
	readonly marks?: "open" | "solid";
	/** The readouts measured on this series. */
	readonly part?: string;
}

const SERIES: readonly Series[] = [
	{ key: "mc_raw", label: "MC", cls: "curve faint dot" },
	{ key: "mc_smooth", label: "MC, smoothed", cls: "curve faint", part: "mc6" },
	{ key: "rqmc_raw", label: "RQMC", cls: "curve dot" },
	{ key: "rqmc_smooth", label: "RQMC, smoothed", cls: "curve dash", part: "rq4 rq6" },
	{ key: "tt_raw", label: "TT", cls: "curve faint", marks: "open" },
	{ key: "tt_smooth", label: "TT, smoothed", cls: "curve", marks: "solid", part: "tt4 tt6" },
];

/**
 * Evaluations needed to reach a relative error of `eps`, or NaN if the runs never
 * got there. A tensor-train count is that of the cheapest construction measured
 * to reach `eps`; the others are read off a curve.
 */
export function evaluationsTo(run: Run, key: MethodKey, eps: number): number {
	if (key === "mc_raw" || key === "mc_smooth") return (run.sigma[key] / (eps * run.price)) ** 2;
	const pts = run.methods[key];
	if (key === "tt_raw" || key === "tt_smooth") {
		const reached = pts.filter(([, err]) => err <= eps).map(([n]) => n);
		return reached.length > 0 ? Math.min(...reached) : Number.NaN;
	}
	for (let i = 1; i < pts.length; i++) {
		const [n0 = 0, e0 = 1] = pts[i - 1] ?? [];
		const [n1 = 0, e1 = 1] = pts[i] ?? [];
		if (e1 <= eps && e0 > eps) {
			const t = (Math.log(eps) - Math.log(e0)) / (Math.log(e1) - Math.log(e0));
			return Math.exp(Math.log(n0) + t * (Math.log(n1) - Math.log(n0)));
		}
	}
	return (pts[0]?.[1] ?? 1) <= eps ? (pts[0]?.[0] ?? Number.NaN) : Number.NaN;
}

/**
 * Two significant figures. The Monte Carlo count extrapolates a pilot σ and the
 * quasi-Monte Carlo counts interpolate between sample sizes four times apart,
 * so neither supports more.
 */
const twoFigures = (v: number): number => Number(v.toPrecision(2));

const DIMENSIONS = runs.map((r) => r.d);

export const ttCost: FigureFactory = (mount, hooks): FigureImpl => {
	const focus = parts(mount, hooks.onFocus);
	let index = 0;
	let setIndex: (k: number) => void = () => {};

	function build(): void {
		const { svg, w, h } = plate(mount);
		const svgNode = svg.node() as SVGSVGElement;
		const left = 36;
		const right = w - 96;
		const bottom = h - 22;
		const { scale: x, decades: dx } = logScale([1e2, 1e8], [left, right]);
		const { scale: y, decades: dy } = logScale([1e-9, 1e-1], [bottom, 24]);
		const g = svg.append("g") as G;
		for (const e of dx)
			g.append("line")
				.attr("class", "grid")
				.attr("x1", x(10 ** e))
				.attr("x2", x(10 ** e))
				.attr("y1", 10)
				.attr("y2", bottom);
		for (const e of dy)
			g.append("line")
				.attr("class", "grid")
				.attr("x1", left)
				.attr("x2", right)
				.attr("y1", y(10 ** e))
				.attr("y2", y(10 ** e));
		const fmt = (v: unknown): string => pow10(Math.round(Math.log10(Number(v))));
		axis(
			g.append("g").attr("transform", `translate(0,${bottom})`) as G,
			bottomAxis(x)
				.tickValues(dx.map((e) => 10 ** e))
				.tickFormat(fmt)
				.tickSize(3),
		);
		axis(
			g.append("g").attr("transform", `translate(${left},0)`) as G,
			leftAxis(y)
				.tickValues(dy.filter((e) => e % 2 !== 0).map((e) => 10 ** e))
				.tickFormat(fmt)
				.tickSize(3),
		);
		const floor = g
			.append("rect")
			.attr("class", "wash")
			.attr("x", left)
			.attr("width", right - left);
		const layer = g.append("g");
		const path = line<Point>()
			.x(([n]) => x(n))
			.y(([, err]) => y(Math.max(err, 1e-9)));

		const knob = track(
			g,
			svgNode,
			left + 18,
			left + 138,
			bottom - 22,
			DIMENSIONS.length,
			(k) => setIndex(k),
			"d",
		);
		trackLabels(
			g,
			left + 18,
			left + 138,
			bottom - 22,
			String(DIMENSIONS[0] ?? ""),
			String(DIMENSIONS.at(-1) ?? ""),
		);
		const dLabel = g
			.append("text")
			.attr("class", "vlabel")
			.attr("data-part", "d")
			.attr("x", left + 78)
			.attr("y", bottom - 34)
			.attr("text-anchor", "middle");
		g.append("text").attr("class", "vlabel").attr("x", left).attr("y", 14).text("relative error");
		g.append("text")
			.attr("class", "vlabel")
			.attr("x", right - 4)
			.attr("y", bottom - 6)
			.attr("text-anchor", "end")
			.text("evaluations");

		setIndex = (k: number): void => {
			index = k;
			const run = runs[k] ?? (runs[0] as Run);
			layer.selectAll("*").remove();
			floor
				.attr("y", y(Math.max(run.floor, 1e-9)))
				.attr("height", Math.max(0, bottom - y(Math.max(run.floor, 1e-9))));
			const ends: { y: number; label: string; part: string | null }[] = [];
			for (const s of SERIES) {
				const pts = [...run.methods[s.key]]
					.filter(([n]) => n >= 1e2 && n <= 1e8)
					.sort((a, b) => a[0] - b[0]);
				if (pts.length === 0) continue;
				const part = s.part ?? null;
				const d = path(pts);
				layer.append("path").attr("class", s.cls).attr("data-part", part).attr("d", d);
				if (part)
					layer.append("path").attr("class", "parthit").attr("data-part", part).attr("d", d);
				if (s.marks) {
					for (const [n, err] of pts) {
						layer
							.append("circle")
							.attr("class", s.marks === "solid" ? "mark solid" : "mark")
							.attr("data-part", part)
							.attr("cx", x(n))
							.attr("cy", y(Math.max(err, 1e-9)))
							.attr("r", 2.6);
					}
				}
				const last = pts.at(-1);
				if (last) ends.push({ y: y(Math.max(last[1], 1e-9)), label: s.label, part });
			}
			ends.sort((a, b) => a.y - b.y);
			let prev = Number.NEGATIVE_INFINITY;
			for (const e of ends) {
				const yy = Math.max(e.y, prev + 11);
				prev = yy;
				layer
					.append("text")
					.attr("class", "vlabel")
					.attr("data-part", e.part)
					.attr("x", right + 6)
					.attr("y", yy + 3)
					.text(e.label);
			}
			dLabel.text(`d = ${run.d}`);
			focus.refresh();
			hooks.onParams({
				d: run.d,
				tt4: evaluationsTo(run, "tt_smooth", 1e-4),
				rq4: twoFigures(evaluationsTo(run, "rqmc_smooth", 1e-4)),
				tt6: evaluationsTo(run, "tt_smooth", 1e-6),
				rq6: twoFigures(evaluationsTo(run, "rqmc_smooth", 1e-6)),
				mc6: twoFigures(evaluationsTo(run, "mc_smooth", 1e-6)),
			});
		};
		knob.set(index);
	}

	const ro = buildToWidth(mount, build);

	return {
		reset(): void {
			index = 0;
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
