/**
 * Hub client: boots the colophon line, runs the draw-in or settle, and owns
 * hub-internal navigation (ClientRouter never swaps between hub pages;
 * article links are left to ClientRouter).
 *
 * Document-level listeners bind once per page lifetime and delegate to the
 * current controller; a controller is rebuilt on every astro:page-load
 * (module scripts do not re-run after ClientRouter swaps). Hub-internal clicks
 * are intercepted in the capture phase so ClientRouter's own click handler
 * never sees them.
 */
import { Conductor } from "./conductor";
import { REVEAL_KEYS, buildSkeleton, measureAnchors } from "./line/anchors";
import { LineEngine } from "./line/engine";
import { MOTION } from "./motion";

type HubState = "hub" | "work" | "writing" | "about";
const ROUTES: Record<string, HubState> = {
	"/": "hub",
	"/work": "work",
	"/writing": "writing",
	"/about": "about",
};
const PATHS: Record<HubState, string> = {
	hub: "/",
	work: "/work",
	writing: "/writing",
	about: "/about",
};
const TITLES: Record<HubState, string> = {
	hub: "Conor Scheidt",
	work: "Work — Conor Scheidt",
	writing: "Writing — Conor Scheidt",
	about: "About — Conor Scheidt",
};
const FLIP_SELECTORS = ["[data-line=mark]", "[data-line=name]", "[data-line=role]", "[data-line=ways]"];

interface Controller {
	travel(to: HubState, push: boolean): void;
	refit(): void;
	busy(): boolean;
}

let ctrl: Controller | null = null;

function setup(hub: HTMLElement): Controller {
	const conductor = new Conductor();
	const engine = new LineEngine(document.querySelector("main")!);
	let state = (hub.dataset.state as HubState) ?? "hub";

	const reveal = (): void => {
		for (const [sel] of REVEAL_KEYS)
			for (const el of hub.querySelectorAll<HTMLElement>(sel)) el.classList.add("lit");
	};

	const chrome = (s: HubState): void => {
		document.title = TITLES[s];
		const crumb = hub.querySelector("[data-slot=crumb]");
		if (crumb) crumb.textContent = `00 / ${s}`;
		const folio = hub.querySelector("[data-slot=folio]");
		if (folio) folio.textContent = s === "hub" ? "· 1 ·" : "· 2 ·";
		for (const a of hub.querySelectorAll("nav a")) {
			if (a.getAttribute("href") === PATHS[s]) a.setAttribute("aria-current", "page");
			else a.removeAttribute("aria-current");
		}
	};

	const skeleton = () => buildSkeleton(measureAnchors(hub, state));

	const drawIn = (): void => {
		const segs = skeleton();
		const len = engine.beginDraw(segs);
		const cues = REVEAL_KEYS.map(([sel, seg]) => ({
			els: [...hub.querySelectorAll<HTMLElement>(sel)],
			at: engine.offsetOf(segs, seg) / Math.max(1, len),
		}));
		conductor.run({
			kind: "drawing",
			duration: Math.max(600, (len / MOTION.penSpeed) * 1000),
			step: (t) => {
				engine.drawStep(len, t);
				for (const c of cues) if (t >= c.at) for (const el of c.els) el.classList.add("lit");
			},
			done: reveal,
		});
	};

	const travel = (to: HubState, push: boolean): void => {
		if (to === state) return;
		conductor.request(() => {
			const first = new Map<HTMLElement, DOMRect>();
			for (const sel of FLIP_SELECTORS) {
				const el = hub.querySelector<HTMLElement>(sel);
				if (el) first.set(el, el.getBoundingClientRect());
			}
			state = to;
			hub.dataset.state = to;
			chrome(to);
			if (push) history.pushState({ hub: to }, "", PATHS[to]);

			const movers: { el: HTMLElement; dx: number; dy: number; s: number }[] = [];
			for (const [el, f] of first) {
				const l = el.getBoundingClientRect();
				if (l.width === 0) continue;
				movers.push({
					el,
					dx: f.left + f.width / 2 - (l.left + l.width / 2),
					dy: f.top - l.top,
					s: f.width / l.width,
				});
			}
			const morph = engine.beginMorph(skeleton());
			const leafs = hub.querySelectorAll<HTMLElement>("[data-line=leaf], [data-line=quiet]");
			for (const el of leafs) el.classList.remove("lit");
			conductor.run({
				kind: "traveling",
				duration: 700,
				step: (t) => {
					const e = 1 - (1 - t) ** 3;
					morph(e);
					for (const m of movers) {
						m.el.style.transformOrigin = "50% 0";
						m.el.style.transform =
							t >= 1
								? ""
								: `translate(${m.dx * (1 - e)}px, ${m.dy * (1 - e)}px) scale(${m.s + (1 - m.s) * e})`;
					}
					if (t > 0.55) for (const el of leafs) el.classList.add("lit");
				},
				done: () => {
					for (const m of movers) m.el.style.transform = "";
					for (const el of leafs) el.classList.add("lit");
				},
			});
		});
	};

	// Boot: styles settled (dev injects scoped CSS via modules), then fonts.
	const loaded =
		document.readyState === "complete"
			? Promise.resolve()
			: new Promise<void>((r) => addEventListener("load", () => r(), { once: true }));
	const styled = () =>
		new Promise<void>((r) => {
			const t0 = performance.now();
			const check = () => {
				const off = hub.querySelector<HTMLElement>(
					state === "work" ? ".leaf-writing" : ".leaf-work",
				);
				if (!off || getComputedStyle(off).display === "none" || performance.now() - t0 > 1000) r();
				else requestAnimationFrame(check);
			};
			check();
		});
	const cap = new Promise<void>((r) => setTimeout(r, MOTION.budget.fontGate));
	loaded
		.then(styled)
		.then(() => Promise.race([document.fonts.ready.then(() => undefined), cap]))
		.then(() => {
			engine.fit();
			if (document.documentElement.dataset.reveal === "draw") drawIn();
			else {
				engine.set(skeleton());
				reveal();
			}
			document.fonts.ready.then(() => {
				// Fonts arriving after the cap: re-derive once, silently.
				if (conductor.phase === "idle") engine.set(skeleton());
			});
		});

	return {
		travel,
		refit: () => {
			engine.fit();
			engine.set(skeleton());
		},
		busy: () => conductor.phase !== "idle",
	};
}

function init(): void {
	const hub = document.querySelector<HTMLElement>(".hub");
	if (!hub) {
		// Article page (owned by ClientRouter): no hub controller.
		ctrl = null;
		return;
	}
	if (hub.dataset.lineReady) return;
	hub.dataset.lineReady = "1";
	ctrl = setup(hub);
}

declare global {
	interface Window {
		__hubListeners?: boolean;
	}
}

if (!window.__hubListeners) {
	window.__hubListeners = true;

	// Capture phase, so hub-internal nav never reaches ClientRouter.
	document.addEventListener(
		"click",
		(ev) => {
			if (!ctrl || ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey)
				return;
			const a = (ev.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
			if (!a || a.origin !== location.origin || a.target) return;
			const to = ROUTES[a.pathname];
			if (!to) return;
			ev.preventDefault();
			ev.stopImmediatePropagation();
			ctrl.travel(to, true);
		},
		{ capture: true },
	);

	addEventListener("popstate", () => {
		const to = ROUTES[location.pathname];
		if (to && ctrl) ctrl.travel(to, false);
	});

	addEventListener("resize", () => {
		if (ctrl && !ctrl.busy()) ctrl.refit();
	});

	// ClientRouter swaps (article ⇄ hub) replace the DOM without re-running
	// module scripts: rebuild the controller for the incoming document.
	document.addEventListener("astro:page-load", init);
}

init();
