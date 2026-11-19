// Hollow Creek — Web Audio sound effects (all synthesized)
'use strict';
HC.Audio = (() => {
  let ctx = null, master = null, noiseBuf = null, muted = false;
  const loops = {};

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.35;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
  }

  function tone(freq, dur, type = 'square', vol = 0.15, slideTo = 0, delay = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(dur, vol = 0.3, freq = 1000, ftype = 'lowpass', delay = 0, freqTo = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.setValueAtTime(freq, t);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  // Continuous loop: oscillator + filtered noise, controlled every frame
  function getLoop(name, oscType, noiseMix, ftype) {
    if (loops[name]) return loops[name];
    const o = ctx.createOscillator(); o.type = oscType;
    const og = ctx.createGain(); og.gain.value = 1 - noiseMix;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const ng = ctx.createGain(); ng.gain.value = noiseMix;
    const f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.value = 800;
    const g = ctx.createGain(); g.gain.value = 0;
    // amplitude wobble (chain rattle / engine lope)
    const lfo = ctx.createOscillator(); lfo.frequency.value = 18;
    const lg = ctx.createGain(); lg.gain.value = 0;
    lfo.connect(lg); lg.connect(g.gain);
    o.connect(og); og.connect(f); s.connect(ng); ng.connect(f); f.connect(g); g.connect(master);
    o.start(); s.start(); lfo.start();
    return (loops[name] = { o, f, g, lfo, lg });
  }

  const LOOPS = {
    saw:    { osc: 'sawtooth', noise: 0.35, ftype: 'bandpass' },
    engine: { osc: 'square',   noise: 0.25, ftype: 'lowpass' },
    grind:  { osc: 'sawtooth', noise: 0.6,  ftype: 'bandpass' },
    mower:  { osc: 'sawtooth', noise: 0.4,  ftype: 'lowpass' },
  };

  // Set a loop's level each frame. vol 0 silences.
  function setLoop(name, vol, freq, filt, wobble = 0) {
    if (!ctx) return;
    const def = LOOPS[name];
    const L = getLoop(name, def.osc, def.noise, def.ftype);
    const t = ctx.currentTime;
    L.g.gain.setTargetAtTime(vol, t, 0.05);
    if (freq) L.o.frequency.setTargetAtTime(freq, t, 0.08);
    if (filt) L.f.frequency.setTargetAtTime(filt, t, 0.08);
    L.lg.gain.setTargetAtTime(vol * wobble, t, 0.05);
  }
  function stopLoops() { for (const k in loops) setLoop(k, 0); }

  const fx = {
    click: () => tone(660, 0.06, 'square', 0.08),
    select: () => { tone(440, 0.06, 'square', 0.08); tone(880, 0.08, 'square', 0.06, 0, 0.05); },
    deny: () => tone(160, 0.18, 'square', 0.1, 110),
    creak: () => { tone(90, 0.5, 'sawtooth', 0.08, 140); noise(0.4, 0.05, 600, 'bandpass'); },
    crack: () => { noise(0.25, 0.5, 3000, 'highpass'); tone(200, 0.15, 'square', 0.12, 60); },
    thud: (big = 1) => { noise(0.6, 0.6 * big, 400, 'lowpass', 0, 60); tone(70, 0.5, 'sine', 0.4 * big, 30); },
    crash: () => { noise(0.8, 0.6, 2500, 'bandpass', 0, 300); tone(120, 0.4, 'square', 0.15, 40); noise(0.4, 0.3, 5000, 'highpass', 0.1); },
    zap: () => { for (let i = 0; i < 5; i++) tone(HC.rand(800, 2400), 0.05, 'square', 0.12, 100, i * 0.05); noise(0.4, 0.3, 4000, 'highpass'); },
    pick: () => { tone(220, 0.08, 'triangle', 0.15, 330); noise(0.1, 0.1, 800); },
    drop: () => { noise(0.2, 0.3, 500); tone(110, 0.15, 'sine', 0.2, 60); },
    chip: () => { noise(0.5, 0.25, 1800, 'bandpass', 0, 600); tone(150, 0.4, 'sawtooth', 0.06, 90); },
    cash: () => { tone(988, 0.08, 'square', 0.1); tone(1319, 0.25, 'square', 0.1, 0, 0.08); },
    pop: () => tone(520, 0.08, 'triangle', 0.15, 780),
    place: () => { noise(0.12, 0.2, 700); tone(300, 0.08, 'triangle', 0.1); },
    horn: () => { tone(330, 0.3, 'square', 0.08); tone(415, 0.3, 'square', 0.06); },
    fuel: () => { for (let i = 0; i < 4; i++) tone(300 + i * 60, 0.07, 'sine', 0.1, 0, i * 0.07); },
  };

  function setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.35, ctx.currentTime, 0.02);
  }

  return { init, setLoop, stopLoops, setMuted, isMuted: () => muted, ...fx };
})();
