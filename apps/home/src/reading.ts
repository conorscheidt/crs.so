/**
 * The arithmetic behind the narrow-screen reading aids in article-features:
 * which section is current, how much is left to read, when the running head
 * shows, and when a pulled sheet lets go.
 */

/** Index of the last heading above the reading line, or -1 before the first.
 *  A short last section never crosses the line, so the page bottom wins. */
export function activeSection(tops: readonly number[], line: number, atEnd: boolean): number {
	if (atEnd) return tops.length - 1;
	let active = -1;
	for (const [i, top] of tops.entries()) {
		if (top < line) active = i;
	}
	return active;
}

/**
 * How far down the contents rail the fill reaches, 0..1. Each section's span of
 * the page maps onto its own stretch of rail, from its entry to the next one, so
 * the fill meets the highlighted entry however long or short the section is.
 * `marks` are the entries' offsets along the rail (px), `end` the reading line at
 * the bottom of the page.
 */
export function railFill(
	tops: readonly number[],
	marks: readonly number[],
	line: number,
	end: number,
	length: number,
): number {
	if (length <= 0 || tops.length === 0) return 0;
	if (line >= end) return 1;
	const k = activeSection(tops, line, false);
	if (k < 0) return 0;
	const from = tops[k] ?? 0;
	const to = tops[k + 1] ?? end;
	const start = marks[k] ?? 0;
	const stop = marks[k + 1] ?? length;
	const f = to > from ? Math.min(1, Math.max(0, (line - from) / (to - from))) : 1;
	return Math.min(1, (start + f * (stop - start)) / length);
}

export const countWords = (text: string): number => text.match(/\S+/g)?.length ?? 0;

export interface Block {
	top: number;
	height: number;
	words: number;
}

/** Words below the reading line, the block it crosses counted pro rata. */
export function wordsLeft(blocks: readonly Block[], line: number): number {
	let left = 0;
	for (const b of blocks) {
		if (line <= b.top) left += b.words;
		else if (line < b.top + b.height) left += b.words * (1 - (line - b.top) / b.height);
	}
	return left;
}

/** Whole minutes left, at the pace the article's stated reading time implies,
 *  so the head agrees with the "N min read" under the title. */
export function minutesLeft(left: number, total: number, minutes: number): number {
	if (total <= 0 || left <= 0) return 0;
	return Math.max(1, Math.ceil((minutes * left) / total - 0.05));
}

export interface HeadState {
	shown: boolean;
	/** The scroll extreme since the last change: the highest point while
	 *  shown, the lowest while hidden. */
	pivot: number;
}

export interface HeadInput {
	/** The article title has scrolled out of view. */
	titleOut: boolean;
	/** Close enough to the end that there is little left to scroll. */
	nearEnd: boolean;
	/** Travel against the current state before it flips, px. */
	threshold: number;
}

/** The running head hides on the way down and returns on the way up, each
 *  only after `threshold` px of travel, so small corrections don't toggle it. */
export function stepHead(
	s: HeadState,
	y: number,
	{ titleOut, nearEnd, threshold }: HeadInput,
): HeadState {
	if (!titleOut) return { shown: false, pivot: y };
	if (nearEnd) return { shown: true, pivot: y };
	if (s.shown) {
		return y > s.pivot + threshold
			? { shown: false, pivot: y }
			: { shown: true, pivot: Math.min(s.pivot, y) };
	}
	return y < s.pivot - threshold
		? { shown: true, pivot: y }
		: { shown: false, pivot: Math.max(s.pivot, y) };
}

/** A sheet pulled down lets go past a third of its height, or on a downward
 *  flick (px/ms) that has moved it at all. */
export function dismissed(dy: number, height: number, speed: number): boolean {
	return dy > height / 3 || (dy > 12 && speed > 0.5);
}
