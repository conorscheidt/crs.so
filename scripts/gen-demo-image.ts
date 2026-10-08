/**
 * Renders src/assets/trefoil-plate.png, a still of the hub's trefoil in night
 * ink, so the kitchen-sink post exercises the real image pipeline.
 *
 *   bun scripts/gen-demo-image.ts
 */
import sharp from "sharp";

const W = 1600;
const H = 900;
const PAPER = "#171310";
const INK = "#e8e4d9";
const N = 5200;

const hash = (i: number, s: number): number => {
	const x = Math.sin(i * 127.1 + s * 311.7) * 43_758.5453;
	return x - Math.floor(x);
};

// same parametrisation as sim/shapes.ts, one frozen frame, weak perspective
const TAU = Math.PI * 2;
const YAW = 0.9;
const PITCH = 0.16;
const K = Math.min(W, H) * 0.34;

let dots = "";
for (let i = 0; i < N; i++) {
	const u = (i / N) * TAU;
	const w = 2 + Math.cos(3 * u);
	const px = (w * Math.cos(2 * u)) / 2.75 + (hash(i, 1) - 0.5) * 0.06;
	const py = Math.sin(3 * u) / 1.85 + (hash(i, 2) - 0.5) * 0.06;
	const pz = (w * Math.sin(2 * u)) / 2.75 + (hash(i, 3) - 0.5) * 0.06;

	const cy = Math.cos(YAW);
	const sy = Math.sin(YAW);
	const cx = Math.cos(PITCH);
	const sx = Math.sin(PITCH);
	const x1 = px * cy + pz * sy;
	const z1 = -px * sy + pz * cy;
	const y2 = py * cx - z1 * sx;
	const z2 = py * sx + z1 * cx;

	const persp = 4 / (4 - z2 * 0.55);
	const sxp = W / 2 + x1 * K * persp;
	const syp = H / 2 + y2 * K * persp;

	// depth shading, as in camera.ts shade()
	const c = Math.min(1, Math.max(0, (z2 + 1.1) / 2.2));
	const dt = c * c * (3 - 2 * c);
	const a = Math.min(0.95, 0.62 * (0.28 + 0.72 * dt) * 1.35);
	const r = 1.5 + 1.5 * dt;
	dots += `<circle cx="${sxp.toFixed(1)}" cy="${syp.toFixed(1)}" r="${r.toFixed(2)}" fill="${INK}" opacity="${a.toFixed(3)}"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${PAPER}"/>${dots}</svg>`;

await sharp(Buffer.from(svg))
	.png({ compressionLevel: 9 })
	.toFile("apps/home/src/assets/trefoil-plate.png");
// biome-ignore lint/suspicious/noConsole: CLI output
console.log(`wrote apps/home/src/assets/trefoil-plate.png (${W}×${H}, ${N} dots)`);
