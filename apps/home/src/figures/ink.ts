/** Shared plate utilities. Figures draw in the site's current --ink. */
export function ink(a: number): string {
	const s = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
	const n = Number.parseInt(s.slice(1), 16);
	return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function fitCanvas(
	canvas: HTMLCanvasElement,
	fallbackH = 170,
): CanvasRenderingContext2D | null {
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	const dpr = Math.min(2, devicePixelRatio || 1);
	const w = canvas.clientWidth;
	const h = canvas.clientHeight || fallbackH;
	canvas.width = w * dpr;
	canvas.height = h * dpr;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	return ctx;
}

export function hash(i: number, salt: number): number {
	const x = Math.sin(i * 127.1 + salt * 311.7) * 43_758.5453;
	return x - Math.floor(x);
}

/**
 * Eased emphasis for plates. Canvas strokes ease lit on and off over ~250 ms,
 * matching the site's DOM transitions.
 */
export function litSpring(onChange: () => void): {
	set: (on: boolean) => void;
	value: () => number;
} {
	let v = 0;
	let target = 0;
	let raf = 0;
	const tick = (): void => {
		v += (target - v) * 0.16;
		if (Math.abs(target - v) < 0.01) {
			v = target;
			onChange();
			return;
		}
		onChange();
		raf = requestAnimationFrame(tick);
	};
	return {
		set(on: boolean): void {
			target = on ? 1 : 0;
			cancelAnimationFrame(raf);
			raf = requestAnimationFrame(tick);
		},
		value: () => v,
	};
}

export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
