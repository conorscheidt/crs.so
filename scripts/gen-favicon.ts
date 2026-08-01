/**
 * Favicon generator: a Fraunces C drawn as dots. The glyph outline (light
 * instance, via fontkit's variable-axis instancing) is resampled by arc length
 * into ink dots, over a faint solid underlay that keeps the letterform legible
 * at 16px.
 *
 *   bun scripts/gen-favicon.ts
 */
import { readFile } from "node:fs/promises";
import { create } from "fontkit";
import { decompress } from "wawoff2";

const PAPER = "#171310";
const INK = "#e8e4d9";
const SPACING = 1.28; // arc-length between dots, in viewBox units
const UNDERLAY = 0.2;

const woff2 = await readFile(
	"node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2",
);
const base = create(Buffer.from(await decompress(new Uint8Array(woff2))));
const font = base.getVariation({ wght: 300, opsz: 144, SOFT: 0, WONK: 0 });

const run = font.layout("C");
const glyph = run.glyphs[0];
const upem = font.unitsPerEm;

// scale so the cap fills the tile with a little air
const bb = glyph.bbox;
const target = 21;
const scale = target / (bb.maxY - bb.minY);
const gw = (bb.maxX - bb.minX) * scale;
const gh = (bb.maxY - bb.minY) * scale;
const ox = 16 - gw / 2 - bb.minX * scale;
const oy = 16 + gh / 2 + bb.minY * scale;
void upem;

const path = glyph.path.transform(scale, 0, 0, -scale, ox, oy);
const d = path.toSVG();

// ---- flatten the outline to a polyline, then resample into dots ----
type Pt = { x: number; y: number };
const poly: Pt[] = [];
let cur: Pt = { x: 0, y: 0 };
let start: Pt = cur;
const bez = (p0: Pt, cps: Pt[], n = 14): void => {
	const pts = [p0, ...cps];
	const deg = pts.length - 1;
	const binom = deg === 3 ? [1, 3, 3, 1] : [1, 2, 1];
	for (let i = 1; i <= n; i++) {
		const t = i / n;
		let x = 0;
		let y = 0;
		for (const [k, p] of pts.entries()) {
			const w = (binom[k] as number) * (1 - t) ** (deg - k) * t ** k;
			x += p.x * w;
			y += p.y * w;
		}
		poly.push({ x, y });
	}
};
for (const c of path.commands as { command: string; args: number[] }[]) {
	const a = c.args;
	if (c.command === "moveTo") {
		cur = { x: a[0] as number, y: a[1] as number };
		start = cur;
		poly.push(cur);
	} else if (c.command === "lineTo") {
		cur = { x: a[0] as number, y: a[1] as number };
		poly.push(cur);
	} else if (c.command === "bezierCurveTo") {
		bez(cur, [
			{ x: a[0] as number, y: a[1] as number },
			{ x: a[2] as number, y: a[3] as number },
			{ x: a[4] as number, y: a[5] as number },
		]);
		cur = { x: a[4] as number, y: a[5] as number };
	} else if (c.command === "quadraticCurveTo") {
		bez(cur, [
			{ x: a[0] as number, y: a[1] as number },
			{ x: a[2] as number, y: a[3] as number },
		]);
		cur = { x: a[2] as number, y: a[3] as number };
	} else if (c.command === "closePath") {
		poly.push(start);
		cur = start;
	}
}

const hash = (i: number, s: number): number => {
	const x = Math.sin(i * 127.1 + s * 311.7) * 43_758.5453;
	return x - Math.floor(x);
};

let acc = 0;
let dots = "";
let di = 0;
for (let i = 1; i < poly.length; i++) {
	const a = poly[i - 1] as Pt;
	const b = poly[i] as Pt;
	const seg = Math.hypot(b.x - a.x, b.y - a.y);
	acc += seg;
	while (acc >= SPACING) {
		acc -= SPACING;
		const t = 1 - acc / seg;
		const x = a.x + (b.x - a.x) * t + (hash(di, 1) - 0.5) * 0.55;
		const y = a.y + (b.y - a.y) * t + (hash(di, 2) - 0.5) * 0.55;
		const r = 0.62 + hash(di, 3) * 0.42;
		const o = 0.55 + hash(di, 4) * 0.45;
		dots += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="${INK}" opacity="${o.toFixed(2)}"/>`;
		di++;
	}
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<rect width="32" height="32" rx="7" fill="${PAPER}"/>
<path d="${d}" fill="${INK}" opacity="${UNDERLAY}"/>
${dots}
</svg>
`;

await Bun.write("apps/home/public/favicon.svg", svg);
// biome-ignore lint/suspicious/noConsole: CLI output
console.log(`wrote favicon.svg — ${di} dots, ${svg.length} bytes`);
