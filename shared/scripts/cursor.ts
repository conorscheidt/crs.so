/**
 * Custom cursor: a small dot and a trailing ring, both drawn with
 * mix-blend-mode: difference so they invert against whatever is behind them
 * (text, the eclipse, paper) and stay legible. Over any interactive element the
 * ring grows and the dot shrinks, the same on every link/button/input.
 *
 * Fine pointer and motion allowed only (initCursor bails otherwise).
 */

const INTERACTIVE =
	"a, button, [data-magnetic], [role='button'], input, textarea, select, label, summary, .theme-toggle";

export class MagneticCursor {
	private readonly dot: HTMLDivElement;
	private readonly ring: HTMLDivElement;
	private raf = 0;

	private px = -100;
	private py = -100;
	private dx = -100;
	private dy = -100;
	private rx = -100;
	private ry = -100;
	private over = false;
	private down = false;

	constructor() {
		this.ring = document.createElement("div");
		this.ring.className = "cursor-ring";
		this.ring.setAttribute("aria-hidden", "true");
		this.dot = document.createElement("div");
		this.dot.className = "cursor-dot";
		this.dot.setAttribute("aria-hidden", "true");
		document.body.append(this.ring, this.dot);
		document.documentElement.classList.add("has-cursor");

		window.addEventListener("pointermove", this.onMove, { passive: true });
		window.addEventListener("pointerdown", this.onDown, { passive: true });
		window.addEventListener("pointerup", this.onUp, { passive: true });
		window.addEventListener("pointerleave", this.onLeave, { passive: true });
		this.raf = requestAnimationFrame(this.tick);
	}

	private readonly onMove = (e: PointerEvent): void => {
		this.px = e.clientX;
		this.py = e.clientY;
		this.over = !!(e.target as Element | null)?.closest?.(INTERACTIVE);
		this.dot.style.opacity = "1";
		this.ring.style.opacity = "1";
	};

	private readonly onDown = (): void => {
		this.down = true;
	};
	private readonly onUp = (): void => {
		this.down = false;
	};
	private readonly onLeave = (): void => {
		this.dot.style.opacity = "0";
		this.ring.style.opacity = "0";
	};

	private readonly tick = (): void => {
		// dot tracks tightly; the ring trails with a little inertia
		this.dx += (this.px - this.dx) * 0.5;
		this.dy += (this.py - this.dy) * 0.5;
		this.rx += (this.px - this.rx) * 0.2;
		this.ry += (this.py - this.ry) * 0.2;

		const dotS = this.over ? 0.55 : this.down ? 0.8 : 1;
		this.dot.style.transform = `translate(${this.dx}px, ${this.dy}px) translate(-50%, -50%) scale(${dotS})`;
		this.ring.style.transform = `translate(${this.rx}px, ${this.ry}px) translate(-50%, -50%) scale(${this.down ? 0.85 : 1})`;
		this.ring.classList.toggle("over", this.over);

		this.raf = requestAnimationFrame(this.tick);
	};

	destroy(): void {
		cancelAnimationFrame(this.raf);
		window.removeEventListener("pointermove", this.onMove);
		window.removeEventListener("pointerdown", this.onDown);
		window.removeEventListener("pointerup", this.onUp);
		window.removeEventListener("pointerleave", this.onLeave);
		this.dot.remove();
		this.ring.remove();
		document.documentElement.classList.remove("has-cursor");
	}
}

export function initCursor(): MagneticCursor | null {
	const fine = window.matchMedia("(pointer: fine)").matches;
	const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	if (!fine || reduced) return null;
	return new MagneticCursor();
}
