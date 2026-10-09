/**
 * Article features: the table of contents and running head, footnote hover
 * cards, marginal note placement, figure hydration and prose bindings, and the
 * code blocks. Loaded only on article pages.
 */
import { track } from "./analytics";
import { Trail } from "./cursor";
import type { FigureFactory, FigureImpl } from "./figures/registry";
import {
	activeSection,
	type Block,
	countWords,
	dismissed,
	type HeadState,
	minutesLeft,
	stepHead,
	wordsLeft,
} from "./reading";
import { flick } from "./sim/flick";

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
	let jumpUntil = 0;
	document.addEventListener(
		"click",
		(ev) => {
			if ((ev.target as Element | null)?.closest?.('a[href^="#"]'))
				jumpUntil = performance.now() + 1200;
		},
		{ capture: true, signal },
	);
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

		// Count words from a line that moves down the viewport with progress, so
		// the last screenful counts as read when the page can't scroll further.
		const mins = minutesLeft(wordsLeft(blocks, y + innerHeight * p), total, minutes);
		const note = mins > 0 ? `· ${mins} min left` : "";
		if (left && left.textContent !== note) left.textContent = note;

		// An in-page jump keeps the head up through its glide, so the target lands
		// under it rather than under the gap it left.
		headState =
			performance.now() < jumpUntil
				? { shown: true, pivot: y }
				: stepHead(headState, y, {
						titleOut: y > titleEnd,
						nearEnd: max - y < innerHeight,
						threshold: HEAD_SLACK,
					});
		const show = headState.shown || head.querySelector(":focus-visible") !== null;
		if (show !== shown) {
			shown = show;
			head.classList.toggle("on", show);
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

// biome-ignore lint/security/noSecrets: a CSS attribute selector, not a secret
const IN_PAGE = 'a[href^="#"]';

/**
 * The bottom sheet for the contents (from the running head) and, on touch,
 * footnotes: a modal <dialog>, so focus is held inside it and the page behind
 * is inert. Every way out ends in close(), and the CSS transitions carry the
 * slide.
 */
export function initSheet(): () => void {
	const sheet = document.querySelector<HTMLDialogElement>("[data-sheet]");
	const panel = sheet?.querySelector<HTMLElement>("[data-sheet-panel]");
	const scroll = sheet?.querySelector<HTMLElement>("[data-sheet-scroll]");
	const scrim = sheet?.querySelector<HTMLElement>("[data-sheet-scrim]");
	if (!(sheet && panel && scroll && scrim)) return () => {};
	const ac = new AbortController();
	const { signal } = ac;
	let opener: HTMLElement | null = null;

	const toc = sheet.querySelector<HTMLElement>("[data-sheet-toc]");
	const note = sheet.querySelector<HTMLElement>("[data-sheet-note]");
	const noteBody = sheet.querySelector<HTMLElement>("[data-sheet-notebody]");
	const noteLink = sheet.querySelector<HTMLAnchorElement>("[data-sheet-notelink]");
	const label = sheet.querySelector<HTMLElement>("[data-sheet-label]");

	/** `n` names the footnote shown; without it the sheet is the contents. */
	const open = (from: HTMLElement, n?: string): void => {
		opener = from;
		if (toc) toc.hidden = n !== undefined;
		if (note) note.hidden = n === undefined;
		if (label) label.textContent = n === undefined ? "contents" : `note ${n}`;
		sheet.setAttribute("aria-label", n === undefined ? "Contents" : `Note ${n}`);
		sheet.showModal();
		// The list only takes vertical pans when it has somewhere to scroll;
		// otherwise every pan is the sheet's own swipe.
		scroll.scrollTop = 0;
		scroll.toggleAttribute("data-scrolls", scroll.scrollHeight > scroll.clientHeight + 1);
		const cur = n === undefined ? toc?.querySelector<HTMLElement>("[aria-current]") : noteBody;
		if (cur) {
			if (n === undefined) scroll.scrollTop = cur.offsetTop - scroll.clientHeight / 3;
			cur.focus({ preventScroll: true });
		}
	};
	const close = (): void => {
		if (sheet.open) sheet.close();
	};

	for (const btn of document.querySelectorAll<HTMLElement>("[data-sheet-open]")) {
		btn.addEventListener("click", () => open(btn), { signal });
	}
	sheet.querySelector("[data-sheet-close]")?.addEventListener("click", close, { signal });

	// On touch a footnote reference opens its note here; there is no hover to
	// show the card, and jumping to the notes loses the reader's place.
	const coarse = matchMedia("(pointer: coarse)");
	document.querySelector<HTMLElement>("[data-prose]")?.addEventListener(
		"click",
		(ev) => {
			if (!(coarse.matches && noteBody && noteLink) || ev.defaultPrevented) return;
			if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
			const ref = (ev.target as HTMLElement).closest<HTMLAnchorElement>("[data-footnote-ref]");
			const src = ref && document.getElementById(decodeURIComponent(ref.hash.slice(1)));
			if (!src) return;
			ev.preventDefault();
			const body = src.cloneNode(true) as HTMLElement;
			for (const el of body.querySelectorAll("[data-footnote-backref]")) el.remove();
			for (const el of body.querySelectorAll("[id]")) el.removeAttribute("id");
			noteBody.replaceChildren(...body.childNodes);
			noteLink.hash = src.id;
			open(ref, ref.textContent?.trim() ?? "");
		},
		{ signal },
	);
	sheet.addEventListener(
		"click",
		(ev) => {
			if (ev.target === scrim) close();
			// In-page links close the sheet and let article.ts take the jump, which
			// can only move focus once the page behind is live again.
			else if ((ev.target as HTMLElement).closest(IN_PAGE)) close();
		},
		{ signal },
	);
	sheet.addEventListener(
		"close",
		() => {
			sheet.classList.remove("dragging");
			panel.style.removeProperty("translate");
			scrim.style.removeProperty("opacity");
			// A jump has already put focus on its target; anything else goes back.
			const f = document.activeElement;
			if (opener?.isConnected && (f === null || f === document.body || sheet.contains(f))) {
				opener.focus({ preventScroll: true });
			}
			opener = null;
		},
		{ signal },
	);

	// A downward swipe lets the sheet go; short of that it springs back.
	const trail = new Trail();
	const v: [number, number] = [0, 0];
	let pointer = -1;
	let y0 = 0;
	let dy = 0;
	let dragging = false;
	let dragEnd = Number.NEGATIVE_INFINITY;
	panel.addEventListener(
		"pointerdown",
		(ev) => {
			if (ev.pointerType === "mouse" || !ev.isPrimary) return;
			pointer = ev.pointerId;
			y0 = ev.clientY;
			dy = 0;
			dragging = false;
			trail.clear();
			trail.push(ev.timeStamp, 0, ev.clientY);
		},
		{ signal },
	);
	panel.addEventListener(
		"pointermove",
		(ev) => {
			if (ev.pointerId !== pointer) return;
			trail.push(ev.timeStamp, 0, ev.clientY);
			dy = Math.max(0, ev.clientY - y0);
			if (!dragging && dy > 8) {
				dragging = true;
				panel.setPointerCapture(ev.pointerId);
				sheet.classList.add("dragging");
			}
			if (!dragging) return;
			panel.style.translate = `0 ${dy}px`;
			scrim.style.opacity = String(1 - Math.min(1, dy / panel.offsetHeight));
		},
		{ signal },
	);
	const release = (ev: PointerEvent): void => {
		if (ev.pointerId !== pointer) return;
		pointer = -1;
		if (!dragging) return;
		dragging = false;
		dragEnd = ev.timeStamp;
		flick(trail, ev.timeStamp, 1e4, v);
		// Clearing the drag in the same frame as closing lets the transition
		// run on from where the finger let go.
		sheet.classList.remove("dragging");
		panel.style.removeProperty("translate");
		scrim.style.removeProperty("opacity");
		if (ev.type === "pointerup" && dismissed(dy, panel.offsetHeight, v[1] / 1000)) close();
	};
	panel.addEventListener("pointerup", release, { signal });
	panel.addEventListener("pointercancel", release, { signal });
	// a swipe that ends on a link isn't a tap on it
	panel.addEventListener(
		"click",
		(ev) => {
			if (ev.timeStamp - dragEnd < 400) {
				ev.preventDefault();
				ev.stopPropagation();
			}
		},
		{ capture: true, signal },
	);

	return () => {
		ac.abort();
		close();
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
	const cleanups = [initReading(), initSheet(), initMarginals(), initFigures(), initCode()];
	initFootnotes();
	return () => {
		for (const c of cleanups) c();
	};
}
