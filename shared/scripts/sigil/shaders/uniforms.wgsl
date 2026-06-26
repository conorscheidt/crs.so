// Shared uniform block. WGSL has no #include, so this string is prepended to
// every shader module at build time (see webgpu.ts). Keep field order in sync
// with the `scratch` Float32Array packing on the TS side.
struct Uniforms {
  res: vec2f,
  time: f32,
  dt: f32,
  mouse: vec2f,
  present: f32,
  down: f32,
  count: f32,
  ambient: f32,
  dark: f32,
  scroll: f32,
  scrollVel: f32,
  _pad1: f32,
};
@group(0) @binding(0) var<uniform> U: Uniforms;

const PI = 3.141592653589793;
const HORIZON = 0.4;
