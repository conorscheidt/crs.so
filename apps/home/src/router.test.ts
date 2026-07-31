import { expect, test } from "bun:test";
import { type ClickInfo, interceptable, PATHS, ROUTES, TITLES } from "./router";

const base: ClickInfo = {
	origin: "https://crs.so",
	pathname: "/projects",
	target: "",
	metaKey: false,
	ctrlKey: false,
	shiftKey: false,
	altKey: false,
	defaultPrevented: false,
};

test("section links are intercepted", () => {
	expect(interceptable(base, "https://crs.so")).toBe("projects");
	expect(interceptable({ ...base, pathname: "/" }, "https://crs.so")).toBe("index");
});

test("the hub router leaves article links to the page navigator", () => {
	expect(interceptable({ ...base, pathname: "/writing/some-post" }, "https://crs.so")).toBeNull();
});

test("modified clicks, foreign origins, targets, and handled events pass through", () => {
	expect(interceptable({ ...base, metaKey: true }, "https://crs.so")).toBeNull();
	expect(interceptable({ ...base, shiftKey: true }, "https://crs.so")).toBeNull();
	expect(interceptable({ ...base, origin: "https://git.crs.so" }, "https://crs.so")).toBeNull();
	expect(interceptable({ ...base, target: "_blank" }, "https://crs.so")).toBeNull();
	expect(interceptable({ ...base, defaultPrevented: true }, "https://crs.so")).toBeNull();
});

test("route tables are bijective and titled", () => {
	for (const [path, section] of Object.entries(ROUTES)) {
		expect(PATHS[section]).toBe(path);
		expect(TITLES[section].length).toBeGreaterThan(0);
	}
});
