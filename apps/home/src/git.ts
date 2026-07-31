/**
 * git.crs.so block: client-side fetch against the self-hosted Forgejo API.
 * On any failure (offline, CORS, dev) the block renders sample data, visibly
 * marked, so the layout never has a gap.
 */
const API = "https://git.crs.so/api/v1";
const USER = "crsche";
const DAYS = 112;
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
	sample: boolean;
}

function sampleData(): GitData {
	const heat = new Map<number, number>();
	const today = Math.floor(Date.now() / MS_DAY);
	for (let d = 0; d < DAYS; d++) {
		const v = (Math.imul(d + 7, 2_654_435_761) >>> 8) % 100;
		const buckets: [number, number][] = [
			[38, 0],
			[62, 1],
			[82, 2],
			[94, 4],
			[101, 7],
		];
		heat.set(today - d, buckets.find(([cap]) => v < cap)?.[1] ?? 0);
	}
	return {
		heat,
		commits: 214,
		repos: 9,
		recent: [
			{
				repo: "crs.so",
				message: "sim: weave + borromean objects",
				when: Date.now() - 2 * 3.6e6,
				url: "#",
			},
			{ repo: "rtk", message: "filter: gh pr view", when: Date.now() - 3 * 8.64e7, url: "#" },
			{
				repo: "figures",
				message: "lens pass for figure 4",
				when: Date.now() - 6 * 8.64e7,
				url: "#",
			},
		],
		active: [
			{ name: "crs.so", count: 96 },
			{ name: "rtk", count: 61 },
			{ name: "clang.wasm", count: 33 },
		],
		sample: true,
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

	return { heat, commits, repos: repoRaw.data.length, recent, active, sample: false };
}

function age(ts: number): string {
	const s = (Date.now() - ts) / 1000;
	if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
	if (s < 86_400) return `${Math.round(s / 3600)}h`;
	return `${Math.round(s / 86_400)}d`;
}

export async function initGitBlock(root: HTMLElement): Promise<void> {
	let data: GitData;
	try {
		data = await fetchData();
	} catch {
		data = sampleData();
	}

	const heatEl = root.querySelector<HTMLElement>("[data-git-heat]");
	if (heatEl) {
		const today = Math.floor(Date.now() / MS_DAY);
		const max = Math.max(1, ...data.heat.values());
		for (let d = DAYS - 1; d >= 0; d--) {
			const day = today - d;
			const v = data.heat.get(day) ?? 0;
			const b = document.createElement("b");
			b.style.opacity = v === 0 ? "0.07" : String(0.2 + 0.8 * Math.min(1, v / max));
			const date = new Date(day * MS_DAY).toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
			});
			b.title = `${v} contribution${v === 1 ? "" : "s"} · ${date}`;
			heatEl.appendChild(b);
		}
	}

	const totals = root.querySelector<HTMLElement>("[data-git-totals]");
	if (totals)
		totals.innerHTML = `<em>${data.commits} commits</em> this year · <em>${data.repos}</em> repositories${data.sample ? " · <i>sample</i>" : ""}`;

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
