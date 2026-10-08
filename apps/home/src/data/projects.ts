/**
 * Projects for the Projects panel. A project names its repository on
 * git.crs.so by slug (`repo`) and a post names its project in frontmatter
 * (`project`), so every link resolves at build time; lib/relations.ts derives
 * the reverse direction. Anything without a public repository doesn't belong
 * here.
 */
export interface Project {
	/** stable id; posts reference this in frontmatter */
	slug: string;
	name: string;
	description: string;
	tags: string[];
	year: number;
	/** repository slug on git.crs.so; the URL is derived from it */
	repo: string;
	/** a link other than the repository: a live deployment, a paper */
	href?: string;
}

export const GIT_HOST = "https://git.crs.so";
export const repoUrl = (repo: string): string => `${GIT_HOST}/${repo}`;

export const projects: Project[] = [];

export const projectBySlug = (slug: string): Project | undefined =>
	projects.find((p) => p.slug === slug);
