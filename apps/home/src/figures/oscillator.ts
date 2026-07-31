/**
 * Damped-oscillator figure. A handle rides the first response peak; dragging
 * it vertically sets the damping ratio ζ (peak overshoot inverted
 * analytically), dragging horizontally sets ω. Prose <b data-bind> spans read
 * the live values and highlight the curve on hover; hovering the figure
 * highlights the bound terms.
 */
import type { FigureFactory, FigureImpl } from "./registry";

const TAU = Math.PI * 2;

export const oscillator: FigureFactory = (canvas, hooks): FigureImpl => {
	const ctx = canvas.getContext("2d");
	let zeta = 0.12;
	let omega = 2.4;
	let lit = false;
	let hover = false;
	let dragging = false;
	let raf = 0;

	const ink = (a: number): string => {
		const s = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
		const n = Number.parseInt(s.slice(1), 16);
		return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
	};

	/** first-peak position in (t, x): t = π/ωd, x = exp(-ζπ/√(1-ζ²)) */
	const peak = (): { t: number; x: number } => {
		const z = Math.min(zeta, 0.995);
		const wd = omega * Math.sqrt(1 - z * z);
		return { t: Math.PI / wd, x: -Math.exp((-z * Math.PI) / Math.sqrt(1 - z * z)) };
	};

	const T_MAX = 9;
	const geom = () => {
		const dpr = Math.min(2, devicePixelRatio || 1);
		const w = canvas.clientWidth;
		const h = canvas.clientHeight || 170;
		return { dpr, w, h, x0: 0, y0: h / 2, sx: w / T_MAX, sy: h * 0.38 };
	};

	function draw(): void {
		if (!ctx) return;
		const { dpr, w, h, y0, sx, sy } = geom();
		canvas.width = w * dpr;
		canvas.height = h * dpr;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, h);

		ctx.strokeStyle = ink(0.16);
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(0, y0);
		ctx.lineTo(w, y0);
		ctx.stroke();

		// envelope ±e^{-ζωt}
		ctx.strokeStyle = ink(0.14);
		for (const sgn of [1, -1]) {
			ctx.beginPath();
			for (let px = 0; px < w; px++) {
				const t = px / sx;
				const y = y0 - sgn * Math.exp(-zeta * omega * t) * sy;
				if (px === 0) ctx.moveTo(px, y);
				else ctx.lineTo(px, y);
			}
			ctx.stroke();
		}

		// response x(t), closed form for underdamped, critical and overdamped
		ctx.strokeStyle = ink(lit || hover || dragging ? 0.95 : 0.6);
		ctx.lineWidth = lit || hover || dragging ? 1.6 : 1.1;
		ctx.beginPath();
		for (let px = 0; px < w; px++) {
			const t = px / sx;
			let x: number;
			if (zeta < 0.999) {
				const wd = omega * Math.sqrt(1 - zeta * zeta);
				x =
					Math.exp(-zeta * omega * t) *
					(Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t));
			} else {
				x = Math.exp(-omega * t) * (1 + omega * t);
			}
			const y = y0 - x * sy;
			if (px === 0) ctx.moveTo(px, y);
			else ctx.lineTo(px, y);
		}
		ctx.stroke();

		// handle on the first overshoot
		if (zeta < 0.995) {
			const p = peak();
			const hx = p.t * sx;
			const hy = y0 - p.x * sy;
			ctx.fillStyle = ink(dragging ? 1 : 0.85);
			ctx.beginPath();
			ctx.arc(hx, hy, dragging || hover ? 4.5 : 3.5, 0, TAU);
			ctx.fill();
			if (hover && !dragging) {
				ctx.strokeStyle = ink(0.3);
				ctx.beginPath();
				ctx.arc(hx, hy, 9, 0, TAU);
				ctx.stroke();
			}
		}
		hooks.onParams({ zeta, omega });
	}

	const schedule = (): void => {
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(draw);
	};

	const handlePos = (): { x: number; y: number } => {
		const { y0, sx, sy } = geom();
		const p = peak();
		return { x: p.t * sx, y: y0 - p.x * sy };
	};

	canvas.addEventListener("pointerdown", (ev) => {
		const r = canvas.getBoundingClientRect();
		const p = handlePos();
		if (Math.hypot(ev.clientX - r.left - p.x, ev.clientY - r.top - p.y) < 18) {
			dragging = true;
			try {
				canvas.setPointerCapture(ev.pointerId);
			} catch {}
		}
	});
	canvas.addEventListener("pointermove", (ev) => {
		const r = canvas.getBoundingClientRect();
		if (dragging) {
			const { y0, sx, sy } = geom();
			// vertical → overshoot magnitude → ζ, inverted exactly:
			// M = e^{-ζπ/√(1-ζ²)}  ⇒  ζ = ln(1/M) / √(π² + ln²(1/M))
			const M = Math.min(0.96, Math.max(0.015, (ev.clientY - r.top - y0) / sy));
			const L = Math.log(1 / M);
			zeta = Math.min(0.99, Math.max(0.02, L / Math.sqrt(Math.PI * Math.PI + L * L)));
			// horizontal → peak time → ω
			const t = Math.min(T_MAX * 0.7, Math.max(0.25, (ev.clientX - r.left) / sx));
			omega = Math.min(6, Math.max(0.8, Math.PI / (t * Math.sqrt(1 - zeta * zeta))));
			schedule();
			return;
		}
		const p = handlePos();
		const near = Math.hypot(ev.clientX - r.left - p.x, ev.clientY - r.top - p.y) < 18;
		if (near !== hover) {
			hover = near;
			canvas.dataset.cursorMode = near ? "grab" : "";
			schedule();
		}
	});
	canvas.addEventListener("pointerup", () => {
		dragging = false;
		schedule();
	});
	canvas.addEventListener("pointerleave", () => {
		if (!dragging) {
			hover = false;
			schedule();
		}
	});

	const ro = new ResizeObserver(schedule);
	ro.observe(canvas);
	draw();

	return {
		reset(): void {
			zeta = 0.12;
			omega = 2.4;
			schedule();
		},
		setLit(on: boolean): void {
			lit = on;
			schedule();
		},
		redraw: schedule,
		destroy(): void {
			ro.disconnect();
			cancelAnimationFrame(raf);
		},
	};
};
