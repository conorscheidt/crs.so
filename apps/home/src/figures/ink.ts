/**
 * Shared plate helpers. Every figure is an SVG drawn in the site's ink.
 * Styling lives in article.css (classes below); this file only builds
 * structure. Classes: axis · grid · hair (construction) · curve · wash (area
 * fill) · handle · halo · vlabel (Spectral italic) · tlabel (mono ticks).
 */
import { type Axis, type AxisDomain, axisBottom, axisLeft } from "d3-axis";
import { type Selection, select } from "d3-selection";

export type Svg = Selection<SVGSVGElement, unknown, null, undefined>;
export type G = Selection<SVGGElement, unknown, null, undefined>;

/** Fresh svg filling the mount; kills any previous plate (resize re-entry). */
export function plate(mount: HTMLElement): { svg: Svg; w: number; h: number } {
	select(mount).select("svg").remove();
	const w = mount.clientWidth;
	const h = mount.clientHeight || 200;
	const svg = select(mount)
		.append("svg")
		.attr("width", w)
		.attr("height", h)
		.attr("viewBox", `0 0 ${w} ${h}`);
	return { svg, w, h };
}

/** A styled axis: hairline domain, 4px ticks, mono numerals (CSS: .axis). */
export function axis<D extends AxisDomain>(g: G, ax: Axis<D>): G {
	g.attr("class", "axis").call(ax as unknown as (sel: G) => void);
	g.selectAll("text").attr("class", "tlabel");
	return g;
}

export const bottomAxis = axisBottom;
export const leftAxis = axisLeft;

/** Italic serif variable label, LaTeX-style. */
export function varLabel(g: G | Svg, x: number, y: number, text: string): void {
	g.append("text").attr("class", "vlabel").attr("x", x).attr("y", y).text(text);
}

/** A draggable handle: invisible fat hit ring + visible dot + hover halo.
 *  Returns the group; callers attach d3-drag to it. */
export function handle(g: G, cls = ""): G {
	const grp = g.append("g").attr("class", `handle ${cls}`.trim());
	grp.append("circle").attr("class", "hit").attr("r", 14);
	grp.append("circle").attr("class", "halo").attr("r", 9);
	grp.append("circle").attr("class", "dot").attr("r", 4);
	return grp;
}

/** Deterministic hash for stable sample and layout seeds. */
export function hash(i: number, salt: number): number {
	const x = Math.sin(i * 127.1 + salt * 311.7) * 43_758.5453;
	return x - Math.floor(x);
}

/** Grab cursor: puts the cursor ring in grab mode over handles. */
export function grabOn(mount: HTMLElement, sel: G): void {
	sel
		.on("pointerenter.cursor", () => {
			mount.dataset.cursorMode = "grab";
		})
		.on("pointerleave.cursor", () => {
			mount.dataset.cursorMode = "";
		});
}
