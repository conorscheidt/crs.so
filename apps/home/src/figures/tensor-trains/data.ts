/**
 * Measured results behind the tensor-train post, produced by the experiment
 * harness in the companion repository (numpy, Apple M4) and trimmed to what the
 * plates draw. Nothing here is recomputed in the page except where a plate says
 * it runs live.
 */
import control from "./data/control.json" with { type: "json" };
import cost from "./data/cost.json" with { type: "json" };
import ranks from "./data/ranks.json" with { type: "json" };
import sweepLog from "./data/sweeps.json" with { type: "json" };
import train from "./data/train.json" with { type: "json" };

export type Point = readonly [x: number, y: number];

export interface Core {
	readonly r0: number;
	readonly n: number;
	readonly r1: number;
	/** row-major r0 × n × r1 */
	readonly data: Float64Array;
}

export type MethodKey =
	| "mc_raw"
	| "mc_smooth"
	| "rqmc_raw"
	| "rqmc_smooth"
	| "tt_raw"
	| "tt_smooth";

export interface Run {
	readonly d: number;
	readonly price: number;
	/** relative error below which the reference cannot discriminate (2σ) */
	readonly floor: number;
	readonly eigenvalues: readonly number[];
	readonly methods: Readonly<Record<MethodKey, readonly Point[]>>;
	/** payoff standard deviation, for the Monte Carlo rows */
	readonly sigma: Readonly<Record<"mc_raw" | "mc_smooth", number>>;
}

const points = (xs: readonly (readonly number[])[]): readonly Point[] =>
	xs.map(([x = 0, y = 0]) => [x, y] as const);

export const runs: readonly Run[] = cost.runs.map((r) => ({
	d: r.d,
	price: r.price,
	floor: r.floor,
	eigenvalues: r.eigenvalues,
	methods: {
		mc_raw: points(r.methods.mc_raw.points),
		mc_smooth: points(r.methods.mc_smooth.points),
		rqmc_raw: points(r.methods.rqmc_raw.points),
		rqmc_smooth: points(r.methods.rqmc_smooth.points),
		tt_raw: points(r.methods.tt_raw.points),
		tt_smooth: points(r.methods.tt_smooth.points),
	},
	sigma: { mc_raw: r.methods.mc_raw.sigma, mc_smooth: r.methods.mc_smooth.sigma },
}));

export const runFor = (d: number): Run => runs.find((r) => r.d === d) ?? (runs[0] as Run);

/**
 * Singular values of each unfolding of the 10-asset integrand, smoothed (nine
 * variables) and raw (ten), normalized by the largest. Each was read off a
 * rank-24 train on 16 Gauss–Hermite nodes per variable whose entries carry the
 * square roots of the quadrature weights.
 */
export const spectra: Readonly<Record<"smooth" | "raw", readonly (readonly number[])[]>> =
	ranks.spectra;

export type Structure = "sector" | "one_factor" | "random_factors";
export const scaling: Readonly<Record<Structure, readonly Point[]>> = {
	sector: points(ranks.scaling.sector),
	one_factor: points(ranks.scaling.one_factor),
	random_factors: points(ranks.scaling.random_factors),
};

export interface ControlRun {
	readonly rank: number;
	readonly setupEvals: number;
	readonly bias: number;
	readonly varianceRatio: number;
}
/** Every run's 95% interval contained the reference. */
export const allCovered: boolean = control.allCovered;
export const controlRuns: readonly ControlRun[] = control.runs.map(
	([rank = 0, setupEvals = 0, bias = 0, varianceRatio = 0]) => ({
		rank,
		setupEvals,
		bias,
		varianceRatio,
	}),
);

/** The 10-asset train used live: 9 cores on 10 Gauss–Hermite nodes, ranks ≤ 8. */
export const cores: readonly Core[] = train.cores.map(
	({ shape: [r0 = 1, n = 1, r1 = 1], data }) => ({
		r0,
		n,
		r1,
		data: Float64Array.from(data),
	}),
);
export const grid = {
	nodes: Float64Array.from(train.grid.nodes),
	weights: Float64Array.from(train.grid.weights),
	bary: Float64Array.from(train.grid.bary),
} as const;
export const model = train.model;
export const reference = train.price;
export const ttValue = train.ttValue;

export interface Sweep {
	/** evaluations requested so far, repeats included */
	readonly evals: number;
	/** r₀ … r₉ after the sweep */
	readonly ranks: readonly number[];
	/** the train contracted against the quadrature weights */
	readonly integral: number;
}
/** The construction of that train, recorded after each of its twelve TT-cross sweeps. */
export const sweeps: readonly Sweep[] = sweepLog.sweeps;
