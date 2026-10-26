/**
 * A post's runnable snippet as the playground executes it. Snippet files end in
 * `export {};` so the type checker treats each as its own module; the runner
 * evaluates a plain script, so the marker comes off here.
 */
export const runnable = (source: string): string =>
	source.replace(/\s*export \{\};\s*$/u, "\n").trimEnd();
