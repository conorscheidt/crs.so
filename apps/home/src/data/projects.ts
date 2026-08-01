/**
 * Projects panel data.
 *
 * Empty until a project has shipped something public: a running system, a
 * repository someone can read, numbers that hold up. Professional roles live
 * in about.ts.
 */
export interface Project {
	name: string;
	description: string;
	tags: string[];
	href?: string;
	year: number;
}

export const projects: Project[] = [];
