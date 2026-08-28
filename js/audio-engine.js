/*
 * Copyright-free classroom game audio generated in the browser with Web Audio API.
 * The host/teacher screen plays the music so student phones stay quiet.
 */
export class GameAudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.compressor = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.bgmEnabled = true;
    this.sfxEnabled = true;
    this.volume = 0.70;
    this.bgmTimer = null;
    this.bgmMode = null;
    this.requestedMode = null;
    this.step = 0;
    this.lastGiftAt = 0;
  }

  async unlock() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.compressor = this.ctx.createDynamicsCompressor();
      this.bgmGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.bgmGain.connect(this.master);
      this.sfxGain.connect(this.master);
      // Give the classroom speaker noticeably more headroom while protecting peaks.
      this.compressor.threshold.value = -18;
      this.compressor.knee.value = 12;
      this.compressor.ratio.value = 4;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.22;
      this.master.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);
      this._applyGains();
    }
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch {}
    }
    return this.ctx.state === 'running';
  }

  _applyGains() {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const volume = Math.max(0, Math.min(1, this.volume));
    // The old chain was intentionally quiet (55% × 34% for BGM).
    // Map the UI slider to a classroom-friendly boosted range and use the
    // compressor above to prevent harsh clipping at the loud end.
    const boostedMaster = volume <= 0 ? 0 : 0.25 + volume * 1.95;
    this.master.gain.setTargetAtTime(boostedMaster, now, 0.02);
    this.bgmGain.gain.setTargetAtTime(this.bgmEnabled ? 0.62 : 0, now, 0.02);
    this.sfxGain.gain.setTargetAtTime(this.sfxEnabled ? 0.98 : 0, now, 0.02);
  }

  setSettings({ bgmEnabled, sfxEnabled, volume } = {}) {
    if (typeof bgmEnabled === 'boolean') this.bgmEnabled = bgmEnabled;
    if (typeof sfxEnabled === 'boolean') this.sfxEnabled = sfxEnabled;
    if (Number.isFinite(volume)) this.volume = Math.max(0, Math.min(1, volume));
    this._applyGains();
    if (!this.bgmEnabled) this._clearBgmTimer();
    else if (this.requestedMode && !this.bgmTimer && this.ctx) this._beginBgmLoop(this.requestedMode);
  }

  getSettings() {
    return { bgmEnabled: this.bgmEnabled, sfxEnabled: this.sfxEnabled, volume: this.volume };
  }

  async preview() {
    await this.unlock();
    if (!this.ctx) return;
    this.playChime();
    const previous = this.requestedMode;
    this.startBgm('normal');
    setTimeout(() => previous ? this.startBgm(previous) : this.stopBgm(), 2600);
  }

  startBgm(mode = 'normal') {
    this.requestedMode = mode;
    if (!this.ctx || !this.bgmEnabled) return;
    if (this.bgmMode === mode && this.bgmTimer) return;
    this._beginBgmLoop(mode);
  }

  stopBgm({ keepRequest = false } = {}) {
    this._clearBgmTimer();
    this.bgmMode = null;
    if (!keepRequest) this.requestedMode = null;
  }

  stopAll() {
    this.stopBgm();
  }

  _clearBgmTimer() {
    if (this.bgmTimer) clearInterval(this.bgmTimer);
    this.bgmTimer = null;
  }

  _beginBgmLoop(mode) {
    this._clearBgmTimer();
    this.bgmMode = mode;
    this.step = 0;
    const configs = {
      lobby:  { interval: 340, melody: [523.25,659.25,783.99,659.25,587.33,659.25,783.99,880.00], bass:[130.81,146.83], wave:'triangle', note:0.16 },
      normal: { interval: 235, melody: [440.00,523.25,659.25,523.25,440.00,587.33,659.25,587.33], bass:[110.00,130.81], wave:'square', note:0.10 },
      blind:  { interval: 175, melody: [392.00,466.16,523.25,587.33,523.25,466.16,415.30,466.16], bass:[98.00,103.83], wave:'sawtooth', note:0.085 },
      final:  { interval: 125, melody: [440.00,493.88,554.37,659.25,554.37,659.25,739.99,880.00], bass:[110.00,123.47], wave:'square', note:0.070 }
    };
    const cfg = configs[mode] || configs.normal;
    const tick = () => {
      if (!this.ctx || !this.bgmEnabled) return;
      const i = this.step++;
      this._tone(cfg.melody[i % cfg.melody.length], cfg.note, 0.08, cfg.wave, this.bgmGain);
      if (i % 4 === 0) {
        const bass = cfg.bass[Math.floor(i / 4) % cfg.bass.length];
        this._tone(bass, Math.min(0.22, cfg.interval / 1000 * 0.85), 0.10, 'triangle', this.bgmGain);
      }
      if (mode === 'final' && i % 2 === 1) this._noiseClick(0.025, 0.035, this.bgmGain);
    };
    tick();
    this.bgmTimer = setInterval(tick, cfg.interval);
  }

  _tone(freq, duration = 0.12, level = 0.18, type = 'sine', destination = this.sfxGain, when = 0, slideTo = null) {
    if (!this.ctx || !destination) return;
    const t = this.ctx.currentTime + Math.max(0, when);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), t + Math.min(0.018, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(t);
    osc.stop(t + duration + 0.04);
  }

  _noiseClick(duration = 0.035, level = 0.09, destination = this.sfxGain, when = 0) {
    if (!this.ctx || !destination) return;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = level;
    src.buffer = buffer;
    src.connect(gain);
    gain.connect(destination);
    src.start(this.ctx.currentTime + Math.max(0, when));
  }

  playChime() {
    if (!this.sfxEnabled) return;
    this._tone(659.25, .12, .16, 'sine', this.sfxGain, 0);
    this._tone(783.99, .14, .14, 'sine', this.sfxGain, .09);
    this._tone(1046.50, .20, .12, 'sine', this.sfxGain, .18);
  }

  playCountdown(number) {
    if (!this.sfxEnabled) return;
    const final = Number(number) <= 1;
    this._tone(final ? 880 : 520, final ? .22 : .13, .22, 'square', this.sfxGain, 0, final ? 1174.66 : null);
  }

  playQuestionStart() {
    if (!this.sfxEnabled) return;
    this._tone(740, .10, .13, 'triangle', this.sfxGain, 0);
    this._tone(988, .14, .12, 'triangle', this.sfxGain, .07);
  }

  playTimerTick(secondsLeft) {
    if (!this.sfxEnabled) return;
    const s = Number(secondsLeft);
    const freq = s <= 1 ? 1000 : s === 2 ? 850 : 720;
    this._tone(freq, .06, .12, 'square', this.sfxGain);
  }

  playReveal(correctRatio = 0.5) {
    if (!this.sfxEnabled) return;
    if (correctRatio >= .55) {
      this._tone(523.25, .10, .13, 'sine', this.sfxGain, 0);
      this._tone(659.25, .13, .12, 'sine', this.sfxGain, .08);
      this._tone(783.99, .16, .10, 'sine', this.sfxGain, .16);
    } else {
      this._tone(392.00, .12, .14, 'triangle', this.sfxGain, 0, 311.13);
      this._tone(293.66, .14, .10, 'triangle', this.sfxGain, .10, 220.00);
    }
  }

  playBlindTransition() {
    if (!this.sfxEnabled) return;
    for (let i = 0; i < 5; i++) {
      this._tone(220 * Math.pow(1.18, i), .16, .10, 'sawtooth', this.sfxGain, i * .08, 280 * Math.pow(1.18, i));
    }
    this._noiseClick(.12, .07, this.sfxGain, .34);
  }

  playGift(points = 0) {
    if (!this.sfxEnabled || !this.ctx) return;
    const now = performance.now();
    if (now - this.lastGiftAt < 220) return;
    this.lastGiftAt = now;
    const high = Number(points) >= 850;
    const base = high ? 880.00 : 659.25;
    this._tone(base, .10, .16, 'sine', this.sfxGain, 0);
    this._tone(base * 1.25, .12, .14, 'triangle', this.sfxGain, .06);
    this._tone(base * 1.50, .18, .12, 'sine', this.sfxGain, .13);
    this._noiseClick(.055, .10, this.sfxGain, .04);
  }

  playFinish() {
    this.stopBgm();
    if (!this.sfxEnabled) return;
    for (let i = 0; i < 12; i++) this._noiseClick(.035, .08 + i * .003, this.sfxGain, i * .075);
    const base = .95;
    [523.25,659.25,783.99].forEach((f,i) => this._tone(f,.22,.14,'triangle',this.sfxGain,base+i*.10));
    [659.25,783.99,1046.50].forEach((f,i) => this._tone(f,.30,.15,'triangle',this.sfxGain,base+.34+i*.09));
    this._tone(1046.50,.55,.17,'sine',this.sfxGain,base+.66,1318.51);
  }
}
