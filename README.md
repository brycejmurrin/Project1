# Neon Swarm

A Galaga-style fixed shooter built with raw WebGL — no frameworks, no
dependencies, no build step. Runs in any modern browser on desktop or mobile.

Enemies swoop in along spline flight paths into a breathing formation, then
dive-bomb you in waves. Bosses can capture your fighter with a tractor beam —
shoot down a diving captor to rescue it and fight on as a dual fighter.

## How to play

- **Mobile:** tap to start; drag anywhere to move; tap or hold to fire.
- **Desktop:** ← → or A/D to move, Space to fire, Enter/Space to start.
- Bees 50/100 pts, butterflies 80/160, bosses 150/400 (more while flying).
- Bosses take two hits. Don't linger under a tractor beam — unless you're
  planning the rescue for a dual fighter (+1000).
- Every 3rd stage is a Challenging Stage: 40 fly-through targets, no danger,
  +10000 for a perfect 40/40.
- Extra ship at 20,000 points, then every 70,000. High score is saved locally.

## Running it

Any static file server works:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` directly from disk also works — there are no asset
fetches. Deploys to any static host (this repo auto-deploys to GitHub Pages
via the included workflow).

## Project structure

```
index.html        Page shell, arcade HUD, overlay markup
css/style.css     Layout and neon arcade styling
js/renderer.js    Minimal batched WebGL renderer (colored triangles/quads)
js/paths.js       Catmull-Rom spline flight paths with arc-length traversal
js/sprites.js     Vector sprites (fighter, bee, butterfly, boss, beam, FX)
js/audio.js       Synthesized Web Audio sound effects and jingles
js/game.js        State machine, formation, dive AI, capture/rescue, scoring
```

## How it works

- `renderer.js` batches all triangles/quads into one vertex buffer and draws
  the frame with a single `drawArrays` call, using premultiplied-alpha
  blending so overlapping brights bloom into a neon glow.
- `paths.js` builds Catmull-Rom splines resampled to uniform arc length, so
  enemies traverse entry loops and attack dives at constant speed with
  correct headings.
- `game.js` runs the Galaga-style state machine: 5 entry waves into a 40-slot
  breathing formation, a dive director with per-stage difficulty scaling,
  boss tractor-beam captures, rescues and dual-fighter play, challenging
  bonus stages, lives, and persistent high score.
- The player ship's color theme is selectable via `Sprites.setPlayerTheme`
  (persisted under the `ship-theme` localStorage key); a menu UI for it is
  planned.
