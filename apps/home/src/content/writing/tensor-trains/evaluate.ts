// A random tensor train with d variables, n values each and every rank r.
// Core k stores one matrix per value of x_k, row-major. Raise d and run again:
// the brute-force sum grows as n^d, the contraction as d·n·r².
const d = 6;
const n = 4;
const r = 3;
const weights = [0.1, 0.4, 0.4, 0.1]; // quadrature weights q_i, one per value of x_k
const ranks = Array.from({ length: d + 1 }, (_, k) => (k === 0 || k === d ? 1 : r));

let seed = 1;
const random = (): number => {
	seed = (seed * 48271) % 2147483647;
	return seed / 2147483647;
};

const cores = Array.from({ length: d }, (_, k) =>
	Array.from({ length: n }, () =>
		Float64Array.from({ length: (ranks[k] ?? 1) * (ranks[k + 1] ?? 1) }, random),
	),
);

// v ← v · M for a row vector v and a matrix M with `cols` columns.
let multiplyAdds = 0;
function times(v: Float64Array, m: Float64Array, cols: number): Float64Array {
	const out = new Float64Array(cols);
	v.forEach((vi, i) => {
		for (let j = 0; j < cols; j++) out[j] = (out[j] ?? 0) + vi * (m[i * cols + j] ?? 0);
	});
	multiplyAdds += v.length * cols;
	return out;
}

// One entry: each core contributes the matrix its index selects.
function entry(index: readonly number[]): number {
	let v: Float64Array = Float64Array.of(1);
	cores.forEach((core, k) => {
		v = times(v, core[index[k] ?? 0] ?? new Float64Array(), ranks[k + 1] ?? 1);
	});
	return v[0] ?? 0;
}

// Brute force: every one of the n^d entries, weighted. Each term costs the d
// vector–matrix products inside entry(), which times() counts, and d more:
// d − 1 multiplications for its weight and one multiply–add into the sum.
let brute = 0;
for (let flat = 0; flat < n ** d; flat++) {
	const index = Array.from({ length: d }, (_, k) => Math.floor(flat / n ** k) % n);
	brute += index.reduce((q, i) => q * (weights[i] ?? 0), 1) * entry(index);
	multiplyAdds += d;
}
const bruteCost = multiplyAdds;

// Contraction: collapse each core to Σ_i q_i G_k(i), then run one row vector
// down the train.
multiplyAdds = 0;
let carried: Float64Array = Float64Array.of(1);
cores.forEach((core, k) => {
	const summed = new Float64Array(core[0]?.length ?? 0);
	core.forEach((m, i) => {
		m.forEach((x, e) => {
			summed[e] = (summed[e] ?? 0) + (weights[i] ?? 0) * x;
		});
	});
	multiplyAdds += n * summed.length;
	carried = times(carried, summed, ranks[k + 1] ?? 1);
});
const integral = carried[0] ?? 0;

const count = (x: number): string => x.toLocaleString("en-US");
const report = (label: string, value: number, cost: number): void =>
	console.log(`${label}   ${value.toPrecision(15)}   ${count(cost)} multiply–adds`);
console.log(`entries       ${count(n ** d)}`);
report("brute force", brute, bruteCost);
report("contraction", integral, multiplyAdds);

export {};
