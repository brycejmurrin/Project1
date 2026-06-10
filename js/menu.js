/*
 * Neon Swarm — main menu.
 * Self-contained: builds its own DOM container on document.body and injects
 * its own <style> tag once. All classes are prefixed "nsm-" to avoid
 * collisions with the game's stylesheet. Exposes a global `Menu` with
 * show(opts) / hide() / visible.
 */
"use strict";

const Menu = (function () {
  const NOOP = function () {};

  const SWATCH_COLORS = {
    classic: "#f2f2f2",
    cyan: "#35e0e0",
    crimson: "#e8333f",
    emerald: "#2ecc71",
    violet: "#b04ef0",
    gold: "#f0b429",
  };
  const SWATCH_FALLBACK = "#888";

  const CSS = [
    ".nsm-root {",
    "  position: fixed;",
    "  inset: 0;",
    "  z-index: 1000;",
    "  display: flex;",
    "  flex-direction: column;",
    "  align-items: center;",
    "  justify-content: center;",
    "  gap: 22px;",
    "  pointer-events: auto;",
    "  text-align: center;",
    "  font-family: \"Courier New\", ui-monospace, monospace;",
    "  -webkit-user-select: none;",
    "  user-select: none;",
    "  -webkit-tap-highlight-color: transparent;",
    "  background: radial-gradient(ellipse at center,",
    "    rgba(5, 6, 15, 0.35) 0%,",
    "    rgba(5, 6, 15, 0.6) 60%,",
    "    rgba(5, 6, 15, 0.85) 100%);",
    "  padding-top: calc(16px + env(safe-area-inset-top));",
    "  padding-bottom: calc(16px + env(safe-area-inset-bottom));",
    "  padding-left: calc(20px + env(safe-area-inset-left));",
    "  padding-right: calc(20px + env(safe-area-inset-right));",
    "}",
    ".nsm-title {",
    "  font-size: clamp(34px, 9vw, 64px);",
    "  font-weight: 800;",
    "  letter-spacing: 6px;",
    "  margin: 0;",
    "  color: #40e0ff;",
    "  text-shadow: 0 0 24px rgba(64, 224, 255, 0.8), 0 0 60px rgba(255, 64, 200, 0.5);",
    "}",
    ".nsm-hiscore {",
    "  font-size: 14px;",
    "  font-weight: 700;",
    "  letter-spacing: 3px;",
    "  color: #ff3b4d;",
    "  text-shadow: 0 0 8px rgba(255, 59, 77, 0.7);",
    "}",
    ".nsm-hiscore-value {",
    "  color: #ffffff;",
    "  text-shadow: 0 0 8px rgba(160, 220, 255, 0.6);",
    "  margin-left: 10px;",
    "}",
    ".nsm-btn {",
    "  font-family: inherit;",
    "  font-weight: 700;",
    "  letter-spacing: 3px;",
    "  color: #aee9ff;",
    "  background: rgba(10, 16, 34, 0.65);",
    "  border: 1px solid rgba(64, 224, 255, 0.45);",
    "  border-radius: 8px;",
    "  cursor: pointer;",
    "  -webkit-tap-highlight-color: transparent;",
    "  -webkit-user-select: none;",
    "  user-select: none;",
    "  touch-action: manipulation;",
    "  transition: transform 0.08s ease, box-shadow 0.15s ease, color 0.15s ease;",
    "}",
    ".nsm-btn:active {",
    "  transform: scale(0.96);",
    "}",
    ".nsm-start {",
    "  min-height: 56px;",
    "  min-width: min(280px, 80vw);",
    "  padding: 14px 36px;",
    "  font-size: 22px;",
    "  letter-spacing: 6px;",
    "  color: #ffffff;",
    "  border: 2px solid #40e0ff;",
    "  box-shadow: 0 0 18px rgba(64, 224, 255, 0.5), inset 0 0 14px rgba(64, 224, 255, 0.2);",
    "  text-shadow: 0 0 10px rgba(64, 224, 255, 0.9);",
    "  animation: nsm-pulse 1.6s ease-in-out infinite;",
    "}",
    "@keyframes nsm-pulse {",
    "  0%, 100% { box-shadow: 0 0 18px rgba(64, 224, 255, 0.5), inset 0 0 14px rgba(64, 224, 255, 0.2); }",
    "  50% { box-shadow: 0 0 30px rgba(64, 224, 255, 0.85), inset 0 0 20px rgba(64, 224, 255, 0.35); }",
    "}",
    ".nsm-section {",
    "  display: flex;",
    "  flex-direction: column;",
    "  align-items: center;",
    "  gap: 10px;",
    "}",
    ".nsm-label {",
    "  font-size: 12px;",
    "  font-weight: 700;",
    "  letter-spacing: 4px;",
    "  color: #ff3b4d;",
    "  text-shadow: 0 0 8px rgba(255, 59, 77, 0.7);",
    "}",
    ".nsm-swatch-row {",
    "  display: flex;",
    "  flex-wrap: wrap;",
    "  justify-content: center;",
    "  gap: 14px;",
    "}",
    ".nsm-swatch {",
    "  width: 38px;",
    "  height: 38px;",
    "  padding: 0;",
    "  border-radius: 50%;",
    "  border: 2px solid rgba(255, 255, 255, 0.25);",
    "  cursor: pointer;",
    "  -webkit-tap-highlight-color: transparent;",
    "  -webkit-user-select: none;",
    "  user-select: none;",
    "  touch-action: manipulation;",
    "  transition: transform 0.08s ease, box-shadow 0.15s ease;",
    "}",
    ".nsm-swatch:active {",
    "  transform: scale(0.96);",
    "}",
    ".nsm-swatch.nsm-selected {",
    "  border-color: #ffffff;",
    "  box-shadow: 0 0 0 3px rgba(64, 224, 255, 0.6), 0 0 16px rgba(64, 224, 255, 0.8);",
    "}",
    ".nsm-seg-row {",
    "  display: flex;",
    "  justify-content: center;",
    "  gap: 0;",
    "  border: 1px solid rgba(64, 224, 255, 0.45);",
    "  border-radius: 8px;",
    "  overflow: hidden;",
    "}",
    ".nsm-seg {",
    "  min-height: 44px;",
    "  padding: 10px 18px;",
    "  font-size: 13px;",
    "  border: none;",
    "  border-radius: 0;",
    "  background: transparent;",
    "}",
    ".nsm-seg + .nsm-seg {",
    "  border-left: 1px solid rgba(64, 224, 255, 0.3);",
    "}",
    ".nsm-seg.nsm-selected {",
    "  color: #05060f;",
    "  background: #40e0ff;",
    "  text-shadow: none;",
    "  box-shadow: 0 0 14px rgba(64, 224, 255, 0.8);",
    "}",
    ".nsm-bottom-row {",
    "  display: flex;",
    "  flex-wrap: wrap;",
    "  justify-content: center;",
    "  gap: 14px;",
    "}",
    ".nsm-small {",
    "  min-height: 44px;",
    "  padding: 10px 18px;",
    "  font-size: 13px;",
    "}",
    ".nsm-footer {",
    "  font-size: 12px;",
    "  letter-spacing: 2px;",
    "  color: #aee9ff;",
    "  opacity: 0.75;",
    "  text-shadow: 0 0 8px rgba(160, 220, 255, 0.4);",
    "}",
  ].join("\n");

  let container = null;
  let styleEl = null;
  let visible = false;
  let opts = {};

  // Live element references.
  let hiscoreValueEl = null;
  let swatchRowEl = null;
  let diffRowEl = null;
  let diffSectionEl = null;
  let sensSectionEl = null;
  let sensRowEl = null;
  let soundBtnEl = null;

  function getOpt(name, fallback) {
    return typeof opts[name] === "function" ? opts[name] : fallback;
  }

  function callOpt(name) {
    const fn = opts[name];
    if (typeof fn === "function") {
      try { fn(); } catch (err) { /* never break the menu */ }
    }
  }

  function injectStyle() {
    if (styleEl) return;
    styleEl = document.createElement("style");
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
  }

  function makeButton(className, text) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nsm-btn " + className;
    btn.textContent = text;
    return btn;
  }

  function build() {
    if (container) return;
    injectStyle();

    container = document.createElement("div");
    container.className = "nsm-root";
    // Never let pointer events leak through to the game canvas.
    container.addEventListener("pointerdown", function (e) {
      e.stopPropagation();
    });
    container.addEventListener("pointerup", function (e) {
      e.stopPropagation();
    });

    // 1. Title
    const title = document.createElement("h1");
    title.className = "nsm-title";
    title.textContent = "NEON SWARM";
    container.appendChild(title);

    // 2. High score
    const hiscoreLine = document.createElement("div");
    hiscoreLine.className = "nsm-hiscore";
    hiscoreLine.appendChild(document.createTextNode("HIGH SCORE"));
    hiscoreValueEl = document.createElement("span");
    hiscoreValueEl.className = "nsm-hiscore-value";
    hiscoreValueEl.textContent = "0";
    hiscoreLine.appendChild(hiscoreValueEl);
    container.appendChild(hiscoreLine);

    // 3. START
    const startBtn = makeButton("nsm-start", "START");
    startBtn.addEventListener("click", function () {
      hide();
      callOpt("onStart");
    });
    container.appendChild(startBtn);

    // 4. SHIP color picker
    const shipSection = document.createElement("div");
    shipSection.className = "nsm-section";
    const shipLabel = document.createElement("div");
    shipLabel.className = "nsm-label";
    shipLabel.textContent = "SHIP";
    shipSection.appendChild(shipLabel);
    swatchRowEl = document.createElement("div");
    swatchRowEl.className = "nsm-swatch-row";
    shipSection.appendChild(swatchRowEl);
    container.appendChild(shipSection);

    // 5. DIFFICULTY selector
    diffSectionEl = document.createElement("div");
    diffSectionEl.className = "nsm-section";
    const diffLabel = document.createElement("div");
    diffLabel.className = "nsm-label";
    diffLabel.textContent = "DIFFICULTY";
    diffSectionEl.appendChild(diffLabel);
    diffRowEl = document.createElement("div");
    diffRowEl.className = "nsm-seg-row";
    diffSectionEl.appendChild(diffRowEl);
    container.appendChild(diffSectionEl);

    // 5b. TOUCH SPEED selector (only attached when opts.sensitivities given)
    sensSectionEl = document.createElement("div");
    sensSectionEl.className = "nsm-section";
    const sensLabel = document.createElement("div");
    sensLabel.className = "nsm-label";
    sensLabel.textContent = "TOUCH SPEED";
    sensSectionEl.appendChild(sensLabel);
    sensRowEl = document.createElement("div");
    sensRowEl.className = "nsm-seg-row";
    sensSectionEl.appendChild(sensRowEl);

    // 6. Bottom row: sound toggle + leaderboard
    const bottomRow = document.createElement("div");
    bottomRow.className = "nsm-bottom-row";
    soundBtnEl = makeButton("nsm-small", "SOUND: ON");
    soundBtnEl.addEventListener("click", function () {
      const getMuted = getOpt("getMuted", function () { return false; });
      const setMuted = getOpt("setMuted", NOOP);
      let muted = false;
      try { muted = !!getMuted(); } catch (err) {}
      const next = !muted;
      try { setMuted(next); } catch (err) {}
      updateSoundLabel(next);
    });
    bottomRow.appendChild(soundBtnEl);
    const lbBtn = makeButton("nsm-small", "LEADERBOARD");
    lbBtn.addEventListener("click", function () {
      hide();
      callOpt("onShowLeaderboard");
    });
    bottomRow.appendChild(lbBtn);
    container.appendChild(bottomRow);

    // 7. Footer
    const footer = document.createElement("div");
    footer.className = "nsm-footer";
    footer.textContent = "DRAG TO MOVE · HOLD FIRE TO SHOOT";
    container.appendChild(footer);

    document.body.appendChild(container);
  }

  function updateSoundLabel(muted) {
    if (soundBtnEl) {
      soundBtnEl.textContent = muted ? "SOUND: OFF" : "SOUND: ON";
    }
  }

  function clearChildren(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function renderSwatches() {
    clearChildren(swatchRowEl);
    const themes = Array.isArray(opts.themes) ? opts.themes : [];
    const getTheme = getOpt("getTheme", function () { return null; });
    let current = null;
    try { current = getTheme(); } catch (err) {}

    themes.forEach(function (theme) {
      if (!theme) return;
      const id = theme.id;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nsm-swatch" + (id === current ? " nsm-selected" : "");
      const color = SWATCH_COLORS[id] || SWATCH_FALLBACK;
      btn.style.background = color;
      btn.setAttribute("aria-label", "Ship color: " + String(theme.name || id));
      btn.title = String(theme.name || id);
      btn.addEventListener("click", function () {
        const setTheme = getOpt("setTheme", NOOP);
        try { setTheme(id); } catch (err) {}
        // Update the glowing ring in place.
        const kids = swatchRowEl.children;
        for (let i = 0; i < kids.length; i++) {
          kids[i].classList.remove("nsm-selected");
        }
        btn.classList.add("nsm-selected");
      });
      swatchRowEl.appendChild(btn);
    });
  }

  function renderDifficulties() {
    clearChildren(diffRowEl);
    const diffs = Array.isArray(opts.difficulties) ? opts.difficulties : [];
    const getDifficulty = getOpt("getDifficulty", function () { return null; });
    let current = null;
    try { current = getDifficulty(); } catch (err) {}

    diffs.forEach(function (diff) {
      if (!diff) return;
      const id = diff.id;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "nsm-btn nsm-seg" + (id === current ? " nsm-selected" : "");
      btn.textContent = String(diff.name || id).toUpperCase();
      btn.addEventListener("click", function () {
        const setDifficulty = getOpt("setDifficulty", NOOP);
        try { setDifficulty(id); } catch (err) {}
        const kids = diffRowEl.children;
        for (let i = 0; i < kids.length; i++) {
          kids[i].classList.remove("nsm-selected");
        }
        btn.classList.add("nsm-selected");
      });
      diffRowEl.appendChild(btn);
    });
  }

  function renderSensitivities() {
    clearChildren(sensRowEl);
    const senses = Array.isArray(opts.sensitivities) ? opts.sensitivities : [];

    // Only render the row when sensitivities are provided.
    if (senses.length === 0) {
      if (sensSectionEl.parentNode) {
        sensSectionEl.parentNode.removeChild(sensSectionEl);
      }
      return;
    }
    if (!sensSectionEl.parentNode) {
      // Directly below the DIFFICULTY row.
      container.insertBefore(sensSectionEl, diffSectionEl.nextSibling);
    }

    const getSensitivity = getOpt("getSensitivity", function () { return null; });
    let current = null;
    try { current = getSensitivity(); } catch (err) {}

    senses.forEach(function (sens) {
      if (!sens) return;
      const id = sens.id;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "nsm-btn nsm-seg" + (id === current ? " nsm-selected" : "");
      btn.textContent = String(sens.name || id).toUpperCase();
      btn.addEventListener("click", function () {
        const setSensitivity = getOpt("setSensitivity", NOOP);
        try { setSensitivity(id); } catch (err) {}
        const kids = sensRowEl.children;
        for (let i = 0; i < kids.length; i++) {
          kids[i].classList.remove("nsm-selected");
        }
        btn.classList.add("nsm-selected");
      });
      sensRowEl.appendChild(btn);
    });
  }

  function refresh() {
    // High score (coerce defensively — only ever a number).
    const hi = Number(opts.hiscore);
    hiscoreValueEl.textContent = String(isFinite(hi) ? hi : 0);

    renderSwatches();
    renderDifficulties();
    renderSensitivities();

    const getMuted = getOpt("getMuted", function () { return false; });
    let muted = false;
    try { muted = !!getMuted(); } catch (err) {}
    updateSoundLabel(muted);
  }

  function show(newOpts) {
    opts = newOpts || {};
    build();
    refresh();
    container.style.display = "flex";
    visible = true;
  }

  function hide() {
    if (container) container.style.display = "none";
    visible = false;
  }

  return {
    show: show,
    hide: hide,
    get visible() {
      return visible;
    },
  };
})();
