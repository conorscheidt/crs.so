/**
 * Custom cursor: a small signal-red ring + dot that eases after the pointer
 * and snaps onto interactive elements (expanding slightly). Single accent
 * colour, no blend modes. Hides the native cursor; not initialised on touch /
 * coarse pointers or under reduced motion.
 */

export function initCursor(): void {
	if (
		window.matchMedia("(pointer: coarse)").matches ||
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	)
		return;
	const ring = document.getElementById("cursor");
	if (!ring) return;
	document.documentElement.classList.add("has-cursor");

	let px = window.innerWidth / 2;
	let py = window.innerHeight / 2;
	let x = px;
	let y = py;
	let hover: HTMLElement | null = null;

	window.addEventListener(
		"pointermove",
		(e) => {
			px = e.clientX;
			py = e.clientY;
		},
		{ passive: true },
	);
	window.addEventListener(
		"pointerover",
		(e) => {
			hover = (e.target as HTMLElement).closest<HTMLElement>("a, button, [data-magnetic]");
			ring.classList.toggle("hover", !!hover);
		},
		{ passive: true },
	);
	window.addEventListener("pointerdown", () => ring.classList.add("down"), { passive: true });
	window.addEventListener("pointerup", () => ring.classList.remove("down"), { passive: true });
	document.addEventListener("astro:before-preparation", () => {
		hover = null;
		ring.classList.remove("hover");
	});

	const loop = (): void => {
		let tx = px;
		let ty = py;
		if (hover?.isConnected) {
			const r = hover.getBoundingClientRect();
			tx = px + (r.left + r.width / 2 - px) * 0.3;
			ty = py + (r.top + r.height / 2 - py) * 0.3;
		} else if (hover) {
			hover = null;
			ring.classList.remove("hover");
		}
		x += (tx - x) * 0.28;
		y += (ty - y) * 0.28;
		ring.style.transform = `translate(${x}px, ${y}px)`;
		requestAnimationFrame(loop);
	};
	requestAnimationFrame(loop);
}
