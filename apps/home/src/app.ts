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

/**
 * Warm pages, parsed. Astro's viewport prefetch puts the bytes in the HTTP
 * cache; this keeps the built Document, so a swap costs a clone instead of a
 * fetch and a parse.
 *
 * Speculation-rules prerender would run the whole target page in a hidden
 * context (a second WebGPU device, a second clock, a second Lenis) and then
 * throw it away, because every internal click here is intercepted for a
 * same-document swap and never becomes the cross-document navigation a
 * prerender could activate.
 *
 * The promise is cached, not the result, so two warms of one URL share a
 * single fetch, and a click during a warm awaits it rather than racing it.
 */
const cache = new Map<string, Promise<Document | null>>();

function warm(url: string): Promise<Document | null> {
	let hit = cache.get(url);
	if (!hit) {
		hit = fetch(url, { headers: { accept: "text/html" } })
			.then((res) => (res.ok ? res.text() : null))
			.then((text) => (text ? new DOMParser().parseFromString(text, "text/html") : null))
			.catch(() => null);
		cache.set(url, hit);
	}
	return hit;
}

/**
 * Only links this navigator will swap are worth warming; this is the same test
 * the click handler applies. Section-to-section travel belongs to the hub
 * router and never fetches anything (all four panels are already mounted), so
 * warming a nav link would waste three round trips.
 */
function warmable(a: HTMLAnchorElement): string | null {
	if (a.origin !== location.origin || a.target !== "") return null;
	if (a.pathname === location.pathname) return null;
	const kind = pageKind(a.pathname);
	if (!kind || (kind === "hub" && currentKind === "hub")) return null;
	return a.pathname + a.search;
}

/**
 * Warm on intent. A pointer resting on a link, or focus landing on it, comes
 * ~200ms before the click, enough to have fetched and parsed by the time it
 * lands. Keyboard focus is treated the same as the mouse.
 */
for (const type of ["pointerover", "focusin"] as const) {
	document.addEventListener(
		type,
		(ev) => {
			const a = (ev.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a[href]");
			const url = a && warmable(a);
			if (url) void warm(url);
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
		const doc = await warm(url);
		const main = document.querySelector("main");
		const newMain = doc?.querySelector("main");
		if (!(main && doc && newMain)) {
			location.href = url; // graceful: let the browser do it
			return;
		}
		// Clone: the cached Document must survive being navigated to twice, and
		// replaceChildren would otherwise adopt its nodes straight out of it.
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
