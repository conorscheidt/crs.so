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
