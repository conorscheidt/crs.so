// Particle integrator. Two regimes share one buffer:
//   driftAmt = 0 → black-hole gravity (homepage eclipse)
//   driftAmt = 1 → calm curl-noise drift (every blog page)
// The homepage rides scroll so the eclipse dissolves into the drift as you read.
// Endpoints (0 / 1) skip the unused integrator entirely. The branch is on a
// uniform, so every invocation takes the same path (no warp divergence), which
// halves the ALU on the homepage hero and on the blog where one side is dead.

@group(0) @binding(1) var<storage, read_write> P: array<vec4f>;

fn rand(s: f32) -> f32 { return fract(sin(s) * 43758.5453123); }

// map cursor (device px) to the same world space the render uses
fn mouseWorld() -> vec2f {
  return vec2f((2.0 * U.mouse.x - U.res.x) / U.res.y,
               1.0 - 2.0 * U.mouse.y / U.res.y);
}

// seed on one of two trailing log-spiral arms
fn respawn(i: u32) -> vec4f {
  let s = f32(i) * 0.6180339887 + U.time * 0.123;
  let arm = floor(rand(s) * 2.0);
  let rad = 0.45 + rand(s * 1.7) * 0.92;
  let jitter = (rand(s * 3.3) - 0.5) * 0.34;
  let ang = arm * PI + 2.5 * log(rad / HORIZON) + jitter;
  let pos = vec2f(cos(ang), sin(ang)) * rad;
  let tang = vec2f(-sin(ang), cos(ang));
  let speed = sqrt(0.10 / rad) * (0.94 + 0.22 * rand(s * 2.3));
  return vec4f(pos, tang * speed);
}

@compute @workgroup_size(64)
fn cs(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= u32(U.count)) { return; }
  var pos = P[i].xy;
  var vel = P[i].zw;
  let dt = U.dt;

  let driftAmt = max(U.ambient, U.scroll);
  let mw = mouseWorld();
  let doGrav = driftAmt < 0.999;   // eclipse side alive?
  let doDrift = driftAmt > 0.001;  // drift side alive?

  var velDrift = vel;
  if (doDrift) {
    // base: curl of a multi-octave sine potential
    let t2 = U.time;
    let dpsidy = -0.70 * sin(pos.y * 0.7 - t2 * 0.11) + 0.28 * cos((pos.x + pos.y) * 0.6 + t2 * 0.06)
                 - 0.32 * sin(pos.y * 1.8 + t2 * 0.05) + 0.16 * cos(pos.x * 2.3 - t2 * 0.04);
    let dpsidx =  0.80 * cos(pos.x * 0.8 + t2 * 0.09) + 0.28 * cos((pos.x + pos.y) * 0.6 + t2 * 0.06)
                 + 0.32 * sin(pos.x * 1.7 - t2 * 0.05) + 0.16 * sin(pos.y * 2.1 + t2 * 0.04);
    var flow = vec2f(dpsidy, -dpsidx);

    // structured currents: two slow counter-rotating vortices drifting across the
    // field → coherent filaments/swirls rather than uniform noise
    let vc1 = vec2f(0.95 * sin(t2 * 0.050), 0.55 * cos(t2 * 0.041));
    let vc2 = vec2f(-0.85 * cos(t2 * 0.037), 0.62 * sin(t2 * 0.045));
    let e1 = pos - vc1;
    let e2 = pos - vc2;
    flow += vec2f(-e1.y, e1.x) * (0.14 / (dot(e1, e1) + 0.28));
    flow -= vec2f(-e2.y, e2.x) * (0.12 / (dot(e2, e2) + 0.28));

    // central swirl (echoes the eclipse)
    let rc = length(pos) + 0.001;
    let core = pos / rc;
    flow += vec2f(-core.y, core.x) * (0.085 / (rc * rc + 0.35));
    flow -= core * 0.04 * smoothstep(0.15, 1.3, rc);

    // reactive: the field streams as you scroll
    flow += vec2f(0.0, -U.scrollVel * 0.9);

    let mag = 0.80 + 0.30 * sin(t2 * 0.08);                                // gentle breathing
    let wave = 0.82 + 0.26 * sin(pos.x * 0.8 + pos.y * 0.55 - t2 * 0.12);  // density waves
    let dep = fract(f32(i) * 0.6180339887);                               // near layers faster → parallax
    let par = mix(0.7, 1.35, dep);
    let dmD = pos - mw;
    let rmD = length(dmD);
    if (U.present > 0.5 && U.down < 0.5 && rmD < 0.22) {   // hover: stir the field (swirl + part)
      let fall = 0.22 - rmD;
      flow += (dmD / max(rmD, 1e-4)) * fall * 3.0;
      flow += vec2f(-dmD.y, dmD.x) / max(rmD, 1e-4) * fall * 5.0;
    }
    if (U.down > 0.5) {                                     // hold: local gather
      let d = mw - pos;
      flow += normalize(d) * 0.9 * exp(-dot(d, d) * 3.0);
    }
    velDrift = mix(vel, flow * 0.45 * mag * par * wave, 0.07);
  }

  var velGrav = vel;
  if (doGrav) {
    let r2 = dot(pos, pos) + 0.0009;
    let r = sqrt(r2);
    let dir = pos / r;
    let G = 0.10;
    var acc = -dir * G / r2;
    acc += -dir * G * 0.013 / (r2 * r2);
    acc += vec2f(-dir.y, dir.x) * 0.02 / r;
    // two-octave turbulence → organic texture + a slow large-scale swirl
    let tt = U.time;
    acc += vec2f(sin(pos.y * 2.3 - tt * 0.10) + 0.5 * cos(pos.x * 3.7 + tt * 0.07),
                 cos(pos.x * 2.1 + tt * 0.09) + 0.5 * sin(pos.y * 3.3 - tt * 0.06)) * 0.017;
    acc += vec2f(sin(pos.y * 0.9 + tt * 0.05), cos(pos.x * 0.8 - tt * 0.045)) * 0.013;
    // the pointer is a small roaming mass: it gravitationally bends + drags the
    // nearby arms toward it (with a touch of frame-drag swirl) over a wide radius.
    if (U.present > 0.5 && U.down < 0.5) {
      let d = mw - pos;
      let rm = length(d) + 1e-4;
      let pull = clamp(0.075 / (rm * rm + 0.02), 0.0, 5.0);
      acc += (d / rm) * pull;
      acc += vec2f(-d.y, d.x) / rm * pull * 0.4;
    }
    if (U.down > 0.5) {                                  // hold: stronger local gather
      let d = mw - pos;
      acc += normalize(d) * 1.4 * exp(-dot(d, d) * 2.2);
    }
    velGrav = vel + acc * dt;
    velGrav *= 0.9990;
  }

  // blend integrators by drift-ness, then advance (drift moves a touch slower)
  vel = mix(velGrav, velDrift, driftAmt);
  pos += vel * dt * mix(1.0, 0.7, driftAmt);

  let nr = length(pos);
  let captured = nr < HORIZON || nr > 2.6 || dot(vel, vel) > 12.0;
  if (driftAmt < 0.5 && captured) {
    P[i] = respawn(i);                              // still an eclipse → recycle on the arms
  } else {
    if (pos.x > 1.95) { pos.x = pos.x - 3.9; }       // drifting → wrap the field box
    if (pos.x < -1.95) { pos.x = pos.x + 3.9; }
    if (pos.y > 1.2) { pos.y = pos.y - 2.4; }
    if (pos.y < -1.2) { pos.y = pos.y + 2.4; }
    P[i] = vec4f(pos, vel);
  }
}
