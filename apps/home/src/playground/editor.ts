/** Mount a CodeMirror 6 editor, editable or read-only. Runnable and static
 *  blocks both use it, so they render identically. */

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { cpp } from "@codemirror/lang-cpp";
import { javascript } from "@codemirror/lang-javascript";
import { rust } from "@codemirror/lang-rust";
import { StreamLanguage } from "@codemirror/language";
import { wast } from "@codemirror/legacy-modes/mode/wast";
import { EditorState, type Extension } from "@codemirror/state";
import { drawSelection, dropCursor, EditorView, keymap } from "@codemirror/view";
import { vim } from "@replit/codemirror-vim";
import { paperHighlightExt, paperTheme } from "./theme";

function langExt(lang: string): Extension[] {
	switch (lang) {
		case "c":
		case "cpp":
		case "c++":
			return [cpp()];
		case "js":
		case "javascript":
			return [javascript()];
		case "ts":
		case "typescript":
			return [javascript({ typescript: true })];
		case "rust":
			return [rust()];
		case "wat":
		case "wasm":
		case "asm":
			return [StreamLanguage.define(wast)];
		default:
			return [];
	}
}

export interface MountedEditor {
	getValue: () => string;
	destroy: () => void;
}

export function mountEditor(
	el: HTMLElement,
	opts: { code: string; lang: string; readOnly?: boolean; vim?: boolean },
): MountedEditor {
	const extensions: Extension[] = [];
	// vim must come first; on by default for editable blocks
	if (!opts.readOnly && opts.vim !== false) extensions.push(vim());
	extensions.push(
		history(),
		// draw selection and caret ourselves so the caret sits right over ligatures
		drawSelection(),
		dropCursor(),
		keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
		EditorView.lineWrapping,
		paperTheme,
		paperHighlightExt,
		...langExt(opts.lang),
	);
	if (opts.readOnly) {
		extensions.push(EditorState.readOnly.of(true), EditorView.editable.of(false));
	}
	const view = new EditorView({
		state: EditorState.create({ doc: opts.code, extensions }),
		parent: el,
	});
	return {
		getValue: () => view.state.doc.toString(),
		destroy: () => view.destroy(),
	};
}
