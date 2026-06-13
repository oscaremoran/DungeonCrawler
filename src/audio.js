/* =========================================================================
 * Procedural audio — all sound is synthesized live with the Web Audio API,
 * so the game ships with zero audio files (matching the rest of the engine's
 * draw-everything-in-code approach). SFX are short synth blips; music is a
 * small looping step-sequencer with a lead + bass voice per track.
 * ========================================================================= */
"use strict";

class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = false;
    this._track = null;       // current music track name
    this._step = 0;
    this._nextTime = 0;
    this._timer = null;
  }

  /* lazily build the context on the first user gesture (autoplay policy) */
  unlock() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();   this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.5; this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();   this.sfxGain.gain.value = 1.45; this.sfxGain.connect(this.master);
    // music ambience: a feedback delay send gives the melodic voices some space
    this.musicDelay = this.ctx.createDelay(1.0); this.musicDelay.delayTime.value = 0.27;
    const fb = this.ctx.createGain(); fb.gain.value = 0.30;
    const wet = this.ctx.createGain(); wet.gain.value = 0.32;
    this.musicDelay.connect(fb); fb.connect(this.musicDelay);
    this.musicDelay.connect(wet); wet.connect(this.master);
    // drums sit just under the music bus so they follow music volume + mute
    this.drumGain = this.ctx.createGain(); this.drumGain.gain.value = 0.9; this.drumGain.connect(this.musicGain);
    if (this._track) this._startScheduler();
  }
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.9;
    return this.muted;
  }

  midi(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  /* ----------------------------- sfx voices ----------------------------- */
  _env(node, t, dur, peak, attack = 0.005) {
    const g = node.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  _tone(type, f0, f1, dur, peak, dest) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    this._env(g, t, dur, peak);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }
  _noise(dur, peak, filterType, cutoff, dest) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const g = this.ctx.createGain(); this._env(g, t, dur, peak);
    let chain = src;
    if (filterType) { const f = this.ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = cutoff; src.connect(f); chain = f; }
    chain.connect(g); g.connect(dest || this.sfxGain);
    src.start(t); src.stop(t + dur + 0.02);
  }
  _arp(notes, step, type, peak, dest) {
    if (!this.ctx) return;
    notes.forEach((m, i) => setTimeout(() => this._tone(type, this.midi(m), this.midi(m), step * 1.6, peak, dest), i * step * 1000));
  }
  // filtered noise whose filter frequency sweeps f0 -> f1 over the sound (whooshes)
  _noiseSweep(dur, peak, type, f0, f1, q, dest) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type || "bandpass";
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    if (q) f.Q.value = q;
    const g = this.ctx.createGain(); this._env(g, t, dur, peak);
    src.connect(f); f.connect(g); g.connect(dest || this.sfxGain);
    src.start(t); src.stop(t + dur + 0.02);
  }
  // a simultaneous chord stab from a list of midi notes
  _chord(notes, type, dur, peak, dest) {
    for (const m of notes) this._tone(type, this.midi(m), this.midi(m), dur, peak, dest);
  }
  // run fn after ms (for multi-stage one-shots like thunderclaps / stingers)
  _at(ms, fn) { setTimeout(() => { if (this.ctx && !this.muted) fn(); }, ms); }

  /* named one-shots */
  play(name) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case "move":     this._tone("square", 480, 520, 0.05, 0.10); break;
      case "confirm":  this._tone("square", 540, 760, 0.10, 0.12); break;
      case "cancel":   this._tone("square", 420, 240, 0.12, 0.11); break;
      // physical hit: a sharp transient crack + a punchy body thump + snap
      case "hit":      this._noise(0.06, 0.40, "highpass", 2600); this._tone("sine", 220, 70, 0.18, 0.42); this._tone("square", 340, 130, 0.07, 0.14); break;
      // critical: harder impact, an upward metallic zing and a bright ring
      case "crit":     this._noise(0.10, 0.46, "highpass", 1800); this._tone("sine", 260, 64, 0.24, 0.46); this._tone("square", 900, 1900, 0.12, 0.20); this._chord([76, 83, 88], "triangle", 0.24, 0.13); break;
      // hero hurt: a pained downward groan under a dull noise thud
      case "hurt":     this._noise(0.18, 0.32, "lowpass", 700); this._tone("sawtooth", 170, 58, 0.24, 0.24); this._tone("square", 120, 78, 0.12, 0.14); break;
      // fire spell: a rising bandpass whoosh, sawtooth body, crackle + low boom
      case "fire":     this._noiseSweep(0.55, 0.26, "bandpass", 500, 2800, 6); this._tone("sawtooth", 120, 460, 0.55, 0.14); this._noise(0.22, 0.22, "highpass", 3500); this._tone("sine", 90, 48, 0.5, 0.22); this._at(120, () => this._noise(0.18, 0.14, "highpass", 4500)); break;
      // lightning: a stabbing zap, bright crackle, and a delayed second strike
      case "bolt":     this._tone("square", 1800, 170, 0.20, 0.22); this._noise(0.11, 0.36, "highpass", 4000); this._tone("sawtooth", 2700, 300, 0.11, 0.14); this._at(110, () => { this._tone("square", 1300, 140, 0.16, 0.18); this._noise(0.08, 0.26, "highpass", 6000); }); this._at(230, () => this._noise(0.06, 0.16, "highpass", 7000)); break;
      // heal: a rising shimmer with a sparkle layer and a soft pad swell
      case "heal":     this._arp([72, 76, 79, 84], 0.06, "triangle", 0.16); this._arp([84, 88, 91], 0.05, "sine", 0.10); this._tone("sine", 523, 523, 0.55, 0.08); break;
      // battle start: a long building stinger that climaxes into the battle theme —
      // opening boom + alarm stab, accelerating taiko hits, a rising riser/drone,
      // then a big crash + minor chord landing right as the battle music begins
      case "encounter":
        this._tone("sine", 130, 46, 0.7, 0.34);
        this._noiseSweep(0.7, 0.26, "lowpass", 6000, 280, 1);
        this._chord([45, 48, 52], "sawtooth", 0.6, 0.15);
        [0, 320, 600, 840, 1040, 1200, 1320, 1420, 1510].forEach((ms, i) =>
          this._at(ms, () => this._tone("sine", 150, 58, 0.16, 0.20 + i * 0.016)));
        this._at(520, () => this._noiseSweep(1.1, 0.22, "bandpass", 380, 4200, 4));
        this._at(720, () => this._tone("sawtooth", 220, 680, 0.95, 0.14));
        this._at(1640, () => { this._noise(0.45, 0.40, "highpass", 5000); this._tone("sine", 165, 48, 0.55, 0.40); this._chord([45, 52, 57, 64], "sawtooth", 0.5, 0.18); });
        break;
      case "victory":  this._arp([60, 64, 67, 72], 0.10, "square", 0.14); break;
      case "levelup":  this._arp([72, 76, 79, 84, 88], 0.08, "triangle", 0.14); break;
      case "gameover": this._arp([67, 63, 60, 55], 0.18, "sawtooth", 0.14); break;
      case "chest":    this._tone("sine", 880, 880, 0.12, 0.16); this._arp([81, 88], 0.09, "sine", 0.14); break;
      case "quest":    this._tone("triangle", 880, 880, 0.08, 0.12); this._arp([83, 90], 0.06, "triangle", 0.12); break;
      case "buy":      this._arp([72, 79], 0.06, "square", 0.13); break;
    }
  }

  /* ------------------------------- music -------------------------------- */
  // each track is a small multi-voice step sequencer. Per step the scheduler
  // may fire: a lead note (detuned for thickness, with a delay send), a bass
  // note, a sustained chord pad, and drum hits. Voices use parallel arrays the
  // length of `lead`; `chords` entries are midi arrays (held a few steps) and
  // `drums` is a string per step using k(ick) s(nare) h(at) — '.' is a rest.
  _tracks() {
    return {
      // foreboding main-theme: slow, dark Am–F–Dm–E with a sparse low melody,
      // sustained pads and an ominous heartbeat kick
      title: {
        stepDur: 0.42, type: "triangle", bassType: "sine", vol: 0.13, bvol: 0.12,
        lead: [57, null, null, 60, 59, null, 57, null, 56, null, 57, null, null, null, 55, null],
        bass: [45, null, null, null, 41, null, null, null, 38, null, null, null, 40, null, null, null],
        chords: [[45, 48, 52], null, null, null, [41, 45, 48], null, null, null,
                 [38, 41, 45], null, null, null, [40, 44, 47], null, null, null],
        chordLen: 4, padVol: 0.06,
        drums: "k.......k.......",
        drumVol: 0.5,
      },
      // forest: slow and uneasy, set apart from the title by a D-minor center
      // (Dm–Bb–C–A) and a higher wandering woodwind-like melody over dark pads
      overworld: {
        stepDur: 0.26, type: "triangle", bassType: "sine", vol: 0.12, bvol: 0.11,
        lead: [null, 69, null, 72, null, 70, null, 69, null, 67, null, 65, null, 67, 69, null],
        bass: [50, null, null, null, 46, null, null, null, 48, null, null, null, 45, null, null, null],
        chords: [[50, 53, 57], null, null, null, [46, 50, 53], null, null, null,
                 [48, 52, 55], null, null, null, [45, 49, 52], null, null, null],
        chordLen: 4, padVol: 0.05,
        drums: "h...k...h...s...",
        drumVol: 0.45,
      },
      // battle: aggressive FFVII-boss energy — fast sawtooth lead with chromatic
      // tension over a relentless octave-pumping bass and a busy double-kick beat
      battle: {
        stepDur: 0.11, type: "sawtooth", bassType: "sawtooth", vol: 0.12, bvol: 0.14,
        lead: [69, 72, 71, 69, 68, 69, 72, 76, 75, 72, 71, 69, 68, 69, 67, 69,
               76, 75, 76, 79, 76, 75, 76, 72, 71, 72, 71, 68, 69, 67, 65, 69],
        bass: [45, 57, 45, 57, 45, 57, 45, 57, 43, 55, 44, 56, 45, 57, 45, 57],
        chords: [[45, 48, 52], null, null, null, [41, 45, 48], null, null, null,
                 [43, 47, 50], null, null, null, [40, 44, 47], null, null, null],
        chordLen: 4, padVol: 0.04,
        drums: "kkhskhhskkhskshskkhskhhskshsksss",
        drumVol: 1.0,
      },
      // troll boss: FFVII-boss energy — very fast, an angular E-minor sawtooth
      // riff with chromatic tension over the signature fast descending-chromatic
      // bass ostinato and a relentless 16th-note kick/hat groove
      troll: {
        stepDur: 0.105, type: "sawtooth", bassType: "sawtooth", vol: 0.085, bvol: 0.11,
        guitar: true,   // lead chugs distorted power chords, bass is a palm-muted guitar
        lead: [64, 64, 67, 64, 63, 64, 67, 71, 64, 64, 63, 64, 62, 63, 64, 67,
               71, 71, 74, 71, 70, 71, 74, 77, 76, 74, 71, 69, 67, 66, 64, 67],
        bass: [52, 52, 51, 52, 50, 50, 49, 50, 48, 48, 47, 48, 47, 49, 50, 52],
        chords: [[40, 43, 47], null, null, null, [36, 40, 43], null, null, null,
                 [33, 36, 40], null, null, null, [35, 39, 42], null, null, null],
        chordLen: 4, padVol: 0.03,
        // heavy-metal kit: crash accents, machine-gun double-bass, snare backbeats
        drums: "ckkkskkkkkkkskkkckkkskkkkkkkskkk",
        drumVol: 1.0,
      },
      // you-died screen: a slow, dark C-minor dirge — sparse descending melody,
      // sustained dissonant pads and a tolling low kick
      death: {
        stepDur: 0.48, type: "sawtooth", bassType: "sine", vol: 0.2, bvol: 0.22,
        // a louder, more dissonant C-minor funeral dirge: a mournful lament that
        // twists down through a tritone before resolving on the leading tone, over
        // minor-2nd cluster pads, a tolling bell and a deep crypt-door tom
        lead: [60, null, 63, 58, 56, null, 54, null, 53, null, 51, null, 50, null, 42, null,
               55, null, 56, 55, 54, null, 53, null, 51, null, 50, null, 48, 47, 48, null],
        bass: [36, null, null, null, null, null, null, null, 41, null, null, null, 42, null, null, null,
               44, null, null, null, null, null, null, null, 43, null, null, null, 36, null, null, null],
        // i(add b9) – iv – tritone bVI – V: each cluster carries a minor-2nd rub for dread
        chords: [[24, 36, 39, 43, 49], null, null, null, null, null, null, null,
                 [29, 41, 44, 48], null, null, null, null, null, null, null,
                 [30, 42, 45, 48, 49], null, null, null, null, null, null, null,
                 [31, 43, 47, 50, 53], null, null, null, null, null, null, null],
        chordLen: 8, padVol: 0.12,
        drums: "k......ck...k...k......ck...kc..",
        drumVol: 0.75,
      },
      // Koro town: upbeat and bright — a cheerful D-major hook over a I–V–vi–IV
      // walking bass with a lively backbeat
      koro: {
        stepDur: 0.23, type: "triangle", bassType: "triangle", vol: 0.14, bvol: 0.11,
        lead: [74, 78, 81, 78, 76, 74, 73, 74, 78, 81, 83, 81, 78, 76, 74, 73],
        bass: [50, 57, 54, 57, 45, 52, 49, 52, 47, 54, 50, 54, 43, 50, 47, 50],
        chords: [[50, 54, 57], null, null, null, [45, 49, 52], null, null, null,
                 [47, 50, 54], null, null, null, [43, 47, 50], null, null, null],
        chordLen: 4, padVol: 0.045,
        drums: "k.hsk.hhk.hsks.h",
        drumVol: 0.7,
      },
      // mercenaries: a tense military march — staccato G-minor sawtooth over a
      // steady root-fifth march with a snare-driven backbeat
      merc: {
        stepDur: 0.17, type: "sawtooth", bassType: "sawtooth", vol: 0.12, bvol: 0.13,
        lead: [67, null, 67, 70, 70, null, 68, 67, 67, null, 67, 70, 72, 70, 68, 67],
        bass: [43, 43, 50, 43, 41, 41, 48, 41, 43, 43, 50, 43, 46, 46, 53, 46],
        chords: [[43, 46, 50], null, null, null, [41, 45, 48], null, null, null,
                 [43, 46, 50], null, null, null, [39, 43, 46], null, null, null],
        chordLen: 4, padVol: 0.04,
        drums: "k.s.k.shk.s.k.ss",
        drumVol: 0.85,
      },
    };
  }

  playMusic(name) {
    if (this._track === name) return;
    if (!name) { this.stopMusic(); return; }
    this._track = name; this._step = 0;
    if (!this.ctx) return;                 // will start once unlocked
    this._nextTime = this.ctx.currentTime + 0.05;
    this._startScheduler();
  }
  stopMusic() { this._track = null; if (this._timer) { clearTimeout(this._timer); this._timer = null; } }

  _startScheduler() {
    if (this._timer) clearTimeout(this._timer);
    this._nextTime = this.ctx.currentTime + 0.05;
    this._schedule();
  }
  _schedule() {
    if (!this.ctx || !this._track) { this._timer = null; return; }
    const tr = this._tracks()[this._track];
    const len = tr.lead.length;
    // If a main-thread stall (battle FX, GC, a heavy frame) delayed this tick
    // past our lookahead, resync to "now" — otherwise we'd schedule notes in the
    // past, which the audio engine drops/bunches up: that was the mid-fight cutout.
    if (this._nextTime < this.ctx.currentTime) this._nextTime = this.ctx.currentTime + 0.03;
    while (this._nextTime < this.ctx.currentTime + 0.25) {   // wider lookahead rides out stalls
      const i = this._step % len, t = this._nextTime;
      const ld = tr.lead[i], bs = tr.bass[i % tr.bass.length];
      if (ld != null) {
        if (tr.guitar) for (const iv of [0, 7, 12]) this._guitar(this.midi(ld + iv), t, tr.stepDur * 0.92, tr.vol, 0.25);
        else this._musicNote(tr.type, this.midi(ld), t, tr.stepDur * 0.9, tr.vol, { detune: 7, send: 0.5 });
      }
      if (bs != null) {
        if (tr.guitar) this._guitar(this.midi(bs - 12), t, tr.stepDur * 0.85, tr.bvol, 0);
        else this._musicNote(tr.bassType, this.midi(bs - 12), t, tr.stepDur * 0.95, tr.bvol);
      }
      const ch = tr.chords && tr.chords[i % tr.chords.length];
      if (ch) {
        const dur = tr.stepDur * (tr.chordLen || 4) * 0.95;
        for (const m of ch) this._pad(this.midi(m), t, dur, tr.padVol || 0.05);
      }
      if (tr.drums) {
        const d = tr.drums[i % tr.drums.length], dv = tr.drumVol || 0.7;
        if (d === "k") this._kick(t, dv);
        else if (d === "s") this._snare(t, dv);
        else if (d === "h") this._hat(t, dv);
        else if (d === "c") this._crash(t, dv);
      }
      this._nextTime += tr.stepDur;
      this._step++;
    }
    this._timer = setTimeout(() => this._schedule(), 25);
  }
  // lead/bass voice — optional detuned twin (cents) and delay send for width
  _musicNote(type, freq, t, dur, peak, opt = {}) {
    const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 2600;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const detune = opt.detune || 0;
    for (const cents of (detune ? [-detune, detune] : [0])) {
      const o = this.ctx.createOscillator();
      o.type = type; o.frequency.value = freq; o.detune.value = cents;
      o.connect(f); o.start(t); o.stop(t + dur + 0.02);
    }
    f.connect(g); g.connect(this.musicGain);
    if (opt.send && this.musicDelay) { const s = this.ctx.createGain(); s.gain.value = opt.send; g.connect(s); s.connect(this.musicDelay); }
  }
  // soft sustained chord pad: slow attack, gentle lowpass
  _pad(freq, t, dur, peak) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 1300;
    o.type = "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + dur + 0.02);
  }
  // a soft-clip distortion curve for the guitar voice (amount = drive)
  _distCurve(amount) {
    const n = 256, curve = new Float32Array(n), k = amount;
    for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
    return curve;
  }
  // distorted "electric guitar" voice: saw -> waveshaper -> lowpass cab sim.
  // Stack [0,7,12] semitones for chugging power chords.
  _guitar(freq, t, dur, peak, send) {
    const o = this.ctx.createOscillator(), ws = this.ctx.createWaveShaper(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    o.type = "sawtooth"; o.frequency.value = freq;
    ws.curve = this._distCurve(45); if ("oversample" in ws) ws.oversample = "2x";
    f.type = "lowpass"; f.frequency.value = 2200;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);   // fast pick attack
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(ws); ws.connect(f); f.connect(g); g.connect(this.musicGain);
    if (send && this.musicDelay) { const s = this.ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(this.musicDelay); }
    o.start(t); o.stop(t + dur + 0.02);
  }
  /* ---- synth drum kit (scheduled at absolute times, routed to drumGain) ---- */
  _kick(t, v = 1) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6 * v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(this.drumGain); o.start(t); o.stop(t + 0.2);
  }
  _snare(t, v = 1) {
    const dur = 0.14, n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 1400;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35 * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.drumGain); src.start(t); src.stop(t + dur + 0.02);
    const o = this.ctx.createOscillator(), og = this.ctx.createGain();
    o.type = "triangle"; o.frequency.value = 190;
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.16 * v, t + 0.004); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(og); og.connect(this.drumGain); o.start(t); o.stop(t + 0.1);
  }
  _hat(t, v = 1) {
    const dur = 0.04, n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18 * v, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.drumGain); src.start(t); src.stop(t + dur + 0.02);
  }
  // crash cymbal — a long, bright decaying noise wash for metal accents
  _crash(t, v = 1) {
    const dur = 0.55, n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);   // decaying noise
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 5000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3 * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.drumGain); src.start(t); src.stop(t + dur + 0.02);
  }
}
