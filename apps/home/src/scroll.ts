/**
 * Lenis, for notched mouse wheels only. A wheel's coarse steps want smoothing;
 * a trackpad already delivers fine deltas with its own momentum, and routing
 * those through the lerp only adds latency and moves scrolling onto the main
 * thread. Safari gets no Lenis at all: its rAF holds at 60 Hz on faster
 * displays, so a smoothed scroll would run below its native one.
 */
import Lenis from "lenis";
import { safari } from "./cursor";
import { MOTION } from "./motion";

/** Wheel events further apart than this belong to separate gestures, ms. */
export const GESTURE_GAP = 160;

export interface WheelSample {
	timeStamp: number;
	deltaMode: number;
	deltaY: number;
}

/**
 * True for a notched wheel. Each gesture is judged by its first event and the
 * answer holds until it ends, so a trackpad's momentum tail can't flip it.
 * Wheels report lines or pages, or whole-pixel steps of 50 and up; trackpads
 * open with small pixel deltas.
 */
export function wheelGate(): (ev: WheelSample) => boolean {
	let last = Number.NEGATIVE_INFINITY;
	let notched = false;
	return (ev) => {
		if (ev.timeStamp - last > GESTURE_GAP) {
			const d = Math.abs(ev.deltaY);
			notched = ev.deltaMode !== 0 || (d >= 50 && Number.isInteger(d));
		}
		last = ev.timeStamp;
		return notched;
	};
}

/** A wheel-only Lenis, or null where scrolling should stay native. */
export function smoothScroll(target?: {
	wrapper: HTMLElement;
	content: HTMLElement;
}): Lenis | null {
	if (safari() || matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
	const notched = wheelGate();
	const lenis: Lenis = new Lenis({
		...target,
		autoRaf: false,
		lerp: MOTION.scrollLerp,
		wheelMultiplier: 1,
		syncTouch: false,
		virtualScroll: ({ event }) => {
			if (!(event instanceof WheelEvent) || notched(event)) return true;
			// A wheel glide still in flight would keep writing scrollTop against
			// the native scroll; stopping resets it to where the page is.
			if (lenis.isScrolling === "smooth") {
				lenis.stop();
				lenis.start();
			}
			return false;
		},
	});
	return lenis;
}
