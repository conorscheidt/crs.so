/**
 * The project ↔ posts relation, derived in one place.
 *
 * A post declares its project in frontmatter; this module inverts that so a
 * project can list its writing without either side maintaining a second list.
 */
import { type Project, projectBySlug, projects } from "../data/projects";
import { type Post, publishedPosts } from "./posts";

export interface ProjectWithPosts extends Project {
	posts: Post[];
}

/** Every project, each carrying the published posts that name it. */
export async function projectsWithPosts(): Promise<ProjectWithPosts[]> {
	const posts = await publishedPosts();
	return projects.map((p) => ({
		...p,
		posts: posts.filter((post) => post.data.project === p.slug),
	}));
}

/** The project a post belongs to, if it names one that exists. */
export function projectOf(post: Post): Project | undefined {
	const slug = post.data.project;
	return slug ? projectBySlug(slug) : undefined;
}
