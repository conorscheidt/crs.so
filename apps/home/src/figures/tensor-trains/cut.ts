/**
 * A cut through the 10-asset integrand, smoothed (z₂ … z₁₀, eight cuts) or raw
 * (z₁ … z₁₀, nine cuts), whose spectra were read off a rank-24 train on 16
 * nodes per variable. Above, the train, with the rank each cut needs for 10⁻⁴,
 * and the choice of integrand. The raw train only adds z₁ on the left, so its
 * cut k + 1 splits z₂ … z₁₀ where the smoothed cut k does, and the plate keeps
 * that split when the integrand changes. Below, at the chosen cut, the
 * relative error of the best rank-r approximation of the unfolding,
 * ‖σ_{r+1:}‖/‖σ‖, which falls below 10⁻⁴ at the marked rank; the singular
 * values σ_r/σ₁ are dotted and the other cuts' errors drawn in ghost ink.
 * Parts: the cut and its slider are k; the error curve, its marker and the
 * cut's numeral are the rank; the train's nodes are the variables.
 */
import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { axis, bottomAxis, buildToWidth, type G, plate } from "../ink";
import { parts } from "../parts";
import type { FigureFactory, FigureImpl } from "../registry";
import { spectra } from "./data";
import { epsRank } from "./train";
import { choices, logScale, pow10, track } from "./ui";

type Mode = "smooth" | "raw";

interface Unfoldings {
	readonly spectra: readonly (readonly number[])[];
	/** ε(r) = ‖σ_{r+1:}‖/‖σ‖ for r = 1 … len − 1, at index r − 1. */
	readonly tails: readonly (readonly number[])[];
	readonly ranks: readonly number[];
}

const K0 = 4;
const SHOWN = 24;
const EPS = 1e-4;
const FLOOR = 1e-9;
/** Where the train starts, clear of the choice of integrand. */
const TRAIN_LEFT = 72;
/** Where it ends, clear of the reset disc. */
const TRAIN_RIGHT = 40;

/** Slots for the longer train; the smoothed one starts a slot in, where z₁ was. */
const SLOTS = spectra.raw.length + 1;

const unfold = (s: readonly (readonly number[])[]): Unfoldings => ({
	spectra: s,
	tails: s.map((sigma) => {
		const total = Math.hypot(...sigma);
		return sigma.slice(1).map((_, i) => Math.hypot(...sigma.slice(i + 1)) / total);
	}),
	ranks: s.map((sigma) => epsRank(sigma, EPS)),
});

const MODES: Readonly<Record<Mode, Unfoldings>> = {
	smooth: unfold(spectra.smooth),
	raw: unfold(spectra.raw),
};
const LABELS: readonly (readonly [Mode, string])[] = [
	["smooth", "smoothed"],
	["raw", "raw"],
];

export const ttCut: FigureFactory = (mount, hooks): FigureImpl => {
	const focus = parts(mount, hooks.onFocus);
	let mode: Mode = "smooth";
	let cut = K0;
	let setCut: (k: number) => void = () => {};

	function choose(next: Mode): void {
		if (next === mode) return;
		const focused = mount.contains(document.activeElement);
		const cuts = MODES[next].spectra.length;
		// the same split of z₂ … z₁₀, renumbered; the raw cut after z₁ has no smoothed counterpart
		cut = Math.max(1, Math.min(cuts, cut + cuts - MODES[mode].spectra.length));
		mode = next;
		build();
		if (focused) mount.querySelector<SVGElement>(".choice.on")?.focus();
	}

	function build(): void {
		const { svg, w, h } = plate(mount);
		const svgNode = svg.node() as SVGSVGElement;
		const g = svg.append("g") as G;
		const { spectra: sigmas, tails, ranks } = MODES[mode];
		const cores = sigmas.length + 1;
		const node = (k: number): number =>
			TRAIN_LEFT + ((w - TRAIN_RIGHT - TRAIN_LEFT) * (k + SLOTS - cores)) / (SLOTS - 1);
		const bond = (k: number): number => (node(k - 1) + node(k)) / 2;
		const lineY = 30;
		choices(g, 8, lineY - 3, 16, LABELS, mode, choose);
		for (let k = 0; k < cores - 1; k++) {
			g.append("line")
				.attr("class", "bond")
				.attr("x1", node(k))
				.attr("x2", node(k + 1))
				.attr("y1", lineY)
				.attr("y2", lineY);
		}
		for (let k = 0; k < cores; k++) {
			g.append("line")
				.attr("class", "axis-line")
				.attr("x1", node(k))
				.attr("x2", node(k))
				.attr("y1", lineY)
				.attr("y2", lineY + 16);
			g.append("circle")
				.attr("class", "shape")
				.attr("data-part", "vars")
				.attr("cx", node(k))
				.attr("cy", lineY)
				.attr("r", 6);
		}
		const numerals = ranks.map((r, i) =>
			g
				.append("text")
				.attr("class", "tlabel")
				.attr("x", bond(i + 1))
				.attr("y", lineY - 12)
				.attr("text-anchor", "middle")
				.text(r),
		);
		const cutLine = g
			.append("line")
			.attr("class", "hair emph")
			.attr("data-part", "k")
			.attr("y1", lineY - 8)
			.attr("y2", lineY + 22);

		const top = 78;
		const bottom = h - 22;
		const x = scaleLinear([1, SHOWN], [36, w - 12]);
		const { scale: y, decades } = logScale([FLOOR, 1], [bottom, top]);
		for (const e of decades.filter((dec) => dec % 2 === 0)) {
			g.append("line")
				.attr("class", "grid")
				.attr("x1", 36)
				.attr("x2", w - 12)
				.attr("y1", y(10 ** e))
				.attr("y2", y(10 ** e));
			g.append("text")
				.attr("class", "tlabel")
				.attr("x", 30)
				.attr("y", y(10 ** e) + 3)
				.attr("text-anchor", "end")
				.text(pow10(e));
		}
		axis(
			g.append("g").attr("transform", `translate(0,${bottom})`) as G,
			bottomAxis(x).tickValues([1, 4, 8, 12, 16, 20, 24]).tickSize(3),
		);
		g.append("text")
			.attr("class", "vlabel")
			.attr("x", w - 14)
			.attr("y", top + 10)
			.attr("text-anchor", "end")
			.text("relative error");
		g.append("text")
			.attr("class", "vlabel")
			.attr("x", w - 14)
			.attr("y", bottom - 6)
			.attr("text-anchor", "end")
			.text("r");
		g.append("line")
			.attr("class", "hair")
			.attr("x1", 36)
			.attr("x2", w - 12)
			.attr("y1", y(EPS))
			.attr("y2", y(EPS));
		g.append("text")
			.attr("class", "tlabel")
			.attr("x", w - 14)
			.attr("y", y(EPS) - 4)
			.attr("text-anchor", "end")
			.text(pow10(-4));
		// entry i is at rank i + 1, for the singular values and the errors alike
		const path = line<number>()
			.x((_, i) => x(i + 1))
			.y((v) => y(v))
			.defined((v) => v >= FLOOR);
		const others = g.append("g");
		for (const t of tails)
			others
				.append("path")
				.attr("class", "curve ghost")
				.attr("d", path(t.slice(0, SHOWN)));
		const sigma = g.append("path").attr("class", "curve faint dot");
		const active = g.append("path").attr("class", "curve").attr("data-part", "rank");
		const activeHit = g.append("path").attr("class", "parthit").attr("data-part", "rank");
		// it stops short of the label above it, which the raw ranks reach
		const rankLine = g
			.append("line")
			.attr("class", "hair emph")
			.attr("data-part", "rank")
			.attr("y1", top + 16)
			.attr("y2", bottom);
		const rankMark = g
			.append("circle")
			.attr("class", "mark solid")
			.attr("data-part", "rank")
			.attr("r", 2.6);

		const knob = track(
			g,
			svgNode,
			bond(1),
			bond(cores - 1),
			lineY + 34,
			cores - 1,
			(k) => setCut(k + 1),
			"k",
		);
		setCut = (k: number): void => {
			cut = k;
			const t = tails[k - 1] ?? [];
			const r = ranks[k - 1] ?? 0;
			const shown = Math.min(r, SHOWN);
			cutLine.attr("x1", bond(k)).attr("x2", bond(k));
			for (const [i, numeral] of numerals.entries())
				numeral.attr("data-part", i === k - 1 ? "rank" : null);
			sigma.attr("d", path((sigmas[k - 1] ?? []).slice(0, SHOWN)));
			const d = path(t.slice(0, SHOWN));
			active.attr("d", d);
			activeHit.attr("d", d);
			rankLine.attr("x1", x(shown)).attr("x2", x(shown));
			rankMark.attr("cx", x(shown)).attr("cy", y(Math.max(t[shown - 1] ?? FLOOR, FLOOR)));
			focus.refresh();
			hooks.onParams({ k, rank: r, vars: cores });
		};
		knob.set(cut - 1);
	}

	const ro = buildToWidth(mount, build);

	return {
		reset(): void {
			mode = "smooth";
			cut = K0;
			build();
		},
		setLit(on: boolean): void {
			mount.querySelector("svg")?.classList.toggle("lit", on);
		},
		setFocus: focus.focus,
		redraw(): void {
			setCut(cut);
		},
		destroy(): void {
			focus.destroy();
			ro.disconnect();
		},
	};
};
