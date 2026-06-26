// Central sphere: analytic ray-sphere intersection (exact → true depth). A
// near-black ball with a soft directional key light carving a lit crescent,
// plus limb darkening, so it shades as a 3D sphere:
//   • dark mode → near-black ball melting into the black bg, faint warm horizon rim
//   • light mode → a shaded dark sphere on cream
// Drawn first; the dust + rings composite over it. Fades out as the field drifts
// (scroll / blog) so the eclipse dissolves cleanly. Normal (premultiplied) blend.

@vertex fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

@fragment fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  var uv = (frag.xy - 0.5 * U.res) / U.res.y;
  uv.y = -uv.y;
  let R = HORIZON;
  let r = length(uv);
  if (r > R) { discard; }

  // sphere surface + normal
  let z = sqrt(max(R * R - r * r, 0.0));
  let n = vec3f(uv, z) / R;
  let ndv = clamp(n.z, 0.0, 1.0);
  let fres = pow(1.0 - ndv, 3.0);

  // directional key light (upper-left, toward camera) → the 3D terminator
  let L = normalize(vec3f(-0.52, 0.6, 0.6));
  let diff = clamp(dot(n, L), 0.0, 1.0);
  let term = pow(diff, 1.25);
  let ao = mix(0.5, 1.0, ndv);              // limb darkening

  let oxblood = vec3f(0.72, 0.21, 0.15);
  // body luminance: a clear lit crescent → dark side. dark theme sits much darker
  // than light theme (dark ball must read against black; light ball against cream).
  let gDark = mix(0.006, 0.055, term) * ao;
  let bodyDark = vec3f(gDark) * vec3f(1.0, 0.95, 0.9);
  let bodyLight = vec3f(mix(0.07, 0.17, term) * ao);  // dark slate ball, visible gradient
  var col = mix(bodyLight, bodyDark, U.dark);
  // warm horizon rim (merges into the photon ring drawn just outside). Stronger in
  // light mode so the silhouette stays crisp even when the interior is kept airy.
  col += oxblood * fres * mix(0.6, 0.4, U.dark);

  let edge = smoothstep(R, R - 0.014, r);   // soft silhouette
  let driftAmt = max(U.ambient, U.scroll);
  // dark: near-opaque (col is near-black on black → only the crescent + rim read).
  // light: alpha follows the terminator → the lit face is airy (cream shows, text
  // stays legible) and the shadowed face holds the shape.
  let aDark = edge * (1.0 - driftAmt);
  let aLight = edge * (0.18 + 0.34 * (1.0 - term)) * (1.0 - driftAmt);
  let a = mix(aLight, aDark, U.dark);
  return vec4f(col * a, a);
}
