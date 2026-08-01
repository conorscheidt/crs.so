/**
 * Geometry plate: draggable construction. Three vertices, their triangle,
 * the perpendicular bisectors as hairlines, and their circumcircle. Dragging
 * a vertex updates the construction. onParams reports the circumradius.
 */
import { fitCanvas, ink, litSpring, mix } from "./ink";
import type { FigureFactory, FigureImpl } from "./registry";

const TAU = Math.PI * 2;
const START: [number, number][] = [
	[0.3, 0.68],
	[0.62, 0.22],
	[0.82, 0.74],
];

export const geometry: FigureFactory = (canvas, hooks): FigureImpl => {
	let pts = START.map(([x, y]) => ({ x, y }));
	let grab = -1;
	let hover = -1;
	let raf = 0;

	/** circumcentre in pixel space, since normalized space is anisotropic */
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

	function draw(): void {
		const ctx = fitCanvas(canvas);
		if (!ctx) return;
		const w = canvas.clientWidth;
		const h = canvas.clientHeight || 170;
		ctx.clearRect(0, 0, w, h);
		const X = (p: { x: number }): number => p.x * w;
		const Y = (p: { y: number }): number => p.y * h;
		const em = Math.max(litS.value(), grab >= 0 ? 1 : 0);

		const pixelPts = pts.map((p) => ({ x: X(p), y: Y(p) }));
		const cc = circum(pixelPts);
		if (cc) {
			// perpendicular bisectors
			ctx.strokeStyle = ink(0.14);
			ctx.lineWidth = 1;
			for (let i = 0; i < 3; i++) {
				const p = pixelPts[i] as { x: number; y: number };
				const q = pixelPts[(i + 1) % 3] as { x: number; y: number };
				const mx = (p.x + q.x) / 2;
				const my = (p.y + q.y) / 2;
				let dx = cc.x - mx;
				let dy = cc.y - my;
				const L = Math.hypot(dx, dy) || 1;
				dx /= L;
				dy /= L;
				ctx.beginPath();
				ctx.moveTo(mx - dx * 1000, my - dy * 1000);
				ctx.lineTo(mx + dx * 1000, my + dy * 1000);
				ctx.stroke();
			}
			ctx.strokeStyle = ink(mix(0.55, 0.85, em));
			ctx.lineWidth = mix(1, 1.4, em);
			ctx.beginPath();
			ctx.arc(cc.x, cc.y, cc.r, 0, TAU);
			ctx.stroke();
			ctx.fillStyle = ink(0.5);
			ctx.fillRect(cc.x - 1.5, cc.y - 1.5, 3, 3);
			hooks.onParams({ r: cc.r / Math.min(w, h) });
		}

		ctx.strokeStyle = ink(mix(0.65, 0.9, em));
		ctx.lineWidth = 1.1;
		ctx.beginPath();
		ctx.moveTo(X(pts[0] as { x: number }), Y(pts[0] as { y: number }));
		for (const p of [...pts.slice(1), pts[0]] as { x: number; y: number }[]) {
			ctx.lineTo(X(p), Y(p));
		}
		ctx.stroke();

		pts.forEach((p, i) => {
			ctx.fillStyle = ink(i === grab || i === hover ? 1 : 0.8);
			ctx.beginPath();
			ctx.arc(X(p), Y(p), i === grab || i === hover ? 4.5 : 3.5, 0, TAU);
			ctx.fill();
		});
	}

	const schedule = (): void => {
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(draw);
	};
	const litS = litSpring(schedule);

	const near = (ev: PointerEvent): number => {
		const r = canvas.getBoundingClientRect();
		return pts.findIndex(
			(p) =>
				Math.hypot(ev.clientX - r.left - p.x * r.width, ev.clientY - r.top - p.y * r.height) < 16,
		);
	};

	canvas.addEventListener("pointerdown", (ev) => {
		grab = near(ev);
		if (grab >= 0) {
			try {
				canvas.setPointerCapture(ev.pointerId);
			} catch {}
			schedule();
		}
	});
	canvas.addEventListener("pointermove", (ev) => {
		const r = canvas.getBoundingClientRect();
		if (grab >= 0) {
			const p = pts[grab] as { x: number; y: number };
			p.x = Math.min(0.97, Math.max(0.03, (ev.clientX - r.left) / r.width));
			p.y = Math.min(0.95, Math.max(0.05, (ev.clientY - r.top) / r.height));
			schedule();
			return;
		}
		const h2 = near(ev);
		if (h2 !== hover) {
			hover = h2;
			canvas.dataset.cursorMode = h2 >= 0 ? "grab" : "";
			schedule();
		}
	});
	canvas.addEventListener("pointerup", () => {
		grab = -1;
		schedule();
	});

	const ro = new ResizeObserver(schedule);
	ro.observe(canvas);
	draw();

	return {
		reset(): void {
			pts = START.map(([x, y]) => ({ x, y }));
			schedule();
		},
		setLit(on: boolean): void {
			litS.set(on);
		},
		redraw: schedule,
		destroy(): void {
			ro.disconnect();
			cancelAnimationFrame(raf);
		},
	};
};
