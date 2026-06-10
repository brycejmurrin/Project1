# Neon Dodge

An endless dodger built with raw WebGL — no frameworks, no dependencies, no
build step. Runs in any modern browser on desktop or mobile.

Steer a glowing ship through an ever-faster shower of neon blocks. Survive as
long as you can; your best score is saved locally.

## How to play

- **Mobile:** tap to start, then drag anywhere to steer.
- **Desktop:** click or press Space/Enter to start, steer with ← → or A/D.
- The longer you survive, the faster the blocks fall and the more they spawn.

## Running it

Any static file server works:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

or with Node:

```sh
npx serve .
```

You can also just open `index.html` directly in a browser — there are no asset
fetches, so it works from `file://` too.

### Hosting

Since it's a static site, it deploys anywhere: GitHub Pages, Netlify, Vercel,
Cloudflare Pages, or an S3 bucket. Point the host at the repo root.

## Project structure

```
index.html       Page shell, HUD, and overlay markup
css/style.css    Layout and neon UI styling
js/renderer.js   Minimal batched WebGL renderer (colored triangles/quads)
js/game.js       Game loop, input, obstacles, particles, scoring
```

## How it works

- `renderer.js` exposes a tiny immediate-mode API (`quad`, `rotQuad`, `tri`)
  that batches everything into one vertex buffer and draws it with a single
  `drawArrays` call per frame, using premultiplied-alpha blending so
  overlapping brights bloom into a glow.
- `game.js` runs a fixed `requestAnimationFrame` loop with delta-time updates:
  a parallax starfield, falling obstacles with a ramping difficulty curve,
  exhaust/explosion particles, screen shake, and AABB collision.
- The canvas resizes with the window and renders at device-pixel-ratio
  resolution (capped at 2x) for crisp output on phones.
