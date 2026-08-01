/**
 * The colophon's mark: a tesseract turning in two planes at once, projected
 * 4D → 3D → page and drawn as particles like the hub's object, only small.
 *
 * Its own tiny renderer: 16 vertices and 32 edges resampled into dots cost
 * nothing, and the WebGPU pipeline would be overkill for a 120px canvas.
 */
import { Clock } from "./clock";
import { initCursor } from "./cursor";

const clock = new Clock();
initCursor(clock);

const canvas = document.querySelector<HTMLCanvasElement>("[data-colophon-mark]");
const ctx = canvas?.getContext("2d") ?? null;

if (canvas && ctx) {
	// the 16 vertices of a 4-cube, and every edge (pairs differing in one axis)
	const V: [number, number, number, number][] = [];
	for (let i = 0; i < 16; i++) {
		V.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]);
	}
	const E: [number, number][] = [];
	for (let i = 0; i < 16; i++) {
		for (let j = i + 1; j < 16; j++) {
			let differing = 0;
			for (let k = 0; k < 4; k++) if ((V[i] as number[])[k] !== (V[j] as number[])[k]) differing++;
			if (differing === 1) E.push([i, j]);
		}
	}
	const DOTS_PER_EDGE = 13;

	const ink = (a: number): string => {
		const s = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
		const n = Number.parseInt(s.slice(1), 16);
		return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
	};

	let phase = 0;
	clock.subscribe((_t, dt) => {
		phase += dt;
		const dpr = Math.min(2, devicePixelRatio || 1);
		const w = canvas.clientWidth;
		const h = canvas.clientHeight || 120;
		if (canvas.width !== w * dpr) {
			canvas.width = w * dpr;
			canvas.height = h * dpr;
		}
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, h);

		// two independent rotations: xw (the fourth-dimensional one) and yz
		const a = phase * 0.34;
		const b = phase * 0.23;
		const k = Math.min(w, h) * 0.34;
		const proj = V.map((v) => {
			const [x, y, z, u] = v;
			const x1 = x * Math.cos(a) - u * Math.sin(a);
			const w1 = x * Math.sin(a) + u * Math.cos(a);
			const y1 = y * Math.cos(b) - z * Math.sin(b);
			const z1 = y * Math.sin(b) + z * Math.cos(b);
			const s4 = 1 / (2.8 - w1); // 4D → 3D
			const X = x1 * s4 * 2.2;
			const Y = y1 * s4 * 2.2;
			const Z = z1 * s4 * 2.2;
			const s3 = 1 / (2.6 - Z); // 3D → page
			return { x: w / 2 + X * k * s3 * 2.2, y: h / 2 + Y * k * s3 * 2.2, depth: Z };
		});

		for (const [i, j] of E) {
			const p = proj[i];
			const q = proj[j];
			if (!(p && q)) continue;
			for (let s = 0; s <= DOTS_PER_EDGE; s++) {
				const t = s / DOTS_PER_EDGE;
				const x = p.x + (q.x - p.x) * t;
				const y = p.y + (q.y - p.y) * t;
				const d = p.depth + (q.depth - p.depth) * t;
				const c = Math.min(1, Math.max(0, (d + 1.2) / 2.4));
				const fade = c * c * (3 - 2 * c);
				ctx.fillStyle = ink(0.24 + 0.7 * fade);
				const r = 0.62 + 0.72 * fade;
				ctx.beginPath();
				ctx.arc(x, y, r, 0, Math.PI * 2);
				ctx.fill();
			}
		}
	});
}
