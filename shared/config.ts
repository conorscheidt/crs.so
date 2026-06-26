/** Site-wide configuration. URLs resolve from env vars for cross-linking. */
export const SITE_CONFIG = {
	domain: "crsche.com",
	urls: {
		home: import.meta.env.PUBLIC_SITE_URL ?? "https://crsche.com",
		blog: import.meta.env.PUBLIC_BLOG_URL ?? "https://blog.crsche.com",
		git: import.meta.env.PUBLIC_GIT_URL ?? "https://git.crsche.com",
		github: "https://github.com/crsche",
		linkedin: "https://linkedin.com/in/crsche",
		resume: "/Conor_Scheidt_Resume.pdf",
	},
	meta: {
		title: "Conor Scheidt",
		description: "Systems Engineer ⋈ Quantitative Developer",
		email: "conor@crsche.com",
		sshKey:
			"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDRmuaM11I3ztdFeZoifNRFf/LnmlIYQiCMhzyvBWmeU conor@viator",
	},
} as const;

/** Frontmatter dates parse as UTC midnight, so format in UTC to avoid off-by-one. */
export function formatDate(
	date: Date,
	opts: Intl.DateTimeFormatOptions = {
		month: "short",
		day: "numeric",
		year: "numeric",
	},
): string {
	return date.toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

/** Resume-sourced content (single source of truth for the landing page). */
export const EXPERIENCE = [
	{
		role: "Quantitative Developer",
		org: "Northwestern Financial Technologies",
		period: "2025 — Now",
		desc: "Live Kalshi event-futures trading bot powering the club's live-trading experiments; full limit-order-book market simulator.",
		metric: "20k orders/s",
	},
	{
		role: "Undergraduate Researcher",
		org: "Gingrich Group · Northwestern",
		period: "2024 — 2025",
		desc: "Browser simulators for reaction–diffusion and tensor-network stochastic chemistry; re-architected HPC parameter-sweep pipelines.",
		metric: "−80% wall-clock",
	},
	{
		role: "Undergraduate Researcher",
		org: "AquaLab · Northwestern",
		period: "2023 — 2024",
		desc: "Plankton — massively distributed Python/Rust/MongoDB framework measuring privacy practices at Internet scale on AWS.",
		metric: "500M+ requests",
	},
] as const;

export const PROJECTS = [
	{
		name: "Basalt",
		stack: "Rust · QUIC/HTTP3 · SSH",
		desc: "Self-hostable git server written from scratch — custom transfer protocol, content-addressed object store, atomic ref transactions, zero-JavaScript web UI, PGO/BOLT-tuned.",
		metric: "0 JS shipped",
	},
	{
		name: "Princeton Soccer Robotics",
		stack: "C++ · Python · Embedded",
		desc: "Programming lead for a RoboCup-style autonomous soccer team — embedded control and multi-robot strategy under real-time constraints.",
		metric: "1st · U.S. Nationals",
	},
] as const;

export const EDUCATION = [
	{
		school: "Northwestern University",
		degree: "B.S. Applied Mathematics & Computer Science",
		period: "2025 — 2029",
	},
	{
		school: "Phillips Academy",
		degree: "Diploma · 4.0 GPA",
		period: "2021 — 2025",
	},
] as const;

/** Mock git.crsche.com telemetry — swap for Gitea API later. */
export const GIT_STATS = {
	repos: 24,
	commitsYtd: 1487,
	streakDays: 21,
	languages: [
		{ name: "Rust", pct: 38, color: "#f74c00" },
		{ name: "Python", pct: 24, color: "#3572a5" },
		{ name: "C++", pct: 14, color: "#f34b7d" },
		{ name: "TypeScript", pct: 12, color: "#3178c6" },
		{ name: "Go", pct: 6, color: "#00add8" },
		{ name: "Other", pct: 6, color: "#5c554c" },
	],
} as const;

export const RECENT_COMMITS = [
	{
		repo: "basalt/core",
		message: "perf: vectorizer optimizations in chunk stream",
		hash: "a84f9b2",
		time: "2m",
	},
	{
		repo: "basalt/net",
		message: "feat: HTTP/3 datagram support",
		hash: "4c10a11",
		time: "1h",
	},
	{
		repo: "quant/kalshi",
		message: "fix: order book desync on fast reconnect",
		hash: "b9c3dfa",
		time: "3h",
	},
] as const;
