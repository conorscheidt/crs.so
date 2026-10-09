/**
 * The heavy half of the code blocks: CodeMirror, vim and the runner, loaded at
 * idle by article-features. stdout streams into the output area and a blocking
 * stdin read waits on an inline prompt (SharedArrayBuffer + Atomics).
 */
import { mountEditor } from "./playground/editor";
import { toolchainLine } from "./playground/progress";
import { RUNNABLE, run, warmCpp, warmLight } from "./playground/runner";

const live: { destroy: () => void }[] = [];

/** Destroy every mounted editor (for same-document navigation). */
export function destroyEditors(): void {
	for (const e of live) e.destroy();
	live.length = 0;
}

export function initCodeBlocks(blocks: HTMLElement[]): void {
	for (const blk of blocks) {
		const lang = blk.dataset.lang ?? "c";
		const src = blk.querySelector<HTMLElement>("[data-src]")?.textContent ?? "";
		const mount = blk.querySelector<HTMLElement>("[data-mount]");
		if (!mount) continue;
		const runnable = blk.dataset.runnable !== undefined && RUNNABLE.has(lang);
		const editor = mountEditor(mount, { code: src.trim(), lang, readOnly: !runnable, vim: true });
		live.push(editor);

		if (!runnable) continue;
		const out = blk.querySelector<HTMLElement>("[data-out]");
		const outText = blk.querySelector<HTMLElement>("[data-outtext]");
		const runBtn = blk.querySelector<HTMLButtonElement>("[data-run]");
		let warmed = false;
		blk.addEventListener("pointerenter", () => {
			if (warmed) return;
			warmed = true;
			if (lang === "c" || lang === "cpp") warmCpp();
			else warmLight();
		});
		runBtn?.addEventListener("click", async () => {
			if (!(out && outText && runBtn)) return;
			out.hidden = false;
			runBtn.disabled = true;
			outText.textContent = "";
			let streamed = false;
			// a first C/C++ run waits on the toolchain; this line stands in until
			// the program says something
			let status: HTMLElement | null = null;
			const clearStatus = (): void => {
				status?.remove();
				status = null;
			};
			const append = (s: string): void => {
				clearStatus();
				streamed = true;
				outText.append(s);
			};
			const r = await run(lang, editor.getValue(), "", {
				onOut: append,
				onFetch(loaded, total) {
					if (streamed) return;
					if (!status) {
						status = document.createElement("span");
						status.className = "termstat";
						outText.append(status);
					}
					status.textContent = toolchainLine(loaded, total);
				},
				onStdinReq(write) {
					const row = document.createElement("span");
					row.className = "termin";
					const input = document.createElement("input");
					input.type = "text";
					input.spellcheck = false;
					input.setAttribute("aria-label", "program input");
					row.append(input);
					outText.append(row);
					input.focus();
					input.addEventListener("keydown", (ke) => {
						if (ke.key === "Enter") {
							const v = input.value;
							row.remove();
							append(`${v}\n`);
							write(v);
						} else if (ke.key === "d" && ke.ctrlKey) {
							ke.preventDefault();
							row.remove();
							write(null);
						}
					});
				},
			});
			runBtn.disabled = false;
			clearStatus();
			if (!streamed) {
				const body = [r.stdout, r.stderr].filter(Boolean).join("\n");
				if (body) outText.append(`${body}\n`);
			} else if (r.stderr) {
				const tail = outText.textContent?.endsWith("\n") || !outText.textContent ? "" : "\n";
				outText.append(`${tail}${r.stderr}\n`);
			}
			if (streamed && !(outText.textContent ?? "").endsWith("\n")) outText.append("\n");
			outText.append(`[${r.ok ? "exit 0" : "error"} · ${r.ms} ms]`);
		});
	}
}
