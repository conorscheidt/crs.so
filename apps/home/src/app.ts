/**
 * Shared page runtime: one clock, one cursor, and the same-document navigator
 * that carries hub ⇄ article travel. Internal links never navigate across
 * documents: the browser's own navigation cursor cannot be suppressed by CSS,
 * so the only way the ring survives a click is to never leave the document.
 * Articles stay real prerendered URLs (direct hits, SEO, external links all
 * untouched).
 */
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

const cache = new Map<string, string>();

async function fetchPage(url: string): Promise<string | null> {
	const hit = cache.get(url);
	if (hit) return hit;
	try {
		const res = await fetch(url, { headers: { accept: "text/html" } });
		if (!res.ok) return null;
		const text = await res.text();
		cache.set(url, text);
		return text;
	} catch {
		return null;
	}
}

interface ViewTransitionLike {
	finished: Promise<void>;
	ready: Promise<void>;
	updateCallbackDone: Promise<void>;
}
type WithVT = Document & { startViewTransition?: (cb: () => void) => ViewTransitionLike };

/**
 * Run the swap, animated when the browser can and unanimated when it can't.
 * The transition is cosmetic and must not own correctness. A transition can
 * abort before it ever calls back ("Transition was aborted because of invalid
 * state": a hidden document, a transition already running, a resize
 * mid-flight), which would leave the swap unrun and the click dead. So every
 * promise is caught, and if the callback did not fire we apply the swap
 * ourselves.
 */
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
		/* the API refused outright — fall through to the plain swap */
	}
	if (!ran) apply();
}

async function goto(url: string, push: boolean): Promise<void> {
	if (navigating) return;
	navigating = true;
	try {
		const html = await fetchPage(url);
		const main = document.querySelector("main");
		const doc = html ? new DOMParser().parseFromString(html, "text/html") : null;
		const newMain = doc?.querySelector("main");
		if (!(main && doc && newMain)) {
			location.href = url; // graceful: let the browser do it
			return;
		}
		await swap(() => {
			teardown();
			document.title = doc.title;
			document.body.className = doc.body.className;
			main.replaceChildren(...newMain.childNodes);
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

// Registered before bootHub's own click handler (module evaluation order), so
// the hub's section router still owns section-to-section travel while this
// owns every kind-crossing link.
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
			// Leave in-page anchors to the page:
			// the ToC, every footnote reference and every footnote backref all
			// point at the path they are already on. Swallowing them here would
			// break all three. Only a link to the page you are already
			// standing on is inert.
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
	if (!kind) return;
	// hub→hub is the hub router's popstate; hash-only moves are nobody's
	const pathChanged = location.pathname !== lastPath;
	lastPath = location.pathname;
	if (kind === "hub" && currentKind === "hub") return;
	if (!pathChanged) return;
	void goto(location.pathname + location.search, false);
});
