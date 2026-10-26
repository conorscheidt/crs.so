/**
 * How a prose readout prints a figure parameter. The element chooses with
 * `data-format`; without one it keeps two decimals, as every older plate expects.
 * A parameter the plate has no value for prints the element's `data-missing`
 * text, or a dash.
 */
export type ReadoutFormat = "fixed2" | "fixed3" | "fixed5" | "int" | "sci" | "pct";

const isFormat = (s: string | undefined): s is ReadoutFormat =>
	s === "fixed2" || s === "fixed3" || s === "fixed5" || s === "int" || s === "sci" || s === "pct";

/** Mantissa and decimal exponent with one significant decimal, e.g. 2.6e-7 → ["2.6", -7]. */
export function scientific(v: number): readonly [mantissa: string, exponent: number] {
	if (v === 0) return ["0", 0];
	let exponent = Math.floor(Math.log10(Math.abs(v)));
	let mantissa = (v / 10 ** exponent).toFixed(1);
	if (mantissa === "10.0") {
		exponent += 1;
		mantissa = "1.0";
	}
	return [mantissa, exponent];
}

export function readoutText(v: number, format: ReadoutFormat, missing = "—"): string {
	if (!Number.isFinite(v)) return missing;
	switch (format) {
		case "int":
			return Math.round(v).toLocaleString("en-US");
		case "pct":
			return `${Math.round(v * 100)}%`;
		case "fixed3":
			return v.toFixed(3);
		case "fixed5":
			return v.toFixed(5);
		case "sci": {
			const [m, e] = scientific(v);
			return e === 0 ? m : `${m}×10${e}`;
		}
		default:
			return v.toFixed(2);
	}
}

/** Writes the value into the element; scientific notation gets a real superscript. */
export function renderReadout(el: HTMLElement, v: number): void {
	const format = isFormat(el.dataset.format) ? el.dataset.format : "fixed2";
	if (format !== "sci" || !Number.isFinite(v) || scientific(v)[1] === 0) {
		el.textContent = readoutText(v, format, el.dataset.missing);
		return;
	}
	const [m, e] = scientific(v);
	const sup = document.createElement("sup");
	sup.textContent = e < 0 ? `−${-e}` : String(e);
	el.replaceChildren(`${m}×10`, sup);
}
