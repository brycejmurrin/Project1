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
  const weaponHudEl = document.getElementById("weapon-hud");

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
  const FIRE_INTERVAL = 0.13; // seconds between autofire shots
  const FIRE_INTERVAL_RAPID = 0.065;
  const SPREAD_VX = 195; // px/s horizontal for spread side shots

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

  let powerups = []; // {x, y, type, t}  "spread" | "rapid"
  let weaponType = "normal";
  let weaponAmmo = 0;
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

  // Which entry wave each formation cell belongs to (5 waves of 8).
  function waveFor(row, col) {
    if (row === 0) return 1;
    if (row === 1) return col >= 3 && col <= 6 ? 1 : 2;
    if (row === 2) return col >= 3 && col <= 6 ? 2 : 3;
    if (row === 3) {
      if (col >= 3 && col <= 6) return 0;
      if (col === 0 || col === 9) return 4;
      return 3;
    }
    // row 4
    return col >= 3 && col <= 6 ? 0 : 4;
  }

  function buildEnemies() {
    enemies = [];
    function add(kind, row, col, hp) {
      enemies.push({
        kind, row, col, hp,
        wave: waveFor(row, col),
        state: "wait",
        path: null, s: 0, speed: 0,
        x: 0, y: -60, angle: 0,
        fromX: 0, fromY: 0, fromAngle: 0, slotT: 0,
        wingPhase: rand(0, 6),
        fireT: 0, shots: 0,
        beamT: 0, beamDive: false, offX: 0,
        captured: false,
        alive: true,
      });
    }
    for (let c = 3; c <= 6; c++) add("boss", 0, c, 2);
    for (let r = 1; r <= 2; r++) for (let c = 1; c <= 8; c++) add("butterfly", r, c, 1);
    for (let r = 3; r <= 4; r++) for (let c = 0; c <= 9; c++) add("bee", r, c, 1);
  }

  function enemyRadius(e) {
    return e.kind === "boss" ? 16 : e.kind === "butterfly" ? 14 : 13;
  }

  function enemyScore(e) {
    const flying = e.state !== "formation";
    if (e.kind === "bee") return flying ? 100 : 50;
    if (e.kind === "butterfly") return flying ? 160 : 80;
    return flying ? 400 : 150;
  }

  // --- Difficulty curve (stage ramp x selected difficulty) ----------------------
  function diveInterval() { return Math.max(0.8, 2.2 - (stage - 1) * 0.2) * DP.diveIntervalMul; }
  function maxDivers() { return Math.max(1, Math.min(4, 1 + Math.floor(stage / 2)) + DP.maxDiversBonus); }
  function diverSpeed() { return Math.min(700, 330 + stage * 15) * DP.diverSpeedMul; }
  function bulletSpeed() { return Math.min(500, 240 + stage * 12) * DP.bulletSpeedMul; }
  function entrySpeed() { return Math.min(560, 320 + stage * 10); }

  // --- HUD ----------------------------------------------------------------------
  function setScore(v) {
    score = v;
    scoreEl.textContent = String(score);
    if (score > hiscore) {
      hiscore = score;
      hiscoreEl.textContent = String(hiscore);
    }
    while (score >= nextExtra) {
      nextExtra += DP.extraLifeEvery;
      if (lives < 6) {
        lives++;
        GameAudio.extraLife();
      }
    }
  }

  function addScore(v) { setScore(score + v); }

  function showOverlay(title, subtitle, prompt, dead) {
    titleEl.textContent = title;
    subtitleEl.textContent = subtitle;
    promptEl.textContent = prompt;
    promptEl.style.display = prompt ? "" : "none";
    titleEl.classList.toggle("dead", !!dead);
    overlayEl.classList.remove("hidden");
  }

  function hideOverlay() { overlayEl.classList.add("hidden"); }

  function updateStageLabel() {
    stageEl.textContent = "STAGE " + stage;
  }

  // --- State transitions -----------------------------------------------------
  function goAttract() {
    state = ST.ATTRACT;
    stateT = 0;
    stageEl.innerHTML = "&nbsp;";
    hideOverlay();
    Menu.show({
      hiscore: hiscore,
      onStart: function () {
        GameAudio.unlock();
        startGame();
      },
      onShowLeaderboard: function () {
        Leaderboard.showBoard(function () { goAttract(); });
      },
      themes: Sprites.playerThemes,
      getTheme: function () { return Sprites.getPlayerTheme(); },
      setTheme: function (id) {
        Sprites.setPlayerTheme(id);
        try { localStorage.setItem(THEME_KEY, id); } catch (e) { /* private mode */ }
      },
      difficulties: Difficulty.levels,
      getDifficulty: function () { return Difficulty.get(); },
      setDifficulty: function (id) { Difficulty.set(id); },
      sensitivities: SENS_LEVELS,
      getSensitivity: function () { return sensId; },
      setSensitivity: function (id) {
        if (SENS_VALUES[id]) {
          sensId = id;
          try { localStorage.setItem(SENS_KEY, id); } catch (e) { /* ok */ }
        }
      },
      getMuted: function () { return GameAudio.muted; },
      setMuted: function (m) { GameAudio.setMuted(m); },
    });
  }

  function startGame() {
    Menu.hide();
    DP = Difficulty.params();
    stage = 1;
    setScore(0);
    scoreEl.textContent = "0";
    hiscoreEl.textContent = String(hiscore);
    lives = DP.startLives;
    nextExtra = DP.extraLifeFirst;
    player.dual = false;
    weaponType = "normal"; weaponAmmo = 0; powerups = []; updateWeaponHud();
    GameAudio.coin();
    goIntro();
  }

  function isChallengeStage() { return stage % 3 === 0; }

  function goIntro() {
    state = ST.INTRO;
    stateT = 1.6;
    updateStageLabel();
    missiles = [];
    bullets = [];
    rescueShip = null;
    lostShip = null;
    player.alive = true;
    player.invuln = 0;
    player.x = player.targetX = W() / 2;
    Fx.clear();
    syncMusic();
    GameAudio.stageIntro();
    showOverlay(
      isChallengeStage() ? "CHALLENGING STAGE" : "STAGE " + stage,
      "", "", false
    );
  }

  function goEntry() {
    hideOverlay();
    buildEnemies();
    entryWave = 0;
    spawnIdx = 0;
    spawnT = 0.2;
    wavePath = Paths.entry(0, W(), H());
    state = ST.ENTRY;
    stateT = 0;
  }

  function goChallenge() {
    hideOverlay();
    enemies = [];
    chWave = 0;
    chSpawnIdx = 0;
    chSpawnT = 0.4;
    chHits = 0;
    chWaveHits = 0;
    chBonus = 0;
    state = ST.CHALLENGE;
    stateT = 0;
  }

  function goCombat() {
    state = ST.COMBAT;
    diveT = diveInterval();
  }

  function goClear() {
    state = ST.CLEAR;
    stateT = 1.5;
  }

  function retreatDivers() {
    for (const e of enemies) {
      if (!e.alive) continue;
      if (e.state === "diving" || e.state === "beam" || e.state === "leaving") {
        if (e.state === "beam") GameAudio.tractorOff();
        e.state = "leaving";
        e.path = Paths.exit(e.x, e.y, W(), H());
        e.s = 0;
        e.speed = diverSpeed();
      }
    }
    bullets = [];
  }

  function loseLife() {
    lives--;
    if (lives > 0) {
      state = ST.READY;
      stateT = 1.4;
      showOverlay("", "", "READY", false);
    } else {
      state = ST.OVER;
      stateT = 0;
      try { localStorage.setItem(HI_KEY, String(hiscore)); } catch (e) { /* ok */ }
      GameAudio.gameOver();
      syncMusic();
      if (Leaderboard.qualifies(score)) {
        showOverlay("GAME OVER", "SCORE  " + score, "", true);
        const finalScore = score;
        const finalStage = stage;
        lbEntryActive = true;
        setTimeout(function () {
          if (state !== ST.OVER) { lbEntryActive = false; return; }
          hideOverlay();
          Leaderboard.showEntry(finalScore, finalStage, Difficulty.get(), function () {
            lbEntryActive = false;
            goAttract();
          });
        }, 1400);
      } else {
        showOverlay("GAME OVER", "SCORE  " + score, "TAP TO PLAY AGAIN", true);
      }
    }
  }

  function resumeAfterReady() {
    hideOverlay();
    player.alive = true;
    player.invuln = 1.5;
    player.x = player.targetX = W() / 2;
    if (isChallengeStage()) {
      state = ST.CHALLENGE;
    } else if (allSettledOrDead() && spawnDone()) {
      goCombat();
    } else {
      state = ST.ENTRY;
    }
  }

  function spawnDone() {
    return entryWave >= 5;
  }

  function allSettledOrDead() {
    for (const e of enemies) {
      if (e.alive && e.state !== "formation") return false;
    }
    return true;
  }

  function allDead() {
    for (const e of enemies) if (e.alive) return false;
    return true;
  }

  // --- Player hit / capture ----------------------------------------------------
  function playerHit(shipOffset) {
    if (player.invuln > 0 || !player.alive) return;
    if (player.dual) {
      // One ship of the pair explodes; keep fighting with the survivor.
      explosions.push({ x: player.x + shipOffset, y: player.y, t: 0, big: false });
      GameAudio.enemyExplode("bee");
      player.dual = false;
      player.invuln = 1;
      return;
    }
    explosions.push({ x: player.x, y: player.y, t: 0, big: true });
    GameAudio.playerExplode();
    shakeT = 0.5;
    weaponType = "normal"; weaponAmmo = 0; powerups = []; updateWeaponHud();
    player.alive = false;
    retreatDivers();
    state = ST.DYING;
    stateT = 2;
  }

  let captureBoss = null;
  let captureFrom = { x: 0, y: 0 };

  function startCapture(boss) {
    GameAudio.tractorOff();
    GameAudio.capture();
    captureBoss = boss;
    captureFrom.x = player.x;
    captureFrom.y = player.y;
    boss.beamT = 0;
    state = ST.CAPTURED;
    stateT = 1.2;
    bullets = [];
  }

  function finishCapture() {
    captureBoss.captured = true;
    bossLeave(captureBoss);
    captureBoss = null;
    player.alive = false;
    loseLife();
  }

  function bossLeave(boss) {
    boss.state = "leaving";
    boss.path = Paths.exit(boss.x, boss.y, W(), H());
    boss.s = 0;
    boss.speed = diverSpeed() * 0.8;
  }

  // --- Enemy behaviors -----------------------------------------------------------
  function enterFromTop(e) {
    const slot = slotPos(e.row, e.col);
    e.x = clamp(slot.x + rand(-40, 40), 20, W() - 20);
    e.y = -30;
    e.angle = Math.PI;
    beginToSlot(e);
  }

  function beginToSlot(e) {
    e.state = "toSlot";
    e.fromX = e.x;
    e.fromY = e.y;
    e.fromAngle = e.angle;
    e.slotT = 0;
    e.offX = 0;
  }

  function startDive(e) {
    e.state = "diving";
    e.path = Paths.dive(e.x, e.y, player.x, W(), H());
    e.s = 0;
    e.speed = diverSpeed();
    e.shots = 1 + Math.floor(rand(0, 2) + stage * 0.1);
    if (e.shots > 3) e.shots = 3;
    e.fireT = 0.15;
    e.offX = 0;
    GameAudio.dive();
  }

  function startBossDive(e, beam) {
    e.state = "diving";
    e.beamDive = beam;
    e.path = beam
      ? Paths.bossDive(e.x, e.y, player.x, W(), H())
      : Paths.dive(e.x, e.y, player.x, W(), H());
    e.s = 0;
    e.speed = diverSpeed() * 0.9;
    e.shots = beam ? 0 : 2;
    e.fireT = 0.2;
    e.offX = 0;
    GameAudio.dive();
    if (!beam) {
      // Butterfly escorts flank a raiding boss.
      let n = 0;
      for (const b of enemies) {
        if (n >= 2) break;
        if (b.alive && b.kind === "butterfly" && b.state === "formation" &&
            Math.abs(b.col - e.col) <= 1) {
          b.state = "diving";
          b.path = e.path;
          b.s = -n * 30 - 20; // trail behind on the same path
          b.speed = e.speed;
          b.shots = 1;
          b.fireT = 0.3;
          b.offX = n === 0 ? -26 : 26;
          n++;
        }
      }
    }
  }

  function fireEnemyBullet(e) {
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const spread = rand(-30, 30);
    const sp = bulletSpeed();
    bullets.push({
      x: e.x,
      y: e.y,
      vx: (dx / len) * sp + spread,
      vy: Math.max(120, (dy / len) * sp),
      phase: rand(0, 6),
    });
  }

  function beamGeometry(boss) {
    const top = boss.y + 14;
    const height = Math.max(80, player.y - top + 16);
    return { top, height, bottomHalfW: height * 0.55 / 2 };
  }

  function killEnemy(e, idx) {
    e.alive = false;
    explosions.push({ x: e.x, y: e.y, t: 0, big: e.kind === "boss" });
    GameAudio.enemyExplode(e.kind);
    const pts = Math.round(enemyScore(e) * DP.scoreMul);
    addScore(pts);
    Fx.popup(e.x, e.y, pts);
    if (e.kind === "boss") Fx.flash(1);
    if (e.state === "beam") GameAudio.tractorOff();
    if (state !== ST.CHALLENGE) {
      if (e.kind === "boss" && Math.random() < 0.5) {
        powerups.push({ x: e.x, y: e.y, type: "spread", t: 0 });
      } else if (e.kind === "butterfly" && Math.random() < 0.2) {
        powerups.push({ x: e.x, y: e.y, type: "rapid", t: 0 });
      }
    }
    if (e.captured) {
      if (e.state === "formation") {
        // Captured fighter escapes upward, lost for good.
        lostShip = { x: e.x, y: e.y - 22 };
      } else {
        // Rescued! It descends to rejoin the player.
        rescueShip = { x: e.x, y: e.y - 22 };
      }
      e.captured = false;
    }
  }

  // --- Updates ---------------------------------------------------------------
  function playableInput() {
    return state === ST.ENTRY || state === ST.COMBAT || state === ST.CHALLENGE;
  }

  function updatePlayer(dt) {
    if (!player.alive) return;
    const keySpeed = 460;
    if (keys.left) player.targetX -= keySpeed * dt;
    if (keys.right) player.targetX += keySpeed * dt;
    const margin = PLAYER_R + 8 + (player.dual ? DUAL_GAP / 2 : 0);
    player.targetX = clamp(player.targetX, margin, W() - margin);
    player.x += (player.targetX - player.x) * Math.min(1, dt * 18);
    if (player.invuln > 0) player.invuln -= dt;

    if (fireHeld && playableInput()) {
      fireCd -= dt;
      if (fireCd <= 0) {
        fireMissile();
        fireCd = currentFireInterval();
      }
    }
  }

  function currentFireInterval() {
    return weaponType === "rapid" ? FIRE_INTERVAL_RAPID : FIRE_INTERVAL;
  }

  function updateWeaponHud() {
    if (weaponType === "normal") {
      weaponHudEl.hidden = true;
    } else {
      weaponHudEl.hidden = false;
      const label = weaponType === "rapid" ? "RAPID" : "SPREAD";
      weaponHudEl.textContent = label + " ×" + weaponAmmo;
      weaponHudEl.style.color = weaponType === "rapid" ? "#35e0e0" : "#f0b429";
      weaponHudEl.style.textShadow = weaponType === "rapid"
        ? "0 0 8px rgba(53,224,224,0.8)"
        : "0 0 8px rgba(240,180,41,0.8)";
    }
  }

  function fireMissile() {
    if (paused || !player.alive || !playableInput()) return;

    if (weaponType === "spread") {
      const origins = player.dual
        ? [player.x - DUAL_GAP / 2, player.x + DUAL_GAP / 2]
        : [player.x];
      for (const ox of origins) {
        missiles.push({ x: ox, y: player.y - 16, vx: -SPREAD_VX });
        missiles.push({ x: ox, y: player.y - 16, vx: 0 });
        missiles.push({ x: ox, y: player.y - 16, vx: SPREAD_VX });
      }
      GameAudio.shoot();
      if (--weaponAmmo <= 0) { weaponType = "normal"; weaponAmmo = 0; }
      updateWeaponHud();
      return;
    }

    const rapidMod = weaponType === "rapid";
    const cap = player.dual ? 6 : (rapidMod ? 4 : 2);
    if (player.dual) {
      const room = cap - missiles.length;
      if (room >= 1) missiles.push({ x: player.x - DUAL_GAP / 2, y: player.y - 16, vx: 0 });
      if (room >= 2) missiles.push({ x: player.x + DUAL_GAP / 2, y: player.y - 16, vx: 0 });
      if (room >= 1) GameAudio.shoot();
    } else {
      if (missiles.length < cap) {
        missiles.push({ x: player.x, y: player.y - 16, vx: 0 });
        GameAudio.shoot();
      }
    }
    if (rapidMod && --weaponAmmo <= 0) { weaponType = "normal"; weaponAmmo = 0; }
    if (rapidMod) updateWeaponHud();
  }

  function updateMissiles(dt) {
    for (let i = missiles.length - 1; i >= 0; i--) {
      const m = missiles[i];
      if (m.vx) m.x += m.vx * dt;
      m.y -= 760 * dt;
      if (m.y < -20 || m.x < -20 || m.x > W() + 20) missiles.splice(i, 1);
    }
  }

  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.phase += dt * 14;
      if (b.y > H() + 20 || b.x < -20 || b.x > W() + 20) bullets.splice(i, 1);
    }
  }

  function updateExplosions(dt) {
    for (let i = explosions.length - 1; i >= 0; i--) {
      explosions[i].t += dt * (explosions[i].big ? 1.5 : 2.2);
      if (explosions[i].t >= 1) explosions.splice(i, 1);
    }
  }

  function followPath(e, dt) {
    e.s += e.speed * dt;
    if (e.s < 0) return false; // escort still trailing in
    const p = e.path.posAt(e.s);
    e.x = p.x + e.offX;
    e.y = p.y;
    e.angle = p.angle;
    return e.s >= e.path.length;
  }

  function updateEnemy(e, dt) {
    e.wingPhase += dt * 7;

    switch (e.state) {
      case "wait":
        break;

      case "entering": {
        const done = followPath(e, dt);
        // Occasional pot-shots while flying in (stage 2+).
        if (stage >= 2 && e.y > H() * 0.15 && e.y < H() * 0.6 &&
            Math.random() < dt * 0.12 * DP.entryFireMul) {
          fireEnemyBullet(e);
        }
        if (done) beginToSlot(e);
        break;
      }

      case "toSlot": {
        e.slotT += dt / 0.6;
        const t = Math.min(1, e.slotT);
        const k = 1 - Math.pow(1 - t, 3);
        const slot = slotPos(e.row, e.col);
        e.x = e.fromX + (slot.x - e.fromX) * k;
        e.y = e.fromY + (slot.y - e.fromY) * k;
        let d = -e.fromAngle;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        e.angle = e.fromAngle + d * k;
        if (t >= 1) {
          e.state = "formation";
          e.angle = 0;
        }
        break;
      }

      case "formation": {
        const slot = slotPos(e.row, e.col);
        e.x = slot.x;
        e.y = slot.y;
        e.angle = 0;
        break;
      }

      case "diving": {
        const done = followPath(e, dt);
        if (e.shots > 0 && e.y > H() * 0.25 && e.y < H() * 0.6) {
          e.fireT -= dt;
          if (e.fireT <= 0) {
            fireEnemyBullet(e);
            e.shots--;
            e.fireT = rand(0.3, 0.6);
          }
        }
        if (done) {
          if (e.kind === "boss" && e.beamDive) {
            e.state = "beam";
            e.beamT = 2.6;
            GameAudio.tractorOn();
          } else {
            enterFromTop(e);
          }
        }
        // Body contact with the player.
        if (state !== ST.CHALLENGE && player.alive &&
            Math.hypot(e.x - player.x, e.y - player.y) < enemyRadius(e) + PLAYER_R) {
          playerHit(0);
        }
        break;
      }

      case "beam": {
        e.beamT -= dt;
        e.angle = 0;
        const g = beamGeometry(e);
        if (player.alive && player.invuln <= 0 && !player.dual &&
            state === ST.COMBAT &&
            Math.abs(player.x - e.x) < g.bottomHalfW * 0.9) {
          startCapture(e);
          break;
        }
        if (e.beamT <= 0) {
          GameAudio.tractorOff();
          bossLeave(e);
        }
        break;
      }

      case "leaving": {
        if (followPath(e, dt)) enterFromTop(e);
        break;
      }

      case "fly": { // challenge stage fly-through
        if (followPath(e, dt)) e.alive = false; // escaped, not killed
        break;
      }
    }
  }

  function updateEntry(dt) {
    // Spawn the current wave one enemy at a time onto a shared path.
    if (entryWave < 5) {
      const waveEnemies = enemies.filter((e) => e.wave === entryWave);
      if (spawnIdx < waveEnemies.length) {
        spawnT -= dt;
        if (spawnT <= 0) {
          const e = waveEnemies[spawnIdx++];
          if (e.alive) {
            e.state = "entering";
            e.path = wavePath;
            e.s = 0;
            e.speed = entrySpeed();
            const p = wavePath.posAt(0);
            e.x = p.x;
            e.y = p.y;
            e.angle = p.angle;
          }
          spawnT = 0.18;
        }
      } else {
        // Advance once everyone in this wave is settled (or gone).
        let settled = true;
        for (const e of waveEnemies) {
          if (e.alive && (e.state === "entering")) { settled = false; break; }
        }
        if (settled) {
          entryWave++;
          if (entryWave < 5) {
            spawnIdx = 0;
            spawnT = 0.3;
            wavePath = Paths.entry(entryWave % 4, W(), H());
          }
        }
      }
    }
    if (spawnDone() && allSettledOrDead()) goCombat();
  }

  function updateCombat(dt) {
    diveT -= dt;
    if (diveT <= 0) {
      diveT = diveInterval();
      let divers = 0;
      for (const e of enemies) {
        if (e.alive && (e.state === "diving" || e.state === "beam" || e.state === "leaving")) divers++;
      }
      if (divers < maxDivers()) {
        const pool = enemies.filter((e) => e.alive && e.state === "formation");
        if (pool.length) {
          // Weighted pick: bees most often, bosses rarely.
          const r = Math.random();
          let kind = r < 0.5 ? "bee" : r < 0.85 ? "butterfly" : "boss";
          let cands = pool.filter((e) => e.kind === kind);
          if (!cands.length) cands = pool;
          const e = cands[(Math.random() * cands.length) | 0];
          if (e.kind === "boss") {
            const beamActive = enemies.some((b) => b.alive && (b.state === "beam" || (b.beamDive && b.state === "diving")));
            const beam = !player.dual && !beamActive && Math.random() < DP.beamChance;
            startBossDive(e, beam);
          } else {
            startDive(e);
          }
        }
      }
    }
  }

  function updateChallenge(dt) {
    const kinds = ["bee", "bee", "butterfly", "butterfly", "boss"];
    if (chWave < 5) {
      if (chSpawnIdx < 8) {
        chSpawnT -= dt;
        if (chSpawnT <= 0) {
          const variant = (chWave * 2 + (chSpawnIdx % 2)) % 5;
          const path = Paths.challenge(variant, W(), H());
          const p = path.posAt(0);
          enemies.push({
            kind: kinds[chWave],
            row: -1, col: -1, wave: chWave,
            state: "fly",
            path, s: -(chSpawnIdx % 4) * 14,
            speed: entrySpeed() + 60,
            x: p.x, y: p.y, angle: p.angle,
            fromX: 0, fromY: 0, fromAngle: 0, slotT: 0,
            wingPhase: rand(0, 6),
            fireT: 0, shots: 0, beamT: 0, beamDive: false, offX: 0,
            captured: false, alive: true, hp: 1,
          });
          chSpawnIdx++;
          chSpawnT = 0.15;
        }
      } else if (!enemies.some((e) => e.alive && e.wave === chWave)) {
        // Wave finished (all escaped or shot down).
        if (chWaveHits === 8) {
          chBonus += 1000;
          addScore(1000);
          Fx.popup(W() / 2, H() * 0.4, 1000, [0.4, 1, 0.7, 1]);
          subtitleEl.textContent = "PERFECT WAVE  +1000";
          overlayEl.classList.remove("hidden");
          titleEl.textContent = "";
          promptEl.style.display = "none";
          setTimeout(() => { if (state === ST.CHALLENGE) hideOverlay(); }, 900);
        }
        chWave++;
        chSpawnIdx = 0;
        chSpawnT = 0.5;
        chWaveHits = 0;
      }
    } else if (!enemies.some((e) => e.alive)) {
      state = ST.RESULTS;
      stateT = 2.5;
      let txt = "HITS  " + chHits + " / 40";
      if (chHits === 40) {
        addScore(10000);
        txt += "\nPERFECT!  +10000";
        Fx.flash(1.5);
      }
      showOverlay("RESULTS", txt, "", false);
    }
  }

  // --- Collisions ---------------------------------------------------------------
  function collide() {
    // Missiles vs enemies.
    for (let i = missiles.length - 1; i >= 0; i--) {
      const m = missiles[i];
      let hit = false;
      for (const e of enemies) {
        if (!e.alive || e.state === "wait") continue;
        if (captureBoss === e) continue; // invulnerable mid-capture
        const r = enemyRadius(e);
        if (Math.abs(m.x - e.x) < r && Math.abs(m.y - e.y) < r + 4) {
          hit = true;
          e.hp--;
          if (e.hp <= 0) {
            if (state === ST.CHALLENGE) {
              e.alive = false;
              explosions.push({ x: e.x, y: e.y, t: 0, big: false });
              GameAudio.enemyExplode(e.kind);
              const chPts = Math.round(100 * DP.scoreMul);
              addScore(chPts);
              Fx.popup(e.x, e.y, chPts);
              chHits++;
              chWaveHits++;
            } else {
              killEnemy(e);
            }
          } else {
            GameAudio.enemyHit(); // boss soaked one
          }
          break;
        }
      }
      if (hit) missiles.splice(i, 1);
    }

    // Bullets vs player.
    if (player.alive && player.invuln <= 0 && state !== ST.CHALLENGE) {
      const centers = player.dual
        ? [-DUAL_GAP / 2, DUAL_GAP / 2]
        : [0];
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        for (const off of centers) {
          if (Math.hypot(b.x - (player.x + off), b.y - player.y) < PLAYER_R) {
            bullets.splice(i, 1);
            playerHit(off);
            break;
          }
        }
        if (!player.alive || player.invuln > 0) break;
      }
    }
  }

  // --- Rescue / lost ships --------------------------------------------------------
  function updateFreedShips(dt) {
    if (rescueShip) {
      rescueShip.y += 130 * dt;
      rescueShip.x += (player.x - rescueShip.x) * Math.min(1, dt * 3);
      if (player.alive && rescueShip.y >= player.y - 6) {
        player.dual = true;
        addScore(1000);
        Fx.popup(player.x, player.y - 30, 1000, [0.4, 1, 0.7, 1]);
        GameAudio.rescue();
        rescueShip = null;
      } else if (rescueShip && rescueShip.y > H() + 30) {
        rescueShip = null;
      }
    }
    if (lostShip) {
      lostShip.y -= 200 * dt;
      if (lostShip.y < -40) lostShip = null;
    }
  }

  function updatePowerups(dt) {
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      p.y += 70 * dt;
      p.t += dt;
      if (player.alive && Math.hypot(p.x - player.x, p.y - player.y) < 22) {
        weaponType = p.type;
        weaponAmmo = p.type === "rapid" ? 80 : 25;
        Fx.flash(0.5);
        updateWeaponHud();
        powerups.splice(i, 1);
      } else if (p.y > H() + 20) {
        powerups.splice(i, 1);
      }
    }
  }

  // --- Master update ----------------------------------------------------------------
  function update(dt) {
    formT += dt;
    const starSpeed = state === ST.ATTRACT ? 60 : 110;
    for (const s of stars) {
      s.y += starSpeed * (0.2 + s.depth * 0.6) * dt;
      s.tw += dt * 3;
      if (s.y > H() + 4) {
        s.y = -4;
        s.x = Math.random() * W();
      }
    }
    if (shakeT > 0) shakeT -= dt;

    updateExplosions(dt);
    Fx.update(dt);

    switch (state) {
      case ST.ATTRACT:
        return;

      case ST.INTRO:
        stateT -= dt;
        if (stateT <= 0) {
          if (isChallengeStage()) goChallenge();
          else goEntry();
        }
        return;

      case ST.ENTRY:
      case ST.COMBAT:
      case ST.CHALLENGE: {
        updatePlayer(dt);
        updateMissiles(dt);
        updateBullets(dt);
        updateFreedShips(dt);
        for (const e of enemies) if (e.alive) updateEnemy(e, dt);
        if (state === ST.ENTRY) updateEntry(dt);
        else if (state === ST.COMBAT) updateCombat(dt);
        else updateChallenge(dt);
        collide();
        updatePowerups(dt);
        if (state !== ST.CHALLENGE && enemies.length && allDead()) goClear();
        return;
      }

      case ST.CLEAR:
        updateMissiles(dt);
        updatePlayer(dt);
        stateT -= dt;
        if (stateT <= 0) {
          stage++;
          goIntro();
        }
        return;

      case ST.DYING:
        updateBullets(dt);
        for (const e of enemies) if (e.alive) updateEnemy(e, dt);
        stateT -= dt;
        if (stateT <= 0) loseLife();
        return;

      case ST.CAPTURED: {
        stateT -= dt;
        const t = 1 - Math.max(0, stateT / 1.2);
        if (captureBoss) {
          player.x = captureFrom.x + (captureBoss.x - captureFrom.x) * t;
          player.y = captureFrom.y + (captureBoss.y + 8 - captureFrom.y) * t;
        }
        for (const e of enemies) {
          if (e.alive && e !== captureBoss) updateEnemy(e, dt);
        }
        if (stateT <= 0) {
          computeMetrics(); // restore player.y
          finishCapture();
        }
        return;
      }

      case ST.READY:
        for (const e of enemies) if (e.alive) updateEnemy(e, dt);
        stateT -= dt;
        if (stateT <= 0) resumeAfterReady();
        return;

      case ST.RESULTS:
        stateT -= dt;
        if (stateT <= 0) {
          stage++;
          goIntro();
        }
        return;

      case ST.OVER:
        stateT += dt;
        return;
    }
  }

  // --- Render --------------------------------------------------------------------
  function render() {
    Renderer.clear(0.02, 0.024, 0.06);
    if (shakeT > 0) {
      const m = 12 * (shakeT / 0.5);
      Renderer.setOffset(rand(-m, m), rand(-m, m));
    } else {
      Renderer.setOffset(0, 0);
    }

    for (const s of stars) {
      const a = (0.25 + s.depth * 0.55) * (0.7 + 0.3 * Math.sin(s.tw));
      Renderer.quad(s.x, s.y, s.size, s.size, [0.7, 0.85, 1.0, a]);
    }

    // Tractor beams under everything else.
    for (const e of enemies) {
      if (e.alive && e.state === "beam") {
        const g = beamGeometry(e);
        Sprites.tractorBeam(e.x, g.top, g.height, formT * 3);
      }
    }
    if (state === ST.CAPTURED && captureBoss) {
      const g = beamGeometry(captureBoss);
      Sprites.tractorBeam(captureBoss.x, g.top, g.height, formT * 3);
    }

    for (const e of enemies) {
      if (!e.alive || e.state === "wait") continue;
      if (e.kind === "bee") Sprites.bee(e.x, e.y, 1, e.angle, e.wingPhase);
      else if (e.kind === "butterfly") Sprites.butterfly(e.x, e.y, 1, e.angle, e.wingPhase);
      else Sprites.boss(e.x, e.y, 1, e.angle, e.wingPhase, e.hp <= 1);
      if (e.captured) Sprites.player(e.x, e.y - 22, 0.7, Math.PI);
    }

    if (rescueShip) Sprites.player(rescueShip.x, rescueShip.y, 0.85, 0);
    if (lostShip) Sprites.player(lostShip.x, lostShip.y, 0.7, Math.PI);

    for (const b of bullets) Sprites.enemyBullet(b.x, b.y, b.phase);
    for (const m of missiles) Sprites.playerMissile(m.x, m.y);
    for (const p of powerups) {
      const pulse = 0.8 + 0.2 * Math.sin(p.t * 9);
      const color = p.type === "rapid"
        ? [0.25, 0.88, 1, pulse]
        : [1, 0.75, 0.12, pulse];
      Renderer.rotQuad(p.x, p.y, 13, 13, p.t * 3, color);
      Renderer.rotQuad(p.x, p.y, 7, 7, -p.t * 5, [1, 1, 1, pulse * 0.6]);
    }

    // Player (blinks while invulnerable).
    const drawPlayer =
      (player.alive || state === ST.CAPTURED) &&
      state !== ST.ATTRACT &&
      (player.invuln <= 0 || Math.floor(player.invuln * 10) % 2 === 0);
    if (drawPlayer) {
      if (player.dual) {
        Sprites.player(player.x - DUAL_GAP / 2, player.y, 1, 0);
        Sprites.player(player.x + DUAL_GAP / 2, player.y, 1, 0);
      } else {
        Sprites.player(player.x, player.y, 1, 0);
      }
    }

    for (const ex of explosions) Sprites.explosion(ex.x, ex.y, ex.t, ex.big);
    Fx.draw();

    // Bottom HUD: reserve lives and stage flags.
    if (state !== ST.ATTRACT) {
      for (let i = 0; i < Math.max(0, lives - 1); i++) {
        Sprites.player(18 + i * 26, H() - 20, 0.62, 0);
      }
      // Flags sit left of the FIRE button.
      const flags = Math.min(stage, 8);
      for (let i = 0; i < flags; i++) {
        Sprites.flag(W() - 104 - i * 16, H() - 20, 1);
      }
    }

    Renderer.flush();
  }

  // --- Pause ----------------------------------------------------------------------
  function inRun() {
    return state !== ST.ATTRACT && state !== ST.OVER;
  }

  // Music plays during a run (unless turned off), never on menus or pause.
  function syncMusic() {
    if (musicPref && inRun() && !paused) GameAudio.musicOn();
    else GameAudio.musicOff();
  }

  function setPaused(p) {
    if (p === paused || (p && !inRun())) return;
    paused = p;
    pauseMenu.hidden = !p;
    if (p) {
      GameAudio.tractorOff();
      pmSound.textContent = "SOUND: " + (GameAudio.muted ? "OFF" : "ON");
      pmMusic.textContent = "MUSIC: " + (musicPref ? "ON" : "OFF");
    } else {
      // Restore the beam hum if a boss was mid-beam when we paused.
      for (const e of enemies) {
        if (e.alive && e.state === "beam") { GameAudio.tractorOn(); break; }
      }
    }
    syncMusic();
  }

  function quitToMenu() {
    setPaused(false);
    GameAudio.tractorOff();
    GameAudio.musicOff();
    Fx.clear();
    enemies = [];
    missiles = [];
    bullets = [];
    explosions = [];
    powerups = [];
    weaponType = "normal"; weaponAmmo = 0; updateWeaponHud();
    rescueShip = null;
    lostShip = null;
    captureBoss = null;
    try { localStorage.setItem(HI_KEY, String(hiscore)); } catch (e) { /* ok */ }
    goAttract();
  }

  pauseBtn.addEventListener("click", function () { setPaused(!paused); });
  pmResume.addEventListener("click", function () { setPaused(false); });
  pmRestart.addEventListener("click", function () {
    setPaused(false);
    startGame();
  });
  pmSound.addEventListener("click", function () {
    GameAudio.setMuted(!GameAudio.muted);
    pmSound.textContent = "SOUND: " + (GameAudio.muted ? "OFF" : "ON");
  });
  pmMusic.addEventListener("click", function () {
    musicPref = !musicPref;
    try { localStorage.setItem(MUSIC_KEY, musicPref ? "on" : "off"); } catch (e) { /* ok */ }
    pmMusic.textContent = "MUSIC: " + (musicPref ? "ON" : "OFF");
    syncMusic();
  });
  pmQuit.addEventListener("click", quitToMenu);

  if (typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && inRun() && !paused) setPaused(true);
    });
  }

  // --- Input ----------------------------------------------------------------------
  function startFromUI() {
    if (lbEntryActive) return false;
    if (state === ST.ATTRACT) {
      startGame();
      return true;
    }
    if (state === ST.OVER && stateT > 0.8) {
      startGame();
      return true;
    }
    return false;
  }

  // Movement: relative drag anywhere on the canvas (the finger doesn't have
  // to sit on the ship). One pointer steers; firing is the FIRE button's job,
  // so a second thumb can hold fire simultaneously. A new touch always takes
  // over steering so a missed pointerup can never freeze the ship.
  canvas.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    GameAudio.unlock();
    if (paused) return;
    if (startFromUI()) return;
    if (playableInput()) {
      movePointerId = e.pointerId;
      moveStartX = e.clientX;
      moveStartTarget = player.targetX;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
    }
  });

  canvas.addEventListener("pointermove", function (e) {
    if (e.pointerId === movePointerId) {
      e.preventDefault();
      player.targetX = moveStartTarget + (e.clientX - moveStartX) * dragSens();
    }
  });

  function endPointer(e) {
    if (movePointerId === null || !e || e.pointerId === movePointerId) {
      movePointerId = null;
    }
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("lostpointercapture", endPointer);
  // Releases can land on overlays (pause menu, buttons) instead of the
  // canvas; catch them at the window level in the capture phase.
  window.addEventListener("pointerup", endPointer, true);
  window.addEventListener("pointercancel", endPointer, true);

  // FIRE button: tap fires, hold autofires; independent of the move pointer.
  fireBtn.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    GameAudio.unlock();
    if (paused) return;
    fireHeld = true;
    fireCd = currentFireInterval();
    fireMissile();
    try { fireBtn.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
  });

  function endFire(e) {
    if (e) e.preventDefault();
    fireHeld = false;
  }
  fireBtn.addEventListener("pointerup", endFire);
  fireBtn.addEventListener("pointercancel", endFire);
  fireBtn.addEventListener("lostpointercapture", endFire);
  fireBtn.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  window.addEventListener("keydown", function (e) {
    GameAudio.unlock();
    if (e.code === "Escape" || e.code === "KeyP") {
      setPaused(!paused);
      return;
    }
    if (paused) return;
    if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = true;
    if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = true;
    if (e.code === "Space" || e.code === "Enter") {
      if (!startFromUI() && e.code === "Space") {
        if (!fireHeld) fireMissile();
        fireHeld = true;
        fireCd = currentFireInterval();
      }
      e.preventDefault();
    }
  });

  window.addEventListener("keyup", function (e) {
    if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = false;
    if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = false;
    if (e.code === "Space") fireHeld = false;
  });

  window.addEventListener("resize", function () {
    Renderer.resize();
    computeMetrics();
    initStars();
  });

  // --- Boot ------------------------------------------------------------------------
  // Unlock audio on the first gesture of ANY kind, in the capture phase, so
  // UI layers that stop propagation (menu, leaderboard) can't starve it.
  // iOS is picky about which events count; touchend/click are the safest.
  ["pointerdown", "touchend", "mousedown", "click", "keydown"].forEach(function (ev) {
    window.addEventListener(ev, function () { GameAudio.unlock(); }, true);
  });

  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme && Sprites.setPlayerTheme) Sprites.setPlayerTheme(savedTheme);

  computeMetrics();
  initStars();
  hiscoreEl.textContent = String(hiscore);
  scoreEl.textContent = "0";
  goAttract();

  let lastTime = 0;
  function frame(now) {
    const dt = Math.min((now - lastTime) / 1000, 1 / 20);
    lastTime = now;
    if (!paused) update(dt);
    render();
    const showPause = inRun() && !lbEntryActive;
    if (showPause !== pauseBtnShown) {
      pauseBtnShown = showPause;
      pauseBtn.hidden = !showPause;
      fireBtn.hidden = !showPause;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(function (now) {
    lastTime = now;
    requestAnimationFrame(frame);
  });
})();
