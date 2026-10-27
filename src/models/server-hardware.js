// 3D-Modelle der Server-Hardware (core/server-catalog.js): Serverschrank und Geräte für 19-Zoll-Schränke.
// Schrank: Ursprung Mitte unten, Vorderseite +z mit Glastür (Scharnier links, userData.door), hinten offen.
// Gerät: Ursprung Mitte der Frontplatte, Gehäuse nach hinten (−z). Die Ports sitzen auf der Rückseite;
// portPositions liefert ihre Lage (für die Kabel in world/server-room.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const UNIT = 0.0445;        // eine Höheneinheit (HE) in Metern
export const FRONT_WIDTH = 0.483;  // 19 Zoll
const DEVICE_DEPTH = 0.5;
const RACK_WIDTH = 0.6;
const RACK_BASE = 0.1;             // Sockel unter der untersten Höheneinheit
const RACK_TOP = 0.08;
const PORT_PITCH = 0.017;

export const rackDepth = (type) => (type.units <= 12 ? 0.55 : 0.8);
export const rackHeight = (type) => RACK_BASE + type.units * UNIT + RACK_TOP;
export const RACK_FOOTPRINT = { w: RACK_WIDTH, d: 0.8 };
// Farbe der Netzwerkkabel (im Schrank, im Schrankfenster und auf der Kabelrolle)
export const CABLE_COLOR = 0x2f7de1;

const mat = (color, roughness = 0.6, metalness = 0.3) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const glow = (color) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.5) });
const MATS = {
  steel: mat(0xa8adb4, 0.35, 0.8),
  dark: mat(0x1f2227, 0.5, 0.5),
  panel: mat(0x2c3036, 0.45, 0.6),
  port: mat(0x0b0c0e, 0.8, 0.1),
  portRim: mat(0x9aa0a8, 0.4, 0.7),
  red: mat(0xb8322a, 0.45, 0.4),
  white: mat(0xe8e8e4, 0.6, 0.1),
  clip: mat(0x3a3f47, 0.6, 0.2),
  ledGreen: glow(0x2bd96b),
  ledRed: glow(0xff3b30),
  ledAmber: glow(0xffb020),
};

function box(w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

const BACK_Z = -DEVICE_DEPTH - 0.004; // Rückseite des Gehäuses (Gerätekoordinaten)
const HOLE_ROWS = [0.143, 0.5, 0.857]; // Lage der drei Vierkantlöcher in einer HE (Anteil von oben, wie beim 19-Zoll-Raster)

// Material für die Montageschienen: Stahl mit drei Vierkantlöchern je Höheneinheit, für units HE gekachelt
const railMats = new Map();
function railMaterial(units) {
  if (railMats.has(units)) return railMats.get(units);
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#a8adb4';
  ctx.fillRect(0, 0, 16, 48);
  ctx.fillStyle = '#0b0c0e';
  for (const f of HOLE_ROWS) ctx.fillRect(4, Math.round(f * 48) - 4, 8, 8);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, units);
  texture.magFilter = THREE.NearestFilter;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.35, metalness: 0.8 });
  railMats.set(units, material);
  return material;
}

// Lage der Ports auf der Rückseite (Gerätekoordinaten), dort wird verkabelt. Viele Ports in zwei Reihen.
export function portPositions(type) {
  const n = type.ports;
  const rows = n > 12 ? 2 : 1;
  const cols = Math.ceil(n / rows);
  const h = type.units * UNIT;
  const right = FRONT_WIDTH / 2 - 0.035;
  return Array.from({ length: n }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const y = rows === 2 ? (row ? -0.0075 : 0.0075) : (type.kind === 'server' ? -h / 2 + UNIT / 2 : 0);
    return { x: right - (cols - 1 - col) * PORT_PITCH, y, z: BACK_Z - 0.004 };
  });
}

// Gerät für den Schrank. online: Status-LED grün (Server online) bzw. rot; andere Geräte leuchten grün
export function createServerDevice(type, { online = true } = {}) {
  const g = new THREE.Group();
  const h = type.units * UNIT - 0.002;
  // Server mit eigener Farbe (Kategorie, z. B. System X gelb): ganzes Gehäuse in dieser Farbe
  const colored = type.kind === 'server' && type.color ? mat(type.color, 0.45, 0.3) : null;
  const front = colored ?? { server: MATS.panel, switch: MATS.dark, firewall: MATS.red, patch: MATS.dark }[type.kind] ?? MATS.panel;
  g.add(box(FRONT_WIDTH - 0.04, h, DEVICE_DEPTH, colored ?? MATS.dark, 0, 0, -DEVICE_DEPTH / 2 - 0.004)); // Gehäuse
  g.add(box(FRONT_WIDTH, h, 0.006, front, 0, 0, -0.003)); // Frontplatte mit Ohren
  // Befestigungslöcher in den Ohren: je Höheneinheit zwei links und zwei rechts (oberes und unteres Loch des Rasters)
  for (let u = 0; u < type.units; u++) {
    for (const f of [HOLE_ROWS[0], HOLE_ROWS[2]]) {
      const y = (type.units / 2 - u - f) * UNIT;
      for (const x of [-FRONT_WIDTH / 2 + 0.01, FRONT_WIDTH / 2 - 0.01]) g.add(box(0.006, 0.006, 0.002, MATS.port, x, y, 0.0005));
    }
  }
  // Ports hinten: dunkle Öffnung mit hellem Rand
  for (const p of portPositions(type)) {
    g.add(box(0.014, 0.011, 0.004, MATS.portRim, p.x, p.y, BACK_Z - 0.0005), box(0.011, 0.008, 0.004, MATS.port, p.x, p.y, BACK_Z - 0.002));
  }
  if (type.kind === 'server') {
    // Laufwerksschächte links, Status-LED
    const bays = type.units >= 2 ? 4 : 2;
    for (let i = 0; i < bays; i++) {
      g.add(box(0.055, Math.min(h - 0.012, 0.03 * type.units), 0.004, MATS.steel, -FRONT_WIDTH / 2 + 0.06 + i * 0.062, 0, 0.002));
    }
    if (type.id === 'server-gpu') g.add(box(0.16, h * 0.55, 0.004, MATS.port, 0.02, h * 0.15, 0.002)); // Lüftungsgitter
    g.add(box(0.008, 0.008, 0.004, online ? MATS.ledGreen : MATS.ledRed, -FRONT_WIDTH / 2 + 0.02, h / 2 - 0.012, 0.003));
  } else if (type.kind === 'patch') {
    g.add(box(0.2, 0.008, 0.003, MATS.white, -0.1, h / 2 - 0.009, 0.002)); // Beschriftungsstreifen
  } else {
    const leds = type.kind === 'firewall' ? [MATS.ledGreen, MATS.ledAmber] : [MATS.ledGreen, MATS.ledGreen];
    leds.forEach((m, i) => g.add(box(0.006, 0.006, 0.004, m, -FRONT_WIDTH / 2 + 0.03 + i * 0.012, 0, 0.003)));
  }
  return g;
}

// Glastür vor dem Schrank: Rahmen, getönte Scheibe und Griff rechts. Ursprung am Scharnier (links vorn), die Tür
// liegt in +x; rotation.y < 0 schwenkt sie nach vorn auf.
function createRackDoor(H, shell) {
  const door = new THREE.Group();
  const frame = 0.025;
  const t = 0.018;
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x9fc4d8, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, clearcoat: 1, depthWrite: false,
  });
  const pane = box(RACK_WIDTH - 2 * frame, H - 2 * frame, 0.004, glass, RACK_WIDTH / 2, H / 2, 0);
  pane.castShadow = false;
  door.add(
    pane,
    box(frame, H, t, shell, frame / 2, H / 2, 0),
    box(frame, H, t, shell, RACK_WIDTH - frame / 2, H / 2, 0),
    box(RACK_WIDTH, frame, t, shell, RACK_WIDTH / 2, frame / 2, 0),
    box(RACK_WIDTH, frame, t, shell, RACK_WIDTH / 2, H - frame / 2, 0),
    box(0.012, 0.16, 0.025, MATS.steel, RACK_WIDTH - frame / 2, H * 0.55, t / 2 + 0.012),
  );
  return door;
}

// ---------- Kabelführung hinten: links und rechts eine senkrechte Leiste mit Clips, durch die die Kabel laufen ----------

const CLIP_X = RACK_WIDTH / 2 - 0.043;  // Mitte der Clips (±), zwischen hinterer Montageschiene und Seitenwand
const CLIP_SIZE = 0.02;                 // Innenmaß eines Clips

// z der Clipmitten (Schrankkoordinaten): an der Rückkante, bei kurzen Schränken knapp hinter den Ports der Geräte
const clipZ = (rackType) => Math.min(-rackDepth(rackType) / 2 + 0.017, rackDepth(rackType) / 2 - 0.055 + BACK_Z - 0.05);

// Clips je Seite (rackType.clipEvery: ein Clip alle so viele HE, Angabe aus dem Katalog) und Mitte eines Clips
// (Schrankkoordinaten); side −1/1 = −x/+x (von hinten gesehen rechts/links), index 0 = oberster Clip
export const clipCount = (rackType) => Math.ceil(rackType.units / (rackType.clipEvery ?? 2));
export function clipPosition(rackType, side, index) {
  const top = RACK_BASE + rackType.units * UNIT;
  return new THREE.Vector3(side * CLIP_X, top - (index * (rackType.clipEvery ?? 2) + 0.5) * UNIT, clipZ(rackType));
}

// Leisten mit offenen Clips (nach hinten offen, damit man Kabel einlegen kann), als eine Geometrie je Material
function createCableManagers(type, shell) {
  const top = RACK_BASE + type.units * UNIT;
  const z = clipZ(type);
  const D = rackDepth(type);
  const t = 0.004;
  const bars = [];
  const clips = [];
  for (const side of [-1, 1]) {
    const x = side * CLIP_X;
    const outer = x + side * (CLIP_SIZE / 2 + t / 2);
    // Leiste außen neben den Clips, oben und unten mit Winkeln an der Seitenwand
    bars.push(boxGeo(t, type.units * UNIT, 0.03, outer, RACK_BASE + type.units * UNIT / 2, z));
    for (const y of [RACK_BASE + 0.01, top - 0.01]) bars.push(boxGeo(0.012, 0.012, Math.abs(z + D / 2) + 0.03, side * (RACK_WIDTH / 2 - 0.036), y, (z - D / 2) / 2));
    for (let index = 0; index < clipCount(type); index++) {
      const y = clipPosition(type, side, index).y;
      const s = CLIP_SIZE;
      clips.push(
        boxGeo(t, 0.008, s + t, x - side * (s / 2 + t / 2), y, z),          // innen
        boxGeo(s + 2 * t, 0.008, t, x, y, z + s / 2 + t / 2),                // vorn
        boxGeo(s * 0.35, 0.008, t, outer - side * s * 0.175, y, z - s / 2 - t / 2), // hinten, halb offen
      );
    }
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mergeGeometries(bars), shell), new THREE.Mesh(mergeGeometries(clips), MATS.clip));
  return g;
}

function boxGeo(w, h, d, x, y, z) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

// Zufallszahlen 0…1, immer gleich für denselben Startwert (Kabel sollen beim Neuaufbau nicht springen)
function seededRandom(seed) {
  let t = Math.floor(seed) >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Verlauf eines Kabels von Port a nach Port b (Schrankkoordinaten) als Stützpunkte für eine weiche Kurve. Aus den
// Steckern geht es kurz gerade nach hinten. Ohne Clips hängt das Kabel frei durch; mit Clips ([{ side, index }], in
// dieser Reihenfolge) hängt es zum ersten Clip, läuft zwischen zwei Clips derselben Seite durch alle Clips dazwischen
// und hängt vom letzten zum anderen Port. lane verteilt mehrere Kabel im Clip und macht jedes ein wenig anders.
export function cableRoute(rackType, a, b, lane = 0, clips = []) {
  const rand = seededRandom(lane * 7919 + Math.round((a.y + b.y) * 1000) + 1);
  const jitter = (amount) => (rand() - 0.5) * 2 * amount;
  const v = (px, py, pz) => new THREE.Vector3(px, py, pz);
  const laneX = ((lane % 3) - 1) * 0.005;
  const laneZ = ((Math.floor(lane / 3) % 3) - 1) * 0.005;
  const inClip = (c) => clipPosition(rackType, c.side, c.index).add(v(laneX * c.side, 0, laneZ));
  const plug = (p) => v(p.x, p.y, p.z - 0.028);
  // Frei hängendes Stück von p nach q: in der Mitte nach unten und etwas nach hinten durchhängend
  const hang = (p, q) => {
    const span = p.distanceTo(q);
    const sag = 0.012 + span * 0.14 + jitter(0.006);
    return v((p.x + q.x) / 2 + jitter(0.01), (p.y + q.y) / 2 - sag, Math.min(p.z, q.z) - 0.015 - span * 0.05 + jitter(0.01));
  };

  const points = [a, plug(a)];
  if (!clips.length) {
    points.push(hang(plug(a), plug(b)));
  } else {
    let prev = plug(a);
    clips.forEach((c, i) => {
      const at = inClip(c);
      const last = clips[i - 1];
      if (last && last.side === c.side) {
        // In der Leiste: durch alle Clips zwischen beiden, dazwischen kleine Bögen
        const dir = Math.sign(c.index - last.index);
        for (let k = last.index + dir; dir && k !== c.index; k += dir) {
          const through = inClip({ side: c.side, index: k });
          points.push(v(prev.x + jitter(0.003), (prev.y + through.y) / 2, prev.z - 0.004 - rand() * 0.008));
          points.push(through.add(v(jitter(0.002), 0, jitter(0.002))));
          prev = through;
        }
        if (dir) points.push(v(prev.x + jitter(0.003), (prev.y + at.y) / 2, prev.z - 0.004 - rand() * 0.008));
      } else {
        points.push(hang(prev, at));
      }
      points.push(at);
      prev = at;
    });
    points.push(hang(prev, plug(b)));
  }
  points.push(plug(b), b);
  return points;
}

// Serverschrank: Seitenwände, Dach, Sockel, silberne Montageschienen, Kabelführung hinten und Glastür vorn; hinten offen
export function createServerRack(type) {
  const g = new THREE.Group();
  const H = rackHeight(type);
  const D = rackDepth(type);
  const shell = mat(type.color ?? 0x23262c, 0.55, 0.4);
  const side = 0.03;
  g.add(
    box(side, H, D, shell, -RACK_WIDTH / 2 + side / 2, H / 2, 0),
    box(side, H, D, shell, RACK_WIDTH / 2 - side / 2, H / 2, 0),
    box(RACK_WIDTH, RACK_TOP, D, shell, 0, H - RACK_TOP / 2, 0),
    box(RACK_WIDTH, RACK_BASE, D, shell, 0, RACK_BASE / 2, 0),
  );
  const railH = type.units * UNIT;
  for (const x of [-FRONT_WIDTH / 2 + 0.006, FRONT_WIDTH / 2 - 0.006]) {
    g.add(box(0.012, railH, 0.02, railMaterial(type.units), x, RACK_BASE + railH / 2, D / 2 - 0.072)); // knapp hinter den Frontplatten
  }
  // Hintere Schienen, damit der offene Rücken nicht leer aussieht
  for (const x of [-FRONT_WIDTH / 2 + 0.006, FRONT_WIDTH / 2 - 0.006]) {
    g.add(box(0.012, railH, 0.02, railMaterial(type.units), x, RACK_BASE + railH / 2, -D / 2 + 0.04));
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  g.add(createCableManagers(type, shell));
  const door = createRackDoor(H, shell);
  door.position.set(-RACK_WIDTH / 2, 0, D / 2 + 0.012);
  g.add(door);
  g.userData.door = door;
  return g;
}

// Wo die Frontplatte eines Geräts im Schrank sitzt (Schrankkoordinaten): oberste HE unit, units hoch
export function devicePlacement(rackType, unit, units) {
  const top = RACK_BASE + rackType.units * UNIT;
  return new THREE.Vector3(0, top - (unit + units / 2) * UNIT, rackDepth(rackType) / 2 - 0.055);
}

// Welche Höheneinheit auf Höhe y (Schrankkoordinaten) liegt, begrenzt auf den Schrank
export function unitAtHeight(rackType, y) {
  const top = RACK_BASE + rackType.units * UNIT;
  return Math.min(rackType.units - 1, Math.max(0, Math.floor((top - y) / UNIT)));
}

// Kabelrolle (Produktbild im Server-Shop): Spule aus Pappe mit blau aufgewickeltem Kabel, liegt flach
export function createCableRoll() {
  const g = new THREE.Group();
  const cardboard = mat(0xb08a5a, 0.85, 0);
  const cable = new THREE.MeshStandardMaterial({ color: CABLE_COLOR, roughness: 0.5 });
  const flange = new THREE.CylinderGeometry(0.11, 0.11, 0.006, 40);
  for (const y of [0.003, 0.077]) {
    const f = new THREE.Mesh(flange, cardboard);
    f.position.y = y;
    g.add(f);
  }
  const winding = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.068, 40), cable);
  winding.position.y = 0.04;
  g.add(winding);
  // Rillen der Wicklung und das lose Ende
  for (let i = 0; i < 6; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0955, 0.0028, 6, 40), cable);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.012 + i * 0.011;
    g.add(ring);
  }
  g.add(box(0.06, 0.006, 0.006, cable, 0.12, 0.04, 0), box(0.012, 0.01, 0.016, MATS.white, 0.155, 0.04, 0));
  return g;
}

// Modell für Karton und Vorschau (models/furniture.js): Schrank bzw. Gerät
export function createServerHardwareModel(type) {
  return type.kind === 'rack' ? createServerRack(type) : createServerDevice(type);
}
