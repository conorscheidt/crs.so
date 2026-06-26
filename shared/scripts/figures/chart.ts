import { max, min } from "d3-array";
import { axisBottom, axisLeft } from "d3-axis";
import { format } from "d3-format";
import { scaleBand, scaleLinear, scaleLog, scalePoint } from "d3-scale";
import { select } from "d3-selection";
import { line } from "d3-shape";
import type { FigTheme } from "./theme";
import type { ChartSpec, RenderCtx } from "./types";

/** Themed D3 chart, bar or line. LaTeX axes, oxblood marks, hover readout. */
export function renderChart(
	svgEl: SVGSVGElement,
	spec: ChartSpec,
	t: FigTheme,
	width: number,
	ctx: RenderCtx,
): void {
	const height = spec.height ?? 300;
	const m = { top: 16, right: 18, bottom: 44, left: 56 };
	const iw = Math.max(10, width - m.left - m.right);
	const ih = height - m.top - m.bottom;
	const fmt = format(spec.yFormat ?? ".0f");

	const svg = select(svgEl)
		.attr("viewBox", `0 0 ${width} ${height}`)
		.attr("width", "100%")
		.attr("height", height)
		.attr("font-family", t.fontData);
	svg.selectAll("*").remove();
	const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

	const ys = (spec.logY ? scaleLog() : scaleLinear())
		.domain([
			spec.logY ? Math.max(1e-9, (min(spec.data, (d) => d.y) ?? 1) * 0.6) : 0,
			(max(spec.data, (d) => d.y) ?? 1) * 1.08,
		])
		.range([ih, 0])
		.nice();

	// axes: hairline ink, Computer Modern title, mono ticks
	const yAxis = axisLeft(ys)
		.ticks(5)
		.tickFormat((d) => fmt(d as number))
		.tickSize(-iw);
	const yg = g.append("g").call(yAxis);
	yg.select(".domain").remove();
	yg.selectAll(".tick line").attr("stroke", t.ruleSoft).attr("stroke-width", t.hairline);
	yg.selectAll(".tick text").attr("fill", t.inkMuted).attr("font-size", 11);

	const xs = scaleBand<string>()
		.domain(spec.data.map((d) => String(d.x)))
		.range([0, iw])
		.padding(0.32);
	const xAxis = axisBottom(xs).tickSize(0).tickPadding(10);
	const xg = g.append("g").attr("transform", `translate(0,${ih})`).call(xAxis);
	xg.select(".domain").attr("stroke", t.ink).attr("stroke-width", t.hairline);
	xg.selectAll(".tick text").attr("fill", t.ink).attr("font-size", 11.5);

	// axis titles in Computer Modern italic (LaTeX caption hand)
	if (spec.yLabel) {
		g.append("text")
			.attr("transform", "rotate(-90)")
			.attr("x", -ih / 2)
			.attr("y", -m.left + 14)
			.attr("text-anchor", "middle")
			.attr("font-family", t.fontLabel)
			.attr("font-style", "italic")
			.attr("font-size", 13)
			.attr("fill", t.inkMuted)
			.text(spec.yLabel);
	}
	if (spec.xLabel) {
		g.append("text")
			.attr("x", iw / 2)
			.attr("y", ih + m.bottom - 6)
			.attr("text-anchor", "middle")
			.attr("font-family", t.fontLabel)
			.attr("font-style", "italic")
			.attr("font-size", 13)
			.attr("fill", t.inkMuted)
			.text(spec.xLabel);
	}

	// hover readout, top-right, mono
	const readout = g
		.append("text")
		.attr("x", iw)
		.attr("y", -3)
		.attr("text-anchor", "end")
		.attr("font-size", 11)
		.attr("fill", t.accent)
		.attr("opacity", 0);
	const show = (d: { x: string | number; y: number; label?: string }) =>
		readout
			.attr("opacity", 1)
			.text(`${d.label ?? d.x} · ${fmt(d.y)}${spec.yUnit ? ` ${spec.yUnit}` : ""}`);
	const hide = () => readout.attr("opacity", 0);

	const isHot = (i: number, hl?: boolean) => hl || ctx.step === i;

	if (spec.kind === "bar") {
		g.selectAll("rect.bar")
			.data(spec.data)
			.join("rect")
			.attr("class", "fig-part bar")
			.attr("data-xref", (d) => d.xref ?? null)
			.attr("x", (d) => xs(String(d.x)) ?? 0)
			.attr("width", xs.bandwidth())
			.attr("y", (d) => ys(Math.max(d.y, ys.domain()[0])))
			.attr("height", (d) => ih - ys(Math.max(d.y, ys.domain()[0])))
			.attr("fill", (d, i) => (isHot(i, d.highlight) ? t.accent : t.ink))
			.attr("fill-opacity", (d, i) => (isHot(i, d.highlight) ? 0.92 : 0.16))
			.attr("stroke", (d, i) => (isHot(i, d.highlight) ? t.accent : t.ink))
			.attr("stroke-width", t.hairline)
			.on("pointerenter", (_e, d) => show(d))
			.on("pointerleave", hide);
	} else {
		const xp = scalePoint<string>()
			.domain(spec.data.map((d) => String(d.x)))
			.range([0, iw])
			.padding(0.5);
		const path = line<(typeof spec.data)[number]>()
			.x((d) => xp(String(d.x)) ?? 0)
			.y((d) => ys(d.y));
		g.append("path")
			.datum(spec.data)
			.attr("fill", "none")
			.attr("stroke", t.accent)
			.attr("stroke-width", t.stroke)
			.attr("d", path);
		g.selectAll("circle.pt")
			.data(spec.data)
			.join("circle")
			.attr("class", "fig-part pt")
			.attr("data-xref", (d) => d.xref ?? null)
			.attr("cx", (d) => xp(String(d.x)) ?? 0)
			.attr("cy", (d) => ys(d.y))
			.attr("r", (d, i) => (isHot(i, d.highlight) ? 5 : 3))
			.attr("fill", t.paper)
			.attr("stroke", t.accent)
			.attr("stroke-width", t.stroke)
			.on("pointerenter", (_e, d) => show(d))
			.on("pointerleave", hide);
	}
}
