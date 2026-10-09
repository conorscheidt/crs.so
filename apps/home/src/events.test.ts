import { expect, test } from "bun:test";
import * as v from "valibot";
import { SiteEvent } from "./events";

const ok = (x: unknown) => v.safeParse(SiteEvent, x).success;

test("each event carries exactly its own fields", () => {
	expect(ok({ event: "post-open", path: "/writing/x" })).toBe(true);
	expect(ok({ event: "code-run", path: "/w", lang: "c", ok: true, ms: 631 })).toBe(true);
	expect(ok({ event: "code-run", path: "/w", lang: "c" })).toBe(false);
	expect(ok({ event: "theme-flip", path: "/", to: "dusk" })).toBe(false);
	expect(ok({ event: "search", path: "/", kind: "post", len: 3.5, hits: 1 })).toBe(false);
});

test("unknown events and oversized fields are rejected", () => {
	expect(ok({ event: "nope", path: "/" })).toBe(false);
	expect(ok({ event: "tag-filter", path: "/", tag: "x".repeat(129) })).toBe(false);
	expect(ok({ event: "post-open", path: "/".repeat(257) })).toBe(false);
	expect(ok(null)).toBe(false);
});
