/** Blog index: client-side search, sort, and tag filtering. */

import { track } from "./analytics";
import { initSelect } from "./select";

function initBlogIndex(): void {
	const list = document.querySelector<HTMLElement>("[data-post-list]");
	if (!list || list.dataset.wired) return;
	list.dataset.wired = "true";

	const items = Array.from(list.querySelectorAll<HTMLElement>("[data-post]"));
	const search = document.querySelector<HTMLInputElement>("[data-search]");
	const sortRoot = document.querySelector<HTMLElement>("[data-sort]");
	const chips = Array.from(document.querySelectorAll<HTMLElement>("[data-tag-chip]"));
	const empty = list.querySelector<HTMLElement>("[data-empty]");

	let activeTag = "";
	let q = "";
	let sortMode = "new";

	// arriving from a post's tag link (/?tag=foo) pre-selects that filter
	const initialTag = new URLSearchParams(location.search).get("tag");
	if (initialTag && chips.some((c) => (c.dataset.tagChip ?? "") === initialTag)) {
		activeTag = initialTag;
	}

	const apply = (): void => {
		let visible = 0;
		for (const it of items) {
			const tags = (it.dataset.tags ?? "").split(",");
			const hay = `${it.dataset.title ?? ""} ${it.dataset.desc ?? ""} ${it.dataset.tags ?? ""}`;
			const show = (!q || hay.includes(q)) && (!activeTag || tags.includes(activeTag));
			it.classList.toggle("hidden", !show);
			if (show) visible++;
		}
		empty?.classList.toggle("hidden", visible > 0);

		const ordered = items.slice().sort((a, b) => {
			if (sortMode === "title") return (a.dataset.title ?? "").localeCompare(b.dataset.title ?? "");
			const da = Number(a.dataset.date);
			const db = Number(b.dataset.date);
			return sortMode === "old" ? da - db : db - da;
		});
		for (const it of ordered) list.appendChild(it);
		if (empty) list.insertBefore(empty, list.firstChild);

		for (const c of chips) c.classList.toggle("is-active", (c.dataset.tagChip ?? "") === activeTag);
	};

	search?.addEventListener("input", () => {
		q = search.value.trim().toLowerCase();
		apply();
	});
	if (sortRoot) {
		initSelect(sortRoot, (value) => {
			sortMode = value;
			apply();
		});
	}
	for (const c of chips) {
		c.addEventListener("click", (e) => {
			// post tags live inside the card link, so don't navigate
			e.preventDefault();
			e.stopPropagation();
			const t = c.dataset.tagChip ?? "";
			activeTag = t === activeTag ? "" : t;
			if (activeTag) track("tag-filter", { tag: activeTag });
			apply();
		});
	}

	apply();
}

initBlogIndex();
document.addEventListener("astro:page-load", initBlogIndex);
