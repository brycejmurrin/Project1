/*
 * Neon Swarm — difficulty tuning module.
 *
 * Exposes a global `Difficulty` with data-driven multipliers that game.js
 * applies to its difficulty curve. Field-by-field wiring guide:
 *
 *   startLives      — startGame(): lives = p.startLives (replaces the literal 3).
 *   scoreMul        — killEnemy()/enemyScore(): addScore(Math.round(enemyScore(e) * p.scoreMul)).
 *   diveIntervalMul — diveInterval(): multiply the returned interval by p.diveIntervalMul.
 *   maxDiversBonus  — maxDivers(): Math.max(1, maxDivers() + p.maxDiversBonus).
 *   diverSpeedMul   — diverSpeed(): multiply the returned speed by p.diverSpeedMul.
 *   bulletSpeedMul  — bulletSpeed(): multiply the returned speed by p.bulletSpeedMul.
 *   entryFireMul    — updateEnemy() "entering": pot-shot chance dt * 0.12 * p.entryFireMul.
 *   beamChance      — updateCombat(): boss tractor-beam chance, Math.random() < p.beamChance
 *                     (replaces the literal 0.4).
 *   extraLifeFirst  — startGame(): nextExtra = p.extraLifeFirst (replaces 20000).
 *   extraLifeEvery  — setScore(): nextExtra += p.extraLifeEvery (replaces 70000).
 *
 * Persistence: localStorage key "difficulty" ('easy' | 'normal' | 'hard');
 * unknown/missing values and storage failures fall back to 'normal'.
 * No DOM access, no dependencies, never throws.
 */
"use strict";

const Difficulty = (function () {
  const STORAGE_KEY = "difficulty";
  const DEFAULT_ID = "normal";

  const TABLES = Object.freeze({
    easy: Object.freeze({
      startLives: 4,
      scoreMul: 0.8,
      diveIntervalMul: 1.35,
      maxDiversBonus: -1,
      diverSpeedMul: 0.85,
      bulletSpeedMul: 0.85,
      entryFireMul: 0.5,
      beamChance: 0.3,
      extraLifeFirst: 15000,
      extraLifeEvery: 60000,
    }),
    normal: Object.freeze({
      startLives: 3,
      scoreMul: 1,
      diveIntervalMul: 1,
      maxDiversBonus: 0,
      diverSpeedMul: 1,
      bulletSpeedMul: 1,
      entryFireMul: 1,
      beamChance: 0.4,
      extraLifeFirst: 20000,
      extraLifeEvery: 70000,
    }),
    hard: Object.freeze({
      startLives: 3,
      scoreMul: 1.5,
      diveIntervalMul: 0.75,
      maxDiversBonus: 1,
      diverSpeedMul: 1.15,
      bulletSpeedMul: 1.15,
      entryFireMul: 1.6,
      beamChance: 0.55,
      extraLifeFirst: 25000,
      extraLifeEvery: 80000,
    }),
  });

  const LEVELS = Object.freeze([
    Object.freeze({ id: "easy", name: "EASY" }),
    Object.freeze({ id: "normal", name: "NORMAL" }),
    Object.freeze({ id: "hard", name: "HARD" }),
  ]);

  function normalize(id) {
    return Object.prototype.hasOwnProperty.call(TABLES, id) ? id : DEFAULT_ID;
  }

  // In-memory fallback so set()/get() stay consistent even when
  // localStorage is unavailable (private mode, quota, disabled).
  let current = DEFAULT_ID;
  try {
    current = normalize(localStorage.getItem(STORAGE_KEY));
  } catch (err) {
    current = DEFAULT_ID;
  }

  function get() {
    try {
      current = normalize(localStorage.getItem(STORAGE_KEY));
    } catch (err) {
      /* keep in-memory value */
    }
    return current;
  }

  function set(id) {
    current = normalize(id);
    try {
      localStorage.setItem(STORAGE_KEY, current);
    } catch (err) {
      /* persistence unavailable; in-memory value still applies */
    }
    return current;
  }

  function params() {
    const table = TABLES[get()];
    const copy = {};
    for (const key in table) copy[key] = table[key];
    return copy;
  }

  function param(key) {
    return TABLES[get()][key];
  }

  return Object.freeze({
    levels: LEVELS,
    get: get,
    set: set,
    params: params,
    param: param,
  });
})();
