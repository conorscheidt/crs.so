/**
 * Favicon generator: a Fraunces "C" inside a hairline ring on the night tile.
 * Uses the actual glyph outline from the site's Fraunces file (default
 * instance; the low optical size is the cut designed for small rendering) and
 * writes it to public/favicon.svg.
 *
 *   bun scripts/gen-favicon.ts
 */
import opentype from "opentype.js";
import { decompress } from "wawoff2";

const PAPER = "#171310";
const INK = "#e8e4d9";

const woff2 = await Bun.file(
	"node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2",
).arrayBuffer();
const ttf = await decompress(new Uint8Array(woff2));
const font = opentype.parse(ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength));

const glyph = font.charToGlyph("C");
const upem = font.unitsPerEm;
const target = 13.4; // cap-height target in the 32-unit viewBox
const capH = (font.tables.os2?.sCapHeight as number | undefined) ?? upem * 0.7;
const scale = target / capH;

// centre optically inside the ring
const bb = glyph.getBoundingBox();
const gw = (bb.x2 - bb.x1) * scale;
const cx = 16 - gw / 2 - bb.x1 * scale;
const cy = 16 + target / 2; // baseline so the cap sits centred
const d = glyph.getPath(cx, cy, target * (upem / capH)).toPathData(2);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<rect width="32" height="32" rx="7" fill="${PAPER}"/>
<circle cx="16" cy="16" r="11.2" fill="none" stroke="${INK}" stroke-width="1.1" opacity="0.55"/>
<path d="${d}" fill="${INK}"/>
</svg>
`;

await Bun.write("apps/home/public/favicon.svg", svg);
// biome-ignore lint/suspicious/noConsole: CLI output
console.log("wrote favicon.svg,", svg.length, "bytes");
