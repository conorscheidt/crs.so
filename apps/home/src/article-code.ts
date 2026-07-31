/**
 * The heavy half of the article code blocks — CodeMirror (+vim) and the
 * clang/wasm runner. Loaded at idle by article-features.initCode so article
 * text never waits on it.
 */
import { mountEditor } from "@shared/scripts/playground/editor";
import { RUNNABLE, run, warmCpp } from "@shared/scripts/playground/runner";

export function initCodeBlocks(blocks: HTMLElement[]): void {
	for (const blk of blocks) {
		const lang = blk.dataset.lang ?? "c";
		const src = blk.querySelector<HTMLElement>("[data-src]")?.textContent ?? "";
		const mount = blk.querySelector<HTMLElement>("[data-mount]");
		if (!mount) continue;
		const runnable = blk.dataset.runnable !== undefined && RUNNABLE.has(lang);
		const editor = mountEditor(mount, { code: src.trim(), lang, readOnly: !runnable, vim: true });

		if (!runnable) continue;
		const out = blk.querySelector<HTMLElement>("[data-out]");
		const outText = blk.querySelector<HTMLElement>("[data-outtext]");
		const stdinField = blk.querySelector<HTMLInputElement>("[data-stdin-field]");
		const runBtn = blk.querySelector<HTMLButtonElement>("[data-run]");
		let warmed = false;
		blk.addEventListener("pointerenter", () => {
			if (warmed) return;
			warmed = true;
			if (lang === "c" || lang === "cpp") warmCpp();
		});
		runBtn?.addEventListener("click", async () => {
			if (!(out && outText && runBtn)) return;
			out.hidden = false;
			runBtn.disabled = true;
			outText.textContent = "compiling…";
			const r = await run(lang, editor.getValue(), stdinField?.value ?? "");
			runBtn.disabled = false;
			const body = [r.stdout, r.stderr].filter(Boolean).join("\n");
			outText.textContent = `${body}\n[${r.ok ? "exit 0" : "error"} · ${r.ms} ms]`.trim();
		});
	}
}
