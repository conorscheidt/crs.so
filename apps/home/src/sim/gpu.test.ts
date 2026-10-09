import { expect, test } from "bun:test";

const read = (name: string): Promise<string> => Bun.file(new URL(name, import.meta.url)).text();

test("the vertex buffer layout matches the WGSL Mark struct", async () => {
	const wgsl = await read("./shader.wgsl");
	const gpu = await read("./gpu.ts");
	const body = wgsl.match(/struct Mark \{([^}]*)\}/)?.[1] ?? "";
	const fields = [...body.matchAll(/^\s*(\w+): (\w+),/gm)].map((m) => [m[1], m[2]]);
	expect(fields.length).toBeGreaterThan(0);
	for (const [, type] of fields) expect(type).toBe("vec2f");
	expect(Number(gpu.match(/const MARK_BYTES = (\d+);/)?.[1])).toBe(fields.length * 8);
	// Each attribute the vertex shader reads sits at its field's offset.
	const attrs = [...gpu.matchAll(/shaderLocation: (\d+), offset: (\d+)/g)].map((m) => [
		Number(m[1]),
		Number(m[2]),
	]);
	const vs = wgsl.slice(wgsl.indexOf("fn vs("), wgsl.indexOf(") -> VSOut"));
	const inputs = [...vs.matchAll(/@location\((\d+)\) (\w+): vec2f/g)].map((m) => [
		Number(m[1]),
		m[2],
	]);
	expect(inputs.length).toBe(attrs.length);
	for (const [loc, name] of inputs) {
		const at = fields.findIndex(([f]) => f === name);
		expect(at).toBeGreaterThanOrEqual(0);
		expect(attrs.find(([l]) => l === loc)?.[1]).toBe(at * 8);
	}
});

test("the uniform writes land on the WGSL U struct's fields", async () => {
	const wgsl = await read("./shader.wgsl");
	const gpu = await read("./gpu.ts");
	const body = wgsl.match(/struct U \{([^}]*)\}/)?.[1] ?? "";
	// Size and alignment (bytes) of each uniform type, per the WGSL layout rules.
	const layout: Record<string, [number, number]> = {
		f32: [4, 4],
		vec2f: [8, 8],
		vec2u: [8, 8],
		vec3f: [12, 16],
		vec4f: [16, 16],
		"array<vec4f, 2>": [32, 16],
	};
	const at = new Map<string, number>();
	let end = 0;
	for (const m of body.matchAll(/^\s*(\w+): ([\w<>, ]+),$/gm)) {
		const [size, align] = layout[m[2] as string] ?? [Number.NaN, 1];
		end = Math.ceil(end / align) * align;
		at.set(m[1] as string, end / 4);
		end += size;
	}
	expect(Math.ceil(end / 16) * 16).toBe(Number(gpu.match(/const FLOATS = (\d+);/)?.[1]) * 4);
	const snake = (s: string): string => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
	// resW, cursorX, inkR and the like are components of one vector field.
	const COMPONENT: Record<string, number> = {
		w: 0,
		h: 1,
		x: 0,
		y: 1,
		r: 0,
		g: 1,
		b: 2,
		lo: 0,
		hi: 1,
	};
	let matched = 0;
	for (const m of gpu.matchAll(/(?:buf|words)\[(\d+)\] = u\.([\w.]+);/g)) {
		const name = snake((m[2] as string).replace(".", "_"));
		const split = name.match(/^(\w+)_([a-z]+)$/);
		const [field, comp] = at.has(name)
			? [name, 0]
			: [split?.[1] ?? "", COMPONENT[split?.[2] ?? ""] ?? Number.NaN];
		if (!at.has(field)) continue;
		expect(Number(m[1])).toBe((at.get(field) as number) + comp);
		matched++;
	}
	expect(matched).toBeGreaterThan(20);
	expect(Number(gpu.match(/buf\.set\(u\.focus\.lats, (\d+)\)/)?.[1])).toBe(
		at.get("focus_lat") as number,
	);
});
