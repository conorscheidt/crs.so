/**
 * git.crs.so block: client-side fetch against the self-hosted git server.
 *
 * In production there is no fallback: if the server does not answer, the
 * panel says so. In `bun dev` a sample payload stands in (the server does not
 * exist yet) so the populated layout can be worked on. `import.meta.env.DEV`
 * is compile-time, so the mock is not in the shipped bundle.
 */
const API = "https://git.crs.so/api/v1";
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

interface GitData {
	heat: Map<number, number>;
	commits: number;
	repos: number;
	recent: FeedItem[];
	active: { name: string; count: number }[];
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
				url: "#",
			},
			{
				repo: "crs.so",
				message: "sim: drag-to-spin with capped inertia",
				when: Date.now() - 8.64e7,
				url: "#",
			},
			{
				repo: "basalt",
				message: "refs: atomic transactional updates",
				when: Date.now() - 2 * 8.64e7,
				url: "#",
			},
		],
		active: [
			{ name: "basalt", count: 412 },
			{ name: "crs.so", count: 296 },
			{ name: "plankton", count: 188 },
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
	const repoRaw = (await repoRes.json()) as { data: { name: string; html_url: string }[] };
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
	const active = [...perRepo.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 3)
		.map(([name, count]) => ({ name, count }));

	return { heat, commits, repos: repoRaw.data.length, recent, active };
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

	// The year as dots, one per week, riding higher and darker with volume.
	// It scales to the column exactly (uniform viewBox, width 100%).
	const heatEl = root.querySelector<HTMLElement>("[data-git-heat]");
	const weeks = weekly(data.heat);
	if (heatEl) {
		const W = 320;
		const H = 30;
		const BASE = H - 4;
		const peak = Math.max(1, ...weeks);
		const today = Math.floor(Date.now() / MS_DAY);
		const NS = "http://www.w3.org/2000/svg";
		const svg = document.createElementNS(NS, "svg");
		svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
		svg.setAttribute("aria-label", "commits per week over the last year");
		const rule = document.createElementNS(NS, "line");
		rule.setAttribute("x1", "0");
		rule.setAttribute("x2", String(W));
		rule.setAttribute("y1", String(BASE + 0.5));
		rule.setAttribute("y2", String(BASE + 0.5));
		rule.setAttribute("class", "gitrule");
		svg.appendChild(rule);
		weeks.forEach((v, i) => {
			const t = Math.min(1, v / peak);
			const x = 2 + (i * (W - 4)) / (WEEKS - 1);
			const dot = document.createElementNS(NS, "circle");
			dot.setAttribute("cx", x.toFixed(2));
			dot.setAttribute("cy", (BASE - t * (BASE - 6)).toFixed(2));
			dot.setAttribute("r", v === 0 ? "0.9" : (1.1 + t * 1.9).toFixed(2));
			dot.setAttribute("class", "gitdot");
			// base weight rides a custom property so the CSS hover can win
			// without !important
			dot.style.setProperty("--o", v === 0 ? "0.18" : (0.4 + 0.6 * t).toFixed(2));
			const end = new Date((today - (WEEKS - 1 - i) * 7) * MS_DAY);
			const title = document.createElementNS(NS, "title");
			title.textContent = `${v} commit${v === 1 ? "" : "s"} · week of ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
			dot.appendChild(title);
			svg.appendChild(dot);
		});
		heatEl.replaceChildren(svg);
	}

	const totals = root.querySelector<HTMLElement>("[data-git-totals]");
	if (totals) {
		const days = streak(data.heat);
		const busiest = Math.max(0, ...weeks);
		const bits = [
			`<em>${data.commits}</em> commits · <em>${data.repos}</em> repos`,
			days > 1 ? `<em>${days}</em>-day streak` : "",
			busiest > 0 ? `busiest week <em>${busiest}</em>` : "",
		].filter(Boolean);
		totals.innerHTML = bits.join(" · ");
	}

	const recentEl = root.querySelector<HTMLElement>("[data-git-recent]");
	if (recentEl) {
		for (const r of data.recent) {
			const row = document.createElement("a");
			row.className = "commit";
			row.href = r.url;
			row.innerHTML = "<em></em><span></span>";
			(row.firstElementChild as HTMLElement).textContent = r.message;
			(row.lastElementChild as HTMLElement).textContent = `${r.repo} · ${age(r.when)}`;
			recentEl.appendChild(row);
		}
	}

	const activeEl = root.querySelector<HTMLElement>("[data-git-active]");
	if (activeEl)
		activeEl.innerHTML = data.active.map((a) => `${a.name} <em>${a.count}</em>`).join(" · ");

	root.hidden = false;
}
