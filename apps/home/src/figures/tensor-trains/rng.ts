/** xoshiro128** with Box–Muller normals: seeded, so every live plate replays identically. */
export class Rng {
	private a: number;
	private b: number;
	private c: number;
	private d: number;
	private spare = Number.NaN;

	constructor(seed: number) {
		this.a = 0x9e_37_79_b9 ^ seed;
		this.b = 0x24_3f_6a_88 ^ Math.imul(seed, 7);
		this.c = 0xb7_e1_51_62;
		this.d = 0x12_34_56_78 ^ Math.imul(seed, 13);
		for (let i = 0; i < 16; i++) this.uniform();
	}

	uniform(): number {
		const r = Math.imul(rotl(Math.imul(this.b, 5), 7), 9);
		const t = this.b << 9;
		this.c ^= this.a;
		this.d ^= this.b;
		this.b ^= this.c;
		this.a ^= this.d;
		this.c ^= t;
		this.d = rotl(this.d, 11);
		return (r >>> 0) / 4_294_967_296;
	}

	normal(): number {
		if (!Number.isNaN(this.spare)) {
			const s = this.spare;
			this.spare = Number.NaN;
			return s;
		}
		const u = 1 - this.uniform();
		const v = this.uniform();
		const radius = Math.sqrt(-2 * Math.log(u));
		this.spare = radius * Math.sin(2 * Math.PI * v);
		return radius * Math.cos(2 * Math.PI * v);
	}
}

const rotl = (x: number, k: number): number => (x << k) | (x >>> (32 - k));
