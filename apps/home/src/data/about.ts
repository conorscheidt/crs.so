/**
 * About panel content, mirroring the résumé. The résumé PDF stays the
 * complete record (coursework, bullets, awards); this panel is the short
 * version. Don't add anything the résumé doesn't support.
 */
export const blurb =
	"Applied mathematics and computer science at Northwestern. I build systems where the hard part is real — trading infrastructure and market simulators, a git server written from scratch in Rust, browser simulators for non-equilibrium statistical mechanics, and internet-scale measurement pipelines.";

export interface SchoolEntry {
	school: string;
	degree: string;
	span: string;
	where: string;
	detail?: string;
}

export const education: SchoolEntry[] = [
	{
		school: "Northwestern University",
		degree: "B.S. Applied Mathematics & Computer Science",
		span: "expected June 2029",
		where: "Evanston, IL",
	},
	{
		school: "Phillips Academy",
		degree: "High School Diploma — 4.0 GPA",
		span: "June 2025",
		where: "Andover, MA",
	},
];

export interface ExperienceEntry {
	role: string;
	org: string;
	span: string;
	detail: string;
}

export const experience: ExperienceEntry[] = [
	{
		role: "Quantitative Developer",
		org: "Northwestern Financial Technologies",
		span: "Sept 2025 — present",
		detail:
			"A live Kalshi event-futures trading bot behind the club's trading experiments, and its limit-order-book market simulator (20k orders/s).",
	},
	{
		role: "Undergraduate Researcher",
		org: "Gingrich Group, Northwestern",
		span: "June 2024 — Sept 2025",
		detail:
			"Browser simulators for reaction–diffusion and tensor-network stochastic chemistry, used by 100+ students; HPC parameter sweeps re-architected for ~80% less wall-clock time.",
	},
	{
		role: "Undergraduate Researcher",
		org: "AquaLab, Northwestern",
		span: "Jan 2023 — Feb 2024",
		detail:
			"Plankton — a distributed Python/Rust/MongoDB framework mapping site- and DNS-level telemetry at internet scale; 500M+ requests across 100k+ domains on EC2.",
	},
];

export const resumeHref = "/Conor_Scheidt_Resume.pdf";

/** Bottom-left contact rail. */
export const contact = {
	email: "c@crs.so",
	github: "https://github.com/crsche",
	linkedin: "https://linkedin.com/in/crsche",
};

/** Bottom-right corner meta (city + live local time). */
export const place = { city: "Evanston, IL", tz: "America/Chicago" };
