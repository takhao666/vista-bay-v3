// Vista Bay — synthesized sound effects (WebAudio, no audio files, no network).
// Every sound is built from oscillators and filtered noise at runtime.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.muted = false;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // Looping engine hum, pitch follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 50;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320;
    this.engineOsc.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start();
    // Two-tone police siren.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenOsc.frequency.value = 720;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    const lp2 = this.ctx.createBiquadFilter();
    lp2.type = 'lowpass'; lp2.frequency.value = 1400;
    this.sirenOsc.connect(lp2); lp2.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }
  setEngine(speed01, on) {
    if (!this.ctx) return;
    this.engineOsc.frequency.setTargetAtTime(46 + speed01 * 130, this.ctx.currentTime, 0.08);
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.05 : 0, this.ctx.currentTime, 0.1);
  }
  setSiren(on, dt) {
    if (!this.ctx) return;
    if (on) {
      this.sirenTimer += dt;
      const hi = Math.floor(this.sirenTimer * 1.6) % 2 === 0;
      this.sirenOsc.frequency.setTargetAtTime(hi ? 880 : 620, this.ctx.currentTime, 0.05);
      this.sirenGain.gain.setTargetAtTime(0.035, this.ctx.currentTime, 0.1);
    } else {
      this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    }
  }
  blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol, filterFreq, type) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = filterFreq || 1200;
    const g = this.ctx.createGain(); g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }
  shoot() { this.noise(0.14, 0.5, 2600, 'bandpass'); this.blip(190, 0.09, 'square', 0.22, 70); }
  enemyShoot() { this.noise(0.12, 0.22, 1800, 'bandpass'); }
  punch() { this.noise(0.1, 0.4, 420); this.blip(120, 0.08, 'sine', 0.3, 60); }
  hit() { this.blip(220, 0.07, 'triangle', 0.25, 140); }
  reload() { this.blip(520, 0.06, 'square', 0.12); setTimeout(() => this.blip(760, 0.06, 'square', 0.12), 130); }
  empty() { this.blip(140, 0.05, 'square', 0.14); }
  pickup() { this.blip(660, 0.09, 'sine', 0.25); setTimeout(() => this.blip(990, 0.14, 'sine', 0.25), 90); }
  missionDone() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.28), i * 110)); }
  missionStart() { [392, 523].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'triangle', 0.22), i * 120)); }
  explosion() { this.noise(0.9, 0.7, 500); this.blip(90, 0.7, 'sine', 0.5, 30); }
  crash() { this.noise(0.25, 0.45, 700); this.blip(110, 0.18, 'sine', 0.3, 50); }
  horn() { this.blip(370, 0.25, 'square', 0.12, 370); }
  busted() { [440, 415, 392].forEach((f, i) => setTimeout(() => this.blip(f, 0.3, 'sawtooth', 0.18), i * 180)); }
  click() { this.blip(880, 0.05, 'sine', 0.15); }
}
