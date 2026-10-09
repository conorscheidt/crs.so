import { describe, expect, it } from "bun:test";
import { GESTURE_GAP, wheelGate } from "./scroll";

const px = (timeStamp: number, deltaY: number) => ({ timeStamp, deltaMode: 0, deltaY });

describe("wheel gate", () => {
	it("passes notched wheels in lines or whole-pixel steps", () => {
		expect(wheelGate()({ timeStamp: 0, deltaMode: 1, deltaY: 3 })).toBe(true);
		expect(wheelGate()(px(0, 100))).toBe(true);
		expect(wheelGate()(px(0, -120))).toBe(true);
	});

	it("leaves trackpad gestures native", () => {
		expect(wheelGate()(px(0, 2))).toBe(false);
		expect(wheelGate()(px(0, 0.75))).toBe(false);
		expect(wheelGate()(px(0, 66.5))).toBe(false);
	});

	it("holds its answer through a gesture's momentum", () => {
		const gate = wheelGate();
		expect(gate(px(0, 3))).toBe(false);
		// a fast flick swells past the wheel threshold mid-gesture
		for (let t = 8; t < 400; t += 8) expect(gate(px(t, 80))).toBe(false);
	});

	it("judges afresh after a pause", () => {
		const gate = wheelGate();
		expect(gate(px(0, 3))).toBe(false);
		expect(gate(px(GESTURE_GAP + 1, 100))).toBe(true);
		expect(gate(px(GESTURE_GAP + 20, 4))).toBe(true);
	});
});
