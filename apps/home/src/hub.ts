/**
 * The hub: one page at four URLs. Section changes are client-side (pushState,
 * title, panel crossfade, object morph) and every panel stays mounted. app.ts
 * boots and tears this down on hub ⇄ article travel, so everything here is
 * reversible: listeners hang off one AbortController.
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

	// Lenis smooths the panel lists, which only scroll internally in the desktop
	// layout. Below the breakpoint the page scrolls instead, and a Lenis left
	// on a list would swallow trackpad wheel events.
	const desktop = matchMedia("(width >= 900px)");
	const lenises = new Map<Section, Lenis>();
	const syncLenis = (): void => {
		const want = desktop.matches && !reducedMotion;
		if (!want) {
			for (const l of lenises.values()) l.destroy();
			lenises.clear();
			return;
		}
		if (lenises.size > 0) return;
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
	};
	syncLenis();
	desktop.addEventListener("change", syncLenis, { signal });
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

	const offsets = new Map<Section, number>();

	// The sim boots async; until it resolves, calls through `sim?` are no-ops.
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

	// The search islands share one index; typing and chip changes nudge the sim.
	const pulse = (strength: number): void => sim?.excite(strength);
	const projPanel = panels.get("projects");
	if (projPanel) initSearch(projPanel, "project", { pulse });
	const writPanel = panels.get("writing");
	const writSearch = writPanel ? initSearch(writPanel, "post", { pulse }) : null;

	// Stays hidden unless basalt's summary loads.
	const gitb = hub.querySelector<HTMLElement>("[data-git]");
	if (gitb) void initGitBlock(gitb);

	// Local time in the corner.
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

	// Hovering an entry quickens the object.
	hub.querySelector(".col-r")?.addEventListener(
		"pointerover",
		(ev) => {
			if ((ev.target as HTMLElement).closest(".entry, .latest-title")) sim?.excite();
		},
		{ passive: true },
	);

	// Count outbound repository and live links.
	panels.get("projects")?.addEventListener("click", (ev) => {
		const entry = (ev.target as HTMLElement).closest<HTMLElement>(".entry");
		const xref = (ev.target as HTMLElement).closest(".xref");
		if (entry && xref) track("project-open", { slug: entry.dataset.id ?? "" });
	});

	// A project mark anywhere, or a tag on the Index panel, opens Writing with
	// that filter applied.
	const travel = (fn: () => void): void => {
		if (section !== "writing") {
			history.pushState({ section: "writing" }, "", PATHS.writing);
			apply("writing", true);
		}
		fn();
	};
	hub.addEventListener("click", (ev) => {
		const el = ev.target as HTMLElement;
		const slug = el.closest<HTMLElement>("[data-project-posts]")?.dataset.projectPosts;
		if (slug) {
			track("project-filter", { slug });
			travel(() => writSearch?.addProject(slug));
			return;
		}
		// Tags inside Projects and Writing belong to that panel's search island.
		if (!el.closest("[data-panel='index']")) return;
		const tag = el.closest<HTMLElement>(".tag")?.dataset.tag;
		if (tag) {
			track("tag-filter", { tag });
			travel(() => writSearch?.addTag(tag));
		}
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
		// On the sheet layout, a switch made far down a long list should land at
		// the top of the new section rather than somewhere inside it.
		const nav = hub.querySelector("nav");
		if (!desktop.matches && nav) {
			const top = nav.getBoundingClientRect().top + scrollY;
			if (scrollY > top) scrollTo({ top, behavior: reducedMotion ? "instant" : "smooth" });
		}
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

	// The theme flips synchronously; only the toggle's disc and a pulse through
	// the sim animate.
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
