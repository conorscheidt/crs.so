# crs.so

Source for [crs.so](https://crs.so).

A static Astro site on Cloudflare Workers Static Assets, with a small Worker
for `/api/*`. The hub's centrepiece is a WebGPU point cloud (Canvas2D
fallback). Articles are MDX with live d3 figures and editable code blocks that
run JavaScript, TypeScript and WebAssembly text, and compile C and C++ with
clang and lld in a worker.

```sh
bun install
bun run dev      # http://127.0.0.1:4321
bun run check    # worker types, biome, astro check
bun test
bun run deploy   # build, then wrangler deploy
```
