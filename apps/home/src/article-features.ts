/**
 * Article features: the table of contents and running head, footnote hover
 * cards, marginal note placement, figure hydration and prose bindings, and the
 * code blocks. Loaded only on article pages.
 */
import { track } from "./analytics";
import type { FigureFactory, FigureImpl } from "./figures/registry";
import {
	activeSection,
	type Block,
	countWords,
	type HeadState,
	minutesLeft,
	stepHead,
	wordsLeft,
} from "./reading";

// Each figure (and d3 with it) is its own chunk, fetched only by pages that use it.
const FIGURES: Partial<Record<string, () => Promise<FigureFactory>>> = {
	oscillator: () => import("./figures/oscillator").then((m) => m.oscillator),
	geometry: () => import("./figures/geometry").then((m) => m.geometry),
	graph: () => import("./figures/graph").then((m) => m.graph),
	distribution: () => import("./figures/distribution").then((m) => m.distribution),
};

/** Scroll travel against the running head's state before it flips, px. */
const HEAD_SLACK = 12;

/**
 * Reading position: the rail's contents and progress fill, and on narrow
 * screens the running head (current section, minutes left, progress), all
 * from one set of cached offsets so scrolling never forces layout.
 */
export function initReading(): () => void {
	const prose = document.querySelector<HTMLElement>("[data-prose]");
	if (!prose) return () => {};
	const ac = new AbortController();
	const { signal } = ac;
	const narrow = matchMedia("(width < 900px)");
	// Both fills are scroll-driven animations in article.css; this is only for
	// browsers without scroll timelines.
	const timeline = CSS.supports("animation-timeline: scroll()");
	const railFill = timeline ? null : document.querySelector<HTMLElement>("[data-toc-progress]");
	const headFill = timeline ? null : document.querySelector<HTMLElement>("[data-rhead-progress]");

	const links = [...document.querySelectorAll<HTMLAnchorElement>("a[data-head]")];
	const heads = [...new Set(links.map((a) => a.dataset.head ?? ""))]
		.map((id) => document.getElementById(id))
		.filter((h): h is HTMLElement => h !== null);
	const names = heads.map(
		(h) => links.find((a) => a.dataset.head === h.id)?.textContent?.trim() ?? "",
	);

	const head = document.querySelector<HTMLElement>("[data-rhead]");
	const sec = head?.querySelector<HTMLElement>("[data-rhead-sec]");
	const left = head?.querySelector<HTMLElement>("[data-rhead-left]");
	const title = prose.querySelector<HTMLElement>(".ahead h1");
	const minutes = Number(head?.dataset.minutes ?? 0);
	// Counted before the code blocks mount, which would add their editors' text.
	const units = [...(prose.querySelector(".prose")?.children ?? [])]
		.filter((el) => !el.matches("[data-footnotes]"))
		.map((el) => ({ el, words: countWords(el.textContent ?? "") }));
	const total = units.reduce((n, u) => n + u.words, 0);

	let tops: number[] = [];
	let blocks: Block[] = [];
	let titleEnd = 0;
	let max = 0;
	let ticking = false;
	const schedule = (): void => {
		if (!ticking) {
			ticking = true;
			requestAnimationFrame(update);
		}
	};
	const measure = (): void => {
		tops = heads.map((h) => h.getBoundingClientRect().top + scrollY);
		max = document.documentElement.scrollHeight - innerHeight;
		if (head && narrow.matches) {
			titleEnd = title ? title.getBoundingClientRect().bottom + scrollY : 0;
			blocks = units.map(({ el, words }) => {
				const r = el.getBoundingClientRect();
				return { top: r.top + scrollY, height: r.height, words };
			});
		}
		schedule();
	};

	let current = -2;
	let headState: HeadState = { shown: false, pivot: 0 };
	let shown = false;
	const update = (): void => {
		ticking = false;
		const y = scrollY;
		const active = activeSection(tops, y + innerHeight * 0.33, y >= max - 4);
		if (active !== current) {
			current = active;
			// the rail marks the first section before it is reached
			const id = heads[Math.max(0, active)]?.id;
			for (const a of links) {
				const on = a.dataset.head === id;
				a.classList.toggle("on", on);
				if (on) a.setAttribute("aria-current", "true");
				else a.removeAttribute("aria-current");
			}
			if (sec) sec.textContent = names[active] ?? title?.textContent ?? "";
		}
		const p = max > 0 ? Math.min(1, Math.max(0, y / max)) : 1;
		if (railFill) railFill.style.transform = `scaleY(${p})`;
		if (!(head && narrow.matches)) return;
		if (headFill) headFill.style.transform = `scaleX(${p})`;

		// The line words count from slides down the viewport as the page
		// scrolls, so the last screenful is read by the time it can't scroll.
		const mins = minutesLeft(wordsLeft(blocks, y + innerHeight * p), total, minutes);
		const note = mins > 0 ? `· ${mins} min left` : "";
		if (left && left.textContent !== note) left.textContent = note;

		headState = stepHead(headState, y, {
			titleOut: y > titleEnd,
			nearEnd: max - y < innerHeight,
			threshold: HEAD_SLACK,
		});
		const show = headState.shown || head.querySelector(":focus-visible") !== null;
		if (show !== shown) {
			shown = show;
			head.classList.toggle("on", show);
			head.inert = !show;
		}
	};

	const ro = new ResizeObserver(measure);
	const page = document.querySelector(".apage");
	if (page) ro.observe(page);
	addEventListener("resize", measure, { passive: true, signal });
	narrow.addEventListener("change", measure, { signal });
	addEventListener("scroll", schedule, { passive: true, signal });
	measure();
	return () => {
		ac.abort();
		ro.disconnect();
	};
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

/** Note symbols, matching the `notemarks` @counter-style (doubles after six). */
const NOTE_SYMS = ["*", "†", "‡", "§", "‖", "¶"];
const noteSym = (i: number): string => (NOTE_SYMS[i % 6] ?? "*").repeat(Math.floor(i / 6) + 1);

export function initMarginals(): () => void {
	const rail = document.querySelector<HTMLElement>("[data-mrail]");
	const prose = document.querySelector<HTMLElement>("[data-prose]");
	if (!(rail && prose)) return () => {};
	const ros: ResizeObserver[] = [];
	const wide = matchMedia("(min-width: 1080px)").matches;
	const anchors = document.querySelectorAll<HTMLElement>("[data-manchor]");
	for (const [i, anchor] of anchors.entries()) {
		const note = anchor.querySelector<HTMLElement>("[data-mnote]");
		if (!note) continue;
		note.dataset.sym = noteSym(i);
		note.hidden = false;
		if (!wide) {
			// narrow screens: an inline aside right after the phrase
			note.classList.add("mnote-inline");
			continue;
		}
		rail.appendChild(note);
		const place = (): void => {
			note.style.top = `${anchor.getBoundingClientRect().top + scrollY - (prose.getBoundingClientRect().top + scrollY)}px`;
		};
		place();
		const ro = new ResizeObserver(place);
		ro.observe(prose);
		ros.push(ro);
		anchor.addEventListener("pointerenter", () => note.classList.add("lit"));
		anchor.addEventListener("pointerleave", () => note.classList.remove("lit"));
		note.addEventListener("pointerenter", () => anchor.classList.add("mlit"));
		note.addEventListener("pointerleave", () => anchor.classList.remove("mlit"));
	}
	return () => {
		for (const ro of ros) ro.disconnect();
	};
}

export function initFigures(): () => void {
	const impls: FigureImpl[] = [];
	let alive = true;
	const mountFigure = (
		root: HTMLElement,
		kind: string,
		mount: HTMLElement,
		factory: FigureFactory,
	): void => {
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
		mount.addEventListener("pointerdown", () => track("figure-touch", { kind }), { once: true });
		impls.push(impl);
	};
	for (const root of document.querySelectorAll<HTMLElement>("[data-fig-root]")) {
		const kind = root.dataset.kind ?? "";
		const mount = root.querySelector<HTMLElement>("[data-fig-mount]");
		const load = FIGURES[kind];
		if (!(mount && load)) continue;
		void load().then((factory) => {
			if (alive) mountFigure(root, kind, mount, factory);
		});
	}
	return () => {
		alive = false;
		for (const impl of impls) impl.destroy();
	};
}

/**
 * The code block machinery (CodeMirror, vim, language support) is heavy, so it
 * loads at idle as its own chunk and enhances the blocks in place.
 */
export function initCode(): () => void {
	const blocks = [...document.querySelectorAll<HTMLElement>("[data-code]")];
	if (blocks.length === 0) return () => {};
	let cancelled = false;
	const load = (): void => {
		void import("./article-code").then((m) => {
			if (!cancelled) m.initCodeBlocks(blocks);
		});
	};
	if ("requestIdleCallback" in globalThis) requestIdleCallback(load, { timeout: 2000 });
	else globalThis.setTimeout(load, 300);
	return () => {
		cancelled = true;
		// the chunk is a singleton; tear down whatever it mounted
		void import("./article-code").then((m) => m.destroyEditors());
	};
}

export function initArticleFeatures(): () => void {
	const cleanups = [initReading(), initMarginals(), initFigures(), initCode()];
	initFootnotes();
	return () => {
		for (const c of cleanups) c();
	};
}
