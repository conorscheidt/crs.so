/**
 * Hub client controller. One layout, four URLs.
 * Section changes are client-side: pushState + title/aria swap + panel
 * crossfade + object morph. All four panels stay mounted, so lenis
 * instances persist for the page's lifetime. Article links pass through
 * untouched (cross-document view transitions).
 */
import Lenis from "lenis";
import { Clock } from "./clock";
import { initCursor } from "./cursor";
import { initGitBlock } from "./git";
import { MOTION } from "./motion";
import { interceptable, PATHS, ROUTES, type Section, TITLES } from "./router";
import { initSearch } from "./search/client";
import { bootSim, type Sim } from "./sim";
import { readTheme, setThemeAttr, storeTheme } from "./theme";

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

export const clock = new Clock();

function boot(): void {
	const hub = document.querySelector<HTMLElement>(".hub");
	if (!hub) return;
	initCursor(clock);

	let section: Section = ROUTES[location.pathname] ?? "index";
	const panels = new Map<Section, HTMLElement>();
	for (const el of hub.querySelectorAll<HTMLElement>("[data-panel]")) {
		panels.set(el.dataset.panel as Section, el);
	}

	// Lenis: one persistent instance per scrollable list; touch stays native.
	const lenises = new Map<Section, Lenis>();
	if (!reducedMotion) {
		for (const [name, panel] of panels) {
			const wrapper = panel.querySelector<HTMLElement>("[data-scroll]");
			if (!wrapper?.firstElementChild) continue;
			lenises.set(
				name,
				new Lenis({
					wrapper,
					content: wrapper.firstElementChild as HTMLElement,
					autoRaf: false,
					lerp: MOTION.scrollLerp,
					wheelMultiplier: 1,
					syncTouch: false,
				}),
			);
		}
		clock.subscribe((t) => {
			let v = 0;
			for (const l of lenises.values()) {
				l.raf(t);
				v = Math.max(v, Math.abs(l.velocity));
			}
			if (v > 2) sim?.excite(Math.min(0.35, v * 0.004));
		});
	}

	const offsets = new Map<Section, number>();

	// The sim boots async; its API is safe to call before it is ready.
	let sim: Sim | null = null;
	const canvas = hub.querySelector<HTMLCanvasElement>("#sim");
	if (canvas) {
		void bootSim(canvas, clock, section).then((s) => {
			sim = s;
		});
		const colC = canvas.parentElement as HTMLElement;
		colC.addEventListener("pointermove", (ev) => {
			const r = canvas.getBoundingClientRect();
			sim?.setPointer(ev.clientX - r.left, ev.clientY - r.top, true);
		});
		colC.addEventListener("pointerleave", () => sim?.setPointer(0, 0, false));
	}

	// Search islands: shared index, per-panel kind; the sim pulses on
	// keystrokes and chip changes.
	const pulse = (strength: number): void => sim?.excite(strength);
	const projPanel = panels.get("projects");
	if (projPanel) initSearch(projPanel, "project", { pulse });
	const writPanel = panels.get("writing");
	if (writPanel) initSearch(writPanel, "post", { pulse });

	// Index git block: Forgejo API with visible-sample fallback.
	const gitb = hub.querySelector<HTMLElement>("[data-git]");
	if (gitb) void initGitBlock(gitb);

	// Hovering an entry or the latest-post title quickens the sim.
	hub.querySelector(".col-r")?.addEventListener(
		"pointerover",
		(ev) => {
			if ((ev.target as HTMLElement).closest(".entry, .latest-title")) sim?.excite();
		},
		{ passive: true },
	);

	const apply = (to: Section, focus: boolean): void => {
		const from = section;
		if (from === to) return;
		offsets.set(from, panels.get(from)?.querySelector("[data-scroll]")?.scrollTop ?? 0);
		section = to;
		hub.dataset.section = to;
		document.title = TITLES[to];
		for (const a of hub.querySelectorAll("nav a")) {
			if (a.getAttribute("href") === PATHS[to]) a.setAttribute("aria-current", "page");
			else a.removeAttribute("aria-current");
		}
		const panel = panels.get(to);
		const remembered = offsets.get(to) ?? 0;
		const wrapper = panel?.querySelector<HTMLElement>("[data-scroll]");
		if (wrapper) {
			const l = lenises.get(to);
			if (l) l.scrollTo(remembered, { immediate: true });
			else wrapper.scrollTop = remembered;
		}
		if (focus)
			panel?.querySelector<HTMLElement>("[data-panel-head]")?.focus({ preventScroll: true });
		sim?.setSection(to);
	};

	document.addEventListener(
		"click",
		(ev) => {
			const a = (ev.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
			if (!a) return;
			const to = interceptable(
				{
					origin: a.origin,
					pathname: a.pathname,
					target: a.target,
					metaKey: ev.metaKey,
					ctrlKey: ev.ctrlKey,
					shiftKey: ev.shiftKey,
					altKey: ev.altKey,
					defaultPrevented: ev.defaultPrevented,
				},
				location.origin,
			);
			if (!to) return;
			ev.preventDefault();
			if (to !== section) {
				history.pushState({ section: to }, "", PATHS[to]);
				apply(to, true);
			}
		},
		{ capture: true },
	);

	addEventListener("popstate", () => {
		const to = ROUTES[location.pathname];
		if (to) apply(to, false);
	});

	// Eclipse toggle: instant, synchronous inversion; the disc slide and
	// a pulse through the cloud are the only things that animate.
	const toggle = hub.querySelector<HTMLElement>("[data-theme-toggle]");
	const themeLabel = hub.querySelector<HTMLElement>("[data-theme-label]");
	const syncLabel = (): void => {
		if (themeLabel)
			themeLabel.textContent = document.documentElement.dataset.theme === "night" ? "day" : "night";
	};
	syncLabel();
	toggle?.addEventListener("click", () => {
		storeTheme(document.documentElement.dataset.theme === "night" ? "day" : "night");
		sim?.setInk();
		sim?.excite();
		syncLabel();
	});

	// bfcache restore: the frozen document may carry a stale theme and clock.
	addEventListener("pageshow", (ev: PageTransitionEvent) => {
		if (!ev.persisted) return;
		setThemeAttr(readTheme());
		sim?.setInk();
		syncLabel();
		clock.epochReset();
		for (const l of lenises.values()) l.resize();
	});
}

boot();
