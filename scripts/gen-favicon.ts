// Generates the icon set from one construction: the icosahedron from the
// Projects section, seen face-on, its visible faces flat-shaded by a light
// from the top left and its edges cut as hairlines. Run from the repo root:
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

type V3 = [number, number, number];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v: V3): V3 => {
	const l = Math.hypot(...v);
	return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: V3, b: V3): V3 => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0],
];

// The 12 vertices (0, ±1, ±φ) and cyclic permutations; edges have length 2.
const phi = (1 + Math.sqrt(5)) / 2;
const verts: V3[] = [];
for (const a of [-1, 1]) for (const b of [-phi, phi]) verts.push([0, a, b], [a, b, 0], [b, 0, a]);
const isEdge = (i: number, j: number): boolean =>
	Math.abs(Math.hypot(...(verts[i] as V3).map((c, k) => c - ((verts[j] as V3)[k] ?? 0))) - 2) < 1e-9;
const faces: [number, number, number][] = [];
for (let i = 0; i < 12; i++)
	for (let j = i + 1; j < 12; j++)
		for (let k = j + 1; k < 12; k++) if (isEdge(i, j) && isEdge(j, k) && isEdge(i, k)) faces.push([i, j, k]);

// Look straight down a face normal (a three-fold axis), with a vertex at the
// top so the outline is a symmetric hexagon with vertical sides.
const view = unit([1, 1, 1]);
function camera(): { x: V3; y: V3 } {
	// up = the component of the highest-lying silhouette vertex perpendicular to the view
	let best: V3 = [0, 1, 0];
	let bestLen = 0;
	for (const v of verts) {
		const d = dot(v, view);
		if (Math.abs(d) > 0.5) continue;
		const perp: V3 = [v[0] - d * view[0], v[1] - d * view[1], v[2] - d * view[2]];
		const len = Math.hypot(...perp);
		if (len > bestLen + 1e-9) {
			bestLen = len;
			best = perp;
		}
	}
	const y = unit(best);
	return { x: cross(y, view), y };
}
const cam = camera();
const flat = verts.map((v) => [dot(v, cam.x), -dot(v, cam.y)] as [number, number]);
const xs = flat.map((p) => p[0]);
const span = Math.max(...xs) - Math.min(...xs);

const centroid = (f: [number, number, number]): V3 =>
	unit(f.reduce<V3>((s, i) => [s[0] + (verts[i] as V3)[0], s[1] + (verts[i] as V3)[1], s[2] + (verts[i] as V3)[2]], [0, 0, 0]));
const light = unit([-0.45, 0.62, 0.65]);
const lightWorld: V3 = [
	light[0] * cam.x[0] + light[1] * cam.y[0] + light[2] * view[0],
	light[0] * cam.x[1] + light[1] * cam.y[1] + light[2] * view[1],
	light[0] * cam.x[2] + light[1] * cam.y[2] + light[2] * view[2],
];
const visible = faces.filter((f) => dot(centroid(f), view) > 1e-6);
const shade = (f: [number, number, number]): number => 0.28 + 0.72 * Math.max(0, dot(centroid(f), lightWorld));
const edges = new Set<string>();
for (const [a, b, c] of visible) for (const [i, j] of [[a, b], [b, c], [a, c]] as const) edges.add(`${Math.min(i, j)}-${Math.max(i, j)}`);

/**
 * The mark at a given silhouette width (in the 32-unit box), centred. A width
 * of 24 puts the vertical sides on whole pixels at both 16 and 32 px.
 */
function mark(width: number, id: string, ink?: string): string {
	const k = width / span;
	const pt = (i: number): string => {
		const [x, y] = flat[i] as [number, number];
		return `${(16 + x * k).toFixed(2)},${(16 + y * k).toFixed(2)}`;
	};
	const cut = [...edges]
		.map((e) => e.split("-").map(Number) as [number, number])
		.map(([i, j]) => `M${pt(i)}L${pt(j)}`)
		.join("");
	const fill = ink ? ` fill="${ink}"` : ` class="f"`;
	const body = visible
		.map((f) => `<path d="M${f.map(pt).join("L")}Z"${fill} opacity="${shade(f).toFixed(2)}"/>`)
		.join("");
	return `<mask id="${id}"><rect width="32" height="32" fill="#fff"/><path d="${cut}" stroke="#000" stroke-width="${(width * 0.046).toFixed(2)}" stroke-linecap="round" fill="none"/></mask><g mask="url(#${id})">${body}</g>`;
}

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

const TAB = 24;
const HOME = 19;
// Maskable icons are cropped to a circle of 80% diameter; the hexagon's
// corners (0.58 × width from the centre) have to stay inside it.
const MASKABLE = 16;

const themed = `<style>.f{fill:${DAY_INK}}@media(prefers-color-scheme:dark){.f{fill:${INK}}}</style>`;
await Bun.write(`${PUBLIC}/favicon.svg`, svg(mark(TAB, "m"), themed));

const icoSizes = [16, 32, 48];
const icoImages = await Promise.all(
	icoSizes.map(async (size) => ({ size, data: await png(size, mark(TAB, "m", DAY_INK)) })),
);
await Bun.write(`${PUBLIC}/favicon.ico`, ico(icoImages));

const home = mark(HOME, "m", INK);
await Bun.write(`${PUBLIC}/apple-touch-icon.png`, await png(180, tile(home, false)));
await Bun.write(`${PUBLIC}/icon-192.png`, await png(192, tile(home, true)));
await Bun.write(`${PUBLIC}/icon-512.png`, await png(512, tile(home, true)));
await Bun.write(`${PUBLIC}/icon-maskable-512.png`, await png(512, tile(mark(MASKABLE, "m", INK), false)));

// biome-ignore lint/suspicious/noConsole: CLI output
console.log(`icons written to ${PUBLIC}`);
