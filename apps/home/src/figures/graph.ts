/**
 * Graph plate: a d3-force embedding. Nodes are sized by degree and draggable
 * (dragging reheats the simulation); hovering a node highlights its
 * neighbourhood and fades the rest. onParams reports the simulation
 * temperature α as it anneals.
 */
import { drag } from "d3-drag";
import {
	forceCenter,
	forceCollide,
	forceLink,
	forceManyBody,
	forceSimulation,
	type SimulationLinkDatum,
	type SimulationNodeDatum,
} from "d3-force";
import { type G, hash, plate } from "./ink";
import type { FigureFactory, FigureImpl } from "./registry";

interface N extends SimulationNodeDatum {
	id: number;
	deg: number;
}
type L = SimulationLinkDatum<N>;

const N_NODES = 14;
const EDGE_IDS: [number, number][] = [
	[0, 1],
	[0, 2],
	[1, 3],
	[2, 3],
	[3, 4],
	[4, 5],
	[4, 6],
	[5, 7],
	[6, 7],
	[7, 8],
	[8, 9],
	[8, 10],
	[9, 11],
	[10, 11],
	[2, 6],
	[1, 5],
	[11, 12],
	[12, 13],
	[10, 13],
];

export const graph: FigureFactory = (mount, hooks): FigureImpl => {
	const seed = (): N[] =>
		Array.from({ length: N_NODES }, (_, i) => ({
			id: i,
			deg: EDGE_IDS.filter(([a, b]) => a === i || b === i).length,
			x: 0.5 + (hash(i, 11) - 0.5) * 0.5,
			y: 0.5 + (hash(i, 12) - 0.5) * 0.5,
		}));

	let nodes = seed();
	let links: L[] = EDGE_IDS.map(([source, target]) => ({ source, target }));
	const sim = forceSimulation<N>()
		.force("charge", forceManyBody().strength(-150))
		.force("collide", forceCollide(13))
		.alphaDecay(0.015);

	let update: () => void = () => {};

	function wire(w: number, h: number): void {
		// seed coordinates are stored normalized; scale into the plate once
		for (const n of nodes) {
			if ((n.x ?? 0) <= 1) {
				n.x = (n.x ?? 0.5) * w;
				n.y = (n.y ?? 0.5) * h;
			}
		}
		sim
			.nodes(nodes)
			.force("link", forceLink<N, L>(links).distance(58).strength(0.7))
			.force("center", forceCenter(w / 2, h / 2).strength(0.08))
			.alpha(1)
			.restart();
	}

	function build(): void {
		const { svg, w, h } = plate(mount);
		const g = svg.append("g") as G;
		const edgeSel = g.selectAll("line").data(links).join("line").attr("class", "edge");
		const nodeSel = g
			.selectAll<SVGCircleElement, N>("circle")
			.data(nodes)
			.join("circle")
			.attr("class", "node")
			.attr("r", (d) => 2.6 + d.deg * 0.9);

		// hover a node: highlight its neighbourhood, fade the rest
		nodeSel
			.on("pointerenter", (_ev, d) => {
				const near = new Set<N>([d]);
				for (const l of links) {
					if (l.source === d) near.add(l.target as N);
					if (l.target === d) near.add(l.source as N);
				}
				nodeSel.classed("dim", (n) => !near.has(n)).classed("hot", (n) => n === d);
				edgeSel.classed("dim", (l) => l.source !== d && l.target !== d);
			})
			.on("pointerleave", () => {
				nodeSel.classed("dim", false).classed("hot", false);
				edgeSel.classed("dim", false);
			});

		nodeSel.call(
			drag<SVGCircleElement, N>()
				.on("start", (_ev, d) => {
					sim.alphaTarget(0.25).restart();
					d.fx = d.x;
					d.fy = d.y;
				})
				.on("drag", (ev, d) => {
					const se = (ev as { sourceEvent: PointerEvent }).sourceEvent;
					const r = (svg.node() as SVGSVGElement).getBoundingClientRect();
					d.fx = Math.min(w - 8, Math.max(8, se.clientX - r.left));
					d.fy = Math.min(h - 8, Math.max(8, se.clientY - r.top));
				})
				.on("end", (_ev, d) => {
					sim.alphaTarget(0);
					d.fx = null;
					d.fy = null;
				}),
		);

		update = () => {
			for (const n of nodes) {
				n.x = Math.min(w - 8, Math.max(8, n.x ?? 0));
				n.y = Math.min(h - 8, Math.max(8, n.y ?? 0));
			}
			edgeSel
				.attr("x1", (d) => (d.source as N).x ?? 0)
				.attr("y1", (d) => (d.source as N).y ?? 0)
				.attr("x2", (d) => (d.target as N).x ?? 0)
				.attr("y2", (d) => (d.target as N).y ?? 0);
			nodeSel.attr("cx", (d) => d.x ?? 0).attr("cy", (d) => d.y ?? 0);
			hooks.onParams({ alpha: sim.alpha() });
		};

		wire(w, h);
		sim.on("tick", update);
		update();
	}

	// anneal only while visible to save battery
	const io = new IntersectionObserver(([entry]) => {
		if (entry?.isIntersecting) sim.restart();
		else sim.stop();
	});
	io.observe(mount);

	const ro = new ResizeObserver(() => build());
	ro.observe(mount);
	build();

	return {
		reset(): void {
			sim.stop();
			nodes = seed();
			links = EDGE_IDS.map(([source, target]) => ({ source, target }));
			build();
		},
		setLit(on: boolean): void {
			mount.querySelector("svg")?.classList.toggle("lit", on);
		},
		redraw(): void {
			update();
		},
		destroy(): void {
			sim.stop();
			io.disconnect();
			ro.disconnect();
		},
	};
};
