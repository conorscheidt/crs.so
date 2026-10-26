/**
 * The 2-D warm-up: a two-asset basket-call integrand in correlated normal
 * coordinates, payoff × φ_ρ(y₁, y₂) on [−4, 4]², ρ = 0.7, sampled 64 × 64.
 * The kink and the correlation are what give it a non-trivial spectrum.
 */
import { type Matrix, type Svd, svd } from "./linalg";

export const N = 64;
const L = 4;
const RHO = 0.7;
const SIGMA = [0.25, 0.4] as const;
const RATE = 0.03;
const STRIKE = 100;

function integrand(y1: number, y2: number): number {
	const s1 = 100 * Math.exp(RATE - SIGMA[0] ** 2 / 2 + SIGMA[0] * y1);
	const s2 = 100 * Math.exp(RATE - SIGMA[1] ** 2 / 2 + SIGMA[1] * y2);
	const q = (y1 * y1 - 2 * RHO * y1 * y2 + y2 * y2) / (1 - RHO * RHO);
	return (
		(Math.max(0.5 * s1 + 0.5 * s2 - STRIKE, 0) * Math.exp(-q / 2)) /
		(2 * Math.PI * Math.sqrt(1 - RHO * RHO))
	);
}

const axis = Float64Array.from({ length: N }, (_, i) => -L + ((i + 0.5) * 2 * L) / N);

/** Rows run over y₂ (bottom to top), columns over y₁. */
export const field: Matrix = Array.from(axis, (y2) =>
	Float64Array.from(axis, (y1) => integrand(y1, y2)),
);

export const fieldMax = Math.max(...field.map((row) => Math.max(...row)));

let decomposition: Svd | undefined;

/** The SVD of the field, computed once and shared by the plates that need it. */
export const fieldSvd = (): Svd => {
	decomposition ??= svd(field);
	return decomposition;
};
