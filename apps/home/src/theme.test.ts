import { expect, test } from "bun:test";
import { resolveTheme } from "./theme";

test("night is the default with nothing stored", () => {
	expect(resolveTheme(null)).toBe("night");
	expect(resolveTheme("")).toBe("night");
	expect(resolveTheme("garbage")).toBe("night");
});

test("stored override wins", () => {
	expect(resolveTheme("night")).toBe("night");
	expect(resolveTheme("day")).toBe("day");
});
