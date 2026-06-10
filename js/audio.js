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

  // Background music state (null when not playing).
  let music = null;

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
        // iOS 17+: play through the ring/silent switch like a game should.
        try {
          if (typeof navigator !== "undefined" && navigator.audioSession) {
            navigator.audioSession.type = "playback";
          }
        } catch (e) { /* older iOS */ }
        ctx = new AC();

        master = ctx.createGain();
        master.gain.value = isMuted ? 0 : MASTER_GAIN;
        master.connect(ctx.destination);

        noiseBuffer = makeNoiseBuffer();
      }
      // iOS Safari starts contexts suspended (or leaves them "interrupted"
      // after backgrounding); resume inside the gesture.
      if (ctx.state !== "running" && typeof ctx.resume === "function") {
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
  // Background music loop
  //
  // An original, upbeat 8-bar chip-tune in C major at ~140 BPM:
  //   C | G | Am | F | C | G | F | G
  // Voices: a kick on beats 1 & 3 with snare/hat ticks, a bouncy
  // root-fifth "oom-pah" triangle bass, an off-beat square pulse on the
  // chord tones, and a bright square-wave lead playing a cheery original
  // melody that climbs into the loop restart. Everything runs through
  // its own bus gain into master, so setMuted still silences it. Notes
  // are produced by a lookahead scheduler: a ~100ms setInterval that
  // schedules ~300ms ahead of ctx.currentTime.
  // ---------------------------------------------------------------------

  const MUSIC_GAIN = 0.12; // music bus level into master
  const MUSIC_STEP = 60 / 150 / 4; // one 16th note at 150 BPM (0.1s)
  const MUSIC_TOTAL_STEPS = 8 * 16; // 8 bars of 16 sixteenths
  const MUSIC_LOOKAHEAD = 0.3; // seconds scheduled ahead
  const MUSIC_TICK_MS = 100; // scheduler wakeup interval

  // Per-bar chord table: bass root (midi) + chord tones for the pulse.
  const MUSIC_CHORDS = [
    { bass: 36, arp: [64, 67, 72, 76] }, // C  (E4 G4 C5 E5)
    { bass: 43, arp: [62, 67, 71, 74] }, // G  (D4 G4 B4 D5)
    { bass: 45, arp: [64, 69, 72, 76] }, // Am (E4 A4 C5 E5)
    { bass: 41, arp: [65, 69, 72, 77] }, // F  (F4 A4 C5 F5)
    { bass: 36, arp: [64, 67, 72, 76] }, // C
    { bass: 43, arp: [62, 67, 71, 74] }, // G
    { bass: 41, arp: [65, 69, 72, 77] }, // F
    { bass: 43, arp: [62, 67, 71, 74] }, // G
  ];

  // 16ths where the chord pulse plays (dense off-beat drive plus pickups).
  const MUSIC_ARP_MASK = [0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 1];

  // Original lead melody, 8 bars x 16 sixteenth steps (midi, 0 = rest).
  // Bright C-major tune with an ascending run into the loop restart.
  const MUSIC_MELODY = [
    [72, 0, 0, 0, 76, 0, 0, 0, 79, 0, 0, 76, 74, 0, 0, 0], // C
    [74, 0, 0, 0, 71, 0, 0, 0, 74, 0, 0, 79, 74, 0, 71, 0], // G
    [69, 0, 0, 0, 72, 0, 0, 0, 76, 0, 0, 72, 74, 0, 0, 0], // Am
    [77, 0, 0, 0, 76, 0, 0, 0, 74, 0, 0, 72, 69, 0, 0, 0], // F
    [72, 0, 0, 0, 76, 0, 0, 79, 84, 0, 0, 0, 79, 0, 0, 0], // C
    [79, 0, 0, 76, 74, 0, 0, 0, 71, 0, 0, 74, 76, 0, 0, 0], // G
    [77, 0, 0, 0, 81, 0, 0, 0, 79, 0, 0, 77, 76, 0, 0, 0], // F
    [74, 0, 0, 76, 79, 0, 0, 0, 81, 0, 0, 83, 84, 0, 0, 0], // G (build-up)
  ];

  // One oscillator note on the music bus, scheduled at absolute time `at`.
  function musicVoice(type, freq, at, dur, peak) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(safeFreq(freq), at);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);

    osc.connect(g);
    g.connect(music.out);
    osc.start(at);
    osc.stop(at + dur + 0.02);
    music.sources.push({ node: osc, until: at + dur + 0.02 });
  }

  // Short percussive tick: a lowpassed noise blip (gain/brightness vary).
  function musicTickVoice(at, peak, brightness) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(safeFreq(brightness || 2200), at);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak != null ? peak : 0.25, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.035);

    src.connect(filter);
    filter.connect(g);
    g.connect(music.out);
    src.start(at);
    src.stop(at + 0.06);
    music.sources.push({ node: src, until: at + 0.06 });
  }

  // Low kick thump: a quick sine pitch-drop, the loop's heartbeat.
  function musicKickVoice(at) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(safeFreq(150), at);
    osc.frequency.exponentialRampToValueAtTime(safeFreq(45), at + 0.1);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.6, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.13);

    osc.connect(g);
    g.connect(music.out);
    osc.start(at);
    osc.stop(at + 0.15);
    music.sources.push({ node: osc, until: at + 0.15 });
  }

  // Emit whatever falls on one 16th-note step of the loop.
  function musicStepAt(step, at) {
    const bar = Math.floor(step / 16) % MUSIC_CHORDS.length;
    const inBar = step % 16;
    const chord = MUSIC_CHORDS[bar];

    // Kick thump on beats 1 and 3.
    if (inBar === 0 || inBar === 8) {
      musicKickVoice(at);
    }

    // Bouncy oom-pah bass: root on the beats (with a gritty saw layer),
    // fifth on the off-eighths.
    if (inBar % 4 === 0) {
      musicVoice("triangle", mf(chord.bass), at, MUSIC_STEP * 1.6, 0.45);
      musicVoice("sawtooth", mf(chord.bass), at, MUSIC_STEP * 1.2, 0.14);
    } else if (inBar % 4 === 2) {
      musicVoice("triangle", mf(chord.bass + 7), at, MUSIC_STEP * 1.2, 0.36);
    }

    // Off-beat chord pulse cycling up the chord tones.
    if (MUSIC_ARP_MASK[inBar]) {
      let hit = 0;
      for (let i = 0; i < inBar; i++) {
        if (MUSIC_ARP_MASK[i]) hit++;
      }
      musicVoice(
        "square",
        mf(chord.arp[hit % chord.arp.length]),
        at,
        MUSIC_STEP * 0.9,
        0.16
      );
    }

    // Lead melody on top, fattened with a slightly detuned double.
    const note = MUSIC_MELODY[bar][inBar];
    if (note) {
      musicVoice("square", mf(note), at, MUSIC_STEP * 2.6, 0.3);
      musicVoice("square", mf(note) * 1.004, at, MUSIC_STEP * 2.4, 0.12);
    }

    // Snare accents on beats 2 and 4, hats driving all the other off-16ths.
    if (inBar === 4 || inBar === 12) {
      musicTickVoice(at, 0.34, 3400);
    } else if (inBar % 4 === 2) {
      musicTickVoice(at, 0.14, 5200);
    } else if (inBar % 2 === 1) {
      musicTickVoice(at, 0.07, 6500);
    }
  }

  // Lookahead scheduler body: schedule every step that falls within the
  // next MUSIC_LOOKAHEAD seconds, then drop references to finished nodes.
  function musicSchedule() {
    if (!music) return;
    try {
      const horizon = ctx.currentTime + MUSIC_LOOKAHEAD;
      while (music.nextTime < horizon) {
        musicStepAt(music.step % MUSIC_TOTAL_STEPS, music.nextTime);
        music.step++;
        music.nextTime += MUSIC_STEP;
      }
      // Prune sources whose stop time has passed.
      const now = ctx.currentTime;
      const live = [];
      for (let i = 0; i < music.sources.length; i++) {
        if (music.sources[i].until > now) live.push(music.sources[i]);
      }
      music.sources = live;
    } catch (e) {
      /* never throw from audio */
    }
  }

  function musicOn() {
    if (music) return; // idempotent: never double-schedule
    const t0 = ctx.currentTime;

    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t0);
    out.gain.linearRampToValueAtTime(MUSIC_GAIN, t0 + 0.1);
    out.connect(master);

    music = {
      out: out,
      sources: [],
      step: 0, // always restarts from bar 1
      nextTime: t0 + 0.05,
      interval: setInterval(musicSchedule, MUSIC_TICK_MS),
    };
    musicSchedule(); // fill the first lookahead window immediately
  }

  function musicOff() {
    if (!music) return;
    const m = music;
    music = null;
    clearInterval(m.interval);

    const t0 = ctx.currentTime;
    try {
      m.out.gain.cancelScheduledValues(t0);
      m.out.gain.setValueAtTime(m.out.gain.value, t0);
      m.out.gain.linearRampToValueAtTime(0, t0 + 0.3);
    } catch (e) {
      /* ignore */
    }
    // Stop everything just after the fade completes.
    for (let i = 0; i < m.sources.length; i++) {
      try {
        m.sources[i].node.stop(t0 + 0.32);
      } catch (e) {
        /* node may already be stopped */
      }
    }
    // Detach the bus once the fade is done.
    if (typeof setTimeout === "function") {
      setTimeout(function () {
        try {
          m.out.disconnect();
        } catch (e) {
          /* ignore */
        }
      }, 400);
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
    musicOn: guarded(musicOn),
    musicOff: guarded(musicOff),
  };

  Object.defineProperty(api, "muted", {
    get: function () {
      return isMuted;
    },
  });

  Object.defineProperty(api, "musicPlaying", {
    get: function () {
      return !!music;
    },
  });

  return api;
})();
