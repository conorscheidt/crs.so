/**
 * Circumcircle construction: triangle ABC with draggable vertices, the dashed
 * perpendicular bisectors with right-angle ticks, the circumcentre O, the
 * circumcircle, and radius OA labelled r. onParams reports r as a fraction of
 * the plate's short side.
 */
import { drag } from "d3-drag";
import { type G, handle, plate } from "./ink";
import type { FigureFactory, FigureImpl } from "./registry";

// Coordinates live in a square centred in the plate, since an anisotropic
// space would distort the circle. The initial triangle is acute so it fits.
const START: [number, number][] = [
	[0.24, 0.74],
	[0.5, 0.14],
	[0.8, 0.6],
];
const NAMES = ["A", "B", "C"];

export const geometry: FigureFactory = (mount, hooks): FigureImpl => {
	let pts = START.map(([x, y]) => ({ x, y }));
	let update: () => void = () => {};

	const circum = (px: { x: number; y: number }[]): { x: number; y: number; r: number } | null => {
		const [a, b, c] = px as [
			{ x: number; y: number },
			{ x: number; y: number },
			{ x: number; y: number },
		];
		const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
		if (Math.abs(d) < 1e-6) return null;
		const a2 = a.x * a.x + a.y * a.y;
		const b2 = b.x * b.x + b.y * b.y;
		const c2 = c.x * c.x + c.y * c.y;
		const ux = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
		const uy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
		return { x: ux, y: uy, r: Math.hypot(a.x - ux, a.y - uy) };
	};

	function build(): void {
		const { svg, w, h } = plate(mount);
		const svgNode = svg.node() as SVGSVGElement;
		const side = Math.min(w, h);
		const ox = (w - side) / 2;
		const g = svg.append("g") as G;

		const circle = g.append("circle").attr("class", "curve").attr("fill", "none");
		const bisectors = [0, 1, 2].map(() => g.append("line").attr("class", "hair"));
		const rightAngles = [0, 1, 2].map(() => g.append("path").attr("class", "hair"));
		const tri = g.append("path").attr("class", "shape");
		const radius = g.append("line").attr("class", "hair emph");
		const rLabel = g.append("text").attr("class", "vlabel");
		const centre = g.append("circle").attr("class", "dotmark").attr("r", 2.2);
		const oLabel = g.append("text").attr("class", "vlabel");
		const labels = NAMES.map(() => g.append("text").attr("class", "vlabel"));
		const handles = pts.map(() => handle(g));

		update = () => {
			const P = pts.map((p) => ({ x: ox + p.x * side, y: p.y * side }));
			const cc = circum(P);
			tri.attr("d", `M ${P[0]?.x} ${P[0]?.y} L ${P[1]?.x} ${P[1]?.y} L ${P[2]?.x} ${P[2]?.y} Z`);
			P.forEach((p, i) => {
				handles[i]?.attr("transform", `translate(${p.x},${p.y})`);
				// vertex label pushed outward from the triangle's centroid
				const cx = (P[0]?.x ?? 0) / 3 + (P[1]?.x ?? 0) / 3 + (P[2]?.x ?? 0) / 3;
				const cy = (P[0]?.y ?? 0) / 3 + (P[1]?.y ?? 0) / 3 + (P[2]?.y ?? 0) / 3;
				const dx = p.x - cx;
				const dy = p.y - cy;
				const L = Math.hypot(dx, dy) || 1;
				labels[i]
					?.attr("x", p.x + (dx / L) * 14)
					.attr("y", p.y + (dy / L) * 14 + 4)
					.attr("text-anchor", "middle")
					.text(NAMES[i] ?? "");
			});
			if (!cc) return;
			circle.attr("cx", cc.x).attr("cy", cc.y).attr("r", cc.r);
			centre.attr("cx", cc.x).attr("cy", cc.y);
			oLabel
				.attr("x", cc.x + 7)
				.attr("y", cc.y - 6)
				.text("O");
			for (let i = 0; i < 3; i++) {
				const p = P[i] as { x: number; y: number };
				const q = P[(i + 1) % 3] as { x: number; y: number };
				const mx = (p.x + q.x) / 2;
				const my = (p.y + q.y) / 2;
				let dx = cc.x - mx;
				let dy = cc.y - my;
				const L = Math.hypot(dx, dy) || 1;
				dx /= L;
				dy /= L;
				bisectors[i]
					?.attr("x1", mx - dx * 1000)
					.attr("y1", my - dy * 1000)
					.attr("x2", mx + dx * 1000)
					.attr("y2", my + dy * 1000);
				// right-angle tick: bisector ⟂ edge at the midpoint
				let ex = q.x - p.x;
				let ey = q.y - p.y;
				const EL = Math.hypot(ex, ey) || 1;
				ex /= EL;
				ey /= EL;
				const s = 5;
				rightAngles[i]?.attr(
					"d",
					`M ${mx + ex * s} ${my + ey * s} L ${mx + ex * s + dx * s} ${my + ey * s + dy * s} L ${mx + dx * s} ${my + dy * s}`,
				);
			}
			const A = P[0] as { x: number; y: number };
			radius.attr("x1", cc.x).attr("y1", cc.y).attr("x2", A.x).attr("y2", A.y);
			rLabel
				.attr("x", (cc.x + A.x) / 2 + 7)
				.attr("y", (cc.y + A.y) / 2 - 5)
				.text("r");
			hooks.onParams({ r: cc.r / Math.min(w, h) });
		};

		handles.forEach((hd, i) => {
			hd.call(
				drag<SVGGElement, unknown>().on("drag", (ev) => {
					const r = svgNode.getBoundingClientRect();
					const se = (ev as { sourceEvent: PointerEvent }).sourceEvent;
					const p = pts[i] as { x: number; y: number };
					p.x = Math.min(1.3, Math.max(-0.3, (se.clientX - r.left - ox) / side));
					p.y = Math.min(0.94, Math.max(0.06, (se.clientY - r.top) / side));
					update();
				}),
			);
		});

		update();
	}

	const ro = new ResizeObserver(() => build());
	ro.observe(mount);
	build();

	return {
		reset(): void {
			pts = START.map(([x, y]) => ({ x, y }));
			build();
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
