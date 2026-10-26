/**
 * Monte Carlo with and without the train as a control variate, live, on the
 * smoothed 10-asset integrand. Same scenarios for both. Parts: the hairline is
 * the current N; each estimator's curve is its estimate and its band the 95%
 * half-width, and both bands carry the variance ratio between them.
 */
import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import { axis, bottomAxis, buildToWidth, type G, leftAxis, plate } from "../ink";
import { parts } from "../parts";
import type { FigureFactory, FigureImpl } from "../registry";
import { reference, ttValue } from "./data";
import { dimension, smoothed } from "./model";
import { Rng } from "./rng";
import { evaluate } from "./train";
import { logScale, pow10 } from "./ui";

const N_MAX = 2 ** 15;
const SEED = 7;

interface Sample {
	readonly n: number;
	readonly plain: number;
	readonly plainHalf: number;
	readonly cv: number;
	readonly cvHalf: number;
}

export const ttCv: FigureFactory = (mount, hooks): FigureImpl => {
	const focus = parts(mount, hooks.onFocus);
	let samples: Sample[] = [];
	let raf = 0;
	let update: () => void = () => {};

	function simulate(): void {
		cancelAnimationFrame(raf);
		samples = [];
		const rng = new Rng(SEED);
		const z = new Float64Array(dimension - 1);
		let n = 0;
		let f1 = 0;
		let f2 = 0;
		let r1 = 0;
		let r2 = 0;
		let next = 10;
		const frame = (): void => {
			const stop = Math.min(N_MAX, n + Math.max(64, Math.floor(n * 0.05)));
			while (n < stop) {
				for (let j = 0; j < z.length; j++) z[j] = rng.normal();
				const f = smoothed(z);
				const r = f - evaluate(z);
				f1 += f;
				f2 += f * f;
				r1 += r;
				r2 += r * r;
				n++;
				// the last sample is logged too, so the readouts end at N_MAX
				if (n >= next || n === N_MAX) {
					const mf = f1 / n;
					const mr = r1 / n;
					const vf = Math.max(f2 / n - mf * mf, 0);
					const vr = Math.max(r2 / n - mr * mr, 0);
					samples.push({
						n,
						plain: mf,
						plainHalf: 1.96 * Math.sqrt(vf / n),
						cv: ttValue + mr,
						cvHalf: 1.96 * Math.sqrt(vr / n),
					});
					next = Math.ceil(next * 1.1);
				}
			}
			update();
			const last = samples.at(-1);
			if (last)
				hooks.onParams({
					n: last.n,
					ratio: (last.plainHalf / Math.max(last.cvHalf, 1e-300)) ** 2,
					est: last.cv,
					half: last.cvHalf,
					plain: last.plain,
					plainHalf: last.plainHalf,
				});
			if (n < N_MAX) raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);
	}

	function build(): void {
		const { svg, w, h } = plate(mount);
		const left = 40;
		const bottom = h - 22;
		const { scale: x, decades } = logScale([10, N_MAX], [left, w - 12]);
		const y = scaleLinear([reference - 0.3, reference + 0.3], [bottom, 10]).clamp(true);
		const g = svg.append("g") as G;
		for (const e of decades)
			g.append("line")
				.attr("class", "grid")
				.attr("x1", x(10 ** e))
				.attr("x2", x(10 ** e))
				.attr("y1", 10)
				.attr("y2", bottom);
		axis(
			g.append("g").attr("transform", `translate(0,${bottom})`) as G,
			bottomAxis(x)
				.tickValues(decades.map((e) => 10 ** e))
				.tickFormat((v) => pow10(Math.round(Math.log10(Number(v)))))
				.tickSize(3),
		);
		axis(
			g.append("g").attr("transform", `translate(${left},0)`) as G,
			leftAxis(y).ticks(4).tickSize(3),
		);
		g.append("line")
			.attr("class", "hair emph")
			.attr("x1", left)
			.attr("x2", w - 12)
			.attr("y1", y(reference))
			.attr("y2", y(reference));
		const plainBand = g.append("path").attr("class", "wash").attr("data-part", "plainHalf ratio");
		const plainLine = g.append("path").attr("class", "curve faint").attr("data-part", "plain");
		const plainHit = g.append("path").attr("class", "parthit").attr("data-part", "plain");
		const cvBand = g.append("path").attr("class", "wash").attr("data-part", "half ratio");
		const cvLine = g.append("path").attr("class", "curve").attr("data-part", "est");
		const cvHit = g.append("path").attr("class", "parthit").attr("data-part", "est");
		const nowLine = g
			.append("line")
			.attr("class", "hair")
			.attr("data-part", "n")
			.attr("y1", 10)
			.attr("y2", bottom);
		const plainLabel = g.append("text").attr("class", "vlabel");
		const cvLabel = g.append("text").attr("class", "vlabel");
		const band = (mean: (s: Sample) => number, half: (s: Sample) => number) =>
			area<Sample>()
				.x((s) => x(s.n))
				.y0((s) => y(mean(s) - half(s)))
				.y1((s) => y(mean(s) + half(s)));
		const path = (mean: (s: Sample) => number) =>
			line<Sample>()
				.x((s) => x(s.n))
				.y((s) => y(mean(s)));
		update = (): void => {
			plainBand.attr(
				"d",
				band(
					(s) => s.plain,
					(s) => s.plainHalf,
				)(samples),
			);
			const plainPath = path((s) => s.plain)(samples);
			plainLine.attr("d", plainPath);
			plainHit.attr("d", plainPath);
			cvBand.attr(
				"d",
				band(
					(s) => s.cv,
					(s) => s.cvHalf,
				)(samples),
			);
			const cvPath = path((s) => s.cv)(samples);
			cvLine.attr("d", cvPath);
			cvHit.attr("d", cvPath);
			const last = samples.at(-1);
			if (!last) return;
			nowLine.attr("x1", x(last.n)).attr("x2", x(last.n));
			plainLabel.attr("x", x(14)).attr("y", 24).text("plain Monte Carlo");
			cvLabel
				.attr("x", x(14))
				.attr("y", y(reference) + 16)
				.text("with the train");
		};
		update();
		focus.refresh();
	}

	const ro = buildToWidth(mount, build);
	// start when the plate is first seen, so the reader watches it converge
	const io = new IntersectionObserver(
		(entries) => {
			if (entries.some((e) => e.isIntersecting)) {
				io.disconnect();
				simulate();
			}
		},
		{ threshold: 0.4 },
	);
	io.observe(mount);

	return {
		reset: simulate,
		setLit(on: boolean): void {
			mount.querySelector("svg")?.classList.toggle("lit", on);
		},
		setFocus: focus.focus,
		redraw(): void {
			update();
		},
		destroy(): void {
			cancelAnimationFrame(raf);
			io.disconnect();
			focus.destroy();
			ro.disconnect();
		},
	};
};
