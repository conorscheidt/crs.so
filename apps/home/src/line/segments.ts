/**
 * Colophon line geometry: pure math, no DOM. A state's line is an ordered
 * list of named segments; morphs map segments by name, and unmatched segments
 * grow/collapse from their nearest join.
 */
export type Pt = readonly [number, number];
export interface Segment {
	name: string;
	points: Pt[];
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function segLength(points: Pt[]): number {
	let l = 0;
	for (let i = 1; i < points.length; i++) {
		l += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
	}
	return l;
}

export function pathLength(segs: Segment[]): number {
	return segs.reduce((l, s) => l + segLength(s.points), 0);
}

/** Resample a polyline to exactly n points, preserving shape and endpoints. */
export function resample(points: Pt[], n: number): Pt[] {
	if (points.length === 0 || n < 2) return points.slice();
	const total = segLength(points);
	if (total === 0) return Array.from({ length: n }, () => points[0]!);
	const out: Pt[] = [points[0]!];
	const step = total / (n - 1);
	let acc = 0;
	let i = 1;
	let prev = points[0]!;
	for (let k = 1; k < n - 1; k++) {
		let target = step * k;
		while (i < points.length) {
			const d = Math.hypot(points[i]![0] - prev[0], points[i]![1] - prev[1]);
			if (acc + d >= target) {
				const t = d === 0 ? 0 : (target - acc) / d;
				out.push([lerp(prev[0], points[i]![0], t), lerp(prev[1], points[i]![1], t)]);
				break;
			}
			acc += d;
			prev = points[i]!;
			i++;
		}
		if (i >= points.length) out.push(points[points.length - 1]!);
	}
	out.push(points[points.length - 1]!);
	return out;
}

export interface SegmentPair {
	name: string;
	from: Pt[];
	to: Pt[];
}

/**
 * Pair segments by name. A segment missing on one side becomes a zero-length
 * stub at its neighbour's join point on that side, so it grows or collapses
 * instead of popping.
 */
/**
 * Order-preserving merge of two segment name sequences: the target's order
 * leads; names only in `from` are inserted right after their nearest shared
 * predecessor, so the pen never backtracks through the union path.
 */
export function mergeOrder(fromNames: string[], toNames: string[]): string[] {
	const names = toNames.slice();
	for (let i = 0; i < fromNames.length; i++) {
		const n = fromNames[i]!;
		if (names.includes(n)) continue;
		let insertAt = 0;
		for (let j = i - 1; j >= 0; j--) {
			const idx = names.indexOf(fromNames[j]!);
			if (idx !== -1) {
				insertAt = idx + 1;
				break;
			}
		}
		names.splice(insertAt, 0, n);
	}
	return names;
}

export function matchSegments(from: Segment[], to: Segment[], samples = 24): SegmentPair[] {
	const names = mergeOrder(
		from.map((s) => s.name),
		to.map((s) => s.name),
	);

	const find = (list: Segment[], name: string) => list.find((s) => s.name === name);
	const joinFor = (list: Segment[], name: string): Pt => {
		// Nearest preceding present segment's end point; falls back to the
		// following segment's start, then origin.
		const order = names;
		const idx = order.indexOf(name);
		for (let i = idx - 1; i >= 0; i--) {
			const s = find(list, order[i]!);
			if (s && s.points.length) return s.points[s.points.length - 1]!;
		}
		for (let i = idx + 1; i < order.length; i++) {
			const s = find(list, order[i]!);
			if (s && s.points.length) return s.points[0]!;
		}
		return [0, 0];
	};

	return names.map((name) => {
		const f = find(from, name);
		const t = find(to, name);
		const fPts = f ? resample(f.points, samples) : undefined;
		const tPts = t ? resample(t.points, samples) : undefined;
		if (fPts && tPts) return { name, from: fPts, to: tPts };
		if (fPts) {
			const j = joinFor(to, name);
			return { name, from: fPts, to: Array.from({ length: samples }, () => j) };
		}
		const j = joinFor(from, name);
		return { name, from: Array.from({ length: samples }, () => j), to: tPts! };
	});
}

export function interpolatePairs(pairs: SegmentPair[], t: number): Segment[] {
	return pairs.map((p) => ({
		name: p.name,
		points: p.from.map((fp, i) => {
			const tp = p.to[i]!;
			return [lerp(fp[0], tp[0], t), lerp(fp[1], tp[1], t)] as const;
		}),
	}));
}

/** One continuous SVG path; the pen never lifts between segments. */
export function toSvgPath(segs: Segment[]): string {
	let d = "";
	let first = true;
	for (const s of segs) {
		for (let i = 0; i < s.points.length; i++) {
			const [x, y] = s.points[i]!;
			const cmd = first ? "M" : i === 0 ? "L" : "L";
			d += `${cmd}${x.toFixed(1)} ${y.toFixed(1)}`;
			first = false;
		}
	}
	return d;
}
