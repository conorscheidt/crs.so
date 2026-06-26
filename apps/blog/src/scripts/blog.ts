/**
 * Blog runtime. Shares the site's signal-grid field, magnetic cursor, and a
 * reading-progress rule so the blog matches the main site exactly.
 */

import { initCursor } from "../../../../shared/cursor";
import { RDField } from "../../../../shared/rdfield";

let grid: RDField | null = null;

function wireProgress(): void {
	const el = document.getElementById("reading-progress");
	if (!el) return;
	const update = (): void => {
		const max = document.documentElement.scrollHeight - window.innerHeight;
		el.style.transform = `scaleX(${max > 0 ? Math.min(window.scrollY / max, 1) : 0})`;
	};
	window.addEventListener("scroll", update, { passive: true });
	update();
}

function init(): void {
	const canvas = document.querySelector<HTMLCanvasElement>("#grid");
	if (canvas && !grid)
		grid = new RDField(canvas, {
			static: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
		});
	initCursor();
	wireProgress();
}

document.addEventListener("astro:page-load", init);
document.addEventListener("astro:before-preparation", () => {
	grid?.destroy();
	grid = null;
});
