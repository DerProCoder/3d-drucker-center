// Festplatten vorn in der NAS (#48): eingesetzte Platten im Einschubrahmen, wie sie in den Schächten der Frontplatte
// stecken (Schächte und leere Öffnungen zeichnet models/server-textures.js, Lage über nasBayRects). Jede Platte ist
// eine flache Blende mit Griff; das Etikett zeigt die Größe („2 TB“), die LED leuchtet grün, eine defekte Platte ist rot
// und pulsiert (pulseNasDisks).
//
// Leistung: Alle Blenden nutzen ein gemeinsames Texturatlas (je Größe eine Kachel heil und eine defekt) und zwei
// Materialien. Die Platten einer NAS werden zu einem Mesh je Material zusammengefügt – also höchstens zwei Draw-Calls
// je NAS, egal wie viele Platten stecken. Neu gebaut wird nur, wenn sich die Platten ändern (updateNasDisks).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nasBayRects } from './server-textures.js';

const FONT = '"Segoe UI", Arial, sans-serif';
const DEPTH = 0.008;      // Tiefe der Blende (ragt 5 mm aus der Frontplatte)
const FRONT_Z = 0.005;    // Vorderkante der Blende (Gerätekoordinaten, Frontplatte bei z = 0)
// Farbband je Plattengröße wie DISK_COLORS in models/server-parts.js (Etikett oben auf der Platte)
const SIZES = [
  { gb: 512, label: '512 GB', color: '#3d8bd9' },
  { gb: 2048, label: '2 TB', color: '#2fb36b' },
  { gb: 4096, label: '4 TB', color: '#8b5cd6' },
  { gb: 8192, label: '8 TB', color: '#d64545' },
];

// ---------- Texturatlas: 2 Spalten (heil, defekt) × 4 Zeilen (Größen), darunter Kacheln für Kanten und Griff ----------

const TILE = { w: 256, h: 122 };
const ATLAS = { w: 512, h: 512 };
const EDGE_UV = [0.25, 1 - 500 / ATLAS.h];   // dunkle Fläche für die Kanten der Blende
const HANDLE_UV = [0.75, 1 - 500 / ATLAS.h]; // Stahl für den Griff

function sizeRow(gb) {
  const i = SIZES.findIndex((s) => s.gb >= gb);
  return i === -1 ? SIZES.length - 1 : i;
}

// UV-Rechteck einer Kachel { u0, u1, v0 (unten), v1 (oben) }
function tileUv(row, broken) {
  const x = broken ? TILE.w : 0;
  const y = row * TILE.h;
  return { u0: x / ATLAS.w, u1: (x + TILE.w) / ATLAS.w, v0: 1 - (y + TILE.h) / ATLAS.h, v1: 1 - y / ATLAS.h };
}

function rect(ctx, x, y, w, h, style, r = 0) {
  ctx.fillStyle = style;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function dot(ctx, x, y, r, style) {
  ctx.fillStyle = style;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// Eine Blende: Graphit mit Lüftungsschlitzen, Griffmulde links, weißes Etikett mit Farbband und Größe, LEDs oben rechts.
// glow: Leuchtebene (nur die LEDs)
function drawTile(ctx, glow, x0, y0, size, broken) {
  const { w, h } = TILE;
  rect(ctx, x0, y0, w, h, broken ? '#3a2422' : '#2b2e33');
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x0, y0, w, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x0, y0 + h - 4, w, 4);
  ctx.fillRect(x0 + w - 3, y0, 3, h);
  // Griffmulde (der Griff selbst ist ein eigenes Stück Geometrie davor)
  rect(ctx, x0 + 10, y0 + h * 0.56, w * 0.5, h * 0.3, '#121315', 5);
  // Lüftungsschlitze
  ctx.fillStyle = '#121315';
  for (let x = x0 + 14; x < x0 + w * 0.52; x += 11) ctx.fillRect(x, y0 + h * 0.14, 5, h * 0.32);
  // Etikett mit Farbband und Größe
  const lx = x0 + w * 0.6;
  const ly = y0 + h * 0.36;
  const lw = w * 0.36;
  const lh = h * 0.52;
  rect(ctx, lx, ly, lw, lh, broken ? '#ffd9d3' : '#f2f2ee', 3);
  rect(ctx, lx, ly, 10, lh, size.color);
  ctx.fillStyle = '#16171a';
  ctx.font = `800 ${Math.round(lh * 0.5)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(size.label, lx + 5 + lw / 2, ly + lh * (broken ? 0.38 : 0.52), lw - 16);
  if (broken) {
    ctx.fillStyle = '#c0261a';
    ctx.font = `800 ${Math.round(lh * 0.26)}px ${FONT}`;
    ctx.fillText('DEFEKT', lx + 5 + lw / 2, ly + lh * 0.8, lw - 16);
  }
  // LEDs: Status (grün bzw. rot) und Zugriff (blau, aus)
  const ledY = y0 + h * 0.2;
  for (const [i, color] of [[0, broken ? '#ff3b30' : '#3bf07a'], [1, '#1d3a66']]) {
    const x = x0 + w - 22 - i * 20;
    dot(ctx, x, ledY, 7.5, '#0b0c0e');
    dot(ctx, x, ledY, 5.5, color);
    if (i === 0) dot(glow, x, ledY, 5.5, color);
  }
}

let atlas = null;
function getAtlas() {
  if (atlas) return atlas;
  const layer = () => {
    const canvas = document.createElement('canvas');
    canvas.width = ATLAS.w;
    canvas.height = ATLAS.h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, ATLAS.w, ATLAS.h);
    return ctx;
  };
  const color = layer();
  const glow = layer();
  SIZES.forEach((size, row) => {
    for (const broken of [false, true]) drawTile(color, glow, broken ? TILE.w : 0, row * TILE.h, size, broken);
  });
  // Kanten (Graphit) und Griff (Stahl) unten im Atlas
  color.fillStyle = '#1f2125';
  color.fillRect(0, 4 * TILE.h, ATLAS.w / 2, ATLAS.h - 4 * TILE.h);
  color.fillStyle = '#b8bcc2';
  color.fillRect(ATLAS.w / 2, 4 * TILE.h, ATLAS.w / 2, ATLAS.h - 4 * TILE.h);
  const texture = (ctx) => {
    const t = new THREE.CanvasTexture(ctx.canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const map = texture(color);
  atlas = {
    ok: new THREE.MeshStandardMaterial({
      map, emissive: 0xffffff, emissiveMap: texture(glow), emissiveIntensity: 2.5, roughness: 0.55, metalness: 0.3,
    }),
    // Defekt: rötlich und als Ganzes rot leuchtend; pulseNasDisks ändert nur emissiveIntensity
    broken: new THREE.MeshStandardMaterial({
      map, color: new THREE.Color(1, 0.6, 0.55), emissive: 0xff2a14, emissiveIntensity: 0.5, roughness: 0.55, metalness: 0.3,
    }),
  };
  return atlas;
}

// Lässt defekte Platten langsam rot pulsieren (ein Wert an einem geteilten Material). seconds: laufende Zeit
export function pulseNasDisks(seconds) {
  if (atlas) atlas.broken.emissiveIntensity = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(seconds * 3.5));
}

// ---------- Geometrie ----------

// Box w × h × d an (x, y, z); Vorderseite (+z) mit der Kachel uv, alle anderen Flächen auf dem Bildpunkt rest
function faceBox(w, h, d, x, y, z, uv, rest) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  const attr = geometry.attributes.uv;
  for (let f = 0; f < 6; f++) {
    for (let i = f * 4; i < f * 4 + 4; i++) {
      if (f === 4 && uv) attr.setXY(i, uv.u0 + attr.getX(i) * (uv.u1 - uv.u0), uv.v0 + attr.getY(i) * (uv.v1 - uv.v0));
      else attr.setXY(i, rest[0], rest[1]);
    }
  }
  return geometry.translate(x, y, z);
}

// Mitte und Größe der Schächte in Gerätekoordinaten (Ursprung Mitte der Frontplatte, width × height):
// [{ x, y, w, h }] – für Platten, Klickflächen und den Rahmen beim Zielen (world/server-room.js)
export function nasBayBoxes(type, width, height) {
  return nasBayRects(type, width, height).map((r) => ({
    x: r.x + r.w / 2 - width / 2, y: height / 2 - (r.y + r.h / 2), w: r.w, h: r.h,
  }));
}

// Platten einer NAS als Gruppe mit höchstens zwei Meshes (heil, defekt). bays: [{ index, gb, broken }] – nur Schächte
// mit Platte (gb > 0) werden gezeigt; width × height: Frontplatte
export function createNasDisks(type, bays, width, height) {
  const g = new THREE.Group();
  g.name = 'nas-disks';
  const boxes = nasBayBoxes(type, width, height);
  const lists = { ok: [], broken: [] };
  for (const bay of bays) {
    const b = boxes[bay.index];
    if (!b || !(bay.gb > 0)) continue;
    const list = bay.broken ? lists.broken : lists.ok;
    const w = b.w - 0.0012;
    const h = b.h - 0.0012;
    list.push(faceBox(w, h, DEPTH, b.x, b.y, FRONT_Z - DEPTH / 2, tileUv(sizeRow(bay.gb), !!bay.broken), EDGE_UV));
    // Griff: Bügel vor der Griffmulde
    list.push(faceBox(w * 0.46, h * 0.12, 0.003, b.x - w * 0.5 + 0.004 + w * 0.23, b.y - h * 0.21, FRONT_Z + 0.0015, null, HANDLE_UV));
  }
  const m = getAtlas();
  for (const [key, geos] of Object.entries(lists)) {
    if (!geos.length) continue;
    const geometry = mergeGeometries(geos, false);
    geos.forEach((geo) => geo.dispose());
    const mesh = new THREE.Mesh(geometry, m[key]);
    mesh.raycast = () => {}; // Klicks gehen an die Klickflächen der Schächte (world/server-room.js)
    g.add(mesh);
  }
  g.userData.hasBroken = lists.broken.length > 0;
  return g;
}

// Platten einer Geräte-Gruppe (models/server-hardware.js createServerDevice) neu bauen: alte Geometrie freigeben,
// neue einhängen. Gibt die neue Gruppe zurück.
export function updateNasDisks(device, type, bays, width, height) {
  const old = device.userData.disks;
  if (old) {
    device.remove(old);
    old.traverse((o) => o.geometry?.dispose());
  }
  const disks = createNasDisks(type, bays, width, height);
  device.add(disks);
  device.userData.disks = disks;
  return disks;
}
