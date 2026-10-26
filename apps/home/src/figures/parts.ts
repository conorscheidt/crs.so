/**
 * Per-parameter emphasis inside a plate. An element tagged data-part="a b"
 * carries parameters a and b: the pointer over it reports them, and focusing a
 * parameter marks its elements .focus, which article.css eases in. Listeners
 * are delegated to the mount, so they survive a plate rebuilding its svg.
 */
export interface Parts {
	/** Mark the elements carrying any of `params`, and remember them for refresh. */
	focus: (params: readonly string[]) => void;
	/** Re-apply the current focus to elements drawn since. */
	refresh: () => void;
	destroy: () => void;
}

const carries = (el: Element, params: readonly string[]): boolean =>
	(el.getAttribute("data-part") ?? "").split(" ").some((p) => params.includes(p));

export function parts(mount: HTMLElement, report: (params: readonly string[]) => void): Parts {
	const ac = new AbortController();
	let current: readonly string[] = [];
	let hovered = "";
	const focus = (params: readonly string[]): void => {
		current = params;
		for (const el of mount.querySelectorAll("[data-part]"))
			el.classList.toggle("focus", carries(el, params));
	};
	const over = (target: EventTarget | null): void => {
		// a drag keeps its part while the pointer crosses others
		if (mount.querySelector("svg.dragging")) return;
		const key =
			(target instanceof Element ? target.closest("[data-part]") : null)?.getAttribute(
				"data-part",
			) ?? "";
		if (key === hovered) return;
		hovered = key;
		const params = key === "" ? [] : key.split(" ");
		focus(params);
		report(params);
	};
	mount.addEventListener("pointerover", (ev) => over(ev.target), { signal: ac.signal });
	mount.addEventListener("pointerleave", () => over(null), { signal: ac.signal });
	return {
		focus,
		refresh: () => focus(current),
		destroy: () => ac.abort(),
	};
}
