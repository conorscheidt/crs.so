/// <reference lib="webworker" />
/**
 * C/C++ compile worker. Vite-bundled module worker → runs the lean ClangDriver
 * entirely off the main thread. Binaries are gzipped static assets under /clang;
 * we fetch (Cache-API persisted), decode with the browser-native
 * DecompressionStream, and stream straight into WebAssembly.compileStreaming,
 * so no decoder ships and decode overlaps compile.
 */
import { ClangDriver } from "./driver";

// The toolchain path carries its own version: the binaries are not content-
// hashed by the bundler (they are static assets), so versioning the directory
// is what lets them be served `immutable` for a year. Bump both on any
// toolchain change: the new path misses cache, the old one ages out.
const BASE = (import.meta.env.PUBLIC_CLANG_BASE_URL as string | undefined) || "/clang/v1";
const CACHE = "crsche-clang-v1";

// ── compiled-module cache ──────────────────────────────────────────────────
// The Cache API persists the gzipped *bytes*; this persists the compiled
// WebAssembly.Module (structured-cloneable) in IndexedDB, so repeat visits skip
// the heavy ~30 MB clang.wasm recompile entirely → near-instant first Run.
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

async function cachedResponse(url: string): Promise<Response> {
	try {
		const cache = await caches.open(CACHE);
		const hit = await cache.match(url);
		if (hit) return hit;
		const resp = await fetch(url);
		if (resp.ok) await cache.put(url, resp.clone());
		return resp;
	} catch {
		return fetch(url); // private mode / no CacheStorage → still works, just no persist
	}
}

function gunzip(resp: Response): ReadableStream<Uint8Array> {
	const body = resp.body;
	if (!body) throw new Error("empty response body");
	return body.pipeThrough(new DecompressionStream("gzip"));
}

async function compileStreaming(url: string): Promise<WebAssembly.Module> {
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
		// neutral .bin so no server applies Content-Encoding (which would make the
		// browser pre-decompress our gzip layer); we always decompress explicitly
		clangUrl: `${BASE}/clang.bin`,
		lldUrl: `${BASE}/lld.bin`,
		memfsUrl: `${BASE}/memfs.bin`,
		sysrootUrl: `${BASE}/sysroot.bin`,
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

// One driver, one MemFS, one hostWrite hook: concurrent requests would
// interleave at the awaits and corrupt each other's state (observed: a C run
// exiting 1 while a C++ compile was in flight). Serialize strictly.
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

	// stdout streams to the page as the program writes it (terminal semantics);
	// the final message carries only status. Compile diagnostics stream too.
	currentWrite = (s) => globalThis.postMessage({ id, out: s });
	let ok = true;
	let errMsg = "";
	try {
		const d = ensureDriver();
		d.setStdin(stdin ?? "");
		if (stdinSab) {
			const ctl = new Int32Array(stdinSab, 0, 2);
			const data = new Uint8Array(stdinSab, 8);
			const decoder = new TextDecoder();
			d.setStdinWaiter(() => {
				Atomics.store(ctl, 0, 0);
				globalThis.postMessage({ id, stdinReq: true });
				Atomics.wait(ctl, 0, 0);
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
	currentWrite = () => {};
	ensureDriver().setStdinWaiter(null);

	const ms = Math.round(performance.now() - t0);
	globalThis.postMessage({
		id,
		stdout: "",
		// stdout already streamed; the tail carries status (and the error, if any)
		stderr: ok ? "" : errMsg,
		ok,
		ms,
	});
}
