// Instanced ink dots, stateless.
// Every formula here mirrors sim/shapes.ts + sim/camera.ts
// (shapes, morph + stagger, rotation, weak-perspective projection, screen-space
// dimple, front/back shading). The TS side is the tested reference.

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
	dimple_r: f32,
	ink: vec3f,
	cursor_active: f32,
	dot_r: f32,
	fade: f32,
	accent_w: f32,
	pad: f32,
}

@group(0) @binding(0) var<uniform> u: U;

const TAU: f32 = 6.28318530718;
const CAM_Z: f32 = 4.0;
const LIGHT: vec3f = vec3f(-0.45, -0.55, 0.7);
const N: f32 = 3000.0;

const ICO_VERTS = array<vec3f, 12>(
	vec3f(0.0, 0.5257311, 0.8506508), vec3f(0.0, 0.5257311, -0.8506508),
	vec3f(0.0, -0.5257311, 0.8506508), vec3f(0.0, -0.5257311, -0.8506508),
	vec3f(0.5257311, 0.8506508, 0.0), vec3f(0.5257311, -0.8506508, 0.0),
	vec3f(-0.5257311, 0.8506508, 0.0), vec3f(-0.5257311, -0.8506508, 0.0),
	vec3f(0.8506508, 0.0, 0.5257311), vec3f(-0.8506508, 0.0, 0.5257311),
	vec3f(0.8506508, 0.0, -0.5257311), vec3f(-0.8506508, 0.0, -0.5257311),
);

// 30 edges as vertex-index pairs (generated from the same <1.2 rule as TS).
const ICO_EDGES = array<vec2u, 30>(
	vec2u(0u, 2u), vec2u(0u, 4u), vec2u(0u, 6u), vec2u(0u, 8u), vec2u(0u, 9u),
	vec2u(1u, 3u), vec2u(1u, 4u), vec2u(1u, 6u), vec2u(1u, 10u), vec2u(1u, 11u),
	vec2u(2u, 5u), vec2u(2u, 7u), vec2u(2u, 8u), vec2u(2u, 9u), vec2u(3u, 5u),
	vec2u(3u, 7u), vec2u(3u, 10u), vec2u(3u, 11u), vec2u(4u, 6u), vec2u(4u, 8u),
	vec2u(4u, 10u), vec2u(5u, 7u), vec2u(5u, 8u), vec2u(5u, 10u), vec2u(6u, 9u),
	vec2u(6u, 11u), vec2u(7u, 9u), vec2u(7u, 11u), vec2u(8u, 10u), vec2u(9u, 11u),
);

fn hash(i: f32, salt: f32) -> f32 {
	return fract(sin(i * 127.1 + salt * 311.7) * 43758.5453);
}

fn trefoil(i: f32, phase: f32) -> vec4f {
	let uu = (i / N) * TAU + phase * 0.26;
	let w = 2.0 + cos(3.0 * uu);
	return vec4f(
		w * cos(2.0 * uu) / 2.75 + (hash(i, 1.0) - 0.5) * 0.06,
		sin(3.0 * uu) / 1.85 + (hash(i, 2.0) - 0.5) * 0.06,
		w * sin(2.0 * uu) / 2.75 + (hash(i, 3.0) - 0.5) * 0.06,
		0.62,
	);
}

fn icosahedron(i: f32, phase: f32) -> vec4f {
	let e = ICO_EDGES[u32(i) % 30u];
	let a = ICO_VERTS[e.x];
	let b = ICO_VERTS[e.y];
	let speed = 0.1 + hash(i, 4.0) * 0.22;
	let s = fract(hash(i, 5.0) + phase * speed);
	let p = mix(a, b, s) + (vec3f(hash(i, 6.0), hash(i, 7.0), hash(i, 8.0)) - 0.5) * 0.035;
	return vec4f(p, 0.55);
}

fn loxodrome(i: f32, phase: f32) -> vec4f {
	let strands = 4.0;
	let k = i % strands;
	let speed = 0.05 + hash(i, 4.0) * 0.045;
	let u = fract(hash(i, 5.0) + phase * speed);
	let lat = (u * 2.0 - 1.0) * 1.38;
	let merc = log(tan(0.78539816 + lat / 2.0));
	let lon = 3.4 * merc + (k * TAU) / strands + phase * 0.1;
	let cl = cos(lat);
	let edge = 1.0 - min(1.0, pow(abs(u * 2.0 - 1.0), 6.0));
	return vec4f(
		cl * cos(lon) + (hash(i, 6.0) - 0.5) * 0.02,
		sin(lat) + (hash(i, 7.0) - 0.5) * 0.02,
		cl * sin(lon) + (hash(i, 8.0) - 0.5) * 0.02,
		0.62 * (0.25 + 0.75 * edge),
	);
}

fn borromean(i: f32, phase: f32) -> vec4f {
	let ring = i % 3.0;
	let t = (floor(i / 3.0) / floor(N / 3.0)) * TAU + phase * 0.3 + ring * 2.09;
	let ca = 1.02 * cos(t);
	let sb = 0.52 * sin(t);
	var p = vec3f(ca, sb, 0.0);
	if (ring >= 2.0) {
		p = vec3f(sb, 0.0, ca);
	} else if (ring >= 1.0) {
		p = vec3f(0.0, ca, sb);
	}
	p += (vec3f(hash(i, 6.0), hash(i, 7.0), hash(i, 8.0)) - 0.5) * 0.035;
	return vec4f(p, 0.58);
}

fn shape(obj: f32, i: f32, phase: f32) -> vec4f {
	switch (u32(obj)) {
		case 0u: { return trefoil(i, phase); }
		case 1u: { return icosahedron(i, phase); }
		case 2u: { return loxodrome(i, phase); }
		default: { return borromean(i, phase); }
	}
}

fn staggered_t(morph_t: f32, i: f32) -> f32 {
	let c = clamp(morph_t * 1.3 - hash(i, 9.0) * 0.3, 0.0, 1.0);
	return c * c * (3.0 - 2.0 * c);
}

struct VSOut {
	@builtin(position) clip: vec4f,
	@location(0) local: vec2f,
	@location(1) radius: f32,
	@location(2) alpha: f32,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VSOut {
	let i = f32(ii);
	var p: vec4f;
	var size_mul = 1.0;
	if (ii >= u32(N)) {
		// Icosahedron vertex accents — visible only while the ico has weight.
		p = vec4f(ICO_VERTS[ii - u32(N)], 0.85 * u.accent_w);
		size_mul = 1.9;
	} else if (u.morph_t >= 1.0 || u.from_obj == u.to_obj) {
		p = shape(u.to_obj, i, u.phase);
	} else {
		let a = shape(u.from_obj, i, u.phase);
		let b = shape(u.to_obj, i, u.phase);
		p = mix(a, b, staggered_t(u.morph_t, i));
	}

	// Rotation: yaw (Y), tiltX (X), tiltZ (Z) — parity with sim/camera.ts.
	let cy = cos(u.yaw); let sy = sin(u.yaw);
	let cx = cos(u.tilt_x); let sx = sin(u.tilt_x);
	let cz = cos(u.tilt_z); let sz = sin(u.tilt_z);
	let x1 = p.x * cy + p.z * sy;
	let z1 = -p.x * sy + p.z * cy;
	let y2 = p.y * cx - z1 * sx;
	let z2 = p.y * sx + z1 * cx;
	let x3 = x1 * cz - y2 * sz;
	let y3 = x1 * sz + y2 * cz;

	let k = min(u.res.x, u.res.y) * 0.3;
	let persp = CAM_Z / (CAM_Z - z2 * 0.55);
	var px = u.res * 0.5 + vec2f(x3, y3) * k * persp;

	if (u.cursor_active > 0.5) {
		let dv = px - u.cursor;
		let r2 = dot(dv, dv);
		let rr = u.dimple_r * u.dimple_r;
		let push = exp(-r2 / (rr * 4.0)) * u.dimple_r * 0.7;
		px += (dv / (sqrt(r2) + 1e-4)) * push;
	}

	// Continuous depth shading, no front/back pop (parity with camera.ts shade()).
	let pl = max(length(vec3f(x3, y3, z2)), 1e-4);
	let lit = max(0.0, dot(vec3f(x3, y3, z2) / pl, LIGHT));
	let dc = clamp((z2 + 1.1) / 2.2, 0.0, 1.0);
	let dt = dc * dc * (3.0 - 2.0 * dc);
	// Dark ink over light paper reads washed-out at the same alpha as light ink
	// over dark paper, so boost density as ink luminance falls (day ≈ ×1.35).
	let lum = dot(u.ink, vec3f(0.2126, 0.7152, 0.0722));
	let gain = 1.0 + 0.4 * (1.0 - lum);
	let alpha = min(0.92, p.w * (0.28 + 0.72 * dt) * (0.6 + 0.5 * lit * dt) * gain);
	let size = u.dot_r * size_mul * (0.62 + 0.38 * dt);

	let corner = vec2f(f32(vi & 1u), f32(vi >> 1u)) * 2.0 - 1.0;
	let half = size + 1.0;
	let quad = px + corner * half;
	var out: VSOut;
	out.clip = vec4f((quad / u.res * 2.0 - 1.0) * vec2f(1.0, -1.0), 0.0, 1.0);
	out.local = corner * half;
	out.radius = size;
	out.alpha = alpha * u.fade;
	return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
	let a = (1.0 - smoothstep(in.radius - 0.5, in.radius + 0.5, length(in.local))) * in.alpha;
	if (a < 0.004) {
		discard;
	}
	// Premultiplied over the CSS paper background.
	return vec4f(u.ink * a, a);
}
