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

// Written as positions (what the role is responsible for), not as a project
// list. One line each; the résumé carries the bullets.
export const experience: ExperienceEntry[] = [
	{
		role: "Quantitative Developer",
		org: "Northwestern Financial Technologies",
		span: "Sept 2025 —",
		detail:
			"Own the live trading stack: an event-futures bot and the order-book simulator it trades against.",
	},
	{
		role: "Undergraduate Researcher",
		org: "Gingrich Group",
		span: "2024 — 2025",
		detail:
			"Built the group's simulation tooling — browser simulators for coursework, and HPC sweeps cut to a fifth of their runtime.",
	},
	{
		role: "Undergraduate Researcher",
		org: "AquaLab",
		span: "2023 — 2024",
		detail:
			"Ran the lab's internet-scale measurement pipeline, from crawler to the datasets other studies were built on.",
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
