/**
 * Search for the Projects and Writing panels. Both share one index and filter
 * by kind. MiniSearch and the index load on first keystroke (and warm on
 * focus); until then a plain title/description/tag filter stands in.
 *
 * `#rust` is a tag: any number per query, and a result must carry all of them.
 * `@basalt` is a project, Writing only, at most one: a post belongs to a
 * single project, so a second `@` replaces the first. Both autocomplete and
 * become chips styled like what they filter.
 *
 * Backspace in an empty input deletes the last chip; ArrowLeft at the start
 * pops it back into the input, sigil and all. In Writing, date tokens become a
 * range chip after a space or Enter.
 */

import type MiniSearch from "minisearch";
import { track } from "../analytics";
import { invalidateTargets } from "../cursor";
import { type DateFilter, parseDates } from "./dates";
import { type IndexPayload, SEARCH_FIELDS, type SearchDoc } from "./options";

type Stored = Pick<SearchDoc, "title" | "kind" | "tags" | "project" | "ts" | "url">;
type Engine = { ms: MiniSearch<SearchDoc>; tags: Record<string, number> } & {
	projects: Record<string, number>;
};

let enginePromise: Promise<Engine | null> | null = null;

function warm(): NonNullable<typeof enginePromise> {
	enginePromise ??= (async () => {
		try {
			const [{ default: MS }, payload] = await Promise.all([
				import("minisearch"),
				fetch("/search-index.json").then((r) => r.json() as Promise<IndexPayload>),
			]);
			const ms = (await MS.loadJSONAsync(
				JSON.stringify(payload.index),
				SEARCH_FIELDS,
			)) as MiniSearch<SearchDoc>;
			return { ms, tags: payload.tags, projects: payload.projects ?? {} };
		} catch {
			return null;
		}
	})();
	return enginePromise;
}

export interface SearchHooks {
	/** called on keystrokes (weakly) and chip changes (more strongly) */
	pulse?: (strength: number) => void;
	/** removes every listener when the hub tears down */
	signal: AbortSignal;
}

export interface SearchHandle {
	/** filter by a tag from outside the panel (the Index panel's latest post) */
	addTag: (tag: string) => void;
	/** filter this panel by a project from outside it (a Projects entry) */
	addProject: (slug: string) => void;
}

/** `#` filters by tag, `@` by project. Nothing else is a sigil. */
type Sigil = "#" | "@";

export function initSearch(
	panel: HTMLElement,
	kind: "post" | "project",
	hooks: SearchHooks,
): SearchHandle {
	const noop: SearchHandle = { addTag: () => {}, addProject: () => {} };
	const input = panel.querySelector<HTMLInputElement>(".search input");
	const chipBox = panel.querySelector<HTMLElement>("[data-chips]");
	const list = panel.querySelector<HTMLElement>("[data-scroll]");
	if (!(input && chipBox && list)) return noop;

	// `@` only applies to posts
	const projects = kind === "post";
	const chips = new Set<string>();
	let projectChip: string | null = null;
	let dateChip: DateFilter | null = null;
	let engine: Engine | null = null;
	let debounceId = 0;

	const auto = document.createElement("div");
	auto.className = "autoc";
	auto.hidden = true;
	panel.querySelector(".search")?.appendChild(auto);
	let autoItems: string[] = [];
	let autoSigil: Sigil = "#";
	let autoSel = 0;

	const empty = document.createElement("p");
	empty.className = "noresults";
	empty.textContent = "nothing matches";
	empty.hidden = true;
	list.parentElement?.insertBefore(empty, list);

	/** Every value of one sigil present in this panel's DOM, sorted. */
	const domValues = (sigil: Sigil): string[] => {
		const set = new Set<string>();
		for (const e of list.querySelectorAll<HTMLElement>(".entry")) {
			if (sigil === "@") {
				if (e.dataset.project) set.add(e.dataset.project);
				continue;
			}
			for (const t of (e.dataset.tags ?? "").split(" ")) {
				if (t) set.add(t);
			}
		}
		return [...set].sort();
	};

	/** Index-backed counts for a sigil, or null before the engine has landed. */
	const counts = (sigil: Sigil): Record<string, number> | null => {
		if (!engine) return null;
		return sigil === "#" ? engine.tags : engine.projects;
	};

	const renderChips = (): void => {
		chipBox.textContent = "";
		const mk = (label: string, key: string, cls = ""): void => {
			const b = document.createElement("button");
			b.type = "button";
			b.className = cls ? `chip ${cls}` : "chip";
			b.dataset.chip = key;
			b.append(label);
			const x = document.createElement("i");
			x.textContent = "✕";
			x.setAttribute("aria-hidden", "true");
			b.appendChild(x);
			chipBox.appendChild(b);
		};
		for (const t of chips) mk(t, t);
		if (projectChip) mk(`@${projectChip}`, " project", "proj");
		if (dateChip) mk(dateChip.label, " date");
		invalidateTargets();
	};

	const matches = (entry: HTMLElement, allowed: Set<string> | null, term: string): boolean => {
		const tags = (entry.dataset.tags ?? "").split(" ");
		if (![...chips].every((t) => tags.includes(t))) return false;
		if (projectChip && entry.dataset.project !== projectChip) return false;
		if (dateChip) {
			const ts = Number(entry.dataset.ts ?? 0);
			if (ts < dateChip.from || ts > dateChip.to) return false;
		}
		if (allowed) return allowed.has(entry.dataset.id ?? "");
		if (!term) return true;
		return (entry.textContent ?? "").toLowerCase().includes(term.toLowerCase());
	};

	const apply = (): void => {
		const term = input.value.replace(/[#@]\S*/g, "").trim();
		let allowed: Set<string> | null = null;
		if (engine && term) {
			allowed = new Set(
				engine.ms
					.search(term, {
						prefix: true,
						fuzzy: (t) => (t.length > 3 ? 0.2 : false),
						boost: { title: 5, tags: 2 },
						combineWith: "AND",
						filter: (r) => (r as unknown as Stored).kind === kind,
					})
					.map((r) => String(r.id)),
			);
		}
		let any = false;
		let hits = 0;
		for (const entry of list.querySelectorAll<HTMLElement>(".entry")) {
			const ok = matches(entry, term ? allowed : null, term);
			entry.hidden = !ok;
			any ||= ok;
			if (ok) hits++;
		}
		empty.hidden = any;
		invalidateTargets();
		if (term.length > 2) track("search", { kind, len: term.length, hits });
	};

	const closeAuto = (): void => {
		auto.hidden = true;
		autoItems = [];
		invalidateTargets();
	};

	const openAuto = (sigil: Sigil, frag: string): void => {
		const n = counts(sigil);
		const all = n ? Object.keys(n).sort((a, b) => a.localeCompare(b)) : domValues(sigil);
		const taken = (v: string): boolean => (sigil === "#" ? chips.has(v) : projectChip === v);
		autoItems = all.filter((v) => !taken(v) && v.startsWith(frag.toLowerCase()));
		autoSigil = sigil;
		autoSel = 0;
		auto.textContent = "";
		if (autoItems.length === 0) {
			closeAuto();
			return;
		}
		autoItems.forEach((v, i) => {
			const b = document.createElement("button");
			b.type = "button";
			b.dataset.value = v;
			b.dataset.sigil = sigil;
			b.className = i === autoSel ? "on" : "";
			b.append(sigil === "@" ? `@${v}` : v);
			if (n) {
				const c = document.createElement("em");
				c.textContent = String(n[v] ?? 0);
				b.appendChild(c);
			}
			auto.appendChild(b);
		});
		auto.hidden = false;
		invalidateTargets();
	};

	/** Turn an autocomplete value into a chip. Every chip is created here. */
	const complete = (sigil: Sigil, value: string): void => {
		if (sigil === "#") chips.add(value);
		else projectChip = value; // at most one
		input.value = input.value.replace(/[#@]\S*$/, "").trimEnd();
		closeAuto();
		renderChips();
		apply();
		hooks.pulse?.(0.6);
		input.focus();
	};

	const onInput = (): void => {
		void warm().then((e) => {
			if (e && !engine) {
				engine = e;
				apply();
			}
		});
		const frag = input.value.match(/([#@])(\S*)$/);
		const sigil = frag?.[1] as Sigil | undefined;
		if (sigil && (sigil === "#" || projects)) openAuto(sigil, frag?.[2] ?? "");
		else closeAuto();
		// Writing only: completed date tokens chipify once a space follows.
		if (kind === "post" && /[\s]$/.test(input.value)) {
			const { term, date } = parseDates(input.value, new Date());
			if (date) {
				dateChip = date;
				input.value = term;
				renderChips();
			}
		}
		clearTimeout(debounceId);
		debounceId = globalThis.setTimeout(apply, 60) as unknown as number;
		hooks.pulse?.(0.3);
	};

	/** Newest chip first, the order backspace and ArrowLeft walk. */
	const lastChip = (): { sigil: Sigil; value: string } | null => {
		if (projectChip) return { sigil: "@", value: projectChip };
		const t = [...chips].at(-1);
		return t ? { sigil: "#", value: t } : null;
	};

	// deep link: /writing?tag=x, /writing?project=y (or the same on /projects)
	const params = new URLSearchParams(location.search);
	const panelPath = kind === "post" ? "/writing" : "/projects";
	if (location.pathname === panelPath) {
		const urlTag = params.get("tag");
		const urlProject = projects ? params.get("project") : null;
		if (urlTag) chips.add(urlTag);
		if (urlProject) projectChip = urlProject;
		if (urlTag || urlProject) {
			renderChips();
			apply();
		}
	}

	const onKeydown = (ev: KeyboardEvent): void => {
		if (!auto.hidden) {
			if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
				ev.preventDefault();
				autoSel =
					(autoSel + (ev.key === "ArrowDown" ? 1 : autoItems.length - 1)) % autoItems.length;
				for (const [i, b] of auto.querySelectorAll("button").entries())
					b.classList.toggle("on", i === autoSel);
				return;
			}
			if (ev.key === "Enter" || ev.key === "Tab") {
				ev.preventDefault();
				const v = autoItems[autoSel];
				if (v) complete(autoSigil, v);
				return;
			}
			if (ev.key === "Escape") {
				closeAuto();
				return;
			}
		}
		if (ev.key === "Enter" && kind === "post") {
			const { term, date } = parseDates(input.value, new Date());
			if (date) {
				dateChip = date;
				input.value = term;
				renderChips();
				apply();
			}
			return;
		}
		if (ev.key === "Backspace" && input.value === "") {
			if (dateChip) dateChip = null;
			else {
				const last = lastChip();
				if (!last) return;
				if (last.sigil === "@") projectChip = null;
				else chips.delete(last.value);
			}
			renderChips();
			apply();
			hooks.pulse?.(0.5);
			return;
		}
		if (ev.key === "ArrowLeft" && input.selectionStart === 0) {
			const last = lastChip();
			if (!last) return;
			if (last.sigil === "@") projectChip = null;
			else chips.delete(last.value);
			input.value = `${last.sigil}${last.value}${input.value}`;
			renderChips();
			openAuto(last.sigil, last.value);
			apply();
		}
	};

	// Tag/project buttons in entries + chip removal, scoped to this panel.
	const onClick = (ev: MouseEvent): void => {
		const el = ev.target as HTMLElement;
		const hit = el.closest<HTMLElement>(".autoc button");
		if (hit?.dataset.value) {
			complete((hit.dataset.sigil as Sigil) ?? "#", hit.dataset.value);
			return;
		}
		const tag = el.closest<HTMLElement>(".tag")?.dataset.tag;
		if (tag) {
			track("tag-filter", { tag });
			chips.add(tag);
			renderChips();
			apply();
			hooks.pulse?.(0.6);
			input.focus();
			return;
		}
		const chip = el.closest<HTMLElement>("[data-chip]")?.dataset.chip;
		if (chip) {
			if (chip === " date") dateChip = null;
			else if (chip === " project") projectChip = null;
			else chips.delete(chip);
			renderChips();
			apply();
			hooks.pulse?.(0.4);
		}
	};

	const { signal } = hooks;
	signal.addEventListener("abort", () => clearTimeout(debounceId));
	input.addEventListener("focus", () => void warm(), { once: true, signal });
	input.addEventListener("input", onInput, { signal });
	input.addEventListener("keydown", onKeydown, { signal });
	panel.addEventListener("click", onClick, { signal });
	document.addEventListener(
		"click",
		(ev) => {
			if (!(auto.hidden || auto.contains(ev.target as Node))) closeAuto();
		},
		{ signal },
	);

	return {
		addTag(tag: string): void {
			if (chips.has(tag)) return;
			chips.add(tag);
			renderChips();
			apply();
			hooks.pulse?.(0.6);
		},
		addProject(slug: string): void {
			if (!projects || projectChip === slug) return;
			projectChip = slug;
			renderChips();
			apply();
			hooks.pulse?.(0.6);
		},
	};
}
