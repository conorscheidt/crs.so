/** Side-effect CSS imports from fontsource packages. */
declare module "@fontsource-variable/*";

/**
 * Build-only font toolkit (social cards + favicon). fontkit ships no types;
 * this declares only what we use: variable-axis instancing, shaping, and
 * outline paths.
 */
declare module "fontkit" {
	export interface FkPath {
		toSVG: () => string;
		transform: (a: number, b: number, c: number, d: number, e: number, f: number) => FkPath;
		readonly commands: { command: string; args: number[] }[];
	}
	export interface FkGlyph {
		readonly path: FkPath;
		readonly bbox: { minX: number; minY: number; maxX: number; maxY: number };
	}
	export interface FkRun {
		readonly glyphs: FkGlyph[];
		readonly positions: { xAdvance: number; yAdvance: number; xOffset: number; yOffset: number }[];
		readonly advanceWidth: number;
	}
	export interface Font {
		readonly unitsPerEm: number;
		readonly familyName: string;
		layout: (text: string) => FkRun;
		getVariation: (axes: Record<string, number>) => Font;
	}
	export function create(buffer: Buffer): Font;
	export function openSync(path: string): Font;
}

/** Build-only woff2 decoder (social cards + favicon); ships no types. */
declare module "wawoff2" {
	export function decompress(input: Uint8Array): Promise<Uint8Array>;
	export function compress(input: Uint8Array): Promise<Uint8Array>;
}

/** Vite raw-string imports for WGSL shader source. */
declare module "*.wgsl?raw" {
	const src: string;
	export default src;
}
