/**
 * Drives scrollytelling. The active step is the last one whose top has passed the
 * figure's own vertical centre, so the highlighted step is always the one the
 * pinned figure sits beside, including step 0 on arrival and the last step at
 * the end. Using the figure's live centre as the trigger adapts to layout
 * (centred on wide screens, pinned near the top when narrow), and the steps carry
 * trailing room (CSS) so the sticky figure stays pinned through the last step.
 * The active index is written to the paired figure's data-step, and the D3 layer
 * redraws to emphasise that stage.
 *
 * Driven by rAF (only while the block is on-screen) rather than scroll events:
 * Lenis smooth-scroll does not emit native `scroll` events.
 */
export function initScrolly(root: ParentNode = document): void {
	for (const sc of root.querySelectorAll<HTMLElement>(".scrolly:not([data-scrolly-ready])")) {
		sc.dataset.scrollyReady = "true";
		const fig = sc.querySelector<HTMLElement>("[data-fig]");
		const steps = Array.from(sc.querySelectorAll<HTMLElement>(".scrolly-step"));
		if (!fig || !steps.length) continue;

		let current = -1;
		const setActive = (i: number): void => {
			if (i === current) return;
			current = i;
			fig.dataset.step = String(i);
			steps.forEach((s, k) => {
				s.classList.toggle("active", k === i);
			});
		};

		// Cache each step's document-relative top once (and on resize). The per-frame
		// loop must not read step geometry: getBoundingClientRect per step every
		// frame forces a reflow ~60×/s. Transforms we apply
		// don't move these offsets, so the cache stays valid while scrolling.
		let tops: number[] = [];
		const measure = (): void => {
			const sy = window.scrollY;
			tops = steps.map((s) => s.getBoundingClientRect().top + sy);
		};

		const computeActive = (sy: number): number => {
			// Probe = the figure's live vertical centre in document coords. Reading one
			// rect/frame (just the figure; it's sticky, so its viewport position moves)
			// is cheap; the steps stay cached. Active = last step whose top is above the
			// probe → the step the figure currently sits beside.
			const fr = fig.getBoundingClientRect();
			// align each step's top with the figure's top band (top-anchored pane):
			// a step goes active once its top has risen to the figure's top line.
			const probe = sy + fr.top + 8;
			let active = 0;
			for (let i = 0; i < tops.length; i++) {
				if (tops[i] <= probe) active = i;
				else break;
			}
			return active;
		};

		let raf = 0;
		let running = false;
		let lastScrollY = Number.NaN;
		const loop = (): void => {
			const sy = window.scrollY;
			if (sy !== lastScrollY) {
				lastScrollY = sy;
				setActive(computeActive(sy));
			}
			raf = requestAnimationFrame(loop);
		};
		// only spin the rAF while the block is on (or near) screen
		const io = new IntersectionObserver(
			(entries) => {
				const visible = entries[0]?.isIntersecting ?? false;
				if (visible && !running) {
					running = true;
					loop();
				} else if (!visible && running) {
					running = false;
					cancelAnimationFrame(raf);
				}
			},
			{ rootMargin: "200px 0px 200px 0px" },
		);
		io.observe(sc);
		measure();
		// fonts/images settle after first paint → remeasure so tops are accurate
		setTimeout(measure, 600);
		window.addEventListener("resize", measure, { passive: true });
		setActive(computeActive(window.scrollY));
	}
}
