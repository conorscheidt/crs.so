/**
 * Decode/scramble text: headings resolve from random glyphs into their real
 * text on first reveal and on hover. Plain-text elements only (no child
 * markup). No-op under reduced motion.
 */

const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&/\\<>*+=-·".split("");
const SCRAMBLE_SELECTOR = "[data-scramble], .module-head > span:first-child";

function scramble(el: HTMLElement): void {
	const final = el.dataset.final ?? el.textContent ?? "";
	if (!final) return;
	el.dataset.final = final;
	const len = final.length;
	const start = performance.now();
	const dur = 420 + len * 16;
	const step = (now: number): void => {
		const p = Math.min((now - start) / dur, 1);
		const reveal = Math.floor(p * len);
		let out = "";
		for (let i = 0; i < len; i++) {
			const ch = final[i] ?? "";
			out += i < reveal || ch === " " ? ch : (GLYPHS[(Math.random() * GLYPHS.length) | 0] ?? ch);
		}
		el.textContent = out;
		if (p < 1) requestAnimationFrame(step);
		else el.textContent = final;
	};
	requestAnimationFrame(step);
}

export function initScramble(): void {
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
	const els = Array.from(document.querySelectorAll<HTMLElement>(SCRAMBLE_SELECTOR));
	const io = new IntersectionObserver(
		(entries) => {
			for (const e of entries)
				if (e.isIntersecting) {
					scramble(e.target as HTMLElement);
					io.unobserve(e.target);
				}
		},
		{ rootMargin: "0px 0px -8% 0px" },
	);
	for (const el of els) {
		io.observe(el);
		el.addEventListener("pointerenter", () => scramble(el));
	}
}
