/**
 * The mark: a ring with a wedge cut out of it and a dot at the centre. The
 * ring is a single closed path (outer arc, radial edge in, inner arc back,
 * radial edge out) so the cut edges point at the centre. A stroked arc would
 * end in line caps instead of cuts.
 *
 *   RO   outer radius, full bleed in the 32 box
 *   RI   inner radius   → band = RO − RI
 *   DOT  dot radius     → clearance = RI − DOT
 *   GAP  aperture in degrees, centred on +x
 *
 * Tab icons are transparent and edge-to-edge. A background tile would clash
 * with the tab bar's theme, inset the glyph twice, and put four aliased
 * corners on a 16px square. Only platforms that composite onto their own tile
 * get one.
 *
 *   favicon.svg          modern browsers; theme-adaptive, transparent
 *   favicon.ico          16/32/48; Safari, PDF viewers, bookmark bars
 *   apple-touch-icon.png 180, iOS home screen; tiled (iOS paints alpha black)
 *   icon-192/512.png     web app manifest; tiled
 *
 *   bun scripts/gen-favicon.ts
 */
import sharp from "sharp";

const PAPER = "#171310";
const INK = "#e8e4d9";
const DAY_INK = "#221f1a";

const RO = 15.2; // outer radius, full bleed, no tile inset
const RI = 12.2; // inner radius  → a 3.0 band
const DOT = 3.4;
const GAP = 76; // aperture, degrees, centred on +x
const RADIUS = 7; // tile corner rounding, for the platforms that demand a tile

const rad = (deg: number): number => (deg * Math.PI) / 180;
const at = (r: number, deg: number): string =>
	`${(16 + Math.cos(rad(deg)) * r).toFixed(4)} ${(16 + Math.sin(rad(deg)) * r).toFixed(4)}`;

const a0 = GAP / 2;
const a1 = 360 - GAP / 2;
const big = a1 - a0 > 180 ? 1 : 0;
const sector =
	`M ${at(RO, a0)} A ${RO} ${RO} 0 ${big} 1 ${at(RO, a1)} ` +
	`L ${at(RI, a1)} A ${RI} ${RI} 0 ${big} 0 ${at(RI, a0)} Z`;

/** The mark alone, no background. */
const glyph = (ink: string): string =>
	`<path d="${sector}" fill="${ink}"/><circle cx="16" cy="16" r="${DOT}" fill="${ink}"/>`;

/** Tiled, for platforms that composite onto their own square regardless. */
const tile = (bg: string, ink: string, rounded = true): string =>
	`<rect width="32" height="32"${rounded ? ` rx="${RADIUS}"` : ""} fill="${bg}"/>${glyph(ink)}`;

const doc = (body: string, style = ""): string =>
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${style}\n${body}\n</svg>\n`;

/**
 * The SVG carries its own theme switch. Browsers that prefer an SVG favicon
 * honour prefers-color-scheme inside it, so the mark is warm black on a light
 * tab bar and warm paper on a dark one, matching the site's ink inversion.
 */
const THEME_STYLE =
	`\n<style>path,circle{fill:${DAY_INK}}` +
	`@media(prefers-color-scheme:dark){path,circle{fill:${INK}}}</style>`;
await Bun.write(
	"apps/home/public/favicon.svg",
	doc(`<path d="${sector}"/><circle cx="16" cy="16" r="${DOT}"/>`, THEME_STYLE),
);

const png = (size: number, body: string): Promise<Buffer> =>
	sharp(Buffer.from(doc(body)), { density: 512 })
		.resize(size, size)
		.png()
		.toBuffer();

/** ICO with PNG payloads (valid since Vista, simpler than BMP). */
function ico(images: { size: number; data: Buffer }[]): Buffer {
	const header = Buffer.alloc(6);
	header.writeUInt16LE(0, 0); // reserved
	header.writeUInt16LE(1, 2); // type: icon
	header.writeUInt16LE(images.length, 4);
	let offset = 6 + images.length * 16;
	const dir: Buffer[] = [];
	for (const img of images) {
		const e = Buffer.alloc(16);
		e.writeUInt8(img.size >= 256 ? 0 : img.size, 0);
		e.writeUInt8(img.size >= 256 ? 0 : img.size, 1);
		e.writeUInt8(0, 2); // palette
		e.writeUInt8(0, 3); // reserved
		e.writeUInt16LE(1, 4); // colour planes
		e.writeUInt16LE(32, 6); // bits per pixel
		e.writeUInt32LE(img.data.length, 8);
		e.writeUInt32LE(offset, 12);
		offset += img.data.length;
		dir.push(e);
	}
	return Buffer.concat([header, ...dir, ...images.map((i) => i.data)]);
}

/**
 * The raster fallback can't adapt to the tab bar, so it uses the day ink: .ico
 * is mostly shown on light chrome (Safari's light tab strip, PDF viewers,
 * bookmark bars). Anything with a dark tab strip also supports the SVG above
 * and uses that instead.
 */
const icoSizes = [16, 32, 48];
const icoImages = await Promise.all(
	icoSizes.map(async (size) => ({ size, data: await png(size, glyph(DAY_INK)) })),
);
await Bun.write("apps/home/public/favicon.ico", ico(icoImages));

// iOS crops to its own shape and paints alpha black, so ship it tiled and unrounded
await Bun.write("apps/home/public/apple-touch-icon.png", await png(180, tile(PAPER, INK, false)));
await Bun.write("apps/home/public/icon-192.png", await png(192, tile(PAPER, INK)));
await Bun.write("apps/home/public/icon-512.png", await png(512, tile(PAPER, INK)));

// biome-ignore lint/suspicious/noConsole: CLI output
console.log(
	`wrote favicon.svg (theme-adaptive, transparent) + .ico(${icoSizes.join("/")}) + ` +
		`apple-touch + 192/512 — band ${(RO - RI).toFixed(1)}, dot ${DOT}, ` +
		`clearance ${(RI - DOT).toFixed(2)}, aperture ${GAP}°`,
);
