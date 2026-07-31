/**
 * Line engine, driven by the conductor. Renders one hairline SVG path and
 * exposes pure step functions (drawStep / morphStep). It owns no clock.
 */
import { type Segment, interpolatePairs, matchSegments, pathLength, segLength, toSvgPath } from "./segments";

export class LineEngine {
	private path: SVGPathElement;
	private svg: SVGSVGElement;
	current: Segment[] = [];

	constructor(host: HTMLElement) {
		const ns = "http://www.w3.org/2000/svg";
		this.svg = document.createElementNS(ns, "svg");
		this.svg.id = "colophon";
		this.svg.setAttribute("aria-hidden", "true");
		this.path = document.createElementNS(ns, "path");
		this.svg.appendChild(this.path);
		host.appendChild(this.svg);
		this.fit();
	}

	fit(): void {
		this.svg.setAttribute("viewBox", `0 0 ${innerWidth} ${innerHeight}`);
	}

	/** Set the full path instantly (settle mode, resize re-derive). */
	set(segs: Segment[]): void {
		this.current = segs;
		this.path.removeAttribute("stroke-dasharray");
		this.path.removeAttribute("stroke-dashoffset");
		this.path.setAttribute("d", toSvgPath(segs));
	}

	totalLength(segs: Segment[]): number {
		return pathLength(segs);
	}

	/** Cumulative pen offset at which `name` begins. */
	offsetOf(segs: Segment[], name: string): number {
		let acc = 0;
		for (const s of segs) {
			if (s.name === name) return acc;
			acc += segLength(s.points);
		}
		return acc;
	}

	/** Draw-in: constant pen speed via dash offset over the real DOM length. */
	beginDraw(segs: Segment[]): number {
		this.current = segs;
		this.path.setAttribute("d", toSvgPath(segs));
		const len = this.path.getTotalLength();
		this.path.setAttribute("stroke-dasharray", String(len));
		this.path.setAttribute("stroke-dashoffset", String(len));
		return len;
	}

	drawStep(len: number, t: number): void {
		this.path.setAttribute("stroke-dashoffset", String(len * (1 - t)));
		if (t >= 1) {
			this.path.removeAttribute("stroke-dasharray");
			this.path.removeAttribute("stroke-dashoffset");
		}
	}

	/** Prepare a morph to `next`; returns a stepper (conductor drives it). */
	beginMorph(next: Segment[]): (t: number) => void {
		const pairs = matchSegments(this.current, next);
		return (t: number) => {
			const segs = interpolatePairs(pairs, t);
			this.path.setAttribute("d", toSvgPath(segs));
			if (t >= 1) this.current = next;
		};
	}
}
