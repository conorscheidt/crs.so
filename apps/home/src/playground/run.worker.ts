/// <reference lib="webworker" />
/**
 * Runs the light languages off the main thread:
 *
 *   js / ts  in the worker, TypeScript stripped by sucrase
 *   wat      assembled by wabt, then WebAssembly.instantiate
 *
 * C and C++ have their own worker; see runner.ts.
 */

interface Req {
	id: number;
	lang: string;
	code: string;
	/** load wabt at idle so the first wat run doesn't wait on it */
	warm?: boolean;
}
interface Res {
	id: number;
	stdout: string;
	stderr: string;
	ok: boolean;
	ms: number;
}

function fmt(a: unknown): string {
	if (typeof a === "string") return a;
	try {
		return JSON.stringify(a);
	} catch {
		return String(a);
	}
}

function runJs(src: string): { stdout: string; stderr: string; ok: boolean } {
	const logs: string[] = [];
	// biome-ignore lint/suspicious/noConsole: the shim captures the snippet's console output
	const orig = console.log;
	// biome-ignore lint/suspicious/noExplicitAny: console shim
	console.log = (...a: any[]) => logs.push(a.map(fmt).join(" "));
	try {
		const fn = new Function(`"use strict";\n${src}`);
		const r = fn();
		if (logs.length === 0 && r !== undefined) logs.push(fmt(r));
		return { stdout: logs.join("\n"), stderr: "", ok: true };
	} catch (e) {
		return { stdout: logs.join("\n"), stderr: String(e), ok: false };
	} finally {
		console.log = orig;
	}
}

async function runTs(src: string): Promise<{ stdout: string; stderr: string; ok: boolean }> {
	const { transform } = await import("sucrase");
	const js = transform(src, { transforms: ["typescript"] }).code;
	return runJs(js);
}

let wabtPromise: Promise<unknown> | null = null;
async function runWat(src: string): Promise<{ stdout: string; stderr: string; ok: boolean }> {
	const mod = await import("wabt");
	if (!wabtPromise) wabtPromise = mod.default();
	// biome-ignore lint/suspicious/noExplicitAny: wabt has no bundled types here
	const wabt = (await wabtPromise) as any;
	const logs: string[] = [];
	try {
		const parsed = wabt.parseWat("snippet.wat", src);
		const { buffer } = parsed.toBinary({});
		const { instance } = await WebAssembly.instantiate(buffer, {
			env: {
				print: (x: number) => logs.push(String(x)),
				print_f64: (x: number) => logs.push(String(x)),
			},
		});
		const main = instance.exports.main as undefined | (() => unknown);
		if (typeof main === "function") {
			const r = main();
			if (logs.length === 0 && r !== undefined) logs.push(String(r));
		}
		return { stdout: logs.join("\n"), stderr: "", ok: true };
	} catch (e) {
		return { stdout: logs.join("\n"), stderr: String(e), ok: false };
	}
}

globalThis.onmessage = async (e: MessageEvent<Req>) => {
	const { id, lang, code, warm } = e.data;
	// load wabt now so the first wat run doesn't wait on the import
	if (warm) {
		try {
			const mod = await import("wabt");
			if (!wabtPromise) wabtPromise = mod.default();
			await wabtPromise;
		} catch {
			/* the real run will report it */
		}
		globalThis.postMessage({ id, warmed: true });
		return;
	}
	const t0 = performance.now();
	let r: { stdout: string; stderr: string; ok: boolean };
	try {
		switch (lang) {
			case "js":
			case "javascript":
				r = runJs(code);
				break;
			case "ts":
			case "typescript":
				r = await runTs(code);
				break;
			case "wat":
			case "wasm":
			case "asm":
				r = await runWat(code);
				break;
			default:
				r = { stdout: "", stderr: `no runner for "${lang}"`, ok: false };
		}
	} catch (err) {
		r = { stdout: "", stderr: String(err), ok: false };
	}
	const res: Res = { id, ...r, ms: Math.round(performance.now() - t0) };
	globalThis.postMessage(res);
};

export {};
