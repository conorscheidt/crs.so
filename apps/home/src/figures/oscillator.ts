/**
 * Damped oscillator in two linked panels. Left: the s-plane, where the upper
 * pole of s² + 2ζωs + ω² can be dragged on equal scales (the dashed arc is
 * |s| = ω, θ = arccos ζ). Right: the response x(t) with its envelope; the first
 * overshoot is draggable too, inverted to ζ analytically. Either side updates
 * the other and the bound terms in the prose.
 */
import { drag } from "d3-drag";
import { format } from "d3-format";
import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { axis, bottomAxis, buildToWidth, type G, handle, leftAxis, plate, varLabel } from "./ink";
import type { FigureFactory, FigureImpl } from "./registry";

const f2 = format(".2f");
const T_MAX = 9;

export const oscillator: FigureFactory = (mount, hooks): FigureImpl => {
	let zeta = 0.12;
	let omega = 2.4;

	// rebuilt on resize; update() mutates attributes only
	let update: () => void = () => {};

	const peak = (): { t: number; x: number } => {
		const z = Math.min(zeta, 0.995);
		const wd = omega * Math.sqrt(1 - z * z);
		return { t: Math.PI / wd, x: -Math.exp((-z * Math.PI) / Math.sqrt(1 - z * z)) };
	};

	const response = (t: number): number => {
		if (zeta < 0.999) {
			const wd = omega * Math.sqrt(1 - zeta * zeta);
			return (
				Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t))
			);
		}
		return Math.exp(-omega * t) * (1 + omega * t);
	};

	function build(): void {
		const { svg, w, h } = plate(mount);
		const svgNode = svg.node() as SVGSVGElement;

		// ---- left panel: s-plane, equal scales (7.4 × 7.4 units) ----
		const pad = 16;
		const side = h - 2 * pad;
		const sx = scaleLinear([-6.8, 0.6], [pad, pad + side]);
		const sy = scaleLinear([-0.6, 6.8], [pad + side, pad]);
		const sp = svg.append("g");

		sp.append("line")
			.attr("class", "axis-line")
			.attr("x1", sx(-6.8))
			.attr("x2", sx(0.6))
			.attr("y1", sy(0))
			.attr("y2", sy(0));
		sp.append("line")
			.attr("class", "axis-line")
			.attr("x1", sx(0))
			.attr("x2", sx(0))
			.attr("y1", sy(-0.6))
			.attr("y2", sy(6.8));
		axis(
			sp.append("g").attr("transform", `translate(0,${sy(0)})`) as G,
			bottomAxis(sx).tickValues([-6, -4, -2]).tickSize(3),
		);
		axis(
			sp.append("g").attr("transform", `translate(${sx(0)},0)`) as G,
			leftAxis(sy).tickValues([2, 4, 6]).tickSize(3),
		);
		varLabel(sp as unknown as G, sx(0.6) - 16, sy(0) + 24, "Re");
		varLabel(sp as unknown as G, sx(0) + 7, sy(6.8) + 10, "Im");

		const locus = sp.append("path").attr("class", "hair");
		const ray = sp.append("line").attr("class", "hair");
		const thetaArc = sp.append("path").attr("class", "hair");
		const thetaLabel = sp.append("text").attr("class", "vlabel");
		const cross = sp.append("g").attr("class", "polemark");
		cross.append("line").attr("x1", -4).attr("y1", -4).attr("x2", 4).attr("y2", 4);
		cross.append("line").attr("x1", -4).attr("y1", 4).attr("x2", 4).attr("y2", -4);
		const poleH = handle(sp as unknown as G, "pole");

		// ---- right panel: response x(t) ----
		const rx0 = pad + side + 44;
		const rx = scaleLinear([0, T_MAX], [rx0, w - 14]);
		const ry = scaleLinear([-1.05, 1.05], [h - pad - 6, pad + 4]);
		const rp = svg.append("g");

		// dotted grid at the ticks
		for (const t of [3, 6, 9]) {
			rp.append("line")
				.attr("class", "grid")
				.attr("x1", rx(t))
				.attr("x2", rx(t))
				.attr("y1", ry(-1))
				.attr("y2", ry(1));
		}
		for (const v of [-1, 1]) {
			rp.append("line")
				.attr("class", "grid")
				.attr("x1", rx(0))
				.attr("x2", rx(T_MAX))
				.attr("y1", ry(v))
				.attr("y2", ry(v));
		}
		axis(
			rp.append("g").attr("transform", `translate(0,${ry(0)})`) as G,
			bottomAxis(rx).tickValues([3, 6, 9]).tickSize(3),
		);
		axis(
			rp.append("g").attr("transform", `translate(${rx(0)},0)`) as G,
			leftAxis(ry).tickValues([-1, 1]).tickSize(3),
		);
		varLabel(rp as unknown as G, rx(T_MAX) - 8, ry(0) + 24, "t");
		varLabel(rp as unknown as G, rx(0) + 8, ry(1.05) + 8, "x(t)");

		const envTop = rp.append("path").attr("class", "hair");
		const envBot = rp.append("path").attr("class", "hair");
		const curve = rp.append("path").attr("class", "curve");
		const peakH = handle(rp as unknown as G, "peak");

		// readout
		const readout = svg
			.append("text")
			.attr("class", "readout")
			.attr("x", w - 14)
			.attr("y", pad + 8)
			.attr("text-anchor", "end");

		const samples = Array.from({ length: 181 }, (_, i) => (i / 180) * T_MAX);
		const curveLine = line<number>()
			.x((t) => rx(t))
			.y((t) => ry(Math.max(-1.05, Math.min(1.05, response(t)))));
		const envLine = (sgn: number) =>
			line<number>()
				.x((t) => rx(t))
				.y((t) => ry(sgn * Math.exp(-zeta * omega * t)))(samples);

		update = () => {
			const wd = omega * Math.sqrt(1 - Math.min(zeta, 0.995) ** 2);
			const re = -zeta * omega;
			// |s| = ω locus: quarter-ish arc from iω around to −ω
			locus.attr(
				"d",
				`M ${sx(0)} ${sy(omega)} A ${sx(omega) - sx(0)} ${sx(omega) - sx(0)} 0 0 0 ${sx(-omega)} ${sy(0)}`,
			);
			ray.attr("x1", sx(0)).attr("y1", sy(0)).attr("x2", sx(re)).attr("y2", sy(wd));
			// θ from the negative real axis (cos θ = ζ), small arc near origin
			const th = Math.acos(Math.min(1, zeta));
			const r0 = 26;
			const a0 = { x: sx(0) - r0, y: sy(0) };
			const a1 = {
				x: sx(0) + Math.cos(Math.PI - th) * r0,
				y: sy(0) - Math.sin(Math.PI - th) * r0,
			};
			thetaArc.attr("d", `M ${a0.x} ${a0.y} A ${r0} ${r0} 0 0 1 ${a1.x} ${a1.y}`);
			thetaLabel
				.attr("x", sx(0) - r0 - 4)
				.attr("y", sy(0) - 8)
				.attr("text-anchor", "end")
				.text("θ");
			cross.attr("transform", `translate(${sx(re)},${sy(wd)})`);
			poleH.attr("transform", `translate(${sx(re)},${sy(wd)})`);

			envTop.attr("d", envLine(1));
			envBot.attr("d", envLine(-1));
			curve.attr("d", curveLine(samples));
			const p = peak();
			peakH
				.style("display", zeta < 0.995 ? "" : "none")
				.attr("transform", `translate(${rx(p.t)},${ry(Math.max(-1.05, p.x))})`);
			readout.text(`ζ = ${f2(zeta)}   ω = ${f2(omega)}`);
			hooks.onParams({ zeta, omega });
		};

		// ---- interactions ----
		const svgPoint = (ev: { sourceEvent: PointerEvent }): { x: number; y: number } => {
			const r = svgNode.getBoundingClientRect();
			return { x: ev.sourceEvent.clientX - r.left, y: ev.sourceEvent.clientY - r.top };
		};

		poleH.call(
			drag<SVGGElement, unknown>()
				.on("start", () => svg.classed("dragging", true))
				.on("end", () => svg.classed("dragging", false))
				.on("drag", (ev) => {
					const { x, y } = svgPoint(ev as { sourceEvent: PointerEvent });
					const re = Math.min(-0.02, sx.invert(x));
					const im = Math.max(0.05, sy.invert(y));
					omega = Math.min(6, Math.max(0.8, Math.hypot(re, im)));
					zeta = Math.min(0.99, Math.max(0.02, -re / omega));
					update();
				}),
		);
		peakH.call(
			drag<SVGGElement, unknown>()
				.on("start", () => svg.classed("dragging", true))
				.on("end", () => svg.classed("dragging", false))
				.on("drag", (ev) => {
					const { x, y } = svgPoint(ev as { sourceEvent: PointerEvent });
					// vertical → overshoot M → ζ = ln(1/M)/√(π²+ln²(1/M)); horizontal → ω
					const M = Math.min(0.96, Math.max(0.015, -ry.invert(y)));
					const L = Math.log(1 / M);
					zeta = Math.min(0.99, Math.max(0.02, L / Math.sqrt(Math.PI * Math.PI + L * L)));
					const t = Math.min(T_MAX * 0.7, Math.max(0.25, rx.invert(x)));
					omega = Math.min(6, Math.max(0.8, Math.PI / (t * Math.sqrt(1 - zeta * zeta))));
					update();
				}),
		);

		update();
	}

	const ro = buildToWidth(mount, build);

	return {
		reset(): void {
			zeta = 0.12;
			omega = 2.4;
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
