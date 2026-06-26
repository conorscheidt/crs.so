/**
 * Sigil field for the hero.
 *
 * A live Physarum (slime-mold) network drawn on the GPU: agents crawl a
 * diffusing trail map and self-organize into veins that fill the page.
 * WebGPU (WGSL compute) is primary; WebGL2 is the fallback; no-GPU / reduced-motion
 * gets a single static frame.
 *
 * Paused when offscreen or backgrounded. The pointer is a soft attractor the
 * network reaches toward.
 */

import { createWebGL2Backend } from "./webgl2";
import { createWebGPUBackend } from "./webgpu";

export interface SigilUniforms {
	/** device-pixel resolution */
	w: number;
	h: number;
	/** elapsed ms */
	time: number;
	/** pointer in device px (origin top-left); present = over the page */
	px: number;
	py: number;
	present: number;
	/** pointer held = stronger attraction */
	down: number;
	/** 1 = ambient/calm variant (blog), 0 = full hero */
	ambient: number;
	/** 1 = dark mode, 0 = light */
	dark: number;
	/** 0 at top → 1 after one viewport: settles/dims the field while reading */
	scroll: number;
	/** smoothed scroll velocity (viewports/frame); drives the drift field */
	scrollVel: number;
	/** 0 = none, 1 = visible raytraced sphere (home), 2 = ghost invisible occluder (blog) */
	figure: number;
}

export interface SigilBackend {
	readonly label: string;
	render(u: SigilUniforms): void;
	resize(w: number, h: number): void;
	destroy(): void;
}

interface Opts {
	static?: boolean;
	ambient?: boolean;
}

export class SigilField {
	private backend: SigilBackend | null = null;
	private raf = 0;
	private running = false;
	private readonly reduced: boolean;
	private dpr = 1;
	private startedAt = 0;
	private lastFrame = 0;
	private frameEma = 0;
	private io: IntersectionObserver | null = null;
	private onScreen = true;
	private tabVisible = true;
	// paused while a heavy compile (C/C++) runs so the main thread is free → no jank
	private busy = false;

	private pPx = 0;
	private pPy = 0;
	private pPresent = 0;
	private smoothPx = 0;
	private smoothPy = 0;
	private pDown = 0;
	private readonly ambient: number;
	// 1 = this canvas shows the eclipse sphere + ring figure (home + blog landing)
	private readonly figure: number;
	// smoothed scroll, so the field settles gradually past the hero
	private smoothScroll = 0;
	// smoothed scroll velocity; drives the drift field
	private lastScrollY = 0;
	private scrollVel = 0;

	public label = "init";

	constructor(
		private readonly canvas: HTMLCanvasElement,
		opts: Opts = {},
	) {
		this.reduced = opts.static ?? false;
		this.ambient = opts.ambient ? 1 : 0;
		// figure: 0 = none, 1 = visible raytraced sphere (home hero), 2 = ghost, an
		// invisible occluder the dust washes over (blog landing). `data-figure="ghost"`.
		this.figure =
			canvas.dataset.figure === undefined ? 0 : canvas.dataset.figure === "ghost" ? 2 : 1;
		void this.init();
	}

	get canvasEl(): HTMLCanvasElement {
		return this.canvas;
	}

	get telemetry(): { fps: number; frameMs: number; backend: string } {
		return {
			fps: this.frameEma > 0 ? 1000 / this.frameEma : 0,
			frameMs: this.frameEma,
			backend: this.label,
		};
	}

	private async init(): Promise<void> {
		this.resize();
		let backend: SigilBackend | null = null;
		try {
			backend = await createWebGPUBackend(this.canvas, this.ambient === 1);
		} catch (e) {
			console.warn("[sigil] WebGPU backend failed, falling back:", e);
			backend = null;
		}
		if (!backend) {
			try {
				backend = createWebGL2Backend(this.canvas);
			} catch {
				backend = null;
			}
		}
		this.backend = backend;
		this.label = backend?.label ?? "static";
		if (!backend) {
			// No GPU: a faint ink halo so the hero isn't blank.
			this.canvas.style.background =
				"radial-gradient(42% 46% at 52% 44%, color-mix(in oklab, var(--color-accent) 9%, transparent), transparent 70%)";
			return;
		}

		this.resize();
		window.addEventListener("resize", this.onResize, { passive: true });
		window.addEventListener("pointermove", this.onPointer, { passive: true });
		window.addEventListener("pointerout", this.onPointerOut, { passive: true });
		window.addEventListener("pointerdown", this.onPointerDown, { passive: true });
		window.addEventListener("pointerup", this.onPointerUp, { passive: true });
		window.addEventListener("sigil:busy", this.onBusy as EventListener, { passive: true });
		document.addEventListener("visibilitychange", this.onVisibility);

		this.io = new IntersectionObserver(
			(entries) => {
				this.onScreen = entries[0]?.isIntersecting ?? true;
				this.evaluateRunning();
			},
			{ threshold: 0 },
		);
		this.io.observe(this.canvas);

		this.startedAt = performance.now();
		// grow the network synchronously → the first painted frame already shows a
		// formed field (no blank flash)
		this.warmup();
		if (!this.reduced) this.evaluateRunning();
	}

	private renderOnce(): void {
		this.backend?.render({
			w: this.canvas.width,
			h: this.canvas.height,
			time: 0,
			px: this.smoothPx,
			py: this.smoothPy,
			present: 0,
			down: 0,
			ambient: this.ambient,
			dark: document.documentElement.dataset.theme === "light" ? 0 : 1,
			scroll: 0,
			scrollVel: 0,
			figure: this.figure,
		});
	}

	private evaluateRunning(): void {
		if (this.reduced) return;
		const should = this.onScreen && this.tabVisible && !this.busy;
		if (should && !this.running) {
			this.running = true;
			this.lastFrame = 0;
			this.raf = requestAnimationFrame(this.loop);
		} else if (!should && this.running) {
			this.running = false;
			cancelAnimationFrame(this.raf);
		}
	}

	private readonly loop = (now: number): void => {
		if (!this.running || !this.backend) return;
		if (this.lastFrame > 0) {
			const dt = now - this.lastFrame;
			if (dt < 250) this.frameEma = this.frameEma === 0 ? dt : this.frameEma * 0.9 + dt * 0.1;
		}
		this.lastFrame = now;
		this.renderTick(now);
		this.raf = requestAnimationFrame(this.loop);
	};

	private renderTick(now: number): void {
		if (!this.backend) return;
		this.smoothPx += (this.pPx - this.smoothPx) * 0.5;
		this.smoothPy += (this.pPy - this.smoothPy) * 0.5;
		const vh = Math.max(window.innerHeight, 1);
		const sy = window.scrollY;
		this.smoothScroll += (Math.min(sy / vh, 1) - this.smoothScroll) * 0.07;
		// smoothed scroll velocity (viewports/frame) → streams the drift field
		const rawVel = (sy - this.lastScrollY) / vh;
		this.lastScrollY = sy;
		this.scrollVel += (rawVel - this.scrollVel) * 0.2;

		this.backend.render({
			w: this.canvas.width,
			h: this.canvas.height,
			time: now - this.startedAt,
			px: this.smoothPx,
			py: this.smoothPy,
			present: this.pPresent,
			down: this.pDown,
			ambient: this.ambient,
			dark: document.documentElement.dataset.theme === "light" ? 0 : 1,
			scroll: this.smoothScroll,
			scrollVel: this.scrollVel,
			figure: this.figure,
		});
	}

	// Integrate the particle sim forward synchronously so the first painted frame
	// already shows a settled accretion disk (no blank flash).
	private warmup(): void {
		if (!this.backend) return;
		for (let i = 0; i < 40; i++) this.renderTick(this.startedAt + i * 16);
	}

	private resize(): void {
		const host = this.canvas.parentElement ?? document.body;
		const rect = host.getBoundingClientRect();
		// cap DPR at 1.5: the field fills the viewport, so on a 2× display full DPR
		// quadruples present-pass work for no real gain on a soft field
		this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
		const w = Math.max(1, Math.round(rect.width * this.dpr));
		const h = Math.max(1, Math.round(rect.height * this.dpr));
		if (this.canvas.width !== w || this.canvas.height !== h) {
			this.canvas.width = w;
			this.canvas.height = h;
			this.backend?.resize(w, h);
		}
	}

	private readonly onResize = (): void => {
		this.resize();
		if (this.reduced || !this.running) this.renderOnce();
	};

	private readonly onPointer = (e: PointerEvent): void => {
		const rect = this.canvas.getBoundingClientRect();
		this.pPx = (e.clientX - rect.left) * this.dpr;
		this.pPy = (e.clientY - rect.top) * this.dpr;
		const inside =
			e.clientX >= rect.left &&
			e.clientX <= rect.right &&
			e.clientY >= rect.top &&
			e.clientY <= rect.bottom;
		this.pPresent = inside ? 1 : 0;
	};

	private readonly onPointerOut = (): void => {
		this.pPresent = 0;
	};

	private readonly onPointerDown = (): void => {
		this.pDown = 1;
	};

	private readonly onPointerUp = (): void => {
		this.pDown = 0;
	};

	private readonly onVisibility = (): void => {
		this.tabVisible = document.visibilityState === "visible";
		this.evaluateRunning();
	};

	private readonly onBusy = (e: CustomEvent<boolean>): void => {
		this.busy = !!e.detail;
		this.evaluateRunning();
	};

	destroy(): void {
		this.running = false;
		cancelAnimationFrame(this.raf);
		window.removeEventListener("resize", this.onResize);
		window.removeEventListener("pointermove", this.onPointer);
		window.removeEventListener("pointerout", this.onPointerOut);
		window.removeEventListener("pointerdown", this.onPointerDown);
		window.removeEventListener("pointerup", this.onPointerUp);
		window.removeEventListener("sigil:busy", this.onBusy as EventListener);
		document.removeEventListener("visibilitychange", this.onVisibility);
		this.io?.disconnect();
		this.backend?.destroy();
		this.backend = null;
	}
}
