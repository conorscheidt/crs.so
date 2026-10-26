// A basket of d independent assets S_k = 100 e^{0.2 x_k − 0.02}, held with equal
// weights w = 1/d, is worth s = g_1(x_1) + … + g_d(x_d) with g_k = w S_k. At the
// point x_k = cos k we multiply out the cores of the display, a 1 × 2 matrix,
// d − 2 matrices of size 2 × 2 and a 2 × 1, and compare the product with the sum.
const strike = 100;
const asset = (x: number): number => 100 * Math.exp(0.2 * x - 0.02);

type Matrix = number[][];
const times = (a: Matrix, b: Matrix): Matrix =>
	a.map((row) => (b[0] ?? []).map((_, j) => row.reduce((s, v, i) => s + v * (b[i]?.[j] ?? 0), 0)));

const cores = (g: readonly number[]): Matrix[] =>
	g.map((gk, k) => {
		if (k === 0) return [[gk, 1]];
		if (k === g.length - 1) return [[1], [gk]];
		return [
			[1, 0],
			[gk, 1],
		];
	});

for (const d of [5, 10, 20]) {
	const g = Array.from({ length: d }, (_, k) => asset(Math.cos(k + 1)) / d);
	const train = cores(g);
	const rank = Math.max(...train.map((core) => core[0]?.length ?? 0));
	const product = train.reduce(times)[0]?.[0] ?? 0;
	const sum = g.reduce((total, gk) => total + gk, 0);
	const label = `d = ${d}`.padEnd(9);
	console.log(`${label}rank ${rank}   product ${product.toFixed(8)}   sum ${sum.toFixed(8)}`);
}

// The rank of a matrix by elimination with full pivoting: subtract the rank-one
// cross through the largest remaining entry until no entry is left above the
// rounding level.
function rankOf(matrix: Matrix): number {
	const a = matrix.map((row) => [...row]);
	const tolerance = 1e-10 * Math.max(...a.flat().map(Math.abs));
	for (let r = 0; ; r++) {
		let [pi, pj, pivot] = [0, 0, 0];
		for (const [i, row] of a.entries())
			for (const [j, v] of row.entries())
				if (Math.abs(v) > Math.abs(pivot)) [pi, pj, pivot] = [i, j, v];
		if (Math.abs(pivot) <= tolerance) return r;
		const pivotRow = [...(a[pi] ?? [])];
		for (const row of a) {
			const f = (row[pj] ?? 0) / pivot;
			for (const [j, v] of row.entries()) row[j] = v - f * (pivotRow[j] ?? 0);
		}
	}
}

// The unfolding at the middle cut for d = 4 on 8 points per variable, rows
// indexed by (x_1, x_2) and columns by (x_3, x_4). Each half enters only through
// its partial sum. The call payoff (s − 100)⁺ is not affine in the left partial
// sum, so the pair (s, 1) can no longer carry it across the cut.
const terms = Array.from({ length: 8 }, (_, i) => asset(-2 + (4 * i) / 7) / 4);
const halves = terms.flatMap((a) => terms.map((b) => a + b));
const unfolding = (f: (s: number) => number): Matrix =>
	halves.map((left) => halves.map((right) => f(left + right)));
const linear = rankOf(unfolding((s) => s));
const call = rankOf(unfolding((s) => Math.max(s - strike, 0)));
console.log("middle cut of d = 4 on 8 points per variable");
console.log(`rank ${linear} for s, rank ${call} for (s − 100)⁺`);

export {};
