/** Side-effect CSS imports from fontsource packages. */
declare module "@fontsource-variable/*";

/** Vite raw-string imports for WGSL shader source. */
declare module "*.wgsl?raw" {
	const src: string;
	export default src;
}
