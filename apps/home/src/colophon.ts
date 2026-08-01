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

/** Dimple radius in css px; matches the cursor ring's radius, as on the hub. */
const DIMPLE = 10;

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
	// dense enough that the edges read as strokes of particles, like the hub's
	// object rather than a wireframe with beads on it
	const DOTS_PER_EDGE = 46;

	const ink = (a: number): string => {
		const s = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
		const n = Number.parseInt(s.slice(1), 16);
		return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
	};

	// the cursor dimples this object too, as on the hub
	const pointer = { x: -1e4, y: -1e4, active: false };
	canvas.addEventListener("pointermove", (ev) => {
		const b = canvas.getBoundingClientRect();
		pointer.x = ev.clientX - b.left;
		pointer.y = ev.clientY - b.top;
		pointer.active = true;
	});
	canvas.addEventListener("pointerleave", () => {
		pointer.active = false;
	});

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
		const a = phase * 0.26;
		const b = phase * 0.17;
		// 0.20 keeps the far corners inside the box at every rotation; the
		// projection swells as vertices pass near the camera
		const k = Math.min(w, h) * 0.2;
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
				let x = p.x + (q.x - p.x) * t;
				let y = p.y + (q.y - p.y) * t;
				const d = p.depth + (q.depth - p.depth) * t;

				// screen-space dimple, same law as the hub's shader
				if (pointer.active) {
					const dx = x - pointer.x;
					const dy = y - pointer.y;
					const r2 = dx * dx + dy * dy;
					const rr = DIMPLE * DIMPLE;
					const push = Math.exp(-r2 / (rr * 4)) * DIMPLE * 0.7;
					const len = Math.sqrt(r2) + 1e-4;
					x += (dx / len) * push;
					y += (dy / len) * push;
				}

				const c = Math.min(1, Math.max(0, (d + 1.2) / 2.4));
				const fade = c * c * (3 - 2 * c);
				ctx.fillStyle = ink(0.2 + 0.72 * fade);
				const r = 0.42 + 0.72 * fade;
				ctx.beginPath();
				ctx.arc(x, y, r, 0, Math.PI * 2);
				ctx.fill();
			}
		}
	});
}
