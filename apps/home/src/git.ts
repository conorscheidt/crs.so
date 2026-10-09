// The git.crs.so block on the index: a year of commit activity, featured
// repositories and the latest commits, all from basalt. It fetches /api/git on
// this origin, which the Worker proxies and caches. If basalt doesn't answer
// the block stays hidden.
import { type Commit, DAYS, derive, type GitData, type Repo, type Summary } from "./git-data";

const WEEKS = 52;
// Day numbers are calendar dates in basalt's timezone, so they're formatted as UTC.
const MS_DAY = 86_400_000;

/** Consecutive days ending today (or yesterday) with at least one commit. */
function streak({ heat, today }: GitData): number {
	let n = 0;
	// An empty "today" early in the day shouldn't break the streak.
	const from = (heat.get(today) ?? 0) > 0 ? today : today - 1;
	for (let d = from; d > from - DAYS; d--) {
		if ((heat.get(d) ?? 0) === 0) break;
		n++;
	}
	return n;
}

/** Weekly totals, oldest first, with the last week ending today. */
function weekly({ heat, today }: GitData): number[] {
	return Array.from({ length: WEEKS }, (_, w) => {
		let sum = 0;
		for (let i = 0; i < 7; i++) sum += heat.get(today - (WEEKS - 1 - w) * 7 - (6 - i)) ?? 0;
		return sum;
	});
}

async function fetchData(): Promise<GitData | null> {
	const res = await fetch("/api/git", { signal: AbortSignal.timeout(4000) });
	if (res.status !== 200) return null;
	// The Worker has already validated this against the schema in git-summary.ts.
	return derive((await res.json()) as Summary, Date.now());
}

function age(ts: number): string {
	const s = (Date.now() - ts) / 1000;
	if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
	if (s < 86_400) return `${Math.round(s / 3600)}h`;
	return `${Math.round(s / 86_400)}d`;
}

export async function initGitBlock(root: HTMLElement): Promise<void> {
	const data = await fetchData().catch(() => null);
	if (!data) return;
	const weeks = weekly(data);
	renderYear(root, weeks, data.today);
	renderTotals(root, data, weeks);
	renderPopular(root, data.featured);
	renderRecent(root, data.recent);
	root.hidden = false;
}

const NS = "http://www.w3.org/2000/svg";

/**
 * The year as a single stroke whose width follows weekly commits, spanning the
 * column exactly. Hovering a week highlights it and the line below describes
 * it.
 */
function renderYear(root: HTMLElement, weeks: number[], today: number): void {
	const host = root.querySelector<HTMLElement>("[data-git-heat]");
	const readout = root.querySelector<HTMLElement>("[data-git-readout]");
	if (!host) return;
	const W = 320;
	const H = 30;
	const Y = 15;
	const peak = Math.max(1, ...weeks);

	const svg = document.createElementNS(NS, "svg");
	svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
	svg.setAttribute("aria-label", "commits per week over the last year");
	const seg = W / WEEKS;

	weeks.forEach((v, i) => {
		const t = v / peak;
		const mark = document.createElementNS(NS, "path");
		mark.setAttribute(
			"d",
			`M ${(i * seg).toFixed(2)} ${Y} L ${((i + 1) * seg - 0.6).toFixed(2)} ${Y}`,
		);
		mark.setAttribute("class", "gitbrush");
		mark.setAttribute("stroke-width", (0.7 + t * 9).toFixed(2));
		mark.style.setProperty("--o", (0.2 + 0.62 * t).toFixed(2));
		const end = new Date((today - (WEEKS - 1 - i) * 7) * MS_DAY);
		const label = `${v} commit${v === 1 ? "" : "s"} · week of ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
		mark.addEventListener("pointerenter", () => {
			svg.classList.add("isolating");
			mark.classList.add("on");
			if (readout)
				readout.textContent =
					v === 0
						? `quiet week · ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
						: label;
		});
		mark.addEventListener("pointerleave", () => {
			svg.classList.remove("isolating");
			mark.classList.remove("on");
			if (readout) readout.textContent = "";
		});
		const title = document.createElementNS(NS, "title");
		title.textContent = label;
		mark.appendChild(title);
		svg.appendChild(mark);
	});

	// quarter marks
	const months = Array.from({ length: 4 }, (_, q) => {
		const d = new Date((today - (3 - q) * 91) * MS_DAY);
		return {
			x: (q * W) / 4,
			label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
		};
	});
	for (const m of months) {
		const t = document.createElementNS(NS, "text");
		t.setAttribute("x", m.x.toFixed(1));
		t.setAttribute("y", String(H - 1));
		t.setAttribute("class", "gittick");
		t.textContent = m.label;
		svg.appendChild(t);
	}
	host.replaceChildren(svg);
}

function renderTotals(root: HTMLElement, data: GitData, weeks: number[]): void {
	const el = root.querySelector<HTMLElement>("[data-git-totals]");
	if (!el) return;
	const days = streak(data);
	const bits = [
		`<em>${data.commits.year.toLocaleString()}</em> commits this year`,
		`<em>${data.repos}</em> repos`,
		days > 1 ? `<em>${days}</em>-day streak` : `busiest week <em>${Math.max(0, ...weeks)}</em>`,
	];
	el.innerHTML = bits.join(" · ");
}

/** Popular repositories, each a link with a language bar. */
function renderPopular(root: HTMLElement, repos: Repo[]): void {
	const host = root.querySelector<HTMLElement>("[data-git-repos]");
	if (!host) return;
	host.replaceChildren();
	for (const r of repos) {
		const a = document.createElement("a");
		a.className = "repo";
		a.href = r.url;
		const top = document.createElement("span");
		top.className = "repo-top";
		const nm = document.createElement("b");
		nm.textContent = r.name;
		const meta = document.createElement("span");
		meta.className = "repo-meta";
		meta.textContent = `${r.commits} · ${age(r.updated)}`;
		top.append(nm, meta);
		a.appendChild(top);
		if (r.description) {
			const d = document.createElement("span");
			d.className = "repo-desc";
			d.textContent = r.description;
			a.appendChild(d);
		}
		if (r.langs.length > 0) {
			const bar = document.createElement("span");
			bar.className = "repo-langs";
			r.langs.forEach(([lang, share], i) => {
				const s = document.createElement("i");
				s.style.flex = String(share);
				s.style.setProperty("--o", (0.75 - i * 0.22).toFixed(2));
				s.title = `${lang} ${Math.round(share * 100)}%`;
				bar.appendChild(s);
			});
			a.appendChild(bar);
		}
		host.appendChild(a);
	}
}

function renderRecent(root: HTMLElement, recent: Commit[]): void {
	const host = root.querySelector<HTMLElement>("[data-git-recent]");
	if (!host) return;
	host.replaceChildren();
	for (const r of recent) {
		const row = document.createElement("a");
		row.className = "commit";
		row.href = r.url;
		const msg = document.createElement("em");
		msg.textContent = r.message;
		const meta = document.createElement("span");
		meta.textContent = `${r.repo} · ${age(r.when)}`;
		row.append(msg, meta);
		host.appendChild(row);
	}
}
