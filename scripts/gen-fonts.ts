/**
 * Fraunces, instanced down to the axes the site uses.
 *
 * Fontsource's smaller Fraunces cuts each drop an axis we need: `soft` drops
 * `opsz`, while `opsz` and `standard` drop `SOFT`. The site uses `opsz` for
 * display sizes and `SOFT` for the ink-burn hover, so the only stock option is
 * `full` at 120 KB, and getting smaller means instancing it here.
 *
 * WONK is pinned at 1. Its default is 1 and the CSS never sets it, so pages
 * already render with the wonky alternates. Dropping the axis without pinning
 * it would reset those glyphs to WONK=0; pinned, rendering is unchanged.
 *
 * Most of the saving is the weight range: the site uses 130 (the 404 numeral)
 * and 260 (everything else), out of a 100–900 axis.
 *
 *   full, as shipped                120.0 KB
 *   WONK=1                          117.5 KB
 *   + wght 100–300                   98.6 KB
 *   + opsz 40–144                    98.2 KB
 *   + SOFT 0–64                      93.7 KB
 *
 * Character coverage is unchanged (245 glyphs, latin). Post titles are
 * arbitrary text, so subsetting glyphs would eventually drop one.
 *
 * Requires fontTools (`python3 -m fontTools`). The output is committed, so a
 * normal build never runs this, same as gen-favicon.ts.
 *
 *   bun scripts/gen-fonts.ts
 */
import { $ } from "bun";
import { compress, decompress } from "wawoff2";

const SRC = "node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2";
const OUT = "apps/home/src/assets/fonts/fraunces-display.woff2";
const TMP = "/tmp/crs-fraunces";

/** Every axis limit, with the reason it is that number. */
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
