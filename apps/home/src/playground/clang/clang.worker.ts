/// <reference lib="webworker" />
/**
 * C/C++ compile worker running ClangDriver off the main thread. The binaries
 * are gzipped static assets under /clang: fetched through the Cache API,
 * decoded with DecompressionStream and streamed into
 * WebAssembly.compileStreaming, so decode and compile overlap.
 */
import { Downloads } from "../progress";
import { ClangDriver } from "./driver";

// The bundler doesn't hash these assets, so the version lives in the
// directory name and they can be served immutable. Bump both on any toolchain
// change, along with the sizes below.
const BASE = (import.meta.env.PUBLIC_CLANG_BASE_URL as string | undefined) || "/clang/v1";
const CACHE = "crsche-clang-v1";

// neutral .bin so no server applies Content-Encoding (which would make the
// browser pre-decompress our gzip layer); we always decompress explicitly
const CLANG = `${BASE}/clang.bin`;
const LLD = `${BASE}/lld.bin`;
const MEMFS = `${BASE}/memfs.bin`;
const SYSROOT = `${BASE}/sysroot.bin`;

// Gzipped bytes, for progress when a response has no Content-Length.
const SIZES: Record<string, number> = {
	[CLANG]: 10_529_117,
	[LLD]: 6_712_815,
	[MEMFS]: 18_848,
	[SYSROOT]: 1_814_583,
};

// ── compiled-module cache ─────────────────────────────────────────────
// The Cache API keeps the gzipped bytes; IndexedDB keeps the compiled
// WebAssembly.Module, so repeat visits skip recompiling the ~30 MB clang.wasm.
const MOD_DB = "crsche-clang-mods";
const MOD_STORE = "modules";

function openModDb(): Promise<IDBDatabase> {
	return new Promise((res, rej) => {
		const r = indexedDB.open(MOD_DB, 1);
		r.onupgradeneeded = () => r.result.createObjectStore(MOD_STORE);
		r.onsuccess = () => res(r.result);
		r.onerror = () => rej(r.error);
	});
}

async function modGet(key: string): Promise<WebAssembly.Module | null> {
	try {
		const db = await openModDb();
		return await new Promise((res) => {
			const rq = db.transaction(MOD_STORE, "readonly").objectStore(MOD_STORE).get(key);
			rq.onsuccess = () => res((rq.result as WebAssembly.Module) ?? null);
			rq.onerror = () => res(null);
		});
	} catch {
		return null; // private mode / no IDB → fall back to recompile
	}
}

async function modPut(key: string, mod: WebAssembly.Module): Promise<void> {
	try {
		const db = await openModDb();
		await new Promise<void>((res) => {
			const tx = db.transaction(MOD_STORE, "readwrite");
			tx.objectStore(MOD_STORE).put(mod, key);
			tx.oncomplete = () => res();
			tx.onerror = () => res();
		});
	} catch {
		/* best-effort */
	}
}

// ── download progress ─────────────────────────────────────────────────
// Network bytes are counted as the body streams; a run that is waiting on them
// hears about it, throttled.
const downloads = new Downloads();
let watching: number | null = null;
let reported = 0;

function report(): void {
	if (watching === null) return;
	const now = performance.now();
	if (downloads.active && now - reported < 80) return;
	reported = now;
	globalThis.postMessage({ id: watching, fetch: [downloads.loaded, downloads.total] });
}

function counted(resp: Response, url: string): Response {
	const body = resp.body;
	if (!body) return resp;
	downloads.begin(url, Number(resp.headers.get("content-length")) || SIZES[url] || 0);
	report();
	const reader = body.getReader();
	const stream = new ReadableStream<Uint8Array>({
		async pull(ctl) {
			try {
				const { done, value } = await reader.read();
				if (done) {
					downloads.end(url);
					report();
					ctl.close();
					return;
				}
				downloads.add(url, value.byteLength);
				report();
				ctl.enqueue(value);
			} catch (err) {
				downloads.end(url);
				ctl.error(err);
			}
		},
		cancel(reason) {
			downloads.end(url);
			return reader.cancel(reason);
		},
	});
	return new Response(stream, {
		status: resp.status,
		statusText: resp.statusText,
		headers: resp.headers,
	});
}

async function cachedResponse(url: string): Promise<Response> {
	let cache: Cache | null = null;
	try {
		cache = await caches.open(CACHE);
		const hit = await cache.match(url);
		if (hit) return hit;
	} catch {
		cache = null; // private mode / no CacheStorage → still works, just no persist
	}
	const resp = await fetch(url);
	if (!resp.ok) return resp;
	const live = counted(resp, url);
	// The cache reads its own branch of the body, so decoding starts with the
	// first bytes instead of after the whole file has been stored.
	if (cache) void cache.put(url, live.clone()).catch(() => {});
	return live;
}

function gunzip(resp: Response): ReadableStream<Uint8Array> {
	const body = resp.body;
	if (!body) throw new Error("empty response body");
	return body.pipeThrough(new DecompressionStream("gzip"));
}

// One compile per module, shared by the prefetch and the driver.
const modules = new Map<string, Promise<WebAssembly.Module>>();

function compileStreaming(url: string): Promise<WebAssembly.Module> {
	let mod = modules.get(url);
	if (!mod) {
		mod = compileFresh(url);
		modules.set(url, mod);
		mod.catch(() => modules.delete(url));
	}
	return mod;
}

async function compileFresh(url: string): Promise<WebAssembly.Module> {
	const key = `${CACHE}:${url}`; // version-scoped → bumping CACHE busts stale modules
	const cached = await modGet(key);
	if (cached) return cached;
	const resp = await cachedResponse(url);
	const mod = await WebAssembly.compileStreaming(
		new Response(gunzip(resp), { headers: { "content-type": "application/wasm" } }),
	);
	void modPut(key, mod); // fire-and-forget persist
	return mod;
}

async function readBuffer(url: string): Promise<ArrayBuffer> {
	const resp = await cachedResponse(url);
	return new Response(gunzip(resp)).arrayBuffer();
}

let driver: ClangDriver | null = null;
let currentWrite: (s: string) => void = () => {};

function ensureDriver(): ClangDriver {
	if (driver) return driver;
	driver = new ClangDriver({
		compileStreaming,
		readBuffer,
		hostWrite: (s) => currentWrite(s),
		clangUrl: CLANG,
		lldUrl: LLD,
		memfsUrl: MEMFS,
		sysrootUrl: SYSROOT,
	});
	return driver;
}

interface Req {
	id: number;
	src?: string;
	cpp?: boolean;
	warm?: boolean;
	stdin?: string;
	/** terminal stdin channel: Int32Array ctl [flag, len] at 0, bytes at 8.
	 *  flag 0 = waiting · 1 = line ready · 2 = EOF */
	stdinSab?: SharedArrayBuffer;
}

// The driver, its MemFS and the hostWrite hook are shared, so concurrent
// requests would interleave at the awaits and corrupt each other. Run one at a
// time.
let queue: Promise<void> = Promise.resolve();

globalThis.onmessage = (e: MessageEvent<Req>): void => {
	queue = queue.then(() => handle(e.data));
};

async function handle({ id, src, cpp, warm, stdin, stdinSab }: Req): Promise<void> {
	const t0 = performance.now();

	if (warm) {
		try {
			await ensureDriver().whenReady();
		} catch {
			/* warm is best-effort */
		}
		globalThis.postMessage({ id, warmed: true });
		return;
	}

	// Runs queue behind each other (including one waiting on stdin), so the page
	// starts its timeout from here rather than from when it asked.
	globalThis.postMessage({ id, started: true });

	// stdout and compile diagnostics stream to the page as they're written; the
	// final message carries only the status.
	currentWrite = (s) => globalThis.postMessage({ id, out: s });
	let ok = true;
	let errMsg = "";
	let waited = 0; // time spent blocked on the reader, left out of the reported time
	watching = id;
	if (downloads.active) report();
	try {
		const d = ensureDriver();
		// The driver would fetch lld only after clang has run; asking for both
		// now overlaps the downloads and gives the progress line its full total.
		for (const url of [CLANG, LLD]) void compileStreaming(url).catch(() => {});
		d.setStdin(stdin ?? "");
		if (stdinSab) {
			const ctl = new Int32Array(stdinSab, 0, 2);
			const data = new Uint8Array(stdinSab, 8);
			const decoder = new TextDecoder();
			d.setStdinWaiter(() => {
				Atomics.store(ctl, 0, 0);
				globalThis.postMessage({ id, stdinReq: true });
				const w0 = performance.now();
				Atomics.wait(ctl, 0, 0);
				waited += performance.now() - w0;
				if (Atomics.load(ctl, 0) === 2) return null;
				return decoder.decode(data.slice(0, Atomics.load(ctl, 1)));
			});
		} else {
			d.setStdinWaiter(null);
		}
		await d.compileLinkRun(src ?? "", cpp === true);
	} catch (err) {
		ok = false;
		errMsg = err instanceof Error ? err.message : String(err);
	}
	watching = null;
	currentWrite = () => {};
	ensureDriver().setStdinWaiter(null);

	const ms = Math.round(performance.now() - t0 - waited);
	globalThis.postMessage({
		id,
		stdout: "",
		// stdout already streamed; the tail carries status (and the error, if any)
		stderr: ok ? "" : errMsg,
		ok,
		ms,
	});
}
