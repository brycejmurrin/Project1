/*
 * Sprite drawing for the Galaga-style game.
 * Every function is pure drawing (no state): positioned by CENTER (x, y),
 * built from Renderer.tri / Renderer.quad / Renderer.rotQuad.
 *
 * Local sprite space: x right, y DOWN (so -ly is toward the nose / "up"),
 * units are pixels at scale 1. Angle 0 = facing up, positive = clockwise,
 * matching the renderer's rotQuad convention.
 */
"use strict";

const Sprites = (function () {
  // ---------------------------------------------------------------------
  // Shared helpers: place parts in sprite-local space, rotated by `angle`.
  // ---------------------------------------------------------------------

  // Rotate a local-space offset (lx, ly) clockwise by `angle` (screen coords,
  // y down, so the standard rotation matrix gives clockwise rotation).
  function rotX(lx, ly, c, s) { return lx * c - ly * s; }
  function rotY(lx, ly, c, s) { return lx * s + ly * c; }

  // Draw a rotated quad belonging to a sprite centered at (x, y) facing
  // `angle`. (lx, ly) is the part's local offset, (w, h) its size, `rot`
  // its own extra rotation, all scaled by `scale`.
  function part(x, y, angle, scale, lx, ly, w, h, rot, color) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const px = x + rotX(lx * scale, ly * scale, c, s);
    const py = y + rotY(lx * scale, ly * scale, c, s);
    Renderer.rotQuad(px, py, w * scale, h * scale, rot + angle, color);
  }

  // Draw a triangle given three local-space vertices of a sprite centered
  // at (x, y) facing `angle`.
  function triPart(x, y, angle, scale, x1, y1, x2, y2, x3, y3, color) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    Renderer.tri(
      x + rotX(x1 * scale, y1 * scale, c, s), y + rotY(x1 * scale, y1 * scale, c, s),
      x + rotX(x2 * scale, y2 * scale, c, s), y + rotY(x2 * scale, y2 * scale, c, s),
      x + rotX(x3 * scale, y3 * scale, c, s), y + rotY(x3 * scale, y3 * scale, c, s),
      color
    );
  }

  function frac(v) {
    return v - Math.floor(v);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // ---------------------------------------------------------------------
  // Palette
  // ---------------------------------------------------------------------
  const WHITE = [1, 1, 1, 1];
  const RED = [0.95, 0.2, 0.2, 1];
  const BLUE = [0.3, 0.6, 1, 1];
  const BEE_YELLOW = [1, 0.85, 0.2, 1];
  const BEE_BLUE = [0.35, 0.5, 1, 1];
  const FLY_RED = [0.95, 0.25, 0.3, 1];
  const FLY_WHITE = [0.95, 0.95, 1, 1];
  const BOSS_GREEN = [0.3, 0.9, 0.45, 1];
  const BOSS_PURPLE = [0.75, 0.35, 0.95, 1];

  // ---------------------------------------------------------------------
  // Player color themes.
  // Each theme: hull (main body/wings/cannons), accent (stripes, chevron,
  // wing trim, cannon tips), cockpit (canopy dot), glow (soft halo under
  // the ship, low alpha) and engine (tail exhaust glow).
  // 'classic' reproduces the original hardcoded palette exactly.
  // ---------------------------------------------------------------------
  const THEMES = [
    {
      id: 'classic', name: 'Classic',
      hull: [1, 1, 1, 1],                 // white
      accent: [0.95, 0.2, 0.2, 1],        // red
      cockpit: [0.3, 0.6, 1, 1],          // blue
      glow: [0.6, 0.7, 1, 0.13],
      engine: [0.4, 0.7, 1, 0.45],
    },
    {
      id: 'cyan', name: 'Cyan',
      hull: [0.2, 0.9, 0.95, 1],          // neon teal
      accent: [1, 1, 1, 1],               // white
      cockpit: [0.15, 0.25, 0.85, 1],     // deep blue
      glow: [0.3, 0.9, 1, 0.13],
      engine: [0.35, 0.95, 1, 0.45],
    },
    {
      id: 'crimson', name: 'Crimson',
      hull: [0.95, 0.18, 0.25, 1],        // arcade red
      accent: [1, 0.8, 0.2, 1],           // gold
      cockpit: [1, 0.9, 0.55, 1],         // pale amber
      glow: [1, 0.3, 0.3, 0.13],
      engine: [1, 0.5, 0.25, 0.45],
    },
    {
      id: 'emerald', name: 'Emerald',
      hull: [0.25, 0.95, 0.55, 1],        // spring green
      accent: [1, 1, 1, 1],               // white
      cockpit: [0.25, 0.55, 1, 1],        // blue
      glow: [0.35, 1, 0.55, 0.13],
      engine: [0.4, 1, 0.6, 0.45],
    },
    {
      id: 'violet', name: 'Violet',
      hull: [0.8, 0.35, 1, 1],            // electric purple
      accent: [0.3, 0.95, 1, 1],          // cyan
      cockpit: [0.8, 1, 1, 1],            // pale ice
      glow: [0.75, 0.4, 1, 0.13],
      engine: [0.85, 0.5, 1, 0.45],
    },
    {
      id: 'gold', name: 'Gold',
      hull: [1, 0.78, 0.2, 1],            // amber gold
      accent: [0.12, 0.1, 0.16, 1],       // near-black trim
      cockpit: [0.3, 0.7, 1, 1],          // bright blue (stays visible)
      glow: [1, 0.85, 0.4, 0.13],
      engine: [1, 0.7, 0.3, 0.45],
    },
  ];

  let currentTheme = THEMES[0]; // default 'classic'

  // Set the active player theme by id; unknown ids fall back to 'classic'.
  // Returns the applied theme object.
  function setPlayerTheme(id) {
    let theme = THEMES[0];
    for (let i = 0; i < THEMES.length; i++) {
      if (THEMES[i].id === id) { theme = THEMES[i]; break; }
    }
    currentTheme = theme;
    return currentTheme;
  }

  function getPlayerTheme() {
    return currentTheme.id;
  }

  // ---------------------------------------------------------------------
  // 1. Player fighter (~30px tall at scale 1)
  // ---------------------------------------------------------------------
  function player(x, y, scale, angle) {
    if (scale === undefined) scale = 1;
    angle = angle || 0;
    const a = angle, sc = scale;
    const t = currentTheme;

    // Soft glow halo under the whole ship.
    part(x, y, a, sc, 0, 0, 28, 36, 0, t.glow);

    // Central fuselage: needle nose down to the base.
    triPart(x, y, a, sc, 0, -15, -3, -1, 3, -1, t.hull);    // nose cone
    part(x, y, a, sc, 0, 5, 6, 13, 0, t.hull);              // hull body
    triPart(x, y, a, sc, 0, -15, -1.2, -1, 1.2, -1, [1, 1, 1, 0.55]); // hot core (specular, stays white)

    // Accent side stripes along the hull.
    part(x, y, a, sc, -3.6, 5, 2, 11, 0, t.accent);
    part(x, y, a, sc, 3.6, 5, 2, 11, 0, t.accent);
    // Accent chevron at the base of the nose.
    triPart(x, y, a, sc, 0, -7, -2.4, -1, 2.4, -1, t.accent);

    // Cockpit dot.
    part(x, y, a, sc, 0, -2.5, 2.6, 3.2, 0, t.cockpit);

    // Wings flaring out at the base.
    triPart(x, y, a, sc, -3, 1, -11, 12, -3, 12, t.hull);
    triPart(x, y, a, sc, 3, 1, 11, 12, 3, 12, t.hull);
    // Accent wing trim.
    triPart(x, y, a, sc, -4.5, 7, -10, 11.5, -4.5, 11.5, t.accent);
    triPart(x, y, a, sc, 4.5, 7, 10, 11.5, 4.5, 11.5, t.accent);

    // Side cannons riding the wing tips.
    part(x, y, a, sc, -9.2, 8, 2.4, 11, 0, t.hull);
    part(x, y, a, sc, 9.2, 8, 2.4, 11, 0, t.hull);
    part(x, y, a, sc, -9.2, 3.2, 1.4, 3, 0, t.accent);  // cannon tips
    part(x, y, a, sc, 9.2, 3.2, 1.4, 3, 0, t.accent);

    // Engine glow at the tail.
    part(x, y, a, sc, 0, 12.5, 4, 3, 0, t.engine);
  }

  // ---------------------------------------------------------------------
  // 2. Bee "Zako" (~22px at scale 1)
  // ---------------------------------------------------------------------
  function bee(x, y, scale, angle, wingPhase) {
    if (scale === undefined) scale = 1;
    angle = angle || 0;
    wingPhase = wingPhase || 0;
    const a = angle, sc = scale;
    const flap = Math.sin(wingPhase);

    // Glow halo.
    part(x, y, a, sc, 0, 0, 24, 24, 0, [1, 0.8, 0.2, 0.12]);

    // Wings: blue rotQuads angled out, flapping with wingPhase.
    const wAng = 0.55 + 0.3 * flap;        // splay angle
    const wLift = 1.5 * flap;              // bob up/down slightly
    part(x, y, a, sc, -6.5, -2 - wLift, 4.5, 11, -wAng, BEE_BLUE);
    part(x, y, a, sc, 6.5, -2 - wLift, 4.5, 11, wAng, BEE_BLUE);
    // Faint inner wing highlight.
    part(x, y, a, sc, -6, -2 - wLift, 2, 8, -wAng, [0.7, 0.8, 1, 0.5]);
    part(x, y, a, sc, 6, -2 - wLift, 2, 8, wAng, [0.7, 0.8, 1, 0.5]);

    // Body: two yellow segments (head + abdomen).
    part(x, y, a, sc, 0, -4.5, 7, 6.5, 0, BEE_YELLOW);   // head/thorax
    part(x, y, a, sc, 0, 3.5, 9, 9, 0, BEE_YELLOW);      // abdomen
    // Blue stripe across the abdomen and tail tip.
    part(x, y, a, sc, 0, 2.5, 9, 2, 0, BEE_BLUE);
    part(x, y, a, sc, 0, 8.5, 5, 2.5, 0, BEE_BLUE);

    // Eyes.
    part(x, y, a, sc, -2, -5, 1.6, 1.8, 0, BEE_BLUE);
    part(x, y, a, sc, 2, -5, 1.6, 1.8, 0, BEE_BLUE);

    // Antennae poking up from the head.
    part(x, y, a, sc, -2.5, -9, 1, 4, -0.35, BEE_BLUE);
    part(x, y, a, sc, 2.5, -9, 1, 4, 0.35, BEE_BLUE);

    // Little legs trailing below.
    part(x, y, a, sc, -4, 9, 1, 3.5, -0.5, BEE_BLUE);
    part(x, y, a, sc, 4, 9, 1, 3.5, 0.5, BEE_BLUE);
  }

  // ---------------------------------------------------------------------
  // 3. Butterfly "Goei" (~24px at scale 1) — wider, white-dominant wings.
  // ---------------------------------------------------------------------
  function butterfly(x, y, scale, angle, wingPhase) {
    if (scale === undefined) scale = 1;
    angle = angle || 0;
    wingPhase = wingPhase || 0;
    const a = angle, sc = scale;
    const flap = Math.sin(wingPhase);

    // Glow halo.
    part(x, y, a, sc, 0, 0, 30, 26, 0, [1, 0.5, 0.6, 0.12]);

    // Big white wings, splayed wide, flapping.
    const wAng = 0.75 + 0.28 * flap;
    const wOut = 8.5 + 1.2 * flap;   // wings sweep in/out as they flap
    part(x, y, a, sc, -wOut, -2, 7, 14, -wAng, FLY_WHITE);
    part(x, y, a, sc, wOut, -2, 7, 14, wAng, FLY_WHITE);
    // Lower hind wings.
    part(x, y, a, sc, -6, 6, 5, 8, -wAng * 0.6, FLY_WHITE);
    part(x, y, a, sc, 6, 6, 5, 8, wAng * 0.6, FLY_WHITE);
    // Red wing tips.
    part(x, y, a, sc, -wOut - 2.5, -6.5, 3.5, 5, -wAng, FLY_RED);
    part(x, y, a, sc, wOut + 2.5, -6.5, 3.5, 5, wAng, FLY_RED);

    // Red body down the middle.
    part(x, y, a, sc, 0, 0, 5, 17, 0, FLY_RED);
    triPart(x, y, a, sc, 0, -12, -2.5, -8, 2.5, -8, FLY_RED); // head point
    // Pale belly stripe.
    part(x, y, a, sc, 0, 1, 2, 12, 0, [1, 0.8, 0.85, 0.6]);

    // Antennae.
    part(x, y, a, sc, -2, -11, 0.9, 3.5, -0.4, FLY_RED);
    part(x, y, a, sc, 2, -11, 0.9, 3.5, 0.4, FLY_RED);
  }

  // ---------------------------------------------------------------------
  // 3b. Wasp "Hornet" (~20px at scale 1) — slim orange dart, fast striker.
  // ---------------------------------------------------------------------
  function wasp(x, y, scale, angle, wingPhase) {
    if (scale === undefined) scale = 1;
    angle = angle || 0;
    wingPhase = wingPhase || 0;
    const a = angle, sc = scale;
    const flap = Math.sin(wingPhase * 1.6); // fast angry buzz

    const ORANGE = [1, 0.55, 0.15, 1];
    const DARK = [0.3, 0.12, 0.05, 1];

    // Glow halo.
    part(x, y, a, sc, 0, 0, 22, 24, 0, [1, 0.5, 0.1, 0.12]);

    // Swept-back wings, buzzing.
    const wAng = 0.95 + 0.22 * flap;
    part(x, y, a, sc, -5.5, 1, 3.5, 10, -wAng, [1, 0.78, 0.45, 0.85]);
    part(x, y, a, sc, 5.5, 1, 3.5, 10, wAng, [1, 0.78, 0.45, 0.85]);

    // Dart body: head spike, thorax, tapered stinger.
    triPart(x, y, a, sc, 0, -11, -3, -2, 3, -2, ORANGE);
    part(x, y, a, sc, 0, 1, 5.5, 7, 0, ORANGE);
    triPart(x, y, a, sc, -3, 4, 3, 4, 0, 12, ORANGE);

    // Dark stripes.
    part(x, y, a, sc, 0, 1, 5.5, 1.6, 0, DARK);
    part(x, y, a, sc, 0, 5.5, 4, 1.6, 0, DARK);

    // Red eyes.
    part(x, y, a, sc, -1.8, -4.5, 1.5, 1.7, 0, [0.95, 0.12, 0.12, 1]);
    part(x, y, a, sc, 1.8, -4.5, 1.5, 1.7, 0, [0.95, 0.12, 0.12, 1]);
  }

  // ---------------------------------------------------------------------
  // 3c. Moth "Phantom" (~26px at scale 1) — wide violet wings, tanky,
  //     fires rings of bullets.
  // ---------------------------------------------------------------------
  function moth(x, y, scale, angle, wingPhase) {
    if (scale === undefined) scale = 1;
    angle = angle || 0;
    wingPhase = wingPhase || 0;
    const a = angle, sc = scale;
    const flap = Math.sin(wingPhase * 0.8); // slow heavy beat

    const VIOLET = [0.62, 0.38, 0.95, 1];
    const PALE = [0.85, 0.75, 1, 1];

    // Big glow halo.
    part(x, y, a, sc, 0, 0, 32, 28, 0, [0.65, 0.4, 1, 0.14]);

    // Broad rounded wings, slow flap.
    const wAng = 0.55 + 0.3 * flap;
    const wOut = 9 + 1.5 * flap;
    part(x, y, a, sc, -wOut, -2.5, 8.5, 13, -wAng, VIOLET);
    part(x, y, a, sc, wOut, -2.5, 8.5, 13, wAng, VIOLET);
    part(x, y, a, sc, -6.5, 6, 6, 8, -wAng * 0.5, VIOLET);
    part(x, y, a, sc, 6.5, 6, 6, 8, wAng * 0.5, VIOLET);
    // Pale eye-spots on the forewings.
    part(x, y, a, sc, -wOut - 1, -4, 3, 3, -wAng, PALE);
    part(x, y, a, sc, wOut + 1, -4, 3, 3, wAng, PALE);

    // Furry pale body.
    part(x, y, a, sc, 0, -1, 5.5, 15, 0, PALE);
    triPart(x, y, a, sc, 0, -12, -2.8, -8, 2.8, -8, PALE);
    // Violet segment bands.
    part(x, y, a, sc, 0, 1.5, 5.5, 1.8, 0, VIOLET);
    part(x, y, a, sc, 0, 5.5, 4.5, 1.8, 0, VIOLET);

    // Feathered antennae.
    part(x, y, a, sc, -2.5, -11.5, 2, 4, -0.55, VIOLET);
    part(x, y, a, sc, 2.5, -11.5, 2, 4, 0.55, VIOLET);
  }

  // ---------------------------------------------------------------------
  // 3d. Javelin "Lancer" (~20px at scale 1) — sleek white/cyan needle,
  //     fast charge-diver with tight twin shots.
  // ---------------------------------------------------------------------
  function javelin(x, y, scale, angle, wingPhase) {
    if (scale === undefined) scale = 1;
    angle = angle || 0;
    wingPhase = wingPhase || 0;
    const a = angle, sc = scale;
    const flick = Math.sin(wingPhase * 2.2); // rapid engine flicker

    const CYAN = [0.3, 0.88, 1, 1];
    const HULL = [0.92, 0.97, 1, 1];

    // Cyan glow halo, elongated to feel fast.
    part(x, y, a, sc, 0, 0, 18, 28, 0, [0.3, 0.9, 1, 0.14]);

    // Long thin fuselage with a needle nose.
    part(x, y, a, sc, 0, 1, 3.2, 16, 0, HULL);
    triPart(x, y, a, sc, 0, -11, -1.8, -7, 1.8, -7, HULL);

    // Swept tri fins near the tail.
    triPart(x, y, a, sc, -1.4, 3, -7, 9.5, -1.4, 9.5, CYAN);
    triPart(x, y, a, sc, 1.4, 3, 7, 9.5, 1.4, 9.5, CYAN);
    // Fin highlights.
    triPart(x, y, a, sc, -1.4, 5.5, -4.5, 9, -1.4, 9, [1, 1, 1, 0.55]);
    triPart(x, y, a, sc, 1.4, 5.5, 4.5, 9, 1.4, 9, [1, 1, 1, 0.55]);

    // Bright core line down the spine.
    part(x, y, a, sc, 0, 0, 1.1, 16, 0, [0.8, 1, 1, 0.85]);

    // Cyan canopy dot.
    part(x, y, a, sc, 0, -4, 2, 2.6, 0, CYAN);

    // Flickering engine spike at the tail.
    part(x, y, a, sc, 0, 9.8, 2.2, 3 + 1.2 * flick, 0, [0.35, 0.9, 1, 0.6]);
  }

  // ---------------------------------------------------------------------
  // 3e. Tanker "Bulwark" (~26px wide at scale 1) — squat armored bruiser;
  //     grey-green plates tint toward rust-red when damaged.
  // ---------------------------------------------------------------------
  function tanker(x, y, scale, angle, wingPhase, damaged) {
    if (scale === undefined) scale = 1;
    angle = angle || 0;
    wingPhase = wingPhase || 0;
    const a = angle, sc = scale;
    const bob = 0.6 * Math.sin(wingPhase * 0.7); // slow heavy sway

    const plate = damaged ? [0.72, 0.38, 0.28, 1] : [0.52, 0.6, 0.46, 1];
    const plateDark = damaged ? [0.5, 0.24, 0.18, 1] : [0.36, 0.43, 0.33, 1];
    const band = [0.14, 0.17, 0.13, 1];

    // Dim glow halo.
    part(x, y, a, sc, 0, 0, 38, 26, 0,
      damaged ? [1, 0.4, 0.25, 0.12] : [0.6, 0.85, 0.5, 0.10]);

    // Wide base hull, then overlapping armor plates stacked on top.
    part(x, y, a, sc, 0, 0.5, 25, 13, 0, plateDark);
    part(x, y, a, sc, 0, -3, 21, 7, 0, plate);
    part(x, y, a, sc, 0, 3.5, 17, 6.5, 0, plate);
    part(x, y, a, sc, -8.5, 0.5, 7, 10, 0.14, plate);
    part(x, y, a, sc, 8.5, 0.5, 7, 10, -0.14, plate);

    // Dark segmentation bands across the hull.
    part(x, y, a, sc, 0, -0.3, 23, 1.6, 0, band);
    part(x, y, a, sc, 0, 5.8, 14, 1.6, 0, band);

    // Two stubby side cannons, bobbing slightly out of phase.
    part(x, y, a, sc, -11.8, -2 + bob, 3, 7.5, 0, plateDark);
    part(x, y, a, sc, 11.8, -2 - bob, 3, 7.5, 0, plateDark);
    part(x, y, a, sc, -11.8, -6.2 + bob, 1.8, 2, 0, band); // muzzles
    part(x, y, a, sc, 11.8, -6.2 - bob, 1.8, 2, 0, band);

    // Dim yellow cockpit slit.
    part(x, y, a, sc, 0, -4.6, 8, 1.8, 0, [0.85, 0.74, 0.25, 0.85]);
  }

  // ---------------------------------------------------------------------
  // 3f. Cascade "Centipede" (~24px at scale 1) — gold segmented body that
  //     rains rhythmic bullet volleys.
  // ---------------------------------------------------------------------
  function cascade(x, y, scale, angle, wingPhase) {
    if (scale === undefined) scale = 1;
    angle = angle || 0;
    wingPhase = wingPhase || 0;
    const a = angle, sc = scale;
    const wig = Math.sin(wingPhase);

    const GOLD = [1, 0.78, 0.22, 1];
    const GOLD_DEEP = [0.85, 0.58, 0.12, 1];

    // Amber glow halo.
    part(x, y, a, sc, 0, 0, 24, 30, 0, [1, 0.7, 0.2, 0.13]);

    // Head wedge.
    triPart(x, y, a, sc, 0, -13, -3.4, -8, 3.4, -8, GOLD);
    // Eyes.
    part(x, y, a, sc, -1.6, -9.5, 1.4, 1.6, 0, [0.25, 0.12, 0.02, 1]);
    part(x, y, a, sc, 1.6, -9.5, 1.4, 1.6, 0, [0.25, 0.12, 0.02, 1]);

    // Stacked segments shrinking toward the tail, wiggling alternately.
    const segs = [
      [-6, 9.5, GOLD],
      [-1.5, 8, GOLD_DEEP],
      [2.5, 6.5, GOLD],
      [6, 5, GOLD_DEEP],
      [9, 3.6, GOLD],
    ];
    for (let i = 0; i < segs.length; i++) {
      const ly = segs[i][0], w = segs[i][1];
      const tw = 0.16 * wig * (i % 2 ? 1 : -1);
      part(x, y, a, sc, 0, ly, w, w * 0.85, tw, segs[i][2]);
    }

    // White accent rings between segments.
    part(x, y, a, sc, 0, -3.8, 8, 1.2, 0, [1, 1, 1, 0.8]);
    part(x, y, a, sc, 0, 0.5, 6.8, 1.2, 0, [1, 1, 1, 0.8]);
    part(x, y, a, sc, 0, 4.4, 5.2, 1.1, 0, [1, 1, 1, 0.8]);
    part(x, y, a, sc, 0, 7.6, 4, 1, 0, [1, 1, 1, 0.7]);
  }

  // ---------------------------------------------------------------------
  // 3g. Siren "Choir" (~24px at scale 1) — pale pink support enemy that
  //     conducts formation-wide volleys; radiating faint rings.
  // ---------------------------------------------------------------------
  function siren(x, y, scale, angle, wingPhase) {
    if (scale === undefined) scale = 1;
    angle = angle || 0;
    wingPhase = wingPhase || 0;
    const a = angle, sc = scale;
    const flap = Math.sin(wingPhase * 0.9);

    const PINK = [1, 0.74, 0.88, 1];
    const PALE = [1, 0.93, 0.97, 1];

    // Radiating concentric faint rings, slowly counter-rotating.
    part(x, y, a, sc, 0, 0, 30, 30, wingPhase * 0.3, [1, 0.5, 0.85, 0.15]);
    part(x, y, a, sc, 0, 0, 22, 22, -wingPhase * 0.45, [1, 0.6, 0.9, 0.15]);
    part(x, y, a, sc, 0, 0, 14, 14, wingPhase * 0.6, [1, 0.7, 0.95, 0.15]);

    // Two arced wing quads sweeping out and up.
    const wAng = 0.8 + 0.25 * flap;
    part(x, y, a, sc, -7, -1, 4.5, 13, -wAng, PINK);
    part(x, y, a, sc, 7, -1, 4.5, 13, wAng, PINK);
    // Pale outer feather edges.
    part(x, y, a, sc, -8.8, -4, 3, 8, -wAng - 0.4, [1, 1, 1, 0.7]);
    part(x, y, a, sc, 8.8, -4, 3, 8, wAng + 0.4, [1, 1, 1, 0.7]);

    // Slim elegant body.
    part(x, y, a, sc, 0, 0.5, 3.5, 15, 0, PALE);
    triPart(x, y, a, sc, 0, -11, -2.2, -7, 2.2, -7, PALE);
    triPart(x, y, a, sc, -1.8, 8, 1.8, 8, 0, 12.5, PINK); // tapered tail

    // Bright magenta core.
    part(x, y, a, sc, 0, -2, 3, 3.6, 0, [1, 0.15, 0.7, 1]);
    part(x, y, a, sc, 0, -2, 1.4, 1.8, 0, [1, 0.85, 0.95, 0.9]);
  }

  // ---------------------------------------------------------------------
  // 4. Boss Galaga (~28px at scale 1) — bulky; green, or purple when hit.
  // ---------------------------------------------------------------------
  function boss(x, y, scale, angle, wingPhase, damaged) {
    if (scale === undefined) scale = 1;
    angle = angle || 0;
    wingPhase = wingPhase || 0;
    const a = angle, sc = scale;
    const flap = Math.sin(wingPhase);

    const body = damaged ? BOSS_PURPLE : BOSS_GREEN;
    const bodyDark = damaged ? [0.5, 0.2, 0.65, 1] : [0.18, 0.6, 0.3, 1];
    const accent = damaged ? [0.95, 0.45, 0.85, 1] : BEE_BLUE;

    // Glow halo.
    part(x, y, a, sc, 0, 0, 34, 30, 0,
      damaged ? [0.8, 0.4, 1, 0.14] : [0.4, 1, 0.55, 0.14]);

    // Wings: blue (or pink when damaged) accents, flapping.
    const wAng = 0.6 + 0.25 * flap;
    const wOut = 10 + 1.3 * flap;
    part(x, y, a, sc, -wOut, -3, 6, 13, -wAng, accent);
    part(x, y, a, sc, wOut, -3, 6, 13, wAng, accent);
    part(x, y, a, sc, -8, 6, 5, 8, -wAng * 0.55, accent);
    part(x, y, a, sc, 8, 6, 5, 8, wAng * 0.55, accent);

    // Bulky body: wide thorax + abdomen.
    part(x, y, a, sc, 0, -4, 15, 9, 0, body);     // broad shoulders
    part(x, y, a, sc, 0, 4, 11, 10, 0, body);     // abdomen
    triPart(x, y, a, sc, -7.5, -8.5, 7.5, -8.5, 0, -13, body); // crown/head
    // Darker segmentation bands.
    part(x, y, a, sc, 0, 0.5, 13, 2, 0, bodyDark);
    part(x, y, a, sc, 0, 9.5, 8, 2.5, 0, bodyDark);

    // Yellow eyes.
    part(x, y, a, sc, -3.8, -5.5, 2.6, 2.6, 0, [1, 0.9, 0.25, 1]);
    part(x, y, a, sc, 3.8, -5.5, 2.6, 2.6, 0, [1, 0.9, 0.25, 1]);

    // Antennae horns.
    part(x, y, a, sc, -4, -13, 1.3, 4.5, -0.4, bodyDark);
    part(x, y, a, sc, 4, -13, 1.3, 4.5, 0.4, bodyDark);
  }

  // ---------------------------------------------------------------------
  // 5. Player missile: slim white-hot dart (~3x14) with cyan glow.
  // ---------------------------------------------------------------------
  function playerMissile(x, y, sc) {
    sc = sc || 1;
    Renderer.rotQuad(x, y, 7*sc, 18*sc, 0, [0.3, 0.9, 1, 0.18]);
    Renderer.rotQuad(x, y + 1.5*sc, 3*sc, 11*sc, 0, WHITE);
    Renderer.tri(x, y - 7*sc, x - 1.5*sc, y - 4*sc, x + 1.5*sc, y - 4*sc, WHITE);
    Renderer.rotQuad(x, y, 1.2*sc, 12*sc, 0, [1, 1, 1, 0.7]);
  }

  // ---------------------------------------------------------------------
  // 5b. WAVE cannon: expanding teal-green shockwave ring of radius r.
  //     t drives a slow shimmer rotation of the ring segments.
  // ---------------------------------------------------------------------
  function playerWave(x, y, r, t) {
    t = t || 0;
    const segs = 12;
    const segLen = (Math.PI * 2 * r) / segs * 1.08;
    const thick = Math.max(2, r * 0.07);

    // Inner soft glow disc.
    Renderer.rotQuad(x, y, r * 1.25, r * 1.25, Math.PI / 4 + t * 0.6, [0.2, 0.95, 0.55, 0.07]);

    // Ring of short tangential segments, shimmering with t.
    for (let i = 0; i < segs; i++) {
      const ang = (i / segs) * Math.PI * 2 + t * 1.6;
      const cx = x + Math.sin(ang) * r;
      const cy = y - Math.cos(ang) * r;
      Renderer.rotQuad(cx, cy, thick, segLen, ang + Math.PI / 2, [0.24, 0.94, 0.54, 0.5]);
    }

    // Leading bright arc across the top of the ring.
    for (let i = -2; i <= 2; i++) {
      const ang = (i / segs) * Math.PI * 2 * 0.6;
      const cx = x + Math.sin(ang) * r;
      const cy = y - Math.cos(ang) * r;
      Renderer.rotQuad(cx, cy, thick * 0.7, segLen * 0.8, ang + Math.PI / 2,
        [0.75, 1, 0.88, 0.85]);
    }
  }

  // ---------------------------------------------------------------------
  // 5c. LANCE bolt: long white-hot piercing beam (~26px) with cyan edges.
  // ---------------------------------------------------------------------
  function playerLance(x, y, sc) {
    sc = sc || 1;
    // Soft glow halo.
    Renderer.rotQuad(x, y, 9 * sc, 32 * sc, 0, [0.3, 0.85, 1, 0.16]);
    // Cyan edge rails.
    Renderer.rotQuad(x - 2.2 * sc, y + 2 * sc, 1.3 * sc, 20 * sc, 0, [0.35, 0.9, 1, 0.8]);
    Renderer.rotQuad(x + 2.2 * sc, y + 2 * sc, 1.3 * sc, 20 * sc, 0, [0.35, 0.9, 1, 0.8]);
    // Long white-hot bolt body with a pointed tip.
    Renderer.rotQuad(x, y, 2.6 * sc, 26 * sc, 0, WHITE);
    Renderer.tri(x, y - 17 * sc, x - 2 * sc, y - 12 * sc, x + 2 * sc, y - 12 * sc, WHITE);
    // Bright core line.
    Renderer.rotQuad(x, y, 1.1 * sc, 22 * sc, 0, [0.9, 1, 1, 0.9]);
  }

  // ---------------------------------------------------------------------
  // 6. Enemy bullet: small red/yellow projectile (~6px), pulsing.
  // ---------------------------------------------------------------------
  function enemyBullet(x, y, phase, sc) {
    sc = sc || 1;
    phase = phase || 0;
    const pulse = 0.5 + 0.5 * Math.sin(phase);
    Renderer.rotQuad(x, y, 11*sc, 11*sc, Math.PI / 4, [1, 0.3, 0.1, 0.10 + 0.10 * pulse]);
    Renderer.rotQuad(x, y, 6*sc, 6*sc, Math.PI / 4, [0.95, 0.25 + 0.15 * pulse, 0.1, 1]);
    Renderer.rotQuad(x, y, 3*sc, 3*sc, Math.PI / 4, [1, 0.9, 0.3, 0.55 + 0.45 * pulse]);
  }

  // ---------------------------------------------------------------------
  // 7. Explosion: expanding starburst, t in [0,1].
  // ---------------------------------------------------------------------
  function explosion(x, y, t, big) {
    t = Math.min(Math.max(t || 0, 0), 1);
    const arms = big ? 10 : 6;
    const sizeMul = big ? 1.8 : 1;
    const maxR = 26 * sizeMul;
    const r = maxR * t;
    const fade = 1 - t;

    // Color shifts white -> yellow -> orange -> red as t advances.
    let col;
    if (t < 0.33) {
      const k = t / 0.33;
      col = [1, 1, lerp(1, 0.4, k), 1];                     // white -> yellow
    } else if (t < 0.66) {
      const k = (t - 0.33) / 0.33;
      col = [1, lerp(1, 0.55, k), lerp(0.4, 0.1, k), 1];    // yellow -> orange
    } else {
      const k = (t - 0.66) / 0.34;
      col = [lerp(1, 0.85, k), lerp(0.55, 0.15, k), 0.1, 1]; // orange -> red
    }
    const armCol = [col[0], col[1], col[2], fade];

    // Central flash, biggest early on.
    Renderer.rotQuad(x, y, 10 * sizeMul * fade + 2, 10 * sizeMul * fade + 2,
      Math.PI / 4, [1, 1, 0.85, 0.6 * fade]);

    // Radiating arms: elongated rotQuads pointing outward.
    const len = 6 + r * 0.7;
    const thick = (big ? 3.6 : 2.8) * (1 - t * 0.5);
    for (let i = 0; i < arms; i++) {
      const ang = (i / arms) * Math.PI * 2 + (big ? 0.25 : 0.5); // fixed offset
      const dx = Math.sin(ang);
      const dy = -Math.cos(ang);
      const cx = x + dx * (r * 0.55 + len * 0.35);
      const cy = y + dy * (r * 0.55 + len * 0.35);
      // Faint wide glow under each arm, then the bright arm itself.
      Renderer.rotQuad(cx, cy, thick * 3, len * 1.25, ang,
        [col[0], col[1], col[2], 0.18 * fade]);
      Renderer.rotQuad(cx, cy, thick, len, ang, armCol);
    }

    // Expanding faint ring: low-alpha tangential quads arranged in a circle.
    const ringR = r * 1.15 + 3;
    const segs = 14;
    const segLen = (Math.PI * 2 * ringR) / segs * 1.15;
    for (let i = 0; i < segs; i++) {
      const ang = (i / segs) * Math.PI * 2;
      const cx = x + Math.sin(ang) * ringR;
      const cy = y - Math.cos(ang) * ringR;
      // Tangent direction = ring angle + 90deg.
      Renderer.rotQuad(cx, cy, 1.6, segLen, ang + Math.PI / 2,
        [1, 0.8, 0.5, 0.16 * fade]);
    }
  }

  // ---------------------------------------------------------------------
  // 8. Tractor beam: cone opening DOWNWARD from apex (x, y).
  // ---------------------------------------------------------------------
  function tractorBeam(x, y, height, phase) {
    phase = phase || 0;
    const halfW = height * 0.275; // full width at bottom = height * 0.55
    const yb = y + height;

    // Outer faint glow triangle, slightly wider.
    Renderer.tri(x, y - 2, x - halfW * 1.35, yb + 3, x + halfW * 1.35, yb + 3,
      [0.3, 0.7, 1, 0.07]);

    // Layered translucent cone body (stacked = brighter toward the core).
    Renderer.tri(x, y, x - halfW, yb, x + halfW, yb, [0.25, 0.6, 1, 0.16]);
    Renderer.tri(x, y, x - halfW * 0.72, yb, x + halfW * 0.72, yb, [0.4, 0.85, 1, 0.14]);
    Renderer.tri(x, y, x - halfW * 0.4, yb, x + halfW * 0.4, yb, [0.7, 0.95, 1, 0.12]);

    // Bright apex spark.
    Renderer.rotQuad(x, y + 2, 5, 5, Math.PI / 4, [0.8, 1, 1, 0.5]);

    // Horizontal stripes sweeping downward (wrapping) — the pulsing beam.
    const stripes = 5;
    for (let i = 0; i < stripes; i++) {
      const f = frac(phase / (Math.PI * 2) + i / stripes); // 0..1 down the cone
      const sy = y + f * height;
      const sw = 2 * halfW * f * 0.92;            // stripe width follows cone
      if (sw < 1) continue;
      const alpha = 0.45 * (0.35 + 0.65 * Math.sin(f * Math.PI)); // ease in/out
      Renderer.quad(x - sw / 2, sy - 1.5, sw, 3, [0.55, 0.95, 1, alpha]);
      // Thin hot line inside each stripe.
      Renderer.quad(x - sw / 2, sy - 0.5, sw, 1, [0.9, 1, 1, alpha * 0.8]);
    }
  }

  // ---------------------------------------------------------------------
  // 9. Stage flag badge (~12px tall at scale 1) for the HUD.
  // ---------------------------------------------------------------------
  function flag(x, y, scale) {
    if (scale === undefined) scale = 1;
    const sc = scale;
    const px = x - 3.5 * sc; // pole x

    // Thin white pole.
    Renderer.quad(px - 0.5 * sc, y - 6 * sc, 1 * sc, 12 * sc, [1, 1, 1, 0.9]);
    // Red pennant streaming right from the pole top.
    Renderer.tri(px, y - 6 * sc, px + 8.5 * sc, y - 3.25 * sc, px, y - 0.5 * sc, RED);
    // Yellow inner band on the pennant.
    Renderer.tri(px + 1 * sc, y - 5 * sc, px + 5.5 * sc, y - 3.25 * sc,
      px + 1 * sc, y - 1.5 * sc, [1, 0.85, 0.25, 1]);
    // Tiny base nub.
    Renderer.quad(px - 1.5 * sc, y + 5 * sc, 3 * sc, 1 * sc, [1, 1, 1, 0.7]);
  }

  return {
    player,
    setPlayerTheme,
    getPlayerTheme,
    playerThemes: THEMES.map(function (t) { return { id: t.id, name: t.name }; }),
    bee,
    butterfly,
    wasp,
    moth,
    javelin,
    tanker,
    cascade,
    siren,
    boss,
    playerMissile,
    playerWave,
    playerLance,
    enemyBullet,
    explosion,
    tractorBeam,
    flag,
  };
})();
