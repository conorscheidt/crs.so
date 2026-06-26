// Particles as fine dust motes: small round soft points (a hair of velocity
// elongation on the fast eclipse particles only). Small footprint keeps the
// field legible over prose, and the low overdraw keeps scroll smooth.

@group(0) @binding(1) var<storage, read> P: array<vec4f>;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) heat: f32,
  @location(2) bright: f32,
  @location(3) depth: f32,
};

@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VSOut {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
  );
  let part = P[ii];
  var p = part.xy;
  let vel = part.zw;
  let speed = length(vel);
  let dir = select(vec2f(1.0, 0.0), vel / max(speed, 1e-5), speed > 1e-5);
  let perp = vec2f(-dir.y, dir.x);

  // gravitational-lensing nudge: bow particles outward near the shadow rim
  let r = length(p);
  let lens = 0.06 * exp(-pow((r - HORIZON) / 0.16, 2.0));
  p = p + (p / max(r, 1e-5)) * lens;

  // Doppler beaming: left-moving (approaching) side brighter
  let beam = clamp(dot(dir, vec2f(-1.0, 0.18)), -1.0, 1.0);
  let bright = 0.42 + 1.05 * max(beam, 0.0) + 0.07 * max(-beam, 0.0);

  let driftAmt = max(U.ambient, U.scroll);

  // subtle disk tilt (eclipse only) → the flat field gains a slight elliptical
  // perspective + a real camera-depth axis for parallax, without leaving the
  // face-on look. The drift stays perfectly flat.
  let T = (1.0 - driftAmt) * 0.26;
  let camZ = p.y * sin(T);                  // + toward the camera
  let screenY = p.y * cos(T);
  let depthCam = clamp(0.5 + camZ * 1.15, 0.0, 1.0);
  let depth = mix(fract(f32(ii) * 0.6180339887), depthCam, 0.5 * (1.0 - driftAmt));

  // small round dust; near motes bigger/brighter. eclipse adds a small speed streak.
  let widPx = mix(1.0, 2.4, depth);
  let streak = clamp(speed * 1.1, 0.0, 2.4) * (1.0 - driftAmt);
  let lenPx = widPx + streak;

  let aspect = U.res.x / U.res.y;
  let c = corners[vi];
  let off = dir * (c.x * lenPx) + perp * (c.y * widPx);
  let ndc = vec2f(p.x / aspect, screenY) + vec2f(off.x / U.res.x * 2.0, off.y / U.res.y * 2.0);

  // spiral density-wave shimmer: slow brightness pulses sweep around the arms
  let arm = 2.0 * atan2(p.y, p.x) - 2.5 * log(max(r, 1e-3) / HORIZON);
  let shimmer = mix(1.0, 0.78 + 0.34 * sin(arm - U.time * 0.6), 1.0 - driftAmt);

  // infalling flares: ~3% of motes flare bright + hot as they near the horizon
  let isFlare = step(0.972, fract(f32(ii) * 0.123 + 3.7)) * (1.0 - driftAmt);
  let nearH = smoothstep(HORIZON + 0.30, HORIZON + 0.02, r);
  let flare = isFlare * nearH;

  // heat gradient: cool/dim in the outer field, hot near the horizon; flares hottest
  let radHeat = smoothstep(1.5, HORIZON, r);
  var o: VSOut;
  o.pos = vec4f(ndc, 0.0, 1.0);
  o.uv = c;
  o.heat = clamp(speed * 0.34 + radHeat * 0.6 * (1.0 - driftAmt) + flare, 0.0, 1.0);
  o.bright = bright * shimmer + flare * 3.0;
  o.depth = depth;
  return o;
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let d = length(in.uv);
  // round soft mote: far ones softer-edged, near ones crisp
  let soft = smoothstep(1.0, mix(0.45, 0.0, in.depth), d);
  let driftAmt = max(U.ambient, U.scroll);
  let depthLo = mix(0.46, 0.34, driftAmt);
  let depthHi = mix(1.40, 1.72, driftAmt);
  // light mode needs a stronger multiplier (dark ink on cream is far fainter than
  // glow on black). The drift stays fainter than the eclipse so it doesn't
  // read as grain over prose.
  let lightBoost = mix(3.6, 1.5, U.dark);
  let driftFaint = mix(1.0, 0.62, driftAmt);
  let scrollFade = mix(1.0, mix(0.6, 0.9, U.ambient), U.scroll);
  let a = soft * (0.13 + 0.17 * in.heat) * in.bright * mix(depthLo, depthHi, in.depth)
          * mix(1.0, 0.95, driftAmt) * lightBoost * driftFaint * scrollFade;
  // light: dark ink on cream. dark: warm light/coral glow on black.
  let inkC = mix(vec3f(0.085, 0.083, 0.072), vec3f(0.82, 0.78, 0.70), U.dark);
  let hotC = mix(vec3f(0.58, 0.16, 0.14), vec3f(0.98, 0.62, 0.44), U.dark);
  let col = mix(inkC, hotC, smoothstep(0.3, 1.0, in.heat) * 0.95);
  return vec4f(col * a, a);
}
