// basalt's GET /-/api/summary, version 1. Counts cover public repositories and
// default branches only, each commit once. Timestamps are unix ms; `days` are
// calendar days in `tz`. The Worker validates against this schema and passes on
// only the parsed output, so the browser imports nothing here but types.
import * as v from "valibot";
import { GIT_HOST } from "./data/projects";

/** A link from the payload, kept only if it stays on the forge. */
export function forgeUrl(href: string): string | null {
	try {
		const u = new URL(href, GIT_HOST);
		return u.origin === GIT_HOST ? u.href : null;
	} catch {
		return null;
	}
}

const validZone = (tz: string): boolean => {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(0);
		return true;
	} catch {
		return false;
	}
};

const count = v.pipe(v.number(), v.integer(), v.minValue(0));
const ms = count;
const share = v.pipe(v.number(), v.minValue(0), v.maxValue(1));
const text = (max: number) => v.pipe(v.string(), v.maxLength(max));
const link = v.pipe(
	v.string(),
	v.check((s) => forgeUrl(s) !== null, "link leaves the forge"),
	v.transform((s) => forgeUrl(s) ?? GIT_HOST),
);
const top3 = <T extends v.GenericSchema>(item: T) =>
	v.pipe(
		v.array(item),
		v.transform((a) => a.slice(0, 3)),
	);
const langs = top3(v.tuple([text(40), share]));

export const Summary = v.object({
	v: v.literal(1),
	tz: v.pipe(v.string(), v.check(validZone, "unknown time zone")),
	owner: v.object({ name: text(80), url: link }),
	first: v.optional(ms),
	commits: v.object({ year: count, all: count }),
	/** share of your commits basalt verified against your key */
	signed: v.optional(share),
	repos: count,
	mirrors: v.optional(count, 0),
	/** [day in tz, commits, lines added?, lines deleted?], empty days omitted */
	days: v.array(v.pipe(v.array(count), v.minLength(2), v.maxLength(4))),
	/** [weekday from Sunday, hour, commits] */
	hours: v.optional(
		v.array(v.tuple([v.pipe(count, v.maxValue(6)), v.pipe(count, v.maxValue(23)), count])),
		[],
	),
	langs: v.optional(langs, []),
	featured: top3(
		v.object({
			name: text(80),
			description: v.optional(text(200), ""),
			url: link,
			commits: count,
			updated: ms,
			created: v.optional(ms),
			langs: v.optional(langs, []),
			release: v.optional(v.object({ tag: text(40), when: ms, url: link })),
		}),
	),
	recent: top3(
		v.object({
			repo: text(80),
			sha: text(64),
			message: text(160),
			when: ms,
			url: link,
			added: v.optional(count),
			deleted: v.optional(count),
			signed: v.optional(v.boolean(), false),
		}),
	),
	server: v.optional(
		v.object({ version: text(40), commit: text(64), since: ms, objects: count, clones: count }),
	),
});

export type Summary = v.InferOutput<typeof Summary>;
export type Repo = Summary["featured"][number];
export type Commit = Summary["recent"][number];
