/*
 * Neon Dodge — endless dodger.
 * Drag (or use arrow keys / A-D) to steer the ship and avoid falling blocks.
 */
"use strict";

(function () {
  const canvas = document.getElementById("game");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const overlayEl = document.getElementById("overlay");
  const titleEl = document.getElementById("title");
  const subtitleEl = document.getElementById("subtitle");
  const promptEl = document.getElementById("prompt");

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

  const BEST_KEY = "neon-dodge-best";

  // Colors as [r, g, b, a] in 0..1.
  const SHIP_COLOR = [0.25, 0.88, 1.0, 1.0];
  const SHIP_GLOW = [0.25, 0.88, 1.0, 0.22];
  const FLAME_COLOR = [1.0, 0.62, 0.2, 0.9];
  const OBSTACLE_COLORS = [
    [1.0, 0.31, 0.49, 1.0],
    [1.0, 0.25, 0.78, 1.0],
    [0.62, 0.36, 1.0, 1.0],
    [1.0, 0.55, 0.25, 1.0],
  ];

  const STATE_MENU = 0;
  const STATE_PLAYING = 1;
  const STATE_DYING = 2;
  const STATE_OVER = 3;

  let state = STATE_MENU;
  let elapsed = 0;
  let score = 0;
  let best = Number(localStorage.getItem(BEST_KEY) || 0);

  const ship = {
    x: 0,
    y: 0,
    targetX: 0,
    halfW: 17,
    height: 34,
  };

  let obstacles = [];
  let particles = [];
  let stars = [];
  let spawnTimer = 0;
  let shakeTime = 0;
  let shakeMag = 0;
  let dieTimer = 0;

  const keys = { left: false, right: false };
  let dragging = false;

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function initStars() {
    stars = [];
    const count = Math.floor((Renderer.width * Renderer.height) / 9000);
    for (let i = 0; i < count; i++) {
      const depth = Math.random();
      stars.push({
        x: Math.random() * Renderer.width,
        y: Math.random() * Renderer.height,
        depth,
        size: 1 + depth * 2.2,
      });
    }
  }

  function resetGame() {
    elapsed = 0;
    score = 0;
    spawnTimer = 0;
    shakeTime = 0;
    dieTimer = 0;
    obstacles = [];
    particles = [];
    ship.x = Renderer.width / 2;
    ship.targetX = ship.x;
    ship.y = Renderer.height - Math.max(90, Renderer.height * 0.12);
  }

  function showOverlay(title, subtitle, prompt, dead) {
    titleEl.textContent = title;
    subtitleEl.textContent = subtitle;
    promptEl.textContent = prompt;
    titleEl.classList.toggle("dead", !!dead);
    overlayEl.classList.remove("hidden");
  }

  function updateBestLabel() {
    bestEl.textContent = best > 0 ? "BEST " + best : "";
  }

  function startGame() {
    resetGame();
    state = STATE_PLAYING;
    overlayEl.classList.add("hidden");
  }

  // --- Difficulty curve -----------------------------------------------------

  function fallSpeed() {
    return Math.min(260 + elapsed * 14, 980);
  }

  function spawnInterval() {
    return Math.max(0.22, 0.85 - elapsed * 0.011);
  }

  // --- Spawning & particles -------------------------------------------------

  function spawnObstacle() {
    const w = rand(38, Math.max(60, Renderer.width * 0.28));
    const h = rand(20, 34);
    obstacles.push({
      x: rand(0, Renderer.width - w),
      y: -h,
      w,
      h,
      vy: fallSpeed() * rand(0.9, 1.15),
      spin: rand(-1.5, 1.5),
      angle: 0,
      color: OBSTACLE_COLORS[(Math.random() * OBSTACLE_COLORS.length) | 0],
    });
  }

  function emitExhaust(dt) {
    if (Math.random() < dt * 90) {
      particles.push({
        x: ship.x + rand(-4, 4),
        y: ship.y + ship.height / 2,
        vx: rand(-20, 20),
        vy: rand(120, 220),
        life: rand(0.25, 0.5),
        maxLife: 0.5,
        size: rand(3, 6),
        color: FLAME_COLOR,
      });
    }
  }

  function explode(x, y) {
    for (let i = 0; i < 70; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = rand(60, 460);
      const palette = Math.random() < 0.5 ? SHIP_COLOR : OBSTACLE_COLORS[0];
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: rand(0.4, 1.1),
        maxLife: 1.1,
        size: rand(2, 7),
        color: palette,
      });
    }
    shakeTime = 0.5;
    shakeMag = 14;
  }

  // --- Update ---------------------------------------------------------------

  function updatePlaying(dt) {
    elapsed += dt;
    score += dt * 18 + fallSpeed() * dt * 0.012;
    scoreEl.textContent = String(Math.floor(score));

    // Steering: drag sets a target; keys nudge the target.
    const keySpeed = 520;
    if (keys.left) ship.targetX -= keySpeed * dt;
    if (keys.right) ship.targetX += keySpeed * dt;
    ship.targetX = Math.max(ship.halfW + 6, Math.min(Renderer.width - ship.halfW - 6, ship.targetX));
    ship.x += (ship.targetX - ship.x) * Math.min(1, dt * 18);

    emitExhaust(dt);

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnObstacle();
      spawnTimer = spawnInterval();
    }

    const shipLeft = ship.x - ship.halfW * 0.72;
    const shipRight = ship.x + ship.halfW * 0.72;
    const shipTop = ship.y - ship.height / 2 + 6;
    const shipBottom = ship.y + ship.height / 2 - 2;

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.y += o.vy * dt;
      o.angle += o.spin * dt;
      if (o.y > Renderer.height + 60) {
        obstacles.splice(i, 1);
        continue;
      }
      if (
        shipRight > o.x &&
        shipLeft < o.x + o.w &&
        shipBottom > o.y &&
        shipTop < o.y + o.h
      ) {
        state = STATE_DYING;
        dieTimer = 0.9;
        explode(ship.x, ship.y);
        if (Math.floor(score) > best) {
          best = Math.floor(score);
          localStorage.setItem(BEST_KEY, String(best));
        }
        updateBestLabel();
        return;
      }
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 240 * dt;
    }
  }

  function updateStars(dt, speedScale) {
    const baseSpeed = state === STATE_PLAYING || state === STATE_DYING ? fallSpeed() : 120;
    for (const s of stars) {
      s.y += baseSpeed * (0.15 + s.depth * 0.55) * speedScale * dt;
      if (s.y > Renderer.height + 4) {
        s.y = -4;
        s.x = Math.random() * Renderer.width;
      }
    }
  }

  function update(dt) {
    if (state === STATE_PLAYING) {
      updatePlaying(dt);
    } else if (state === STATE_DYING) {
      dieTimer -= dt;
      // Obstacles keep drifting during the death pause.
      for (const o of obstacles) {
        o.y += o.vy * dt * 0.4;
        o.angle += o.spin * dt;
      }
      if (dieTimer <= 0) {
        state = STATE_OVER;
        showOverlay("WRECKED", "SCORE " + Math.floor(score), "TAP TO RETRY", true);
      }
    }
    updateParticles(dt);
    updateStars(dt, 1);
    if (shakeTime > 0) shakeTime -= dt;
  }

  // --- Render ---------------------------------------------------------------

  function drawStars() {
    for (const s of stars) {
      const a = 0.25 + s.depth * 0.6;
      Renderer.quad(s.x, s.y, s.size, s.size, [0.7, 0.85, 1.0, a]);
    }
  }

  function drawShip() {
    const top = ship.y - ship.height / 2;
    const bottom = ship.y + ship.height / 2;
    // Glow halo, then hull, then cockpit stripe.
    Renderer.tri(ship.x, top - 8, ship.x - ship.halfW - 8, bottom + 6, ship.x + ship.halfW + 8, bottom + 6, SHIP_GLOW);
    Renderer.tri(ship.x, top, ship.x - ship.halfW, bottom, ship.x + ship.halfW, bottom, SHIP_COLOR);
    Renderer.tri(ship.x, top + 10, ship.x - ship.halfW * 0.4, bottom - 4, ship.x + ship.halfW * 0.4, bottom - 4, [0.9, 1.0, 1.0, 0.9]);
  }

  function drawObstacles() {
    for (const o of obstacles) {
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      const glow = [o.color[0], o.color[1], o.color[2], 0.18];
      Renderer.rotQuad(cx, cy, o.w + 12, o.h + 12, o.angle, glow);
      Renderer.rotQuad(cx, cy, o.w, o.h, o.angle, o.color);
      Renderer.rotQuad(cx, cy, o.w * 0.6, o.h * 0.35, o.angle, [1, 1, 1, 0.25]);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const a = (p.life / p.maxLife) * p.color[3];
      Renderer.rotQuad(p.x, p.y, p.size, p.size, p.life * 6, [p.color[0], p.color[1], p.color[2], a]);
    }
  }

  function render() {
    Renderer.clear(0.02, 0.024, 0.06);

    if (shakeTime > 0) {
      const m = shakeMag * (shakeTime / 0.5);
      Renderer.setOffset(rand(-m, m), rand(-m, m));
    } else {
      Renderer.setOffset(0, 0);
    }

    drawStars();
    drawObstacles();
    drawParticles();
    if (state === STATE_PLAYING || state === STATE_MENU) drawShip();

    Renderer.flush();
  }

  // --- Input ----------------------------------------------------------------

  function pointerX(e) {
    return e.clientX;
  }

  canvas.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    if (state === STATE_MENU || state === STATE_OVER) {
      startGame();
      return;
    }
    if (state === STATE_PLAYING) {
      dragging = true;
      ship.targetX = pointerX(e);
      canvas.setPointerCapture(e.pointerId);
    }
  });

  canvas.addEventListener("pointermove", function (e) {
    if (dragging && state === STATE_PLAYING) {
      e.preventDefault();
      ship.targetX = pointerX(e);
    }
  });

  canvas.addEventListener("pointerup", function () {
    dragging = false;
  });
  canvas.addEventListener("pointercancel", function () {
    dragging = false;
  });

  window.addEventListener("keydown", function (e) {
    if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = true;
    if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = true;
    if ((e.code === "Space" || e.code === "Enter") && (state === STATE_MENU || state === STATE_OVER)) {
      startGame();
    }
  });

  window.addEventListener("keyup", function (e) {
    if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = false;
    if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = false;
  });

  window.addEventListener("resize", function () {
    Renderer.resize();
    initStars();
    ship.y = Renderer.height - Math.max(90, Renderer.height * 0.12);
    ship.targetX = Math.max(ship.halfW, Math.min(Renderer.width - ship.halfW, ship.targetX));
  });

  // --- Main loop --------------------------------------------------------------

  let lastTime = 0;

  function frame(now) {
    const dt = Math.min((now - lastTime) / 1000, 1 / 20);
    lastTime = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  resetGame();
  initStars();
  updateBestLabel();
  scoreEl.textContent = "0";
  showOverlay("NEON DODGE", "Drag to steer · dodge the blocks", "TAP TO START", false);

  requestAnimationFrame(function (now) {
    lastTime = now;
    requestAnimationFrame(frame);
  });
})();
