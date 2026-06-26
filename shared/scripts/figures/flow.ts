import { select } from "d3-selection";
import type { FigTheme } from "./theme";
import type { FlowSpec, RenderCtx } from "./types";

/** Themed D3 flowchart: ranked left→right, hairline ink nodes, oxblood edges. */
export function renderFlow(
	svgEl: SVGSVGElement,
	spec: FlowSpec,
	t: FigTheme,
	width: number,
	ctx: RenderCtx,
): void {
	const ranks = Math.max(...spec.nodes.map((n) => n.rank)) + 1;
	const minGap = 18;
	// inset so the end nodes' shapes and arrowheads don't touch (and clip at) the
	// viewBox edge.
	const padX = 18;
	const usableW = Math.max(40, width - padX * 2);
	// fit all ranks within the usable width: shrink node width before overflow
	const nodeW = Math.max(58, Math.min(108, (usableW - (ranks - 1) * minGap) / ranks));
	const nodeH = 42;
	const gapX = ranks > 1 ? Math.max(minGap, (usableW - ranks * nodeW) / (ranks - 1)) : 0;
	const colCount = (r: number) => spec.nodes.filter((n) => n.rank === r).length;
	const maxCol = Math.max(...Array.from({ length: ranks }, (_, r) => colCount(r)));
	const rowH = nodeH + 34;
	const height = spec.height ?? Math.max(120, maxCol * rowH + 24);

	const svg = select(svgEl)
		.attr("viewBox", `0 0 ${width} ${height}`)
		.attr("width", "100%")
		.attr("height", height)
		.attr("font-family", t.fontLabel);
	svg.selectAll("*").remove();

	// arrowhead marker
	const defs = svg.append("defs");
	defs
		.append("marker")
		.attr("id", "fa-arrow")
		.attr("viewBox", "0 0 10 10")
		.attr("refX", 9)
		.attr("refY", 5)
		.attr("markerWidth", 7)
		.attr("markerHeight", 7)
		.attr("orient", "auto-start-reverse")
		.append("path")
		.attr("d", "M0,0 L10,5 L0,10 z")
		.attr("fill", t.accent);

	// place nodes: x by rank, y centred within column
	const seen: Record<number, number> = {};
	const pos = new Map<string, { x: number; y: number; n: (typeof spec.nodes)[number] }>();
	for (const n of spec.nodes) {
		const idx = seen[n.rank] ?? 0;
		seen[n.rank] = idx + 1;
		const count = colCount(n.rank);
		const x = padX + n.rank * (nodeW + gapX) + nodeW / 2;
		const y = height / 2 + (idx - (count - 1) / 2) * rowH;
		pos.set(n.id, { x, y, n });
	}

	const edgeLayer = svg.append("g");
	const nodeLayer = svg.append("g");

	// edges
	for (const e of spec.edges) {
		const a = pos.get(e.from);
		const b = pos.get(e.to);
		if (!a || !b) continue;
		if (e.loop) {
			const cx = a.x;
			const cy = a.y - nodeH / 2;
			edgeLayer
				.append("path")
				.attr(
					"d",
					`M ${cx - 14} ${cy} C ${cx - 26} ${cy - 30}, ${cx + 26} ${cy - 30}, ${cx + 14} ${cy}`,
				)
				.attr("fill", "none")
				.attr("stroke", t.accent)
				.attr("stroke-width", t.stroke)
				.attr("marker-end", "url(#fa-arrow)");
			if (e.label)
				edgeLayer
					.append("text")
					.attr("x", cx)
					.attr("y", cy - 26)
					.attr("text-anchor", "middle")
					.attr("font-style", "italic")
					.attr("font-size", 11)
					.attr("fill", t.inkMuted)
					.text(e.label);
			continue;
		}
		const x1 = a.x + nodeW / 2;
		const x2 = b.x - nodeW / 2;
		const mx = (x1 + x2) / 2;
		edgeLayer
			.append("path")
			.attr("d", `M ${x1} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${x2} ${b.y}`)
			.attr("fill", "none")
			.attr("stroke", t.ink)
			.attr("stroke-width", t.stroke)
			.attr("stroke-opacity", 0.55)
			.attr("marker-end", "url(#fa-arrow)");
		if (e.label)
			edgeLayer
				.append("text")
				.attr("x", mx)
				.attr("y", (a.y + b.y) / 2 - 6)
				.attr("text-anchor", "middle")
				.attr("font-style", "italic")
				.attr("font-size", 11)
				.attr("fill", t.inkMuted)
				.text(e.label);
	}

	// nodes
	for (const [, p] of pos) {
		const hot = ctx.step >= 0 && spec.nodes[ctx.step]?.id === p.n.id;
		const ng = nodeLayer
			.append("g")
			.attr("class", "fig-part")
			.attr("transform", `translate(${p.x},${p.y})`);
		if (p.n.xref) ng.attr("data-xref", p.n.xref);
		const fill = hot ? t.accentSoft : t.paper2;
		const strokeC = hot ? t.accent : t.ink;
		if (p.n.kind === "decision") {
			const w = nodeW / 2 + 6;
			const h = nodeH / 2 + 4;
			ng.append("polygon")
				.attr("points", `0,${-h} ${w},0 0,${h} ${-w},0`)
				.attr("fill", fill)
				.attr("stroke", strokeC)
				.attr("stroke-width", t.hairline);
		} else if (p.n.kind === "io") {
			ng.append("polygon")
				.attr(
					"points",
					`${-nodeW / 2 + 10},${-nodeH / 2} ${nodeW / 2},${-nodeH / 2} ${nodeW / 2 - 10},${nodeH / 2} ${-nodeW / 2},${nodeH / 2}`,
				)
				.attr("fill", fill)
				.attr("stroke", strokeC)
				.attr("stroke-width", t.hairline);
		} else {
			ng.append("rect")
				.attr("x", -nodeW / 2)
				.attr("y", -nodeH / 2)
				.attr("width", nodeW)
				.attr("height", nodeH)
				.attr("rx", 3)
				.attr("fill", fill)
				.attr("stroke", strokeC)
				.attr("stroke-width", t.hairline);
		}
		// wrap long labels to 2 lines so text never overflows the node box
		const words = p.n.label.split(" ");
		const fontSize = 11;
		const charW = fontSize * 0.58;
		const maxChars = Math.floor((nodeW - 12) / charW);
		const lines: string[] = [];
		if (p.n.label.length > maxChars && words.length > 1) {
			let cur = "";
			for (const w of words) {
				if (cur && `${cur} ${w}`.length > maxChars) {
					lines.push(cur);
					cur = w;
				} else cur = cur ? `${cur} ${w}` : w;
			}
			if (cur) lines.push(cur);
		} else {
			lines.push(p.n.label);
		}
		const txt = ng
			.append("text")
			.attr("text-anchor", "middle")
			.attr("font-size", fontSize)
			.attr("fill", t.ink);
		const startDy = -((lines.length - 1) * 0.55) + 0.32;
		lines.forEach((ln, k) => {
			txt
				.append("tspan")
				.attr("x", 0)
				.attr("dy", `${k === 0 ? startDy : 1.1}em`)
				.text(ln);
		});
	}
}
