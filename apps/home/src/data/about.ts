/**
 * About panel content, mirroring the résumé. The résumé PDF stays the
 * complete record (coursework, bullets, awards); this panel is the short
 * version. Don't add anything the résumé doesn't support.
 */
export const blurb =
	"Applied mathematics and computer science at Northwestern. I work on systems where the hard part is real: trading infrastructure, compilers and runtimes, and the numerical methods underneath them.";

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

// Each entry says what the work was and what came out of it: the research or
// the responsibility first, the thing built second. Not a second project list.
export const experience: ExperienceEntry[] = [
	{
		role: "Quantitative Developer",
		org: "Northwestern Financial Technologies",
		span: "Sept 2025 —",
		detail:
			"Study event-futures microstructure and exchange design with the trading group, and take that work into production: the live Kalshi bot, and the limit-order-book simulator it is tested against.",
	},
	{
		role: "Undergraduate Researcher",
		org: "Gingrich Group",
		span: "2024 — 2025",
		detail:
			"Research in non-equilibrium statistical mechanics — reaction–diffusion and tensor-network stochastic chemistry — and the tooling it needed: browser simulators now used in coursework, and sweep pipelines rebuilt to run five times faster on the university clusters.",
	},
	{
		role: "Undergraduate Researcher",
		org: "AquaLab",
		span: "2023 — 2024",
		detail:
			"Internet measurement research on privacy and data-protection practice across the web. Designed the study's telemetry model and built Plankton, the distributed crawler behind the datasets later measurement work drew on.",
	},
];

export const resumeHref = "/Conor_Scheidt_Resume.pdf";

/** Bottom-left contact rail. */
export const contact = {
	email: "c@crs.so",
	github: "https://github.com/conorscheidt",
	linkedin: "https://linkedin.com/in/conorscheidt",
};

/** Bottom-right corner meta (city + live local time). */
export const place = { city: "Evanston, IL", tz: "America/Chicago" };
