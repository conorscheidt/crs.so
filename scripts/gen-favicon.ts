/**
 * The mark: an open ring (a C) with a separate dot at its centre. The ring is
 * a stroked arc, the dot a filled circle, and the clearance between them is
 * derived so it reads evenly at every size.
 *
 *          R      ring centreline radius
 *          W      ring stroke weight        → inner edge at R − W/2
 *          DOT    dot radius
 *          GAP    aperture, degrees, centred on +x, terminals cut radially
 *   clearance = (R − W/2) − DOT
 *
 * Emits the full set, since PDFs, bookmarks and older browsers don't use an
 * SVG favicon:
 *   favicon.svg          modern browsers
 *   favicon.ico          16/32/48, PNG-in-ICO; the fallback for PDFs and tabs
 *   apple-touch-icon.png 180, iOS home screen
 *   icon-192/512.png     web app manifest
 *
 *   bun scripts/gen-favicon.ts
 */
import sharp from "sharp";

const PAPER = "#171310";
const INK = "#e8e4d9";

const R = 10.5;
const W = 2.3;
const DOT = 2.4;
const GAP = 84;
const RADIUS = 7; // tile corner rounding, in the 32 box

const rad = (deg: number): number => (deg * Math.PI) / 180;
const on = (deg: number): string =>
	`${(16 + Math.cos(rad(deg)) * R).toFixed(4)} ${(16 + Math.sin(rad(deg)) * R).toFixed(4)}`;

// sweep the long way round, from the lower lip of the aperture to the upper
const a0 = GAP / 2;
const a1 = 360 - GAP / 2;
const ring = `M ${on(a0)} A ${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${on(a1)}`;

const mark = (bg: string, ink: string, rounded = true): string =>
	`<rect width="32" height="32"${rounded ? ` rx="${RADIUS}"` : ""} fill="${bg}"/>` +
	`<path d="${ring}" fill="none" stroke="${ink}" stroke-width="${W}" stroke-linecap="butt"/>` +
	`<circle cx="16" cy="16" r="${DOT}" fill="${ink}"/>`;

const doc = (body: string): string =>
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">\n${body}\n</svg>\n`;

await Bun.write("apps/home/public/favicon.svg", doc(mark(PAPER, INK)));

const png = (size: number, body: string): Promise<Buffer> =>
	sharp(Buffer.from(doc(body)), { density: 384 })
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

const icoSizes = [16, 32, 48];
const icoImages = await Promise.all(
	icoSizes.map(async (size) => ({ size, data: await png(size, mark(PAPER, INK)) })),
);
await Bun.write("apps/home/public/favicon.ico", ico(icoImages));

// iOS crops to its own shape and adds gloss on a square, so ship it unrounded
await Bun.write("apps/home/public/apple-touch-icon.png", await png(180, mark(PAPER, INK, false)));
await Bun.write("apps/home/public/icon-192.png", await png(192, mark(PAPER, INK)));
await Bun.write("apps/home/public/icon-512.png", await png(512, mark(PAPER, INK)));

// biome-ignore lint/suspicious/noConsole: CLI output
console.log(
	`wrote favicon.svg + .ico(${icoSizes.join("/")}) + apple-touch-icon + 192/512 — R=${R} W=${W} dot=${DOT} clearance=${(R - W / 2 - DOT).toFixed(2)}`,
);
