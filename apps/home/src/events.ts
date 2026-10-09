// Behaviour events, shared by the client (types only) and the Worker, which
// validates every POST to /api/e against this schema before writing it.
import * as v from "valibot";

const path = v.pipe(v.string(), v.maxLength(256));
const label = v.pipe(v.string(), v.maxLength(128));
const count = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1e9));

export const SiteEvent = v.variant("event", [
	/** an article was opened */
	v.object({ event: v.literal("post-open"), path }),
	/** scrolled past 90% of an article */
	v.object({ event: v.literal("post-read"), path }),
	/** a snippet finished compiling or running */
	v.object({ event: v.literal("code-run"), path, lang: label, ok: v.boolean(), ms: count }),
	/** a plate was dragged */
	v.object({ event: v.literal("figure-touch"), path, kind: label }),
	/** a query ran */
	v.object({ event: v.literal("search"), path, kind: label, len: count, hits: count }),
	/** a tag chip was applied */
	v.object({ event: v.literal("tag-filter"), path, tag: label }),
	/** writing was filtered to one project */
	v.object({ event: v.literal("project-filter"), path, slug: label }),
	/** a repository or live link was followed */
	v.object({ event: v.literal("project-open"), path, slug: label }),
	/** day/night toggled */
	v.object({ event: v.literal("theme-flip"), path, to: v.picklist(["day", "night"]) }),
]);

export type SiteEvent = v.InferOutput<typeof SiteEvent>;
export type EventName = SiteEvent["event"];
/** The fields an event carries besides its name and the page it fired on. */
export type EventFields<E extends EventName> = Omit<
	Extract<SiteEvent, { event: E }>,
	"event" | "path"
>;
