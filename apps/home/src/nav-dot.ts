/**
 * The hub nav's current-section dot: one element that travels from item to item
 * on the morph's duration and curve. It steps from a clock subscriber, not a
 * job: the clock runs one job at a time and the sim's morph holds it, so the
 * two share each frame's dt instead and land on the same frame.
 */
import type { Clock } from "./clock";
import { easeOutCubic, MOTION } from "./motion";

/** A point eased from wherever it is toward a destination. */
export class Glide {
	x = 0;
	y = 0;
	private fromX = 0;
	private fromY = 0;
	private toX = 0;
	private toY = 0;
	private elapsed = 0;
	private duration = 0;

	get moving(): boolean {
		return this.elapsed < this.duration;
	}

	/** Land on a point now. */
	jump(x: number, y: number): void {
		this.x = x;
		this.y = y;
		this.fromX = x;
		this.fromY = y;
		this.toX = x;
		this.toY = y;
		this.elapsed = 0;
		this.duration = 0;
	}

	/** Head for a point from the current position, mid-flight included. */
	go(x: number, y: number, ms: number): void {
		if (ms <= 0) {
			this.jump(x, y);
			return;
		}
		this.fromX = this.x;
		this.fromY = this.y;
		this.toX = x;
		this.toY = y;
		this.elapsed = 0;
		this.duration = ms;
	}

	/** The destination moved under a layout change: keep the progress, or land. */
	aim(x: number, y: number): void {
		if (!this.moving) {
			this.jump(x, y);
			return;
		}
		this.toX = x;
		this.toY = y;
		this.step(0);
	}

	/** Advance by `ms`; whether it is still moving. */
	step(ms: number): boolean {
		if (!this.moving) return false;
		this.elapsed = Math.min(this.duration, this.elapsed + ms);
		if (!this.moving) {
			// exactly on the item, not a float's width off it
			this.jump(this.toX, this.toY);
			return false;
		}
		const k = easeOutCubic(this.elapsed / this.duration);
		this.x = this.fromX + (this.toX - this.fromX) * k;
		this.y = this.fromY + (this.toY - this.fromY) * k;
		return true;
	}
}

export interface NavDot {
	/** Travel to the item now marked aria-current, arriving in `ms`. */
	move: (ms?: number) => void;
	destroy: () => void;
}

export function initNavDot(nav: HTMLElement, clock: Clock, still: boolean): NavDot | null {
	const dot = nav.querySelector<HTMLElement>("[data-dot]");
	if (!dot) return null;
	const glide = new Glide();
	let unsub: (() => void) | null = null;

	// The item's left edge just above its middle; the CSS offsets the dot from
	// there, as the server-rendered ::before does.
	const target = (): [number, number] | null => {
		const a = nav.querySelector<HTMLElement>('a[aria-current="page"]');
		if (!a) return null;
		const n = nav.getBoundingClientRect();
		const r = a.getBoundingClientRect();
		return [r.left - n.left, r.top - n.top + r.height * 0.52];
	};
	const draw = (): void => {
		dot.style.translate = `${glide.x}px ${glide.y}px`;
	};
	const land = (): void => {
		const t = target();
		if (!t) return;
		glide.aim(t[0], t[1]);
		draw();
	};

	// Font loads and the breakpoint resize the items; their positions follow.
	const ro = new ResizeObserver(land);
	ro.observe(nav);
	for (const a of nav.querySelectorAll("a")) ro.observe(a);
	land();
	nav.dataset.dotted = "";

	return {
		move(ms = MOTION.morph * 1000): void {
			const t = target();
			if (!t) return;
			if (still) {
				glide.jump(t[0], t[1]);
				draw();
				return;
			}
			glide.go(t[0], t[1], ms);
			unsub ??= clock.subscribe((_, dt) => {
				const moving = glide.step(dt * 1000);
				draw();
				if (!moving) {
					unsub?.();
					unsub = null;
				}
			});
		},
		destroy(): void {
			ro.disconnect();
			unsub?.();
			unsub = null;
		},
	};
}
