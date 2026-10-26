/** Operations on a tensor train stored as row-major cores. */
import { type Core, cores, grid } from "./data";

/** Σ over the whole grid of w(i₁)…w(i_d) T[i₁…i_d], one core at a time. */
export function contract(
	train: readonly Core[] = cores,
	weights: Float64Array = grid.weights,
	trace?: (k: number, v: Float64Array) => void,
): number {
	let v = Float64Array.of(1);
	train.forEach((core, k) => {
		const out = new Float64Array(core.r1);
		for (let a = 0; a < core.r0; a++) {
			const va = v[a] ?? 0;
			for (let i = 0; i < core.n; i++) {
				const s = va * (weights[i] ?? 0);
				const base = (a * core.n + i) * core.r1;
				for (let b = 0; b < core.r1; b++) out[b] = (out[b] ?? 0) + s * (core.data[base + b] ?? 0);
			}
		}
		v = out;
		trace?.(k, v);
	});
	return v[0] ?? 0;
}

const lagrange = new Float64Array(64);

/** Barycentric Lagrange basis through the Gauss–Hermite nodes, evaluated at x. */
function basis(x: number, n: number): Float64Array {
	let sum = 0;
	for (let j = 0; j < n; j++) {
		const dx = x - (grid.nodes[j] ?? 0);
		if (Math.abs(dx) < 1e-14) {
			lagrange.fill(0, 0, n);
			lagrange[j] = 1;
			return lagrange;
		}
		const l = (grid.bary[j] ?? 0) / dx;
		lagrange[j] = l;
		sum += l;
	}
	for (let j = 0; j < n; j++) lagrange[j] = (lagrange[j] ?? 0) / sum;
	return lagrange;
}

const left = new Float64Array(64);
const right = new Float64Array(64);

/** The train's interpolant at an arbitrary point: d small vector–matrix products. */
export function evaluate(z: ArrayLike<number>, train: readonly Core[] = cores): number {
	left[0] = 1;
	let rank = 1;
	train.forEach((core, k) => {
		const l = basis(z[k] ?? 0, core.n);
		right.fill(0, 0, core.r1);
		for (let a = 0; a < rank; a++) {
			const va = left[a] ?? 0;
			for (let i = 0; i < core.n; i++) {
				const s = va * (l[i] ?? 0);
				if (s === 0) continue;
				const base = (a * core.n + i) * core.r1;
				for (let b = 0; b < core.r1; b++)
					right[b] = (right[b] ?? 0) + s * (core.data[base + b] ?? 0);
			}
		}
		left.set(right.subarray(0, core.r1));
		rank = core.r1;
	});
	return left[0] ?? 0;
}

/** ε-rank: the smallest r whose discarded tail ‖σ_{r+1:}‖ is at most ε‖σ‖. */
export function epsRank(sigma: readonly number[], eps: number): number {
	const total = Math.hypot(...sigma);
	let tail = 0;
	for (let r = sigma.length; r > 0; r--) {
		tail = Math.hypot(tail, sigma[r - 1] ?? 0);
		if (tail > eps * total) return r;
	}
	return 0;
}
