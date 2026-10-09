/** Byte counts for the toolchain files coming over the network, and the line
 *  the terminal shows while a first run waits on them. */

export class Downloads {
	private readonly files = new Map<string, { loaded: number; total: number }>();

	/** `total` may be 0 when neither Content-Length nor a known size is at hand. */
	begin(url: string, total: number): void {
		this.files.set(url, { loaded: 0, total });
	}

	add(url: string, bytes: number): void {
		const f = this.files.get(url);
		if (!f) return;
		f.loaded += bytes;
		// a stale or missing length can't be allowed to cap the count
		f.total = Math.max(f.total, f.loaded);
	}

	/** The stream ended, finished or not: whatever arrived is all there is. */
	end(url: string): void {
		const f = this.files.get(url);
		if (f) f.total = f.loaded;
	}

	get loaded(): number {
		let n = 0;
		for (const f of this.files.values()) n += f.loaded;
		return n;
	}

	get total(): number {
		let n = 0;
		for (const f of this.files.values()) n += f.total;
		return n;
	}

	/** Something is still arriving. */
	get active(): boolean {
		for (const f of this.files.values()) if (f.loaded < f.total) return true;
		return false;
	}
}

const mb = (bytes: number): string => (bytes / 1e6).toFixed(1);

export function toolchainLine(loaded: number, total: number): string {
	return loaded < total ? `fetching toolchain ${mb(loaded)} / ${mb(total)} MB` : "compiling…";
}
