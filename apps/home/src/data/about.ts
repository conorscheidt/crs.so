/**
 * About panel content: blurb, education, professional experience (distinct
 * from projects). Entries marked sample are placeholders.
 */
export const blurb =
	"I build systems that compile, render and prove things in the browser — compilers and GPU simulation, and the mathematics underneath them.";

export interface SchoolEntry {
	school: string;
	span: string;
	detail?: string;
}

export const education: SchoolEntry[] = [
	{
		school: "Northwestern University",
		span: "2022 — 2026",
		detail: "Computer science & mathematics",
	},
	{ school: "Phillips Academy Andover", span: "2018 — 2022" },
];

export interface ExperienceEntry {
	role: string;
	span: string;
	detail?: string;
	sample?: boolean;
}

export const experience: ExperienceEntry[] = [
	{
		role: "Systems Intern — Example Co",
		span: "Summer 2025",
		detail: "Compiler tooling; shipped incremental build cache.",
		sample: true,
	},
	{
		role: "Research — Example Lab",
		span: "2024",
		detail: "Numerical methods for wave equations.",
		sample: true,
	},
];

export const resumeHref = "/Conor_Scheidt_Resume.pdf";
