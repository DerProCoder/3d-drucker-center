// 3D-Modelle der Server-Hardware (core/server-catalog.js): Serverschrank und Geräte für 19-Zoll-Schränke.
// Schrank: Ursprung Mitte unten, Vorderseite +z mit Glastür (Scharnier links, userData.door), hinten offen.
// Gerät: Ursprung Mitte der Frontplatte, Gehäuse nach hinten (−z). Die Ports sitzen auf der Rückseite;
// portPositions liefert ihre Lage (für die Kabel in world/server-room.js).
import * as THREE from 'three';
import { box, mat } from './mesh-helpers.js';
import { canvasTexture } from './canvas-texture.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createFan } from './server-fans.js';
import { STATUS_LED, chassisMaterial, deviceBackMaterial, deviceFrontMaterial, grilleMaterial } from './server-textures.js';

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

const glow = (color) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.5) });
const MATS = {
  steel: mat(0xa8adb4, 0.35, 0.8),
  dark: mat(0x1f2227, 0.5, 0.5),
  port: mat(0x0b0c0e, 0.8, 0.1),
  portRim: mat(0x9aa0a8, 0.4, 0.7),
  white: mat(0xe8e8e4, 0.6, 0.1),
  clip: mat(0x3a3f47, 0.6, 0.2),
  ledGreen: glow(0x2bd96b),
  ledRed: glow(0xff3b30),
};

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

// Gerät für den Schrank. online: Status-LED eines Servers grün (online) bzw. rot; die übrigen Leuchten sind aufgemalt
export function createServerDevice(type, { online = true } = {}) {
  const g = new THREE.Group();
  const h = type.units * UNIT - 0.002;
  const caseWidth = FRONT_WIDTH - 0.04;
  const ports = portPositions(type);
  // Gehäuse: Blech ringsum (Server mit eigener Farbe, z. B. System X gelb, ganz in dieser Farbe), Rückwand mit
  // Netzteilen, Karten und Lüftern; Frontplatte mit Ohren, Laufwerken usw. (Texturen aus models/server-textures.js)
  const zinc = type.kind === 'server' && !type.color;
  const sheet = chassisMaterial(type.color ?? (zinc ? 0x8a9098 : 0x2a2d32), !zinc);
  const backMaterial = deviceBackMaterial(type, caseWidth, h, UNIT, ports.map((p) => ({ x: caseWidth / 2 - p.x, y: h / 2 - p.y })));
  const body = new THREE.Mesh(new THREE.BoxGeometry(caseWidth, h, DEVICE_DEPTH), [sheet, sheet, sheet, sheet, sheet, backMaterial]);
  body.position.z = -DEVICE_DEPTH / 2 - 0.004;
  g.add(body);
  const frontMaterial = deviceFrontMaterial(type, FRONT_WIDTH, h, UNIT);
  g.add(box(FRONT_WIDTH, h, 0.006, frontMaterial, 0, 0, -0.003)); // Frontplatte mit Ohren
  // Drehende Lüfter genau dort, wo die Texturen Lüfter zeigen: vorn (GPU-Server) und hinten (Netzteile, Switch,
  // Firewall). userData.fans: die Rotoren, world/server-room.js dreht sie
  const fans = [];
  for (const f of frontMaterial.userData.fans ?? []) {
    const fan = createFan(f.r, { guard: f.guard !== false });
    fan.position.set(f.x - FRONT_WIDTH / 2, h / 2 - f.y, 0);
    g.add(fan);
    fans.push(fan.userData.rotor);
  }
  for (const f of backMaterial.userData.fans ?? []) {
    const fan = createFan(f.r);
    fan.position.set(caseWidth / 2 - f.x, h / 2 - f.y, BACK_Z);
    fan.rotation.y = Math.PI;
    g.add(fan);
    fans.push(fan.userData.rotor);
  }
  g.userData.fans = fans;
  // Lochgitter vor Lüftern ohne Drahtgitter (GPU-Server): Platte mit echten Löchern knapp vor den Rotoren
  for (const grille of frontMaterial.userData.grilles ?? []) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(grille.w, grille.h), grilleMaterial(grille));
    plate.position.set(grille.x + grille.w / 2 - FRONT_WIDTH / 2, h / 2 - grille.y - grille.h / 2, 0.0015);
    g.add(plate);
  }
  // Ports hinten: dunkle Öffnung mit hellem Rand
  for (const p of ports) {
    g.add(box(0.014, 0.011, 0.004, MATS.portRim, p.x, p.y, BACK_Z - 0.0005), box(0.011, 0.008, 0.004, MATS.port, p.x, p.y, BACK_Z - 0.002));
  }
  if (type.kind === 'server') {
    // Status-LED in ihrer Fassung im Bedienfeld
    const statusLed = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.003, 16), online ? MATS.ledGreen : MATS.ledRed);
    statusLed.rotation.x = Math.PI / 2;
    statusLed.position.set(-FRONT_WIDTH / 2 + STATUS_LED.x, h / 2 - STATUS_LED.y, 0.0012);
    g.add(statusLed);
    // Ab 2 HE: Tragegriffe vor den Ohren
    if (type.units >= 2) {
      const span = h - 0.03;
      for (const x of [-FRONT_WIDTH / 2 + 0.01, FRONT_WIDTH / 2 - 0.01]) {
        g.add(box(0.007, span, 0.006, MATS.steel, x, 0, 0.018));
        for (const y of [-span / 2 + 0.003, span / 2 - 0.003]) g.add(box(0.006, 0.006, 0.016, MATS.steel, x, y, 0.008));
      }
    }
  }
  return g;
}

// ---------- Schrankkorpus: Maße, Texturen und Materialien ----------

const ROOF = 0.025;        // Dachblech
const POST = 0.03;         // Eckpfosten (Breite in x); die Seitenwände sitzen innen bündig zwischen den Pfosten
const PANEL = 0.026;       // Seitenwand
const FOOT = 0.02;         // Stellfüße unter dem Sockel
const DOOR_BOTTOM = 0.03;  // Unterkante der Tür über dem Boden
const VENT_PITCH = 0.012;  // Lochabstand im Lochblech

// Lochblech: helle Kachel mit zwei versetzten Löchern, wird über die Schrankfarbe eingefärbt
let ventTexture = null;
function getVentTexture() {
  ventTexture ??= canvasTexture(32, 32, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#1a1c20';
    for (const [x, y] of [[8, 8], [24, 24]]) {
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ventTexture.wrapS = ventTexture.wrapT = THREE.RepeatWrapping;
  return ventTexture;
}

// HE-Nummerierung neben den vorderen Schienen: 1 oben, wie in der Anzeige im Spiel
const numberMats = new Map();
function numberMaterial(units) {
  if (numberMats.has(units)) return numberMats.get(units);
  const px = 32;
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.6,
    map: canvasTexture(px, units * px, (ctx, w, h) => {
      ctx.fillStyle = '#1b1d21';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#d8dce0';
      ctx.font = '700 17px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let u = 0; u < units; u++) {
        ctx.fillText(String(u + 1), w / 2, (u + 0.5) * px);
        ctx.fillRect(4, u * px, w - 8, 1); // Strich an der Grenze zweier HE
      }
    }, 1, 1, { wrap: false }),
  });
  numberMats.set(units, material);
  return material;
}

const GLASS = new THREE.MeshPhysicalMaterial({
  color: 0x9fc4d8, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, clearcoat: 1, depthWrite: false,
});

// Materialien je Schrankfarbe: Blech, dunklerer Rahmen und Lochblech
const rackMats = new Map();
function rackMaterials(color) {
  if (rackMats.has(color)) return rackMats.get(color);
  const materials = {
    shell: mat(color, 0.55, 0.4),
    frame: mat(new THREE.Color(color).multiplyScalar(0.6), 0.5, 0.5),
    vent: new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.4, map: getVentTexture() }),
  };
  rackMats.set(color, materials);
  return materials;
}

// Sammelt Geometrien je Material und fügt sie zu einem Mesh je Material zusammen (weniger Draw-Calls)
function meshBuilder() {
  const parts = new Map();
  return {
    add(material, ...geos) {
      if (!parts.has(material)) parts.set(material, []);
      parts.get(material).push(...geos);
    },
    build(group) {
      for (const [material, geos] of parts) group.add(new THREE.Mesh(mergeGeometries(geos), material));
    },
  };
}

// Zylinder entlang axis ('x', 'y' oder 'z')
function cylGeo(r, length, x, y, z, axis = 'y') {
  const geo = new THREE.CylinderGeometry(r, r, length, 20);
  if (axis === 'x') geo.rotateZ(Math.PI / 2);
  if (axis === 'z') geo.rotateX(Math.PI / 2);
  return geo.translate(x, y, z);
}

// Lochblech-Fläche w × h (zeigt nach +z), Texturkachel auf VENT_PITCH skaliert
function ventGeo(w, h) {
  const geo = new THREE.PlaneGeometry(w, h);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / VENT_PITCH, uv.getY(i) * h / VENT_PITCH);
  return geo;
}

// Glastür vor dem Schrank: Stahlrahmen mit Lochblech oben und unten, getönte Scheibe mit Dichtung, drei Scharniere
// links und Schwenkgriff mit Schloss rechts. Ursprung am Scharnier (links vorn), die Tür liegt in +x;
// rotation.y < 0 schwenkt sie nach vorn auf.
function createRackDoor(H, m) {
  const door = new THREE.Group();
  const parts = meshBuilder();
  const W = RACK_WIDTH;
  const t = 0.02;
  const side = 0.035;
  const bottom = 0.07; // deckt den Sockel ab
  const top = 0.055;   // deckt die oberen Querträger ab
  const y0 = DOOR_BOTTOM;
  const y1 = H - ROOF;
  const h = y1 - y0;
  parts.add(
    m.shell,
    boxGeo(side, h, t, side / 2, y0 + h / 2, 0),
    boxGeo(side, h, t, W - side / 2, y0 + h / 2, 0),
    boxGeo(W - 2 * side, bottom, t, W / 2, y0 + bottom / 2, 0),
    boxGeo(W - 2 * side, top, t, W / 2, y1 - top / 2, 0),
  );
  parts.add(
    m.vent,
    ventGeo(W - 2 * side - 0.03, bottom - 0.025).translate(W / 2, y0 + bottom / 2, t / 2 + 0.0005),
    ventGeo(W - 2 * side - 0.1, top - 0.02).translate(W / 2 - 0.035, y1 - top / 2, t / 2 + 0.0005),
  );
  // Gummidichtung als dunkle Kante rund um die Scheibe
  const gy0 = y0 + bottom;
  const gy1 = y1 - top;
  parts.add(
    MATS.port,
    boxGeo(0.004, gy1 - gy0, 0.002, side + 0.002, (gy0 + gy1) / 2, t / 2),
    boxGeo(0.004, gy1 - gy0, 0.002, W - side - 0.002, (gy0 + gy1) / 2, t / 2),
    boxGeo(W - 2 * side, 0.004, 0.002, W / 2, gy0 + 0.002, t / 2),
    boxGeo(W - 2 * side, 0.004, 0.002, W / 2, gy1 - 0.002, t / 2),
  );
  // Scharniere
  for (const f of [0.1, 0.5, 0.9]) parts.add(MATS.steel, cylGeo(0.007, 0.05, -0.004, y0 + f * h, 0));
  // Schwenkgriff: Griffmulde, Hebel mit Lager oben, Schließzylinder darüber
  const hx = W - side / 2;
  const hy = y0 + h * 0.5;
  parts.add(MATS.dark, boxGeo(0.026, 0.17, 0.006, hx, hy, t / 2 + 0.003), boxGeo(0.012, 0.014, 0.01, hx, hy + 0.035, t / 2 + 0.008));
  parts.add(MATS.steel, boxGeo(0.015, 0.11, 0.008, hx, hy - 0.012, t / 2 + 0.016), cylGeo(0.0075, 0.006, hx, hy + 0.065, t / 2 + 0.008, 'z'));
  parts.add(MATS.port, boxGeo(0.002, 0.007, 0.001, hx, hy + 0.065, t / 2 + 0.0112));
  // Typenschild oben rechts
  parts.add(MATS.steel, boxGeo(0.06, 0.02, 0.002, W - side - 0.04, y1 - top / 2, t / 2 + 0.001));
  parts.build(door);

  const pane = new THREE.Mesh(new THREE.BoxGeometry(W - 2 * side + 0.01, gy1 - gy0 + 0.01, 0.005), GLASS);
  pane.position.set(W / 2, (gy0 + gy1) / 2, 0);
  door.add(pane);
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

// Serverschrank: Rahmen aus Eckpfosten und Querträgern, Sockel mit Stellfüßen, Seitenwände mit Griffmulden und
// Schloss, Dach mit Lüftern, Lochblech, Kabeleinführung und Kranösen, silberne Montageschienen mit HE-Nummern,
// Kabelführung hinten und Glastür vorn; hinten offen
export function createServerRack(type) {
  const g = new THREE.Group();
  const H = rackHeight(type);
  const D = rackDepth(type);
  const m = rackMaterials(type.color ?? 0x23262c);
  const parts = meshBuilder();
  const halfW = RACK_WIDTH / 2;
  const top = H - ROOF;

  // Sockel etwas eingerückt auf vier Stellfüßen
  parts.add(m.frame, boxGeo(RACK_WIDTH - 0.02, RACK_BASE - FOOT, D - 0.02, 0, (RACK_BASE + FOOT) / 2, 0));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.add(MATS.dark, cylGeo(0.018, FOOT, sx * (halfW - 0.04), FOOT / 2, sz * (D / 2 - 0.045)));
    }
  }

  // Rahmen: vier Eckpfosten, oben vorn und hinten ein Querträger
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.add(m.frame, boxGeo(POST, top - RACK_BASE, 0.04, sx * (halfW - POST / 2), (RACK_BASE + top) / 2, sz * (D / 2 - 0.02)));
    }
  }
  for (const sz of [-1, 1]) parts.add(m.frame, boxGeo(RACK_WIDTH - 2 * POST, 0.045, 0.04, 0, top - 0.0225, sz * (D / 2 - 0.02)));

  // Seitenwände zwischen den Pfosten (innen bündig, außen etwas zurückgesetzt). Hohe Schränke haben je Seite zwei
  // Wände übereinander, jede mit Griffmulde oben und unten und einem Schloss.
  const panelH = top - RACK_BASE;
  const panelD = D - 0.08;
  const panels = type.units > 24 ? 2 : 1;
  for (const sx of [-1, 1]) {
    const outer = sx * (halfW - POST + PANEL);
    parts.add(m.shell, boxGeo(PANEL, panelH, panelD, sx * (halfW - POST + PANEL / 2), RACK_BASE + panelH / 2, 0));
    for (let p = 0; p < panels; p++) {
      const py = RACK_BASE + p * panelH / panels;
      const ph = panelH / panels;
      for (const f of [0.12, 0.88]) parts.add(MATS.port, boxGeo(0.004, 0.03, 0.12, outer, py + f * ph, 0));
      parts.add(MATS.steel, cylGeo(0.011, 0.006, outer + sx * 0.002, py + 0.88 * ph, 0.1, 'x'));
      if (p > 0) parts.add(MATS.port, boxGeo(0.003, 0.004, panelD, outer, py, 0)); // Fuge zwischen zwei Wänden
    }
  }

  // Dach: Lochblech mit zwei Lüftern, hinten die Kabeleinführung mit Bürstenleiste, an den Ecken Kranösen
  parts.add(m.shell, boxGeo(RACK_WIDTH, ROOF, D, 0, H - ROOF / 2, 0));
  const ventD = D - 0.22;
  parts.add(m.vent, ventGeo(0.4, ventD).rotateX(-Math.PI / 2).translate(0, H + 0.0005, 0.02));
  // Lüfter: oben zwei im Dach (Abluft), unten zwei auf dem Sockel im Schrank (Zuluft); userData.fans: { top, bottom }
  // mit den Rotoren, world/server-room.js dreht sie
  const fans = { top: [], bottom: [] };
  for (const sz of [-1, 1]) {
    for (const [which, y, z] of [['top', H + 0.0005, 0.02 + sz * ventD / 4], ['bottom', RACK_BASE + 0.0005, sz * D * 0.2]]) {
      const fan = createFan(which === 'top' ? 0.065 : 0.06);
      fan.rotation.x = -Math.PI / 2;
      fan.position.set(0, y, z);
      g.add(fan);
      fans[which].push(fan.userData.rotor);
    }
  }
  g.userData.fans = fans;
  parts.add(MATS.port, boxGeo(0.36, 0.006, 0.03, 0, H + 0.003, -D / 2 + 0.05));
  parts.add(MATS.steel, boxGeo(0.38, 0.003, 0.04, 0, H + 0.0015, -D / 2 + 0.05));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const ex = sx * (halfW - 0.05);
      const ez = sz * (D / 2 - 0.05);
      parts.add(MATS.steel, new THREE.TorusGeometry(0.012, 0.0035, 8, 20).translate(ex, H + 0.021, ez), cylGeo(0.01, 0.006, ex, H + 0.003, ez));
    }
  }

  // Montageschienen vorn (knapp hinter den Frontplatten) und hinten, damit der offene Rücken nicht leer aussieht.
  // Vorn verbindet ein Profil die Schiene mit der Seitenwand, darauf die HE-Nummern.
  const railH = type.units * UNIT;
  const railY = RACK_BASE + railH / 2;
  const profileW = halfW - POST - FRONT_WIDTH / 2;
  for (const sx of [-1, 1]) {
    const x = sx * (FRONT_WIDTH / 2 - 0.006);
    parts.add(railMaterial(type.units), boxGeo(0.012, railH, 0.02, x, railY, D / 2 - 0.072), boxGeo(0.012, railH, 0.02, x, railY, -D / 2 + 0.04));
    const px = sx * (FRONT_WIDTH / 2 + profileW / 2);
    parts.add(m.frame, boxGeo(profileW, railH, 0.004, px, railY, D / 2 - 0.064));
    parts.add(numberMaterial(type.units), new THREE.PlaneGeometry(0.014, railH).translate(px, railY, D / 2 - 0.0615));
  }

  parts.build(g);
  g.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  g.add(createCableManagers(type, m.shell));
  const door = createRackDoor(H, m);
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
