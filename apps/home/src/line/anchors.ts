/**
 * Anchor measurement + skeleton construction. Measures once per state change;
 * the engine interpolates numbers and never re-reads layout. Baselines come
 * from a zero-width inline probe rather than rect math.
 */
import type { Pt, Segment } from "./segments";

export interface AnchorSet {
	cx: number;
	mark: DOMRect;
	name: DOMRect;
	nameBaseline: number;
	role: DOMRect;
	ways: DOMRect;
	leaf: DOMRect | null;
	quiet: DOMRect | null;
	folio: DOMRect;
}

/** Alphabetic baseline of the first text line inside `el`. */
export function measureBaseline(el: HTMLElement): number {
	const probe = document.createElement("span");
	probe.style.cssText = "display:inline-block;width:0;height:0;overflow:hidden";
	el.appendChild(probe);
	const y = probe.getBoundingClientRect().top;
	probe.remove();
	return y;
}

const rect = (root: ParentNode, sel: string): DOMRect | null => {
	const el = root.querySelector<HTMLElement>(sel);
	if (!el) return null;
	const r = el.getBoundingClientRect();
	return r.width === 0 && r.height === 0 ? null : r;
};

export function measureAnchors(hub: HTMLElement, state: string): AnchorSet {
	const need = (sel: string): DOMRect => {
		const r = rect(hub, sel);
		if (!r) throw new Error(`missing line anchor: ${sel}`);
		return r;
	};
	const nameEl = hub.querySelector<HTMLElement>("[data-line=name]")!;
	// Deterministic: the leaf is the one the state names, not "whatever is
	// visible" (style-injection timing must not change the route).
	const leaf = state === "hub" ? null : rect(hub, `.leaf-${state}`);
	return {
		cx: innerWidth / 2,
		mark: need("[data-line=mark]"),
		name: need("[data-line=name]"),
		nameBaseline: measureBaseline(nameEl),
		role: need("[data-line=role]"),
		ways: need("[data-line=ways]"),
		leaf,
		quiet: rect(hub, "[data-line=quiet]"),
		folio: need("[data-line=folio]"),
	};
}

/**
 * The colophon route: one pen stroke, no lifts, never crossing set text.
 * Crown drop → sweep over the name → left flank → baseline underline →
 * right drop past the role → nav shelf (drawn right-to-left) → descent →
 * the open leaf's left rail, if any → foot approach and tick.
 */
export function buildSkeleton(a: AnchorSet): Segment[] {
	const V = (name: string, pts: Pt[]): Segment => ({ name, points: pts });
	const nameTop = a.name.top - 10;
	const base = a.nameBaseline + 7;
	const nameL = a.name.left - 2;
	const nameR = a.name.right + 2;
	const shelfY = a.ways.bottom + 6;
	const footY = a.folio.top - 8;

	const segs: Segment[] = [
		V("crown", [
			[a.cx, a.mark.bottom + 8],
			[a.cx, nameTop],
		]),
		V("sweep", [
			[a.cx, nameTop],
			[nameL, nameTop],
		]),
		V("flank", [
			[nameL, nameTop],
			[nameL, base],
		]),
		V("under", [
			[nameL, base],
			[nameR, base],
		]),
		V("drop", [
			[nameR, base],
			[nameR, a.role.bottom + 9],
			[a.ways.right + 14, a.role.bottom + 9],
			[a.ways.right + 14, shelfY],
		]),
		V("shelf", [
			[a.ways.right + 14, shelfY],
			[a.ways.left - 14, shelfY],
		]),
	];

	const descentX = a.ways.left - 14;
	if (a.leaf) {
		const railX = a.leaf.left - 16;
		segs.push(
			V("leaf-gate", [
				[descentX, shelfY],
				[descentX, a.leaf.top - 6],
				[railX, a.leaf.top - 6],
			]),
			V("leaf-rail", [
				[railX, a.leaf.top - 6],
				[railX, a.leaf.bottom + 4],
			]),
			V("foot", [
				[railX, a.leaf.bottom + 4],
				[railX, footY],
				[a.cx, footY],
			]),
		);
	} else {
		segs.push(
			V("foot", [
				[descentX, shelfY],
				[descentX, footY],
				[a.cx, footY],
			]),
		);
	}
	segs.push(
		V("tick", [
			[a.cx, footY],
			[a.cx, footY + 4],
		]),
	);
	return segs;
}

/** Which segment's arrival reveals which element (draw-in choreography). */
export const REVEAL_KEYS: readonly (readonly [string, string])[] = [
	["[data-line=mark]", "crown"],
	["[data-line=name]", "flank"],
	["[data-line=role]", "drop"],
	["[data-line=ways]", "shelf"],
	["[data-line=leaf], [data-line=quiet]", "foot"],
	["[data-line=folio]", "tick"],
];
