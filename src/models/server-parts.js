// 3D-Modelle der Server-Bauteile (Teilekatalog in core/server-parts.js): CPU, RAM-Riegel, Mainboard, Netzteil,
// Lüfter und 3,5-Zoll-Festplatte. Genutzt für die Produktbilder im Teile-Shop (createPartPreview mit
// ui/printer-preview.js), den offenen Server auf der Werkbank (createOpenServer) und die Platten der NAS.
//
// Maße in Metern wie bei echten Teilen. Gemeinsame Lage aller Teile:
//   - Ursprung Mitte unten (Auflage- bzw. Steckkante), oben ist +y
//   - vorn ist +z: im Server strömt die Luft von vorn (+z) nach hinten (−z), Riegel und Kühlrippen liegen längs z
//   - Aufdrucke auf Oberseiten lesen sich von vorn oben (Bildoberkante zeigt nach −z)
//   - Ausnahme Festplatte: Ursprung Mitte unten an der Vorderkante (Griff bzw. Stirnseite bei z = 0), die Platte
//     liegt flach und reicht nach hinten (−z) – so wird sie wie in einen NAS-Schacht von vorn eingeschoben
//
// Leistung: Jedes Teil wird je Variante einmal gebaut (Geometrien je Material zu einem Mesh zusammengefasst) und
// danach nur noch geklont – Klone teilen Geometrie, Materialien und Canvas-Texturen. Keine Schatten.
// markBroken() färbt ein Teil rot leuchtend, ohne neue Materialien je Frame (eine Kopie je Material, gecacht).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat } from './mesh-helpers.js';
import { canvasTexture } from './canvas-texture.js';
import { chassisMaterial } from './server-textures.js';
import { UNIT, FRONT_WIDTH } from './server-hardware.js';

const FONT = '"Segoe UI", Arial, sans-serif';

// Steckplatz-Satz des Standard-Servers: 2 CPU-Sockel, 16 RAM-Steckplätze, 2 Lüfter, keine Festplatten-Schächte.
// Ein Steckplatz-Satz ist ein einfaches Objekt { cpus, ram, fans, bays } (fehlende Werte wie hier); Mainboard und
// Netzteil hat jeder Server genau einmal. Beispiel NAS L: { cpus: 1, ram: 8, fans: 2, bays: 12 }.
export const DEFAULT_LAYOUT = Object.freeze({ cpus: 2, ram: 16, fans: 2, bays: 0 });

// Maße
const CPU_H = 0.0045;        // Träger + Heatspreader
const DIMM = { l: 0.1334, h: 0.031 };
const PSU = { w: 0.0735, h: 0.039, d: 0.185 }; // CRPS-Netzteil
const FAN = { size: 0.08, depth: 0.038 };
const DISK = { w: 0.1016, h: 0.0261, d: 0.147 }; // 3,5 Zoll
const CADDY = 0.012;          // Tiefe der Blende eines Einschubrahmens
const PCB_T = 0.0016;         // Dicke einer Platine
const SOCKET_H = 0.0022;      // Höhe des Sockelrahmens, darauf liegt die CPU
const SOCKET_ZONE = 0.092;    // Breite eines Sockels samt Kühler-Freiraum
const DIMM_PITCH = 0.0085;    // Abstand der RAM-Steckplätze
const DIMM_SEAT = 0.0015;     // so hoch über der Platine sitzt die Kontaktkante eines Riegels im Steckplatz
const BOARD_DEPTH = 0.27;
const SHEET = 0.001;          // Blechdicke des Gehäuses
const STANDOFF = 0.005;       // Abstandsbolzen unter dem Mainboard
const SERVER_WIDTH = FRONT_WIDTH - 0.04; // wie die Geräte im Schrank (models/server-hardware.js)
const SERVER_DEPTH = 0.5;
const BAY = { pitchX: 0.107, pitchY: 0.0285, depth: 0.17 };

// Varianten: Größe des Heatspreaders und Farbstreifen machen die CPUs auch ohne Lesen unterscheidbar
const CPU_VARIANTS = {
  10: { sub: [0.0525, 0.045], ihs: [0.038, 0.032], color: '#3d8bd9', model: 'DCX 3110' },
  20: { sub: [0.0565, 0.0475], ihs: [0.045, 0.037], color: '#2fb36b', model: 'DCX 5220' },
  32: { sub: [0.0754, 0.0585], ihs: [0.058, 0.046], color: '#e0a020', model: 'DCX 7332' },
  64: { sub: [0.0754, 0.0585], ihs: [0.066, 0.051], color: '#d64545', model: 'DCX 9664' },
};
const RAM_VARIANTS = {
  32: { color: '#2d6cc0', accent: '#9cc7ff' },
  64: { color: '#3a3f47', accent: '#5fd18a' },
  128: { color: '#141416', accent: '#d4af37' },
};
const DISK_COLORS = { 512: '#3d8bd9', 2048: '#2fb36b', 4096: '#8b5cd6', 8192: '#d64545' };

// Nächste bekannte Variante (z. B. 48 Cores → Aussehen der 64er, Aufdruck aber 48)
function nearest(table, value) {
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  return table[keys.find((k) => k >= value) ?? keys[keys.length - 1]];
}

// GB → „512 GB“ bzw. „2 TB“
export function formatCapacity(gb) {
  return gb >= 1024 ? `${+(gb / 1024).toFixed(1)} TB` : `${gb} GB`;
}

// ---------- Baukasten: Geometrien je Material sammeln und zu einem Mesh zusammenfassen ----------

const euler = new THREE.Euler();
const rotation = new THREE.Matrix4();

class Builder {
  constructor() {
    this.buckets = new Map();
  }

  add(geometry, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    if (rx || ry || rz) geometry.applyMatrix4(rotation.makeRotationFromEuler(euler.set(rx, ry, rz)));
    geometry.translate(x, y, z);
    if (!this.buckets.has(material)) this.buckets.set(material, []);
    this.buckets.get(material).push(geometry);
    return this;
  }

  box(w, h, d, material, x, y, z, rx, ry, rz) {
    return this.add(new THREE.BoxGeometry(w, h, d), material, x, y, z, rx, ry, rz);
  }

  // Box, deren Textur nur auf den Flächen faces liegt (0 +x, 1 −x, 2 +y, 3 −y, 4 +z, 5 −z); die übrigen Flächen
  // nehmen die Farbe am Bildpunkt uv – so erscheint der Aufdruck nicht gestaucht auf den schmalen Kanten
  labelBox(w, h, d, material, faces, [u, v], x, y, z) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    const uv = geometry.attributes.uv;
    for (let f = 0; f < 6; f++) if (!faces.includes(f)) for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, u, v);
    return this.add(geometry, material, x, y, z);
  }

  // Fläche w × h, ohne Drehung nach +z gewandt mit Bildoberkante +y
  plane(w, h, material, x, y, z, rx, ry, rz) {
    return this.add(new THREE.PlaneGeometry(w, h), material, x, y, z, rx, ry, rz);
  }

  // Aufdruck auf einer Oberseite (Breite w längs x, Tiefe d längs z), Bildoberkante nach hinten (−z)
  top(w, d, material, x, y, z) {
    return this.plane(w, d, material, x, y, z, -Math.PI / 2);
  }

  cyl(r, h, segments, material, x, y, z, rx, ry, rz) {
    return this.add(new THREE.CylinderGeometry(r, r, h, segments), material, x, y, z, rx, ry, rz);
  }

  build(group = new THREE.Group()) {
    for (const [material, geos] of this.buckets) {
      const geometry = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (geos.length > 1) geos.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(geometry, material);
      mesh.matrixAutoUpdate = false; // liegt schon richtig, die Matrix bleibt die Einheitsmatrix
      group.add(mesh);
    }
    return group;
  }
}

// Einmal gebaute Vorlagen je Schlüssel; zurück kommt immer ein Klon (teilt Geometrie und Material)
const templates = new Map();
function cached(key, build) {
  if (!templates.has(key)) templates.set(key, build());
  return templates.get(key).clone();
}

// ---------- Materialien und Texturen (einmal angelegt, von allen Teilen geteilt) ----------

let M = null;
function mats() {
  M ??= {
    pcb: mat(0x1d5a3a, 0.75, 0.1),
    cpuSubstrate: mat(0x2f4a2a, 0.7, 0.1),
    gold: mat(0xc9a13b, 0.35, 0.6),
    plastic: mat(0x1b1c1f, 0.6, 0.05),
    steel: mat(0x9aa0a8, 0.4, 0.45),
    alu: mat(0xc3c7cd, 0.4, 0.4),
    copper: mat(0xc07a45, 0.35, 0.5),
    brass: mat(0xd4b45a, 0.4, 0.5),
    choke: mat(0x3a3d42, 0.5, 0.3),
    latchBlue: mat(0x2f6fd6, 0.5, 0.05),
    latchWhite: mat(0xe6e6e2, 0.5, 0.05),
    latchGreen: mat(0x34a853, 0.5, 0.05),
    psuBody: mat(0x2b2e33, 0.5, 0.35),
    diskBody: mat(0xa9aeb5, 0.45, 0.45),
  };
  return M;
}

const materials = new Map();
function cachedMaterial(key, make) {
  if (!materials.has(key)) materials.set(key, make());
  return materials.get(key);
}

// Material mit Canvas-Textur (nicht kachelbar)
function paintedMaterial(key, width, height, draw, { roughness = 0.55, metalness = 0.1, alphaTest = 0 } = {}) {
  return cachedMaterial(key, () => new THREE.MeshStandardMaterial({
    map: canvasTexture(width, height, draw, 1, 1, { wrap: false }), roughness, metalness, alphaTest,
  }));
}

function write(ctx, text, x, y, size, { weight = 'bold', color = '#111', align = 'left', baseline = 'alphabetic' } = {}) {
  ctx.font = `${weight} ${Math.round(size)}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(text, x, y);
}

function barcode(ctx, x, y, w, h, seed = 7) {
  ctx.fillStyle = '#111';
  let s = seed;
  for (let px = 0; px < w;) {
    s = (s * 9301 + 49297) % 233280;
    const bar = 1 + (s % 3);
    if (s % 2) ctx.fillRect(x + px, y, bar, h);
    px += bar + 1;
  }
}

// Gebürstetes Metall als Hintergrund
function brushed(ctx, w, h, light = 205, dark = 178) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, `rgb(${light},${light + 2},${light + 6})`);
  grad.addColorStop(1, `rgb(${dark},${dark + 3},${dark + 8})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 2) {
    ctx.fillStyle = `rgba(255,255,255,${(((y * 37) % 11) / 11) * 0.08})`;
    ctx.fillRect(0, y, w, 1);
  }
}

// CPU-Aufdruck auf dem Heatspreader: Modell, Kernzahl groß, Farbstreifen der Variante
function cpuLabelMaterial(cores, label) {
  const v = nearest(CPU_VARIANTS, cores);
  const w = 320;
  const h = Math.round(w * v.ihs[1] / v.ihs[0]);
  return paintedMaterial(`cpu|${cores}|${label}`, w, h, (ctx) => {
    brushed(ctx, w, h);
    ctx.fillStyle = '#c9a13b'; // Markierung Pin 1
    ctx.beginPath();
    ctx.moveTo(10, 10);
    ctx.lineTo(42, 10);
    ctx.lineTo(10, 42);
    ctx.fill();
    write(ctx, 'DCX', 52, 38, 26, { color: '#2a2d33' });
    write(ctx, label ?? v.model, w - 14, 38, 20, { weight: '600', color: '#3a3e45', align: 'right' });
    write(ctx, String(cores), 22, h * 0.68, h * 0.42, { weight: '800', color: '#1d2026' });
    ctx.font = `800 ${Math.round(h * 0.42)}px ${FONT}`;
    const numberWidth = ctx.measureText(String(cores)).width;
    write(ctx, 'CORES', 22 + numberWidth + 12, h * 0.68, h * 0.15, { color: '#2a2d33' });
    ctx.fillStyle = v.color;
    ctx.fillRect(0, h * 0.8, w, h * 0.2);
    write(ctx, 'SERVER · 2 SOCKETS', w / 2, h * 0.94, h * 0.1, { color: '#fff', align: 'center' });
  }, { roughness: 0.35, metalness: 0.35 });
}

// Kühlrippen: helle und dunkle Streifen (oben und vorn sieht man die Rippen längs z)
function finMaterial() {
  return paintedMaterial('fins', 256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#5d636b';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d3d7dc';
    for (let x = 0; x < w; x += 8) ctx.fillRect(x, 0, 5, h);
  }, { roughness: 0.4, metalness: 0.4 });
}

// Leerer CPU-Sockel: Kontaktfeld mit vielen goldenen Pünktchen
function pinsMaterial() {
  return paintedMaterial('pins', 128, 96, (ctx, w, h) => {
    ctx.fillStyle = '#2b2614';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c9a13b';
    for (let y = 3; y < h; y += 4) for (let x = 3 + ((y / 4) % 2) * 2; x < w; x += 4) ctx.fillRect(x, y, 2, 2);
  }, { roughness: 0.4, metalness: 0.5 });
}

// RAM-Aufdruck auf beiden Seiten des Kühlblechs: Größe groß, Typ klein
function ramLabelMaterial(gb, label) {
  const v = nearest(RAM_VARIANTS, gb);
  return paintedMaterial(`ram|${gb}|${label}`, 512, 96, (ctx, w, h) => {
    ctx.fillStyle = v.color;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let x = -h; x < w; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + h, 0);
      ctx.lineTo(x + h + 6, 0);
      ctx.lineTo(x + 6, h);
      ctx.fill();
    }
    ctx.fillStyle = '#f4f4f0';
    ctx.fillRect(w * 0.06, h * 0.14, w * 0.5, h * 0.72);
    write(ctx, 'DC MEMORY', w * 0.08, h * 0.38, h * 0.19, { color: '#333' });
    write(ctx, label ?? formatCapacity(gb), w * 0.08, h * 0.78, h * 0.36, { weight: '800', color: '#111' });
    write(ctx, 'DDR5-4800 ECC', w * 0.54, h * 0.38, h * 0.15, { weight: '600', color: '#444', align: 'right' });
    write(ctx, 'RDIMM', w * 0.54, h * 0.62, h * 0.15, { weight: '600', color: '#444', align: 'right' });
    ctx.fillStyle = v.accent;
    for (let i = 0; i < 3; i++) ctx.fillRect(w * (0.66 + i * 0.1), h * 0.3, w * 0.06, h * 0.4);
  });
}

// Platine eines RAM-Riegels (Seitenfläche): grün mit Speicherchips, unten die goldene Kontaktleiste mit Kerbe
function dimmPcbMaterial() {
  return paintedMaterial('dimm-pcb', 512, 120, (ctx, w, h) => {
    ctx.fillStyle = '#1d5a3a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#16181b';
    for (let i = 0; i < 9; i++) ctx.fillRect(14 + i * 54, h * 0.25, 40, h * 0.4);
    ctx.fillStyle = '#c9a13b';
    const notch = w * 0.59;
    for (let x = 8; x < w - 8; x += 5) if (Math.abs(x - notch) > 6) ctx.fillRect(x, h * 0.88, 3.5, h * 0.12);
  }, { roughness: 0.6, metalness: 0.2 });
}

// Festplatten-Etikett oben: Farbband je Größe, Größe groß, Barcode
function diskLabelMaterial(gb, label) {
  const color = nearest(DISK_COLORS, gb);
  return paintedMaterial(`disk|${gb}|${label}`, 256, 360, (ctx, w, h) => {
    ctx.fillStyle = '#f5f5f2';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h * 0.16);
    write(ctx, 'DC DRIVE', 16, h * 0.11, h * 0.07, { color: '#fff' });
    write(ctx, 'NAS', w - 16, h * 0.11, h * 0.06, { weight: '600', color: '#fff', align: 'right' });
    write(ctx, label ?? formatCapacity(gb), w / 2, h * 0.42, h * 0.17, { weight: '800', align: 'center' });
    write(ctx, '3,5" SATA · 7200 U/min', w / 2, h * 0.53, h * 0.045, { weight: '600', color: '#444', align: 'center' });
    ctx.fillStyle = '#ddd';
    ctx.fillRect(16, h * 0.6, w - 32, 2);
    write(ctx, `SN DC${String((gb * 7919) % 100000).padStart(6, "0")}`, 16, h * 0.68, h * 0.04, { weight: '600', color: '#555' });
    barcode(ctx, 16, h * 0.72, w - 32, h * 0.1, gb);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 3;
    ctx.beginPath(); // Warnzeichen
    ctx.moveTo(w - 50, h * 0.95);
    ctx.lineTo(w - 30, h * 0.88);
    ctx.lineTo(w - 10, h * 0.95);
    ctx.closePath();
    ctx.stroke();
    write(ctx, 'Made for Druckercenter', 16, h * 0.95, h * 0.035, { weight: '600', color: '#777' });
  });
}

// Blende des Einschubrahmens (Vorderseite): Farbe der Blende, Lüftungsschlitze, Etikett mit Größe, grüne LED
function bezelMaterial(gb, label, bezelColor) {
  return paintedMaterial(`bezel|${gb}|${label}|${bezelColor}`, 256, 64, (ctx, w, h) => {
    ctx.fillStyle = `#${new THREE.Color(bezelColor).getHexString()}`;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    for (let x = 12; x < w * 0.55; x += 9) ctx.fillRect(x, h * 0.1, 4, h * 0.24);
    ctx.fillStyle = '#f2f2ee';
    ctx.fillRect(w * 0.6, h * 0.42, w * 0.34, h * 0.44);
    ctx.fillStyle = nearest(DISK_COLORS, gb);
    ctx.fillRect(w * 0.6, h * 0.42, 8, h * 0.44);
    write(ctx, label ?? formatCapacity(gb), w * 0.785, h * 0.65, h * 0.34, { weight: '800', align: 'center', baseline: 'middle' });
    ctx.fillStyle = '#4cff7a';
    ctx.beginPath();
    ctx.arc(w * 0.9, h * 0.22, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Netzteil oben: Leistung, Effizienz, Warnzeichen
function psuLabelMaterial(watts) {
  return paintedMaterial(`psu|${watts}`, 128, 196, (ctx, w, h) => {
    brushed(ctx, w, h, 190, 160);
    ctx.fillStyle = '#f2f2ee';
    ctx.fillRect(8, 8, w - 16, h - 16);
    write(ctx, 'DC POWER', w / 2, 30, 15, { color: '#333', align: 'center' });
    write(ctx, `${watts} W`, w / 2, 70, 30, { weight: '800', align: 'center' });
    ctx.fillStyle = '#1f2a44';
    ctx.fillRect(18, 84, w - 36, 34);
    write(ctx, '80 PLUS', w / 2, 99, 12, { color: '#fff', align: 'center' });
    write(ctx, 'PLATINUM', w / 2, 113, 12, { color: '#cfd6e6', align: 'center' });
    write(ctx, 'AC 200–240 V', w / 2, 138, 11, { weight: '600', color: '#444', align: 'center' });
    barcode(ctx, 18, 148, w - 36, 22, watts);
    ctx.fillStyle = '#f2c419';
    ctx.beginPath();
    ctx.moveTo(w / 2 - 10, 186);
    ctx.lineTo(w / 2, 172);
    ctx.lineTo(w / 2 + 10, 186);
    ctx.fill();
  });
}

// Netzteil hinten: Lochgitter vor dem Lüfter, Status-LED, Stecker
function psuBackMaterial() {
  return paintedMaterial('psu-back', 192, 102, (ctx, w, h) => {
    ctx.fillStyle = '#222428';
    ctx.fillRect(0, 0, w, h);
    const r = h * 0.42;
    const cx = w * 0.36;
    const cy = h / 2;
    ctx.fillStyle = '#060607';
    for (let y = cy - r; y <= cy + r; y += 7) {
      for (let x = cx - r + ((y / 7) % 2) * 3.5; x <= cx + r; x += 7) {
        if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) {
          ctx.beginPath();
          ctx.arc(x, y, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.fillStyle = '#0c0d0f'; // Kaltgerätebuchse
    ctx.fillRect(w * 0.7, h * 0.25, w * 0.2, h * 0.5);
    ctx.fillStyle = '#3a3d42';
    ctx.fillRect(w * 0.73, h * 0.35, w * 0.14, h * 0.3);
    ctx.fillStyle = '#4cff7a';
    ctx.beginPath();
    ctx.arc(w * 0.8, h * 0.13, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Lüfter von vorn/hinten: quadratischer Rahmen, Flügel, Nabe mit Aufkleber
function fanFaceMaterial() {
  return paintedMaterial('fan-face', 128, 128, (ctx, w) => {
    const r = w / 2;
    ctx.fillStyle = '#1b1c1f';
    ctx.fillRect(0, 0, w, w);
    ctx.translate(r, r);
    ctx.fillStyle = '#070708';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.94, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3b4048';
    for (let i = 0; i < 7; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI * 2) / 7);
      ctx.beginPath();
      ctx.moveTo(r * 0.3, -r * 0.05);
      ctx.quadraticCurveTo(r * 0.7, -r * 0.5, r * 0.9, -r * 0.12);
      ctx.quadraticCurveTo(r * 0.62, r * 0.05, r * 0.3, r * 0.14);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#26292e';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2f6fd6';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    write(ctx, 'DC', 0, 1, r * 0.18, { color: '#fff', align: 'center', baseline: 'middle' });
    ctx.fillStyle = '#9aa0a8'; // Schraubenlöcher in den Ecken
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.beginPath();
      ctx.arc(x * r * 0.88, y * r * 0.88, r * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// ---------- Teile ----------

// CPU: cores 10 | 20 | 32 | 64 (andere Zahlen sehen aus wie die nächstgrößere Variante).
// Größe des Heatspreaders und Farbstreifen hängen von der Variante ab; label ersetzt die Modellbezeichnung.
// cooler: true (64 mm) oder Höhe in Metern – passiver Kühlkörper obendrauf, mit kleinem Aufdruck.
// Ursprung Mitte Unterseite des Trägers; im Sockel liegt die CPU auf dem Sockelrahmen.
export function createCpu(cores = 32, { label = null, cooler = false } = {}) {
  const coolerHeight = cooler === true ? 0.064 : Math.max(0, +cooler || 0);
  return cached(`cpu|${cores}|${label}|${coolerHeight}`, () => {
    const m = mats();
    const v = nearest(CPU_VARIANTS, cores);
    const [sw, sd] = v.sub;
    const [iw, id] = v.ihs;
    const b = new Builder()
      .box(sw, 0.0015, sd, m.cpuSubstrate, 0, 0.00075, 0)
      .box(iw + 0.004, 0.0006, id + 0.004, m.alu, 0, 0.0018, 0) // Rand des Heatspreaders
      .box(iw, 0.0029, id, m.alu, 0, 0.0015 + 0.00145, 0)
      .top(iw, id, cpuLabelMaterial(cores, label), 0, CPU_H + 0.00005, 0);
    // Kondensatoren am Rand des Trägers
    for (let i = 0; i < 8; i++) {
      b.box(0.0014, 0.0006, 0.0008, m.gold, -sw / 2 + 0.004 + i * 0.0022, 0.0018, sd / 2 - 0.002);
    }
    if (coolerHeight > 0) {
      const finH = coolerHeight - 0.004;
      b.box(0.08, 0.004, 0.09, m.copper, 0, CPU_H + 0.002, 0)
        .box(0.088, finH, 0.1, finMaterial(), 0, CPU_H + 0.004 + finH / 2, 0);
      const lw = 0.04;
      b.top(lw, lw * id / iw, cpuLabelMaterial(cores, label), 0, CPU_H + coolerHeight + 0.00005, 0);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        b.cyl(0.0035, 0.004, 10, m.steel, x * 0.036, CPU_H + coolerHeight + 0.002, z * 0.042);
      }
    }
    const g = b.build();
    g.userData = { part: 'cpu', variant: cores };
    return g;
  });
}

// RAM-Riegel: gb 32 | 64 | 128, Farbe des Kühlblechs je Variante, label ersetzt die Größenangabe.
// Steht hochkant, Länge längs z, Aufdruck auf beiden Seiten (±x). Ursprung Mitte der Kontaktkante.
export function createRam(gb = 64, { label = null } = {}) {
  return cached(`ram|${gb}|${label}`, () => {
    // Zwei Meshes: Platine (Textur mit Kontaktleiste) und Kühlblech (Aufdruck auf beiden Seitenflächen der Box)
    const spreadH = 0.024;
    const g = new Builder()
      .box(0.0012, DIMM.h, DIMM.l, dimmPcbMaterial(), 0, DIMM.h / 2, 0)
      .labelBox(0.0038, spreadH, 0.128, ramLabelMaterial(gb, label), [0, 1], [0.02, 0.5], 0, 0.0055 + spreadH / 2, 0)
      .build();
    g.userData = { part: 'ram', variant: gb };
    return g;
  });
}

// Lage der Sockel und RAM-Steckplätze auf einem Mainboard (Platinen-Koordinaten: Ursprung Mitte Unterseite,
// Oberseite bei y = PCB_T). Je CPU ein Block: RAM-Steckplätze links und rechts neben dem Sockel. Die RAM-Plätze
// werden gleichmäßig auf die Sockel verteilt und von links nach rechts nummeriert (ram0 … zuerst die der cpu0).
function boardLayout({ cpus = 2, ram = 16 } = {}, minWidth = 0) {
  const blocks = Math.max(1, cpus);
  const perBlock = Array.from({ length: blocks }, (_, i) => Math.floor(ram / blocks) + (i < ram % blocks ? 1 : 0));
  const widths = perBlock.map((n) => n * DIMM_PITCH + SOCKET_ZONE + 0.008);
  const used = widths.reduce((a, w) => a + w, 0);
  const width = Math.max(minWidth, used + 0.02, 0.17);
  const z = BOARD_DEPTH / 2 - 0.012 - 0.07; // Steckplätze vorn, dahinter Spannungswandler und Anschlüsse
  const sockets = [];
  const dimms = [];
  let x = -used / 2;
  perBlock.forEach((n, i) => {
    const left = Math.ceil(n / 2);
    for (let j = 0; j < left; j++) dimms.push({ x: x + (j + 0.5) * DIMM_PITCH, z, cpu: i });
    x += left * DIMM_PITCH + 0.004;
    if (i < cpus) sockets.push({ x: x + SOCKET_ZONE / 2, z });
    x += SOCKET_ZONE + 0.004;
    for (let j = 0; j < n - left; j++) dimms.push({ x: x + (j + 0.5) * DIMM_PITCH, z, cpu: i });
    x += (n - left) * DIMM_PITCH;
  });
  return { width, depth: BOARD_DEPTH, sockets, dimms };
}

// Aufdruck der Platine: Leiterbahnen, Umrisse und Namen der Steckplätze, Bohrungen
function boardSilkMaterial(lay, key, name) {
  const PX = 1600;
  const w = Math.round(lay.width * PX);
  const h = Math.round(lay.depth * PX);
  const cx = (x) => (x + lay.width / 2) * PX;
  const cz = (z) => (z + lay.depth / 2) * PX; // Bildoberkante = hinten (−z)
  return paintedMaterial(`board|${key}`, w, h, (ctx) => {
    ctx.fillStyle = '#1d5a3a';
    ctx.fillRect(0, 0, w, h);
    let s = 11;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    ctx.strokeStyle = 'rgba(120,200,140,0.18)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 160; i++) { // Leiterbahnen: gerade Stücke mit 45°-Knick
      const x = rnd() * w;
      const y = rnd() * h;
      const l = 20 + rnd() * 80;
      ctx.beginPath();
      ctx.moveTo(x, y);
      if (rnd() < 0.5) ctx.lineTo(x + l, y); else ctx.lineTo(x, y + l);
      ctx.lineTo(x + l + 10, y + l + 10);
      ctx.stroke();
    }
    ctx.strokeStyle = '#e8efe9';
    ctx.lineWidth = 2;
    lay.sockets.forEach((sock, i) => {
      ctx.strokeRect(cx(sock.x) - 0.045 * PX, cz(sock.z) - 0.05 * PX, 0.09 * PX, 0.1 * PX);
      write(ctx, `CPU${i}`, cx(sock.x), cz(sock.z) - 0.053 * PX, 16, { color: '#e8efe9', align: 'center' });
    });
    lay.dimms.forEach((d, i) => {
      write(ctx, `${'ABCDEFGH'[(i >> 1) % 8]}${i % 2}`, cx(d.x), cz(d.z) - 0.074 * PX, 9, { weight: '600', color: '#e8efe9', align: 'center' });
    });
    write(ctx, name, w - 24, 30, 15, { color: '#e8efe9', align: 'right' });
    ctx.strokeStyle = '#c9a13b';
    ctx.lineWidth = 3;
    for (const [x, y] of [[12, 12], [w - 12, 12], [12, h - 12], [w - 12, h - 12], [w / 2, h / 2]]) {
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, { roughness: 0.7 });
}

// Mainboard mit Steckplatz-Satz { cpus, ram } (z. B. 2 Sockel / 16 RAM, NAS 1 Sockel / 4 oder 8 RAM).
// width: Mindestbreite (der offene Server füllt damit sein Gehäuse). Ursprung Mitte Unterseite der Platine.
// userData.slots: { cpu0: { kind: 'cpu', x, y, z }, ram0: { kind: 'ram', … } } – Lage auf der Platine, an der eine
// CPU bzw. ein Riegel mit seinem Ursprung sitzt.
export function createMainboard(layout = DEFAULT_LAYOUT, { width = 0 } = {}) {
  const lay = boardLayout(layout, width);
  const key = `${layout.cpus ?? 2}|${layout.ram ?? 16}|${lay.width.toFixed(4)}`;
  return cached(`board|${key}`, () => {
    const m = mats();
    const top = PCB_T;
    const name = `DC-BOARD ${lay.sockets.length}S-${lay.dimms.length}D`;
    // Platine als eine Box: Oberseite trägt den Aufdruck (Bildoberkante hinten wie bei top())
    const b = new Builder().labelBox(lay.width, PCB_T, lay.depth, boardSilkMaterial(lay, key, name), [2], [0.004, 0.5], 0, PCB_T / 2, 0);
    const slots = {};
    lay.sockets.forEach((s, i) => {
      b.box(0.084, SOCKET_H, 0.066, m.plastic, s.x, top + SOCKET_H / 2, s.z)
        .top(0.07, 0.054, pinsMaterial(), s.x, top + SOCKET_H + 0.00005, s.z)
        .box(0.004, 0.003, 0.068, m.steel, s.x - 0.044, top + 0.0015, s.z)
        .box(0.004, 0.003, 0.068, m.steel, s.x + 0.044, top + 0.0015, s.z)
        .box(0.003, 0.003, 0.05, m.steel, s.x + 0.049, top + 0.004, s.z + 0.005); // Hebel
      // Spannungswandler hinter dem Sockel
      for (let j = 0; j < 6; j++) b.box(0.009, 0.007, 0.009, m.choke, s.x - 0.033 + j * 0.0132, top + 0.0035, s.z - 0.066);
      for (let j = 0; j < 4; j++) b.cyl(0.003, 0.009, 8, m.choke, s.x - 0.03 + j * 0.02, top + 0.0045, s.z - 0.082);
      slots[`cpu${i}`] = { kind: 'cpu', x: s.x, y: top + SOCKET_H, z: s.z };
    });
    lay.dimms.forEach((d, i) => {
      const latch = i % 2 ? m.latchWhite : m.latchBlue;
      b.box(0.0062, 0.0075, 0.14, m.plastic, d.x, top + 0.00375, d.z)
        .box(0.0066, 0.009, 0.006, latch, d.x, top + 0.0045, d.z + 0.073)
        .box(0.0066, 0.009, 0.006, latch, d.x, top + 0.0045, d.z - 0.073);
      slots[`ram${i}`] = { kind: 'ram', x: d.x, y: top + DIMM_SEAT, z: d.z };
    });
    // Hinten: Chipsatz mit Kühlkörper, zwei Erweiterungssteckplätze, Anschlussblock an der Hinterkante
    const backZ = -lay.depth / 2;
    b.box(0.04, 0.012, 0.04, m.alu, -lay.width / 2 + 0.05, top + 0.006, backZ + 0.07)
      .box(0.089, 0.011, 0.0075, m.plastic, 0.02, top + 0.0055, backZ + 0.045)
      .box(0.089, 0.011, 0.0075, m.plastic, 0.02, top + 0.0055, backZ + 0.065)
      .box(0.06, 0.014, 0.016, m.steel, -lay.width / 2 + 0.05, top + 0.007, backZ + 0.009)
      .box(0.03, 0.012, 0.014, m.plastic, -lay.width / 2 + 0.1, top + 0.006, backZ + 0.008);
    const g = b.build();
    g.userData = { part: 'board', variant: { cpus: lay.sockets.length, ram: lay.dimms.length }, slots, width: lay.width, depth: lay.depth };
    return g;
  });
}

// Netzteil (CRPS-Einschub, 73,5 × 39 × 185 mm): watts steht auf dem Etikett. Griff, Lüftergitter und Buchse zeigen
// nach hinten (−z), die Steckkontakte nach vorn. Ursprung Mitte unten.
export function createPsu(watts = 1600) {
  return cached(`psu|${watts}`, () => {
    const m = mats();
    const { w, h, d } = PSU;
    const b = new Builder()
      .box(w, h, d, m.psuBody, 0, h / 2, 0)
      .top(w - 0.006, d * 0.6, psuLabelMaterial(watts), 0, h + 0.00005, -d * 0.12)
      .plane(w, h, psuBackMaterial(), 0, h / 2, -d / 2 - 0.0001, 0, Math.PI)
      .box(0.004, 0.004, 0.02, m.plastic, -0.02, h * 0.55, -d / 2 - 0.01) // Griff
      .box(0.004, 0.004, 0.02, m.plastic, 0.02, h * 0.55, -d / 2 - 0.01)
      .box(0.044, 0.007, 0.004, m.plastic, 0, h * 0.55, -d / 2 - 0.02)
      .box(0.008, 0.006, 0.006, m.latchGreen, w / 2 - 0.008, 0.006, -d / 2 - 0.003); // Entriegelung
    const g = b.build();
    g.userData = { part: 'psu', variant: watts };
    return g;
  });
}

// Lüfter-Einschub: quadratisch (size, Standard 80 mm), 38 mm tief, bläst längs z. Blaue Griffzunge oben.
// Ursprung Mitte unten.
export function createFanModule({ size = FAN.size } = {}) {
  return cached(`fan|${size.toFixed(4)}`, () => {
    const m = mats();
    const face = fanFaceMaterial();
    const dz = FAN.depth / 2 + 0.0001;
    const b = new Builder()
      .box(size, size, FAN.depth, m.plastic, 0, size / 2, 0)
      .plane(size, size, face, 0, size / 2, dz)
      .plane(size, size, face, 0, size / 2, -dz, 0, Math.PI)
      .box(size * 0.45, 0.003, 0.014, m.latchBlue, 0, size + 0.0015, 0);
    const g = b.build();
    g.userData = { part: 'fan', variant: Math.round(size * 1000) };
    return g;
  });
}

// 3,5-Zoll-Festplatte: gb 512 | 2048 | 4096 | 8192, Etikett mit Größe und Farbband je Variante.
// caddy: im Einschubrahmen (Blende mit Hebel, aufgemalter LED und Etikett vorn, Schienen seitlich) – so sitzt sie
// im NAS-Schacht; bezelColor färbt die Blende. Liegt flach; Ursprung Mitte unten an der Vorderkante (z = 0),
// die Platte reicht nach hinten bis z = −0,147 (mit Rahmen −0,159). Nur der Hebel ragt 3 mm nach vorn.
export function createDisk(gb = 2048, { label = null, caddy = false, bezelColor = 0x2a2d32 } = {}) {
  return cached(`disk|${gb}|${label}|${caddy}|${bezelColor}`, () => {
    const m = mats();
    const { w, h, d } = DISK;
    const z0 = caddy ? -CADDY : 0; // Vorderkante der eigentlichen Platte
    const b = new Builder()
      .box(w, h, d, m.diskBody, 0, h / 2, z0 - d / 2)
      .top(w * 0.92, d * 0.9, diskLabelMaterial(gb, label), 0, h + 0.00005, z0 - d / 2);
    if (!caddy) b.box(0.032, 0.006, 0.004, m.plastic, -0.02, 0.006, -d - 0.002); // SATA-Stecker hinten
    else {
      b.labelBox(w + 0.004, h + 0.0004, CADDY, bezelMaterial(gb, label, bezelColor), [4], [0.01, 0.5], 0, (h + 0.0004) / 2, -CADDY / 2)
        .box(0.0018, 0.012, d, m.steel, -(w / 2 + 0.0009), 0.008, z0 - d / 2) // Schienen
        .box(0.0018, 0.012, d, m.steel, w / 2 + 0.0009, 0.008, z0 - d / 2)
        .box(w * 0.5, 0.006, 0.003, m.steel, -w * 0.2, h * 0.68, 0.0015); // Hebel
    }
    const g = b.build();
    g.userData = { part: 'disk', variant: gb };
    return g;
  });
}

// Alle Teile über eine Funktion: kind 'cpu' | 'ram' | 'board' | 'psu' | 'fan' | 'disk'.
// variant: Cores, GB, Steckplatz-Satz (board), Watt (psu); options wie bei der jeweiligen Funktion
// (fan: { size }). broken: true markiert das Teil gleich als defekt.
export function createServerPart(kind, variant, options = {}) {
  let part;
  switch (kind) {
    case 'cpu': part = createCpu(variant ?? 32, options); break;
    case 'ram': part = createRam(variant ?? 64, options); break;
    case 'board': part = createMainboard(variant ?? DEFAULT_LAYOUT, options); break;
    case 'psu': part = createPsu(variant ?? 1600); break;
    case 'fan': part = createFanModule(options); break;
    case 'disk': part = createDisk(variant ?? 2048, options); break;
    default: throw new Error(`Unbekanntes Server-Bauteil: ${kind}`);
  }
  if (options.broken) markBroken(part, true);
  return part;
}

// Produktbild für den Teile-Shop: das Teil so gedreht, dass Aufdruck und Form zur Kamera von
// ui/printer-preview.js (schräg vorn rechts oben) zeigen. Beispiel:
//   renderPreviews([{ id: 'cpu-64', name: 'CPU 64 Cores', make: () => createPartPreview('cpu', 64) }])
export function createPartPreview(kind, variant, options = {}) {
  const part = createServerPart(kind, variant, options);
  const pose = {
    cpu: [0.85, -0.25, 0],
    ram: [0.25, -Math.PI / 2 - 0.15, 0],
    board: [0.7, -0.15, 0],
    psu: [0.55, -0.45, 0],
    fan: [0.1, -0.35, 0],
    disk: [0.8, -0.25, 0],
  }[kind];
  part.rotation.set(...pose);
  const g = new THREE.Group();
  g.add(part);
  return g;
}

// ---------- Defekt-Markierung ----------

// Je Originalmaterial einmal eine rot leuchtende Kopie (teilt die Texturen); beim Markieren wird nur getauscht
const brokenOf = new Map();
const originalOf = new Map();
const BROKEN_COLOR = 0xff2a14;
const BROKEN_TINT = new THREE.Color(1, 0.5, 0.45);

function brokenMaterial(material) {
  if (originalOf.has(material)) return material;
  if (!brokenOf.has(material)) {
    const copy = material.clone();
    copy.color.multiply(BROKEN_TINT); // helle Teile (Etiketten, Blech) wirken sonst kaum rot
    copy.emissive = new THREE.Color(BROKEN_COLOR);
    copy.emissiveIntensity = 0.55;
    brokenOf.set(material, copy);
    originalOf.set(copy, material);
  }
  return brokenOf.get(material);
}

// Teil (oder ganze Gruppe) als defekt markieren (on = true) bzw. wieder normal zeigen. Setzt userData.broken.
export function markBroken(object, on = true) {
  const swap = (m) => (on ? brokenMaterial(m) : (originalOf.get(m) ?? m));
  object.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
  object.userData.broken = on;
  return object;
}

// Optional einmal je Frame: lässt alle Defekt-Markierungen langsam pulsieren (ändert nur einen Wert an den
// wenigen geteilten Kopien). seconds: laufende Zeit in Sekunden.
export function pulseBroken(seconds) {
  const intensity = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(seconds * 3.5));
  for (const copy of originalOf.keys()) copy.emissiveIntensity = intensity;
}

// ---------- Offener Server auf der Werkbank ----------

// Gehäuse ohne Deckel mit Ankerpunkten je Steckplatz. layout: Steckplatz-Satz (DEFAULT_LAYOUT, siehe oben).
// options: units – Höhe in HE (Standard 2; NAS L: 4), color – Blechfarbe (Standard verzinkt),
//          board – Mainboard gleich einsetzen (Standard true), bezelColor – Blende der Festplatten-Rahmen.
// Ursprung Mitte unten (Boden des Gehäuses), vorn +z wie im Schrank. Aufbau von vorn nach hinten:
// Festplatten-Schächte (nur mit bays), Lüfterwand, Mainboard links mit Sockeln und RAM, Netzteil hinten rechts.
//
// userData:
//   slots: { [id]: { kind, anchor, position, rotation } } – anchor ist ein leeres Object3D im Server, position und
//          rotation sind dessen eigene Werte (in Server-Koordinaten). Ein Teil an anchor angehängt sitzt richtig.
//          IDs: board, psu, cpu0 …, ram0 … (zuerst die RAM-Plätze der cpu0, je Sockel von links nach rechts),
//          fan0 … (von links), bay0 … (Reihen von oben nach unten, je Reihe von links)
//   layout, units, size { w, h, d }, fanSize, coolerHeight (passende Größen für mountPart), bezelColor
export function createOpenServer(layout = DEFAULT_LAYOUT, { units = 2, color = null, board = true, bezelColor = 0x2a2d32 } = {}) {
  const lay = { ...DEFAULT_LAYOUT, ...layout };
  const W = SERVER_WIDTH;
  const D = SERVER_DEPTH;
  const H = units * UNIT - 0.002;
  const inner = W - 2 * SHEET;
  const fanSize = Math.min(FAN.size, H - SHEET - 0.004);
  const frontZone = lay.bays > 0 ? BAY.depth + 0.004 : 0.06;
  // Lüfterwand direkt vor dem Mainboard (bei Schächten ggf. etwas weiter hinten)
  const fanZ = Math.min(D / 2 - frontZone - FAN.depth / 2 - 0.004, -D / 2 + SHEET + 0.002 + BOARD_DEPTH + 0.012 + FAN.depth / 2);
  const boardWidth = inner - PSU.w - 0.008;
  const boardX = -inner / 2 + 0.003 + boardWidth / 2;
  const boardZ = -D / 2 + SHEET + 0.002 + BOARD_DEPTH / 2;
  const boardY = SHEET + STANDOFF;
  const boardTop = boardY + PCB_T;
  const coolerHeight = Math.min(0.064, H - boardTop - SOCKET_H - CPU_H - 0.003);
  const cols = Math.min(4, lay.bays);
  const rows = cols ? Math.ceil(lay.bays / cols) : 0;
  const bayBottom = SHEET + Math.max(0, (H - SHEET - rows * BAY.pitchY) / 2);

  const key = `open|${lay.cpus}|${lay.ram}|${lay.fans}|${lay.bays}|${units}|${color}`;
  const g = cached(key, () => {
    const m = mats();
    const sheet = chassisMaterial(color ?? 0x8a9098, color != null);
    const b = new Builder()
      .box(W, SHEET, D, sheet, 0, SHEET / 2, 0)
      .box(SHEET, H, D, sheet, -W / 2 + SHEET / 2, H / 2, 0)
      .box(SHEET, H, D, sheet, W / 2 - SHEET / 2, H / 2, 0);
    // Rückwand mit Aussparung fürs Netzteil (rechts), vorn eine volle Wand oder nur eine Kante unter den Schächten
    const backW = inner - PSU.w - 0.004;
    b.box(backW, H, SHEET, sheet, -inner / 2 + backW / 2, H / 2, -D / 2 + SHEET / 2)
      .box(inner, lay.bays ? bayBottom : H, SHEET, sheet, 0, (lay.bays ? bayBottom : H) / 2, D / 2 - SHEET / 2);
    // Abstandsbolzen unter dem Mainboard
    for (const [fx, fz] of [[-0.45, 0.45], [0.45, 0.45], [-0.45, -0.45], [0.45, -0.45], [0, 0], [0, -0.45]]) {
      b.cyl(0.003, STANDOFF, 8, m.brass, boardX + fx * boardWidth, SHEET + STANDOFF / 2, boardZ + fz * BOARD_DEPTH);
    }
    // Lüfterwand: Schienen am Boden und Querstrebe oben
    if (lay.fans > 0) {
      b.box(inner, 0.004, 0.003, m.plastic, 0, SHEET + 0.002, fanZ + FAN.depth / 2 + 0.0015)
        .box(inner, 0.004, 0.003, m.plastic, 0, SHEET + 0.002, fanZ - FAN.depth / 2 - 0.0015)
        .box(inner, 0.003, 0.01, m.plastic, 0, SHEET + fanSize + 0.0045, fanZ);
    }
    // Schachtkäfig: Trennbleche zwischen den Spalten, Rückwandplatine mit einem Stecker je Schacht
    if (lay.bays > 0) {
      const cageH = rows * BAY.pitchY;
      const cageZ = D / 2 - BAY.depth / 2;
      for (let c = 0; c <= cols; c++) {
        b.box(0.0015, cageH, BAY.depth, m.steel, (c - cols / 2) * BAY.pitchX, bayBottom + cageH / 2, cageZ);
      }
      b.box(cols * BAY.pitchX, cageH, PCB_T, m.pcb, 0, bayBottom + cageH / 2, D / 2 - BAY.depth - PCB_T / 2);
      for (let i = 0; i < lay.bays; i++) {
        const { x, y } = bayPosition(i);
        b.box(0.034, 0.008, 0.004, m.plastic, x - 0.02, y + 0.006, D / 2 - BAY.depth + 0.002);
      }
    }
    return b.build();
  });

  function bayPosition(i) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    return { x: (col - (cols - 1) / 2) * BAY.pitchX, y: bayBottom + (rows - 1 - row) * BAY.pitchY + 0.0006 };
  }

  const slots = {};
  const addSlot = (id, kind, x, y, z, ry = 0) => {
    const anchor = new THREE.Object3D();
    anchor.name = id;
    anchor.position.set(x, y, z);
    anchor.rotation.y = ry;
    g.add(anchor);
    slots[id] = { kind, anchor, position: anchor.position, rotation: anchor.rotation };
  };
  addSlot('board', 'board', boardX, boardY, boardZ);
  addSlot('psu', 'psu', inner / 2 - PSU.w / 2 - 0.001, SHEET, -D / 2 + PSU.d / 2 + 0.004);
  const boardSlots = boardLayout(lay, boardWidth);
  boardSlots.sockets.forEach((s, i) => addSlot(`cpu${i}`, 'cpu', boardX + s.x, boardTop + SOCKET_H, boardZ + s.z));
  boardSlots.dimms.forEach((d, i) => addSlot(`ram${i}`, 'ram', boardX + d.x, boardTop + DIMM_SEAT, boardZ + d.z));
  const fanPitch = Math.min(fanSize + 0.008, inner / Math.max(1, lay.fans));
  for (let i = 0; i < lay.fans; i++) addSlot(`fan${i}`, 'fan', (i - (lay.fans - 1) / 2) * fanPitch, SHEET, fanZ);
  for (let i = 0; i < lay.bays; i++) {
    const { x, y } = bayPosition(i);
    addSlot(`bay${i}`, 'disk', x, y, D / 2);
  }

  g.userData = { slots, layout: lay, units, size: { w: W, h: H, d: D }, fanSize, coolerHeight, bezelColor, boardWidth };
  if (board) mountPart(g, 'board', {});
  return g;
}

// Setzt ein Teil in einen Steckplatz des offenen Servers (ersetzt, was dort war) und gibt es zurück.
// part: fertiges Object3D (z. B. aus createCpu) oder eine Beschreibung { variant, cooler, label, broken } –
// dann wird das Teil passend zum Server gebaut (Lüftergröße, Kühlerhöhe, Festplatte im Rahmen, Mainboard-Breite).
// part = null leert den Steckplatz.
export function mountPart(server, slotId, part) {
  const slot = server.userData.slots[slotId];
  if (!slot) return null;
  slot.anchor.clear();
  if (!part) return null;
  if (!part.isObject3D) {
    const u = server.userData;
    const fit = {
      cpu: { cooler: part.cooler ? u.coolerHeight : false },
      fan: { size: u.fanSize },
      disk: { caddy: true, bezelColor: u.bezelColor },
      board: { width: u.boardWidth },
    }[slot.kind] ?? {};
    const variant = slot.kind === 'board' ? (part.variant ?? u.layout) : part.variant;
    part = createServerPart(slot.kind, variant, { ...part, ...fit });
  }
  slot.anchor.add(part);
  return part;
}

// Teil im Steckplatz (oder null)
export function partInSlot(server, slotId) {
  return server.userData.slots[slotId]?.anchor.children[0] ?? null;
}
