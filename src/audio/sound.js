// Geräusche ganz ohne Audiodateien, per WebAudio erzeugt: Schrittmotoren-Surren der Drucker (Tonhöhe je nach
// Geschwindigkeit des Druckkopfs, leiser mit Abstand), Piepser für fertig/Fehler, Kasse, Miauen und Schnurren.
// Browser erlauben Ton erst nach einer Nutzeraktion – unlock() wird beim ersten Klick ins Spiel aufgerufen.

const MUTE_KEY = 'druckercenter-ton';
const HUM_BASE_HZ = 110;        // Surren der Motoren im Stand
const HUM_HZ_PER_SPEED = 1600;  // so viel höher pro m/s Kopfgeschwindigkeit

function loadMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === 'aus';
  } catch {
    return false;
  }
}

export function createSound() {
  let ctx = null;
  let master = null;
  let muted = loadMuted();
  const hums = new Map(); // Drucker-ID → { osc, osc2, gain, filter, phase }

  function unlock() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.6;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function setMuted(value) {
    muted = value;
    try {
      localStorage.setItem(MUTE_KEY, muted ? 'aus' : 'an');
    } catch { /* ohne localStorage wird es nur nicht gemerkt */ }
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.6, ctx.currentTime, 0.05);
  }

  // Einzelner Ton mit kurzer Hüllkurve
  function tone(freq, start, duration, { type = 'sine', volume = 0.25, slideTo = null } = {}) {
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  // Rauschen, z. B. fürs Schnurren
  function noise(duration, { volume = 0.2, lowpass = 400, wobble = 0 } = {}) {
    const length = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const env = wobble ? 0.5 + 0.5 * Math.sin((i / ctx.sampleRate) * Math.PI * 2 * wobble) : 1;
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(gain).connect(master);
    src.start();
  }

  const EFFECTS = {
    // Drei aufsteigende Töne wie beim echten Drucker
    done: () => [880, 1108, 1318].forEach((f, i) => tone(f, i * 0.14, 0.22, { volume: 0.18 })),
    error: () => [0, 0.25].forEach((s) => tone(330, s, 0.18, { type: 'square', volume: 0.08 })),
    warn: () => [0, 0.18, 0.36].forEach((s) => tone(660, s, 0.12, { type: 'triangle', volume: 0.12 })),
    cash: () => {
      tone(1568, 0, 0.12, { type: 'triangle', volume: 0.15 });
      tone(2093, 0.08, 0.35, { type: 'triangle', volume: 0.15 });
    },
    achievement: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, 0.3, { type: 'triangle', volume: 0.14 })),
    poke: () => tone(1800, 0, 0.05, { type: 'square', volume: 0.05, slideTo: 900 }),
    pop: () => tone(500, 0, 0.12, { volume: 0.2, slideTo: 1400 }),
    clunk: () => {
      tone(140, 0, 0.18, { type: 'triangle', volume: 0.3, slideTo: 60 });
      tone(90, 0.12, 0.15, { type: 'triangle', volume: 0.2, slideTo: 50 });
    },
    meow: () => {
      tone(520, 0, 0.45, { type: 'sawtooth', volume: 0.05, slideTo: 760 });
      tone(760, 0.3, 0.35, { type: 'sawtooth', volume: 0.04, slideTo: 420 });
    },
    purr: () => noise(1.6, { volume: 0.25, lowpass: 180, wobble: 24 }),
    bill: () => tone(240, 0, 0.12, { type: 'triangle', volume: 0.06 }),
    whoosh: () => noise(0.35, { volume: 0.18, lowpass: 900 }),
    yowl: () => {
      tone(820, 0, 0.5, { type: 'sawtooth', volume: 0.06, slideTo: 260 });
      tone(610, 0.05, 0.45, { type: 'square', volume: 0.025, slideTo: 200 });
    },
    // Stromausfall (#57): Klacken des Sicherungsautomaten, dann fällt das Netzbrummen ab
    outage: () => {
      noise(0.08, { volume: 0.3, lowpass: 2500 });
      tone(100, 0.05, 1.2, { type: 'sawtooth', volume: 0.08, slideTo: 30 });
      tone(50, 0.05, 1.2, { type: 'sine', volume: 0.15, slideTo: 20 });
    },
    // Strom wieder da: Netzbrummen fährt hoch, kurzer Bestätigungston
    'power-back': () => {
      tone(40, 0, 0.8, { type: 'sawtooth', volume: 0.06, slideTo: 100 });
      tone(660, 0.7, 0.15, { type: 'triangle', volume: 0.12 });
      tone(990, 0.85, 0.2, { type: 'triangle', volume: 0.12 });
    },
  };

  // Dieselgenerator (#59): Anlasser und Abstellen
  EFFECTS['generator-start'] = () => {
    for (let i = 0; i < 5; i++) tone(70 + i * 6, i * 0.11, 0.1, { type: 'square', volume: 0.06, slideTo: 50 }); // Anlasser
    noise(0.9, { volume: 0.22, lowpass: 300, wobble: 9 });
    tone(30, 0.5, 0.8, { type: 'sawtooth', volume: 0.12, slideTo: 48 }); // Motor dreht hoch
  };
  EFFECTS['generator-stop'] = () => {
    tone(48, 0, 1.4, { type: 'sawtooth', volume: 0.1, slideTo: 18 });
    noise(0.6, { volume: 0.12, lowpass: 220 });
  };

  function play(name) {
    if (!ctx || muted || ctx.state !== 'running') return;
    EFFECTS[name]?.();
  }

  // Surren der druckenden Drucker. printers: [{ id, distance, headSpeed (m/s), printing }]
  // Schrittmotoren singen umso höher, je schneller sie drehen: Die Tonhöhe folgt der tatsächlichen Geschwindigkeit
  // des Druckkopfs – tief beim langsamen Drucken, höher bei schnellen Stufen, Leerfahrten und Düsenwechseln.
  function updatePrinters(printers, dt) {
    if (!ctx || ctx.state !== 'running') return;
    const active = new Set();
    for (const p of printers) {
      if (!p.printing) continue;
      active.add(p.id);
      let hum = hums.get(p.id);
      if (!hum) {
        const osc = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc2.type = 'square';
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 3;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(filter);
        osc2.connect(filter);
        filter.connect(gain).connect(master);
        osc.start();
        osc2.start();
        hum = { osc, osc2, gain, filter, phase: Math.random() * 10 };
        hums.set(p.id, hum);
      }
      hum.phase += dt * 3;
      // 0,06 m/s (Standard) ≈ 210 Hz, Turbo ≈ 300 Hz, Leerfahrten und Düsenwechsel ≈ 400–470 Hz
      const base = HUM_BASE_HZ + p.headSpeed * HUM_HZ_PER_SPEED + Math.sin(hum.phase) * 4;
      const t = ctx.currentTime;
      hum.osc.frequency.setTargetAtTime(base, t, 0.03);
      hum.osc2.frequency.setTargetAtTime(base * 1.5, t, 0.03);
      hum.filter.frequency.setTargetAtTime(base * 2, t, 0.05);
      const volume = 0.05 / (1 + p.distance * p.distance * 0.35);
      hum.gain.gain.setTargetAtTime(volume, t, 0.1);
    }
    // Drucker, die nicht mehr drucken, ausblenden und abbauen
    for (const [id, hum] of hums) {
      if (active.has(id)) continue;
      hum.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      hum.osc.stop(ctx.currentTime + 0.5);
      hum.osc2.stop(ctx.currentTime + 0.5);
      hums.delete(id);
    }
  }

  // Laufender Dieselgenerator (#59): tiefes Tuckern (Sägezahn ~ 25 Hz Zündfolge) und gefiltertes Rauschen, leiser mit
  // Abstand. running: läuft er? distance: Meter bis zur Kamera. Aufrufen in jedem Bild (main.js)
  let generator = null; // { osc, osc2, lfo, lfoGain, noiseSrc, gain }
  function updateGenerator(running, distance = Infinity) {
    if (!ctx || ctx.state !== 'running') return;
    const volume = running ? 0.16 / (1 + distance * distance * 0.06) : 0;
    if (!generator && volume > 0.0005) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 25;
      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.value = 50;
      // Rauschen in einer Schleife (eine Sekunde Puffer)
      const length = ctx.sampleRate;
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = buffer;
      noiseSrc.loop = true;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.value = 260;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.5;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 180;
      // Tuckern: Lautstärke schwankt mit der Zündfolge
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 12.5;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.35;
      const pulse = ctx.createGain();
      pulse.gain.value = 0.65;
      lfo.connect(lfoGain).connect(pulse.gain);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(filter);
      osc2.connect(filter);
      noiseSrc.connect(noiseFilter).connect(noiseGain).connect(filter);
      filter.connect(pulse).connect(gain).connect(master);
      osc.start();
      osc2.start();
      lfo.start();
      noiseSrc.start();
      generator = { osc, osc2, lfo, noiseSrc, gain };
    }
    if (!generator) return;
    generator.gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.25);
    if (volume <= 0.0005) {
      // ausgeblendet: nach dem Abklingen abbauen
      const g = generator;
      generator = null;
      g.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      const t = ctx.currentTime + 1.2;
      for (const node of [g.osc, g.osc2, g.lfo, g.noiseSrc]) node.stop(t);
    }
  }

  return {
    unlock,
    play,
    updatePrinters,
    updateGenerator,
    get muted() { return muted; },
    toggleMute: () => setMuted(!muted),
  };
}
