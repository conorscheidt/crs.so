/**
 * Distribution plate: a deterministic sample binned into a histogram with a
 * normal curve over it. Two handles on the curve: the peak drags μ, the
 * inflection point drags σ. onParams reports both.
 */
import { fitCanvas, hash, ink, litSpring, mix } from "./ink";
import type { FigureFactory, FigureImpl } from "./registry";

const TAU = Math.PI * 2;
const SAMPLES = 260;
const BINS = 36;

export const distribution: FigureFactory = (canvas, hooks): FigureImpl => {
	let mu = 0.5;
	let sigma = 0.11;
	let grab: "mu" | "sigma" | null = null;
	let hover: "mu" | "sigma" | null = null;
	let raf = 0;

	// fixed sample: sum of three hashes ≈ bell curve, deterministic
	const sample = Array.from(
		{ length: SAMPLES },
		(_, i) => (hash(i, 21) + hash(i, 22) + hash(i, 23)) / 3,
	);
	const bins = new Array(BINS).fill(0) as number[];
	for (const v of sample) {
		const b = Math.min(BINS - 1, Math.floor(v * BINS));
		bins[b] = (bins[b] ?? 0) + 1;
	}
	const binMax = Math.max(...bins);

	const pdf = (x: number): number => {
		const z = (x - mu) / sigma;
		return Math.exp(-0.5 * z * z);
	};

	const handles = (w: number, h: number): { mu: [number, number]; sigma: [number, number] } => ({
		mu: [mu * w, h * (1 - 0.82)],
		sigma: [(mu + sigma) * w, h * (1 - 0.82 * Math.exp(-0.5))],
	});

	function draw(): void {
		const ctx = fitCanvas(canvas);
		if (!ctx) return;
		const w = canvas.clientWidth;
		const h = canvas.clientHeight || 170;
		ctx.clearRect(0, 0, w, h);
		const em = Math.max(litS.value(), grab === null ? 0 : 1);

		// histogram
		const bw = w / BINS;
		ctx.fillStyle = ink(0.24);
		bins.forEach((b, i) => {
			const bh = (b / binMax) * h * 0.7;
			ctx.fillRect(i * bw + 1, h - bh, bw - 2, bh);
		});

		// baseline
		ctx.strokeStyle = ink(0.3);
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(0, h - 0.5);
		ctx.lineTo(w, h - 0.5);
		ctx.stroke();

		// the curve
		ctx.strokeStyle = ink(mix(0.75, 1, em));
		ctx.lineWidth = mix(1.2, 1.6, em);
		ctx.beginPath();
		for (let px = 0; px <= w; px++) {
			const y = h - pdf(px / w) * h * 0.82;
			if (px === 0) ctx.moveTo(px, y);
			else ctx.lineTo(px, y);
		}
		ctx.stroke();

		// handles: peak (μ) and inflection (σ)
		const H = handles(w, h);
		for (const key of ["mu", "sigma"] as const) {
			const [hx, hy] = H[key];
			const active = grab === key || hover === key;
			ctx.fillStyle = ink(active ? 1 : 0.8);
			ctx.beginPath();
			ctx.arc(hx, hy, active ? 4.5 : 3.5, 0, TAU);
			ctx.fill();
			if (active && grab !== key) {
				ctx.strokeStyle = ink(0.3);
				ctx.beginPath();
				ctx.arc(hx, hy, 9, 0, TAU);
				ctx.stroke();
			}
		}
		hooks.onParams({ mu, sigma });
	}

	const schedule = (): void => {
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(draw);
	};
	const litS = litSpring(schedule);

	const near = (ev: PointerEvent): "mu" | "sigma" | null => {
		const r = canvas.getBoundingClientRect();
		const H = handles(r.width, r.height);
		for (const key of ["sigma", "mu"] as const) {
			const [hx, hy] = H[key];
			if (Math.hypot(ev.clientX - r.left - hx, ev.clientY - r.top - hy) < 15) return key;
		}
		return null;
	};

	canvas.addEventListener("pointerdown", (ev) => {
		grab = near(ev);
		if (grab) {
			try {
				canvas.setPointerCapture(ev.pointerId);
			} catch {}
			schedule();
		}
	});
	canvas.addEventListener("pointermove", (ev) => {
		const r = canvas.getBoundingClientRect();
		if (grab === "mu") {
			mu = Math.min(0.9, Math.max(0.1, (ev.clientX - r.left) / r.width));
			schedule();
			return;
		}
		if (grab === "sigma") {
			sigma = Math.min(0.3, Math.max(0.03, (ev.clientX - r.left) / r.width - mu));
			schedule();
			return;
		}
		const h2 = near(ev);
		if (h2 !== hover) {
			hover = h2;
			canvas.dataset.cursorMode = h2 ? "grab" : "";
			schedule();
		}
	});
	canvas.addEventListener("pointerup", () => {
		grab = null;
		schedule();
	});

	const ro = new ResizeObserver(schedule);
	ro.observe(canvas);
	draw();

	return {
		reset(): void {
			mu = 0.5;
			sigma = 0.11;
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
