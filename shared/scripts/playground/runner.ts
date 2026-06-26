/** Main-thread bridge: every language runs in a Web Worker so a compile/run never
 *  touches the main thread. Light langs (js/ts/wat) → run.worker; C/C++ → a
 *  dedicated clang.worker running our lean clang+lld driver off-main-thread. */

import { track } from "../analytics";

export interface RunResult {
	stdout: string;
	stderr: string;
	ok: boolean;
	ms: number;
}

let worker: Worker | null = null;
let cpp: Worker | null = null;
let seq = 0;
const pending = new Map<number, (r: RunResult) => void>();

function settle(d: RunResult & { id: number }): void {
	const resolve = pending.get(d.id);
	if (resolve) {
		pending.delete(d.id);
		resolve({ stdout: d.stdout, stderr: d.stderr, ok: d.ok, ms: d.ms });
	}
}

// a worker that dies (load error, OOM, crash) would otherwise leave every pending
// run spinning forever; fail them loudly and drop the dead worker so the next run
// re-spawns it.
function failAll(msg: string, dead: Worker): void {
	for (const [id, resolve] of pending) {
		pending.delete(id);
		resolve({ stdout: "", stderr: msg, ok: false, ms: 0 });
	}
	if (worker === dead) worker = null;
	if (cpp === dead) cpp = null;
}

function ensureWorker(): Worker {
	if (worker) return worker;
	const w = new Worker(new URL("./run.worker.ts", import.meta.url), { type: "module" });
	w.addEventListener("message", (e: MessageEvent) => {
		if (e.data?.warmed) return; // warm ack, no pending promise
		settle(e.data);
	});
	w.addEventListener("error", (e) => failAll(`worker error: ${e.message}`, w));
	worker = w;
	return w;
}

// dedicated C/C++ worker: our lean clang+lld driver runs here, off the main
// thread, so a compile leaves the page + WebGPU field responsive. Vite-bundled
// module worker; gzipped binaries stream in from the /clang static assets.
function ensureCpp(): Worker {
	if (cpp) return cpp;
	const w = new Worker(new URL("./clang/clang.worker.ts", import.meta.url), { type: "module" });
	w.addEventListener("message", (e: MessageEvent) => {
		if (e.data?.warmed) return; // warm ack, no pending promise
		settle(e.data);
	});
	w.addEventListener("error", (e) => failAll(`clang worker error: ${e.message}`, w));
	cpp = w;
	return w;
}

// surface hangs: if a run never reports back, reject it with a message instead of
// spinning forever. C/C++ may legitimately take a while on the cold first compile.
const TIMEOUT_MS: Record<string, number> = { c: 120000, cpp: 120000, "c++": 120000 };

/** Eagerly boot the clang toolchain in its worker (idle, after page load) so the
 *  first Run is near-instant. Fetches /tools once; the browser caches it hard. */
export function warmCpp(): void {
	ensureCpp().postMessage({ id: ++seq, warm: true });
}

/** Pre-load the light worker's wabt at idle so the first wat/wasm run is instant
 *  (no dynamic-import delay on the first click). Cheap; safe to call eagerly. */
export function warmLight(): void {
	ensureWorker().postMessage({ id: ++seq, warm: true });
}

export function run(lang: string, code: string): Promise<RunResult> {
	track("code-run", { lang });
	const id = ++seq;
	const isCpp = lang === "c" || lang === "cpp" || lang === "c++";
	const w = isCpp ? ensureCpp() : ensureWorker();
	return new Promise((resolve) => {
		const timer = window.setTimeout(() => {
			if (pending.delete(id)) {
				resolve({
					stdout: "",
					stderr: "timed out — the run didn't report back. Try again, or reload the page.",
					ok: false,
					ms: TIMEOUT_MS[lang] ?? 30000,
				});
			}
		}, TIMEOUT_MS[lang] ?? 30000);
		pending.set(id, (r) => {
			window.clearTimeout(timer);
			resolve(r);
		});
		w.postMessage(isCpp ? { id, cpp: lang !== "c", src: code } : { id, lang, code });
	});
}

/** Languages the worker can actually execute. */
export const RUNNABLE = new Set([
	"c",
	"cpp",
	"c++",
	"js",
	"javascript",
	"ts",
	"typescript",
	"wat",
	"wasm",
	"asm",
]);
