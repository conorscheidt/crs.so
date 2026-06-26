/**
 * "Paper-pastel" Shiki themes: the static-highlighting twin of the CodeMirror
 * playground theme (shared/scripts/playground/theme.ts). Same eight semantic
 * colours as the `--cm-*` CSS vars in global.css, hard-coded per light/dark so
 * Shiki (which can't read CSS vars) matches the live editor exactly. Wired as a
 * dual theme in each app's astro.config (`shikiConfig.themes`, defaultColor:false)
 * → spans carry `--shiki-light`/`--shiki-dark`; prose.css picks per data-theme.
 */

import type { ThemeRegistrationRaw } from "shiki";

interface Palette {
	bg: string;
	comment: string;
	keyword: string;
	number: string;
	string: string;
	type: string;
	func: string;
	variable: string;
	punct: string;
}

// mirrors the `--cm-*` values in shared/global.css
const LIGHT: Palette = {
	bg: "#f4f1e7", // --color-paper-2
	comment: "#9b9684",
	keyword: "#8a2a22",
	number: "#9a6a1c",
	string: "#4f7a3f",
	type: "#2f6b6b",
	func: "#3a5a8a",
	variable: "#36352f",
	punct: "#6c6a60",
};

const DARK: Palette = {
	bg: "#151419", // --color-paper-2 (dark)
	comment: "#6f6a5f",
	keyword: "#df9a78",
	number: "#e3b878",
	string: "#9ec891",
	type: "#8fc6c2",
	func: "#a3b6e6",
	variable: "#d2ccbe",
	punct: "#918c81",
};

function build(name: string, type: "light" | "dark", c: Palette): ThemeRegistrationRaw {
	return {
		name,
		type,
		colors: { "editor.background": c.bg, "editor.foreground": c.variable },
		fg: c.variable,
		bg: c.bg,
		settings: [
			{ scope: ["comment", "punctuation.definition.comment"], settings: { foreground: c.comment, fontStyle: "italic" } },
			{
				scope: ["keyword", "storage.modifier", "keyword.control", "keyword.operator.new", "keyword.operator.expression", "storage.type.function.arrow"],
				settings: { foreground: c.keyword },
			},
			{ scope: ["constant.numeric", "constant.language.boolean", "constant.language", "constant.character.escape"], settings: { foreground: c.number } },
			{ scope: ["string", "string.quoted", "string.template", "constant.character", "punctuation.definition.string"], settings: { foreground: c.string } },
			{
				scope: ["entity.name.type", "entity.name.class", "support.type", "support.class", "storage.type", "entity.name.namespace", "entity.other.inherited-class"],
				settings: { foreground: c.type, fontStyle: "italic" },
			},
			{ scope: ["entity.name.function", "support.function", "meta.function-call.generic", "entity.name.function.preprocessor"], settings: { foreground: c.func } },
			{
				scope: ["variable", "variable.other", "entity.name.variable", "support.variable", "meta.definition.variable", "variable.parameter", "meta.object-literal.key"],
				settings: { foreground: c.variable },
			},
			{ scope: ["punctuation", "keyword.operator", "meta.brace", "punctuation.separator", "punctuation.terminator", "punctuation.accessor"], settings: { foreground: c.punct } },
		],
	};
}

export const paperShikiLight = build("paper-pastel-light", "light", LIGHT);
export const paperShikiDark = build("paper-pastel-dark", "dark", DARK);
