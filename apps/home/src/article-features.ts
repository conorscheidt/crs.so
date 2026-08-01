/**
 * Article feature runtime: live ToC + hairline progress, footnote hover
 * cards, marginal-note placement + hover sync, figure hydration + prose
 * bindings, and the editable/runnable code blocks (CodeMirror + vim, clang
 * worker, real stdio). Loaded only on article pages.
 */
import { distribution } from "./figures/distribution";
import { geometry } from "./figures/geometry";
import { graph } from "./figures/graph";
import { oscillator } from "./figures/oscillator";
import type { FigureImpl } from "./figures/registry";

const FIGURES = { oscillator, geometry, graph, distribution };

export function initToc(): void {
	const toc = document.querySelector<HTMLElement>("[data-toc]");
	const fill = document.querySelector<HTMLElement>("[data-toc-progress]");
	if (!toc) return;
	const links = [...toc.querySelectorAll<HTMLAnchorElement>("a[data-head]")];
	const heads = links
		.map((a) => document.getElementById(a.dataset.head ?? ""))
		.filter((h): h is HTMLElement => h !== null);
	let ticking = false;
	const update = (): void => {
		ticking = false;
		let active = 0;
		for (const [i, h] of heads.entries()) {
			if (h.getBoundingClientRect().top < innerHeight * 0.33) active = i;
		}
		// short last sections never cross the threshold — the page bottom wins
		if (scrollY + innerHeight >= document.documentElement.scrollHeight - 4) {
			active = heads.length - 1;
		}
		for (const [i, a] of links.entries()) {
			a.classList.toggle("on", i === active);
			if (i === active) a.setAttribute("aria-current", "true");
			else a.removeAttribute("aria-current");
		}
		if (fill) {
			const max = document.documentElement.scrollHeight - innerHeight;
			fill.style.transform = `scaleY(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
		}
	};
	addEventListener(
		"scroll",
		() => {
			if (!ticking) {
				ticking = true;
				requestAnimationFrame(update);
			}
		},
		{ passive: true },
	);
	update();
}

export function initFootnotes(): void {
	for (const ref of document.querySelectorAll<HTMLAnchorElement>("[data-footnote-ref]")) {
		const id = ref.getAttribute("href")?.slice(1);
		const note = id ? document.getElementById(id) : null;
		if (!note) continue;
		const card = document.createElement("span");
		card.className = "fncard";
		card.innerHTML = note.innerHTML;
		card.querySelector("[data-footnote-backref]")?.remove();
		ref.parentElement?.classList.add("fnref");
		ref.parentElement?.appendChild(card);
		const on = (): void => note.classList.add("lit");
		const off = (): void => note.classList.remove("lit");
		ref.parentElement?.addEventListener("pointerenter", on);
		ref.parentElement?.addEventListener("pointerleave", off);
	}
}

/** Classical note symbols — mirrors the `notemarks` @counter-style exactly
 *  (symbolic system: the sequence doubles after six — **, ††, …). */
const NOTE_SYMS = ["*", "†", "‡", "§", "‖", "¶"];
const noteSym = (i: number): string => (NOTE_SYMS[i % 6] ?? "*").repeat(Math.floor(i / 6) + 1);

export function initMarginals(): void {
	const rail = document.querySelector<HTMLElement>("[data-mrail]");
	const prose = document.querySelector<HTMLElement>("[data-prose]");
	if (!(rail && prose)) return;
	const wide = matchMedia("(min-width: 1080px)").matches;
	const anchors = document.querySelectorAll<HTMLElement>("[data-manchor]");
	for (const [i, anchor] of anchors.entries()) {
		const note = anchor.querySelector<HTMLElement>("[data-mnote]");
		if (!note) continue;
		note.dataset.sym = noteSym(i);
		note.hidden = false;
		if (!wide) {
			// narrow: quiet inline aside directly after the anchored phrase
			note.classList.add("mnote-inline");
			continue;
		}
		rail.appendChild(note);
		const place = (): void => {
			note.style.top = `${anchor.getBoundingClientRect().top + scrollY - (prose.getBoundingClientRect().top + scrollY)}px`;
		};
		place();
		new ResizeObserver(place).observe(prose);
		anchor.addEventListener("pointerenter", () => note.classList.add("lit"));
		anchor.addEventListener("pointerleave", () => note.classList.remove("lit"));
		note.addEventListener("pointerenter", () => anchor.classList.add("mlit"));
		note.addEventListener("pointerleave", () => anchor.classList.remove("mlit"));
	}
}

export function initFigures(): void {
	for (const root of document.querySelectorAll<HTMLElement>("[data-fig-root]")) {
		const kind = root.dataset.kind as keyof typeof FIGURES;
		const mount = root.querySelector<HTMLElement>("[data-fig-mount]");
		const factory = FIGURES[kind];
		if (!(mount && factory)) continue;
		const figId = root.dataset.figRoot ?? "";
		const binds = document.querySelectorAll<HTMLElement>(
			`[data-bind][data-fig="${figId}"], [class*="vbind-${figId}-"]`,
		);
		const impl: FigureImpl = factory(mount, {
			onParams(params) {
				for (const b of binds) {
					const v = params[b.dataset.bind ?? ""];
					if (v !== undefined) b.textContent = v.toFixed(2);
				}
			},
		});
		for (const b of binds) {
			b.addEventListener("pointerenter", () => impl.setLit(true));
			b.addEventListener("pointerleave", () => impl.setLit(false));
		}
		root.addEventListener("pointerenter", () => {
			for (const b of binds) b.classList.add("lit");
		});
		root.addEventListener("pointerleave", () => {
			for (const b of binds) b.classList.remove("lit");
		});
		root.querySelector("[data-fig-reset]")?.addEventListener("click", () => impl.reset());
	}
}

/**
 * Code blocks are the heavy dependency (CodeMirror + vim + languages): the
 * article text must paint instantly, so the editor machinery loads at idle
 * as its own chunk and enhances in place.
 */
export function initCode(): void {
	const blocks = [...document.querySelectorAll<HTMLElement>("[data-code]")];
	if (blocks.length === 0) return;
	const load = (): void => {
		void import("./article-code").then((m) => m.initCodeBlocks(blocks));
	};
	if ("requestIdleCallback" in globalThis) requestIdleCallback(load, { timeout: 2000 });
	else globalThis.setTimeout(load, 300);
}

export function initArticleFeatures(): void {
	initToc();
	initFootnotes();
	initMarginals();
	initFigures();
	initCode();
}
