// Ink dots. Mirrors sim/shapes.ts, sim/camera.ts, sim/wake.ts and
// sim/shutter.ts: shapes, drawn morph, rotation, projection, strand lighting,
// depth shading, the cursor's wake and the streaks of fast dots. A compute
// pass places, shades and advances every dot once per frame; the render pass
// only expands each into a quad, which would otherwise redo that work per
// corner.

struct U {
	res: vec2f,
	cursor: vec2f,
	phase: f32,
	morph_t: f32,
	from_obj: f32,
	to_obj: f32,
	yaw: f32,
	tilt_x: f32,
	tilt_z: f32,
	// device px per CSS px
	dpr: f32,
	ink: vec3f,
	cursor_active: f32,
	dot_r: f32,
	fade: f32,
	accent_w: f32,
	// seconds since the last frame; 0 when the last one was not drawn
	dt: f32,
	// device px/s
	cursor_vel: vec2f,
	pad: vec2f,
}

@group(0) @binding(0) var<uniform> u: U;

// One per instance; the render pass reads it back as an instance vertex buffer.
struct Mark {
	// wake offset (device px) and its velocity
	off: vec2f,
	vel: vec2f,
	pos: vec2f,
	// back along the motion to the streak's far end; zero for a disc
	tail: vec2f,
	// radius (device px), alpha
	look: vec2f,
}

@group(0) @binding(1) var<storage, read_write> marks: array<Mark>;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;
const CAM_Z: f32 = 4.0;
// camera.ts LIGHT: unit, view space (y down the screen), upper left front.
const LIGHT: vec3f = vec3f(-0.4511292, -0.5513802, 0.7017566);
const SPEC_POWER: f32 = 40.0;
const TANGENT_EPS: f32 = 0.05;
// N (the dot count) is prepended by gpu.ts from sim/shapes.ts.
const MIN_DOT_R: f32 = 1.4;
const ACCENT_SIZE: f32 = 2.5;
const ACCENT_ALPHA: f32 = 0.85;
const ARC_LIFT: f32 = 0.3;
// wake.ts
const WAKE_R: f32 = 46.0;
const WAKE_PUSH: f32 = 1700.0;
const WAKE_DRAG: f32 = 0.7;
const WAKE_W0: f32 = 6.0;
// shutter.ts
const SHUTTER_FROM: f32 = 500.0;
const SHUTTER_TO: f32 = 1400.0;
const SHUTTER_EXPOSURE: f32 = 0.012;
const SHUTTER_MAX: f32 = 16.0;
const SHUTTER_JUMP: f32 = 0.4;

const ICO_VERTS = array<vec3f, 12>(
	vec3f(0.0, 0.5257311, 0.8506508), vec3f(0.0, 0.5257311, -0.8506508),
	vec3f(0.0, -0.5257311, 0.8506508), vec3f(0.0, -0.5257311, -0.8506508),
	vec3f(0.5257311, 0.8506508, 0.0), vec3f(0.5257311, -0.8506508, 0.0),
	vec3f(-0.5257311, 0.8506508, 0.0), vec3f(-0.5257311, -0.8506508, 0.0),
	vec3f(0.8506508, 0.0, 0.5257311), vec3f(-0.8506508, 0.0, 0.5257311),
	vec3f(0.8506508, 0.0, -0.5257311), vec3f(-0.8506508, 0.0, -0.5257311),
);

// The 30 edges as vertex-index pairs (same < 1.2 distance rule as the TS).
const ICO_EDGES = array<vec2u, 30>(
	vec2u(0u, 2u), vec2u(0u, 4u), vec2u(0u, 6u), vec2u(0u, 8u), vec2u(0u, 9u),
	vec2u(1u, 3u), vec2u(1u, 4u), vec2u(1u, 6u), vec2u(1u, 10u), vec2u(1u, 11u),
	vec2u(2u, 5u), vec2u(2u, 7u), vec2u(2u, 8u), vec2u(2u, 9u), vec2u(3u, 5u),
	vec2u(3u, 7u), vec2u(3u, 10u), vec2u(3u, 11u), vec2u(4u, 6u), vec2u(4u, 8u),
	vec2u(4u, 10u), vec2u(5u, 7u), vec2u(5u, 8u), vec2u(5u, 10u), vec2u(6u, 9u),
	vec2u(6u, 11u), vec2u(7u, 9u), vec2u(7u, 11u), vec2u(8u, 10u), vec2u(9u, 11u),
);

// Edge hops from vertex 0 (BFS over ICO_EDGES, as in the TS).
const ICO_HOP = array<f32, 12>(0.0, 2.0, 1.0, 3.0, 1.0, 2.0, 1.0, 2.0, 1.0, 1.0, 2.0, 2.0);
const ICO_DEPTH: f32 = 3.0;

struct Dot {
	p: vec3f,
	a: f32,
	// draw key in [0, 1]: the dot's place in the object's drawing order
	k: f32,
}

fn hash(i: f32, salt: f32) -> f32 {
	return fract(sin(i * 127.1 + salt * 311.7) * 43758.5453);
}

fn trefoil(i: f32, phase: f32) -> Dot {
	let uu = (i / N) * TAU + phase * 0.26;
	let w = 2.0 + cos(3.0 * uu);
	let p = vec3f(
		w * cos(2.0 * uu) / 2.75 + (hash(i, 1.0) - 0.5) * 0.06,
		sin(3.0 * uu) / 1.85 + (hash(i, 2.0) - 0.5) * 0.06,
		w * sin(2.0 * uu) / 2.75 + (hash(i, 3.0) - 0.5) * 0.06,
	);
	return Dot(p, 0.41, i / N);
}

fn icosahedron(i: f32, phase: f32) -> Dot {
	let e = ICO_EDGES[u32(i) % 30u];
	let a = ICO_VERTS[e.x];
	let b = ICO_VERTS[e.y];
	let speed = 0.1 + hash(i, 4.0) * 0.22;
	let s = fract(hash(i, 5.0) + phase * speed);
	let p = mix(a, b, s) + (vec3f(hash(i, 6.0), hash(i, 7.0), hash(i, 8.0)) - 0.5) * 0.035;
	// icoKey() in the TS
	let h0 = ICO_HOP[e.x];
	let h1 = ICO_HOP[e.y];
	var along = min(s, 1.0 - s);
	if (h0 < h1) {
		along = s;
	} else if (h1 < h0) {
		along = 1.0 - s;
	}
	return Dot(p, 0.36, (min(h0, h1) + along) / ICO_DEPTH);
}

fn loxodrome(i: f32, phase: f32) -> Dot {
	let strands = 4.0;
	let k = i % strands;
	let speed = 0.05 + hash(i, 4.0) * 0.045;
	let u = fract(hash(i, 5.0) + phase * speed);
	let lat = (u * 2.0 - 1.0) * 1.38;
	let merc = log(tan(0.78539816 + lat / 2.0));
	let lon = 3.4 * merc + (k * TAU) / strands + phase * 0.1;
	let cl = cos(lat);
	let edge = 1.0 - min(1.0, pow(abs(u * 2.0 - 1.0), 6.0));
	let p = vec3f(
		cl * cos(lon) + (hash(i, 6.0) - 0.5) * 0.02,
		sin(lat) + (hash(i, 7.0) - 0.5) * 0.02,
		cl * sin(lon) + (hash(i, 8.0) - 0.5) * 0.02,
	);
	return Dot(p, 0.41 * (0.25 + 0.75 * edge), u);
}

fn borromean(i: f32, phase: f32) -> Dot {
	let ring = i % 3.0;
	let along = floor(i / 3.0) / floor(N / 3.0);
	let t = along * TAU + phase * 0.3 + ring * 2.09;
	let ca = 1.02 * cos(t);
	let sb = 0.52 * sin(t);
	var p = vec3f(ca, sb, 0.0);
	if (ring >= 2.0) {
		p = vec3f(sb, 0.0, ca);
	} else if (ring >= 1.0) {
		p = vec3f(0.0, ca, sb);
	}
	p += (vec3f(hash(i, 6.0), hash(i, 7.0), hash(i, 8.0)) - 0.5) * 0.035;
	return Dot(p, 0.38, (ring + along) / 3.0);
}

fn shape(obj: f32, i: f32, phase: f32) -> Dot {
	switch (u32(obj)) {
		case 0u: { return trefoil(i, phase); }
		case 1u: { return icosahedron(i, phase); }
		case 2u: { return loxodrome(i, phase); }
		default: { return borromean(i, phase); }
	}
}

fn drawn_t(morph_t: f32, k: f32) -> f32 {
	let c = clamp(morph_t * 1.9 - k * 0.9, 0.0, 1.0);
	return c * c * (3.0 - 2.0 * c);
}

// evalPoint() in the TS: position and alpha of pool dot i mid-morph.
fn pool_dot(i: f32, phase: f32) -> vec4f {
	let b = shape(u.to_obj, i, phase);
	if (u.morph_t >= 1.0 || u.from_obj == u.to_obj) {
		return vec4f(b.p, b.a);
	}
	let a = shape(u.from_obj, i, phase);
	let t = drawn_t(u.morph_t, b.k);
	let p = mix(a.p, b.p, t);
	let lift = ARC_LIFT * sin(PI * t) / max(length(p), 1e-4);
	return vec4f(p * (1.0 + lift), mix(a.a, b.a, t));
}

// World to view space, as camera.ts rotate(): yaw (Y), tiltX (X), tiltZ (Z).
// c and s hold the cosines and sines of those three angles.
fn rotate(v: vec3f, c: vec3f, s: vec3f) -> vec3f {
	let x1 = v.x * c.x + v.z * s.x;
	let z1 = -v.x * s.x + v.z * c.x;
	let y2 = v.y * c.y - z1 * s.y;
	return vec3f(x1 * c.z - y2 * s.z, x1 * s.z + y2 * c.z, v.y * s.y + z1 * c.y);
}

// camera.ts strand(): Kajiya-Kay (diffuse, highlight) for a view-space tangent
// of any length and either sign.
fn strand(t: vec3f) -> vec2f {
	let len = length(t);
	let tn = select(vec3f(0.0, 0.0, 1.0), t / max(len, 1e-7), len > 1e-7);
	let tl = dot(tn, LIGHT);
	let sl = sqrt(max(0.0, 1.0 - tl * tl));
	let sv = sqrt(max(0.0, 1.0 - tn.z * tn.z));
	let c = clamp(tl * tn.z + sl * sv, 0.0, 1.0);
	return vec2f(sl, pow(max(c, 1e-6), SPEC_POWER));
}

// wakeForce() in wake.ts, for a dot at d device px from the cursor.
fn wake_force(d: vec2f) -> vec2f {
	let r = WAKE_R * u.dpr;
	let dist = length(d);
	if (dist >= r || u.cursor_active <= 0.001) {
		return vec2f(0.0);
	}
	let near = 1.0 - dist / r;
	let f = near * near * u.cursor_active;
	let push = (WAKE_PUSH * u.dpr) / max(dist, 1e-4);
	return (d * push + u.cursor_vel * WAKE_DRAG) * f;
}

struct Spring {
	x: vec2f,
	v: vec2f,
}

// spring() in wake.ts, both axes at once.
fn spring(x: vec2f, v: vec2f, a: vec2f, dt: f32, decay: f32) -> Spring {
	let w = WAKE_W0;
	let rest = a / (w * w);
	let y = x - rest;
	let c = v + w * y;
	return Spring(rest + (y + c * dt) * decay, (v - w * c * dt) * decay);
}

// streak() in shutter.ts.
fn streak(dist: f32, scale: f32) -> f32 {
	if (u.dt <= 0.0 || dist > SHUTTER_JUMP * scale) {
		return 0.0;
	}
	let speed = dist / u.dt;
	let c = clamp((speed / u.dpr - SHUTTER_FROM) / (SHUTTER_TO - SHUTTER_FROM), 0.0, 1.0);
	return min(speed * SHUTTER_EXPOSURE, SHUTTER_MAX * u.dpr) * c * c * (3.0 - 2.0 * c);
}

// exposure() in shutter.ts.
fn exposure(r: f32, len: f32) -> f32 {
	return (PI * r) / (PI * r + 2.0 * len);
}

@compute @workgroup_size(64)
fn advance(@builtin(global_invocation_id) gid: vec3u) {
	let ii = gid.x;
	if (ii >= arrayLength(&marks)) {
		return;
	}
	let i = f32(ii);
	let angles = vec3f(u.yaw, u.tilt_x, u.tilt_z);
	let rc = cos(angles);
	let rs = sin(angles);
	var p: vec4f;
	var size_mul = 1.0;
	// A vertex has no strand; light it as one seen end-on.
	var tangent = vec3f(0.0, 0.0, 1.0);
	if (ii >= u32(N)) {
		// Icosahedron vertex accents, visible only while the icosahedron has weight.
		p = vec4f(ICO_VERTS[ii - u32(N)], ACCENT_ALPHA * u.accent_w);
		size_mul = ACCENT_SIZE;
	} else {
		p = pool_dot(i, u.phase);
		// Dots stream along their strands, so a step in phase is a step along one.
		tangent = rotate(pool_dot(i, u.phase + TANGENT_EPS).xyz - p.xyz, rc, rs);
	}

	let v = rotate(p.xyz, rc, rs);
	let k = min(u.res.x, u.res.y) * 0.3;
	let persp = CAM_Z / (CAM_Z - v.z * 0.55);
	let px = u.res * 0.5 + v.xy * k * persp;

	// The wake moves on from where the dot was last drawn.
	var m = marks[ii];
	let force = wake_force(px + m.off - u.cursor);
	let sp = spring(m.off, m.vel, force, u.dt, exp(-WAKE_W0 * u.dt));
	m.off = sp.x;
	m.vel = sp.v;
	let pos = px + m.off;
	let moved = pos - m.pos;
	let dist = length(moved);
	let len = streak(dist, k);
	m.tail = select(vec2f(0.0), moved * (-len / max(dist, 1e-4)), len > 0.0);
	m.pos = pos;

	// Strand and depth shading, as in camera.ts shade().
	let st = strand(tangent);
	let dc = clamp((v.z + 1.1) / 2.2, 0.0, 1.0);
	let dt = dc * dc * (3.0 - 2.0 * dc);
	let occl = 0.35 + 0.65 * dt * dt;
	let lit = st.x * occl;
	let glint = st.y * occl;
	// Dark ink on light paper reads thinner than light on dark at the same
	// alpha, so density rises as ink luminance falls.
	let lum = dot(u.ink, vec3f(0.2126, 0.7152, 0.0722));
	let gain = 1.0 + 0.62 * (1.0 - lum);
	// Light ink is the light, so it gathers where the strand is lit; dark ink is
	// the shadow, so it thins there and a glint shows the paper.
	let night = clamp((lum - 0.25) / 0.5, 0.0, 1.0);
	let night_tone = 0.24 + 0.63 * lit + 0.75 * glint;
	let day_tone = (0.32 + 0.7 * (1.0 - 0.6 * lit)) * (1.0 - 0.38 * glint);
	let tone = mix(day_tone, night_tone, night);
	let alpha = min(0.92, p.w * (0.28 + 0.72 * dt) * tone * gain);
	let size = u.dot_r * size_mul * (0.62 + 0.38 * dt) * (1.0 + 0.3 * glint * night);
	// A dot under ~1.4 px covers a different amount of the pixel grid at every
	// sub-pixel offset and twinkles as it moves; widen it and fade it instead,
	// keeping its ink.
	let r = max(size, MIN_DOT_R);
	let keep = size / r;
	m.look = vec2f(r, alpha * keep * keep * u.fade * exposure(r, len));
	marks[ii] = m;
}

struct VSOut {
	@builtin(position) clip: vec4f,
	// along the streak, then across it, from its middle
	@location(0) local: vec2f,
	@location(1) radius: f32,
	@location(2) alpha: f32,
	@location(3) half_len: f32,
}

@vertex
fn vs(
	@builtin(vertex_index) vi: u32,
	@location(0) pos: vec2f,
	@location(1) tail: vec2f,
	@location(2) look: vec2f,
) -> VSOut {
	let len = length(tail);
	let axis = select(vec2f(1.0, 0.0), tail / max(len, 1e-4), len > 1e-4);
	let half_len = 0.5 * len;
	let corner = vec2f(f32(vi & 1u), f32(vi >> 1u)) * 2.0 - 1.0;
	let local = corner * vec2f(half_len + look.x + 1.0, look.x + 1.0);
	let quad = pos + axis * (half_len + local.x) + vec2f(-axis.y, axis.x) * local.y;
	var out: VSOut;
	out.clip = vec4f((quad / u.res * 2.0 - 1.0) * vec2f(1.0, -1.0), 0.0, 1.0);
	out.local = local;
	out.radius = look.x;
	out.alpha = look.y;
	out.half_len = half_len;
	return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
	// Distance to the capsule's core; with no length, to the disc's centre.
	let d = length(vec2f(max(abs(in.local.x) - in.half_len, 0.0), in.local.y));
	let a = clamp(in.radius + 0.5 - d, 0.0, 1.0) * in.alpha;
	// Premultiplied over the CSS paper background.
	return vec4f(u.ink * a, a);
}
