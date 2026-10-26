// E[f(Z)] for f(z) = e^{0.3z} cos z and Z ~ N(0, 1); the exact value is
// e^{(0.09 − 1)/2} cos 0.3. Each control p is a Taylor polynomial of f at 0.
// Its mean under N(0, 1) follows exactly from the moments of Z, and it enters
// with coefficient one, as the train does. Change the degrees or the number of
// draws and run it again.
const degrees = [1, 2, 4, 8];
const draws = 20000;
const a = 0.3;
const f = (z: number): number => Math.exp(a * z) * Math.cos(z);
const exact = Math.exp((a * a - 1) / 2) * Math.cos(a);

// Taylor coefficients of e^{az} cos z = Re e^{(a+i)z}: c_k = Re (a+i)^k / k!.
const coefficients: number[] = [];
let re = 1;
let im = 0;
let factorial = 1;
for (let k = 0; k <= Math.max(...degrees); k++) {
	coefficients.push(re / factorial);
	[re, im] = [re * a - im, re + im * a];
	factorial *= k + 1;
}

// E[Z^k] = (k − 1)!! for even k, 0 for odd k.
function moment(k: number): number {
	if (k % 2 === 1) return 0;
	return k === 0 ? 1 : (k - 1) * moment(k - 2);
}

let seed = 7;
const uniform = (): number => {
	seed = (seed * 48271) % 2147483647;
	return seed / 2147483647;
};
const normal = (): number =>
	Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
const sample = Array.from({ length: draws }, normal);

// Sample mean, 95% half-width and variance, the variance computed in two passes.
function stats(values: readonly number[]): { mean: number; half: number; variance: number } {
	const mean = values.reduce((s, v) => s + v, 0) / values.length;
	const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
	return { mean, half: 1.96 * Math.sqrt(variance / values.length), variance };
}

// Every estimator uses the same draws. With a control, the estimate is the exact
// mean of p plus the sample mean of f − p.
const row = (label: string, mean: number, half: number): string =>
	`${label.padEnd(17)}${mean.toFixed(6)} ± ${half.toFixed(6)}`;
const plain = stats(sample.map(f));
console.log(`exact            ${exact.toFixed(6)}`);
console.log(row("plain MC", plain.mean, plain.half));
for (const degree of degrees) {
	const c = coefficients.slice(0, degree + 1);
	const p = (z: number): number => c.reduceRight((acc, ck) => acc * z + ck, 0);
	const meanOfP = c.reduce((s, ck, k) => s + ck * moment(k), 0);
	const { mean, half, variance } = stats(sample.map((z) => f(z) - p(z)));
	const ratio = plain.variance / variance;
	const shown = ratio < 10 ? ratio.toPrecision(2) : Math.round(ratio).toLocaleString("en-US");
	const label = `degree ${degree}`;
	console.log(`${row(label, meanOfP + mean, half)}   variance ÷ ${shown}`);
}
console.log(`± is a 95% half-width from ${draws.toLocaleString("en-US")} draws`);

export {};
