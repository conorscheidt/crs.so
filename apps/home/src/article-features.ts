/**
 * Article features: the table of contents, footnote hover cards, marginal note
 * placement, figure hydration and prose bindings, and the code blocks. Loaded
 * only on article pages.
 */
import { track } from "./analytics";
import type { FigureFactory, FigureImpl } from "./figures/registry";

// Each figure (and d3 with it) is its own chunk, fetched only by pages that use it.
const FIGURES: Partial<Record<string, () => Promise<FigureFactory>>> = {
	oscillator: () => import("./figures/oscillator").then((m) => m.oscillator),
	geometry: () => import("./figures/geometry").then((m) => m.geometry),
	graph: () => import("./figures/graph").then((m) => m.graph),
	distribution: () => import("./figures/distribution").then((m) => m.distribution),
};

export function initToc(): () => void {
	const toc = document.querySelector<HTMLElement>("[data-toc]");
	// The progress fill is a scroll-driven animation in article.css; this is
	// only for browsers without scroll timelines.
	const fill = CSS.supports("animation-timeline: scroll()")
		? null
		: document.querySelector<HTMLElement>("[data-toc-progress]");
	if (!toc) return () => {};
	const ac = new AbortController();
	const { signal } = ac;
	const links = [...toc.querySelectorAll<HTMLAnchorElement>("a[data-head]")];
	const heads = links
		.map((a) => document.getElementById(a.dataset.head ?? ""))
		.filter((h): h is HTMLElement => h !== null);

	// Heading offsets are cached so the scroll handler never forces layout.
	let tops: number[] = [];
	let max = 0;
	const measure = (): void => {
		tops = heads.map((h) => h.getBoundingClientRect().top + scrollY);
		max = document.documentElement.scrollHeight - innerHeight;
	};
	const page = document.querySelector(".apage");
	const ro = new ResizeObserver(measure);
	if (page) ro.observe(page);
	addEventListener("resize", measure, { passive: true, signal });

	let ticking = false;
	const update = (): void => {
		ticking = false;
		const line = scrollY + innerHeight * 0.33;
		let active = 0;
		for (const [i, top] of tops.entries()) {
			if (top < line) active = i;
		}
		// A short last section never crosses the line, so the page bottom wins.
		if (scrollY + innerHeight >= max + innerHeight - 4) active = heads.length - 1;
		for (const [i, a] of links.entries()) {
			a.classList.toggle("on", i === active);
			if (i === active) a.setAttribute("aria-current", "true");
			else a.removeAttribute("aria-current");
		}
		if (fill) fill.style.transform = `scaleY(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
	};
	addEventListener(
		"scroll",
		() => {
			if (!ticking) {
				ticking = true;
				requestAnimationFrame(update);
			}
		},
		{ passive: true, signal },
	);
	measure();
	update();
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
	const cleanups = [initToc(), initMarginals(), initFigures(), initCode()];
	initFootnotes();
	return () => {
		for (const c of cleanups) c();
	};
}
