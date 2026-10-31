// Batterieschrank (#59, Logik in core/backup-power.js): hellgrauer Stahlschrank mit Doppeltür, Lüftungsschlitzen,
// Warnschild und einem senkrechten LED-Ladebalken (10 Segmente) samt kleinem Statusfeld in der rechten Tür.
// Reines Modell: Ursprung Mitte unten, Vorderseite +z. userData.setLevel(Anteil 0 … 1, Modus, Zeit) schaltet die
// Segmente (grün/gelb/rot nach Ladestand, beim Laden blinkt das nächste Segment, beim Entladen das oberste,
// bei Notstrom leuchtet das Statusfeld orange). Die Segmente teilen sich wenige Materialien, nichts wird neu gebaut.
import * as THREE from 'three';
import { box, mat } from './mesh-helpers.js';
import { canvasTexture } from './canvas-texture.js';

export const BATTERY_SIZE = { w: 0.86, h: 2.0, d: 0.58 };
export const LED_SEGMENTS = 10;

let shared = null;
function materials() {
  if (shared) return shared;
  const led = (color, intensity) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
  shared = {
    body: mat(0xd9dcdf, 0.55, 0.25),
    plinth: mat(0x3a3e44, 0.7, 0.3),
    seam: mat(0x2a2d31, 0.8, 0.1),
    handle: mat(0x9aa0a7, 0.3, 0.8),
    panel: mat(0x16191d, 0.5, 0.2),
    vent: mat(0x50565d, 0.8, 0.2),
    off: new THREE.MeshStandardMaterial({ color: 0x1d2a22, roughness: 0.5 }),
    green: led(0x37e46a, 1.4),
    yellow: led(0xf5c63a, 1.4),
    red: led(0xf0473a, 1.4),
    status: {
      idle: led(0x6fa8ff, 0.8),
      charging: led(0x37e46a, 1.2),
      discharging: led(0xf5c63a, 1.2),
      backup: led(0xff8a1f, 1.6),
    },
    sign: new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.6 }),
  };
  return shared;
}

// Schild „AKKU 100 kWh“ mit Blitz-Warndreieck
function signTexture() {
  return canvasTexture(128, 96, (ctx, w, h) => {
    ctx.fillStyle = '#f2f2ee';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f2c419';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(w / 2, 8);
    ctx.lineTo(w / 2 + 30, 56);
    ctx.lineTo(w / 2 - 30, 56);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.moveTo(w / 2 + 4, 20);
    ctx.lineTo(w / 2 - 8, 38);
    ctx.lineTo(w / 2, 38);
    ctx.lineTo(w / 2 - 4, 52);
    ctx.lineTo(w / 2 + 8, 32);
    ctx.lineTo(w / 2, 32);
    ctx.closePath();
    ctx.fill();
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('AKKU 100 kWh', w / 2, 84);
  }, 1, 1, { wrap: false, anisotropy: 4 });
}

export function createBatteryCabinet() {
  const m = materials();
  const { w, h, d } = BATTERY_SIZE;
  const g = new THREE.Group();
  const plinthH = 0.08;
  g.add(box(w, plinthH, d - 0.04, m.plinth, 0, plinthH / 2, 0));
  g.add(box(w, h - plinthH, d, m.body, 0, plinthH + (h - plinthH) / 2, 0));
  const front = d / 2;
  // Türfuge in der Mitte, Rahmenfugen, Griffe
  g.add(box(0.006, h - plinthH - 0.06, 0.004, m.seam, 0, plinthH + (h - plinthH) / 2, front + 0.001));
  for (const sx of [-1, 1]) g.add(box(0.02, 0.16, 0.025, m.handle, sx * 0.05, 1.05, front + 0.012));
  // Lüftungsschlitze unten in beiden Türen
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 6; i++) g.add(box(0.3, 0.012, 0.004, m.vent, sx * 0.21, 0.2 + i * 0.035, front + 0.002));
  }
  // Warnschild links oben
  g.add(box(0.22, 0.165, 0.003, m.sign, -0.21, 1.6, front + 0.002));
  // LED-Ladebalken rechts: dunkles Feld mit 10 Segmenten, darüber das Statusfeld
  const barX = 0.21;
  const barY0 = 0.95;
  const segH = 0.045;
  const segGap = 0.012;
  const barH = LED_SEGMENTS * (segH + segGap) + 0.03;
  g.add(box(0.16, barH + 0.1, 0.008, m.panel, barX, barY0 + barH / 2 + 0.02, front + 0.004));
  const segments = [];
  for (let i = 0; i < LED_SEGMENTS; i++) {
    const seg = box(0.11, segH, 0.006, m.off, barX, barY0 + 0.03 + i * (segH + segGap) + segH / 2, front + 0.009);
    segments.push(seg);
    g.add(seg);
  }
  const status = box(0.11, 0.03, 0.006, m.status.idle, barX, barY0 + barH + 0.035, front + 0.009);
  g.add(status);

  g.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  for (const s of [...segments, status]) s.castShadow = false;

  // level: Ladestand 0 … 1 · mode: 'idle' | 'charging' | 'discharging' | 'backup' · time: Sekunden (Blinken)
  g.userData.setLevel = (level, mode = 'idle', time = 0) => {
    const lit = Math.round(Math.min(1, Math.max(0, level)) * LED_SEGMENTS);
    const color = level < 0.2 ? m.red : level < 0.5 ? m.yellow : m.green;
    const blink = Math.floor(time * 2) % 2 === 0;
    segments.forEach((seg, i) => {
      let on = i < lit;
      if (mode === 'charging' && i === lit) on = blink;              // nächstes Segment blinkt beim Laden
      if ((mode === 'discharging' || mode === 'backup') && i === lit - 1) on = blink || lit <= 1; // oberstes blinkt
      seg.material = on ? color : m.off;
    });
    status.material = m.status[mode] ?? m.status.idle;
  };
  g.userData.setLevel(0.5);
  g.userData.size = { ...BATTERY_SIZE };
  return g;
}
