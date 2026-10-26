/** Dense kernels for the 64 × 64 warm-up: one-sided Jacobi SVD and adaptive cross approximation. */

export type Matrix = readonly Float64Array[];

export interface Svd {
	readonly u: Matrix;
	readonly s: Float64Array;
	readonly v: Matrix;
}

export function svd(a: Matrix): Svd {
	const m = a.length;
	const n = a[0]?.length ?? 0;
	const u = a.map((row) => Float64Array.from(row));
	const v = Array.from({ length: n }, (_, i) => {
		const e = new Float64Array(n);
		e[i] = 1;
		return e;
	});
	const col = (x: Matrix, j: number, i: number): number => x[i]?.[j] ?? 0;
	const rotate = (
		x: Float64Array[],
		rows: number,
		p: number,
		q: number,
		c: number,
		s: number,
	): void => {
		for (let i = 0; i < rows; i++) {
			const row = x[i];
			if (!row) continue;
			const xp = row[p] ?? 0;
			const xq = row[q] ?? 0;
			row[p] = c * xp - s * xq;
			row[q] = s * xp + c * xq;
		}
	};
	for (let sweep = 0; sweep < 40; sweep++) {
		let off = 0;
		for (let p = 0; p < n - 1; p++) {
			for (let q = p + 1; q < n; q++) {
				let alpha = 0;
				let beta = 0;
				let gamma = 0;
				for (let i = 0; i < m; i++) {
					const up = col(u, p, i);
					const uq = col(u, q, i);
					alpha += up * up;
					beta += uq * uq;
					gamma += up * uq;
				}
				if (gamma === 0 || Math.abs(gamma) <= 1e-15 * Math.sqrt(alpha * beta)) continue;
				off = Math.max(off, Math.abs(gamma) / Math.sqrt(alpha * beta));
				const zeta = (beta - alpha) / (2 * gamma);
				const t = Math.sign(zeta || 1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
				const c = 1 / Math.sqrt(1 + t * t);
				rotate(u, m, p, q, c, c * t);
				rotate(v, n, p, q, c, c * t);
			}
		}
		if (off < 1e-12) break;
	}
	const norms = Float64Array.from({ length: n }, (_, j) =>
		Math.hypot(...u.map((row) => row[j] ?? 0)),
	);
	const order = [...norms.keys()].sort((x, y) => (norms[y] ?? 0) - (norms[x] ?? 0));
	return {
		u: u.map((row) =>
			Float64Array.from(order, (j) => ((norms[j] ?? 0) > 0 ? (row[j] ?? 0) / (norms[j] ?? 1) : 0)),
		),
		s: Float64Array.from(order, (j) => norms[j] ?? 0),
		v: v.map((row) => Float64Array.from(order, (j) => row[j] ?? 0)),
	};
}

export function lowRank({ u, s, v }: Svd, r: number): Matrix {
	return u.map((ui) => {
		const out = new Float64Array(v.length);
		for (let a = 0; a < r; a++) {
			const scale = (ui[a] ?? 0) * (s[a] ?? 0);
			if (scale === 0) continue;
			v.forEach((vj, j) => {
				out[j] = (out[j] ?? 0) + scale * (vj[a] ?? 0);
			});
		}
		return out;
	});
}

export interface Pivot {
	readonly row: number;
	readonly col: number;
	/** distinct entries of the black box evaluated so far; rows and columns share their crossings */
	readonly evaluated: number;
}

export interface Cross {
	readonly pivots: readonly Pivot[];
	readonly approximation: (rank: number) => Matrix;
}

/** Adaptive cross approximation with partial pivoting: touches only the rows and columns it picks. */
export function cross(
	entry: (i: number, j: number) => number,
	m: number,
	n: number,
	maxRank: number,
): Cross {
	const us: Float64Array[] = [];
	const vs: Float64Array[] = [];
	const pivots: Pivot[] = [];
	const used = new Set<number>();
	const columns = new Set<number>();
	let i = Math.floor(m / 2);
	for (let k = 0; k < maxRank; k++) {
		const row = Float64Array.from({ length: n }, (_, j) => entry(i, j));
		us.forEach((uk, a) => {
			const scale = uk[i] ?? 0;
			const vk = vs[a];
			if (vk) for (let j = 0; j < n; j++) row[j] = (row[j] ?? 0) - scale * (vk[j] ?? 0);
		});
		let best = 0;
		for (let c = 1; c < n; c++) if (Math.abs(row[c] ?? 0) > Math.abs(row[best] ?? 0)) best = c;
		const pivot = row[best] ?? 0;
		if (Math.abs(pivot) < 1e-300) break;
		const column = Float64Array.from({ length: m }, (_, r) => entry(r, best));
		us.forEach((uk, a) => {
			const scale = vs[a]?.[best] ?? 0;
			for (let r = 0; r < m; r++) column[r] = (column[r] ?? 0) - scale * (uk[r] ?? 0);
		});
		us.push(column.map((x) => x / pivot));
		vs.push(row);
		used.add(i);
		columns.add(best);
		pivots.push({
			row: i,
			col: best,
			evaluated: used.size * n + columns.size * m - used.size * columns.size,
		});
		let next = -1;
		for (let r = 0; r < m; r++) {
			if (!used.has(r) && (next < 0 || Math.abs(column[r] ?? 0) > Math.abs(column[next] ?? 0)))
				next = r;
		}
		if (next < 0) break;
		i = next;
	}
	return {
		pivots,
		approximation: (rank: number): Matrix =>
			Array.from({ length: m }, (_, r) => {
				const out = new Float64Array(n);
				for (let a = 0; a < Math.min(rank, us.length); a++) {
					const scale = us[a]?.[r] ?? 0;
					const vk = vs[a];
					if (scale !== 0 && vk)
						for (let c = 0; c < n; c++) out[c] = (out[c] ?? 0) + scale * (vk[c] ?? 0);
				}
				return out;
			}),
	};
}

export const frobenius = (a: Matrix): number => Math.hypot(...a.flatMap((row) => [...row]));

export const relativeError = (a: Matrix, b: Matrix): number =>
	Math.hypot(...a.flatMap((row, i) => [...row].map((x, j) => x - (b[i]?.[j] ?? 0)))) / frobenius(a);
