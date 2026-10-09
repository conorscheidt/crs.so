// One clock, one cursor, and the navigator for hub ⇄ article travel. Internal
// links swap <main> in place instead of navigating, because a real navigation
// flashes the system cursor and CSS can't prevent it. Every article is still a
// prerendered page at its own URL.
import { bootArticle } from "./article";
import { Clock } from "./clock";
import { initCursor } from "./cursor";
import { bootHub } from "./hub";
import { type PageKind, pageKind } from "./router";

const clock = new Clock();
initCursor(clock);

let currentKind: PageKind = document.querySelector(".hub") ? "hub" : "article";
let teardown: () => void = boot();
let navigating = false;

function boot(): () => void {
	return currentKind === "hub" ? bootHub(clock) : bootArticle(clock);
}

// Pages are fetched on hover and parsed once the main thread is idle, so a
// swap clones a Document instead of fetching and parsing on click. The fetch
// promise is cached so concurrent warms share it; a click that beats the idle
// parse does it there. This is not speculation-rules prerender: that would
// boot a second WebGPU context per target, and a swapped page is never
// activated anyway.
interface Page {
	text: Promise<string | null>;
	doc?: Document;
	queued?: true;
}
const cache = new Map<string, Page>();

// Neither postTask nor requestIdleCallback is everywhere yet.
const idle = (fn: () => void): void => {
	if (typeof scheduler !== "undefined") void scheduler.postTask(fn, { priority: "background" });
	else if (typeof requestIdleCallback === "function") requestIdleCallback(fn, { timeout: 1000 });
	else setTimeout(fn, 50);
};

function fetchPage(url: string): Page {
	let page = cache.get(url);
	if (!page) {
		page = {
			text: fetch(url, { headers: { accept: "text/html" } })
				.then((res) => (res.ok ? res.text() : null))
				.catch(() => null),
		};
		cache.set(url, page);
	}
	return page;
}

const parse = (page: Page, text: string): Document => {
	page.doc ??= new DOMParser().parseFromString(text, "text/html");
	return page.doc;
};

function warm(url: string): void {
	const page = fetchPage(url);
	if (page.queued) return;
	page.queued = true;
	void page.text.then((text) => text && idle(() => parse(page, text)));
}

async function load(url: string): Promise<Document | null> {
	const page = fetchPage(url);
	const text = await page.text;
	return text ? parse(page, text) : null;
}

// Only links this navigator swaps are worth warming. Hub sections are
// already mounted and never fetch.
function warmable(a: HTMLAnchorElement): string | null {
	if (a.origin !== location.origin || a.target !== "") return null;
	if (a.pathname === location.pathname) return null;
	const kind = pageKind(a.pathname);
	if (!kind || (kind === "hub" && currentKind === "hub")) return null;
	return a.pathname + a.search;
}

// Hover or focus lands ~200 ms before a click: enough to fetch, and usually
// to find an idle moment to parse.
for (const type of ["pointerover", "focusin"] as const) {
	document.addEventListener(
		type,
		(ev) => {
			const a = (ev.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a[href]");
			const url = a && warmable(a);
			if (url) warm(url);
		},
		{ passive: true, capture: true },
	);
}

interface ViewTransitionLike {
	finished: Promise<void>;
	ready: Promise<void>;
	updateCallbackDone: Promise<void>;
}
type WithVT = Document & { startViewTransition?: (cb: () => void) => ViewTransitionLike };

// View transitions are decoration. One can abort before its callback runs
// (hidden tab, a transition already running), so if the callback never fired
// the swap is applied directly.
async function swap(apply: () => void): Promise<void> {
	const doc = document as WithVT;
	if (
		!doc.startViewTransition ||
		document.visibilityState === "hidden" ||
		matchMedia("(prefers-reduced-motion: reduce)").matches
	) {
		apply();
		return;
	}
	let ran = false;
	try {
		const vt = doc.startViewTransition(() => {
			ran = true;
			apply();
		});
		vt.ready.catch(() => {});
		vt.updateCallbackDone.catch(() => {});
		await vt.finished.catch(() => {});
	} catch {
		// startViewTransition threw; fall through to the plain swap
	}
	if (!ran) apply();
}

async function goto(url: string, push: boolean): Promise<void> {
	if (navigating) return;
	navigating = true;
	try {
		const doc = await load(url);
		const main = document.querySelector("main");
		const newMain = doc?.querySelector("main");
		if (!(main && doc && newMain)) {
			location.href = url; // graceful: let the browser do it
			return;
		}
		// Clone so the cached Document survives being visited again.
		const incoming = newMain.cloneNode(true) as HTMLElement;
		await swap(() => {
			teardown();
			document.title = doc.title;
			document.body.className = doc.body.className;
			main.replaceChildren(...incoming.childNodes);
			scrollTo(0, 0);
			if (push) history.pushState({ app: true }, "", url);
			lastPath = location.pathname;
			currentKind = pageKind(lastPath) ?? "article";
			teardown = boot();
		});
	} finally {
		navigating = false;
	}
}

// Registered before bootHub's handler: the hub router keeps section travel,
// this handles links that cross between hub and article.
document.addEventListener(
	"click",
	(ev) => {
		const a = (ev.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
		if (!a || ev.defaultPrevented) return;
		if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
		if (a.origin !== location.origin || a.target !== "") return;
		const kind = pageKind(a.pathname);
		if (!kind) return;
		if (kind === "hub" && currentKind === "hub") return; // hub router's job
		if (a.pathname === location.pathname) {
			// In-page anchors (ToC, footnotes and their backrefs) are left alone;
			// only a link to the current page is a no-op.
			if (!a.hash) ev.preventDefault();
			return;
		}
		ev.preventDefault();
		void goto(a.pathname + a.search, true);
	},
	{ capture: true },
);

let lastPath = location.pathname;
addEventListener("popstate", () => {
	const kind = pageKind(location.pathname);
	const pathChanged = location.pathname !== lastPath;
	lastPath = location.pathname;
	// Back to a page this navigator never renders, such as the 404 it swapped
	// away from: let the browser load it.
	if (!kind) {
		if (pathChanged) location.reload();
		return;
	}
	// Hub-to-hub popstate belongs to the hub router; hash-only changes to no one.
	if (kind === "hub" && currentKind === "hub") return;
	if (!pathChanged) return;
	void goto(location.pathname + location.search, false);
});
