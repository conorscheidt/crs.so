/** Plate pieces shared by the tensor-train figures; all styling stays in article.css. */
import { drag } from "d3-drag";
import { type ScaleLogarithmic, scaleLog } from "d3-scale";
import { type G, handle, type Svg } from "../ink";
import type { Matrix } from "./linalg";

const SUP: Readonly<Record<string, string>> = {
	"-": "⁻",
	"0": "⁰",
	"1": "¹",
	"2": "²",
	"3": "³",
	"4": "⁴",
	"5": "⁵",
	"6": "⁶",
	"7": "⁷",
	"8": "⁸",
	"9": "⁹",
};

/** 10ⁿ as a tick label. */
export function pow10(e: number): string {
	if (e === 0) return "1";
	if (e === 1) return "10";
	return `10${[...String(e)].map((c) => SUP[c] ?? c).join("")}`;
}

/** A log scale whose ticks are the powers of ten inside [lo, hi]. */
export function logScale(
	domain: readonly [number, number],
	range: readonly [number, number],
): { scale: ScaleLogarithmic<number, number>; decades: number[] } {
	const scale = scaleLog([domain[0], domain[1]], [range[0], range[1]]);
	const lo = Math.ceil(Math.log10(Math.min(domain[0], domain[1])));
	const hi = Math.floor(Math.log10(Math.max(domain[0], domain[1])));
	return { scale, decades: Array.from({ length: hi - lo + 1 }, (_, k) => lo + k) };
}

let heatId = 0;

export interface Heatmap {
	update: (m: Matrix, vmax: number) => void;
}

/**
 * A matrix as a luminance mask over an ink rectangle. The color therefore
 * comes from the `.heat` class and follows a theme flip with no redraw.
 */
export function heatmap(
	svg: Svg,
	g: G,
	x: number,
	y: number,
	w: number,
	h: number,
	param?: string,
): Heatmap {
	const id = `tt-heat-${++heatId}`;
	const defs = svg.select<SVGDefsElement>("defs").empty()
		? svg.append("defs")
		: svg.select<SVGDefsElement>("defs");
	const image = defs
		.append("mask")
		.attr("id", id)
		.append("image")
		.attr("x", x)
		.attr("y", y)
		.attr("width", w)
		.attr("height", h)
		.attr("preserveAspectRatio", "none");
	g.append("rect")
		.attr("class", "heat")
		.attr("x", x)
		.attr("y", y)
		.attr("width", w)
		.attr("height", h)
		.attr("mask", `url(#${id})`)
		.attr("data-part", param ?? null);
	g.append("rect")
		.attr("class", "heatframe")
		.attr("x", x)
		.attr("y", y)
		.attr("width", w)
		.attr("height", h)
		.attr("data-part", param ?? null);
	const canvas = document.createElement("canvas");
	return {
		update: (m: Matrix, vmax: number): void => {
			const rows = m.length;
			const cols = m[0]?.length ?? 0;
			canvas.width = cols;
			canvas.height = rows;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			const img = ctx.createImageData(cols, rows);
			m.forEach((row, i) => {
				row.forEach((v, j) => {
					const t = 255 * Math.max(0, Math.min(1, v / vmax)) ** 0.75;
					const o = 4 * ((rows - 1 - i) * cols + j);
					img.data[o] = t;
					img.data[o + 1] = t;
					img.data[o + 2] = t;
					img.data[o + 3] = 255;
				});
			});
			ctx.putImageData(img, 0, 0);
			image.attr("href", canvas.toDataURL());
		},
	};
}

/**
 * A horizontal track with `stops` evenly spaced positions and one handle that
 * snaps to them. Calls `onChange` with the stop index while dragging.
 */
export function track(
	g: G,
	svgNode: SVGSVGElement,
	x0: number,
	x1: number,
	y: number,
	stops: number,
	onChange: (index: number) => void,
	param?: string,
): { set: (index: number) => void } {
	const xs = Array.from({ length: stops }, (_, k) => x0 + ((x1 - x0) * k) / Math.max(1, stops - 1));
	return trackAt(g, svgNode, xs, y, onChange, param);
}

/**
 * A track whose stops sit at the given increasing x positions, for a slider
 * that has to line up with data spaced unevenly. The handle snaps to the stop
 * nearest the pointer.
 */
export function trackAt(
	g: G,
	svgNode: SVGSVGElement,
	xs: readonly number[],
	y: number,
	onChange: (index: number) => void,
	param?: string,
): { set: (index: number) => void } {
	const last = xs.length - 1;
	g.append("line")
		.attr("class", "axis-line")
		.attr("x1", xs[0] ?? 0)
		.attr("x2", xs[last] ?? 0)
		.attr("y1", y)
		.attr("y2", y);
	for (const x of xs) {
		g.append("line")
			.attr("class", "axis-line")
			.attr("x1", x)
			.attr("x2", x)
			.attr("y1", y - 3)
			.attr("y2", y + 3);
	}
	const knob = handle(g).attr("data-part", param ?? null);
	let current = -1;
	const set = (k: number): void => {
		const next = Math.max(0, Math.min(last, k));
		knob.attr("transform", `translate(${xs[next] ?? 0},${y})`);
		if (next !== current) {
			current = next;
			onChange(next);
		}
	};
	const nearest = (px: number): number => {
		let best = 0;
		for (const [k, x] of xs.entries())
			if (Math.abs(x - px) < Math.abs((xs[best] ?? 0) - px)) best = k;
		return best;
	};
	knob.call(
		drag<SVGGElement, unknown>()
			.on("start", () => svgNode.classList.add("dragging"))
			.on("drag", (ev: { sourceEvent: PointerEvent }) => {
				set(nearest(ev.sourceEvent.clientX - svgNode.getBoundingClientRect().left));
			})
			.on("end", () => svgNode.classList.remove("dragging")),
	);
	return { set };
}

/** Labels at the ends of a track. */
export function trackLabels(
	g: G,
	x0: number,
	x1: number,
	y: number,
	left: string,
	right: string,
): void {
	g.append("text")
		.attr("class", "tlabel")
		.attr("x", x0)
		.attr("y", y + 16)
		.attr("text-anchor", "middle")
		.text(left);
	g.append("text")
		.attr("class", "tlabel")
		.attr("x", x1)
		.attr("y", y + 16)
		.attr("text-anchor", "middle")
		.text(right);
}

/**
 * A choice between named states, set as italic labels stacked `step` apart in
 * the plate's own voice, the chosen one in full ink. Each label is a button,
 * so it takes the keyboard focus and answers Enter and Space.
 */
export function choices<T extends string>(
	g: G,
	x: number,
	y: number,
	step: number,
	options: readonly (readonly [value: T, label: string])[],
	chosen: T,
	onChoose: (value: T) => void,
): void {
	for (const [i, [value, label]] of options.entries()) {
		const on = value === chosen;
		g.append("text")
			.attr("class", on ? "choice on" : "choice")
			.attr("x", x)
			.attr("y", y + i * step)
			.attr("role", "button")
			.attr("tabindex", 0)
			.attr("aria-pressed", String(on))
			.text(label)
			.on("click", () => onChoose(value))
			.on("keydown", (ev: KeyboardEvent) => {
				if (ev.key !== "Enter" && ev.key !== " ") return;
				ev.preventDefault();
				onChoose(value);
			});
	}
}
