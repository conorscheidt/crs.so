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

## License

The code is [MIT](LICENSE). The writing, the résumé and the images are
© Conor Scheidt, all rights reserved.

Fraunces, Spectral and JetBrains Mono are under the SIL Open Font License 1.1
([the Fraunces instance](apps/home/src/assets/fonts/OFL.txt) is committed
here). The in-browser toolchain ships clang and lld from LLVM (Apache-2.0 with
LLVM exceptions, [LICENSE.llvm](apps/home/public/clang/LICENSE.llvm)) and a
driver ported from binji/wasm-clang (Apache-2.0,
[LICENSE.binji](apps/home/public/clang/LICENSE.binji)).
