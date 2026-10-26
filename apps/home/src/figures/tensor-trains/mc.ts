/**
 * Plain Monte Carlo on the 10-asset basket, live: the running estimate, its 95%
 * band, and the envelope ±1.96σ/√N the band should track. Behind it, six more
 * runs on their own seeds, which the envelope should hold about 95% of the
 * time. All seven advance together, a few milliseconds of sampling per frame.
 * Parts: the curve is the estimate, the band its half-width, the hairline the
 * current N, and the envelope how many runs it holds.
 */
import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import { axis, bottomAxis, buildToWidth, type G, leftAxis, plate, varLabel } from "../ink";
import { parts } from "../parts";
import type { FigureFactory, FigureImpl } from "../registry";
import { type Point, runFor } from "./data";
import { dimension, payoff } from "./model";
import { Rng } from "./rng";
import { logScale, pow10 } from "./ui";

const N_MAX = 2 ** 18;
const SEED = 20_261_021;
const FAN = 6;
/** Milliseconds of sampling a frame may spend, for all the runs together. */
const BUDGET = 6;

interface Sample {
	readonly n: number;
	readonly mean: number;
	readonly half: number;
}

export const ttMc: FigureFactory = (mount, hooks): FigureImpl => {
	const run = runFor(10);
	const price = run.price;
	const sigma = run.sigma.mc_raw;
	const focus = parts(mount, hooks.onFocus);
	let samples: Sample[] = [];
	let fan: Point[][] = [];
	let raf = 0;
	let update: () => void = () => {};

	function simulate(): void {
		cancelAnimationFrame(raf);
		samples = [];
		fan = Array.from({ length: FAN }, () => []);
		const rng = new Rng(SEED);
		const rngs = Array.from({ length: FAN }, (_, r) => new Rng(SEED + r + 1));
		const sums = new Float64Array(FAN);
		const z = new Float64Array(dimension);
		const draw = (source: Rng): number => {
			for (let j = 0; j < dimension; j++) z[j] = source.normal();
			return payoff(z);
		};
		let n = 0;
		let s1 = 0;
		let s2 = 0;
		let next = 10;
		// milliseconds per step of all the runs, measured as they go
		let perStep = 0.002;
		const frame = (): void => {
			const afford = Math.max(64, Math.floor(BUDGET / perStep));
			const from = n;
			const stop = Math.min(N_MAX, n + Math.min(afford, Math.max(256, Math.floor(n * 0.05))));
			const t0 = performance.now();
			while (n < stop) {
				const y = draw(rng);
				s1 += y;
				s2 += y * y;
				for (const [r, source] of rngs.entries()) sums[r] = (sums[r] ?? 0) + draw(source);
				n++;
				// the last sample is logged too, so the readouts end at N_MAX
				if (n >= next || n === N_MAX) {
					const mean = s1 / n;
					samples.push({ n, mean, half: 1.96 * Math.sqrt(Math.max(s2 / n - mean * mean, 0) / n) });
					for (const [r, path] of fan.entries()) path.push([n, (sums[r] ?? 0) / n]);
					next = Math.ceil(next * 1.07);
				}
			}
			perStep = Math.max((performance.now() - t0) / (stop - from), 1e-5);
			update();
			if (n < N_MAX) raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);
	}

	function build(): void {
		const { svg, w, h } = plate(mount);
		const left = 34;
		const bottom = h - 22;
		const { scale: x, decades } = logScale([10, N_MAX], [left, w - 12]);
		const y = scaleLinear([price - 2.4, price + 2.4], [bottom, 10]).clamp(true);
		const g = svg.append("g") as G;
		for (const e of decades) {
			g.append("line")
				.attr("class", "grid")
				.attr("x1", x(10 ** e))
				.attr("x2", x(10 ** e))
				.attr("y1", 10)
				.attr("y2", bottom);
		}
		axis(
			g.append("g").attr("transform", `translate(0,${bottom})`) as G,
			bottomAxis(x)
				.tickValues(decades.map((e) => 10 ** e))
				.tickFormat((v) => pow10(Math.round(Math.log10(Number(v)))))
				.tickSize(3),
		);
		axis(
			g.append("g").attr("transform", `translate(${left},0)`) as G,
			leftAxis(y).ticks(5).tickSize(3),
		);
		const runs = g.append("g");
		const runPaths = Array.from({ length: FAN }, () =>
			runs.append("path").attr("class", "curve ghost"),
		);
		const ns = Array.from({ length: 80 }, (_, k) => 10 * (N_MAX / 10) ** (k / 79));
		const envelope = line<number>().x((n) => x(n));
		for (const sign of [1, -1]) {
			g.append("path")
				.attr("class", "hair")
				.attr("data-part", "half inside")
				.attr("d", envelope.y((n) => y(price + (sign * 1.96 * sigma) / Math.sqrt(n)))(ns));
		}
		g.append("line")
			.attr("class", "hair emph")
			.attr("x1", left)
			.attr("x2", w - 12)
			.attr("y1", y(price))
			.attr("y2", y(price));
		g.append("text")
			.attr("class", "vlabel")
			.attr("x", w - 14)
			.attr("y", y(price) - 5)
			.attr("text-anchor", "end")
			.text("reference");
		varLabel(g, left + 6, 22, "V̂");
		const band = g.append("path").attr("class", "wash").attr("data-part", "half");
		const curve = g.append("path").attr("class", "curve").attr("data-part", "est");
		const curveHit = g.append("path").attr("class", "parthit").attr("data-part", "est");
		const nowLine = g
			.append("line")
			.attr("class", "hair")
			.attr("data-part", "n")
			.attr("y1", 10)
			.attr("y2", bottom);
		const bandArea = area<Sample>()
			.x((s) => x(s.n))
			.y0((s) => y(s.mean - s.half))
			.y1((s) => y(s.mean + s.half));
		const meanLine = line<Sample>()
			.x((s) => x(s.n))
			.y((s) => y(s.mean));
		const runLine = line<Point>()
			.x(([n]) => x(n))
			.y(([, mean]) => y(mean));
		update = (): void => {
			band.attr("d", bandArea(samples));
			const d = meanLine(samples);
			curve.attr("d", d);
			curveHit.attr("d", d);
			for (const [r, path] of runPaths.entries()) path.attr("d", runLine(fan[r] ?? []));
			const last = samples.at(-1);
			if (!last) return;
			nowLine.attr("x1", x(last.n)).attr("x2", x(last.n));
			const reach = (1.96 * sigma) / Math.sqrt(last.n);
			const held = [last.mean, ...fan.map((path) => path.at(-1)?.[1] ?? price)].filter(
				(mean) => Math.abs(mean - price) <= reach,
			).length;
			hooks.onParams({ n: last.n, est: last.mean, half: last.half, inside: held });
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
