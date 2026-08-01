/**
 * git.crs.so block: client-side fetch against the self-hosted git server.
 *
 * In production there is no fallback: if the server does not answer, the
 * panel says so. In `bun dev` a sample payload stands in (the server does not
 * exist yet) so the populated layout can be worked on. `import.meta.env.DEV`
 * is compile-time, so the mock is not in the shipped bundle.
 */
import { GIT_HOST } from "./data/projects";

const API = `${GIT_HOST}/api/v1`;
const USER = "crsche";
const DAYS = 364; // 52 whole weeks
const WEEKS = 52;
const MS_DAY = 86_400_000;

interface HeatPoint {
	timestamp: number;
	contributions: number;
}

interface FeedItem {
	repo: string;
	message: string;
	when: number;
	url: string;
}

interface Repo {
	name: string;
	description: string;
	commits: number;
	updated: number;
	url: string;
	/** [language, share 0–1] descending, at most three */
	langs: [string, number][];
}

interface GitData {
	heat: Map<number, number>;
	commits: number;
	repos: number;
	recent: FeedItem[];
	/** the busiest repositories, busiest first */
	popular: Repo[];
}

/** Consecutive days ending today (or yesterday) with at least one commit. */
function streak(heat: Map<number, number>): number {
	const today = Math.floor(Date.now() / MS_DAY);
	let n = 0;
	// today may still be empty early in the day, so start at yesterday
	const from = (heat.get(today) ?? 0) > 0 ? today : today - 1;
	for (let d = from; d > from - DAYS; d--) {
		if ((heat.get(d) ?? 0) === 0) break;
		n++;
	}
	return n;
}

/** Weekly buckets, oldest → newest, aligned so the last bucket ends today. */
function weekly(heat: Map<number, number>): number[] {
	const today = Math.floor(Date.now() / MS_DAY);
	return Array.from({ length: WEEKS }, (_, w) => {
		let sum = 0;
		for (let i = 0; i < 7; i++) sum += heat.get(today - (WEEKS - 1 - w) * 7 - (6 - i)) ?? 0;
		return sum;
	});
}

/** Dev only: a plausible year for working on the populated layout. */
function sampleData(): GitData {
	const heat = new Map<number, number>();
	const today = Math.floor(Date.now() / MS_DAY);
	for (let d = 0; d < DAYS; d++) {
		const v = (Math.imul(d + 7, 2_654_435_761) >>> 8) % 100;
		const swell = 0.45 + 0.55 * Math.sin(d / 34) ** 2;
		const buckets: [number, number][] = [
			[38, 0],
			[62, 1],
			[82, 2],
			[94, 4],
			[101, 7],
		];
		const base = buckets.find(([cap]) => v < cap)?.[1] ?? 0;
		heat.set(today - d, Math.round(base * swell));
	}
	return {
		heat,
		commits: 1204,
		repos: 11,
		recent: [
			{
				repo: "basalt",
				message: "pack: stream thin packs without buffering",
				when: Date.now() - 2 * 3.6e6,
				url: `${GIT_HOST}/basalt/commits`,
			},
			{
				repo: "crs.so",
				message: "sim: drag-to-spin with capped inertia",
				when: Date.now() - 8.64e7,
				url: `${GIT_HOST}/crs.so/commits`,
			},
			{
				repo: "basalt",
				message: "refs: atomic transactional updates",
				when: Date.now() - 2 * 8.64e7,
				url: `${GIT_HOST}/basalt/commits`,
			},
		],
		popular: [
			{
				name: "basalt",
				description: "Git server and frontend, written from scratch in Rust.",
				commits: 412,
				updated: Date.now() - 2 * 3.6e6,
				url: `${GIT_HOST}/basalt`,
				langs: [
					["Rust", 0.82],
					["HTML", 0.12],
					["Shell", 0.06],
				],
			},
			{
				name: "crs.so",
				description: "This site — the object, the article system, the toolchain.",
				commits: 296,
				updated: Date.now() - 8.64e7,
				url: `${GIT_HOST}/crs.so`,
				langs: [
					["TypeScript", 0.71],
					["CSS", 0.2],
					["WGSL", 0.09],
				],
			},
			{
				name: "plankton",
				description: "Distributed internet-scale measurement framework.",
				commits: 188,
				updated: Date.now() - 21 * 8.64e7,
				url: `${GIT_HOST}/plankton`,
				langs: [
					["Python", 0.54],
					["Rust", 0.46],
				],
			},
		],
	};
}

async function fetchData(): Promise<GitData> {
	const signal = AbortSignal.timeout(4000);
	const [heatRes, repoRes, feedRes] = await Promise.all([
		fetch(`${API}/users/${USER}/heatmap`, { signal }),
		fetch(`${API}/repos/search?limit=50&sort=updated`, { signal }),
		fetch(`${API}/users/${USER}/activities/feeds?only-performed-by=true&limit=20`, { signal }),
	]);
	if (!(heatRes.ok && repoRes.ok && feedRes.ok)) throw new Error("git api");
	const heatRaw = (await heatRes.json()) as HeatPoint[];
	const repoRaw = (await repoRes.json()) as {
		data: { name: string; html_url: string; description?: string; updated_at?: string }[];
	};
	const feedRaw = (await feedRes.json()) as {
		op_type: string;
		repo: { name: string; html_url: string };
		content: string;
		created: string;
	}[];

	const heat = new Map<number, number>();
	const today = Math.floor(Date.now() / MS_DAY);
	let commits = 0;
	for (const h of heatRaw) {
		const day = Math.floor((h.timestamp * 1000) / MS_DAY);
		if (today - day < DAYS) heat.set(day, (heat.get(day) ?? 0) + h.contributions);
		commits += h.contributions;
	}

	const perRepo = new Map<string, number>();
	const recent: FeedItem[] = [];
	for (const f of feedRaw) {
		if (!f.op_type.includes("commit") && f.op_type !== "commit_repo") continue;
		perRepo.set(f.repo.name, (perRepo.get(f.repo.name) ?? 0) + 1);
		if (recent.length < 3) {
			let message = "";
			try {
				const c = JSON.parse(f.content) as { Commits?: { Message: string }[] };
				message = c.Commits?.[0]?.Message.split("\n")[0] ?? "";
			} catch {}
			recent.push({
				repo: f.repo.name,
				message: message || "pushed",
				when: new Date(f.created).getTime(),
				url: f.repo.html_url,
			});
		}
	}
	const byCommits = new Map(repoRaw.data.map((r) => [r.name, r]));
	const popular: Repo[] = [...perRepo.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 3)
		.map(([name, count]) => {
			const r = byCommits.get(name);
			return {
				name,
				description: r?.description ?? "",
				commits: count,
				updated: r?.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
				url: r?.html_url ?? `${GIT_HOST}/${name}`,
				langs: [],
			};
		});

	return { heat, commits, repos: repoRaw.data.length, recent, popular };
}

function age(ts: number): string {
	const s = (Date.now() - ts) / 1000;
	if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
	if (s < 86_400) return `${Math.round(s / 3600)}h`;
	return `${Math.round(s / 86_400)}d`;
}

/**
 * The server is not up yet (Basalt is still being written), and once it is up
 * it can still be unreachable. Either way the panel says so.
 */
function renderUnreachable(root: HTMLElement): void {
	root.querySelector("[data-git-detail]")?.remove();
	root.querySelector("[data-git-heat]")?.replaceChildren();
	const line = root.querySelector<HTMLElement>("[data-git-totals]");
	if (line) {
		line.className = "hollow-lead";
		line.textContent = "Couldn’t fetch git stats.";
	}
	root.hidden = false;
}

export async function initGitBlock(root: HTMLElement): Promise<void> {
	let data: GitData;
	try {
		data = await fetchData();
	} catch {
		if (!import.meta.env.DEV) {
			renderUnreachable(root);
			return;
		}
		data = sampleData();
	}

	const weeks = weekly(data.heat);
	renderYear(root, weeks);
	renderTotals(root, data, weeks);
	renderPopular(root, data.popular);
	renderRecent(root, data.recent);
	root.hidden = false;
}

const NS = "http://www.w3.org/2000/svg";

/**
 * The year as a single stroke whose width tracks weekly commits. It spans the
 * column exactly (uniform viewBox, width 100%). Hovering a week isolates it
 * and the line beneath reports that week's activity.
 */
function renderYear(root: HTMLElement, weeks: number[]): void {
	const host = root.querySelector<HTMLElement>("[data-git-heat]");
	const readout = root.querySelector<HTMLElement>("[data-git-readout]");
	if (!host) return;
	const W = 320;
	const H = 30;
	const Y = 15;
	const peak = Math.max(1, ...weeks);
	const today = Math.floor(Date.now() / MS_DAY);

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
		const label = `${v} commit${v === 1 ? "" : "s"} · week of ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
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

	// quarter marks, so the stroke reads as a year
	const months = Array.from({ length: 4 }, (_, q) => {
		const d = new Date((today - (3 - q) * 91) * MS_DAY);
		return { x: (q * W) / 4, label: d.toLocaleDateString("en-US", { month: "short" }) };
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
	const days = streak(data.heat);
	const bits = [
		`<em>${data.commits.toLocaleString()}</em> commits`,
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

function renderRecent(root: HTMLElement, recent: FeedItem[]): void {
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
