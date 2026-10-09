// Lenis smooths notched mouse wheels only. Trackpads scroll natively, since
// smoothing their momentum just adds latency; Safari never gets Lenis, as its
// rAF is held at 60 Hz on faster displays.
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

/** True for a notched wheel (line or page deltas, or whole-pixel steps of 50+),
 *  judged on a gesture's first event and held until the gesture ends. */
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
