// Photon rings: a double ring at the event horizon (additive), a bright
// outer photon ring + a tight inner lensed echo straddling the silhouette, with
// soft top/bottom Einstein arcs and a faint halo. Doppler-brightened on the
// approaching (left) side. Eclipse only → fades out as the field drifts.
@vertex fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
@fragment fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  var uv = (frag.xy - 0.5 * U.res) / U.res.y; uv.y = -uv.y;
  let r = length(uv);
  let ang = atan2(uv.y, uv.x);
  // two distinct crisp rings: the outer photon ring sits just off the horizon, the
  // inner lensed echo hugs the silhouette.
  let outer = exp(-pow((r - HORIZON - 0.028) / 0.0050, 2.0)) * 1.30;
  let inner = exp(-pow((r - HORIZON + 0.004) / 0.0042, 2.0)) * 0.78;
  let halo  = exp(-pow((r - HORIZON - 0.06) / 0.08, 2.0)) * 0.12;
  // lensed accretion arcs wrap top + bottom of the shadow (Einstein ring)
  let arcTop = exp(-pow((r - HORIZON - 0.04) / 0.05, 2.0)) * smoothstep(-0.05, 0.7, uv.y) * 0.40;
  let arcBot = exp(-pow((r - HORIZON - 0.02) / 0.03, 2.0)) * smoothstep(-0.05, 0.55, -uv.y) * 0.22;
  // Doppler brightening on the approaching (left) side
  let dop = 0.6 + 0.74 * max(cos(ang + 3.14159), 0.0);
  let driftAmt = max(U.ambient, U.scroll);
  let i = ((outer + inner) * dop + halo + arcTop + arcBot) * (1.0 - driftAmt);
  let col = mix(vec3f(0.55, 0.16, 0.16), vec3f(0.96, 0.92, 0.86), 0.6);
  return vec4f(col * i, i);
}
