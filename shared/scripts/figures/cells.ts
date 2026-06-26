import { select } from "d3-selection";
import type { FigTheme } from "./theme";
import type { CellsSpec, RenderCtx } from "./types";

/** Themed D3 schematic: labelled memory cells in rows (e.g. AoS vs SoA). */
export function renderCells(
	svgEl: SVGSVGElement,
	spec: CellsSpec,
	t: FigTheme,
	width: number,
	ctx: RenderCtx,
): void {
	const rowGap = 58;
	const cellH = 30;
	const top = 22; // room for the row label that sits above each row
	const height = spec.height ?? spec.rows.length * rowGap + top + 8;

	const svg = select(svgEl)
		.attr("viewBox", `0 0 ${width} ${height}`)
		.attr("width", "100%")
		.attr("height", height)
		.attr("font-family", t.fontData);
	svg.selectAll("*").remove();

	spec.rows.forEach((row, ri) => {
		const y = top + ri * rowGap;
		const hot = row.accent || ctx.step === ri;
		const g = svg.append("g").attr("class", "fig-part");
		if (row.xref) g.attr("data-xref", row.xref);

		// row label: small caps, Computer Modern
		g.append("text")
			.attr("x", 0)
			.attr("y", y - 6)
			.attr("font-family", t.fontLabel)
			.attr("font-size", 10)
			.attr("letter-spacing", "0.08em")
			.attr("fill", hot ? t.accent : t.inkMuted)
			.text(row.label.toUpperCase());

		const n = row.cells.length;
		const cw = Math.min(58, (width - 130) / n);
		row.cells.forEach((c, ci) => {
			const x = ci * (cw + 4);
			g.append("rect")
				.attr("x", x)
				.attr("y", y)
				.attr("width", cw)
				.attr("height", cellH)
				.attr("fill", hot ? t.accentSoft : "transparent")
				.attr("stroke", hot ? t.accent : t.ink)
				.attr("stroke-width", t.hairline);
			g.append("text")
				.attr("x", x + cw / 2)
				.attr("y", y + cellH / 2)
				.attr("text-anchor", "middle")
				.attr("dy", "0.32em")
				.attr("font-size", 11)
				.attr("fill", t.ink)
				.text(c);
		});

		if (row.note)
			g.append("text")
				.attr("x", n * (cw + 4) + 8)
				.attr("y", y + cellH / 2)
				.attr("dy", "0.32em")
				.attr("font-family", t.fontLabel)
				.attr("font-style", "italic")
				.attr("font-size", 11.5)
				.attr("fill", hot ? t.accent : t.inkMuted)
				.text(row.note);
	});
}
