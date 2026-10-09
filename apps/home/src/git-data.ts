// What the git block works from: the validated summary plus the windowed
// day map and weekday/hour grid, computed in basalt's timezone.
import type { Summary } from "./git-summary";

export type { Commit, Repo, Summary } from "./git-summary";

export const DAYS = 364; // 52 whole weeks

/** Days since the Unix epoch for the calendar date `now` falls on in `tz`. */
export function epochDay(now: number, tz: string): number {
	const opts = { year: "numeric", month: "numeric", day: "numeric" } as const;
	const fmt = new Intl.DateTimeFormat("en-US", { ...opts, timeZone: tz });
	const parts = fmt.formatToParts(now);
	const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
	return Math.floor(Date.UTC(get("year"), get("month") - 1, get("day")) / 86_400_000);
}

export interface GitData extends Summary {
	/** epoch day in `tz` → commits, last 364 days */
	heat: Map<number, number>;
	today: number;
	/** commits by [weekday][hour] */
	week: number[][];
}

export function derive(s: Summary, now: number): GitData {
	const today = epochDay(now, s.tz);
	const heat = new Map<number, number>();
	for (const [day = 0, n = 0] of s.days)
		if (today - day >= 0 && today - day < DAYS) heat.set(day, n);
	const week = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
	for (const [d, h, n] of s.hours) {
		const row = week[d];
		if (row) row[h] = n;
	}
	return { ...s, heat, today, week };
}
