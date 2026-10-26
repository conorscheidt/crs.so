// One-site TT-cross for a call on an equally weighted basket of five assets,
// checked and timed against the dense quadrature sum on the same grid. The
// basket is the five-asset test problem of the post: S_i(0) = K = 100, T = 1,
// r = 3%, volatilities evenly spaced from 15% to 40%, and correlation 0.6 within
// each of three sectors and 0.3 across, slightly perturbed. In principal-component
// coordinates z_1, …, z_5, with z_1 the market factor, the payoff is integrated
// over z_1 in closed form, which leaves a smooth integrand in z_2, …, z_5. Both
// methods use the n-point Gauss–Hermite rule on each of these four axes. The
// dense sum evaluates the integrand at all n^4 grid points. TT-cross evaluates
// it only on the fibers its sweeps select and integrates the resulting train by
// contraction; once n is at least the rank, its evaluation count grows linearly
// in n. Try n = 8 and n = 32.
const rank = 12; // the rank at each of the three interior cuts, capped by the grid
const n = 16; // Gauss–Hermite points per variable
const sweeps = 2; // each sweep runs left to right, then right to left

// log S_T = mu + B z, taken from Basket(5) in basket.py of the experiment
// repository; each asset carries weight w in the basket. The reference price is
// the one the post reports for five assets, to ten significant digits.
// biome-ignore format: a table
const mu = [4.623920185988092, 4.612592060988092, 4.597357685988092, 4.578217060988091, 4.555170185988092];
// biome-ignore format: a table
const B = [
	[0.10682750963810546, 0.07906726507684363, 0.01325677104506904, 0.045081827616054324, 0.051265364702141866],
	[0.15339005657210322, -0.10539738439838546, 0.023223121065429723, 0.08096189595219622, -0.05852341376399753],
	[0.1678260686289569, -0.017291345820175212, -0.21520247925860803, -0.028885788159002907, 0.0037315159998804665],
	[0.2364057394315545, 0.17819491404058216, 0.06611260640778252, -0.09299427752734549, -0.11509273041780789],
	[0.27643173655071274, -0.20191106730777883, 0.11491252243985428, -0.13425588510204967, 0.10764704096335487],
];
const w = 0.2;
const strike = 100;
const discount = Math.exp(-0.03);
const reference = 9.049751584;
const d = mu.length - 1; // the train's variables are z_2, …, z_5

const at = (a: ArrayLike<number>, i: number): number => a[i] ?? 0;

// The n-point Gauss–Hermite rule for N(0, 1). Its nodes are the roots of the
// orthonormal Hermite polynomial p_n, all inside ±√(4n + 2), bracketed on a fine
// grid and bisected to machine precision. Its weights q_i = 1/(n p_{n−1}(x_i)²)
// sum to 1.
function hermite(x: number): [number, number] {
	let [previous, current] = [0, 1];
	for (let k = 0; k < n; k++)
		[previous, current] = [current, (x * current - Math.sqrt(k) * previous) / Math.sqrt(k + 1)];
	return [current, previous];
}
const negative = (x: number): boolean => hermite(x)[0] < 0;
const edge = Math.sqrt(4 * n + 2);
const nodes: number[] = [];
for (let i = 0; i * 1e-3 < 2 * edge; i++) {
	let lo = -edge + i * 1e-3;
	let hi = lo + 1e-3;
	if (negative(lo) === negative(hi)) continue;
	for (let mid = (lo + hi) / 2; mid !== lo && mid !== hi; mid = (lo + hi) / 2)
		if (negative(mid) === negative(lo)) lo = mid;
		else hi = mid;
	nodes.push(lo);
}
const weights = nodes.map((x) => 1 / (n * hermite(x)[1] ** 2));

// Φ(x) = ½ + φ(x)(x + x³/3 + x⁵/15 + …), Marsaglia's series, summed until the
// terms stop changing the total. Its absolute error is below 1e-15.
function cdf(x: number): number {
	if (Math.abs(x) > 8) return x > 0 ? 1 : 0;
	let sum = x;
	let term = x;
	for (let k = 3; sum + (term * x * x) / k !== sum; k += 2) {
		term *= (x * x) / k;
		sum += term;
	}
	return 0.5 + (sum * Math.exp(-0.5 * x * x)) / Math.sqrt(2 * Math.PI);
}

// E[payoff | z_2, …, z_5]: Newton finds the market level z* at which the basket
// hits the strike (it is increasing in z_1), then z_1 is integrated in closed form.
function smoothedPayoff(rest: readonly number[]): number {
	const b = B.map((loadings) => at(loadings, 0));
	const logc = mu.map(
		(m, i) => Math.log(w) + m + rest.reduce((s, z, j) => s + at(B[i] ?? [], j + 1) * z, 0),
	);
	let t = 0;
	for (let it = 0; it < 50; it++) {
		const terms = logc.map((lc, i) => Math.exp(lc + at(b, i) * t));
		const sum = terms.reduce((s, x) => s + x, 0);
		const step =
			(Math.log(sum) - Math.log(strike)) / (terms.reduce((s, x, i) => s + x * at(b, i), 0) / sum);
		t -= step;
		if (Math.abs(step) < 1e-13) break;
	}
	const value = logc.reduce(
		(s, lc, i) => s + Math.exp(lc + at(b, i) ** 2 / 2) * cdf(at(b, i) - t),
		0,
	);
	return discount * Math.max(value - strike * cdf(-t), 0);
}

type Matrix = { rows: number; cols: number; data: Float64Array };
const matrix = (rows: number, cols: number): Matrix => ({
	rows,
	cols,
	data: new Float64Array(rows * cols),
});
const get = (m: Matrix, i: number, j: number): number => at(m.data, i * m.cols + j);
const column = (m: Matrix, j: number): number[] =>
	Array.from({ length: m.rows }, (_, i) => get(m, i, j));

// An orthonormal basis U for the columns (modified Gram–Schmidt).
function orthonormal(m: Matrix): Matrix {
	const u = matrix(m.rows, m.cols);
	u.data.set(m.data);
	for (let j = 0; j < u.cols; j++) {
		for (let p = 0; p < j; p++) {
			const dot = column(u, p).reduce((s, x, i) => s + x * get(u, i, j), 0);
			for (let i = 0; i < u.rows; i++) u.data[i * u.cols + j] = get(u, i, j) - dot * get(u, i, p);
		}
		const norm = Math.hypot(...column(u, j)) || 1;
		for (let i = 0; i < u.rows; i++) u.data[i * u.cols + j] = get(u, i, j) / norm;
	}
	return u;
}

// X = U · U[rows]⁻¹, by Gauss–Jordan on the transposed system U[rows]ᵀ Xᵀ = Uᵀ.
function interpolate(u: Matrix, rows: readonly number[]): Matrix {
	const r = u.cols;
	const a = Array.from({ length: r }, (_, i) => rows.map((row) => get(u, row, i)));
	const x = Array.from({ length: r }, (_, i) => column(u, i));
	for (let c = 0; c < r; c++) {
		let p = c;
		for (let i = c + 1; i < r; i++) if (Math.abs(a[i]?.[c] ?? 0) > Math.abs(a[p]?.[c] ?? 0)) p = i;
		[a[c], a[p]] = [a[p] ?? [], a[c] ?? []];
		[x[c], x[p]] = [x[p] ?? [], x[c] ?? []];
		for (let i = 0; i < r; i++) {
			if (i === c) continue;
			const f = (a[i]?.[c] ?? 0) / (a[c]?.[c] ?? 1);
			a[i] = (a[i] ?? []).map((v, j) => v - f * (a[c]?.[j] ?? 0));
			x[i] = (x[i] ?? []).map((v, k) => v - f * (x[c]?.[k] ?? 0));
		}
	}
	const out = matrix(u.rows, r);
	for (let i = 0; i < r; i++)
		for (let k = 0; k < u.rows; k++) out.data[k * r + i] = (x[i]?.[k] ?? 0) / (a[i]?.[i] ?? 1);
	return out;
}

// maxvol: r rows of a tall U whose r × r block has locally maximal |det|. Start
// from the rows partial pivoting picks, then swap rows while some entry of
// U · U[rows]⁻¹ exceeds 1.05 in modulus.
function maxvol(u: Matrix): number[] {
	const work = Array.from({ length: u.rows }, (_, i) =>
		Array.from(u.data.subarray(i * u.cols, (i + 1) * u.cols)),
	);
	const rows: number[] = [];
	for (let j = 0; j < u.cols; j++) {
		let p = -1;
		for (const [i, row] of work.entries()) {
			if (!rows.includes(i) && (p < 0 || Math.abs(row[j] ?? 0) > Math.abs(work[p]?.[j] ?? 0)))
				p = i;
		}
		rows.push(p);
		const pivot = work[p] ?? [];
		for (const [i, row] of work.entries()) {
			const f = (row[j] ?? 0) / (pivot[j] ?? 1);
			if (i !== p) work[i] = row.map((v, c) => v - f * (pivot[c] ?? 0));
		}
	}
	for (let swap = 0; swap < 100; swap++) {
		const x = interpolate(u, rows);
		let best = { i: 0, j: 0, v: 0 };
		for (let i = 0; i < x.rows; i++) {
			for (let j = 0; j < x.cols; j++)
				if (Math.abs(get(x, i, j)) > best.v) best = { i, j, v: Math.abs(get(x, i, j)) };
		}
		if (best.v <= 1.05) break;
		rows[best.j] = best.i;
	}
	return rows;
}

const sqrtWeights = weights.map(Math.sqrt);

// Entries are scaled by Π √q, so pivoting on large entries pivots on the ones
// that carry the integral; the contraction below supplies the other √q.
// Sweeps request some grid points more than once, so both counts are kept.
let evaluations = 0;
const points = new Set<number>();
function entry(index: readonly number[]): number {
	evaluations++;
	points.add(index.reduce((flat, i) => flat * n + i, 0));
	return (
		smoothedPayoff(index.map((i) => at(nodes, i))) *
		index.reduce((p, i) => p * at(sqrtWeights, i), 1)
	);
}

// Left index sets I[k] (prefixes) start empty; right sets J[k] (suffixes) start
// random, as many as the rank allows: no more than n^k prefixes can sit on the left.
let seed = 12345;
const draw = (): number => {
	seed = (seed * 48271) % 2147483647;
	return seed % n;
};
function suffixes(length: number): number[][] {
	const seen = new Map<string, number[]>();
	while (seen.size < Math.min(rank, n ** length, n ** (d - length))) {
		const s = Array.from({ length }, draw);
		seen.set(s.join(), s);
	}
	return [...seen.values()];
}
const left: number[][][] = Array.from({ length: d + 1 }, () => [[]]);
const right: number[][][] = Array.from({ length: d + 1 }, (_, k) =>
	k === 0 || k === d ? [[]] : suffixes(d - k),
);
const cores: { r0: number; r1: number; data: Float64Array }[] = [];

// The block of entries with a prefix from I[k], any x_k, and a suffix from J[k+1],
// as an (r0 · n) × r1 matrix.
function fiber(k: number): Matrix {
	const pre = left[k] ?? [[]];
	const suf = right[k + 1] ?? [[]];
	const m = matrix(pre.length * n, suf.length);
	for (const [a, p] of pre.entries()) {
		for (let i = 0; i < n; i++)
			for (const [b, s] of suf.entries())
				m.data[(a * n + i) * suf.length + b] = entry([...p, i, ...s]);
	}
	return m;
}

const crossStart = performance.now();
for (let sweep = 0; sweep < sweeps; sweep++) {
	// left to right: maxvol on each fiber picks the prefixes I[k+1]
	for (let k = 0; k < d - 1; k++) {
		const u = orthonormal(fiber(k));
		const rows = maxvol(u);
		cores[k] = { r0: (left[k] ?? []).length, r1: u.cols, data: interpolate(u, rows).data };
		left[k + 1] = rows.map((s) => [...((left[k] ?? [])[Math.floor(s / n)] ?? []), s % n]);
	}
	cores[d - 1] = { r0: (left[d - 1] ?? []).length, r1: 1, data: fiber(d - 1).data };
	// right to left: the same step on the transposed fiber picks the suffixes J[k]
	for (let k = d - 1; k > 0; k--) {
		const f = fiber(k);
		const r0 = f.rows / n;
		const r1 = f.cols;
		const t = matrix(n * r1, r0);
		for (let a = 0; a < r0; a++)
			for (let i = 0; i < n; i++)
				for (let b = 0; b < r1; b++) t.data[(i * r1 + b) * r0 + a] = get(f, a * n + i, b);
		const u = orthonormal(t);
		const rows = maxvol(u);
		const x = interpolate(u, rows);
		const data = new Float64Array(u.cols * n * r1);
		for (let a = 0; a < u.cols; a++)
			for (let i = 0; i < n; i++)
				for (let b = 0; b < r1; b++) data[(a * n + i) * r1 + b] = get(x, i * r1 + b, a);
		cores[k] = { r0: u.cols, r1, data };
		right[k] = rows.map((s) => [Math.floor(s / r1), ...((right[k + 1] ?? [])[s % r1] ?? [])]);
	}
	cores[0] = { r0: 1, r1: (right[1] ?? []).length, data: fiber(0).data };
}

// Contract against √q, one core at a time.
let carried = Float64Array.of(1);
for (const { r0, r1, data } of cores) {
	const next = new Float64Array(r1);
	for (let a = 0; a < r0; a++)
		for (let i = 0; i < n; i++)
			for (let b = 0; b < r1; b++)
				next[b] =
					at(next, b) + at(carried, a) * at(sqrtWeights, i) * at(data, (a * n + i) * r1 + b);
	carried = next;
}
const price = at(carried, 0);
const crossMs = performance.now() - crossStart;

// The dense sum: every grid point, weighted by Π q.
const denseStart = performance.now();
let dense = 0;
for (let flat = 0; flat < n ** d; flat++) {
	const index = Array.from({ length: d }, (_, k) => Math.floor(flat / n ** k) % n);
	dense +=
		index.reduce((p, i) => p * at(weights, i), 1) * smoothedPayoff(index.map((i) => at(nodes, i)));
}
const denseMs = performance.now() - denseStart;

const count = (x: number): string => x.toLocaleString("en-US");
const error = (x: number): string => (Math.abs(x - reference) / reference).toExponential(1);
const line = (label: string, value: string, err = "", cost = "", ms = ""): void => {
	const numbers = err.padStart(16) + cost.padStart(14) + ms.padStart(7);
	console.log((label.padEnd(11) + value.padEnd(10) + numbers).trimEnd());
};
line("", "price", "relative error", "evaluations", "ms");
line("reference", reference.toFixed(8));
line("dense sum", dense.toFixed(8), error(dense), count(n ** d), denseMs.toFixed(0));
line("TT-cross", price.toFixed(8), error(price), count(evaluations), crossMs.toFixed(0));
console.log(`TT-cross evaluated ${count(points.size)} distinct grid points of ${count(n ** d)}`);

export {};
