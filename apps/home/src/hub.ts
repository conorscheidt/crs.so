/**
 * Hub controller. One layout, four URLs. Section changes are client-side:
 * pushState + title/aria swap + panel crossfade + object morph. All four
 * panels stay mounted, so lenis instances persist for the hub's lifetime.
 * Booted and torn down by app.ts: hub ⇄ article navigation is a same-document
 * swap, so everything here must be reversible (listeners on an
 * AbortController, sim and lenis owned here).
 */
import Lenis from "lenis";
import { track } from "./analytics";
import type { Clock } from "./clock";
import { initGitBlock } from "./git";
import { MOTION } from "./motion";
import { interceptable, PATHS, ROUTES, type Section, TITLES } from "./router";
import { initSearch } from "./search/client";
import { bootSim, type Sim } from "./sim";
import { readTheme, setThemeAttr, storeTheme } from "./theme";

export function bootHub(clock: Clock): () => void {
	const hub = document.querySelector<HTMLElement>(".hub");
	if (!hub) return () => {};
	const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
	const ac = new AbortController();
	const { signal } = ac;
	const unsubs: (() => void)[] = [];

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
		unsubs.push(
			clock.subscribe((t) => {
				let v = 0;
				for (const l of lenises.values()) {
					l.raf(t);
					v = Math.max(v, Math.abs(l.velocity));
				}
				if (v > 2) sim?.excite(Math.min(0.35, v * 0.004));
			}),
		);
	}

	const offsets = new Map<Section, number>();

	// The sim boots async; its API is safe to call before it is ready.
	let sim: Sim | null = null;
	const canvas = hub.querySelector<HTMLCanvasElement>("#sim");
	if (canvas) {
		void bootSim(canvas, clock, section).then((s) => {
			if (signal.aborted) s.destroy();
			else sim = s;
		});
		const colC = canvas.parentElement as HTMLElement;
		// the object is grabbable: drag spins it, release coasts
		let last: { x: number; y: number } | null = null;
		colC.addEventListener("pointerdown", (ev) => {
			sim?.beginDrag();
			last = { x: ev.clientX, y: ev.clientY };
			try {
				colC.setPointerCapture(ev.pointerId);
			} catch {}
		});
		colC.addEventListener("pointermove", (ev) => {
			const r = canvas.getBoundingClientRect();
			sim?.setPointer(ev.clientX - r.left, ev.clientY - r.top, true);
			if (last) {
				sim?.dragBy(ev.clientX - last.x, ev.clientY - last.y);
				last = { x: ev.clientX, y: ev.clientY };
			}
		});
		const drop = (): void => {
			last = null;
			sim?.endDrag();
		};
		colC.addEventListener("pointerup", drop);
		colC.addEventListener("pointercancel", drop);
		colC.addEventListener("pointerleave", () => {
			sim?.setPointer(0, 0, false);
		});
	}

	// Search islands: shared index, per-panel kind; the sim pulses on
	// keystrokes and chip changes.
	const pulse = (strength: number): void => sim?.excite(strength);
	const projPanel = panels.get("projects");
	if (projPanel) initSearch(projPanel, "project", { pulse });
	const writPanel = panels.get("writing");
	const writSearch = writPanel ? initSearch(writPanel, "post", { pulse }) : null;

	// Index git block: real data, or a "not reporting yet" note.
	const gitb = hub.querySelector<HTMLElement>("[data-git]");
	if (gitb) void initGitBlock(gitb);

	// Corner meta: the local time where the work happens, ticking.
	const clockEl = hub.querySelector<HTMLElement>("[data-clock]");
	if (clockEl) {
		const tz = clockEl.dataset.tz ?? "America/Chicago";
		const fmt = new Intl.DateTimeFormat("en-US", {
			timeZone: tz,
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
			timeZoneName: "short",
		});
		const tick = (): void => {
			clockEl.textContent = fmt.format(new Date());
		};
		tick();
		const id = setInterval(tick, 30_000);
		unsubs.push(() => clearInterval(id));
	}

	// Hovering an entry or the latest-post title quickens the sim.
	hub.querySelector(".col-r")?.addEventListener(
		"pointerover",
		(ev) => {
			if ((ev.target as HTMLElement).closest(".entry, .latest-title")) sim?.excite();
		},
		{ passive: true },
	);

	// Track project opens from repository and live links.
	panels.get("projects")?.addEventListener("click", (ev) => {
		const entry = (ev.target as HTMLElement).closest<HTMLElement>(".entry");
		const xref = (ev.target as HTMLElement).closest(".xref");
		if (entry && xref) track("project-open", { slug: entry.dataset.id ?? "" });
	});

	// A tag on the Index panel's latest post opens
	// Writing with the chip already applied, like tags inside a post.
	panels.get("index")?.addEventListener("click", (ev) => {
		const tag = (ev.target as HTMLElement).closest<HTMLElement>(".tag")?.dataset.tag;
		if (!tag) return;
		track("tag-filter", { tag });
		history.pushState({ section: "writing" }, "", PATHS.writing);
		apply("writing", true);
		writSearch?.addTag(tag);
	});

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
		{ capture: true, signal },
	);

	addEventListener(
		"popstate",
		() => {
			const to = ROUTES[location.pathname];
			if (to) apply(to, false);
		},
		{ signal },
	);

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
		const to = document.documentElement.dataset.theme === "night" ? "day" : "night";
		track("theme-flip", { to });
		storeTheme(to);
		sim?.setInk();
		sim?.excite();
		syncLabel();
	});

	// bfcache restore: the frozen document may carry a stale theme and clock.
	addEventListener(
		"pageshow",
		(ev: PageTransitionEvent) => {
			if (!ev.persisted) return;
			setThemeAttr(readTheme());
			sim?.setInk();
			syncLabel();
			clock.epochReset();
			for (const l of lenises.values()) l.resize();
		},
		{ signal },
	);

	return () => {
		ac.abort();
		for (const u of unsubs) u();
		for (const l of lenises.values()) l.destroy();
		sim?.destroy();
		sim = null;
	};
}
