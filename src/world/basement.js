// Keller 70 m unter der Halle (Ausbau, core/upgrades.js): beleuchtete Halle, die in Stufen von 20 × 20 bis
// 120 × 120 m wächst (Felder, Wände, Stützen und Stahltüren: world/basement-fields.js). Hinunter
// geht es über ein Treppenhaus in der Ecke links hinten (Nordwest) – wie in einem Hochhaus mit 20 Stockwerken zu je
// 3,5 m: pro Stockwerk zwei gegenläufige Läufe im Zickzack, dazwischen ein Zwischenpodest (Westen) und an jedem
// Stockwerkspodest (Osten) eine Tiefenanzeige. Später kommt ein eigener Keller-Fahrstuhl direkt südlich daneben dazu.
// Gebaut wird erst, wenn der Keller geliefert ist: Dann ersetzt ein Hallenboden mit Treppenloch (und Geländer) den
// bisherigen Boden.
//
// Stockwerke der Spielfigur (level, siehe world/collision.js): 0 = Halle, -1 = Treppenhaus, -2 = Keller, -3 = Raum bei
// −10,5 m (Leitstand und Technikraum, world/control-room.js; Tür am dritten Stockwerkspodest, eigener Fahrstuhlhalt).
// footing() sagt, wie hoch der Boden unter ihr ist und auf welchem Stockwerk sie danach steht. Weil das Treppenhaus
// 20-mal übereinander dieselbe Grundfläche hat, braucht footing() zusätzlich die bisherige Bodenhöhe.
import * as THREE from 'three';
import { ROOM_HEIGHT, ROOM_SIZE, WALL_THICKNESS } from './room.js';
import { box } from '../models/mesh-helpers.js';
import { canvasTexture } from '../models/canvas-texture.js';
import { mergeStatic } from '../models/merge-static.js';
import { createBasementFields, VIEW_DIST } from './basement-fields.js';
import { CONTROL_LEVEL, CONTROL_ROOM, createControlRoom } from './control-room.js';

const HALF = ROOM_SIZE / 2;
const T = WALL_THICKNESS;
export const LEVEL = { HALL: 0, STAIRS: -1, BASEMENT: -2, CONTROL: CONTROL_LEVEL }; // CONTROL: Raum bei −10,5 m
export const STOREY = ROOM_HEIGHT;        // Höhe eines Stockwerks im Treppenhaus (3,5 m)
export const STOREYS = 20;                // 20 × 3,5 m = 70 m
export const BASEMENT_Y = -STOREY * STOREYS; // Kellerboden (−70 m)
const HALF_STOREY = STOREY / 2;           // Zwischenpodest auf halber Höhe

// Treppenhaus (Innenmaße): Läufe in x-Richtung, oben/unten je ein Podest. Südlicher Lauf (A) führt vom
// Stockwerkspodest im Osten hinunter nach Westen, nördlicher Lauf (B) vom Zwischenpodest zurück nach Osten.
export const STAIRWELL = {
  x0: -HALF, x1: -4.8, z0: -HALF, z1: -7.6,
  xWest: -8.8,  // Ende Zwischenpodest / Anfang der Läufe
  xEast: -6.0,  // Ende der Läufe / Anfang Stockwerkspodest – bis hier reicht das Loch im Hallenboden
  zDivider: [-8.85, -8.75], // Wand zwischen den Läufen
};
// Keller-Fahrstuhl: südlich am Treppenhaus an der Westwand, Tür nach Osten
export const BASEMENT_ELEVATOR = { x0: -HALF, x1: -8.6, z0: -7.4, z1: -5.6 };

const { x0: X0, x1: X1, z0: Z0, z1: Z1, xWest: XW, xEast: XE } = STAIRWELL;
const [ZD0, ZD1] = STAIRWELL.zDivider;
const Z_MID = (ZD0 + ZD1) / 2;
const RUN = XE - XW;                      // Lauflänge (2,8 m)
const STEPS_PER_FLIGHT = 10;
const RISE = HALF_STOREY / STEPS_PER_FLIGHT; // 17,5 cm
const TREAD = RUN / STEPS_PER_FLIGHT;        // 28 cm
const SLAB = 0.25;                        // Dicke der Laufplatte unter den Stufen
const RAIL = 0.05;                        // Dicke der Geländer (als Hindernis)
const RAIL_HEIGHT = 1.0;
const HALL_VISIBLE_Y = -STOREY - 0.7;     // darunter (Augenhöhe) sieht man die Halle nicht mehr
const BASEMENT_VISIBLE_Y = BASEMENT_Y + 2 * STOREY; // darüber sieht man den Keller nicht
const LIGHT_ON = 22;                      // Deckenspots im Keller (wie die zweite Etage)
// Die drei Deckenspots folgen im Keller der Spielfigur (je Feld eigene Lichter wären zu teuer): im Dreieck um sie herum
const SPOT_OFFSETS = [[0, -6], [-5.2, 3], [5.2, 3]];
const FOLLOW_ON = 9;                      // Licht, das im Treppenhaus über der Spielfigur mitläuft
const EXIT_GAP = 0.7;                     // so weit vor der Fahrstuhltür taucht man auf

const fmtDepth = (m) => `−${String(m).replace('.', ',')} m`;

// Schild mit großer Schrift (Tiefe) und kleiner zweiter Zeile
function createSign(big, small, w = 0.5, h = 0.25) {
  const texture = canvasTexture(256, 128, (ctx, cw, ch) => {
    ctx.fillStyle = '#1f5a3a';
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = '#e9f2ea';
    ctx.lineWidth = 5;
    ctx.strokeRect(6, 6, cw - 12, ch - 12);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Schrift verkleinern, bis sie ins Schild passt
    const fit = (text, size, weight, y) => {
      const font = (px) => `${weight} ${px}px "Segoe UI", Arial, sans-serif`;
      let px = size;
      ctx.font = font(px);
      while (ctx.measureText(text).width > cw - 28 && px > 8) ctx.font = font(--px);
      ctx.fillText(text, cw / 2, y);
    };
    fit(big, 58, 700, ch * 0.42);
    fit(small, 22, 600, ch * 0.8);
  }, 1, 1, { wrap: false, anisotropy: 4 });
  // Hinterleuchtet wie ein Notausgangsschild, damit man es im Treppenhaus auch im Halbdunkel lesen kann
  const material = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.5 });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
}

function createMaterials() {
  return {
    concrete: new THREE.MeshStandardMaterial({ color: 0x9a9da3, roughness: 0.85 }),
    nosing: new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.7 }),
    wall: new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 0.95 }),
    stripe: new THREE.MeshStandardMaterial({ color: 0x3f6f8f, roughness: 0.8 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.4, metalness: 0.6 }),
    housing: new THREE.MeshStandardMaterial({ color: 0xdadada, roughness: 0.4 }),
    // Heller als Weiß, damit der Bloom-Effekt die Leuchten nachglühen lässt
    lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6e8).multiplyScalar(4) }),
  };
}

// Höhe auf dem obersten Stockwerk (0 … −3,5) an der Stelle x/z des Treppenhauses
function profile(x, z) {
  if (x >= XE) return 0;               // Stockwerkspodest
  if (x <= XW) return -HALF_STOREY;    // Zwischenpodest
  const t = (XE - x) / RUN;            // 0 im Osten, 1 im Westen
  return z > Z_MID ? -t * HALF_STOREY : -HALF_STOREY - (1 - t) * HALF_STOREY;
}

// Gerader Treppenlauf mit Laufplatte und Handlauf an der Außenwand. xStart/yStart: oberes Ende, dir: Richtung nach
// unten (−1 = nach Westen), lane: [zMin, zMax], railZ: z des Handlaufs
function flight(m, xStart, yStart, dir, lane, railZ) {
  const g = new THREE.Group();
  const [za, zb] = lane;
  const width = zb - za;
  const zc = (za + zb) / 2;
  const height = 2 * RISE + 0.05;
  for (let i = 0; i < STEPS_PER_FLIGHT; i++) {
    const top = yStart - i * RISE;
    g.add(box(TREAD, height, width, m.concrete, xStart + dir * (i + 0.5) * TREAD, top - height / 2, zc));
    // Dunkle Kante vorn an der Stufe (rutschfest)
    g.add(box(0.04, 0.012, width, m.nosing, xStart + dir * ((i + 1) * TREAD - 0.02), top + 0.006, zc));
  }
  // Laufplatte: Oberkante eine Stufenhöhe unter den Stufenkanten
  const tilt = Math.atan(-HALF_STOREY / (dir * RUN));
  const len = Math.hypot(RUN, HALF_STOREY);
  const midX = xStart + (dir * RUN) / 2;
  const midY = yStart - RISE - HALF_STOREY / 2;
  const slab = box(len, SLAB, width, m.concrete, midX + (SLAB / 2) * Math.sin(tilt), midY - (SLAB / 2) * Math.cos(tilt), zc);
  slab.rotation.z = tilt;
  g.add(slab);
  // Handlauf 0,9 m über der Lauflinie
  const rail = box(len, 0.04, 0.04, m.metal, midX, yStart - HALF_STOREY / 2 + 0.9, railZ);
  rail.rotation.z = tilt;
  g.add(rail);
  return g;
}

// Wandleuchte (Gehäuse und leuchtende Fläche), an einer Wand mit Blickrichtung normal (x oder z)
function wallLamp(m, x, y, z, alongX) {
  const g = new THREE.Group();
  g.add(alongX ? box(0.5, 0.08, 0.05, m.housing, x, y, z) : box(0.05, 0.08, 0.5, m.housing, x, y, z));
  g.add(alongX ? box(0.46, 0.05, 0.052, m.lamp, x, y, z) : box(0.052, 0.05, 0.46, m.lamp, x, y, z));
  return g;
}

// Ein Stockwerk des Treppenhauses (k = 0 oben … 19 unten): Wände, Lauf A, Zwischenpodest, Lauf B, Stockwerkspodest.
// door: Türöffnung in der Ostwand ({ z0, z1, h, signZ }, Raum bei −10,5 m) – Tiefenanzeige und Leuchte rücken neben sie
function createStorey(m, k, door = null) {
  const g = new THREE.Group();
  const top = -STOREY * k;
  const mid = top - HALF_STOREY;
  const bottom = top - STOREY;
  const last = k === STOREYS - 1;
  // Oben enden die Wände knapp unter dem Hallenboden (sonst flimmern ihre Oberkanten durch die Dielen)
  const wallH = k === 0 ? STOREY - 0.02 : STOREY;
  const yc = bottom + wallH / 2;
  const xc = (X0 + X1) / 2;
  const zc = (Z0 + Z1) / 2;
  const width = X1 - X0;
  const depth = Z1 - Z0;

  // Wände: im untersten Stockwerk sind West- und Nordwand die Kellerwände und nach Osten geht es offen in den Keller
  if (!last) {
    g.add(box(T, wallH, depth + 2 * T, m.wall, X0 - T / 2, yc, zc));
    g.add(box(width + 2 * T, wallH, T, m.wall, xc, yc, Z0 - T / 2));
    if (door) {
      const za = Z0 - T;
      const zb = Z1 + T;
      g.add(box(T, wallH, door.z0 - za, m.wall, X1 + T / 2, yc, (za + door.z0) / 2));
      g.add(box(T, wallH, zb - door.z1, m.wall, X1 + T / 2, yc, (door.z1 + zb) / 2));
      g.add(box(T, wallH - door.h, door.z1 - door.z0, m.wall, X1 + T / 2, bottom + door.h + (wallH - door.h) / 2, (door.z0 + door.z1) / 2));
    } else {
      g.add(box(T, wallH, depth + 2 * T, m.wall, X1 + T / 2, yc, zc));
    }
  }
  g.add(box(width + 2 * T, wallH, T, m.wall, xc, yc, Z1 + T / 2));
  // Trennwand zwischen den Läufen (reicht unter die Laufplatten)
  g.add(box(RUN, wallH + 0.1, ZD1 - ZD0, m.wall, (XW + XE) / 2, yc - 0.05, Z_MID));

  g.add(flight(m, XE, top, -1, [ZD1, Z1], Z1 - 0.06));  // Lauf A (Süden) nach unten Richtung Westen
  g.add(flight(m, XW, mid, 1, [Z0, ZD0], Z0 + 0.06));   // Lauf B (Norden) zurück nach Osten
  // Zwischenpodest im Westen und Stockwerkspodest im Osten (das unterste ist der Kellerboden)
  g.add(box(XW - X0, 0.2, depth, m.concrete, (X0 + XW) / 2, mid - 0.1, zc));
  if (!last) g.add(box(X1 - XE, 0.2, depth, m.concrete, (XE + X1) / 2, bottom - 0.1, zc));
  // Unter dem letzten Lauf A: Wand bis zum Boden, damit man unten nicht unter die Treppe läuft
  if (last) g.add(box(0.1, STOREY - 0.2, Z1 - ZD0, m.wall, XE, bottom + (STOREY - 0.2) / 2, (ZD0 + Z1) / 2));

  // Blauer Streifen an den Wänden der Podeste (Orientierung wie im Hochhaus)
  if (!last) {
    if (door) {
      g.add(box(0.012, 0.12, door.z0 - Z0, m.stripe, X1 - 0.006, bottom + 1.2, (Z0 + door.z0) / 2));
      g.add(box(0.012, 0.12, Z1 - door.z1, m.stripe, X1 - 0.006, bottom + 1.2, (door.z1 + Z1) / 2));
    } else {
      g.add(box(0.012, 0.12, depth, m.stripe, X1 - 0.006, bottom + 1.2, zc));
    }
    g.add(box(0.012, 0.12, depth, m.stripe, X0 + 0.006, mid + 1.2, zc));
  }

  // Tiefenanzeige am Stockwerkspodest und Leuchten an beiden Podesten
  const d = STOREY * (k + 1);
  if (!last) {
    const sign = createSign(fmtDepth(d), `bis zum Keller noch ${String(-BASEMENT_Y - d).replace('.', ',')} m`);
    sign.rotation.y = -Math.PI / 2;
    const signZ = door ? door.signZ : zc;
    sign.position.set(X1 - 0.012, bottom + 1.7, signZ);
    g.add(sign);
    g.add(wallLamp(m, X1 - 0.03, bottom + 2.6, signZ, false));
  } else {
    const sign = createSign(fmtDepth(d), 'KELLER · Halle ↑');
    sign.position.set((XE + X1) / 2, bottom + 1.7, Z0 + 0.012);
    g.add(sign);
    g.add(wallLamp(m, (XE + X1) / 2, bottom + 2.6, Z0 + 0.03, true));
  }
  g.add(wallLamp(m, X0 + 0.03, mid + 2.6, zc, false));
  g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  return mergeStatic(g);
}

// Ein abgebautes Stockwerk freigeben: Geometrien und eigene Materialien (Schild), nicht die gemeinsamen aus m
function disposeStatic(object, m) {
  const shared = new Set(Object.values(m));
  object.traverse((o) => {
    o.geometry?.dispose();
    if (o.material && !shared.has(o.material)) {
      o.material.map?.dispose();
      o.material.dispose();
    }
  });
}

// Geländer entlang einer waagrechten Strecke (a → b, je { x, y, z } am Fuß): Handlauf oben, Pfosten etwa alle 1,2 m
function railing(material, a, b) {
  const g = new THREE.Group();
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const posts = Math.max(2, Math.ceil(len / 1.2) + 1);
  for (let i = 0; i < posts; i++) {
    const t = i / (posts - 1);
    g.add(box(0.04, RAIL_HEIGHT, 0.04, material, a.x + (b.x - a.x) * t, a.y + RAIL_HEIGHT / 2, a.z + (b.z - a.z) * t));
  }
  const alongX = Math.abs(b.x - a.x) > Math.abs(b.z - a.z);
  const midX = (a.x + b.x) / 2;
  const midZ = (a.z + b.z) / 2;
  g.add(alongX
    ? box(len, 0.05, 0.06, material, midX, a.y + RAIL_HEIGHT, midZ)
    : box(0.06, 0.05, len, material, midX, a.y + RAIL_HEIGHT, midZ));
  // Knieleiste auf halber Höhe
  g.add(alongX
    ? box(len, 0.03, 0.03, material, midX, a.y + RAIL_HEIGHT / 2, midZ)
    : box(0.03, 0.03, len, material, midX, a.y + RAIL_HEIGHT / 2, midZ));
  return g;
}

// Hallenboden mit Treppenloch (L-förmige Fläche), UVs wie beim bisherigen Boden (PlaneGeometry), damit die
// Dielen an derselben Stelle bleiben
function hallFloorWithHole(material) {
  // Form in x / −z (nach dem Kippen um −90° zeigt die Form-y nach −z)
  const shape = new THREE.Shape([
    new THREE.Vector2(XE, -Z0), new THREE.Vector2(HALF, -Z0), new THREE.Vector2(HALF, -HALF),
    new THREE.Vector2(-HALF, -HALF), new THREE.Vector2(X0, -Z1), new THREE.Vector2(XE, -Z1),
  ]);
  const geo = new THREE.ShapeGeometry(shape);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / ROOM_SIZE + 0.5, pos.getY(i) / ROOM_SIZE + 0.5);
  const mesh = new THREE.Mesh(geo, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

// Die Wiese des Außenbereichs (world/outdoor.js) liegt knapp unter dem Hallenboden auch unter dem Gebäude – über dem
// Treppenhaus bekommt sie ein Loch, sonst verdeckte sie die Treppe, sobald der Außenbereich gezeichnet wird
function punchGround(outdoor) {
  const ground = outdoor?.group.children.find((o) => o.isMesh && o.geometry?.type === 'PlaneGeometry' && o.geometry.parameters.width >= 100);
  if (!ground) return;
  const { width: w, height: h } = ground.geometry.parameters;
  const V = (x, y) => new THREE.Vector2(x, y);
  const shape = new THREE.Shape([V(-w / 2, -h / 2), V(w / 2, -h / 2), V(w / 2, h / 2), V(-w / 2, h / 2)]);
  // Form-x = Welt-x − Mitte, Form-y = −(Welt-z − Mitte); Loch samt Wänden des Treppenhauses
  const { x: ox, z: oz } = ground.position;
  const [hx0, hx1, hy0, hy1] = [X0 - T - ox, X1 + T - ox, -(Z1 + T - oz), -(Z0 - T - oz)];
  shape.holes.push(new THREE.Path([V(hx0, hy0), V(hx1, hy0), V(hx1, hy1), V(hx0, hy1)]));
  const geo = new THREE.ShapeGeometry(shape);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5); // wie PlaneGeometry
  ground.geometry.dispose();
  ground.geometry = geo;
}

// Der bisherige Hallenboden aus room.js (ebene 20 × 20-Fläche mit Dielen-Material)
function findHallFloor(room) {
  if (room.userData.floor) return room.userData.floor;
  return room.children.find((o) => o.isMesh && o.geometry?.type === 'PlaneGeometry' && o.material?.isMeshPhysicalMaterial
    && Math.abs(o.position.y) < 1e-6 && o.geometry.parameters.width === ROOM_SIZE) ?? null;
}

// Teile an der Halle: neuer Boden, Platte über dem obersten Podest, Geländer ums Loch, Schild
function createHallPart(m, room) {
  const g = new THREE.Group();
  const old = findHallFloor(room);
  if (old) {
    old.visible = false;
    g.add(hallFloorWithHole(old.material));
  }
  // Unterseite des Hallenbodens über dem obersten Stockwerkspodest (sonst sähe man von unten durch den Boden)
  g.add(box(X1 - XE, 0.24, Z1 - Z0, m.concrete, (XE + X1) / 2, -0.13, (Z0 + Z1) / 2));
  // Geländer: Südkante des Lochs, Ostkante am nördlichen Lauf und auf der Trennwand
  g.add(railing(m.metal, { x: X0, y: 0, z: Z1 + 0.02 }, { x: XE, y: 0, z: Z1 + 0.02 }));
  g.add(railing(m.metal, { x: XE + 0.02, y: 0, z: Z0 }, { x: XE + 0.02, y: 0, z: ZD1 }));
  g.add(railing(m.metal, { x: XW, y: 0, z: Z_MID }, { x: XE, y: 0, z: Z_MID }));
  const sign = createSign('▼ KELLER', fmtDepth(-BASEMENT_Y), 0.44, 0.22);
  sign.rotation.y = Math.PI / 2;
  sign.position.set(XE + 0.06, 0.75, (Z0 + ZD0) / 2);
  g.add(sign);
  g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  return mergeStatic(g); // Geländer, Platte und Schild: je Material ein Mesh
}

// Ziele des Keller-Fahrstuhls (Ruftaster) mit Schrift auf dem Taster
const STOP_TARGETS = [
  { level: LEVEL.HALL, label: 'HALLE', hint: 'Linksklick: mit dem Fahrstuhl nach oben in die Halle' },
  { level: LEVEL.CONTROL, label: '−10,5 m', hint: 'Linksklick: mit dem Fahrstuhl zum Raum bei −10,5 m (Leitstand)' },
  { level: LEVEL.BASEMENT, label: 'KELLER', hint: 'Linksklick: mit dem Fahrstuhl in den Keller' },
];
const stopY = (level) => (level === LEVEL.HALL ? 0 : level === LEVEL.CONTROL ? CONTROL_ROOM.y : BASEMENT_Y);

// Haltestelle des Keller-Fahrstuhls auf dem Stockwerk here: Schachtstück, Tür nach Osten, Schild. Den Ruftaster
// rechts daneben baut createCallPanel (er wechselt, sobald es den Halt bei −10,5 m gibt). targets(): Liste der
// Stockwerke, die man von hier erreicht – bei genau einem fährt auch ein Klick auf die Tür los.
function createElevatorStop(here, targets, onRide) {
  const y = stopY(here);
  const g = new THREE.Group();
  const stop = new THREE.Group(); // Tür und Schild: anklickbar (der Schacht selbst nicht)
  const { x0, x1, z0, z1 } = BASEMENT_ELEVATOR;
  const cz = (z0 + z1) / 2;
  const shaftMat = new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.3, metalness: 0.8 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.5, metalness: 0.5 });
  g.add(box(x1 - x0, STOREY, z1 - z0, shaftMat, (x0 + x1) / 2, y + STOREY / 2, cz));
  g.add(stop);
  stop.add(
    box(0.04, 2.25, 1.1, frame, x1 + 0.02, y + 1.125, cz),
    box(0.03, 2.1, 0.48, steel, x1 + 0.05, y + 1.05, cz - 0.245),
    box(0.03, 2.1, 0.48, steel, x1 + 0.05, y + 1.05, cz + 0.245),
  );
  const [big, small] = here === LEVEL.HALL ? ['▼ KELLER', fmtDepth(-BASEMENT_Y)]
    : here === LEVEL.CONTROL ? ['FAHRSTUHL', 'Halle · −10,5 m · Keller'] : ['▲ HALLE', 'Erdgeschoss'];
  const sign = createSign(big, small, 0.5, 0.2);
  sign.rotation.y = Math.PI / 2;
  sign.position.set(x1 + 0.006, y + 2.5, cz);
  stop.add(sign);
  stop.userData.interaction = {
    hint: () => {
      const list = targets();
      return list.length === 1 ? STOP_TARGETS.find((t) => t.level === list[0]).hint : 'Fahrstuhl: Ziel am Ruftaster rechts neben der Tür wählen';
    },
    action: () => {
      const list = targets();
      if (list.length === 1) onRide(list[0]);
    },
  };
  return mergeStatic(g); // die Haltestelle bleibt anklickbar (interaction an ihrer Gruppe)
}

// Ruftaster rechts neben der Fahrstuhltür (von vorn gesehen, also nach Norden). Ohne Halt bei −10,5 m ein Taster mit
// Pfeil wie bisher, sonst drei beschriftete Taster (Halle, −10,5 m, Keller); der des eigenen Stockwerks leuchtet
// gelb und fährt nicht.
const panelMaterials = new Map();
function labelMaterial(label, current) {
  const key = `${label}|${current}`;
  if (!panelMaterials.has(key)) {
    const texture = canvasTexture(128, 48, (ctx, w, h) => {
      ctx.fillStyle = current ? '#d8a21c' : '#1d4f78';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = current ? '#fff2c4' : '#9fd3ff';
      ctx.lineWidth = 4;
      ctx.strokeRect(3, 3, w - 6, h - 6);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 26px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, w / 2, h / 2 + 1);
    }, 1, 1, { wrap: false, anisotropy: 4 });
    panelMaterials.set(key, new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 0.5 }));
  }
  return panelMaterials.get(key);
}

function createCallPanel(here, multi, onRide) {
  const y = stopY(here);
  const { x1, z0, z1 } = BASEMENT_ELEVATOR;
  const cz = (z0 + z1) / 2;
  const frame = new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.5, metalness: 0.5 });
  const panel = new THREE.Group();
  if (!multi) {
    const down = here === LEVEL.HALL;
    const target = STOP_TARGETS.find((t) => t.level === (down ? LEVEL.BASEMENT : LEVEL.HALL));
    panel.add(box(0.03, 0.18, 0.1, frame, x1 + 0.03, y + 1.2, cz - 0.68));
    const arrow = new THREE.Mesh(new THREE.CircleGeometry(0.03, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7cc4ff).multiplyScalar(2) }));
    arrow.rotation.set(0, Math.PI / 2, down ? -Math.PI / 2 : Math.PI / 2);
    arrow.position.set(x1 + 0.046, y + 1.2, cz - 0.68);
    panel.add(arrow);
    panel.userData.interaction = { hint: () => target.hint, action: () => onRide(target.level) };
    return panel;
  }
  // Drei Taster übereinander: oben Halle, Mitte −10,5 m, unten Keller
  panel.add(box(0.02, 0.62, 0.3, frame, x1 + 0.01, y + 1.2, cz - 0.72));
  STOP_TARGETS.forEach((t, i) => {
    const current = t.level === here;
    const button = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.12), labelMaterial(t.label, current));
    button.rotation.y = Math.PI / 2;
    button.position.set(x1 + 0.022, y + 1.4 - i * 0.19, cz - 0.72);
    button.userData.interaction = current
      ? { hint: () => `Du bist hier (${t.label === 'HALLE' ? 'Halle' : t.label === 'KELLER' ? 'Keller' : 'Raum bei −10,5 m'})` }
      : { hint: () => t.hint, action: () => onRide(t.level) };
    panel.add(button);
  });
  return panel;
}

// upgrades: Ausbau-Stand · collision: Kollision der Spielfigur · room: Halle (Boden wird gegen einen mit Treppenloch
// getauscht) · onRide(level): Keller-Fahrstuhl wurde gerufen (LEVEL.HALL, LEVEL.CONTROL bzw. LEVEL.BASEMENT) · sun: Sonnenlicht
// (optional) – wird unter der Erde ausgeschaltet, sonst schiene es ohne Schattenwurf in Treppenhaus und Keller ·
// outdoor: Außenbereich (optional) – seine Wiese bekommt über dem Treppenhaus ein Loch
export function createBasement({ upgrades, collision, room, onRide = () => {}, sun = null, outdoor = null }) {
  const group = new THREE.Group();      // unter der Erde: Treppenhaus, Keller, Lichter (blendet sich selbst aus)
  const hallGroup = new THREE.Group();  // in der Halle: Boden mit Loch, Geländer, Fahrstuhltür (für room-culling)
  group.name = 'basement';
  hallGroup.name = 'basement-hall';
  const m = createMaterials();
  // Lichter von Anfang an da (nur ohne Helligkeit), damit sich die Zahl der Lichter nie ändert – sonst übersetzt
  // three.js beim Kauf alle Shader neu (siehe world/hall-lights.js)
  const spots = SPOT_OFFSETS.map(([x, z]) => {
    const light = new THREE.SpotLight(0xfff1dc, 0, 14, Math.PI * 0.45, 0.8, 2);
    light.position.set(x, BASEMENT_Y + STOREY - 0.1, z);
    light.target.position.set(x, BASEMENT_Y, z);
    group.add(light, light.target);
    return light;
  });
  // Ein Licht läuft im Treppenhaus über der Spielfigur mit (20 Stockwerke mit eigenen Lichtern wären zu teuer)
  const follow = new THREE.SpotLight(0xfff1dc, 0, 8, Math.PI * 0.45, 0.7, 2);
  group.add(follow, follow.target);
  const sunOn = sun?.intensity ?? 0;

  // Felder des Kellers (Boden, Wände, Stützen, Stahltüren) – Materialien entstehen schon hier, nicht erst beim Ausbau
  const layout = upgrades.basementLayout;
  const fields = createBasementFields({
    layout, collision, level: LEVEL.BASEMENT,
    stairwell: { x0: X0, x1: X1, z0: Z0, z1: Z1 + T },
    // Fahrstuhl samt Platz zum Aussteigen
    keepFree: [{ minX: BASEMENT_ELEVATOR.x0, maxX: BASEMENT_ELEVATOR.x1 + 1.5, minZ: BASEMENT_ELEVATOR.z0 - 0.3, maxZ: BASEMENT_ELEVATOR.z1 + 0.3 }],
  });
  const storeys = [];
  let basementRoom = null; // Felder und Fahrstuhl-Haltestelle unten
  let built = false;
  let elevatorBuilt = false;
  // Raum bei −10,5 m (Ausbau, world/control-room.js): Materialien gleich anlegen, gebaut wird nach der Lieferung
  const controlRoom = createControlRoom({ materials: m, createSign, collision });
  group.add(controlRoom.group);
  let controlBuilt = false;
  let stairDoorOpen = null; // Tür am Podest −10,5 m für die Kollision offen (nur, wenn man auf diesem Stockwerk ist)
  const stops = new Map();  // Haltestellen des Keller-Fahrstuhls je Stockwerk: { parent, panel }

  function colliders() {
    const boxes = [
      // Halle: Geländer ums Treppenloch
      { minX: X0, maxX: XE, minZ: Z1, maxZ: Z1 + RAIL, level: LEVEL.HALL },
      { minX: XE, maxX: XE + RAIL, minZ: Z0, maxZ: ZD1, level: LEVEL.HALL },
      { minX: XW, maxX: XE, minZ: ZD0, maxZ: ZD1, level: LEVEL.HALL },
      // Treppenhaus: Außenwände und Trennwand
      { minX: X0 - T, maxX: X0, minZ: Z0 - T, maxZ: Z1 + T, level: LEVEL.STAIRS },
      { minX: X0 - T, maxX: X1 + T, minZ: Z0 - T, maxZ: Z0, level: LEVEL.STAIRS },
      { minX: X0 - T, maxX: X1 + T, minZ: Z1, maxZ: Z1 + T, level: LEVEL.STAIRS },
      // Ostwand: mit Raum bei −10,5 m Öffnung für dessen Tür (zu, außer auf dem Podest −10,5 m: stairDoorColliders)
      ...(controlBuilt
        ? [{ minX: X1, maxX: X1 + T, minZ: Z0 - T, maxZ: CONTROL_ROOM.stairDoor.z0, level: LEVEL.STAIRS },
          { minX: X1, maxX: X1 + T, minZ: CONTROL_ROOM.stairDoor.z1, maxZ: Z1 + T, level: LEVEL.STAIRS }]
        : [{ minX: X1, maxX: X1 + T, minZ: Z0 - T, maxZ: Z1 + T, level: LEVEL.STAIRS }]),
      { minX: XW, maxX: XE, minZ: ZD0, maxZ: ZD1, level: LEVEL.STAIRS },
      // Keller: Südwand des Treppenhauses, Trennwand, Wand unter dem letzten Lauf A (Außenwände, Stützen und
      // Bunkerwände wachsen mit dem Ausbau, siehe fields.colliders)
      { minX: X0 - T, maxX: X1 + T, minZ: Z1, maxZ: Z1 + T, level: LEVEL.BASEMENT },
      { minX: XW, maxX: XE, minZ: ZD0, maxZ: ZD1, level: LEVEL.BASEMENT },
      { minX: XE - 0.05, maxX: XE + 0.05, minZ: ZD0, maxZ: Z1, level: LEVEL.BASEMENT },
    ];
    if (elevatorBuilt) {
      const { x0, x1, z0, z1 } = BASEMENT_ELEVATOR;
      for (const level of [LEVEL.HALL, LEVEL.BASEMENT, LEVEL.CONTROL]) boxes.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, level });
    }
    return [...boxes, ...fields.colliders()];
  }

  // Ausbau-Stand übernehmen: Keller bzw. Fahrstuhl bauen, sobald sie geliefert sind (auch beim Laden eines Spielstands)
  function sync() {
    if (upgrades.basement && !built) {
      built = true;
      hallGroup.add(createHallPart(m, room));
      punchGround(outdoor);
      for (let k = 0; k < STOREYS; k++) {
        const storey = createStorey(m, k);
        storey.visible = false;
        storeys.push(storey);
        group.add(storey);
      }
      basementRoom = new THREE.Group();
      basementRoom.name = 'basement-room';
      basementRoom.add(fields.group);
      basementRoom.visible = false;
      group.add(basementRoom);
      for (const light of spots) light.intensity = LIGHT_ON;
    }
    if (upgrades.controlRoom && built && !controlBuilt) {
      controlBuilt = true;
      // Drittes Stockwerk (Podest −10,5 m) mit Tür in der Ostwand neu bauen
      const k = Math.round(-CONTROL_ROOM.y / STOREY) - 1;
      const old = storeys[k];
      const storey = createStorey(m, k, CONTROL_ROOM.stairDoor);
      storey.visible = old.visible;
      group.remove(old);
      disposeStatic(old, m);
      storeys[k] = storey;
      group.add(storey);
      controlRoom.build();
      setStairDoor(false);
    }
    if (upgrades.basementElevator && built && !elevatorBuilt) {
      elevatorBuilt = true;
      addStop(LEVEL.HALL, hallGroup);
      addStop(LEVEL.BASEMENT, basementRoom);
    }
    if (elevatorBuilt && controlBuilt && !stops.has(LEVEL.CONTROL)) {
      addStop(LEVEL.CONTROL, controlRoom.group);
      controlRoom.setElevator(true);
    }
    // Ruftaster: drei Ziele, sobald der Fahrstuhl auch bei −10,5 m hält
    const multi = stops.has(LEVEL.CONTROL);
    for (const [here, stop] of stops) {
      if (stop.multi === multi) continue;
      if (stop.panel) {
        stop.parent.remove(stop.panel);
        stop.panel.traverse((o) => o.geometry?.dispose());
      }
      stop.panel = createCallPanel(here, multi, onRide);
      stop.multi = multi;
      stop.parent.add(stop.panel);
    }
    if (built) {
      fields.sync(); // billig, solange sich Stufe und Feldarten nicht geändert haben
      collision.setDynamic('basement', colliders());
    }
  }
  // Stockwerke, die der Keller-Fahrstuhl von here aus anfährt
  function elevatorTargets(here) {
    const all = [LEVEL.HALL, ...(stops.has(LEVEL.CONTROL) ? [LEVEL.CONTROL] : []), LEVEL.BASEMENT];
    return all.filter((l) => l !== here);
  }
  function addStop(here, parent) {
    parent.add(createElevatorStop(here, () => elevatorTargets(here), onRide));
    stops.set(here, { parent, panel: null, multi: null });
  }

  // Tür vom Podest −10,5 m in den Raum: Das Treppenhaus ist für die Kollision ein einziges Stockwerk (−1) über alle
  // 20 Stockwerke – die Türöffnung darf deshalb nur offen sein, solange man auf dem Podest −10,5 m steht.
  function setStairDoor(open) {
    if (!controlBuilt || open === stairDoorOpen) return;
    stairDoorOpen = open;
    const { z0, z1 } = CONTROL_ROOM.stairDoor;
    collision.setDynamic('basement-stair-door', open ? [] : [{ minX: X1, maxX: X1 + T, minZ: z0, maxZ: z1, level: LEVEL.STAIRS }]);
  }

  upgrades.subscribe(sync);
  // Das Laden eines Spielstands meldet die Kellerkarte nur selbst (nicht über upgrades.notify)
  layout.subscribe(() => sync());

  // Höhe am Ort x/z eines Stockwerks k (0 = oben): nächstgelegenes zur bisherigen Bodenhöhe yPrev, k in [kMin, kMax]
  function storeyHeight(x, z, yPrev, kMin, kMax) {
    const h = profile(x, z);
    const top = h === 0 ? kMax : Math.min(kMax, STOREYS - 1); // Stockwerkspodest gibt es 21-mal (inkl. Kellerboden)
    const k = THREE.MathUtils.clamp(Math.round((h - yPrev) / STOREY), kMin, top);
    return h - k * STOREY;
  }

  const inShaft = (x, z) => x > X0 && x < X1 && z > Z0 && z < Z1;
  const levelFor = (y) => (y > -HALF_STOREY ? LEVEL.HALL : y < BASEMENT_Y + HALF_STOREY ? LEVEL.BASEMENT : LEVEL.STAIRS);

  // Boden unter der Figur bei (x, z), wenn sie bisher auf Stockwerk level mit Bodenhöhe yPrev stand: { y, level } –
  // oder null, wenn der Keller dafür nicht zuständig ist (dann gilt world/upper-floor.js). Auf den Läufen steigt der
  // Boden gleichmäßig; ab halber Höhe des obersten bzw. untersten Stockwerks wechselt das Stockwerk.
  function footing(x, z, level, yPrev = 0) {
    if (!built) return null;
    if (level === LEVEL.CONTROL) return controlRoom.footing(x, z);
    if (level === LEVEL.STAIRS && controlRoom.entersFromStairs(x, z, yPrev)) return { y: CONTROL_ROOM.y, level: LEVEL.CONTROL };
    if (level === LEVEL.HALL) {
      if (!inShaft(x, z) || x >= XE) return null;
      const y = storeyHeight(x, z, 0, 0, 0);
      return { y, level: levelFor(y) };
    }
    if (level === LEVEL.STAIRS) {
      const cx = THREE.MathUtils.clamp(x, X0, X1);
      const cz = THREE.MathUtils.clamp(z, Z0, Z1);
      const y = storeyHeight(cx, cz, yPrev, 0, STOREYS);
      return { y, level: levelFor(y) };
    }
    if (level === LEVEL.BASEMENT) {
      if (!inShaft(x, z)) return { y: BASEMENT_Y, level };
      const y = storeyHeight(x, z, yPrev, STOREYS - 1, STOREYS);
      return { y, level: levelFor(y) };
    }
    return null;
  }

  // Wo in der Halle nichts hin darf (Treppenloch samt Geländer, Fahrstuhlschacht) – für Kater und Würfe:
  // [{ minX, maxX, minZ, maxZ }], leer solange der Keller nicht gebaut ist
  function hallObstacles() {
    if (!built) return [];
    const list = [{ minX: X0, maxX: XE + RAIL, minZ: Z0, maxZ: Z1 + RAIL }];
    if (elevatorBuilt) {
      const { x0, x1, z0, z1 } = BASEMENT_ELEVATOR;
      list.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 });
    }
    return list;
  }

  // Wo man nach der Fahrt aus dem Fahrstuhl tritt (vor der Tür, Blick nach Osten)
  const elevatorExit = (level) => ({
    x: BASEMENT_ELEVATOR.x1 + EXIT_GAP,
    y: stopY(level),
    z: (BASEMENT_ELEVATOR.z0 + BASEMENT_ELEVATOR.z1) / 2,
  });

  // Kann man von der Position p (Kamera) aus die Halle sehen? (für world/room-culling.js)
  const hallVisibleFrom = (p) => p.y > HALL_VISIBLE_Y;
  // Bereich, in dem p (Kamera) steht: 'hall' (auch oberstes Stockwerk der Treppe), 'stairs', 'control' (Raum bei
  // −10,5 m samt Vorraum) oder 'basement'
  function zoneOf(p) {
    if (!built || hallVisibleFrom(p)) return 'hall';
    if (controlBuilt && controlRoom.onDoorStorey(p) && controlRoom.contains(p)) return 'control';
    return p.y < BASEMENT_Y + STOREY && !inShaft(p.x, p.z) ? 'basement' : 'stairs';
  }

  // Kellernebel: Der Außennebel (world/outdoor.js, hellblau ab 45 m) gälte auch hier unten – hinter den nicht mehr
  // gezeichneten Feldern (ab VIEW_DIST) bliebe dann ein schwarzer Streifen. Im Keller deshalb dunkler Nebel in der
  // Hintergrundfarbe, der vor VIEW_DIST dicht ist. Nur Farbe und Reichweite des vorhandenen scene.fog ändern sich –
  // kein Shader wird neu übersetzt. Beim Verlassen kommen die alten Werte zurück.
  const FOG_NEAR = 22;
  const FOG_FAR = VIEW_DIST - 4;
  let savedFog = null;
  function setBasementFog(on) {
    let scene = group.parent;
    while (scene && !scene.isScene) scene = scene.parent;
    const fog = scene?.fog;
    if (!fog?.isFog || on === !!savedFog) return;
    if (on) {
      savedFog = { color: fog.color.clone(), near: fog.near, far: fog.far };
      fog.color.copy(scene.background?.isColor ? scene.background : new THREE.Color(0x1a1d22));
      fog.near = FOG_NEAR;
      fog.far = FOG_FAR;
    } else {
      fog.color.copy(savedFog.color);
      fog.near = savedFog.near;
      fog.far = savedFog.far;
      savedFog = null;
    }
  }

  const frustum = new THREE.Frustum();
  const matrix = new THREE.Matrix4();
  const holeBox = new THREE.Box3(new THREE.Vector3(X0, -2 * STOREY, Z0), new THREE.Vector3(X1, 0.1, Z1));

  // Jedes Bild: Treppenhaus nur in der Nähe der Kamera zeichnen (in der Halle nur, wenn das Loch im Bild ist), Keller
  // nur von unten, mitlaufendes Licht und Sonne
  function update(dt, camera) {
    if (!built) return;
    const p = camera.position;
    const inHallArea = Math.abs(p.x) < HALF && Math.abs(p.z) < HALF;
    // Tiefer als ein Stockwerk gibt es nur Treppenhaus und Keller – der Keller reicht weit über die Halle hinaus
    const deep = p.y < -STOREY;
    let near = inHallArea || deep;
    if (near && p.y > -STOREY) {
      camera.updateMatrixWorld();
      matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(matrix);
      near = frustum.intersectsBox(holeBox);
    }
    // Aus der Halle (Augenhöhe über dem Boden) sieht man nur ins oberste Stockwerk, sonst bis gut eins tiefer
    const below = p.y > 0 ? 2 : 6;
    storeys.forEach((storey, k) => {
      const top = -STOREY * k;
      storey.visible = near && top - STOREY < p.y + 4 && top > p.y - below;
    });
    const shown = p.y < BASEMENT_VISIBLE_Y;
    basementRoom.visible = shown;
    // Raum bei −10,5 m: nur in seiner Nähe zeichnen, Tür am Podest nur auf diesem Stockwerk offen
    const controlShown = controlRoom.update(camera);
    setStairDoor(controlRoom.onDoorStorey(p));
    setBasementFog(shown);
    // Felder: Neubau nach dem Ausbau (verteilt auf mehrere Bilder), nur nahe Felder zeichnen, Stahltüren
    fields.update(dt, camera, shown, p.y < BASEMENT_Y + STOREY);
    const underground = (inHallArea && p.y < 0.5) || deep;
    follow.intensity = underground ? FOLLOW_ON : 0;
    follow.position.set(p.x, p.y + 0.9, p.z);
    follow.target.position.set(p.x, p.y - 3, p.z);
    follow.target.updateMatrixWorld();
    // Deckenspots im Keller: im Dreieck um die Spielfigur, nicht über die Außenwände hinaus
    if (shown) {
      const lo = -HALF + 1;
      const hi = -HALF + Math.max(layout.size, ROOM_SIZE) - 1;
      spots.forEach((light, k) => {
        const x = THREE.MathUtils.clamp(p.x + SPOT_OFFSETS[k][0], lo, hi);
        const z = THREE.MathUtils.clamp(p.z + SPOT_OFFSETS[k][1], lo, hi);
        light.position.set(x, BASEMENT_Y + STOREY - 0.1, z);
        light.target.position.set(x, BASEMENT_Y, z);
        light.target.updateMatrixWorld();
      });
    } else if (controlShown) {
      // Im Raum bei −10,5 m leuchten die Deckenspots des Kellers (gleiche Zahl an Lichtern, kein Neuübersetzen)
      controlRoom.lightPoints.forEach((q, k) => {
        spots[k].position.set(q.x, q.y, q.z);
        spots[k].target.position.set(q.x, CONTROL_ROOM.y, q.z);
        spots[k].target.updateMatrixWorld();
      });
    }
    if (sun) sun.intensity = deep ? 0 : sunOn;
  }

  return {
    group, hallGroup, footing, elevatorExit, update, hallVisibleFrom, zoneOf, colliders, hallObstacles, fields,
    get built() { return built; },
    get elevatorBuilt() { return elevatorBuilt; },
    get storeys() { return storeys; },
    get basementRoom() { return basementRoom; },
    // Raum bei −10,5 m (world/control-room.js): leitstand/technik-Gruppen, anchors, bounds für #58/#59
    controlRoom,
    get controlRoomBuilt() { return controlBuilt; },
  };
}
