/**
 * The mark: a C cut as an annulus. It is one filled even-odd path, so the
 * counter is a hole in it with no second shape painted on top, and nothing
 * can misregister at 16px.
 *
 * Geometry, in a 32-unit box:
 *   outer radius R, inner radius r  → stroke thickness R - r
 *   the aperture is a wedge of GAP degrees centred on the +x axis
 *   the terminals are radial cuts, so both ends are square to the stroke
 *
 *   bun scripts/gen-favicon.ts
 */
const PAPER = "#171310";
const INK = "#e8e4d9";

const R = 11.4; // outer radius
const r = 4.6; // inner radius, i.e. the transparent dot at the centre
const GAP = 66; // aperture, in degrees, centred on +x

const C = 16; // centre, both axes
const rad = (deg: number): number => (deg * Math.PI) / 180;
const pt = (radius: number, deg: number): string =>
	`${(C + Math.cos(rad(deg)) * radius).toFixed(4)} ${(C + Math.sin(rad(deg)) * radius).toFixed(4)}`;

// Sweep counter-clockwise from the lower lip of the gap, all the way round to
// the upper lip, then back along the inner radius. One closed subpath: the
// hole at the centre is the area the path doesn't enclose.
const a0 = GAP / 2; // lower lip
const a1 = 360 - GAP / 2; // upper lip
const large = a1 - a0 > 180 ? 1 : 0;

const d = [
	`M ${pt(R, a0)}`,
	`A ${R} ${R} 0 ${large} 1 ${pt(R, a1)}`, // outer arc, clockwise in SVG's y-down space
	`L ${pt(r, a1)}`, // radial cut across the terminal
	`A ${r} ${r} 0 ${large} 0 ${pt(r, a0)}`, // inner arc, back the other way
	"Z",
].join(" ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<rect width="32" height="32" rx="7" fill="${PAPER}"/>
<path d="${d}" fill="${INK}"/>
</svg>
`;

await Bun.write("apps/home/public/favicon.svg", svg);
// biome-ignore lint/suspicious/noConsole: CLI output
console.log(`wrote favicon.svg — R=${R} r=${r} gap=${GAP}°, ${svg.length} bytes`);
