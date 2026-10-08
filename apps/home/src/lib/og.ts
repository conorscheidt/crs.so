/**
 * Build-time social cards. Titles are set in Fraunces at the nameplate weight,
 * laid out with fontkit (variable-axis instancing, kerning), converted to
 * outlines, composed as SVG on the night tile and rasterised by sharp. No
 * headless browser, and nothing here ships to the client.
 */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import process from "node:process";
import { create, type Font } from "fontkit";
import sharp from "sharp";
import { decompress } from "wawoff2";

export const OG_W = 1200;
export const OG_H = 630;

const PAPER = "#171310";
const INK = "#e8e4d9";
const DIM = "rgba(232,228,217,0.5)";

// createRequire, not import.meta.resolve: Vite's dev module runner rewrites
// the latter into an internal specifier that fails at runtime
const resolve = createRequire(import.meta.url).resolve;
// Fraunces is instanced into src/assets by scripts/gen-fonts.ts, so resolve it
// from the app root: at build time this module is a chunk under dist/.prerender,
// and package-relative specifiers and import.meta.url resolve against that.
const FRAUNCES = join(process.cwd(), "src/assets/fonts/fraunces-display.woff2");
const SPECTRAL = "@fontsource/spectral/files/spectral-latin-300-normal.woff2";

type Face = Font;
let display: Face | null = null;
let text: Face | null = null;

/** Absolute paths pass through; bare specifiers go through the module graph. */
async function load(specifier: string): Promise<Face> {
	const woff2 = await readFile(specifier.startsWith("/") ? specifier : resolve(specifier));
	const ttf = await decompress(new Uint8Array(woff2));
	return create(Buffer.from(ttf));
}

async function fonts(): Promise<{ display: Face; text: Face }> {
	// WONK is baked to 1 in the instanced file. Don't set it here, or the cards
	// get different letterforms from the site.
	display ??= (await load(FRAUNCES)).getVariation({ wght: 300, opsz: 144, SOFT: 0 });
	text ??= await load(SPECTRAL);
	return { display, text };
}

const widthOf = (font: Face, s: string, size: number): number =>
	(font.layout(s).advanceWidth / font.unitsPerEm) * size;

/** Lay a string out and return one SVG path covering every glyph. */
function textPath(font: Face, s: string, x: number, y: number, size: number): string {
	const scale = size / font.unitsPerEm;
	const run = font.layout(s);
	let pen = x;
	let d = "";
	run.glyphs.forEach((glyph, i) => {
		const pos = run.positions[i];
		if (!pos) return;
		d += glyph.path
			.transform(scale, 0, 0, -scale, pen + pos.xOffset * scale, y - pos.yOffset * scale)
			.toSVG();
		pen += pos.xAdvance * scale;
	});
	return d;
}

/** Greedy wrap on measured advance widths. */
function wrap(font: Face, words: string[], size: number, max: number): string[] {
	const lines: string[] = [];
	let line = "";
	for (const w of words) {
		const next = line ? `${line} ${w}` : w;
		if (line && widthOf(font, next, size) > max) {
			lines.push(line);
			line = w;
		} else {
			line = next;
		}
	}
	if (line) lines.push(line);
	return lines;
}

const hash = (i: number, s: number): number => {
	const x = Math.sin(i * 127.1 + s * 311.7) * 43_758.5453;
	return x - Math.floor(x);
};

/** The hub's trefoil, bleeding off the right edge. */
function ornament(): string {
	let dots = "";
	const CX = OG_W - 140;
	const CY = OG_H / 2;
	const K = 240;
	const cy = Math.cos(0.9);
	const sy = Math.sin(0.9);
	const cx = Math.cos(0.16);
	const sx = Math.sin(0.16);
	for (let i = 0; i < 2200; i++) {
		const u = (i / 2200) * Math.PI * 2;
		const w = 2 + Math.cos(3 * u);
		const px = (w * Math.cos(2 * u)) / 2.75 + (hash(i, 1) - 0.5) * 0.06;
		const py = Math.sin(3 * u) / 1.85 + (hash(i, 2) - 0.5) * 0.06;
		const pz = (w * Math.sin(2 * u)) / 2.75;
		const x1 = px * cy + pz * sy;
		const z1 = -px * sy + pz * cy;
		const y2 = py * cx - z1 * sx;
		const z2 = py * sx + z1 * cx;
		const c = Math.min(1, Math.max(0, (z2 + 1.1) / 2.2));
		const dt = c * c * (3 - 2 * c);
		dots += `<circle cx="${(CX + x1 * K).toFixed(1)}" cy="${(CY + y2 * K).toFixed(1)}" r="${(1 + 1.1 * dt).toFixed(2)}" fill="${INK}" opacity="${(0.16 + 0.5 * dt).toFixed(2)}"/>`;
	}
	return dots;
}

export interface OgCard {
	title: string;
	/** small line above the title: the section, or the post's date */
	kicker?: string;
}

export async function renderOg({ title, kicker }: OgCard): Promise<Buffer> {
	const f = await fonts();
	const PAD = 96;
	const MAX = OG_W - PAD - 400;
	const size = title.length > 40 ? 66 : 82;
	const lines = wrap(f.display, title.split(/\s+/), size, MAX).slice(0, 4);

	const blockH = lines.length * size * 1.15;
	let y = OG_H / 2 - blockH / 2 + size * 0.8;
	let body = "";
	if (kicker) {
		body += `<path d="${textPath(f.text, kicker, PAD + 2, y - size * 1.05, 24)}" fill="${DIM}"/>`;
	}
	for (const line of lines) {
		body += `<path d="${textPath(f.display, line, PAD, y, size)}" fill="${INK}"/>`;
		y += size * 1.15;
	}
	body += `<path d="${textPath(f.text, "crs.so", PAD + 2, OG_H - PAD + 20, 27)}" fill="${DIM}"/>`;

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}"><rect width="${OG_W}" height="${OG_H}" fill="${PAPER}"/>${ornament()}${body}</svg>`;
	return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
