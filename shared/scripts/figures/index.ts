/**
 * Figure layer: D3 renderers sharing one LaTeX theme. Each <figure data-fig>
 * carries a JSON spec; this scans them, draws the matching D3 figure, and
 * redraws on resize, theme flip, and scrollytelling step changes. Parts tagged
 * with an `xref` become hover-linkable from the prose (see main.ts).
 */

import { renderCells } from "./cells";
import { renderChart } from "./chart";
import { renderFlow } from "./flow";
import { onThemeChange, readTheme } from "./theme";
import type { FigSpec, RenderCtx } from "./types";

export function initFigures(root: ParentNode = document): void {
	for (const el of root.querySelectorAll<HTMLElement>("[data-fig]:not([data-fig-ready])")) {
		const specEl = el.querySelector(".fig-spec");
		const svg = el.querySelector<SVGSVGElement>("svg");
		const canvas = el.querySelector<HTMLElement>(".fig-canvas") ?? el;
		if (!specEl?.textContent || !svg) continue;
		let spec: FigSpec;
		try {
			spec = JSON.parse(specEl.textContent);
		} catch {
			continue;
		}
		el.dataset.figReady = "true";
		const ctx: RenderCtx = { step: -1 };

		const draw = (): void => {
			const width = Math.max(280, canvas.clientWidth || el.clientWidth || 600);
			const step = Number(el.dataset.step);
			ctx.step = Number.isFinite(step) ? step : -1;
			const t = readTheme();
			if (spec.type === "chart") renderChart(svg, spec, t, width, ctx);
			else if (spec.type === "flow") renderFlow(svg, spec, t, width, ctx);
			else if (spec.type === "cells") renderCells(svg, spec, t, width, ctx);
		};

		draw();
		new ResizeObserver(draw).observe(canvas);
		onThemeChange(draw);
		new MutationObserver(draw).observe(el, {
			attributes: true,
			attributeFilter: ["data-step"],
		});
	}
}
