/**
 * Graph plate: a small force-directed network. Nodes are draggable; the
 * embedding relaxes continuously while visible. onParams reports the spring
 * energy, for prose about convergence.
 */
import { fitCanvas, hash, ink } from "./ink";
import type { FigureFactory, FigureImpl } from "./registry";

const TAU = Math.PI * 2;
const N_NODES = 12;
const EDGES: [number, number][] = [
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
];

export const graph: FigureFactory = (canvas, hooks): FigureImpl => {
	interface Node {
		x: number;
		y: number;
		vx: number;
		vy: number;
	}
	const seed = (): Node[] =>
		Array.from({ length: N_NODES }, (_, i) => ({
			x: 0.5 + (hash(i, 11) - 0.5) * 0.6,
			y: 0.5 + (hash(i, 12) - 0.5) * 0.6,
			vx: 0,
			vy: 0,
		}));
	let nodes = seed();
	let lit = false;
	let grab = -1;
	let hover = -1;
	let raf = 0;
	let running = true;

	function step(): void {
		const K = 0.018;
		const REST = 0.22;
		const REPEL = 0.004;
		for (let i = 0; i < N_NODES; i++) {
			const a = nodes[i] as Node;
			for (let j = i + 1; j < N_NODES; j++) {
				const b = nodes[j] as Node;
				const dx = b.x - a.x;
				const dy = b.y - a.y;
				const d2 = dx * dx + dy * dy + 0.002;
				const f = REPEL / d2;
				const d = Math.sqrt(d2);
				a.vx -= (dx / d) * f;
				a.vy -= (dy / d) * f;
				b.vx += (dx / d) * f;
				b.vy += (dy / d) * f;
			}
		}
		for (const [i, j] of EDGES) {
			const a = nodes[i] as Node;
			const b = nodes[j] as Node;
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const d = Math.hypot(dx, dy) || 1e-4;
			const f = K * (d - REST);
			a.vx += (dx / d) * f;
			a.vy += (dy / d) * f;
			b.vx -= (dx / d) * f;
			b.vy -= (dy / d) * f;
		}
		let energy = 0;
		nodes.forEach((n, i) => {
			if (i === grab) return;
			n.vx += (0.5 - n.x) * 0.002;
			n.vy += (0.5 - n.y) * 0.002;
			n.vx *= 0.86;
			n.vy *= 0.86;
			n.x = Math.min(0.96, Math.max(0.04, n.x + n.vx));
			n.y = Math.min(0.94, Math.max(0.06, n.y + n.vy));
			energy += n.vx * n.vx + n.vy * n.vy;
		});
		hooks.onParams({ energy: energy * 1e4 });
	}

	function draw(): void {
		const ctx = fitCanvas(canvas);
		if (!ctx) return;
		const w = canvas.clientWidth;
		const h = canvas.clientHeight || 170;
		ctx.clearRect(0, 0, w, h);
		const strong = lit || grab >= 0;
		ctx.strokeStyle = ink(strong ? 0.55 : 0.32);
		ctx.lineWidth = 1;
		for (const [i, j] of EDGES) {
			const a = nodes[i] as Node;
			const b = nodes[j] as Node;
			ctx.beginPath();
			ctx.moveTo(a.x * w, a.y * h);
			ctx.lineTo(b.x * w, b.y * h);
			ctx.stroke();
		}
		const base = strong ? 0.9 : 0.75;
		nodes.forEach((n, i) => {
			ctx.fillStyle = ink(i === grab || i === hover ? 1 : base);
			ctx.beginPath();
			ctx.arc(n.x * w, n.y * h, i === grab || i === hover ? 4.5 : 3.2, 0, TAU);
			ctx.fill();
		});
	}

	function loop(): void {
		if (!running) return;
		step();
		draw();
		raf = requestAnimationFrame(loop);
	}

	// relax only while visible to save battery
	const io = new IntersectionObserver(([entry]) => {
		const vis = entry?.isIntersecting ?? false;
		if (vis && !running) {
			running = true;
			loop();
		} else if (!vis) {
			running = false;
			cancelAnimationFrame(raf);
		}
	});
	io.observe(canvas);
	loop();

	const near = (ev: PointerEvent): number => {
		const r = canvas.getBoundingClientRect();
		return nodes.findIndex(
			(n) =>
				Math.hypot(ev.clientX - r.left - n.x * r.width, ev.clientY - r.top - n.y * r.height) < 14,
		);
	};
	canvas.addEventListener("pointerdown", (ev) => {
		grab = near(ev);
		if (grab >= 0) {
			try {
				canvas.setPointerCapture(ev.pointerId);
			} catch {}
		}
	});
	canvas.addEventListener("pointermove", (ev) => {
		const r = canvas.getBoundingClientRect();
		if (grab >= 0) {
			const n = nodes[grab] as Node;
			n.x = (ev.clientX - r.left) / r.width;
			n.y = (ev.clientY - r.top) / r.height;
			n.vx = 0;
			n.vy = 0;
			return;
		}
		const h2 = near(ev);
		if (h2 !== hover) {
			hover = h2;
			canvas.style.cursor = h2 >= 0 ? "grab" : "";
		}
	});
	canvas.addEventListener("pointerup", () => {
		grab = -1;
	});

	return {
		reset(): void {
			nodes = seed();
		},
		setLit(on: boolean): void {
			lit = on;
		},
		redraw: draw,
		destroy(): void {
			running = false;
			cancelAnimationFrame(raf);
			io.disconnect();
		},
	};
};
