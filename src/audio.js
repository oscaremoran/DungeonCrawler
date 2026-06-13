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
    this.sfxGain = this.ctx.createGain();   this.sfxGain.gain.value = 0.9; this.sfxGain.connect(this.master);
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

  /* named one-shots */
  play(name) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case "move":     this._tone("square", 480, 520, 0.05, 0.10); break;
      case "confirm":  this._tone("square", 540, 760, 0.10, 0.12); break;
      case "cancel":   this._tone("square", 420, 240, 0.12, 0.11); break;
      case "hit":      this._noise(0.10, 0.20, "lowpass", 1400); this._tone("sine", 150, 90, 0.12, 0.22); break;
      case "crit":     this._noise(0.14, 0.28, "highpass", 800); this._tone("square", 900, 1600, 0.16, 0.16); this._tone("sine", 180, 110, 0.16, 0.22); break;
      case "hurt":     this._noise(0.18, 0.22, "lowpass", 600); this._tone("sawtooth", 110, 70, 0.18, 0.16); break;
      case "fire":     this._noise(0.40, 0.18, "bandpass", 1100); this._tone("sawtooth", 200, 900, 0.40, 0.10); break;
      case "bolt":     this._tone("square", 1300, 200, 0.22, 0.16); this._noise(0.18, 0.18, "highpass", 2000); break;
      case "heal":     this._arp([72, 76, 79, 84], 0.07, "triangle", 0.14); break;
      case "encounter":this._noise(0.5, 0.22, "lowpass", 900); this._tone("sawtooth", 300, 60, 0.5, 0.12); break;
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
      // gentle, spacious main-theme: flowing lead over slow Am–F–C–G pads
      title: {
        stepDur: 0.34, type: "triangle", bassType: "sine", vol: 0.15, bvol: 0.12,
        lead: [76, null, 72, 74, 76, 79, 76, 74, 72, null, 71, 72, 74, null, 71, 69],
        bass: [45, null, null, null, 41, null, null, null, 36, null, null, null, 43, null, null, null],
        chords: [[57, 60, 64], null, null, null, [53, 57, 60], null, null, null,
                 [48, 52, 55], null, null, null, [55, 59, 62], null, null, null],
        chordLen: 4, padVol: 0.05,
        drums: "h...h...h...h..s",
        drumVol: 0.5,
      },
      // brighter, walking overworld groove with a light backbeat
      overworld: {
        stepDur: 0.19, type: "triangle", bassType: "triangle", vol: 0.13, bvol: 0.11,
        lead: [69, null, 72, 74, 76, null, 74, 72, 71, null, 69, 67, 69, 72, 76, null],
        bass: [45, null, 52, null, 41, null, 48, null, 43, null, 50, null, 40, null, 47, null],
        chords: [[57, 60, 64], null, null, null, [53, 56, 60], null, null, null,
                 [55, 59, 62], null, null, null, [52, 55, 59], null, null, null],
        chordLen: 4, padVol: 0.045,
        drums: "k..h.s..k.hhk.s.",
        drumVol: 0.7,
      },
      // driving battle theme: square lead stabs over a relentless beat
      battle: {
        stepDur: 0.135, type: "square", bassType: "sawtooth", vol: 0.12, bvol: 0.12,
        lead: [69, 72, 71, 72, 69, 67, 69, 72, 68, 67, 65, 67, 64, 65, 67, 69],
        bass: [45, 45, 45, 45, 41, 41, 41, 41, 40, 40, 40, 40, 43, 43, 43, 43],
        chords: [[57, 60, 64], null, null, null, [53, 56, 60], null, null, null,
                 [52, 55, 59], null, null, null, [55, 58, 62], null, null, null],
        chordLen: 4, padVol: 0.035,
        drums: "k.hsk.hsk.hskshs",
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
    while (this._nextTime < this.ctx.currentTime + 0.12) {
      const i = this._step % len, t = this._nextTime;
      const ld = tr.lead[i], bs = tr.bass[i % tr.bass.length];
      if (ld != null) this._musicNote(tr.type, this.midi(ld), t, tr.stepDur * 0.9, tr.vol, { detune: 7, send: 0.5 });
      if (bs != null) this._musicNote(tr.bassType, this.midi(bs - 12), t, tr.stepDur * 0.95, tr.bvol);
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
}
