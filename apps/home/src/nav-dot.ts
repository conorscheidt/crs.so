/**
 * The hub nav's current-section dot: one element that travels from item to item
 * on the morph's duration and curve. It steps from a clock subscriber, not a
 * job: the clock runs one job at a time and the sim's morph holds it, so the
 * two share each frame's dt instead and land on the same frame.
 */
import type { Clock } from "./clock";
import { MOTION, siteCurve } from "./motion";

/**
 * A redirected glide sheds the velocity it carried in over this share of its
 * new duration, along w(1 − w)³: that leaves at the old velocity and settles
 * with no jerk, under the curve's own ease-out.
 */
const SHED = 0.25;
const kick = (w: number): number => (w < 1 ? w * (1 - w) ** 3 : 0);
const kickSlope = (w: number): number => (w < 1 ? (1 - w) ** 2 * (1 - 4 * w) : 0);
/**
 * The most carried velocity, toward the destination and in distance per
 * duration, that never takes the dot past it: more would read as a bounce.
 */
const KICK_MAX = (() => {
	let max = Number.POSITIVE_INFINITY;
	for (let j = 1; j < 256; j++) {
		const w = j / 256;
		max = Math.min(max, (1 - siteCurve.at(SHED * w)) / (SHED * kick(w)));
	}
	return max;
})();

/** A point eased from wherever it is toward a destination. */
export class Glide {
	x = 0;
	y = 0;
	private fromX = 0;
	private fromY = 0;
	private toX = 0;
	private toY = 0;
	/** velocity (px/ms) carried in from an interrupted glide, on top of the curve's own */
	private kickX = 0;
	private kickY = 0;
	private elapsed = 0;
	private duration = 0;

	get moving(): boolean {
		return this.elapsed < this.duration;
	}

	/** Current velocity in px/ms. */
	velocity(out: [number, number]): [number, number] {
		if (!this.moving) {
			out[0] = 0;
			out[1] = 0;
			return out;
		}
		const u = this.elapsed / this.duration;
		const ease = siteCurve.slope(u) / this.duration;
		const shed = kickSlope(u / SHED);
		out[0] = (this.toX - this.fromX) * ease + this.kickX * shed;
		out[1] = (this.toY - this.fromY) * ease + this.kickY * shed;
		return out;
	}

	/** Land on a point now. */
	jump(x: number, y: number): void {
		this.x = x;
		this.y = y;
		this.fromX = x;
		this.fromY = y;
		this.toX = x;
		this.toY = y;
		this.kickX = 0;
		this.kickY = 0;
		this.elapsed = 0;
		this.duration = 0;
	}

	/**
	 * Head for a point from the current position. Mid-flight it turns toward
	 * the new point at the speed it had, rather than starting a fresh curve.
	 */
	go(x: number, y: number, ms: number): void {
		if (ms <= 0) {
			this.jump(x, y);
			return;
		}
		const [vx, vy] = this.velocity([0, 0]);
		const dx = x - this.x;
		const dy = y - this.y;
		// The curve leaves at its own slope; the kick makes up the rest.
		const lead = siteCurve.slope(0) / ms;
		let kx = this.moving ? vx - dx * lead : 0;
		let ky = this.moving ? vy - dy * lead : 0;
		const d2 = dx * dx + dy * dy;
		const along = d2 > 0 ? (kx * dx + ky * dy) / d2 : 0;
		if (along > KICK_MAX / ms) {
			kx -= (along - KICK_MAX / ms) * dx;
			ky -= (along - KICK_MAX / ms) * dy;
		}
		this.fromX = this.x;
		this.fromY = this.y;
		this.toX = x;
		this.toY = y;
		this.kickX = kx;
		this.kickY = ky;
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
		const u = this.elapsed / this.duration;
		const k = siteCurve.at(u);
		const shed = SHED * this.duration * kick(u / SHED);
		this.x = this.fromX + (this.toX - this.fromX) * k + this.kickX * shed;
		this.y = this.fromY + (this.toY - this.fromY) * k + this.kickY * shed;
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
