/**
 * Projects panel data, and the link between repositories and posts:
 *
 *     git.crs.so repo  ←→  project  ←→  0..n posts
 *
 * A project names its repository by slug (`repo`), and a post names its
 * project by slug in frontmatter (`project`). Both resolve at build time;
 * `lib/relations.ts` derives the reverse direction.
 *
 * `repo` is required: every project is a repository on git.crs.so, so a
 * project's title is always its link.
 *
 * The list is empty until something ships. A populated list for layout work
 * is in ./mocks.ts.
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
	/** anything other than the repository: a live deployment, a paper */
	href?: string;
}

export const GIT_HOST = "https://git.crs.so";
export const repoUrl = (repo: string): string => `${GIT_HOST}/${repo}`;

// to preview a populated list, uncomment PROJECTS in ./mocks.ts, import it,
// and swap the line below for:  export const projects = PROJECTS;
export const projects: Project[] = [];

export const projectBySlug = (slug: string): Project | undefined =>
	projects.find((p) => p.slug === slug);
