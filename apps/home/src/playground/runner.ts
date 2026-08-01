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

export interface RunHooks {
	/** live stdout/diagnostic chunk (terminal semantics). Without this hook,
	 *  chunks accumulate and arrive in the final result's stdout. */
	onOut?: (s: string) => void;
	/** the program is blocked reading stdin: call the writer with a line
	 *  (newline appended) to resume it, or with null for EOF */
	onStdinReq?: (write: (line: string | null) => void) => void;
}

interface Pending {
	resolve: (r: RunResult) => void;
	hooks: RunHooks;
	buf: string;
	timer: ReturnType<typeof setTimeout> | undefined;
	armTimer: () => void;
	writeStdin: ((line: string | null) => void) | null;
}

let worker: Worker | null = null;
let cpp: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function onMessage(e: MessageEvent): void {
	const d = e.data as {
		id: number;
		warmed?: boolean;
		out?: string;
		stdinReq?: boolean;
	} & Partial<RunResult>;
	if (d?.warmed) return;
	const p = pending.get(d.id);
	if (!p) return;
	if (d.out !== undefined) {
		if (p.hooks.onOut) p.hooks.onOut(d.out);
		else p.buf += d.out;
		return;
	}
	if (d.stdinReq) {
		// the program is parked on Atomics.wait; pause the run timeout while
		// the user types
		globalThis.clearTimeout(p.timer);
		if (p.writeStdin && p.hooks.onStdinReq) p.hooks.onStdinReq(p.writeStdin);
		else p.writeStdin?.(null); // no UI to answer → EOF
		return;
	}
	pending.delete(d.id);
	globalThis.clearTimeout(p.timer);
	p.resolve({
		stdout: (d.stdout ?? "") || p.buf,
		stderr: d.stderr ?? "",
		ok: d.ok ?? false,
		ms: d.ms ?? 0,
	});
}

// a worker that dies (load error, OOM, crash) would otherwise leave every pending
// run spinning forever; fail them loudly and drop the dead worker so the next run
// re-spawns it.
function failAll(msg: string, dead: Worker): void {
	for (const [id, p] of pending) {
		pending.delete(id);
		globalThis.clearTimeout(p.timer);
		p.resolve({ stdout: p.buf, stderr: msg, ok: false, ms: 0 });
	}
	if (worker === dead) worker = null;
	if (cpp === dead) cpp = null;
}

function ensureWorker(): Worker {
	if (worker) return worker;
	const w = new Worker(new URL("./run.worker.ts", import.meta.url), { type: "module" });
	w.addEventListener("message", onMessage);
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
	w.addEventListener("message", onMessage);
	w.addEventListener("error", (e) => failAll(`clang worker error: ${e.message}`, w));
	cpp = w;
	return w;
}

// surface hangs: if a run never reports back, reject it with a message instead of
// spinning forever. C/C++ may legitimately take a while on the cold first compile.
const TIMEOUT_MS: Record<string, number> = { c: 120_000, cpp: 120_000, "c++": 120_000 };

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

/** Terminal-style stdin needs SharedArrayBuffer (COOP/COEP). Where the page
 *  is not cross-origin isolated, a blocked read sees EOF instead. */
export const interactiveStdin = (): boolean =>
	typeof SharedArrayBuffer !== "undefined" && globalThis.crossOriginIsolated === true;

export function run(
	lang: string,
	code: string,
	stdin = "",
	hooks: RunHooks = {},
): Promise<RunResult> {
	track("code-run", { lang });
	const id = ++seq;
	const isCpp = lang === "c" || lang === "cpp" || lang === "c++";
	const w = isCpp ? ensureCpp() : ensureWorker();
	return new Promise((resolve) => {
		let sab: SharedArrayBuffer | null = null;
		let writeStdin: Pending["writeStdin"] = null;
		if (isCpp && interactiveStdin()) {
			sab = new SharedArrayBuffer(8 + 8192);
			const ctl = new Int32Array(sab, 0, 2);
			const data = new Uint8Array(sab, 8);
			writeStdin = (line: string | null) => {
				const p = pending.get(id);
				p?.armTimer();
				if (line === null) {
					Atomics.store(ctl, 0, 2);
				} else {
					const bytes = new TextEncoder().encode(`${line}\n`).slice(0, 8192);
					data.set(bytes);
					Atomics.store(ctl, 1, bytes.length);
					Atomics.store(ctl, 0, 1);
				}
				Atomics.notify(ctl, 0);
			};
		}
		const limit = TIMEOUT_MS[lang] ?? 30_000;
		const entry: Pending = {
			resolve,
			hooks,
			buf: "",
			timer: undefined,
			armTimer: () => {
				globalThis.clearTimeout(entry.timer);
				entry.timer = globalThis.setTimeout(() => {
					if (pending.delete(id)) {
						resolve({
							stdout: entry.buf,
							stderr: "timed out — the run didn't report back. Try again, or reload the page.",
							ok: false,
							ms: limit,
						});
					}
				}, limit);
			},
			writeStdin,
		};
		entry.armTimer();
		pending.set(id, entry);
		w.postMessage(
			isCpp
				? { id, cpp: lang !== "c", src: code, stdin, stdinSab: sab ?? undefined }
				: { id, lang, code },
		);
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
