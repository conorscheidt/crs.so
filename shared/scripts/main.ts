/**
 * Site runtime.
 *
 * Handles the GPU black-hole field (create/destroy across view transitions),
 * its HUD readout, Lenis smooth scroll, section reveals, count-ups, and the
 * scroll rule. Heavy math lives on the GPU; this file just coordinates.
 */

import Lenis from "lenis";
import { initCursor, type MagneticCursor } from "./cursor";
import { initFigures } from "./figures";
import { initScrolly } from "./figures/scrolly";
import { initHoverCards, initToc } from "./reading";
import { SigilField } from "./sigil/renderer";
import { initThemeToggle } from "./theme";

let field: SigilField | null = null;
let cursor: MagneticCursor | null = null;
let lenis: Lenis | null = null;
let _lenisRaf = 0;
let wired = false;
const timers: number[] = [];

function clearTimers(): void {
	for (const id of timers) window.clearInterval(id);
	timers.length = 0;
}

let parallaxEls: HTMLElement[] = [];
let liftEls: HTMLElement[] = [];
let ambientField = false;

// Cached geometry. The per-frame ticker must not read layout: calling
// getBoundingClientRect on every lift/parallax element each frame forces a reflow
// and causes scroll jank. We measure once (load/resize); transforms we
// apply don't affect layout offsets, so the cache stays valid while scrolling.
interface Geom {
	el: HTMLElement;
	docTop: number;
	left: number;
	w: number;
	h: number;
}
let parallaxGeom: Geom[] = [];
let liftGeom: Geom[] = [];
let scrollMax = 0;

function measure(): void {
	const sy = window.scrollY;
	const toGeom = (el: HTMLElement): Geom => {
		const r = el.getBoundingClientRect();
		return { el, docTop: r.top + sy, left: r.left, w: r.width, h: r.height };
	};
	parallaxGeom = parallaxEls.map(toGeom);
	liftGeom = liftEls.map(toGeom);
	scrollMax = document.documentElement.scrollHeight - window.innerHeight;
}

// Text lift: a faint warm glow on each [data-lift] block.
// CSS-var write off cached geometry, no layout reads.
function updateLift(): void {
	if (!liftGeom.length) return;
	const vh = window.innerHeight;
	if (vh <= 0) return;
	const sy = window.scrollY;
	const vw = window.innerWidth;
	const breathe = 0.5 + 0.5 * Math.sin(performance.now() * 0.0009);
	const cx = vw / 2;
	const cy = vh / 2;
	const ringPx = 0.4 * vh; // HORIZON (world) → screen px
	for (const g of liftGeom) {
		const top = g.docTop - sy; // viewport-relative, no layout read
		if (top + g.h < 0 || top > vh) {
			g.el.style.setProperty("--lift", "0");
			continue;
		}
		let v: number;
		if (ambientField) {
			v = 0.12 + 0.1 * breathe; // calm, even glow that breathes with the drift
		} else {
			const d = Math.hypot(g.left + g.w / 2 - cx, top + g.h / 2 - cy);
			const prox = Math.exp(-(((d - ringPx) / (vh * 0.3)) ** 2));
			v = prox * (0.5 + 0.28 * breathe); // brightest as a block crosses the ring
		}
		g.el.style.setProperty("--lift", v.toFixed(3));
	}
}

function updateProgress(): void {
	const sy = window.scrollY;
	const el = document.getElementById("scroll-progress");
	if (el) {
		el.style.transform = `scaleX(${scrollMax > 0 ? Math.min(sy / scrollMax, 1) : 0})`;
	}
	// subtle figure/heading parallax from cached offsets (transforms don't reflow)
	if (parallaxGeom.length) {
		const vh = window.innerHeight;
		for (const g of parallaxGeom) {
			const off = g.docTop - sy + g.h / 2 - vh / 2;
			const speed = Number(g.el.dataset.parallax) || -0.06;
			g.el.style.transform = `translate3d(0, ${(off * speed).toFixed(1)}px, 0)`;
		}
	}
	updateLift();
}

function initLenis(reduced: boolean): void {
	if (reduced || lenis) return;
	lenis = new Lenis({ lerp: 0.12, smoothWheel: true, wheelMultiplier: 1.0, syncTouch: true });
	const raf = (t: number): void => {
		lenis?.raf(t);
		_lenisRaf = requestAnimationFrame(raf);
	};
	_lenisRaf = requestAnimationFrame(raf);
}

// Dedicated frame loop for progress + parallax + text-lift. Kept separate from
// Lenis's own rAF so the breathing glow keeps ticking even while idle (Lenis
// only drives frames while scrolling).
let ticking = false;
function frameTick(): void {
	updateProgress();
	requestAnimationFrame(frameTick);
}
function startTicker(): void {
	if (ticking) return;
	ticking = true;
	requestAnimationFrame(frameTick);
}

function initCore(): void {
	const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	// Black-hole field. The canvas is swapped per page on the blog (index =
	// eclipse, posts = drift), so rebind whenever the node changes.
	const canvas = document.querySelector<HTMLCanvasElement>("#sigil-canvas");
	if (canvas && (!field || field.canvasEl !== canvas)) {
		field?.destroy();
		field = new SigilField(canvas, {
			static: reduced,
			ambient: canvas.dataset.variant === "ambient",
		});
	}

	// HUD: backend + frame rate, 4×/s
	const hud = document.getElementById("sigil-hud");
	if (hud && !hud.dataset.wired) {
		hud.dataset.wired = "true";
		timers.push(
			window.setInterval(() => {
				if (!field) return;
				const { backend, fps } = field.telemetry;
				const rate = fps > 0 ? `${Math.min(Math.round(fps), 120)} fps` : "·";
				hud.textContent = `eclipse · ${backend} · ${rate}`;
			}, 250),
		);
	}

	// Section reveals
	const io = new IntersectionObserver(
		(entries) => {
			for (const e of entries) {
				if (e.isIntersecting) {
					e.target.classList.add("seen");
					io.unobserve(e.target);
				}
			}
		},
		{ rootMargin: "0px 0px -8% 0px" },
	);
	for (const el of document.querySelectorAll(".reveal")) {
		if (!el.classList.contains("seen")) io.observe(el);
	}

	// stagger: child items of [data-stagger] reveal in sequence
	for (const c of document.querySelectorAll<HTMLElement>("[data-stagger]")) {
		const kids = Array.from(c.children) as HTMLElement[];
		kids.forEach((k, i) => {
			k.style.transitionDelay = `${Math.min(i, 8) * 70}ms`;
		});
	}

	// parallax targets (figures, marked elements)
	parallaxEls = Array.from(document.querySelectorAll<HTMLElement>("[data-parallax]"));

	// text-lift targets (blocks that catch the field's light)
	liftEls = Array.from(document.querySelectorAll<HTMLElement>("[data-lift]"));
	ambientField = canvas?.dataset.variant === "ambient";

	// cache geometry now + after late reflow (fonts, images) so the ticker is read-free
	measure();
	setTimeout(measure, 600);

	// D3 figures (themed, interactive, cross-ref-linked) + scrollytelling
	initFigures();
	initScrolly();

	// long-form reading aids: contents rail scroll-spy + hover previews
	initToc();
	initHoverCards();

	// Count-ups (once)
	if (!document.body.dataset.ticking) {
		document.body.dataset.ticking = "true";
		if (!reduced) {
			for (const el of document.querySelectorAll<HTMLElement>("[data-tick-target]")) {
				const target = Number(el.dataset.tickTarget ?? "0");
				const started = performance.now();
				const dur = 1100;
				const run = (now: number): void => {
					const t = Math.min((now - started) / dur, 1);
					const eased = 1 - (1 - t) ** 3;
					el.textContent = Math.round(target * eased).toLocaleString("en-US");
					if (t < 1) requestAnimationFrame(run);
				};
				requestAnimationFrame(run);
			}
		}
	}

	initLenis(reduced);
	if (!reduced) startTicker();
	initThemeToggle();
	if (!cursor) cursor = initCursor();

	if (!wired) {
		wired = true;
		// The rAF ticker already calls updateProgress every frame, so a scroll
		// listener would double the work during scrolling. Only
		// add it for reduced-motion, where the ticker never starts.
		if (reduced) window.addEventListener("scroll", updateProgress, { passive: true });
		window.addEventListener("resize", measure, { passive: true });
		// distill-style cross-refs: hovering/focusing a [data-xref] lights up every
		// element sharing its key: prose term ↔ figure part, both directions.
		const setXref = (key: string, on: boolean): void => {
			for (const el of document.querySelectorAll(`[data-xref="${CSS.escape(key)}"]`)) {
				el.classList.toggle("xref-active", on);
			}
		};
		const onXref = (e: Event): void => {
			const el = (e.target as Element | null)?.closest?.<HTMLElement>("[data-xref]");
			if (!el?.dataset.xref) return;
			setXref(el.dataset.xref, e.type === "pointerover" || e.type === "focusin");
		};
		for (const t of ["pointerover", "pointerout", "focusin", "focusout"]) {
			document.addEventListener(t, onXref, { passive: true });
		}
	}
	updateProgress();
}

function teardown(): void {
	// Keep the field + lenis alive across view transitions so the background
	// animation state persists (the canvas is transition:persist). Only tear
	// down per-page wiring (timers) and the cursor (its DOM node is swapped out).
	clearTimers();
	if (cursor) {
		cursor.destroy();
		cursor = null;
	}
	document.body.dataset.ticking = "";
}

document.addEventListener("astro:page-load", initCore);
document.addEventListener("astro:before-preparation", teardown);
