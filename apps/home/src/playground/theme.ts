/** CodeMirror theme. Every colour is a --cm-* variable defined per theme in
 *  global.css, so editors follow the site's day/night toggle. */

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

const V = (name: string) => `var(${name})`;

export const paperTheme = EditorView.theme({
	"&": { color: V("--cm-var"), backgroundColor: "transparent", fontSize: "13px" },
	".cm-content": {
		fontFamily: "var(--font-mono)",
		fontFeatureSettings: '"calt" 1, "liga" 1',
		padding: "16px 18px",
		caretColor: V("--cm-caret"),
	},
	".cm-line": { padding: "0" },
	"&.cm-focused": { outline: "none" },
	".cm-cursor, .cm-dropCursor": { borderLeftColor: V("--cm-caret") },
	"&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
		backgroundColor: V("--cm-sel"),
	},
	// vim block cursor: site caret ink, never the plugin's default orange
	"& .cm-fat-cursor": {
		background: V("--cm-caret"),
		color: "var(--paper)",
		outline: "none",
	},
	"&:not(.cm-focused) .cm-fat-cursor": {
		background: "transparent",
		outline: `1px solid ${V("--cm-caret")}`,
		color: "inherit",
	},
	".cm-gutters": { display: "none" },
	".cm-scroller": { overflow: "auto", lineHeight: "1.65" },
	".cm-activeLine": { backgroundColor: "transparent" },
});

export const paperHighlight = HighlightStyle.define([
	{
		tag: [t.comment, t.lineComment, t.blockComment],
		color: V("--cm-comment"),
		fontStyle: "italic",
	},
	{
		tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword],
		color: V("--cm-keyword"),
		fontWeight: "600",
	},
	{ tag: [t.definitionKeyword, t.moduleKeyword], color: V("--cm-keyword"), fontWeight: "600" },
	{ tag: [t.number, t.bool, t.atom], color: V("--cm-number") },
	{ tag: [t.string, t.special(t.string), t.character], color: V("--cm-string") },
	{ tag: [t.typeName, t.className, t.namespace], color: V("--cm-type"), fontStyle: "italic" },
	{
		tag: [t.function(t.variableName), t.function(t.propertyName)],
		color: V("--cm-func"),
		fontWeight: "600",
	},
	{ tag: [t.variableName, t.propertyName, t.labelName], color: V("--cm-var") },
	{ tag: [t.operator, t.punctuation, t.separator, t.bracket], color: V("--cm-punct") },
	{ tag: [t.meta, t.processingInstruction], color: V("--cm-keyword") },
	{ tag: [t.emphasis], fontStyle: "italic" },
	{ tag: [t.strong], fontWeight: "700" },
]);

export const paperHighlightExt = syntaxHighlighting(paperHighlight);
