import type { Root, Text } from "mdast";
import { visit } from "unist-util-visit";

/**
 * Cross-ref shorthand for prose. `[[key]]term[[/]]` in MDX becomes
 * `<span class="xref" data-xref="key">term</span>`; hovering or focusing the term
 * lights up every figure part tagged `xref:"key"` (and vice-versa). Shorter than
 * `<Xref id="key">term</Xref>` for the common case.
 *
 * An optional gloss, `[[key|short definition]]term[[/]]`, adds `data-gloss`,
 * which the reading-aids layer shows as a distill-style hover card.
 */
const RE = /\[\[([\w-]+)(?:\|([^\]\n]+))?\]\]([\s\S]+?)\[\[\/\]\]/g;

export function remarkXref() {
	return (tree: Root): void => {
		visit(tree, "text", (node: Text, index, parent) => {
			if (!parent || index == null || !node.value.includes("[[")) return;
			const value = node.value;
			const parts: unknown[] = [];
			let last = 0;
			let m: RegExpExecArray | null;
			RE.lastIndex = 0;
			// biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
			while ((m = RE.exec(value))) {
				if (m.index > last) parts.push({ type: "text", value: value.slice(last, m.index) });
				const attributes: unknown[] = [
					{ type: "mdxJsxAttribute", name: "class", value: "xref" },
					{ type: "mdxJsxAttribute", name: "data-xref", value: m[1] },
					{ type: "mdxJsxAttribute", name: "tabindex", value: "0" },
					{ type: "mdxJsxAttribute", name: "role", value: "link" },
				];
				if (m[2]) {
					attributes.push({ type: "mdxJsxAttribute", name: "data-gloss", value: m[2].trim() });
				}
				parts.push({
					type: "mdxJsxTextElement",
					name: "span",
					attributes,
					children: [{ type: "text", value: m[3] }],
				});
				last = m.index + m[0].length;
			}
			if (!parts.length) return;
			if (last < value.length) parts.push({ type: "text", value: value.slice(last) });
			// biome-ignore lint/suspicious/noExplicitAny: mdast-mdx node shapes
			parent.children.splice(index, 1, ...(parts as any[]));
			return index + parts.length;
		});
	};
}
