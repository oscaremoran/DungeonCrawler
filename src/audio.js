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
  // each track: { stepDur, lead:[midi|null...], bass:[midi|null...], type, bassType }
  _tracks() {
    return {
      title: {
        stepDur: 0.40, type: "triangle", bassType: "sine", vol: 0.16, bvol: 0.12,
        lead: [60, 64, 67, 72, 71, 67, 64, 67],
        bass: [36, null, 43, null, 41, null, 43, null],
      },
      overworld: {
        stepDur: 0.19, type: "triangle", bassType: "sine", vol: 0.13, bvol: 0.11,
        lead: [69, null, 72, 74, 76, null, 74, 72, 71, null, 69, 67, 69, null, null, null],
        bass: [45, null, null, null, 41, null, null, null, 43, null, null, null, 40, null, null, null],
      },
      battle: {
        stepDur: 0.135, type: "square", bassType: "sawtooth", vol: 0.12, bvol: 0.12,
        lead: [69, 72, 71, 72, 69, 67, 69, 72, 68, 67, 65, 67, 64, 65, 67, 69],
        bass: [45, 45, 45, 45, 41, 41, 41, 41, 40, 40, 40, 40, 43, 43, 43, 43],
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
    while (this._nextTime < this.ctx.currentTime + 0.12) {
      const i = this._step % tr.lead.length;
      const ld = tr.lead[i], bs = tr.bass[i % tr.bass.length];
      if (ld != null) this._musicNote(tr.type, this.midi(ld), this._nextTime, tr.stepDur * 0.9, tr.vol);
      if (bs != null) this._musicNote(tr.bassType, this.midi(bs - 12), this._nextTime, tr.stepDur * 0.95, tr.bvol);
      this._nextTime += tr.stepDur;
      this._step++;
    }
    this._timer = setTimeout(() => this._schedule(), 25);
  }
  _musicNote(type, freq, t, dur, peak) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 2600;
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + dur + 0.02);
  }
}
