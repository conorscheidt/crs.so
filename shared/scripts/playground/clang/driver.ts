/**
 * Lean in-browser C/C++ driver: a TypeScript port of the WASI + memfs +
 * compile→link→run core of binji/wasm-clang (Apache-2.0). Stripped of the canvas
 * API, 6502/d8 paths, and timing logs. Runs clang -cc1 + wasm-ld + the program
 * entirely inside whatever thread it's constructed on (we use a Worker).
 *
 * Provide `compileStreaming(url) → Promise<Module>` and `readBuffer(url) →
 * Promise<ArrayBuffer>` (these own decompression + caching) plus `hostWrite(str)`.
 */

const ESUCCESS = 0;

class ProcExit extends Error {
	constructor(public code: number) {
		super(`process exited with code ${code}.`);
	}
}
class NotImplemented extends Error {
	constructor(mod: string, field: string) {
		super(`${mod}.${field} not implemented.`);
	}
}
class AbortError extends Error {}
class AssertError extends Error {}

function assert(cond: unknown): asserts cond {
	if (!cond) throw new AssertError("assertion failed");
}

function readCStr(u8: Uint8Array, o: number, len = -1): string {
	let str = "";
	const end = len === -1 ? u8.length : o + len;
	for (let i = o; i < end && u8[i] !== 0; ++i) str += String.fromCharCode(u8[i]);
	return str;
}

// biome-ignore lint/suspicious/noExplicitAny: WASI methods are dispatched dynamically
function getImportObject(obj: any, names: string[]): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const name of names) result[name] = obj[name].bind(obj);
	return result;
}

class Memory {
	buffer: ArrayBuffer;
	u8: Uint8Array;
	u32: Uint32Array;
	constructor(public memory: WebAssembly.Memory) {
		this.buffer = memory.buffer;
		this.u8 = new Uint8Array(this.buffer);
		this.u32 = new Uint32Array(this.buffer);
	}
	check(): void {
		if (this.buffer.byteLength === 0) {
			this.buffer = this.memory.buffer;
			this.u8 = new Uint8Array(this.buffer);
			this.u32 = new Uint32Array(this.buffer);
		}
	}
	read32(o: number): number {
		return this.u32[o >> 2];
	}
	write32(o: number, v: number): void {
		this.u32[o >> 2] = v;
	}
	write64(o: number, lo: number, hi = 0): void {
		this.write32(o, lo);
		this.write32(o + 4, hi);
	}
	readStr(o: number, len: number): string {
		return readCStr(this.u8, o, len);
	}
	writeStr(o: number, str: string): number {
		o += this.write(o, str);
		this.u8[o] = 0;
		return str.length + 1;
	}
	write(o: number, buf: ArrayBuffer | string | Uint8Array | number[]): number {
		if (buf instanceof ArrayBuffer) return this.write(o, new Uint8Array(buf));
		if (typeof buf === "string")
			return this.write(
				o,
				Array.from(buf, (c) => c.charCodeAt(0)),
			);
		new Uint8Array(this.buffer, o, buf.length).set(buf);
		return buf.length;
	}
}

interface MemFSOpts {
	compileStreaming: (url: string) => Promise<WebAssembly.Module>;
	hostWrite: (s: string) => void;
	memfsFilename: string;
}

class MemFS {
	hostWrite: (s: string) => void;
	stdinStr = "";
	stdinStrPos = 0;
	/** Blocking refill for terminal-style stdin: returns more input, or null
	 *  for EOF. Runs on the worker thread (Atomics.wait), never the main one. */
	stdinWaiter: (() => string | null) | null = null;

	setStdin(text: string): void {
		this.stdinStr = text;
		this.stdinStrPos = 0;
	}
	hostMem_: Memory | null = null;
	// biome-ignore lint/suspicious/noExplicitAny: wasm exports are untyped
	exports!: any;
	mem!: Memory;
	ready: Promise<void>;

	constructor(opts: MemFSOpts) {
		this.hostWrite = opts.hostWrite;
		const env = getImportObject(this, [
			"abort",
			"host_write",
			"host_read",
			"memfs_log",
			"copy_in",
			"copy_out",
		]);
		this.ready = opts
			.compileStreaming(opts.memfsFilename)
			.then((mod) => WebAssembly.instantiate(mod, { env }))
			.then((instance) => {
				this.exports = instance.exports;
				this.mem = new Memory(this.exports.memory);
				this.exports.init();
			});
	}

	set hostMem(mem: Memory) {
		this.hostMem_ = mem;
	}

	addDirectory(path: string): void {
		this.mem.check();
		this.mem.write(this.exports.GetPathBuf(), path);
		this.exports.AddDirectoryNode(path.length);
	}
	addFile(path: string, contents: string | ArrayBuffer | Uint8Array): void {
		const length = contents instanceof ArrayBuffer ? contents.byteLength : contents.length;
		this.mem.check();
		this.mem.write(this.exports.GetPathBuf(), path);
		const inode = this.exports.AddFileNode(path.length, length);
		const addr = this.exports.GetFileNodeAddress(inode);
		this.mem.check();
		this.mem.write(addr, contents);
	}
	getFileContents(path: string): Uint8Array {
		this.mem.check();
		this.mem.write(this.exports.GetPathBuf(), path);
		const inode = this.exports.FindNode(path.length);
		const addr = this.exports.GetFileNodeAddress(inode);
		const size = this.exports.GetFileNodeSize(inode);
		return new Uint8Array(this.mem.buffer, addr, size);
	}

	abort(): never {
		throw new AbortError();
	}
	host_write(fd: number, iovs: number, iovs_len: number, nwritten_out: number): number {
		const m = this.hostMem_ as Memory;
		m.check();
		assert(fd <= 2);
		let size = 0;
		let str = "";
		for (let i = 0; i < iovs_len; ++i) {
			const buf = m.read32(iovs);
			iovs += 4;
			const len = m.read32(iovs);
			iovs += 4;
			str += m.readStr(buf, len);
			size += len;
		}
		m.write32(nwritten_out, size);
		this.hostWrite(str);
		return ESUCCESS;
	}
	host_read(fd: number, iovs: number, iovs_len: number, nread: number): number {
		const m = this.hostMem_ as Memory;
		m.check();
		assert(fd === 0);
		let size = 0;
		for (let i = 0; i < iovs_len; ++i) {
			const buf = m.read32(iovs);
			iovs += 4;
			const len = m.read32(iovs);
			iovs += 4;
			let n = Math.min(len, this.stdinStr.length - this.stdinStrPos);
			if (n === 0 && this.stdinWaiter) {
				// terminal semantics: the program blocks here until the reader
				// side delivers a line (or EOF)
				const more = this.stdinWaiter();
				if (more !== null) {
					this.stdinStr += more;
					n = Math.min(len, this.stdinStr.length - this.stdinStrPos);
				}
			}
			if (n === 0) break;
			m.write(buf, this.stdinStr.substr(this.stdinStrPos, n));
			size += n;
			this.stdinStrPos += n;
			if (n !== len) break;
		}
		m.write32(nread, size);
		return ESUCCESS;
	}
	memfs_log(buf: number, len: number): void {
		this.mem.check();
		console.log(this.mem.readStr(buf, len));
	}
	copy_out(clangDst: number, memfsSrc: number, size: number): void {
		const m = this.hostMem_ as Memory;
		m.check();
		const dst = new Uint8Array(m.buffer, clangDst, size);
		this.mem.check();
		dst.set(new Uint8Array(this.mem.buffer, memfsSrc, size));
	}
	copy_in(memfsDst: number, clangSrc: number, size: number): void {
		this.mem.check();
		const dst = new Uint8Array(this.mem.buffer, memfsDst, size);
		const m = this.hostMem_ as Memory;
		m.check();
		dst.set(new Uint8Array(m.buffer, clangSrc, size));
	}
}

// no canvas/env imports needed: we never link -lcanvas, so neither the tools nor
// the compiled program import from `env`. A Proxy guards any surprise import.
const EMPTY_ENV = new Proxy(
	{},
	{
		get: () => (): void => {
			throw new NotImplemented("env", "unexpected");
		},
	},
);

class App {
	argv: string[];
	environ = { USER: "alice" };
	// biome-ignore lint/suspicious/noExplicitAny: wasm instance exports
	exports!: any;
	mem!: Memory;
	ready: Promise<void>;

	constructor(
		module: WebAssembly.Module,
		private memfs: MemFS,
		name: string,
		...args: string[]
	) {
		this.argv = [name, ...args];
		const wasi = getImportObject(this, [
			"proc_exit",
			"environ_sizes_get",
			"environ_get",
			"args_sizes_get",
			"args_get",
			"random_get",
			"clock_time_get",
			"poll_oneoff",
		]);
		Object.assign(wasi, this.memfs.exports);
		this.ready = WebAssembly.instantiate(module, {
			wasi_unstable: wasi,
			wasi_snapshot_preview1: wasi,
			env: EMPTY_ENV,
		}).then((instance) => {
			this.exports = instance.exports;
			this.mem = new Memory(this.exports.memory);
			this.memfs.hostMem = this.mem;
		});
	}

	async run(): Promise<void> {
		await this.ready;
		try {
			this.exports._start();
		} catch (exn) {
			if (exn instanceof ProcExit) {
				if (exn.code === 0) return;
				throw exn;
			}
			throw exn;
		}
	}

	proc_exit(code: number): never {
		throw new ProcExit(code);
	}
	environ_sizes_get(countOut: number, bufSizeOut: number): number {
		this.mem.check();
		const names = Object.getOwnPropertyNames(this.environ) as (keyof typeof this.environ)[];
		let size = 0;
		for (const n of names) size += n.length + this.environ[n].length + 2;
		this.mem.write64(countOut, names.length);
		this.mem.write64(bufSizeOut, size);
		return ESUCCESS;
	}
	environ_get(ptrs: number, buf: number): number {
		this.mem.check();
		const names = Object.getOwnPropertyNames(this.environ) as (keyof typeof this.environ)[];
		for (const n of names) {
			this.mem.write32(ptrs, buf);
			ptrs += 4;
			buf += this.mem.writeStr(buf, `${n}=${this.environ[n]}`);
		}
		this.mem.write32(ptrs, 0);
		return ESUCCESS;
	}
	args_sizes_get(argcOut: number, bufSizeOut: number): number {
		this.mem.check();
		let size = 0;
		for (const a of this.argv) size += a.length + 1;
		this.mem.write64(argcOut, this.argv.length);
		this.mem.write64(bufSizeOut, size);
		return ESUCCESS;
	}
	args_get(ptrs: number, buf: number): number {
		this.mem.check();
		for (const a of this.argv) {
			this.mem.write32(ptrs, buf);
			ptrs += 4;
			buf += this.mem.writeStr(buf, a);
		}
		this.mem.write32(ptrs, 0);
		return ESUCCESS;
	}
	random_get(buf: number, len: number): number {
		const data = new Uint8Array(this.mem.buffer, buf, len);
		crypto.getRandomValues(data);
		return ESUCCESS;
	}
	clock_time_get(): never {
		throw new NotImplemented("wasi_unstable", "clock_time_get");
	}
	poll_oneoff(): never {
		throw new NotImplemented("wasi_unstable", "poll_oneoff");
	}
}

class Tar {
	u8: Uint8Array;
	offset = 0;
	constructor(buffer: ArrayBuffer) {
		this.u8 = new Uint8Array(buffer);
	}
	private readStr(len: number): string {
		const r = readCStr(this.u8, this.offset, len);
		this.offset += len;
		return r;
	}
	private readOctal(len: number): number {
		return parseInt(this.readStr(len), 8);
	}
	private alignUp(): void {
		this.offset = (this.offset + 511) & ~511;
	}
	untar(memfs: MemFS): void {
		while (this.offset + 512 <= this.u8.length) {
			const filename = this.readStr(100);
			this.readOctal(8); // mode
			this.readOctal(8); // owner
			this.readOctal(8); // group
			const size = this.readOctal(12);
			this.readOctal(12); // mtim
			this.readOctal(8); // checksum
			const type = this.readStr(1);
			this.readStr(100); // linkname
			if (this.readStr(8) !== "ustar  ") return;
			this.readStr(32 + 32 + 8 + 8 + 155); // owner/group/dev/prefix
			this.alignUp();
			if (type === "0") {
				const contents = this.u8.subarray(this.offset, this.offset + size);
				memfs.addFile(filename, contents);
				this.offset += size;
				this.alignUp();
			} else if (type === "5") {
				memfs.addDirectory(filename);
			}
		}
	}
}

export interface DriverOpts {
	compileStreaming: (url: string) => Promise<WebAssembly.Module>;
	readBuffer: (url: string) => Promise<ArrayBuffer>;
	hostWrite: (s: string) => void;
	clangUrl: string;
	lldUrl: string;
	memfsUrl: string;
	sysrootUrl: string;
}

export class ClangDriver {
	private moduleCache: Record<string, WebAssembly.Module> = {};
	private memfs: MemFS;

	setStdin(text: string): void {
		this.memfs.setStdin(text);
	}
	setStdinWaiter(waiter: (() => string | null) | null): void {
		this.memfs.stdinWaiter = waiter;
	}
	private ready: Promise<void>;
	private readonly common = [
		"-disable-free",
		"-isysroot",
		"/",
		"-internal-isystem",
		"/include/c++/v1",
		"-internal-isystem",
		"/include",
		"-internal-isystem",
		"/lib/clang/8.0.1/include",
		"-ferror-limit",
		"19",
		"-fmessage-length",
		"80",
		"-fno-color-diagnostics",
	];

	constructor(private opts: DriverOpts) {
		this.memfs = new MemFS({
			compileStreaming: opts.compileStreaming,
			hostWrite: opts.hostWrite,
			memfsFilename: opts.memfsUrl,
		});
		this.ready = this.memfs.ready.then(async () => {
			const tar = new Tar(await opts.readBuffer(opts.sysrootUrl));
			tar.untar(this.memfs);
		});
	}

	/** Resolve once the toolchain + sysroot are loaded (for warm-up). */
	whenReady(): Promise<void> {
		return this.ready;
	}

	private async getModule(url: string): Promise<WebAssembly.Module> {
		if (!this.moduleCache[url]) this.moduleCache[url] = await this.opts.compileStreaming(url);
		return this.moduleCache[url];
	}

	private async run(module: WebAssembly.Module, name: string, ...args: string[]): Promise<void> {
		await new App(module, this.memfs, name, ...args).run();
	}

	/** Compile, link, and run a snippet. Throws on non-zero exit / compile error. */
	async compileLinkRun(source: string, cpp: boolean): Promise<void> {
		await this.ready;
		const input = cpp ? "main.cc" : "main.c";
		const obj = "main.o";
		const wasm = "main.wasm";

		this.memfs.addFile(input, source);
		const clang = await this.getModule(this.opts.clangUrl);
		await this.run(
			clang,
			"clang",
			"-cc1",
			"-emit-obj",
			...this.common,
			"-O2",
			"-o",
			obj,
			"-x",
			cpp ? "c++" : "c",
			input,
		);

		const lld = await this.getModule(this.opts.lldUrl);
		const libdir = "lib/wasm32-wasi";
		const linkArgs = [
			"wasm-ld",
			"--no-threads",
			"--export-dynamic",
			"-z",
			"stack-size=1048576",
			`-L${libdir}`,
			`${libdir}/crt1.o`,
			obj,
			"-lc",
		];
		if (cpp) linkArgs.push("-lc++", "-lc++abi");
		linkArgs.push("-o", wasm);
		await this.run(lld, ...linkArgs);

		const out = this.memfs.getFileContents(wasm);
		const mod = await WebAssembly.compile(out.slice().buffer);
		await this.run(mod, wasm);
	}
}
