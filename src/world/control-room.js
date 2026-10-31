// Raum bei −10,5 m (Ausbau „Raum bei −10,5 m“, core/upgrades.js): 14 × 10 m groß und 3,5 m hoch, östlich am
// Kellertreppenhaus (STAIRWELL in world/basement.js). Hinein geht es durch eine Tür in der Ostwand des Treppenhauses
// auf dem Stockwerkspodest bei −10,5 m und – mit Keller-Fahrstuhl – durch einen Vorraum vom Fahrstuhl aus.
// Vorne (Westen, an der Tür) liegt der Leitstand (8 m, Platz für Bildschirmwand und Pult, #58), hinten hinter einer
// Glaswand mit Tür der Technikraum (6 m, Warnstreifen-Boden, Kabelkanäle, feste Plätze für Akkus und Generator, #59).
//
// world/basement.js legt den Raum an, baut ihn nach der Lieferung (build), reicht footing/Kollision weiter und leiht
// ihm im Raum die Deckenspots des Kellers (lightPoints) – eigene Lichter gibt es keine, damit sich die Zahl der Lichter
// nie ändert (sonst übersetzt three.js alle Shader neu). Gezeichnet wird der Raum nur, wenn die Kamera ungefähr auf
// seiner Höhe ist (update).
//
// Für spätere Einrichtung (#58, #59): Objekte in die Gruppen leitstand bzw. technik hängen (werden mit dem Raum
// ein- und ausgeblendet und sind anklickbar, weil sie unter basement.group hängen), Positionen aus anchors nehmen,
// Hindernisse mit collision.setDynamic(key, [{ …, level: CONTROL_LEVEL }]) oder addCollider({ minX, maxX, minZ, maxZ })
// eintragen. Leitstand (#58): world/control-wall.js hängt Bildschirmwand und Pult in leitstand; isInside(p) sagt, ob
// die Kamera im Raum ist (nur dann malen die Bildschirme neu).
import * as THREE from 'three';
import { WALL_THICKNESS } from './room.js';
import { box, cylinder } from '../models/mesh-helpers.js';
import { canvasTexture } from '../models/canvas-texture.js';
import { mergeStatic } from '../models/merge-static.js';

const T = WALL_THICKNESS;
export const CONTROL_LEVEL = -3; // Stockwerk der Spielfigur im Raum (Kollision, siehe world/collision.js)

// Innenmaße (Welt): Westwand ist die Ostwand des Treppenhauses (x −4,8 … −4,6), Nordwand fluchtet mit dessen Nordwand
export const CONTROL_ROOM = {
  x0: -4.6, x1: 9.4, z0: -10, z1: 0,
  y: -10.5,          // Boden (drittes Stockwerkspodest des Treppenhauses)
  height: 3.5,
  glassX: 3.4,       // Glaswand: Leitstand x0 … glassX (8 m), Technikraum glassX … x1 (6 m)
  wallX: -4.8,       // Außenseite der Westwand (= STAIRWELL.x1)
  // Tür in der Ostwand des Treppenhauses; die Tiefenanzeige des Podests rückt nach signZ (neben die Tür)
  stairDoor: { z0: -9.9, z1: -8.7, h: 2.2, signZ: -8.15 },
  glassDoor: { z0: -5.6, z1: -4.4, h: 2.2 },
};
// Vorraum vom Keller-Fahrstuhl (Tür bei x −8,6, so breit wie sein Schacht BASEMENT_ELEVATOR) bis in den Leitstand
export const VESTIBULE = { x0: -8.6, x1: CONTROL_ROOM.x0, z0: -7.4, z1: -5.6 };

const R = CONTROL_ROOM;
const FLOOR_Y = R.y;
const CEIL_Y = R.y + R.height;
const DOOR_SWITCH_X = R.wallX + T / 2; // Mitte der Tür: hier wechselt die Figur zwischen Treppenhaus und Raum
const VISIBLE_BELOW = 1.5;             // so weit unter dem Boden (Kamera) wird der Raum noch gezeichnet
const VISIBLE_ABOVE = R.height + 0.2;  // … und so weit darüber (letzter Treppenlauf von oben)

// Feste Plätze für die Einrichtung (Boden = FLOOR_Y). rotY: Drehung eines Modells, dessen Vorderseite nach +z zeigt.
export const CONTROL_ANCHORS = {
  // Bildschirmwand an der Südwand des Leitstands, Bildschirme schauen nach Norden (−z)
  screenWall: { x: -0.6, y: FLOOR_Y + 1.9, z: R.z1 - 0.02, rotY: Math.PI, width: 7, height: 2.4 },
  // Pult davor in der Mitte des Leitstands, man sitzt nördlich davon und schaut zur Bildschirmwand
  desk: { x: -0.6, y: FLOOR_Y, z: -3.4, rotY: Math.PI, width: 3.2, depth: 1.2 },
  // 6 Batterieschränke an der Ostwand des Technikraums (Vorderseite nach Westen), je 0,9 m breit und 0,6 m tief
  batterySlots: Array.from({ length: 6 }, (_, i) => ({ x: R.x1 - 0.35, y: FLOOR_Y, z: -9.35 + i * 0.95, rotY: -Math.PI / 2, width: 0.9, depth: 0.6 })),
  // Dieselgenerator an der Südwand des Technikraums (Vorderseite nach Norden), Auspuff an der Wand hoch zur Decke
  generatorSlot: { x: 6.6, y: FLOOR_Y, z: R.z1 - 0.75, rotY: Math.PI, width: 2.6, depth: 1.2 },
};

// Gelb-schwarze Warnstreifen (Textur wird je Fläche über die UVs wiederholt)
function hazardMaterial() {
  const texture = canvasTexture(128, 32, (ctx, w, h) => {
    ctx.fillStyle = '#e8b416';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1c1c1c';
    for (let x = -h; x < w + h; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + 16, h);
      ctx.lineTo(x + 16 + h, 0);
      ctx.lineTo(x + h, 0);
      ctx.fill();
    }
  }, 1, 1, { anisotropy: 4 });
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6 });
}

// Materialien entstehen gleich beim Anlegen (nicht erst nach dem Kauf); Wand, Beton, Metall … teilt sich der Raum mit
// dem Treppenhaus (base: Materialien aus world/basement.js)
function createMaterials(base) {
  return {
    ...base,
    techFloor: new THREE.MeshStandardMaterial({ color: 0x6f747c, roughness: 0.55 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0xbdbcb6, roughness: 0.95 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xa9d2e3, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false }),
    frame: new THREE.MeshStandardMaterial({ color: 0x5b636d, roughness: 0.45, metalness: 0.6 }),
    hazard: hazardMaterial(),
    pipeGrey: new THREE.MeshStandardMaterial({ color: 0x8c9096, roughness: 0.4, metalness: 0.6 }),
    pipeRed: new THREE.MeshStandardMaterial({ color: 0xb3322b, roughness: 0.5, metalness: 0.2 }),
    pipeBlue: new THREE.MeshStandardMaterial({ color: 0x2f6f9f, roughness: 0.5, metalness: 0.2 }),
    tray: new THREE.MeshStandardMaterial({ color: 0xa6abb2, roughness: 0.35, metalness: 0.7 }),
    cable: new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.8 }),
    cableGreen: new THREE.MeshStandardMaterial({ color: 0x3f8a4a, roughness: 0.8 }),
  };
}

// Waagrechter Streifen auf dem Boden (Warnstreifen), Länge len entlang x (alongX) oder z; die Textur wiederholt sich
// alle 0,5 m
function floorBand(material, x, z, len, width, alongX) {
  const geo = new THREE.PlaneGeometry(alongX ? len : width, alongX ? width : len);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    if (alongX) uv.setXY(i, uv.getX(i) * (len / 0.5), uv.getY(i));
    else uv.setXY(i, uv.getY(i) * (len / 0.5), uv.getX(i));
  }
  const mesh = new THREE.Mesh(geo, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, FLOOR_Y + 0.004, z);
  return mesh;
}

// Rahmen aus Warnstreifen um eine Stellfläche (Mitte x/z, Größe w × d in x/z)
function hazardFrame(material, x, z, w, d, band = 0.1) {
  return [
    floorBand(material, x, z - d / 2 + band / 2, w, band, true),
    floorBand(material, x, z + d / 2 - band / 2, w, band, true),
    floorBand(material, x - w / 2 + band / 2, z, d - 2 * band, band, false),
    floorBand(material, x + w / 2 - band / 2, z, d - 2 * band, band, false),
  ];
}

// Rohr entlang x von xa bis xb auf Höhe y bei z
function pipeX(material, xa, xb, y, z, r) {
  const pipe = cylinder(r, r, xb - xa, 10, material, (xa + xb) / 2, y, z);
  pipe.rotation.z = Math.PI / 2;
  return pipe;
}

// Deckenleuchte (Gehäuse und leuchtende Fläche), lang in x-Richtung
function ceilingLamp(m, x, z) {
  return [
    box(1.2, 0.06, 0.26, m.housing, x, CEIL_Y - 0.03, z),
    box(1.16, 0.02, 0.22, m.lamp, x, CEIL_Y - 0.07, z),
  ];
}

// Kabelkanal entlang x (unter der Decke): Boden, zwei Seitenwangen, Kabelbündel, Abhänger
function cableTrayX(m, xa, xb, z, y) {
  const len = xb - xa;
  const xc = (xa + xb) / 2;
  const parts = [
    box(len, 0.01, 0.3, m.tray, xc, y, z),
    box(len, 0.08, 0.01, m.tray, xc, y + 0.04, z - 0.15),
    box(len, 0.08, 0.01, m.tray, xc, y + 0.04, z + 0.15),
    box(len, 0.045, 0.12, m.cable, xc, y + 0.028, z - 0.05),
    box(len, 0.04, 0.08, m.cableGreen, xc, y + 0.025, z + 0.07),
  ];
  for (let x = xa + 0.4; x < xb; x += 1.5) {
    parts.push(box(0.02, CEIL_Y - y, 0.02, m.tray, x, (CEIL_Y + y) / 2, z - 0.16), box(0.02, CEIL_Y - y, 0.02, m.tray, x, (CEIL_Y + y) / 2, z + 0.16));
  }
  return parts;
}

// Kabelkanal entlang z
function cableTrayZ(m, za, zb, x, y) {
  const len = zb - za;
  const zc = (za + zb) / 2;
  return [
    box(0.3, 0.01, len, m.tray, x, y, zc),
    box(0.01, 0.08, len, m.tray, x - 0.15, y + 0.04, zc),
    box(0.01, 0.08, len, m.tray, x + 0.15, y + 0.04, zc),
    box(0.12, 0.045, len, m.cable, x - 0.05, y + 0.028, zc),
    box(0.02, CEIL_Y - y, 0.02, m.tray, x, (CEIL_Y + y) / 2, za + 0.3),
    box(0.02, CEIL_Y - y, 0.02, m.tray, x, (CEIL_Y + y) / 2, zb - 0.3),
  ];
}

// Hülle des Raums: Boden, Decke, Wände (mit Türöffnungen), Vorraum
function createShell(m) {
  const g = new THREE.Group();
  const H = R.height;
  const yc = FLOOR_Y + H / 2;
  const w = R.x1 - R.x0;
  const d = R.z1 - R.z0;
  const xc = (R.x0 + R.x1) / 2;
  const zc = (R.z0 + R.z1) / 2;
  const leit = R.glassX - R.x0;
  const tech = R.x1 - R.glassX;
  // Böden: Beton im Leitstand, dunklerer beschichteter Boden im Technikraum, Vorraum
  g.add(box(leit + T, 0.2, d, m.concrete, R.wallX + (leit + T) / 2, FLOOR_Y - 0.1, zc)); // bis unter die Türen
  g.add(box(tech, 0.2, d, m.techFloor, R.glassX + tech / 2, FLOOR_Y - 0.1, zc));
  const V = VESTIBULE;
  g.add(box(V.x1 - V.x0 + T, 0.2, V.z1 - V.z0, m.concrete, (V.x0 + V.x1 - T) / 2, FLOOR_Y - 0.1, (V.z0 + V.z1) / 2));
  // Decken
  g.add(box(w + 2 * T, 0.2, d + 2 * T, m.ceiling, xc, CEIL_Y + 0.1, zc));
  g.add(box(V.x1 - V.x0, 0.2, V.z1 - V.z0, m.ceiling, (V.x0 + V.x1) / 2, CEIL_Y + 0.1, (V.z0 + V.z1) / 2));
  // Nord-, Ost- und Südwand
  g.add(box(w + 2 * T, H, T, m.wall, xc, yc, R.z0 - T / 2));
  g.add(box(T, H, d + 2 * T, m.wall, R.x1 + T / 2, yc, zc));
  g.add(box(w + 2 * T, H, T, m.wall, xc, yc, R.z1 + T / 2));
  // Westwand südlich des Treppenhauses (dessen Ostwand reicht bis z = V.z0) mit Öffnung zum Vorraum
  const wx = R.x0 - T / 2;
  g.add(box(T, H, R.z1 + T - V.z1, m.wall, wx, yc, (V.z1 + R.z1 + T) / 2));
  g.add(box(T, H - 2.4, V.z1 - V.z0, m.wall, wx, FLOOR_Y + 2.4 + (H - 2.4) / 2, (V.z0 + V.z1) / 2));
  // Vorraum: Südwand (die Nordwand ist die Südwand des Treppenhauses)
  g.add(box(V.x1 - V.x0 - T, H, T, m.wall, (V.x0 + V.x1 - T) / 2, yc, V.z1 + T / 2));
  // Blauer Orientierungsstreifen wie im Treppenhaus (Leitstand und Vorraum)
  g.add(box(leit, 0.12, 0.012, m.stripe, R.x0 + leit / 2, FLOOR_Y + 1.2, R.z0 + 0.006));
  g.add(box(leit, 0.12, 0.012, m.stripe, R.x0 + leit / 2, FLOOR_Y + 1.2, R.z1 - 0.006));
  g.add(box(V.x1 - V.x0 - T, 0.12, 0.012, m.stripe, (V.x0 + V.x1 - T) / 2, FLOOR_Y + 1.2, V.z1 - 0.006));
  // Türrahmen der Treppenhaustür (beidseitig) und der Vorraum-Öffnung
  const sd = R.stairDoor;
  const sdc = (sd.z0 + sd.z1) / 2;
  for (const z of [sd.z0 + 0.03, sd.z1 - 0.03]) g.add(box(T + 0.06, sd.h, 0.06, m.frame, R.wallX + T / 2, FLOOR_Y + sd.h / 2, z));
  g.add(box(T + 0.06, 0.06, sd.z1 - sd.z0, m.frame, R.wallX + T / 2, FLOOR_Y + sd.h - 0.03, sdc));
  g.add(box(T + 0.02, 0.01, sd.z1 - sd.z0, m.nosing, R.wallX + T / 2, FLOOR_Y + 0.005, sdc)); // Schwelle
  for (const z of [V.z0 + 0.03, V.z1 - 0.03]) g.add(box(T + 0.06, 2.4, 0.06, m.frame, wx, FLOOR_Y + 1.2, z));
  g.add(box(T + 0.06, 0.06, V.z1 - V.z0, m.frame, wx, FLOOR_Y + 2.37, (V.z0 + V.z1) / 2));
  return g;
}

// Glaswand zwischen Leitstand und Technikraum: Scheiben, Pfosten, Riegel oben und unten, Türöffnung mit Rahmen
function createGlassWall(m) {
  const g = new THREE.Group();
  const x = R.glassX;
  const gd = R.glassDoor;
  const H = R.height;
  const pane = (za, zb) => {
    g.add(box(0.02, H - 0.1, zb - za, m.glass, x, FLOOR_Y + 0.05 + (H - 0.1) / 2, (za + zb) / 2));
    // Pfosten etwa alle 1,1 m
    const n = Math.max(1, Math.round((zb - za) / 1.1));
    for (let i = 0; i <= n; i++) g.add(box(0.06, H, 0.05, m.frame, x, FLOOR_Y + H / 2, za + ((zb - za) * i) / n));
    g.add(box(0.07, 0.08, zb - za, m.frame, x, FLOOR_Y + 0.04, (za + zb) / 2));
    g.add(box(0.07, 0.06, zb - za, m.frame, x, CEIL_Y - 0.03, (za + zb) / 2));
    g.add(box(0.07, 0.04, zb - za, m.frame, x, FLOOR_Y + 1.05, (za + zb) / 2)); // Querriegel in Hüfthöhe
  };
  pane(R.z0, gd.z0);
  pane(gd.z1, R.z1);
  // Über der Tür: Glas bis zur Decke, Türrahmen
  g.add(box(0.02, H - gd.h, gd.z1 - gd.z0, m.glass, x, FLOOR_Y + gd.h + (H - gd.h) / 2, (gd.z0 + gd.z1) / 2));
  g.add(box(0.08, 0.07, gd.z1 - gd.z0, m.frame, x, FLOOR_Y + gd.h, (gd.z0 + gd.z1) / 2));
  // Aufgeschobener Türflügel (Glas) neben der Öffnung im Technikraum
  g.add(box(0.02, gd.h - 0.1, gd.z1 - gd.z0 - 0.05, m.glass, x + 0.07, FLOOR_Y + 0.05 + (gd.h - 0.1) / 2, gd.z1 + (gd.z1 - gd.z0) / 2));
  g.add(box(0.03, 0.3, 0.025, m.frame, x + 0.09, FLOOR_Y + 1.05, gd.z1 + 0.08)); // Griff
  return g;
}

// Decke: Leuchten, Rohre (über die ganze Länge an der Nordwand), Kabelkanäle im Technikraum
function createCeiling(m) {
  const g = new THREE.Group();
  // Leuchten: Leitstand 2 Reihen × 3, Technikraum 2 Reihen × 2
  for (const z of [-7.2, -2.8]) {
    for (const x of [-2.6, -0.2, 2.2]) g.add(...ceilingLamp(m, x, z));
    for (const x of [5.2, 7.8]) g.add(...ceilingLamp(m, x, z));
  }
  g.add(...ceilingLamp(m, (VESTIBULE.x0 + VESTIBULE.x1) / 2, (VESTIBULE.z0 + VESTIBULE.z1) / 2));
  // Rohre an der Nordwand entlang (Lüftung grau, Sprinkler rot, Kühlwasser blau) mit Schellen
  const xa = R.x0;
  const xb = R.x1;
  g.add(pipeX(m.pipeGrey, xa, xb, CEIL_Y - 0.22, R.z0 + 0.3, 0.12));
  g.add(pipeX(m.pipeRed, xa, xb, CEIL_Y - 0.14, R.z0 + 0.62, 0.045));
  g.add(pipeX(m.pipeBlue, xa, xb, CEIL_Y - 0.14, R.z0 + 0.78, 0.045));
  for (let x = xa + 0.6; x < xb; x += 2) {
    g.add(box(0.04, 0.12, 0.7, m.metal, x, CEIL_Y - 0.06, R.z0 + 0.5));
  }
  // Sprinklerköpfe an einer Stichleitung quer durch den Raum
  for (const x of [-1.4, 6.4]) {
    const branch = cylinder(0.025, 0.025, 8.2, 8, m.pipeRed, x, CEIL_Y - 0.14, R.z0 + 0.62 + 4.1);
    branch.rotation.x = Math.PI / 2;
    g.add(branch);
    for (let z = -7.5; z < -0.5; z += 2.5) g.add(cylinder(0.03, 0.015, 0.08, 8, m.metal, x, CEIL_Y - 0.2, z));
  }
  // Kabelkanäle im Technikraum (längs über den Akkus und dem Generator, quer zur Glaswand) und weiter in den
  // Leitstand bis über die Bildschirmwand
  const ty = CEIL_Y - 0.42;
  g.add(...cableTrayZ(m, R.z0 + 1.1, R.z1 - 0.3, R.x1 - 0.5, ty));
  g.add(...cableTrayX(m, R.glassX + 0.1, R.x1 - 0.65, -5.0, ty));
  g.add(...cableTrayX(m, R.glassX + 0.1, R.x1 - 0.65, -1.6, ty));
  g.add(...cableTrayX(m, -3.8, R.glassX - 0.1, -1.6, ty));
  return g;
}

// Technikraum: Warnstreifen vor der Glaswand und um die Stellflächen für Akkus und Generator
function createTechFloor(m) {
  const g = new THREE.Group();
  const hz = m.hazard;
  // Band an der Glaswand entlang (Technikseite), mit Lücke für die Tür
  const gd = R.glassDoor;
  g.add(floorBand(hz, R.glassX + 0.15, (R.z0 + gd.z0) / 2, gd.z0 - R.z0, 0.2, false));
  g.add(floorBand(hz, R.glassX + 0.15, (gd.z1 + R.z1) / 2, R.z1 - gd.z1, 0.2, false));
  // Stellfläche der Batterieschränke (alle 6) und des Generators
  const slots = CONTROL_ANCHORS.batterySlots;
  const bz0 = slots[0].z - slots[0].width / 2 - 0.1;
  const bz1 = slots[slots.length - 1].z + slots[0].width / 2 + 0.1;
  g.add(...hazardFrame(hz, R.x1 - 0.45, (bz0 + bz1) / 2, 0.9, bz1 - bz0));
  const gen = CONTROL_ANCHORS.generatorSlot;
  g.add(...hazardFrame(hz, gen.x, gen.z - 0.05, gen.width + 0.4, gen.depth + 0.4));
  return g;
}

// m: Materialien aus world/basement.js (Beton, Wand, Metall …) · createSign(big, small, w, h): beleuchtetes Schild
// wie im Treppenhaus · collision: Kollision der Spielfigur
export function createControlRoom({ materials, createSign, collision }) {
  const group = new THREE.Group(); // Raum samt Einrichtung, blendet sich in update selbst aus
  group.name = 'control-room';
  group.visible = false;
  const leitstand = new THREE.Group(); // für #58: Bildschirmwand, Pult
  leitstand.name = 'leitstand';
  const technik = new THREE.Group();   // für #59: Batterieschränke, Generator
  technik.name = 'technikraum';
  group.add(leitstand, technik);
  const m = createMaterials(materials);
  let built = false;
  let endWall = null; // Abschluss des Vorraums, solange dort kein Fahrstuhl hält
  const extraColliders = []; // Einrichtung (#58 Pult, #59 Schränke): addCollider

  function colliders() {
    const V = VESTIBULE;
    const sd = R.stairDoor;
    const level = CONTROL_LEVEL;
    const wx0 = R.wallX;
    const wx1 = R.x0;
    return [
      // Westwand: am Treppenhaus mit Tür, dann Südwand des Treppenhauses = Nordwand des Vorraums, südlich davon
      { minX: wx0, maxX: wx1, minZ: R.z0 - T, maxZ: sd.z0, level },
      { minX: wx0, maxX: wx1, minZ: sd.z1, maxZ: V.z0, level },
      { minX: V.x0 - 0.2, maxX: wx1, minZ: V.z0 - T, maxZ: V.z0, level },
      { minX: wx0, maxX: wx1, minZ: V.z1, maxZ: R.z1 + T, level },
      // Vorraum: Südwand und Westende (Fahrstuhlschacht bzw. Wand)
      { minX: V.x0 - 0.2, maxX: wx1, minZ: V.z1, maxZ: V.z1 + T, level },
      { minX: V.x0 - 0.2, maxX: V.x0, minZ: V.z0 - T, maxZ: V.z1 + T, level },
      // Nord-, Ost- und Südwand
      { minX: wx0, maxX: R.x1 + T, minZ: R.z0 - T, maxZ: R.z0, level },
      { minX: R.x1, maxX: R.x1 + T, minZ: R.z0 - T, maxZ: R.z1 + T, level },
      { minX: wx0, maxX: R.x1 + T, minZ: R.z1, maxZ: R.z1 + T, level },
      // Glaswand mit Tür
      { minX: R.glassX - 0.04, maxX: R.glassX + 0.04, minZ: R.z0, maxZ: R.glassDoor.z0, level },
      { minX: R.glassX - 0.04, maxX: R.glassX + 0.12, minZ: R.glassDoor.z1, maxZ: R.z1, level },
      ...extraColliders,
    ];
  }

  // Nach der Lieferung bauen (auch beim Laden eines Spielstands)
  function build() {
    if (built) return;
    built = true;
    const g = new THREE.Group();
    g.add(createShell(m), createGlassWall(m), createCeiling(m), createTechFloor(m));
    // Schilder: Tiefe im Leitstand neben der Tür, über der Tür zum Treppenhaus, über der Glastür
    const depth = createSign('−10,5 m', 'LEITSTAND · TECHNIK', 0.9, 0.45);
    depth.position.set(R.x0 + 1.2, FLOOR_Y + 1.75, R.z0 + 0.012);
    g.add(depth);
    const sd = R.stairDoor;
    const toRoom = createSign('LEITSTAND ▶', 'Raum −10,5 m', 0.6, 0.22);
    toRoom.rotation.y = -Math.PI / 2;
    toRoom.position.set(R.wallX - 0.012, FLOOR_Y + sd.h + 0.3, (sd.z0 + sd.z1) / 2);
    g.add(toRoom);
    const toStairs = createSign('◀ TREPPENHAUS', 'Halle ↑ · Keller ↓', 0.6, 0.22);
    toStairs.rotation.y = Math.PI / 2;
    toStairs.position.set(R.x0 + 0.012, FLOOR_Y + sd.h + 0.3, (sd.z0 + sd.z1) / 2);
    g.add(toStairs);
    const tech = createSign('TECHNIKRAUM', 'Notstrom · Akkus', 0.7, 0.26);
    tech.rotation.y = -Math.PI / 2;
    tech.position.set(R.glassX - 0.04, FLOOR_Y + R.glassDoor.h + 0.32, (R.glassDoor.z0 + R.glassDoor.z1) / 2);
    g.add(tech);
    g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    // Wand am Westende des Vorraums – verschwindet, sobald dort der Keller-Fahrstuhl hält (setElevator)
    const V = VESTIBULE;
    endWall = box(0.02, R.height, V.z1 - V.z0, m.wall, V.x0 - 0.01, FLOOR_Y + R.height / 2, (V.z0 + V.z1) / 2);
    g.userData.endWall = endWall; // eigenes Mesh (mergeStatic fasst es nicht mit den Wänden zusammen)
    g.add(endWall);
    group.add(mergeStatic(g));
    collision.setDynamic('control-room', colliders());
  }

  // Hindernis der Einrichtung (Welt-x/z, { minX, maxX, minZ, maxZ }) – gilt auf dem Stockwerk des Raums, sobald er
  // gebaut ist (vorher gibt es dort nichts zum Anstoßen)
  function addCollider(b) {
    extraColliders.push({ ...b, level: CONTROL_LEVEL });
    if (built) collision.setDynamic('control-room', colliders());
  }

  // Hält der Keller-Fahrstuhl hier? Dann ersetzt sein Schacht die Wand am Ende des Vorraums
  function setElevator(on) {
    if (endWall) endWall.visible = !on;
  }

  // Liegt p (x/z) im Raum oder Vorraum?
  const contains = (p) => (p.x > R.x0 && p.x < R.x1 && p.z > R.z0 && p.z < R.z1)
    || (p.x > VESTIBULE.x0 && p.x <= R.x0 && p.z > VESTIBULE.z0 && p.z < VESTIBULE.z1);

  // Boden für die Figur auf dem Stockwerk des Raums: { y, level }. Westlich der Türmitte geht es aufs Podest des
  // Treppenhauses (Stockwerk −1), sonst bleibt sie im Raum.
  function footing(x, z) {
    if (x < DOOR_SWITCH_X && z < VESTIBULE.z0 - T) return { y: FLOOR_Y, level: -1 };
    return { y: FLOOR_Y, level: CONTROL_LEVEL };
  }

  // Steht die Figur (Treppenhaus, bisherige Bodenhöhe yPrev) gerade in der Tür auf der Raumseite? Dann wechselt sie
  // in den Raum.
  function entersFromStairs(x, z, yPrev) {
    return built && x >= DOOR_SWITCH_X && z > R.stairDoor.z0 - 0.3 && z < R.stairDoor.z1 + 0.3 && Math.abs(yPrev - FLOOR_Y) < 0.3;
  }

  // Ist die Kamera (Augenhöhe) auf dem Podest bzw. im Raum bei −10,5 m? Nur dann ist die Tür offen (das Treppenhaus
  // teilt sich ein Kollisions-Stockwerk mit allen 20 Stockwerken).
  const onDoorStorey = (p) => p.y > FLOOR_Y + 0.8 && p.y < FLOOR_Y + 2.3;
  // Steht die Kamera im gebauten Raum (samt Vorraum) auf seinem Stockwerk? Z. B. für die Bildschirmwand (#58), die
  // nur dann neu zeichnet
  const isInside = (p) => built && onDoorStorey(p) && contains(p);

  // Jedes Bild: Raum nur in der Nähe zeichnen – aus dem Treppenhaus nur, wenn die Tür im Bild ist (vom Fahrstuhl-
  // Vorraum aus immer). Gibt zurück, ob er zu sehen ist.
  const frustum = new THREE.Frustum();
  const matrix = new THREE.Matrix4();
  const sd = R.stairDoor;
  const doorBox = new THREE.Box3(new THREE.Vector3(R.wallX - 0.05, FLOOR_Y, sd.z0), new THREE.Vector3(R.x0 + 0.05, FLOOR_Y + sd.h, sd.z1));
  function update(camera) {
    const p = camera.position;
    let show = built && p.y > FLOOR_Y - VISIBLE_BELOW && p.y < FLOOR_Y + VISIBLE_ABOVE && p.x > -10.5 && p.x < R.x1 + 1 && p.z > R.z0 - 1 && p.z < R.z1 + 1;
    if (show && p.x < R.wallX && p.z < VESTIBULE.z0 - T) {
      camera.updateMatrixWorld();
      matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(matrix);
      show = frustum.intersectsBox(doorBox);
    }
    group.visible = show;
    return show;
  }

  // Punkte für die geliehenen Deckenspots (x/z, Höhe knapp unter der Decke): zwei im Leitstand, einer im Technikraum
  const lightPoints = [{ x: -2.2, z: -5 }, { x: 1.4, z: -4.4 }, { x: 6.4, z: -5 }].map((q) => ({ ...q, y: CEIL_Y - 0.1 }));

  return {
    group, leitstand, technik, build, update, footing, entersFromStairs, onDoorStorey, contains, isInside, colliders, setElevator,
    addCollider,
    lightPoints, anchors: CONTROL_ANCHORS, bounds: CONTROL_ROOM, level: CONTROL_LEVEL, floorY: FLOOR_Y,
    get built() { return built; },
  };
}
