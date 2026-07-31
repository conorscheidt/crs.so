import { expect, test } from "bun:test";
import { resolveTheme } from "./theme";

test("light is the default, even for dark-mode visitors", () => {
	expect(resolveTheme(null)).toBe("day");
	expect(resolveTheme("")).toBe("day");
	expect(resolveTheme("garbage")).toBe("day");
});

test("stored override wins", () => {
	expect(resolveTheme("night")).toBe("night");
	expect(resolveTheme("day")).toBe("day");
});
