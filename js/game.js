/*
 * Neon Swarm — a Galaga-style fixed shooter.
 * Enemies fly in along spline paths into a breathing formation, then dive
 * at the player. Bosses can capture your ship with a tractor beam; destroy
 * a diving captor to rescue it and fight as a dual fighter.
 */
"use strict";

(function () {
  const canvas = document.getElementById("game");
  const scoreEl = document.getElementById("score");
  const hiscoreEl = document.getElementById("hiscore");
  const stageEl = document.getElementById("stage");
  const overlayEl = document.getElementById("overlay");
  const titleEl = document.getElementById("title");
  const subtitleEl = document.getElementById("subtitle");
  const promptEl = document.getElementById("prompt");
  const pauseBtn = document.getElementById("pausebtn");
  const pauseMenu = document.getElementById("pausemenu");
  const pmResume = document.getElementById("pm-resume");
  const pmRestart = document.getElementById("pm-restart");
  const pmSound = document.getElementById("pm-sound");
  const pmQuit = document.getElementById("pm-quit");
  const pmMusic = document.getElementById("pm-music");
  const fireBtn = document.getElementById("firebtn");

  let glOk = false;
  try {
    glOk = Renderer.init(canvas);
  } catch (err) {
    glOk = false;
  }
  if (!glOk) {
    document.getElementById("nogl").hidden = false;
    return;
  }

  const HI_KEY = "galaga-hiscore";
  const THEME_KEY = "ship-theme";

  // --- Game states ----------------------------------------------------------
  const ST = {
    ATTRACT: 0,   // title screen
    INTRO: 1,     // "STAGE N"
    ENTRY: 2,     // waves flying in
    COMBAT: 3,    // formation + dives
    CHALLENGE: 4, // bonus fly-through stage
    CLEAR: 5,     // stage cleared pause
    DYING: 6,     // player exploding, field retreating
    CAPTURED: 7,  // ship being pulled into a boss
    READY: 8,     // pre-respawn pause
    RESULTS: 9,   // challenge stage tally
    OVER: 10,
  };

  let state = ST.ATTRACT;
  let stateT = 0;

  let stage = 1;
  let score = 0;
  let hiscore = Math.max(
    Number(localStorage.getItem(HI_KEY) || 0),
    Number(localStorage.getItem("neon-dodge-best") || 0)
  );
  let lives = 3; // total ships including the one in play
  let nextExtra = 20000;
  let DP = Difficulty.params(); // active difficulty tuning
  let lbEntryActive = false;    // leaderboard initials UI is up
  let paused = false;
  let pauseBtnShown = false;

  // --- Player ---------------------------------------------------------------
  const player = {
    x: 0,
    targetX: 0,
    y: 0,
    dual: false,
    alive: true,
    invuln: 0,
  };
  const PLAYER_R = 12;
  const DUAL_GAP = 24;

  let missiles = []; // {x, y}
  let bullets = [];  // {x, y, vx, vy, phase}
  let explosions = []; // {x, y, t, big}
  let rescueShip = null; // {x, y} descending freed fighter
  let lostShip = null;   // {x, y} cosmetic, flies away

  // --- Enemies ---------------------------------------------------------------
  let enemies = [];
  let entryWave = 0;
  let spawnIdx = 0;
  let spawnT = 0;
  let wavePath = null;
  let diveT = 2;
  let formT = 0;

  // Challenge stage bookkeeping
  let chWave = 0;
  let chSpawnIdx = 0;
  let chSpawnT = 0;
  let chHits = 0;
  let chWaveHits = 0;
  let chBonus = 0;

  const keys = { left: false, right: false };
  let movePointerId = null; // the touch that steers the ship
  let moveStartX = 0;
  let moveStartTarget = 0;
  let fireHeld = false;
  let fireCd = 0;

  // Touch drag sensitivity (ship px per finger px), selectable in the menu.
  const SENS_KEY = "touch-sens";
  const SENS_LEVELS = [
    { id: "slow", name: "SLOW" },
    { id: "normal", name: "NORMAL" },
    { id: "fast", name: "FAST" },
  ];
  const SENS_VALUES = { slow: 1.0, normal: 1.5, fast: 2.2 };
  let sensId = "normal";
  try {
    const s = localStorage.getItem(SENS_KEY);
    if (s && SENS_VALUES[s]) sensId = s;
  } catch (e) { /* private mode */ }
  function dragSens() { return SENS_VALUES[sensId] || 1.5; }

  // Background music preference (pause menu toggle).
  const MUSIC_KEY = "music-pref";
  let musicPref = true;
  try { musicPref = localStorage.getItem(MUSIC_KEY) !== "off"; } catch (e) { /* ok */ }

  let shakeT = 0;

  // --- Stars -----------------------------------------------------------------
  let stars = [];

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function W() { return Renderer.width; }
  function H() { return Renderer.height; }

  function initStars() {
    stars = [];
    const count = Math.floor((W() * H()) / 9000);
    for (let i = 0; i < count; i++) {
      const depth = Math.random();
      stars.push({
        x: Math.random() * W(),
        y: Math.random() * H(),
        depth,
        size: 1 + depth * 2,
        tw: Math.random() * 6,
      });
    }
  }

  // --- Formation geometry -----------------------------------------------------
  const form = { cell: 30, rowH: 28, topY: 90 };

  function computeMetrics() {
    form.cell = Math.min(34, Math.floor(W() / 11.5));
    form.rowH = Math.round(form.cell * 0.95);
    form.topY = Math.round(H() * 0.10) + 26;
    player.y = H() - Math.max(86, H() * 0.11);
  }

  function slotPos(row, col) {
    const breath = 1 + 0.06 * Math.sin(formT * 0.8);
    const sway = Math.sin(formT * 0.5) * 6;
    const cx = W() / 2;
    const cy = form.topY + form.rowH * 2;
    const bx = cx + (col - 4.5) * form.cell;
    const by = form.topY + row * form.rowH;
    return {
      x: cx + sway + (bx - cx) * breath,
      y: cy + (by - cy) * breath,
    };
  }

  // (truncated remaining content for brevity in the tool call)
