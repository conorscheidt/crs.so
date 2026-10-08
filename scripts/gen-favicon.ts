// Generates the icon set from one construction: the trefoil knot the home
// page draws, as a single stroke. Run from the repo root:
//
//   bun scripts/gen-favicon.ts
//
// favicon.svg is transparent and switches ink with prefers-color-scheme.
// favicon.ico (16/32/48) is what PDF viewers, bookmark bars and older
// browsers request, so it commits to the dark ink they're usually shown on.
// The home-screen icons get a tile, because iOS and Android paint alpha.
import sharp from "sharp";

const PAPER = "#171310";
const INK = "#e8e4d9";
const DAY_INK = "#221f1a";
const PUBLIC = "apps/home/public";

/**
 * x = sin t + 2 sin 2t, y = cos t − 2 cos 2t. The curve is not symmetric in y
 * (it spans −3 to ~2.06), so it is fitted and centred by its sampled bounding
 * box rather than by the parametric origin. `size` is the larger side of that
 * box in the 32-unit viewBox.
 */
function knot(size: number, samples = 720): string {
	const raw: [number, number][] = [];
	for (let i = 0; i < samples; i++) {
		const t = (i / samples) * Math.PI * 2;
		raw.push([Math.sin(t) + 2 * Math.sin(2 * t), Math.cos(t) - 2 * Math.cos(2 * t)]);
	}
	const xs = raw.map(([x]) => x);
	const ys = raw.map(([, y]) => y);
	const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
	const k = size / Math.max(x1 - x0, y1 - y0);
	const cx = (x0 + x1) / 2;
	const cy = (y0 + y1) / 2;
	const pts = raw.map(
		([x, y]) => `${(16 + (x - cx) * k).toFixed(3)} ${(16 + (y - cy) * k).toFixed(3)}`,
	);
	return `M ${pts.join(" L ")} Z`;
}

const stroke = (size: number, width: number, ink?: string): string =>
	`<path d="${knot(size)}" fill="none"${ink ? ` stroke="${ink}"` : ""} stroke-width="${width}" stroke-linejoin="round"/>`;

const svg = (body: string, extra = ""): string =>
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${extra}${body}</svg>\n`;

const tile = (body: string, rounded: boolean): string =>
	`<rect width="32" height="32"${rounded ? ' rx="7"' : ""} fill="${PAPER}"/>${body}`;

const png = (size: number, body: string): Promise<Buffer> =>
	sharp(Buffer.from(svg(body)), { density: 512 })
		.resize(size, size)
		.png()
		.toBuffer();

// PNG-in-ICO, valid since Vista.
function ico(images: { size: number; data: Buffer }[]): Buffer {
	const header = Buffer.alloc(6);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(images.length, 4);
	let offset = 6 + images.length * 16;
	const entries = images.map(({ size, data }) => {
		const e = Buffer.alloc(16);
		e.writeUInt8(size >= 256 ? 0 : size, 0);
		e.writeUInt8(size >= 256 ? 0 : size, 1);
		e.writeUInt16LE(1, 4);
		e.writeUInt16LE(32, 6);
		e.writeUInt32LE(data.length, 8);
		e.writeUInt32LE(offset, 12);
		offset += data.length;
		return e;
	});
	return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

// size + stroke width ≤ 32 keeps the outer edge of the stroke inside the box.
const TAB = { size: 28, width: 3 };
const HOME = { size: 20, width: 2.2 };
// Maskable icons are cropped to a circle of 80% diameter; keep the knot inside.
const MASKABLE = { size: 15, width: 1.8 };

const themed = `<style>path{stroke:${DAY_INK}}@media(prefers-color-scheme:dark){path{stroke:${INK}}}</style>`;
await Bun.write(`${PUBLIC}/favicon.svg`, svg(stroke(TAB.size, TAB.width), themed));

const icoSizes = [16, 32, 48];
const icoImages = await Promise.all(
	icoSizes.map(async (size) => ({
		size,
		data: await png(size, stroke(TAB.size, TAB.width, DAY_INK)),
	})),
);
await Bun.write(`${PUBLIC}/favicon.ico`, ico(icoImages));

const home = stroke(HOME.size, HOME.width, INK);
await Bun.write(`${PUBLIC}/apple-touch-icon.png`, await png(180, tile(home, false)));
await Bun.write(`${PUBLIC}/icon-192.png`, await png(192, tile(home, true)));
await Bun.write(`${PUBLIC}/icon-512.png`, await png(512, tile(home, true)));
await Bun.write(
	`${PUBLIC}/icon-maskable-512.png`,
	await png(512, tile(stroke(MASKABLE.size, MASKABLE.width, INK), false)),
);

// biome-ignore lint/suspicious/noConsole: CLI output
console.log(`icons written to ${PUBLIC}`);
