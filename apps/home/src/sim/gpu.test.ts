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
