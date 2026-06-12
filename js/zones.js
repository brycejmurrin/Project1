/*
 * Zone-based procedural backgrounds for Neon Swarm.
 * Four themes rotate every three stages (nebula, asteroids, corona, void);
 * challenge stages always get a warp tunnel. Everything is solid-color
 * geometry drawn through the batched Renderer, before the starfield, and
 * stays well under ~400 verts per frame. Each zone also grades the frame
 * via a clear color that eases smoothly (~2s) on zone changes.
 */
"use strict";

const Zones = (function () {
  const ROTATION = ["nebula", "asteroids", "corona", "void"];

  const CLEAR_TARGETS = {
    nebula:    [0.04, 0.015, 0.10],
    asteroids: [0.025, 0.025, 0.045],
    corona:    [0.07, 0.03, 0.015],
    void:      [0.012, 0.012, 0.03],
    warp:      [0.02, 0.01, 0.05],
  };

  let active = "nebula";
  let time = 0;
  let states = {}; // lazily built per-zone state, keyed by zone name

  // Smoothed clear color, eased toward the active zone's target.
  const clearCur = [0.02, 0.024, 0.06];
  const clearTgt = CLEAR_TARGETS.nebula.slice();

  function rand(a, b) { return a + Math.random() * (b - a); }
  function vw() { return Renderer.width || 390; }
  function vh() { return Renderer.height || 844; }

  // --- Nebula: large drifting glow clouds -----------------------------------
  function initNebula(W, H) {
    const COLORS = [
      [0.55, 0.20, 0.90], // purple
      [0.85, 0.20, 0.75], // magenta
      [0.25, 0.35, 0.95], // blue
    ];
    const clouds = [];
    for (let i = 0; i < 5; i++) {
      const w = W * rand(0.40, 0.60);
      clouds.push({
        baseX: rand(0, W),
        y: (i + 0.5) * (H / 5) + rand(-H * 0.06, H * 0.06),
        w,
        h: w * rand(0.55, 0.85),
        vy: rand(6, 14),
        driftAmp: W * rand(0.04, 0.10),
        driftSpeed: rand(0.08, 0.25),
        driftPhase: rand(0, Math.PI * 2),
        rot: rand(0, Math.PI * 2),
        rotSpeed: rand(0.02, 0.07) * (i % 2 ? -1 : 1),
        color: COLORS[i % 3],
        alpha: rand(0.06, 0.12),
      });
    }
    return { W, H, clouds };
  }

  function updateNebula(st, dt) {
    for (const c of st.clouds) {
      c.y += c.vy * dt;
      c.rot += c.rotSpeed * dt;
      if (c.y - c.h / 2 > st.H) c.y = -c.h / 2; // wrap vertically
    }
  }

  function drawNebula(st) {
    for (const c of st.clouds) {
      const x = c.baseX + Math.sin(time * c.driftSpeed + c.driftPhase) * c.driftAmp;
      Renderer.rotQuad(x, c.y, c.w, c.h, c.rot,
        [c.color[0], c.color[1], c.color[2], c.alpha]);
    }
  }

  // --- Asteroids: two parallax layers of tumbling rocks ---------------------
  function initAsteroids(W, H) {
    function rock(near) {
      return {
        x: rand(0, W),
        y: rand(-H * 0.1, H),
        size: Math.max(near ? 14 : 6, W * (near ? rand(0.055, 0.10) : rand(0.02, 0.045))),
        ar: rand(0.65, 1.0), // aspect ratio for irregular look
        rot: rand(0, Math.PI * 2),
        rotSpeed: rand(0.4, 1.4) * (near ? 1 : 0.6) * (Math.random() < 0.5 ? -1 : 1),
        vy: near ? rand(80, 100) : rand(30, 40),
        alpha: near ? 0.14 : 0.07,
        color: near ? [0.52, 0.43, 0.34] : [0.42, 0.36, 0.30], // grey-brown
      };
    }
    const far = [];
    const near = [];
    for (let i = 0; i < 10; i++) far.push(rock(false));
    for (let i = 0; i < 5; i++) near.push(rock(true));
    return { W, H, far, near };
  }

  function updateAsteroids(st, dt) {
    const all = st.far.concat(st.near);
    for (const r of all) {
      r.y += r.vy * dt;
      r.rot += r.rotSpeed * dt;
      if (r.y - r.size > st.H) { // wrap at bottom, respawn random x
        r.y = -r.size;
        r.x = rand(0, st.W);
      }
    }
  }

  function drawAsteroids(st) {
    const all = st.far.concat(st.near);
    for (const r of all) {
      Renderer.rotQuad(r.x, r.y, r.size, r.size * r.ar, r.rot,
        [r.color[0], r.color[1], r.color[2], r.alpha]);
    }
  }

  // --- Corona: pulsing sun near top-center with slow radial spikes ----------
  function initCorona(W, H) {
    const spikes = [];
    for (let i = 0; i < 14; i++) {
      spikes.push({
        angle: (i / 14) * Math.PI * 2,
        len: Math.min(W, H) * rand(0.35, 0.55),
        thick: Math.max(4, W * rand(0.015, 0.030)),
        pulsePhase: rand(0, Math.PI * 2),
        pulseSpeed: rand(0.8, 1.6),
      });
    }
    return {
      W, H, spikes,
      cx: W * 0.5,
      cy: H * 0.10,
      haloSize: W * 0.30,
      outerSize: W * 0.85,
      rot: rand(0, Math.PI * 2),
      rotSpeed: 0.04, // very slow rotation
      pulseT: rand(0, 6),
    };
  }

  function updateCorona(st, dt) {
    st.rot += st.rotSpeed * dt;
    st.pulseT += dt;
  }

  function drawCorona(st) {
    const pulse = 0.5 + 0.5 * Math.sin(st.pulseT * 1.2);
    // Large faint outer halo.
    Renderer.rotQuad(st.cx, st.cy, st.outerSize, st.outerSize, st.rot * 0.5,
      [1.0, 0.45, 0.18, 0.035]);
    // Radial spikes, alpha pulsing 0.05-0.18.
    for (const sp of st.spikes) {
      const a = sp.angle + st.rot;
      const al = 0.05 + 0.13 * (0.5 + 0.5 * Math.sin(st.pulseT * sp.pulseSpeed + sp.pulsePhase));
      const mx = st.cx + Math.cos(a) * sp.len * 0.5;
      const my = st.cy + Math.sin(a) * sp.len * 0.5;
      Renderer.rotQuad(mx, my, sp.len, sp.thick, a, [1.0, 0.55, 0.20, al]);
    }
    // Center halo on top of the spikes.
    const hs = st.haloSize * (1 + 0.08 * pulse);
    Renderer.rotQuad(st.cx, st.cy, hs, hs, st.rot,
      [1.0, 0.62, 0.25, 0.10 + 0.08 * pulse]);
  }

  // --- Void: huge faint tri patches + random supernova flares ---------------
  function initVoid(W, H) {
    const patches = [];
    for (let i = 0; i < 3; i++) {
      const s = Math.max(W, H) * rand(0.45, 0.75);
      const p = [];
      for (let k = 0; k < 3; k++) {
        const a = k * 2.094 + rand(-0.5, 0.5);
        const r = s * rand(0.35, 0.55);
        p.push(Math.cos(a) * r, Math.sin(a) * r);
      }
      patches.push({
        x: rand(0, W), y: rand(0, H),
        vx: rand(-7, 7), vy: rand(3, 9),
        p, s,
        color: i % 2 ? [0.25, 0.30, 0.75] : [0.40, 0.22, 0.70],
      });
    }
    const novas = [];
    for (let i = 0; i < 6; i++) {
      novas.push({ x: rand(0, W), y: rand(0, H), wait: rand(0.5, 5), flare: 0 });
    }
    return { W, H, patches, novas };
  }

  function updateVoid(st, dt) {
    for (const p of st.patches) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const m = p.s * 0.6;
      if (p.x > st.W + m) p.x = -m;
      if (p.x < -m) p.x = st.W + m;
      if (p.y > st.H + m) p.y = -m;
      if (p.y < -m) p.y = st.H + m;
    }
    for (const n of st.novas) {
      if (n.flare > 0) {
        n.flare -= dt / 0.4; // decay over 0.4s
        if (n.flare <= 0) {
          n.flare = 0;
          n.wait = rand(1, 6);
          n.x = rand(0, st.W);
          n.y = rand(0, st.H);
        }
      } else {
        n.wait -= dt;
        if (n.wait <= 0) n.flare = 1;
      }
    }
  }

  function drawVoid(st) {
    for (const p of st.patches) {
      Renderer.tri(
        p.x + p.p[0], p.y + p.p[1],
        p.x + p.p[2], p.y + p.p[3],
        p.x + p.p[4], p.y + p.p[5],
        [p.color[0], p.color[1], p.color[2], 0.03]
      );
    }
    for (const n of st.novas) {
      if (n.flare <= 0) continue;
      const g = 18 + 22 * (1 - n.flare); // glow expands as the core fades
      Renderer.quad(n.x - g / 2, n.y - g / 2, g, g, [0.45, 0.55, 1.0, 0.18 * n.flare]);
      Renderer.rotQuad(n.x, n.y, 6, 6, n.flare * 5, [0.85, 0.92, 1.0, 0.7 * n.flare]);
    }
  }

  // --- Warp: spinning concentric rings scrolling downward (tunnel) ----------
  function initWarp(W, H) {
    const CYAN = [0.15, 0.85, 1.0];
    const MAG = [1.0, 0.25, 0.85];
    const rings = [];
    for (let i = 0; i < 10; i++) {
      rings.push({
        size: W * (0.3 + (i / 9) * 0.9), // 0.3*W .. 1.2*W
        y: (i / 10) * (H * 1.6) - H * 0.3,
        vy: rand(60, 110),
        rot: rand(0, Math.PI * 2),
        rotSpeed: rand(0.3, 0.8) * (i % 2 ? -1 : 1),
        color: i % 2 ? MAG : CYAN,
        alpha: rand(0.05, 0.09),
      });
    }
    return { W, H, rings };
  }

  function updateWarp(st, dt) {
    for (const r of st.rings) {
      r.y += r.vy * dt; // scroll downward
      r.rot += r.rotSpeed * dt;
      if (r.y > st.H * 1.3) r.y = -st.H * 0.3; // wrap to top
    }
  }

  function drawWarp(st) {
    const cx = st.W / 2;
    for (const r of st.rings) {
      Renderer.rotQuad(cx, r.y, r.size, r.size, r.rot,
        [r.color[0], r.color[1], r.color[2], r.alpha]);
    }
  }

  // --- Zone plumbing ---------------------------------------------------------
  const INIT = {
    nebula: initNebula,
    asteroids: initAsteroids,
    corona: initCorona,
    void: initVoid,
    warp: initWarp,
  };
  const UPDATE = {
    nebula: updateNebula,
    asteroids: updateAsteroids,
    corona: updateCorona,
    void: updateVoid,
    warp: updateWarp,
  };
  const DRAW = {
    nebula: drawNebula,
    asteroids: drawAsteroids,
    corona: drawCorona,
    void: drawVoid,
    warp: drawWarp,
  };

  function ensure(name) {
    if (!states[name]) states[name] = INIT[name](vw(), vh());
    return states[name];
  }

  function set(stage, isChallenge) {
    const name = isChallenge
      ? "warp"
      : ROTATION[Math.floor((stage - 1) / 3) % 4];
    active = name;
    const t = CLEAR_TARGETS[name];
    clearTgt[0] = t[0];
    clearTgt[1] = t[1];
    clearTgt[2] = t[2];
    ensure(name);
  }

  function update(dt) {
    time += dt;
    // Ease the clear color toward the target; ~96% converged after 2s.
    const k = 1 - Math.exp(-dt / 0.6);
    for (let i = 0; i < 3; i++) {
      clearCur[i] += (clearTgt[i] - clearCur[i]) * k;
    }
    UPDATE[active](ensure(active), dt);
  }

  function draw(W, H) {
    DRAW[active](ensure(active), W, H);
  }

  function clearColor() {
    return clearCur;
  }

  function resize() {
    states = {}; // drop all cached layouts; rebuild for the new viewport
    ensure(active);
  }

  return { set, update, draw, clearColor, resize };
})();
