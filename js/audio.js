/*
 * Synthesized sound effects for the Galaga-style game.
 * All audio is generated with the Web Audio API (no assets).
 * Every public function is a safe no-op until unlock() has been
 * called from a user gesture (and on browsers without Web Audio).
 */
"use strict";

const GameAudio = (function () {
  const MASTER_GAIN = 0.25;
  const MIN_FREQ = 0.0001; // exponentialRamp targets must be > 0

  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let isMuted = false;

  // Tractor beam loop state.
  let tractor = null;

  // ---------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------

  function unlock() {
    try {
      if (!ctx) {
        const AC =
          (typeof window !== "undefined" &&
            (window.AudioContext || window.webkitAudioContext)) ||
          null;
        if (!AC) return;
        ctx = new AC();

        master = ctx.createGain();
        master.gain.value = isMuted ? 0 : MASTER_GAIN;
        master.connect(ctx.destination);

        noiseBuffer = makeNoiseBuffer();
      }
      // iOS Safari starts contexts suspended; resume inside the gesture.
      if (ctx.state === "suspended" && typeof ctx.resume === "function") {
        ctx.resume();
      }
    } catch (e) {
      ctx = null;
      master = null;
    }
  }

  function ready() {
    return !!(ctx && master);
  }

  function makeNoiseBuffer() {
    const len = Math.max(1, Math.floor(ctx.sampleRate * 1.0));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  function setMuted(muted) {
    isMuted = !!muted;
    try {
      if (master) {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(isMuted ? 0 : MASTER_GAIN, ctx.currentTime);
      }
    } catch (e) {
      /* ignore */
    }
  }

  function safeFreq(f) {
    return Math.max(MIN_FREQ, f || MIN_FREQ);
  }

  // ---------------------------------------------------------------------
  // Internal building blocks
  // ---------------------------------------------------------------------

  // Single oscillator voice with a gain envelope and optional pitch slide.
  // opts: { type, f0, f1, t (start offset), dur, gain, slide ("exp"|"lin") }
  function tone(opts) {
    const t0 = ctx.currentTime + (opts.t || 0);
    const dur = opts.dur || 0.1;
    const peak = opts.gain != null ? opts.gain : 0.5;

    const osc = ctx.createOscillator();
    osc.type = opts.type || "square";
    osc.frequency.setValueAtTime(safeFreq(opts.f0), t0);
    if (opts.f1 != null && opts.f1 !== opts.f0) {
      if (opts.slide === "lin") {
        osc.frequency.linearRampToValueAtTime(safeFreq(opts.f1), t0 + dur);
      } else {
        osc.frequency.exponentialRampToValueAtTime(safeFreq(opts.f1), t0 + dur);
      }
    }

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    return osc;
  }

  // White-noise burst through a swept lowpass filter.
  // opts: { dur, t, gain, filterF0, filterF1 }
  function noise(opts) {
    const t0 = ctx.currentTime + (opts.t || 0);
    const dur = Math.min(opts.dur || 0.2, 1.0);
    const peak = opts.gain != null ? opts.gain : 0.5;

    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(safeFreq(opts.filterF0 || 4000), t0);
    if (opts.filterF1 != null) {
      filter.frequency.exponentialRampToValueAtTime(
        safeFreq(opts.filterF1),
        t0 + dur
      );
    }

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
    return src;
  }

  // Play a note sequence. notes: array of [freq, beats] (freq 0 = rest).
  // tempo is in beats per second.
  function seq(notes, waveform, tempo, gain) {
    const beat = 1 / (tempo || 8);
    const vol = gain != null ? gain : 0.35;
    let t = 0;
    for (let i = 0; i < notes.length; i++) {
      const f = notes[i][0];
      const beats = notes[i][1] != null ? notes[i][1] : 1;
      const dur = beats * beat;
      if (f > 0) {
        tone({
          type: waveform || "square",
          f0: f,
          dur: Math.max(0.03, dur * 0.9),
          t: t,
          gain: vol,
        });
      }
      t += dur;
    }
  }

  // midi -> frequency helper for the note tables.
  function mf(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  // Wrap a public effect so it can never throw and no-ops when not ready.
  function guarded(fn) {
    return function () {
      if (!ready()) return;
      try {
        fn.apply(null, arguments);
      } catch (e) {
        /* never throw from audio */
      }
    };
  }

  // ---------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------

  function shoot() {
    tone({ type: "square", f0: 1400, f1: 300, dur: 0.09, gain: 0.3 });
  }

  function enemyHit() {
    tone({ type: "triangle", f0: 600, f1: 900, dur: 0.06, gain: 0.35 });
  }

  function enemyExplode(kind) {
    if (kind === "boss") {
      noise({ dur: 0.5, gain: 0.6, filterF0: 2500, filterF1: 120 });
      tone({ type: "sawtooth", f0: 220, f1: 40, dur: 0.5, gain: 0.3 });
      tone({ type: "sawtooth", f0: 232, f1: 42, dur: 0.5, gain: 0.3 });
    } else if (kind === "butterfly") {
      noise({ dur: 0.3, gain: 0.45, filterF0: 2000, filterF1: 200 });
      tone({ type: "square", f0: 500, f1: 90, dur: 0.28, gain: 0.25 });
    } else {
      // bee (default): short and high.
      noise({ dur: 0.18, gain: 0.4, filterF0: 3000, filterF1: 400 });
      tone({ type: "square", f0: 800, f1: 180, dur: 0.16, gain: 0.25 });
    }
  }

  function playerExplode() {
    noise({ dur: 0.8, gain: 0.8, filterF0: 3000, filterF1: 100 });
    // Low sine thump underneath.
    tone({ type: "sine", f0: 110, f1: 35, dur: 0.5, gain: 0.6 });
    tone({ type: "triangle", f0: 300, f1: 50, dur: 0.7, gain: 0.3 });
  }

  function dive() {
    const t0 = ctx.currentTime;
    const dur = 0.7;

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(900, t0);
    osc.frequency.exponentialRampToValueAtTime(350, t0 + dur);

    // 30Hz vibrato LFO on the frequency.
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(30, t0);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(40, t0); // +/-40Hz wobble
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.12, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    lfo.start(t0);
    osc.stop(t0 + dur + 0.02);
    lfo.stop(t0 + dur + 0.02);
  }

  // ---------------------------------------------------------------------
  // Tractor beam loop
  // ---------------------------------------------------------------------

  function tractorOn() {
    if (tractor) return; // idempotent
    const t0 = ctx.currentTime;

    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t0);
    out.gain.linearRampToValueAtTime(0.18, t0 + 0.1);
    out.connect(master);

    // Two detuned low oscillators for the eerie hum.
    const oscA = ctx.createOscillator();
    oscA.type = "sawtooth";
    oscA.frequency.setValueAtTime(85, t0);
    const oscB = ctx.createOscillator();
    oscB.type = "sawtooth";
    oscB.frequency.setValueAtTime(88, t0);

    // Slow amplitude throb.
    const throb = ctx.createGain();
    throb.gain.setValueAtTime(0.7, t0);
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(3, t0);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0.3, t0);
    lfo.connect(lfoGain);
    lfoGain.connect(throb.gain);

    oscA.connect(throb);
    oscB.connect(throb);
    throb.connect(out);

    // High shimmering tone stepping through a small arpeggio, looped
    // with setValueCurveAtTime-free scheduling: a short repeating pattern
    // scheduled far ahead via frequency steps on a periodic timer is
    // overkill; instead schedule a generous number of cycles up front.
    const shimmer = ctx.createOscillator();
    shimmer.type = "triangle";
    const arp = [880, 1046.5, 1318.5, 1046.5]; // A5 C6 E6 C6
    const step = 0.09;
    const cycles = 80; // ~28s of beam, plenty for one capture attempt
    for (let i = 0; i < cycles * arp.length; i++) {
      shimmer.frequency.setValueAtTime(arp[i % arp.length], t0 + i * step);
    }
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.setValueAtTime(0.12, t0);
    shimmer.connect(shimmerGain);
    shimmerGain.connect(out);

    const stopAt = t0 + cycles * arp.length * step;
    oscA.start(t0);
    oscB.start(t0);
    lfo.start(t0);
    shimmer.start(t0);
    oscA.stop(stopAt);
    oscB.stop(stopAt);
    lfo.stop(stopAt);
    shimmer.stop(stopAt);

    tractor = { out: out, nodes: [oscA, oscB, lfo, shimmer] };
  }

  function tractorOff() {
    if (!tractor) return;
    const beam = tractor;
    tractor = null;
    const t0 = ctx.currentTime;
    try {
      beam.out.gain.cancelScheduledValues(t0);
      beam.out.gain.setValueAtTime(beam.out.gain.value, t0);
      beam.out.gain.linearRampToValueAtTime(0, t0 + 0.2);
      for (let i = 0; i < beam.nodes.length; i++) {
        beam.nodes[i].stop(t0 + 0.25);
      }
    } catch (e) {
      /* nodes may already be stopped */
    }
  }

  // ---------------------------------------------------------------------
  // Jingles (note tables use midi->freq helper mf())
  // ---------------------------------------------------------------------

  function capture() {
    // Descending sad minor: A4 G4 E4 C4.
    seq(
      [
        [mf(69), 1],
        [mf(67), 1],
        [mf(64), 1],
        [mf(60), 2],
      ],
      "triangle",
      6,
      0.35
    );
  }

  function rescue() {
    // Ascending happy major arpeggio: C5 E5 G5 C6 E6.
    seq(
      [
        [mf(72), 1],
        [mf(76), 1],
        [mf(79), 1],
        [mf(84), 1],
        [mf(88), 2],
      ],
      "square",
      10,
      0.3
    );
  }

  function stageIntro() {
    // ~1.8s Galaga-ish start jingle: square melody + simple bass.
    const tempo = 6; // beats per second
    seq(
      [
        [mf(72), 1], // C5
        [mf(76), 1], // E5
        [mf(79), 1], // G5
        [mf(76), 1], // E5
        [mf(81), 1], // A5
        [mf(79), 1], // G5
        [mf(84), 2], // C6
        [mf(88), 3], // E6
      ],
      "square",
      tempo,
      0.28
    );
    seq(
      [
        [mf(48), 2], // C3
        [mf(55), 2], // G3
        [mf(53), 2], // F3
        [mf(48), 5], // C3
      ],
      "triangle",
      tempo,
      0.3
    );
  }

  function extraLife() {
    // Quick bright fanfare: G5 C6 E6.
    seq(
      [
        [mf(79), 1],
        [mf(84), 1],
        [mf(88), 2],
      ],
      "square",
      12,
      0.32
    );
  }

  function gameOver() {
    // Slow descending minor phrase, ~2s: E5 C5 A4 E4.
    seq(
      [
        [mf(76), 1],
        [mf(72), 1],
        [mf(69), 1],
        [mf(64), 2],
      ],
      "triangle",
      2.5,
      0.35
    );
  }

  function coin() {
    // Classic credit blip-bloop: two quick rising squares.
    tone({ type: "square", f0: 660, f1: 990, dur: 0.07, gain: 0.3 });
    tone({ type: "square", f0: 990, f1: 1320, dur: 0.12, t: 0.08, gain: 0.3 });
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  const api = {
    unlock: function () {
      try {
        unlock();
      } catch (e) {
        /* never throw */
      }
    },
    setMuted: setMuted,
    shoot: guarded(shoot),
    enemyHit: guarded(enemyHit),
    enemyExplode: guarded(enemyExplode),
    playerExplode: guarded(playerExplode),
    dive: guarded(dive),
    tractorOn: guarded(tractorOn),
    tractorOff: guarded(tractorOff),
    capture: guarded(capture),
    rescue: guarded(rescue),
    stageIntro: guarded(stageIntro),
    extraLife: guarded(extraLife),
    gameOver: guarded(gameOver),
    coin: guarded(coin),
  };

  Object.defineProperty(api, "muted", {
    get: function () {
      return isMuted;
    },
  });

  return api;
})();
