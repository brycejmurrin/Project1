/*
 * Fx — score popups and full-screen flash "juice" for Neon Swarm.
 * Digits are drawn with a tiny 7-segment vector font built from Renderer
 * quads (there is no text in WebGL). Coordinates are logical (CSS) pixels,
 * origin top-left, y down. No DOM, no per-frame allocations.
 */
"use strict";

const Fx = (function () {
  const MAX_POPUPS = 24;
  const POPUP_LIFE = 0.8;   // seconds
  const POPUP_RISE = 26;    // px floated upward over the popup's life
  const POPUP_BASE_SCALE = 1.2;
  const FLASH_LIFE = 0.15;  // seconds

  // ---- 7-segment vector font ------------------------------------------
  // Glyph cell is 5px wide x 10px tall at scale 1; with a 2px gap the
  // character advance is 7px (cell ~7x10 as seen by the layout).
  const GLYPH_W = 5;
  const GLYPH_H = 10;
  const ADVANCE = 7;
  const SEG_T = 1.6; // segment thickness at scale 1

  // The 7 segments as (x, y, w, h) rects inside the glyph cell:
  //     A
  //   F   B
  //     G
  //   E   C
  //     D
  const SEGS = [
    [0, 0, GLYPH_W, SEG_T],                                // A: top
    [GLYPH_W - SEG_T, 0, SEG_T, GLYPH_H / 2],              // B: top-right
    [GLYPH_W - SEG_T, GLYPH_H / 2, SEG_T, GLYPH_H / 2],    // C: bottom-right
    [0, GLYPH_H - SEG_T, GLYPH_W, SEG_T],                  // D: bottom
    [0, GLYPH_H / 2, SEG_T, GLYPH_H / 2],                  // E: bottom-left
    [0, 0, SEG_T, GLYPH_H / 2],                            // F: top-left
    [0, (GLYPH_H - SEG_T) / 2, GLYPH_W, SEG_T],            // G: middle
  ];

  // Standard 7-seg encodings; bit i lights SEGS[i] (A=1 ... G=64).
  const DIGIT_SEGS = [
    /* 0 */ 0x3f, /* 1 */ 0x06, /* 2 */ 0x5b, /* 3 */ 0x4f, /* 4 */ 0x66,
    /* 5 */ 0x6d, /* 6 */ 0x7d, /* 7 */ 0x07, /* 8 */ 0x7f, /* 9 */ 0x6f,
  ];

  // '+' is two crossing quads centered in the cell.
  const PLUS_RECTS = [
    [0, (GLYPH_H - SEG_T) / 2, GLYPH_W, SEG_T],                            // horizontal
    [(GLYPH_W - SEG_T) / 2, (GLYPH_H - GLYPH_W) / 2, SEG_T, GLYPH_W],      // vertical
  ];

  // ---- state (fixed pools, reused) -------------------------------------
  const popups = [];
  for (let i = 0; i < MAX_POPUPS; i++) {
    popups.push({ x: 0, y: 0, t: 0, text: "", color: [1, 1, 0.85, 1] });
  }
  let popHead = 0;  // index of the oldest live popup (ring buffer)
  let popCount = 0;

  let flashT = FLASH_LIFE; // age of the flash; >= FLASH_LIFE means dead
  let flashA0 = 0;         // starting alpha

  // Scratch colors reused every frame (premultiplied-alpha friendly).
  const backColor = [0, 0, 0, 0];
  const textColor = [0, 0, 0, 0];
  const flashColor = [1, 1, 1, 0];

  function finite(v, def) {
    return typeof v === "number" && isFinite(v) ? v : def;
  }

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  // ---- text -------------------------------------------------------------
  // Draws `text` ('0'-'9' and '+') centered horizontally on x; y is the
  // vertical center of the string. Adds a dark backing quad for contrast.
  function drawText(x, y, text, scale, color) {
    const n = text.length;
    if (n === 0) return;
    x = finite(x, 0);
    y = finite(y, 0);
    scale = finite(scale, 1);
    if (scale <= 0) return;

    const totalW = ((n - 1) * ADVANCE + GLYPH_W) * scale;
    const left = x - totalW / 2;
    const top = y - (GLYPH_H * scale) / 2;

    // Subtle dark backing for legibility against bright sprites.
    const pad = 2 * scale;
    backColor[3] = 0.35 * clamp01(color[3]);
    Renderer.quad(left - pad, top - pad, totalW + pad * 2, GLYPH_H * scale + pad * 2, backColor);

    for (let i = 0; i < n; i++) {
      const cx = left + i * ADVANCE * scale;
      const ch = text.charCodeAt(i);
      if (ch >= 48 && ch <= 57) { // '0'-'9'
        const mask = DIGIT_SEGS[ch - 48];
        for (let s = 0; s < 7; s++) {
          if (mask & (1 << s)) {
            const r = SEGS[s];
            Renderer.quad(cx + r[0] * scale, top + r[1] * scale, r[2] * scale, r[3] * scale, color);
          }
        }
      } else if (ch === 43) { // '+'
        for (let s = 0; s < 2; s++) {
          const r = PLUS_RECTS[s];
          Renderer.quad(cx + r[0] * scale, top + r[1] * scale, r[2] * scale, r[3] * scale, color);
        }
      }
      // Unknown characters advance silently.
    }
  }

  // ---- public API ---------------------------------------------------------
  function popup(x, y, value, color) {
    let idx;
    if (popCount === MAX_POPUPS) {
      idx = popHead; // drop the oldest
      popHead = (popHead + 1) % MAX_POPUPS;
    } else {
      idx = (popHead + popCount) % MAX_POPUPS;
      popCount++;
    }
    const p = popups[idx];
    p.x = finite(x, 0);
    p.y = finite(y, 0);
    p.t = 0;
    let v = Math.floor(Math.abs(finite(value, 0)));
    if (!isFinite(v)) v = 0;
    p.text = "+" + v;
    const c = p.color;
    if (color && color.length >= 4) {
      c[0] = clamp01(finite(color[0], 1));
      c[1] = clamp01(finite(color[1], 1));
      c[2] = clamp01(finite(color[2], 0.85));
      c[3] = clamp01(finite(color[3], 1));
    } else {
      c[0] = 1; c[1] = 1; c[2] = 0.85; c[3] = 1; // warm white
    }
  }

  function flash(strength) {
    let s = finite(strength, 1);
    if (s < 0) s = 0;
    flashA0 = clamp01(0.25 * s);
    flashT = 0; // repeat calls just refresh it
  }

  function update(dt) {
    dt = finite(dt, 0);
    if (dt < 0) dt = 0;
    else if (dt > 0.25) dt = 0.25;

    for (let i = 0; i < popCount; i++) {
      popups[(popHead + i) % MAX_POPUPS].t += dt;
    }
    // Uniform lifetime: the oldest popups always die first.
    while (popCount > 0 && popups[popHead].t >= POPUP_LIFE) {
      popHead = (popHead + 1) % MAX_POPUPS;
      popCount--;
    }

    if (flashT < FLASH_LIFE) flashT += dt;
  }

  function draw() {
    for (let i = 0; i < popCount; i++) {
      const p = popups[(popHead + i) % MAX_POPUPS];
      const t = clamp01(p.t / POPUP_LIFE);
      const ease = 1 - (1 - t) * (1 - t) * (1 - t); // ease-out cubic
      const rise = -POPUP_RISE * ease;
      const fade = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4; // fade over the last 40%
      const scale = POPUP_BASE_SCALE * (0.9 + 0.2 * ease);
      textColor[0] = p.color[0];
      textColor[1] = p.color[1];
      textColor[2] = p.color[2];
      textColor[3] = p.color[3] * clamp01(fade);
      drawText(p.x, p.y + rise, p.text, scale, textColor);
    }

    if (flashT < FLASH_LIFE && flashA0 > 0) {
      flashColor[3] = flashA0 * (1 - flashT / FLASH_LIFE);
      Renderer.quad(0, 0, Renderer.width, Renderer.height, flashColor);
    }
  }

  function clear() {
    popHead = 0;
    popCount = 0;
    flashT = FLASH_LIFE;
    flashA0 = 0;
  }

  return {
    popup,
    flash,
    update,
    draw,
    clear,
    drawText, // exposed for HUD-style numeric text; treat as internal
  };
})();
