/**
 * Date tokens for the Writing search: years, month names, seasons and
 * "last <season>". Matched tokens leave the query and show up as a range chip,
 * so a misparse is always visible.
 */
export interface DateFilter {
	from: number;
	to: number;
	label: string;
}

const MONTHS = [
	"january",
	"february",
	"march",
	"april",
	"may",
	"june",
	"july",
	"august",
	"september",
	"october",
	"november",
	"december",
];

const SEASONS: Record<string, [number, number]> = {
	spring: [2, 4],
	summer: [5, 7],
	fall: [8, 10],
	autumn: [8, 10],
	winter: [11, 1],
};

const span = (y0: number, m0: number, y1: number, m1: number, label: string): DateFilter => ({
	from: Date.UTC(y0, m0, 1),
	to: Date.UTC(y1, m1 + 1, 1) - 1,
	label,
});

export function parseDates(raw: string, now: Date): { term: string; date: DateFilter | null } {
	let term = raw;
	let date: DateFilter | null = null;
	const eat = (re: RegExp): string | null => {
		const m = term.match(re);
		if (!m) return null;
		term = term.replace(re, " ").replace(/\s+/g, " ").trim();
		return m[0];
	};

	const yearMonth = term.match(
		/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+((?:19|20)\d{2})\b/i,
	);
	const season = term.match(/\b(last\s+)?(spring|summer|fall|autumn|winter)\b/i);
	if (yearMonth) {
		const mo = MONTHS.indexOf(yearMonth[1]?.toLowerCase() ?? "");
		const y = Number(yearMonth[2]);
		eat(new RegExp(yearMonth[0], "i"));
		date = span(y, mo, y, mo, `${MONTHS[mo]} ${y}`);
	} else if (season) {
		const key = season[2]?.toLowerCase() ?? "";
		const [m0, m1] = SEASONS[key] as [number, number];
		const wraps = m0 > m1;
		let y = now.getUTCFullYear();
		// Most recent occurrence that has started; "last" steps one back.
		if (now.getUTCMonth() < m0) y -= 1;
		if (season[1]) y -= 1;
		eat(new RegExp(season[0], "i"));
		date = wraps ? span(y, m0, y + 1, m1, `${key} ${y}`) : span(y, m0, y, m1, `${key} ${y}`);
	} else {
		const month = term.match(
			/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
		);
		if (month) {
			const mo = MONTHS.indexOf(month[1]?.toLowerCase() ?? "");
			let y = now.getUTCFullYear();
			if (mo > now.getUTCMonth()) y -= 1;
			eat(new RegExp(month[0], "i"));
			date = span(y, mo, y, mo, `${MONTHS[mo]} ${y}`);
		} else {
			const year = eat(/\b(19|20)\d{2}\b/);
			if (year) {
				const y = Number(year);
				date = span(y, 0, y, 11, year);
			}
		}
	}
	return { term, date };
}
