/* ============================================================
   巷战 3D · 程序化音效引擎（Web Audio，无外部音档）
   ============================================================ */
(function (CW) {
  'use strict';

  const Audio = {
    ctx: null,
    master: null,
    sfxBus: null,
    musicBus: null,
    muted: false,
    volume: 0.7,
    musicVolume: 0.35,
    started: false,
    _noise: null,
    _amb: null,
    _music: null,
    _lastStep: 0
  };

  function ensureContext() {
    if (Audio.ctx) return Audio.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    Audio.ctx = ctx;
    Audio.master = ctx.createGain();
    Audio.master.gain.value = Audio.muted ? 0 : Audio.volume;
    Audio.master.connect(ctx.destination);

    Audio.sfxBus = ctx.createGain();
    Audio.sfxBus.gain.value = 1;
    Audio.sfxBus.connect(Audio.master);

    Audio.musicBus = ctx.createGain();
    Audio.musicBus.gain.value = Audio.musicVolume;
    Audio.musicBus.connect(Audio.master);

    // 共用白噪音缓冲
    const len = Math.floor(ctx.sampleRate * 1.4);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    Audio._noise = buf;
    return ctx;
  }

  function noiseSource() {
    const ctx = ensureContext();
    const src = ctx.createBufferSource();
    src.buffer = Audio._noise;
    src.loop = true;
    return src;
  }

  function env(node, t0, a, d, peak) {
    const g = node.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
    g.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  function tone(type, freq, dur, peak, opts) {
    opts = opts || {};
    const ctx = ensureContext();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t0 + dur);
    env(gain, t0, opts.attack || 0.005, dur, peak);
    let node = osc;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = opts.filter;
      f.frequency.value = opts.filterFreq || 1200;
      f.Q.value = opts.q || 0.8;
      node.connect(f); node = f;
    }
    node.connect(gain);
    gain.connect(opts.bus || Audio.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.06);
  }

  function noiseBurst(dur, peak, filterType, freq, q, opts) {
    opts = opts || {};
    const ctx = ensureContext();
    if (!ctx) return;
    const t0 = ctx.currentTime + (opts.delay || 0);
    const src = noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = filterType || 'lowpass';
    f.frequency.setValueAtTime(freq || 1200, t0);
    if (opts.sweep) f.frequency.exponentialRampToValueAtTime(Math.max(80, opts.sweep), t0 + dur);
    f.Q.value = q == null ? 0.7 : q;
    const gain = ctx.createGain();
    env(gain, t0, opts.attack || 0.004, dur, peak);
    src.connect(f); f.connect(gain); gain.connect(opts.bus || Audio.sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.08);
  }

  function panNode(pan) {
    const ctx = ensureContext();
    if (!ctx) return null;
    if (!ctx.createStereoPanner) return ctx.createGain();
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan || 0));
    return p;
  }

  Audio.init = function () {
    ensureContext();
  };

  Audio.resume = function () {
    const ctx = ensureContext();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  };

  Audio.setVolume = function (v) {
    Audio.volume = Math.max(0, Math.min(1, v));
    if (Audio.master) Audio.master.gain.setTargetAtTime(Audio.muted ? 0 : Audio.volume, Audio.ctx.currentTime, 0.03);
  };

  Audio.setMuted = function (m) {
    Audio.muted = !!m;
    if (Audio.master) Audio.master.gain.setTargetAtTime(Audio.muted ? 0 : Audio.volume, Audio.ctx.currentTime, 0.03);
  };

  Audio.setMusicVolume = function (v) {
    Audio.musicVolume = Math.max(0, Math.min(1, v));
    if (Audio.musicBus) Audio.musicBus.gain.setTargetAtTime(Audio.musicVolume, Audio.ctx.currentTime, 0.05);
  };

  /* ---------- 武器音效 ---------- */
  const GUNS = {
    pistol: { freq: 1500, dur: 0.16, peak: 0.5, thump: 150 },
    rifle: { freq: 1050, dur: 0.2, peak: 0.62, thump: 110 },
    smg: { freq: 1850, dur: 0.12, peak: 0.42, thump: 180 },
    sniper: { freq: 700, dur: 0.42, peak: 0.85, thump: 70 }
  };

  Audio.shot = function (kind, pan, dist) {
    const ctx = ensureContext();
    if (!ctx) return;
    const cfg = GUNS[kind] || GUNS.rifle;
    const g = dist == null ? 1 : Math.max(0.12, Math.min(1, 22 / (dist + 8)));
    const p = panNode(pan);
    if (p) p.connect(Audio.sfxBus);
    const bus = p || Audio.sfxBus;
    noiseBurst(cfg.dur, cfg.peak * g, 'bandpass', cfg.freq, 0.8, { sweep: cfg.freq * 0.5, bus });
    tone('sine', cfg.thump, 0.16, 0.34 * g, { slideTo: 45, bus });
    if (kind === 'sniper') noiseBurst(0.55, 0.3 * g, 'lowpass', 500, 0.6, { bus, delay: 0.05 });
  };

  Audio.reload = function (pan) {
    const p = panNode(pan); if (p) p.connect(Audio.sfxBus);
    const bus = p || Audio.sfxBus;
    noiseBurst(0.05, 0.18, 'highpass', 1800, 1, { bus });
    noiseBurst(0.06, 0.22, 'bandpass', 900, 2, { bus, delay: 0.14 });
    noiseBurst(0.05, 0.2, 'highpass', 2400, 1, { bus, delay: 0.32 });
  };

  Audio.switchWeapon = function () {
    noiseBurst(0.05, 0.16, 'bandpass', 2200, 2);
    tone('square', 620, 0.05, 0.05, { slideTo: 380 });
  };

  Audio.throwNade = function () {
    noiseBurst(0.22, 0.14, 'bandpass', 700, 1.2, { sweep: 300 });
  };

  Audio.explosion = function (pan, dist) {
    const g = dist == null ? 1 : Math.max(0.15, Math.min(1, 30 / (dist + 10)));
    const p = panNode(pan); if (p) p.connect(Audio.sfxBus);
    const bus = p || Audio.sfxBus;
    noiseBurst(1.1, 0.9 * g, 'lowpass', 900, 0.8, { sweep: 70, bus, attack: 0.01 });
    tone('sine', 120, 0.9, 0.6 * g, { slideTo: 26, bus });
    noiseBurst(0.5, 0.35 * g, 'bandpass', 2200, 0.6, { bus, delay: 0.02 });
  };

  Audio.flashbang = function (pan, dist) {
    const g = dist == null ? 1 : Math.max(0.1, Math.min(1, 26 / (dist + 8)));
    const p = panNode(pan); if (p) p.connect(Audio.sfxBus);
    const bus = p || Audio.sfxBus;
    tone('sine', 2400, 0.5, 0.5 * g, { slideTo: 680, bus });
    noiseBurst(0.6, 0.4 * g, 'highpass', 3000, 0.7, { bus });
  };

  Audio.melee = function (pan) {
    const p = panNode(pan); if (p) p.connect(Audio.sfxBus);
    noiseBurst(0.16, 0.28, 'bandpass', 1200, 1.1, { sweep: 220, bus: p || Audio.sfxBus });
  };

  Audio.hit = function (head) {
    tone('square', head ? 1500 : 900, 0.05, 0.12, { slideTo: head ? 2300 : 620 });
    if (head) tone('sine', 2100, 0.12, 0.08, { slideTo: 1500 });
  };

  Audio.kill = function () {
    tone('triangle', 660, 0.1, 0.1, { slideTo: 880 });
    tone('triangle', 990, 0.12, 0.08, { delay: 0.05 });
  };

  Audio.hurt = function () {
    tone('sine', 160, 0.18, 0.28, { slideTo: 60 });
    noiseBurst(0.12, 0.14, 'lowpass', 500, 0.8);
  };

  Audio.impact = function (pan, dist) {
    const g = dist == null ? 1 : Math.max(0.08, Math.min(1, 14 / (dist + 4)));
    const p = panNode(pan); if (p) p.connect(Audio.sfxBus);
    noiseBurst(0.06, 0.2 * g, 'bandpass', 1500, 1.4, { bus: p || Audio.sfxBus });
  };

  Audio.ui = function (up) {
    tone('sine', up ? 720 : 520, 0.06, 0.06, { slideTo: up ? 940 : 400 });
  };

  Audio.step = function (pan) {
    const now = Date.now();
    if (now - Audio._lastStep < 120) return;
    Audio._lastStep = now;
    const p = panNode(pan); if (p) p.connect(Audio.sfxBus);
    noiseBurst(0.07, 0.11, 'lowpass', 380, 0.8, { bus: p || Audio.sfxBus });
  };

  Audio.spawn = function () {
    tone('sine', 420, 0.16, 0.12, { slideTo: 760 });
    tone('triangle', 840, 0.14, 0.06, { delay: 0.06 });
  };

  Audio.death = function () {
    tone('sawtooth', 220, 0.5, 0.14, { slideTo: 55, filter: 'lowpass', filterFreq: 900 });
  };

  /* ---------- 环境音与音乐 ---------- */
  Audio.startAmbience = function () {
    const ctx = ensureContext();
    if (!ctx || Audio._amb) return;
    const src = noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320;
    f.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain); lfoGain.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(Audio.master);
    src.start(); lfo.start();
    Audio._amb = { src, lfo };
  };

  Audio.startMusic = function () {
    const ctx = ensureContext();
    if (!ctx || Audio._music) return;
    // 低频张力脉动：两个失谐锯齿 + 节奏滤波
    const make = (freq, gainVal) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      f.type = 'lowpass';
      f.frequency.value = 220;
      g.gain.value = gainVal;
      osc.connect(f); f.connect(g); g.connect(Audio.musicBus);
      osc.start();
      return { osc, g, f };
    };
    const a = make(55, 0.05);
    const b = make(55.6, 0.04);
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfo.frequency.value = 0.12;
    lfoG.gain.value = 70;
    lfo.connect(lfoG); lfoG.connect(a.f.frequency);
    lfo.start();
    Audio._music = { a, b, lfo };
  };

  Audio.stopAll = function () {
    if (Audio._amb) {
      try { Audio._amb.src.stop(); Audio._amb.lfo.stop(); } catch (e) {}
      Audio._amb = null;
    }
    if (Audio._music) {
      try { Audio._music.a.osc.stop(); Audio._music.b.osc.stop(); Audio._music.lfo.stop(); } catch (e) {}
      Audio._music = null;
    }
  };

  Audio.setMusicIntensity = function (v) {
    if (!Audio._music) return;
    const t = Audio.ctx.currentTime;
    Audio._music.a.g.gain.setTargetAtTime(0.03 + v * 0.05, t, 0.2);
    Audio._music.b.g.gain.setTargetAtTime(0.02 + v * 0.04, t, 0.2);
    Audio._music.a.f.frequency.setTargetAtTime(180 + v * 260, t, 0.2);
  };

  CW.Audio = Audio;
})(window.CW = window.CW || {});
