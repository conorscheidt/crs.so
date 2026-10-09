/**
 * Instances Fraunces down to the axes the site uses. No Fontsource cut has
 * both `opsz` (display sizes) and `SOFT` (the hover), so the only stock option
 * is the 120 KB full file.
 *
 * WONK is pinned to 1 rather than dropped: it defaults to 1 and the CSS never
 * sets it, so dropping it would switch the alternate letterforms off.
 *
 *   full                120.0 KB
 *   WONK=1              117.5 KB
 *   + wght 100–300       98.6 KB
 *   + opsz 40–144        98.2 KB
 *   + SOFT 0–64          93.7 KB
 *
 * Glyph coverage is untouched, since post titles are arbitrary text. Needs
 * fontTools (`python3 -m fontTools`); the output is committed.
 *
 *   bun scripts/gen-fonts.ts
 */
import { $ } from "bun";
import { compress, decompress } from "wawoff2";

const SRC = "node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2";
const OUT = "apps/home/src/assets/fonts/fraunces-display.woff2";
const TMP = "/tmp/crs-fraunces";

/** Axis limits, with the values the site uses. */
const AXES = [
	"WONK=1", // pinned at its default
	"wght=100:300", // used: 130 and 260
	"opsz=40:144", // used: 40, 60, 144
	"SOFT=0:64", // used: .inkable animates 0 → 64
];

const src = Buffer.from(await Bun.file(SRC).arrayBuffer());
await Bun.write(`${TMP}-in.ttf`, Buffer.from(await decompress(src)));

await $`python3 -m fontTools.varLib.instancer ${`${TMP}-in.ttf`} ${AXES} -o ${`${TMP}-out.ttf`}`.quiet();

const out = Buffer.from(
	await compress(Buffer.from(await Bun.file(`${TMP}-out.ttf`).arrayBuffer())),
);
await Bun.write(OUT, out);

// biome-ignore lint/suspicious/noConsole: CLI output
console.log(
	`${OUT}\n  ${(src.length / 1024).toFixed(1)} KB → ${(out.length / 1024).toFixed(1)} KB ` +
		`(${Math.round((1 - out.length / src.length) * 100)}% smaller)\n  ${AXES.join("  ")}`,
);
