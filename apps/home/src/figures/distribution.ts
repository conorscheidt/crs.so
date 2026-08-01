/**
 * Distribution plate: a normal fit over a fixed deterministic sample, with
 * handles on the curve. The peak handle drags μ, the inflection handle drags
 * σ. The ±σ band is shaded, μ is a dashed drop-line, σ an annotated bracket.
 * onParams reports μ and σ.
 */
import { drag } from "d3-drag";
import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import { axis, bottomAxis, type G, handle, hash, plate } from "./ink";
import type { FigureFactory, FigureImpl } from "./registry";

const SAMPLES = 260;
const BINS = 36;

export const distribution: FigureFactory = (mount, hooks): FigureImpl => {
	let mu = 0.5;
	let sigma = 0.11;
	let update: () => void = () => {};

	// fixed sample: sum of three hashes ≈ bell curve, deterministic
	const sample = Array.from(
		{ length: SAMPLES },
		(_, i) => (hash(i, 21) + hash(i, 22) + hash(i, 23)) / 3,
	);
	const bins = new Array(BINS).fill(0) as number[];
	for (const v of sample) {
		const b = Math.min(BINS - 1, Math.floor(v * BINS));
		bins[b] = (bins[b] ?? 0) + 1;
	}
	const binMax = Math.max(...bins);

	const pdf = (x: number): number => {
		const z = (x - mu) / sigma;
		return Math.exp(-0.5 * z * z);
	};

	function build(): void {
		const { svg, w, h } = plate(mount);
		const svgNode = svg.node() as SVGSVGElement;
		const pad = 14;
		const x = scaleLinear([0, 1], [pad, w - pad]);
		const yTop = pad + 6;
		const y0 = h - 22;
		const py = (v: number): number => y0 - v * (y0 - yTop);
		const g = svg.append("g") as G;

		// histogram
		const bw = (x(1) - x(0)) / BINS;
		bins.forEach((b, i) => {
			g.append("rect")
				.attr("class", "bar")
				.attr("x", x(i / BINS) + 1)
				.attr("width", bw - 2)
				.attr("y", y0 - (b / binMax) * (y0 - yTop) * 0.85)
				.attr("height", (b / binMax) * (y0 - yTop) * 0.85);
		});

		// baseline axis with ticks
		axis(
			g.append("g").attr("transform", `translate(0,${y0})`) as G,
			bottomAxis(x).tickValues([0, 0.25, 0.5, 0.75, 1]).tickSize(3),
		);

		const band = g.append("path").attr("class", "wash");
		const curve = g.append("path").attr("class", "curve");
		const muLine = g.append("line").attr("class", "hair");
		const muLabel = g.append("text").attr("class", "vlabel");
		const sigBracket = g.append("line").attr("class", "hair emph");
		const sigLabel = g.append("text").attr("class", "vlabel");
		const muH = handle(g, "mu");
		const sigH = handle(g, "sigma");

		const xs = Array.from({ length: 161 }, (_, i) => i / 160);
		const curveLine = line<number>()
			.x((v) => x(v))
			.y((v) => py(pdf(v)));
		const bandArea = area<number>()
			.x((v) => x(v))
			.y0(y0)
			.y1((v) => py(pdf(v)));

		update = () => {
			curve.attr("d", curveLine(xs));
			const bandXs = xs.filter((v) => v >= mu - sigma && v <= mu + sigma);
			band.attr("d", bandArea(bandXs));
			muLine.attr("x1", x(mu)).attr("x2", x(mu)).attr("y1", y0).attr("y2", py(1));
			muLabel
				.attr("x", x(mu))
				.attr("y", y0 + 16)
				.attr("text-anchor", "middle")
				.text("μ");
			// σ bracket at the inflection height, μ → μ+σ
			const infY = py(Math.exp(-0.5));
			sigBracket
				.attr("x1", x(mu))
				.attr("x2", x(mu + sigma))
				.attr("y1", infY)
				.attr("y2", infY);
			sigLabel
				.attr("x", x(mu + sigma / 2))
				.attr("y", infY - 6)
				.attr("text-anchor", "middle")
				.text("σ");
			muH.attr("transform", `translate(${x(mu)},${py(1)})`);
			sigH.attr("transform", `translate(${x(mu + sigma)},${infY})`);
			hooks.onParams({ mu, sigma });
		};

		const px = (ev: { sourceEvent: PointerEvent }): number => {
			const r = svgNode.getBoundingClientRect();
			return x.invert(ev.sourceEvent.clientX - r.left);
		};
		muH.call(
			drag<SVGGElement, unknown>().on("drag", (ev) => {
				mu = Math.min(0.9, Math.max(0.1, px(ev as { sourceEvent: PointerEvent })));
				update();
			}),
		);
		sigH.call(
			drag<SVGGElement, unknown>().on("drag", (ev) => {
				sigma = Math.min(0.3, Math.max(0.03, px(ev as { sourceEvent: PointerEvent }) - mu));
				update();
			}),
		);

		update();
	}

	const ro = new ResizeObserver(() => build());
	ro.observe(mount);
	build();

	return {
		reset(): void {
			mu = 0.5;
			sigma = 0.11;
			update();
		},
		setLit(on: boolean): void {
			mount.querySelector("svg")?.classList.toggle("lit", on);
		},
		redraw(): void {
			update();
		},
		destroy(): void {
			ro.disconnect();
		},
	};
};
