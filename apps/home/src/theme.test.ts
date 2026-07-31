import { expect, test } from "bun:test";
import { resolveReveal, resolveTheme } from "./theme";

test("stored theme wins over media preference", () => {
	expect(resolveTheme("day", true)).toBe("day");
	expect(resolveTheme("night", false)).toBe("night");
});

test("media preference decides when nothing stored", () => {
	expect(resolveTheme(null, true)).toBe("night");
	expect(resolveTheme(null, false)).toBe("day");
});

test("garbage in storage falls back to media preference", () => {
	expect(resolveTheme("banana", true)).toBe("night");
	expect(resolveTheme("", false)).toBe("day");
});

test("full draw only on the first external load of a session", () => {
	expect(resolveReveal(false, false)).toBe("draw");
	expect(resolveReveal(true, false)).toBe("settle");
	expect(resolveReveal(false, true)).toBe("settle");
	expect(resolveReveal(true, true)).toBe("settle");
});
