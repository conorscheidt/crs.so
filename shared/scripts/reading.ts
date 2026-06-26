/**
 * Reading aids for long-form posts:
 *  - initToc:        a left-margin contents rail with scroll-spy (the section
 *                    you're reading lights up), smooth anchor scrolling.
 *  - initHoverCards: distill-style hover previews. Footnote refs show their note
 *                    inline (no jump to the bottom), and [[key|gloss]] xref terms
 *                    surface their gloss. One shared, viewport-clamped card.
 */

/** Contents rail ↔ headings scroll-spy. Re-runnable; guarded per <nav>. */
export function initToc(root: ParentNode = document): void {
	const nav = root.querySelector<HTMLElement>("[data-toc]");
	if (!nav || nav.dataset.wired) return;
	nav.dataset.wired = "true";

	const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>("[data-toc-link]"));
	const items = links
		.map((link) => ({ link, el: document.getElementById(link.dataset.tocLink ?? "") }))
		.filter((it): it is { link: HTMLAnchorElement; el: HTMLElement } => it.el != null);
	if (!items.length) return;

	// Cache each heading's document-space top once (no per-frame layout reads; the
	// rAF spy must not call getBoundingClientRect or it forces a reflow every frame
	// during scroll). Re-measure on resize + after a late settle (fonts/images).
	let tops: number[] = [];
	const measure = (): void => {
		const sy = window.scrollY;
		tops = items.map((it) => it.el.getBoundingClientRect().top + sy);
	};
	const onResize = (): void => {
		if (!nav.isConnected) {
			window.removeEventListener("resize", onResize);
			return;
		}
		measure();
	};

	const spy = (sy: number): void => {
		const y = sy + 140; // a hair below the sticky nav
		let active = 0;
		for (let i = 0; i < items.length; i++) {
			if (tops[i] <= y) active = i;
			else break;
		}
		for (let i = 0; i < items.length; i++)
			items[i].link.classList.toggle("is-current", i === active);
	};

	// Lenis emits no native `scroll` events, so a scroll listener never fires; drive
	// the spy from rAF (reading scrollY), gated to actual scroll changes. Self-stops
	// when the rail is removed (view-transition nav) so listeners never accumulate.
	let lastY = Number.NaN;
	const loop = (): void => {
		if (!nav.isConnected) return;
		const sy = window.scrollY;
		if (sy !== lastY) {
			lastY = sy;
			spy(sy);
		}
		requestAnimationFrame(loop);
	};

	measure();
	setTimeout(measure, 600);
	window.addEventListener("resize", onResize, { passive: true });

	const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	for (const it of items) {
		it.link.addEventListener("click", (e) => {
			e.preventDefault();
			it.el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
			history.replaceState(null, "", `#${it.link.dataset.tocLink}`);
		});
	}
	spy(window.scrollY);
	requestAnimationFrame(loop);
}

let hoverWired = false;
let cardEl: HTMLElement | null = null;
let hideT = 0;
const SEL = "[data-footnote-ref], [data-gloss]";

const hideCard = (): void => cardEl?.classList.remove("show");

// The card lives in <body>, which view transitions swap out, so a closure that
// captured the first card would write to a detached node after navigating.
// Always resolve the *current* card, re-creating if it's gone.
function getCard(): HTMLElement {
	if (cardEl?.isConnected) return cardEl;
	cardEl = document.createElement("div");
	cardEl.className = "hovercard";
	cardEl.setAttribute("aria-hidden", "true");
	cardEl.addEventListener("pointerenter", () => window.clearTimeout(hideT));
	cardEl.addEventListener("pointerleave", () => {
		hideT = window.setTimeout(hideCard, 140);
	});
	document.body.appendChild(cardEl);
	return cardEl;
}

function place(card: HTMLElement, target: Element): void {
	const r = target.getBoundingClientRect();
	card.style.visibility = "hidden";
	card.classList.add("show");
	const cw = card.offsetWidth;
	const ch = card.offsetHeight;
	const left = Math.max(12, Math.min(r.left + r.width / 2 - cw / 2, window.innerWidth - cw - 12));
	const above = r.top - ch - 10;
	card.style.left = `${Math.round(left)}px`;
	card.style.top = `${Math.round(above < 12 ? r.bottom + 10 : above)}px`;
	card.style.visibility = "visible";
}

function contentFor(t: HTMLElement): string {
	if (t.dataset.gloss) return `<p class="hovercard-gloss">${t.dataset.gloss}</p>`;
	const ref = t.closest<HTMLElement>("[data-footnote-ref]");
	const id = ref?.getAttribute("href")?.slice(1);
	const li = id ? document.getElementById(id) : null;
	if (!li) return "";
	const clone = li.cloneNode(true) as HTMLElement;
	for (const b of clone.querySelectorAll("[data-footnote-backref]")) b.remove();
	return clone.innerHTML;
}

/** Footnote + xref-gloss hover previews. Idempotent across view transitions. */
export function initHoverCards(): void {
	getCard(); // ensure a connected card exists for this page
	if (hoverWired) return;
	hoverWired = true;

	document.addEventListener(
		"pointerover",
		(e) => {
			const t = (e.target as Element | null)?.closest?.<HTMLElement>(SEL);
			if (!t) return;
			const html = contentFor(t);
			if (!html) return;
			window.clearTimeout(hideT);
			const card = getCard();
			card.innerHTML = html;
			place(card, t);
		},
		{ passive: true },
	);
	document.addEventListener(
		"pointerout",
		(e) => {
			if ((e.target as Element | null)?.closest?.(SEL)) hideT = window.setTimeout(hideCard, 140);
		},
		{ passive: true },
	);
	window.addEventListener("scroll", hideCard, { passive: true });
}
