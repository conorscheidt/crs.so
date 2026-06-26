/**
 * WebGL2 fallback backend: black hole particles via transform feedback.
 *
 * TODO: port the WebGPU compute particle sim to a WebGL2 transform-feedback
 * pipeline. Until then, return null so the renderer uses the static fallback.
 */

import type { SigilBackend } from "./renderer";

export function createWebGL2Backend(_canvas: HTMLCanvasElement): SigilBackend | null {
	return null;
}
