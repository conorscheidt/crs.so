// About panel content; keep it in step with the résumé.

export const blurb =
	"I study applied mathematics and computer science at Northwestern. Most of my work is on systems where performance and correctness both matter: distributed systems, trading infrastructure, compilers, and numerical methods.";

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
		span: "June 2029",
		where: "Evanston, IL",
	},
	{
		school: "Phillips Academy",
		degree: "High School Diploma",
		span: "June 2025",
		where: "Andover, MA",
	},
];

export interface ExperienceEntry {
	role: string;
	org: string;
	span: string;
	detail: string;
	/** The Borromean ring this role lights, for the three held at Northwestern. */
	ring?: 0 | 1 | 2;
}

export const experience: ExperienceEntry[] = [
	{
		role: "Software Developer",
		org: "Alter Domus",
		span: "since July 2026",
		detail: "Private credit observability.",
	},
	{
		role: "Quantitative Developer",
		org: "Northwestern Financial Technologies",
		span: "since Sept 2025",
		detail:
			"Event-futures microstructure and exchange design with the trading group. Built the live Kalshi trading bot and the limit order book simulator it's tested against.",
		ring: 0,
	},
	{
		role: "Undergraduate Researcher",
		org: "Gingrich Group",
		span: "2024–2025",
		detail:
			"Non-equilibrium statistical mechanics: reaction–diffusion and tensor-network models of stochastic chemistry. Wrote browser simulators now used in coursework and made the group's cluster pipelines about five times faster.",
		ring: 1,
	},
	{
		role: "Undergraduate Researcher",
		org: "AquaLab",
		span: "2023–2024",
		detail:
			"Internet measurement research on privacy and data-protection practices across the web. Designed the study's telemetry model and built Plankton, the distributed crawler behind its datasets.",
		ring: 2,
	},
];

export const resumeHref = "/Conor_Scheidt_Resume.pdf";

export const contact = {
	email: "c@crs.so",
	github: "https://github.com/conorscheidt",
	linkedin: "https://linkedin.com/in/conorscheidt",
};

export const place = { city: "Evanston, IL", tz: "America/Chicago" };
