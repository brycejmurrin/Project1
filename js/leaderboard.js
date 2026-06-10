/*
 * Neon Swarm — device-local arcade leaderboard.
 *
 * Stores the top 10 runs in localStorage under the key "galaga-leaderboard"
 * as a JSON array of { initials, score, stage, difficulty, date } objects,
 * sorted by score descending. Missing/corrupt JSON and storage exceptions
 * are tolerated (treated as an empty board / persistence skipped).
 *
 * Initials sanitization rule (documented): the input is stringified and
 * uppercased, every character outside A-Z is removed (digits, punctuation
 * AND spaces), the result is truncated to 3 characters and right-padded
 * with "A" to exactly 3 characters. Examples:
 *   "ab1!"  -> "ABA"     "AB "   -> "ABA"     "" / null -> "AAA"
 *   "wxyz"  -> "WXY"
 *
 * Fully self-contained: builds its own DOM appended to document.body and
 * injects a single <style id="nsl-style"> tag (all classes prefixed "nsl-").
 */
const Leaderboard = (function () {
  "use strict";

  const STORAGE_KEY = "galaga-leaderboard";
  const MAX_ENTRIES = 10;
  const STYLE_ID = "nsl-style";
  const LETTER_A = 65;
  const LETTER_COUNT = 26;

  // ------------------------------------------------------------------
  // Data layer
  // ------------------------------------------------------------------

  function sanitizeInitials(value) {
    let s = String(value == null ? "" : value)
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 3);
    while (s.length < 3) s += "A";
    return s;
  }

  function normalizeScore(value) {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function normalizeStage(value) {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  function difficultyLetter(diff) {
    const d = String(diff == null ? "" : diff).toLowerCase();
    if (d.charAt(0) === "e") return "E";
    if (d.charAt(0) === "h") return "H";
    return "N";
  }

  function formatScore(n) {
    return String(normalizeScore(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function loadEntries() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return [];
    }
    if (!raw || typeof raw !== "string") return [];
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return [];
    }
    if (!Array.isArray(data)) return [];
    const out = [];
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      if (!item || typeof item !== "object") continue;
      const score = Number(item.score);
      if (!Number.isFinite(score)) continue;
      out.push({
        initials: sanitizeInitials(item.initials),
        score: normalizeScore(score),
        stage: normalizeStage(item.stage),
        difficulty: typeof item.difficulty === "string" ? item.difficulty : "normal",
        date: typeof item.date === "string" ? item.date : ""
      });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, MAX_ENTRIES);
  }

  function saveEntries(entries) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
      /* storage unavailable/full — skip persisting */
    }
  }

  function list() {
    // loadEntries always builds fresh objects, so this is already a copy.
    return loadEntries();
  }

  function qualifies(score) {
    const s = Number(score);
    if (!Number.isFinite(s) || s <= 0) return false;
    const entries = loadEntries();
    if (entries.length < MAX_ENTRIES) return true;
    return s > entries[entries.length - 1].score;
  }

  function add(initials, score, stage, difficulty) {
    const entries = loadEntries();
    const entry = {
      initials: sanitizeInitials(initials),
      score: normalizeScore(score),
      stage: normalizeStage(stage),
      difficulty: typeof difficulty === "string" && difficulty ? difficulty : "normal",
      date: new Date().toISOString().slice(0, 10)
    };
    entries.push(entry);
    // Stable sort: an equal score ranks below pre-existing entries.
    entries.sort(function (a, b) { return b.score - a.score; });
    const rank = entries.indexOf(entry) + 1;
    saveEntries(entries.slice(0, MAX_ENTRIES));
    return rank;
  }

  // ------------------------------------------------------------------
  // UI layer
  // ------------------------------------------------------------------

  const CSS = [
    '.nsl-overlay{position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;',
    'align-items:center;justify-content:center;gap:18px;background:rgba(5,6,15,0.94);',
    'color:#fff;font-family:"Courier New",ui-monospace,monospace;text-align:center;',
    'pointer-events:auto;-webkit-user-select:none;user-select:none;',
    '-webkit-tap-highlight-color:transparent;touch-action:manipulation;',
    'padding:calc(20px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) ',
    'calc(20px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left));}',

    '.nsl-heading{font-size:clamp(24px,6.5vw,42px);font-weight:800;letter-spacing:5px;margin:0;}',
    '.nsl-red{color:#ff3b4d;text-shadow:0 0 18px rgba(255,59,77,0.85),0 0 48px rgba(255,64,200,0.45);}',
    '.nsl-cyan{color:#40e0ff;text-shadow:0 0 18px rgba(64,224,255,0.85),0 0 48px rgba(255,64,200,0.4);}',

    '.nsl-entry-score{font-size:clamp(22px,6vw,34px);font-weight:700;letter-spacing:3px;',
    'color:#ffffff;text-shadow:0 0 12px rgba(160,220,255,0.7);}',

    '.nsl-slots{display:flex;gap:clamp(14px,5vw,30px);align-items:center;justify-content:center;}',
    '.nsl-slot-col{display:flex;flex-direction:column;align-items:center;gap:10px;}',
    '.nsl-slot{font-size:clamp(44px,12vw,64px);font-weight:800;line-height:1.1;',
    'min-width:60px;min-height:64px;display:flex;align-items:center;justify-content:center;',
    'color:#aee9ff;text-shadow:0 0 12px rgba(64,224,255,0.5);cursor:pointer;',
    'border-bottom:5px solid transparent;padding:0 6px 4px;}',
    '.nsl-slot.nsl-active{color:#ffffff;border-bottom-color:#40e0ff;',
    'text-shadow:0 0 16px rgba(64,224,255,0.95);animation:nsl-blink 0.9s steps(2) infinite;}',
    '@keyframes nsl-blink{0%,100%{border-bottom-color:#40e0ff;}50%{border-bottom-color:transparent;}}',

    '.nsl-btn{font-family:inherit;font-weight:700;letter-spacing:3px;font-size:20px;',
    'min-width:48px;min-height:48px;padding:10px 20px;background:rgba(64,224,255,0.06);',
    'border:2px solid #40e0ff;border-radius:8px;color:#40e0ff;cursor:pointer;',
    'text-shadow:0 0 8px rgba(64,224,255,0.7);box-shadow:0 0 14px rgba(64,224,255,0.3);',
    '-webkit-tap-highlight-color:transparent;touch-action:manipulation;user-select:none;',
    '-webkit-user-select:none;transition:transform 0.08s ease,background 0.08s ease;}',
    '.nsl-btn:active{background:rgba(64,224,255,0.3);transform:scale(0.93);}',
    '.nsl-ok,.nsl-close{font-size:24px;padding:12px 44px;margin-top:8px;}',

    '.nsl-table{display:flex;flex-direction:column;gap:6px;width:min(440px,92vw);}',
    '.nsl-row{display:grid;grid-template-columns:2.4em 3.6em 1fr 3em 1.6em;gap:8px;',
    'align-items:baseline;font-size:clamp(15px,4.2vw,20px);font-weight:700;letter-spacing:2px;',
    'color:#aee9ff;text-shadow:0 0 8px rgba(64,224,255,0.45);padding:2px 4px;}',
    '.nsl-row .nsl-score{text-align:right;}',
    '.nsl-row .nsl-rank{text-align:right;}',
    '.nsl-head-row{color:#ff3b4d;text-shadow:0 0 8px rgba(255,59,77,0.6);font-size:13px;}',
    '.nsl-gold{color:#ffd24a;text-shadow:0 0 12px rgba(255,210,74,0.8);}',
    '.nsl-empty{font-size:20px;letter-spacing:4px;color:#aee9ff;',
    'text-shadow:0 0 10px rgba(64,224,255,0.6);animation:nsl-pulse 1.4s ease-in-out infinite;}',
    '@keyframes nsl-pulse{0%,100%{opacity:1;}50%{opacity:0.35;}}'
  ].join("");

  let styleInjected = false;
  let entryRoot = null;
  let boardRoot = null;
  let entryRefs = null;   // { scoreEl, slotEls[], okBtn }
  let boardRefs = null;   // { tableEl, emptyEl, closeBtn }
  let entryState = null;  // { letters[], active, score, stage, difficulty, onDone }
  let boardOnClose = null;
  let keyTarget = null;
  let keyHandler = null;

  function getDoc() {
    return typeof document !== "undefined" && document ? document : null;
  }

  function ensureStyle(doc) {
    if (styleInjected) return;
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    (doc.head || doc.body).appendChild(style);
    styleInjected = true;
  }

  function isolate(root) {
    const stop = function (e) {
      if (e && typeof e.stopPropagation === "function") e.stopPropagation();
    };
    root.addEventListener("pointerdown", stop);
    root.addEventListener("pointerup", stop);
    root.addEventListener("pointermove", stop);
  }

  function cycleLetter(ch, dir) {
    const code = ch.charCodeAt(0) - LETTER_A;
    const next = (code + dir + LETTER_COUNT) % LETTER_COUNT;
    return String.fromCharCode(LETTER_A + next);
  }

  // ---- initials entry UI ----

  function renderEntry() {
    if (!entryRefs || !entryState) return;
    for (let i = 0; i < 3; i++) {
      entryRefs.slotEls[i].textContent = entryState.letters[i];
      entryRefs.slotEls[i].classList.toggle("nsl-active", i === entryState.active);
    }
  }

  function confirmEntry() {
    if (!entryState) return;
    const st = entryState;
    const rank = add(st.letters.join(""), st.score, st.stage, st.difficulty);
    hide(); // also clears entryState and removes the key listener
    if (typeof st.onDone === "function") st.onDone(rank);
  }

  function onEntryKeyDown(e) {
    if (!entryState) return;
    const key = e && e.key ? e.key : "";
    if (key.length === 1 && /[a-zA-Z]/.test(key)) {
      entryState.letters[entryState.active] = key.toUpperCase();
      entryState.active = Math.min(2, entryState.active + 1);
      renderEntry();
      if (e.preventDefault) e.preventDefault();
    } else if (key === "Backspace") {
      entryState.active = Math.max(0, entryState.active - 1);
      renderEntry();
      if (e.preventDefault) e.preventDefault();
    } else if (key === "Enter") {
      if (e.preventDefault) e.preventDefault();
      confirmEntry();
    } else if (key === "ArrowUp" || key === "ArrowDown") {
      const dir = key === "ArrowUp" ? 1 : -1;
      entryState.letters[entryState.active] =
        cycleLetter(entryState.letters[entryState.active], dir);
      renderEntry();
      if (e.preventDefault) e.preventDefault();
    } else if (key === "ArrowLeft" || key === "ArrowRight") {
      const dir = key === "ArrowRight" ? 1 : -1;
      entryState.active = Math.max(0, Math.min(2, entryState.active + dir));
      renderEntry();
      if (e.preventDefault) e.preventDefault();
    }
  }

  function attachKeys(doc) {
    detachKeys();
    keyTarget = typeof window !== "undefined" && window && window.addEventListener
      ? window
      : (doc && doc.addEventListener ? doc : null);
    if (!keyTarget) return;
    keyHandler = onEntryKeyDown;
    keyTarget.addEventListener("keydown", keyHandler);
  }

  function detachKeys() {
    if (keyTarget && keyHandler) {
      keyTarget.removeEventListener("keydown", keyHandler);
    }
    keyTarget = null;
    keyHandler = null;
  }

  function buildEntry(doc) {
    const root = doc.createElement("div");
    root.className = "nsl-overlay nsl-entry";
    isolate(root);

    const heading = doc.createElement("h1");
    heading.className = "nsl-heading nsl-red";
    heading.textContent = "NEW HIGH SCORE";
    root.appendChild(heading);

    const scoreEl = doc.createElement("div");
    scoreEl.className = "nsl-entry-score";
    root.appendChild(scoreEl);

    const slots = doc.createElement("div");
    slots.className = "nsl-slots";
    const slotEls = [];
    for (let i = 0; i < 3; i++) {
      (function (index) {
        const col = doc.createElement("div");
        col.className = "nsl-slot-col";

        const up = doc.createElement("button");
        up.type = "button";
        up.className = "nsl-btn nsl-arrow";
        up.textContent = "▲";
        up.addEventListener("click", function () {
          if (!entryState) return;
          entryState.active = index;
          entryState.letters[index] = cycleLetter(entryState.letters[index], 1);
          renderEntry();
        });

        const slot = doc.createElement("div");
        slot.className = "nsl-slot";
        slot.addEventListener("click", function () {
          if (!entryState) return;
          entryState.active = index;
          renderEntry();
        });

        const down = doc.createElement("button");
        down.type = "button";
        down.className = "nsl-btn nsl-arrow";
        down.textContent = "▼";
        down.addEventListener("click", function () {
          if (!entryState) return;
          entryState.active = index;
          entryState.letters[index] = cycleLetter(entryState.letters[index], -1);
          renderEntry();
        });

        col.appendChild(up);
        col.appendChild(slot);
        col.appendChild(down);
        slots.appendChild(col);
        slotEls.push(slot);
      })(i);
    }
    root.appendChild(slots);

    const okBtn = doc.createElement("button");
    okBtn.type = "button";
    okBtn.className = "nsl-btn nsl-ok";
    okBtn.textContent = "OK";
    okBtn.addEventListener("click", confirmEntry);
    root.appendChild(okBtn);

    root.style.display = "none";
    doc.body.appendChild(root);
    entryRoot = root;
    entryRefs = { scoreEl: scoreEl, slotEls: slotEls, okBtn: okBtn };
  }

  function showEntry(score, stage, difficulty, onDone) {
    const doc = getDoc();
    if (!doc) {
      // Headless environment: still honor the contract.
      const rank = add("AAA", score, stage, difficulty);
      if (typeof onDone === "function") onDone(rank);
      return;
    }
    hide();
    ensureStyle(doc);
    if (!entryRoot) buildEntry(doc);
    entryState = {
      letters: ["A", "A", "A"],
      active: 0,
      score: score,
      stage: stage,
      difficulty: difficulty,
      onDone: onDone
    };
    entryRefs.scoreEl.textContent = formatScore(score);
    renderEntry();
    entryRoot.style.display = "flex";
    attachKeys(doc);
  }

  // ---- top-10 board UI ----

  function buildBoard(doc) {
    const root = doc.createElement("div");
    root.className = "nsl-overlay nsl-board";
    isolate(root);

    const heading = doc.createElement("h1");
    heading.className = "nsl-heading nsl-cyan";
    heading.textContent = "LEADERBOARD";
    root.appendChild(heading);

    const tableEl = doc.createElement("div");
    tableEl.className = "nsl-table";
    root.appendChild(tableEl);

    const emptyEl = doc.createElement("div");
    emptyEl.className = "nsl-empty";
    emptyEl.textContent = "NO SCORES YET";
    emptyEl.style.display = "none";
    root.appendChild(emptyEl);

    const closeBtn = doc.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "nsl-btn nsl-close";
    closeBtn.textContent = "CLOSE";
    closeBtn.addEventListener("click", function () {
      const cb = boardOnClose;
      hide();
      if (typeof cb === "function") cb();
    });
    root.appendChild(closeBtn);

    root.style.display = "none";
    doc.body.appendChild(root);
    boardRoot = root;
    boardRefs = { tableEl: tableEl, emptyEl: emptyEl, closeBtn: closeBtn };
  }

  function makeCell(doc, cls, text) {
    const span = doc.createElement("span");
    span.className = cls;
    span.textContent = text;
    return span;
  }

  function renderBoard(doc) {
    const entries = loadEntries();
    boardRefs.tableEl.textContent = ""; // clear previous rows
    if (entries.length === 0) {
      boardRefs.tableEl.style.display = "none";
      boardRefs.emptyEl.style.display = "block";
      return;
    }
    boardRefs.tableEl.style.display = "flex";
    boardRefs.emptyEl.style.display = "none";

    const head = doc.createElement("div");
    head.className = "nsl-row nsl-head-row";
    head.appendChild(makeCell(doc, "nsl-rank", "RK"));
    head.appendChild(makeCell(doc, "nsl-initials", "AAA"));
    head.appendChild(makeCell(doc, "nsl-score", "SCORE"));
    head.appendChild(makeCell(doc, "nsl-stage", "ST"));
    head.appendChild(makeCell(doc, "nsl-diff", "DF"));
    boardRefs.tableEl.appendChild(head);

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const row = doc.createElement("div");
      row.className = "nsl-row" + (i === 0 ? " nsl-gold" : "");
      row.appendChild(makeCell(doc, "nsl-rank", String(i + 1) + "."));
      row.appendChild(makeCell(doc, "nsl-initials", e.initials));
      row.appendChild(makeCell(doc, "nsl-score", formatScore(e.score)));
      row.appendChild(makeCell(doc, "nsl-stage", String(e.stage)));
      row.appendChild(makeCell(doc, "nsl-diff", difficultyLetter(e.difficulty)));
      boardRefs.tableEl.appendChild(row);
    }
  }

  function showBoard(onClose) {
    const doc = getDoc();
    if (!doc) {
      if (typeof onClose === "function") onClose();
      return;
    }
    hide();
    ensureStyle(doc);
    if (!boardRoot) buildBoard(doc);
    renderBoard(doc);
    boardOnClose = onClose;
    boardRoot.style.display = "flex";
  }

  // ---- shared ----

  function hide() {
    detachKeys();
    entryState = null;
    boardOnClose = null;
    if (entryRoot) entryRoot.style.display = "none";
    if (boardRoot) boardRoot.style.display = "none";
  }

  return {
    list: list,
    qualifies: qualifies,
    add: add,
    showEntry: showEntry,
    showBoard: showBoard,
    hide: hide
  };
})();
