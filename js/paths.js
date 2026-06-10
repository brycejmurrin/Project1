/*
 * Path generation for Galaga-style enemy choreography.
 * Builds smooth Catmull-Rom splines through waypoints and exposes them as
 * arc-length-parameterized path objects: { length, posAt(s) }.
 * Coordinates are logical CSS pixels, origin top-left, y down.
 * Heading angle: radians, 0 = up (negative y), positive = clockwise,
 * i.e. angle = Math.atan2(dx, -dy) for a velocity (dx, dy).
 */
"use strict";

const Paths = (function () {
  const SAMPLE_SPACING = 4; // approx px of arc length between table entries
  const SUBDIV = 16; // raw subdivisions per spline segment before resampling

  // Catmull-Rom interpolation (centripetal-ish via uniform form; waypoints
  // are spaced generously so uniform works fine and stays cheap).
  function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return {
      x:
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y:
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    };
  }

  function build(pts) {
    if (!pts || pts.length < 2) {
      throw new Error("Paths.build requires at least 2 waypoints");
    }

    // Duplicate endpoints so the spline passes through first/last points.
    const cp = [pts[0]].concat(pts, [pts[pts.length - 1]]);

    // Raw dense sampling of every segment.
    const raw = [];
    for (let i = 0; i + 3 < cp.length; i++) {
      // Scale subdivisions with segment chord length so long hops stay smooth.
      const chord = Math.hypot(cp[i + 2].x - cp[i + 1].x, cp[i + 2].y - cp[i + 1].y);
      const steps = Math.max(SUBDIV, Math.ceil(chord / 2));
      for (let j = 0; j < steps; j++) {
        raw.push(catmullRom(cp[i], cp[i + 1], cp[i + 2], cp[i + 3], j / steps));
      }
    }
    raw.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y });

    // Cumulative arc length over raw samples.
    const cum = new Float64Array(raw.length);
    let total = 0;
    for (let i = 1; i < raw.length; i++) {
      const d = Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y);
      total += d;
      cum[i] = total;
    }
    if (total <= 0) {
      // Degenerate (all points identical): a stationary path.
      const px = raw[0].x;
      const py = raw[0].y;
      return {
        length: 0,
        posAt: function () {
          return { x: px, y: py, angle: 0 };
        },
      };
    }

    // Resample to a uniform arc-length table for O(1) lookup.
    const n = Math.max(2, Math.ceil(total / SAMPLE_SPACING) + 1);
    const step = total / (n - 1);
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    let ri = 0;
    for (let k = 0; k < n; k++) {
      const target = k * step;
      while (ri < raw.length - 2 && cum[ri + 1] < target) ri++;
      const segLen = cum[ri + 1] - cum[ri];
      const f = segLen > 1e-9 ? (target - cum[ri]) / segLen : 0;
      xs[k] = raw[ri].x + (raw[ri + 1].x - raw[ri].x) * f;
      ys[k] = raw[ri].y + (raw[ri + 1].y - raw[ri].y) * f;
    }
    xs[n - 1] = raw[raw.length - 1].x;
    ys[n - 1] = raw[raw.length - 1].y;

    function posAt(s) {
      if (!isFinite(s)) s = 0;
      if (s < 0) s = 0;
      if (s > total) s = total;
      let i = Math.floor(s / step);
      if (i > n - 2) i = n - 2;
      const f = s / step - i;
      const x = xs[i] + (xs[i + 1] - xs[i]) * f;
      const y = ys[i] + (ys[i + 1] - ys[i]) * f;
      // Heading from neighboring samples (central difference where possible).
      let a = i > 0 ? i - 1 : i;
      let b = i + 2 < n ? i + 2 : i + 1;
      let dx = xs[b] - xs[a];
      let dy = ys[b] - ys[a];
      if (dx === 0 && dy === 0) {
        // Zero-length guard: fall back to immediate segment, then to "up".
        dx = xs[i + 1] - xs[i];
        dy = ys[i + 1] - ys[i];
        if (dx === 0 && dy === 0) return { x: x, y: y, angle: 0 };
      }
      return { x: x, y: y, angle: Math.atan2(dx, -dy) };
    }

    return { length: total, posAt: posAt };
  }

  // Approximate a circle with waypoints; Catmull-Rom rounds it out.
  // startA: angle (radians, 0 = up, clockwise positive) of the first point on
  // the circle relative to its center; dir: +1 clockwise, -1 counterclockwise.
  // turns: fraction of a full revolution (1 = full loop).
  function loopPoints(cx, cy, r, startA, dir, turns, steps) {
    const pts = [];
    const total = Math.PI * 2 * turns;
    for (let i = 1; i <= steps; i++) {
      const a = startA + dir * (total * i) / steps;
      pts.push({ x: cx + Math.sin(a) * r, y: cy - Math.cos(a) * r });
    }
    return pts;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function mirrorX(pts, W) {
    return pts.map(function (p) {
      return { x: W - p.x, y: p.y };
    });
  }

  // --- Formation entry choreography -------------------------------------

  function entry(variant, W, H) {
    const m = 30; // on-screen margin for loops
    let pts;
    switch (((variant % 4) + 4) % 4) {
      case 0:
      case 1: {
        // Enter offscreen top-left heading down, sweep right, full loop on
        // the right side, end moving up toward upper-center.
        const r = clamp(W * 0.18, 24, Math.min(W, H) * 0.3);
        const cx = clamp(W * 0.72, m + r, W - m - r);
        const cy = clamp(H * 0.5, m + r, H - m - r);
        pts = [
          { x: W * 0.18, y: -70 },
          { x: W * 0.16, y: H * 0.12 },
          { x: W * 0.28, y: H * 0.3 },
          { x: W * 0.5, y: H * 0.42 },
          // Approach the loop from its left side, going down.
          { x: cx - r, y: cy },
        ];
        // Full clockwise-ish loop: start at left of circle moving down means
        // counterclockwise in our angle terms; sweep a full revolution.
        pts = pts.concat(loopPoints(cx, cy, r, -Math.PI / 2, -1, 1, 8));
        // Exit upward toward upper-center.
        pts.push({ x: cx - r * 1.3, y: cy - r * 1.6 });
        pts.push({ x: W * 0.5, y: H * 0.26 });
        if ((((variant % 4) + 4) % 4) === 1) pts = mirrorX(pts, W);
        break;
      }
      case 2:
      case 3:
      default: {
        // Enter from the left edge at ~H*0.75 heading right, S-curve climb
        // up the middle, small loop, end upper-center.
        const r = clamp(W * 0.12, 20, Math.min(W, H) * 0.22);
        const cx = clamp(W * 0.62, m + r, W - m - r);
        const cy = clamp(H * 0.42, m + r, H - m - r);
        pts = [
          { x: -70, y: H * 0.75 },
          { x: W * 0.25, y: H * 0.74 },
          { x: W * 0.55, y: H * 0.68 },
          { x: W * 0.72, y: H * 0.58 },
          { x: W * 0.55, y: H * 0.5 },
          // Small loop in the upper middle area.
          { x: cx, y: cy + r },
        ];
        pts = pts.concat(loopPoints(cx, cy, r, Math.PI, 1, 1, 7));
        pts.push({ x: W * 0.5, y: H * 0.28 });
        if ((((variant % 4) + 4) % 4) === 3) pts = mirrorX(pts, W);
        break;
      }
    }
    return build(pts);
  }

  // --- Attack dive --------------------------------------------------------

  function dive(sx, sy, targetX, W, H) {
    const dir = Math.random() < 0.5 ? -1 : 1; // first horizontal lean
    const xmin = 20;
    const xmax = W - 20;
    const cx = function (x) {
      return clamp(x, xmin, xmax);
    };
    const wob = W * (0.18 + Math.random() * 0.12);
    const tx = clamp(targetX, xmin, xmax);

    const pts = [
      { x: sx, y: sy },
      // Wind-up bob: rise ~20px and drift to one side.
      { x: cx(sx - dir * 14), y: sy - 20 },
      { x: cx(sx + dir * 10), y: sy - 12 },
      // Swoop down in a wide S-curve.
      { x: cx(sx + dir * wob), y: sy + (H * 0.78 - sy) * 0.3 },
      { x: cx(tx - dir * wob * 0.8), y: sy + (H * 0.78 - sy) * 0.62 },
      // Pass within ~30px of targetX around y = H*0.78.
      { x: cx(tx + dir * 10), y: H * 0.78 },
      // Continue down and exit offscreen.
      { x: cx(tx + dir * wob * 0.45), y: H * 0.92 },
      { x: cx(tx + dir * wob * 0.6), y: H + 70 },
    ];
    return build(pts);
  }

  // --- Boss tractor-beam descent -------------------------------------------

  function bossDive(sx, sy, targetX, W, H) {
    const tx = clamp(targetX, W * 0.2, W * 0.8);
    const ty = H * 0.52;
    const dir = sx <= tx ? 1 : -1; // overshoot away from the approach side
    const over = clamp(W * 0.12, 24, 80);

    const pts = [
      { x: sx, y: sy },
      // Wind-up bob.
      { x: clamp(sx - dir * 14, 20, W - 20), y: sy - 20 },
      { x: clamp(sx + dir * 8, 20, W - 20), y: sy - 10 },
      // Smooth curve down toward hover point.
      { x: clamp(sx + dir * W * 0.16, 20, W - 20), y: sy + (ty - sy) * 0.35 },
      { x: clamp(tx + dir * over, 20, W - 20), y: sy + (ty - sy) * 0.75 },
      // Overshoot slightly to one side, then settle.
      { x: clamp(tx + dir * over * 0.55, 20, W - 20), y: ty + 14 },
      { x: tx, y: ty },
    ];
    return build(pts);
  }

  // --- Exit / retreat ------------------------------------------------------

  function exit(sx, sy, W, H) {
    const dir = sx < W * 0.5 ? 1 : -1; // gentle lean toward center first
    const sway = clamp(W * 0.1, 20, 60);
    const pts = [
      { x: sx, y: sy },
      { x: clamp(sx + dir * sway, 20, W - 20), y: sy - H * 0.12 },
      { x: clamp(sx - dir * sway * 0.6, 20, W - 20), y: sy - H * 0.28 },
      { x: clamp(sx + dir * sway * 0.3, 20, W - 20), y: sy - H * 0.45 },
      { x: clamp(sx, 20, W - 20), y: -70 },
    ];
    return build(pts);
  }

  // --- Challenge (bonus) stage fly-throughs --------------------------------

  function challenge(variant, W, H) {
    const m = 30;
    const v = ((variant % 5) + 5) % 5;
    let pts;
    switch (v) {
      case 0: {
        // Figure-eight-ish: in from top-left, loop right then loop left,
        // exit bottom-right.
        const r = clamp(W * 0.16, 24, Math.min(W, H) * 0.25);
        const c1x = clamp(W * 0.68, m + r, W - m - r);
        const c1y = clamp(H * 0.3, m + r, H - m - r);
        const c2x = clamp(W * 0.32, m + r, W - m - r);
        const c2y = clamp(H * 0.55, m + r, H - m - r);
        pts = [{ x: W * 0.2, y: -70 }, { x: W * 0.3, y: H * 0.14 }, { x: c1x - r, y: c1y }];
        pts = pts.concat(loopPoints(c1x, c1y, r, -Math.PI / 2, -1, 1, 7));
        pts.push({ x: c2x + r, y: c2y });
        pts = pts.concat(loopPoints(c2x, c2y, r, Math.PI / 2, 1, 1, 7));
        pts.push({ x: W * 0.6, y: H * 0.8 });
        pts.push({ x: W * 0.75, y: H + 70 });
        break;
      }
      case 1: {
        // Serpentine straight down the middle, exit bottom.
        const a = clamp(W * 0.3, 40, W * 0.5 - m);
        pts = [{ x: W * 0.5, y: -70 }];
        for (let i = 1; i <= 7; i++) {
          const side = i % 2 === 1 ? 1 : -1;
          pts.push({ x: W * 0.5 + side * a, y: H * (0.08 + i * 0.115) });
        }
        pts.push({ x: W * 0.5, y: H + 70 });
        break;
      }
      case 2: {
        // Big arc from left with a double loop mid-screen, exit right.
        const r = clamp(W * 0.14, 22, Math.min(W, H) * 0.22);
        const cx = clamp(W * 0.5, m + r, W - m - r);
        const cy = clamp(H * 0.42, m + r, H - m - r);
        pts = [
          { x: -70, y: H * 0.3 },
          { x: W * 0.25, y: H * 0.22 },
          { x: W * 0.5, y: H * 0.2 },
          { x: cx + r, y: cy },
        ];
        pts = pts.concat(loopPoints(cx, cy, r, Math.PI / 2, 1, 2, 14));
        pts.push({ x: W * 0.75, y: H * 0.5 });
        pts.push({ x: W + 70, y: H * 0.58 });
        break;
      }
      case 3: {
        // Mirror of 2: in from the right, double loop, exit left.
        const r = clamp(W * 0.14, 22, Math.min(W, H) * 0.22);
        const cx = clamp(W * 0.5, m + r, W - m - r);
        const cy = clamp(H * 0.42, m + r, H - m - r);
        pts = [
          { x: W + 70, y: H * 0.3 },
          { x: W * 0.75, y: H * 0.22 },
          { x: W * 0.5, y: H * 0.2 },
          { x: cx - r, y: cy },
        ];
        pts = pts.concat(loopPoints(cx, cy, r, -Math.PI / 2, -1, 2, 14));
        pts.push({ x: W * 0.25, y: H * 0.5 });
        pts.push({ x: -70, y: H * 0.58 });
        break;
      }
      case 4:
      default: {
        // Dive from the top, big swooping U across the bottom with a loop,
        // climb across the middle and exit off the left edge.
        const r = clamp(W * 0.15, 24, Math.min(W, H) * 0.22);
        const cx = clamp(W * 0.7, m + r, W - m - r);
        const cy = clamp(H * 0.6, m + r, H - m - r);
        pts = [
          { x: W * 0.85, y: -70 },
          { x: W * 0.7, y: H * 0.2 },
          { x: W * 0.4, y: H * 0.45 },
          { x: W * 0.3, y: H * 0.7 },
          { x: W * 0.5, y: H * 0.8 },
          { x: cx, y: cy + r },
        ];
        pts = pts.concat(loopPoints(cx, cy, r, Math.PI, -1, 1, 7));
        pts.push({ x: W * 0.45, y: H * 0.38 });
        pts.push({ x: W * 0.25, y: H * 0.24 });
        pts.push({ x: -70, y: H * 0.14 });
        break;
      }
    }
    return build(pts);
  }

  return {
    build: build,
    entry: entry,
    dive: dive,
    bossDive: bossDive,
    exit: exit,
    challenge: challenge,
  };
})();
