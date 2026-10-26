/**
 * The 10-asset Black–Scholes basket call in PCA coordinates, as in the post:
 * log S_T = μ + B z, payoff e^{-rT}(Σ wᵢSᵢ − K)⁺. `smoothed` integrates the
 * market factor z₁ in closed form after a Newton solve for the exercise boundary.
 */
import { model } from "./data";

const D = model.mu.length;
const mu = Float64Array.from(model.mu);
const w = Float64Array.from(model.w);
const logW = w.map(Math.log);
const B = model.B.map((row) => Float64Array.from(row));
const b1 = Float64Array.from(B, (row) => row[0] ?? 0);
const { K, disc } = model;

export const dimension = D;

/** Φ, to about 1e-7 relative (Numerical Recipes' erfc). */
export function ndtr(x: number): number {
	const z = Math.abs(x) / Math.SQRT2;
	const t = 1 / (1 + 0.5 * z);
	const poly =
		-1.265_512_23 +
		t *
			(1.000_023_68 +
				t *
					(0.374_091_96 +
						t *
							(0.096_784_18 +
								t *
									(-0.186_288_06 +
										t *
											(0.278_868_07 +
												t *
													(-1.135_203_98 +
														t * (1.488_515_87 + t * (-0.822_152_23 + t * 0.170_872_77))))))));
	const tail = 0.5 * t * Math.exp(-z * z + poly);
	return x >= 0 ? 1 - tail : tail;
}

/** Discounted payoff at a standard-normal point z ∈ ℝᴰ. */
export function payoff(z: ArrayLike<number>): number {
	let basket = 0;
	for (let i = 0; i < D; i++) {
		const row = B[i] ?? b1;
		let e = mu[i] ?? 0;
		for (let j = 0; j < D; j++) e += (row[j] ?? 0) * (z[j] ?? 0);
		basket += (w[i] ?? 0) * Math.exp(e);
	}
	return disc * Math.max(basket - K, 0);
}

const logc = new Float64Array(D);

/** z₁* : the market level at which the basket equals the strike, given z₂…z_D. */
export function boundary(rest: ArrayLike<number>): number {
	for (let i = 0; i < D; i++) {
		const row = B[i] ?? b1;
		let e = (logW[i] ?? 0) + (mu[i] ?? 0);
		for (let j = 1; j < D; j++) e += (row[j] ?? 0) * (rest[j - 1] ?? 0);
		logc[i] = e;
	}
	let t = 0;
	for (let it = 0; it < 60; it++) {
		let m = Number.NEGATIVE_INFINITY;
		for (let i = 0; i < D; i++) m = Math.max(m, (logc[i] ?? 0) + (b1[i] ?? 0) * t);
		let s = 0;
		let ds = 0;
		for (let i = 0; i < D; i++) {
			const ex = Math.exp((logc[i] ?? 0) + (b1[i] ?? 0) * t - m);
			s += ex;
			ds += ex * (b1[i] ?? 0);
		}
		const step = (Math.log(s) + m - Math.log(K)) / (ds / s);
		t -= step;
		if (Math.abs(step) < 1e-13) break;
	}
	return t;
}

/** E[payoff | z₂…z_D]: smooth, one dimension fewer, same integral. */
export function smoothed(rest: ArrayLike<number>): number {
	const t = boundary(rest);
	let v = -K * ndtr(-t);
	for (let i = 0; i < D; i++) {
		const b = b1[i] ?? 0;
		v += Math.exp((logc[i] ?? 0) + 0.5 * b * b) * ndtr(b - t);
	}
	return disc * Math.max(v, 0);
}
