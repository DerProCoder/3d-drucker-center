// Draußen: Fassaden und Flachdach des Gebäudes, Garten vor dem Eingang (Terrasse, Weg, Wiese, Hecken, Bäume, Blumen,
// Bank) und die Straße mit Gehwegen, Laternen, Häusern gegenüber und fahrenden Autos. Dazu Himmel und Dunst.
// Der Spieler kann in den Garten und auf den Gehweg, aber nicht auf die Fahrbahn. Bewegung über Delta-Zeit.
import * as THREE from 'three';
import { ROOM_SIZE, ROOM_HEIGHT, WALL_THICKNESS, createWallGeometry, canvasTexture, speckle, rand } from './room.js';
import { ENTRANCE, FRONT_DOOR } from './entrance.js';
import { STORAGE_ROOM } from './storage-room.js';
import { OFFICE_ROOM } from './office.js';
import {
  createBench, createBlobs, createCar, createGardenLight, createHouse, createMailbox, createSky, createStreetLamp, createTrees,
} from '../models/outdoor-props.js';
import { enableShadows } from './util.js';
import { mergeStatic } from '../models/merge-static.js';

const T = WALL_THICKNESS;
const HALF = ROOM_SIZE / 2 + T;   // Außenkante der Halle
const PARAPET = 0.3;              // Attika über dem Dach
const ROOF = 0.15;                // Dachfläche über der Innendecke (sonst schauen die Deckenleuchten durch)

// Straßenquerschnitt (Welt-x): Hecke, Gehweg, Fahrbahn, Gehweg gegenüber
export const STREET = {
  hedgeX: -30, sidewalk: [-32.5, -30.3], road: [-39.5, -32.5], farSidewalk: [-41.7, -39.5], length: 240,
  lanes: [{ x: -37.75, dir: 1 }, { x: -34.25, dir: -1 }], // Rechtsverkehr: +z fährt auf der Seite mit kleinerem x
};
export const GARDEN = { x0: -29.7, x1: -HALF, z0: -12, z1: 12 };
// Gehwege für Passanten (world/pedestrians.js), von z = -END bis +END
export const SIDEWALK_LANES = [-31.4, -40.6];
export const SIDEWALK_END = 48;
const CAR_END = 75;               // Autos fahren von -CAR_END bis +CAR_END, dann geht es von vorn los

const inside = (p) => p.x > ENTRANCE.x0 - T && p.z > -HALF - 0.5 && p.z < STORAGE_ROOM.z1 + T + 0.5;

// ---------- Texturen ----------

function drawGrass(ctx, w, h) {
  ctx.fillStyle = '#5d8a3a';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `hsl(${rand(85, 105)}, ${rand(35, 55)}%, ${rand(22, 40)}%)`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, rand(2, 5));
  }
}

function drawPaving(ctx, w, h) {
  ctx.fillStyle = '#a9a6a0';
  ctx.fillRect(0, 0, w, h);
  const n = 4;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = `hsl(35, 5%, ${rand(60, 70)}%)`;
      ctx.fillRect(x * w / n + 2, y * h / n + 2, w / n - 4, h / n - 4);
    }
  }
  speckle(ctx, w, h, 4000, 0.08);
}

function drawGravel(ctx, w, h) {
  ctx.fillStyle = '#c4b8a2';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 7000; i++) {
    ctx.fillStyle = `hsl(${rand(25, 45)}, ${rand(10, 25)}%, ${rand(55, 80)}%)`;
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, rand(0.8, 2.2), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawAsphalt(ctx, w, h) {
  ctx.fillStyle = '#3d3f42';
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, 14000, 0.12);
}

function drawHedge(ctx, w, h) {
  ctx.fillStyle = '#2f5a24';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 6000; i++) {
    ctx.fillStyle = `hsl(${rand(90, 115)}, ${rand(35, 55)}%, ${rand(16, 34)}%)`;
    ctx.beginPath();
    ctx.ellipse(Math.random() * w, Math.random() * h, rand(1.5, 4), rand(1, 2.5), Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRender(ctx, w, h) {
  ctx.fillStyle = '#ddd6ca';
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, 12000, 0.06);
}

function drawSign(ctx, w, h) {
  ctx.fillStyle = '#1d2228';
  ctx.fillRect(0, 0, w, h);
  ctx.font = '800 92px "Segoe UI", Arial, sans-serif';
  ctx.textBaseline = 'middle';
  // Beide Wortteile ausmessen und zusammen mittig setzen, davor ein grüner Balken als Logo
  const first = ctx.measureText('DRUCKER').width;
  const total = 26 + 24 + first + ctx.measureText('CENTER').width;
  let x = (w - total) / 2;
  ctx.fillStyle = '#00ae42';
  ctx.fillRect(x, h / 2 - 34, 26, 68);
  x += 50;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('DRUCKER', x, h / 2 + 4);
  ctx.fillStyle = '#4ea8ff';
  ctx.fillText('CENTER', x + first, h / 2 + 4);
}

// ---------- Bauteile ----------

function box(w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

function flat(w, d, material, x, z, y = 0.005) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  return mesh;
}

const facadeMaterials = () => ({
  render: new THREE.MeshStandardMaterial({ map: canvasTexture(512, 512, drawRender), roughness: 0.95 }),
  plinth: new THREE.MeshStandardMaterial({ color: 0x6f6c68, roughness: 0.9 }),
  coping: new THREE.MeshStandardMaterial({ color: 0x8e9196, metalness: 0.5, roughness: 0.4 }),
  frame: new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.5 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x2a3b4c, metalness: 0.6, roughness: 0.08 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x7c7a76, roughness: 1 }),
});

// Fassadenstück von a nach b (Welt-xz), Außenseite zeigt nach normal. windows: Abstand entlang der Wand (Welt) und
// Maße wie die Hallenfenster; door: Öffnung (Welt-Mittelpunkt entlang der Wand, Breite, Höhe)
function facade(m, a, b, normal, height, { windows = [], door = null } = {}) {
  const g = new THREE.Group();
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const along = new THREE.Vector3((b.x - a.x) / len, 0, (b.z - a.z) / len);
  const center = new THREE.Vector3((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
  const rotY = Math.atan2(normal.x, normal.z);
  const localAxis = new THREE.Vector3(Math.cos(rotY), 0, -Math.sin(rotY)); // lokales +x in Weltkoordinaten
  const sign = Math.sign(localAxis.dot(along)) || 1;
  const localX = (t) => sign * (t - len / 2); // t: Abstand von a entlang der Wand
  const doors = door ? [{ x: localX(door.t), w: door.w, h: door.h }] : [];
  const wall = new THREE.Mesh(createWallGeometry(len, height, doors), m.render);
  wall.receiveShadow = true;
  g.add(wall);
  // Sockel und Abdeckblech oben (an der Tür unterbrochen)
  const segments = door ? [[-len / 2, localX(door.t) - door.w / 2], [localX(door.t) + door.w / 2, len / 2]].map((s) => s.sort((p, q) => p - q)) : [[-len / 2, len / 2]];
  for (const [s0, s1] of segments) if (s1 - s0 > 0.01) g.add(box(s1 - s0, 0.45, 0.04, m.plinth, (s0 + s1) / 2, 0.225, 0.02));
  g.add(box(len + 0.04, 0.08, T + 0.12, m.coping, 0, height + 0.04, -T / 2 + 0.06));
  for (const t of windows) {
    const x = localX(t);
    g.add(box(1.6, 1.4, 0.02, m.glass, x, 1.7, 0.01));
    for (const [w, h, px, py] of [[1.74, 0.07, x, 2.435], [1.74, 0.07, x, 0.965], [0.07, 1.4, x - 0.835, 1.7], [0.07, 1.4, x + 0.835, 1.7], [0.05, 1.4, x, 1.7]]) {
      g.add(box(w, h, 0.06, m.frame, px, py, 0.03));
    }
    g.add(box(1.9, 0.05, 0.18, m.coping, x, 0.94, 0.09)); // Fensterbank
  }
  g.position.copy(center);
  g.rotation.y = rotY;
  return g;
}

// Flachdach mit Kies: Rechteck auf Höhe height
function roof(m, x0, x1, z0, z1, height) {
  return flat(x1 - x0, z1 - z0, m.roof, (x0 + x1) / 2, (z0 + z1) / 2, height);
}

function hedge(material, x0, x1, z0, z1, height = 1.15) {
  // Eigene Texturwiederholung je Hecke, sonst werden die Blätter auf langen Hecken in die Länge gezogen
  const m = material.clone();
  m.map = material.map.clone();
  m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping;
  m.map.repeat.set(Math.max(x1 - x0, z1 - z0) / 1.2, height / 1.2);
  m.map.needsUpdate = true;
  const mesh = box(x1 - x0, height, z1 - z0, m, (x0 + x1) / 2, height / 2, (z0 + z1) / 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------- Draußen ----------

// collision: Kollision der Spielfigur · scene: für Nebel
export function createOutdoor({ collision, scene }) {
  const group = new THREE.Group();
  const sky = createSky(92);
  scene.fog = new THREE.Fog(0xd3e6f3, 45, 95);

  // Boden: Wiese überall, darauf Wege, Terrasse, Gehwege und Fahrbahn
  const grassTex = canvasTexture(512, 512, drawGrass, 60, 60);
  const ground = flat(240, 240, new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }), -20, 0, -0.02);
  group.add(ground);

  const paving = new THREE.MeshStandardMaterial({ map: canvasTexture(256, 256, drawPaving, 1, 1), roughness: 0.9 });
  const repeat = (mat, rx, ry) => {
    const m = mat.clone();
    m.map = mat.map.clone();
    m.map.repeat.set(rx, ry);
    m.map.needsUpdate = true;
    return m;
  };
  // Terrasse vor der Haustür und Weg zum Gehweg
  const terraceW = 4;
  group.add(flat(terraceW, 6, repeat(paving, terraceW / 1.2, 5), ENTRANCE.x0 - T - terraceW / 2, 0, 0.004));
  const gravel = new THREE.MeshStandardMaterial({ map: canvasTexture(256, 256, drawGravel, 1, 1), roughness: 1 });
  const pathX0 = STREET.hedgeX;
  const pathX1 = ENTRANCE.x0 - T - terraceW;
  group.add(flat(pathX1 - pathX0, 1.8, repeat(gravel, (pathX1 - pathX0) / 2, 1), (pathX0 + pathX1) / 2, FRONT_DOOR.z, 0.004));

  // Gehwege mit Bordstein, Fahrbahn mit Mittellinie
  const [s0, s1] = STREET.sidewalk;
  const [f0, f1] = STREET.farSidewalk;
  const [r0, r1] = STREET.road;
  const L = STREET.length;
  group.add(flat(s1 - s0, L, repeat(paving, (s1 - s0) / 1.2, L / 1.2), (s0 + s1) / 2, 0, 0.03));
  group.add(flat(f1 - f0, L, repeat(paving, (f1 - f0) / 1.2, L / 1.2), (f0 + f1) / 2, 0, 0.03));
  group.add(flat(r1 - r0, L, new THREE.MeshStandardMaterial({ map: canvasTexture(256, 256, drawAsphalt, 4, L / 3.5), roughness: 0.9 }), (r0 + r1) / 2, 0, 0.006));
  const curb = new THREE.MeshStandardMaterial({ color: 0xb9b6b0, roughness: 0.8 });
  group.add(box(0.15, 0.12, L, curb, r1 + 0.075, 0.06, 0), box(0.15, 0.12, L, curb, r0 - 0.075, 0.06, 0));
  const marking = new THREE.MeshBasicMaterial({ color: 0xe8e8e2 });
  const center = (r0 + r1) / 2;
  for (let z = -L / 2; z < L / 2; z += 6) group.add(flat(0.12, 3, marking, center, z, 0.012));
  for (const x of [r0 + 0.25, r1 - 0.25]) group.add(flat(0.1, L, marking, x, 0, 0.011));

  // Fassaden und Dächer: Halle, Lager, Büro und Eingangsbereich
  const m = facadeMaterials();
  const top = (h) => h + ROOF + PARAPET; // Oberkante der Fassade bei Innenhöhe h
  const hallH = top(ROOM_HEIGHT);
  const eZ = ENTRANCE.z1 + T;                 // Eingangsbereich ragt bis ±eZ aus der Halle
  const st = STORAGE_ROOM;
  const of = OFFICE_ROOM;
  const N = (x, z) => new THREE.Vector3(x, 0, z);
  const P = (x, z) => ({ x, z });
  group.add(
    facade(m, P(-HALF, -HALF), P(HALF, -HALF), N(0, -1), hallH, { windows: [HALF - 6, HALF, HALF + 6] }),
    facade(m, P(-HALF, -HALF), P(-HALF, -eZ), N(-1, 0), hallH, { windows: [HALF - 4] }),
    facade(m, P(-HALF, eZ), P(-HALF, HALF), N(-1, 0), hallH, { windows: [4 - eZ] }),
    facade(m, P(-HALF, HALF), P(st.x0 - T, HALF), N(0, 1), hallH),
    facade(m, P(st.x1 + T, HALF), P(HALF, HALF), N(0, 1), hallH),
    facade(m, P(HALF, -HALF), P(HALF, of.z0 - T), N(1, 0), hallH, { windows: [HALF - 4] }),
    facade(m, P(HALF, of.z1 + T), P(HALF, HALF), N(1, 0), hallH, { windows: [4 - of.z1 - T] }),
    // Lager
    facade(m, P(st.x0 - T, HALF), P(st.x0 - T, st.z1 + T), N(-1, 0), top(st.height)),
    facade(m, P(st.x0 - T, st.z1 + T), P(st.x1 + T, st.z1 + T), N(0, 1), top(st.height)),
    facade(m, P(st.x1 + T, HALF), P(st.x1 + T, st.z1 + T), N(1, 0), top(st.height)),
    // Büro
    facade(m, P(HALF, of.z0 - T), P(of.x1 + T, of.z0 - T), N(0, -1), top(of.height)),
    facade(m, P(HALF, of.z1 + T), P(of.x1 + T, of.z1 + T), N(0, 1), top(of.height)),
    facade(m, P(of.x1 + T, of.z0 - T), P(of.x1 + T, of.z1 + T), N(1, 0), top(of.height)),
    // Eingangsbereich mit Haustür
    facade(m, P(ENTRANCE.x0 - T, -eZ), P(-HALF, -eZ), N(0, -1), top(ENTRANCE.height)),
    facade(m, P(ENTRANCE.x0 - T, eZ), P(-HALF, eZ), N(0, 1), top(ENTRANCE.height)),
    facade(m, P(ENTRANCE.x0 - T, -eZ), P(ENTRANCE.x0 - T, eZ), N(-1, 0), top(ENTRANCE.height),
      { door: { t: eZ + FRONT_DOOR.z, w: FRONT_DOOR.w, h: FRONT_DOOR.h } }),
  );
  group.add(
    roof(m, -HALF, HALF, -HALF, HALF, ROOM_HEIGHT + ROOF),
    roof(m, st.x0 - T, st.x1 + T, HALF, st.z1 + T, st.height + ROOF),
    roof(m, HALF, of.x1 + T, of.z0 - T, of.z1 + T, of.height + ROOF),
    roof(m, ENTRANCE.x0 - T, -HALF, -eZ, eZ, ENTRANCE.height + ROOF),
  );

  // Vordach über der Haustür und Firmenschild
  const canopy = box(1.4, 0.08, 2.6, m.coping, ENTRANCE.x0 - T - 0.7, FRONT_DOOR.h + 0.3, FRONT_DOOR.z);
  canopy.castShadow = true;
  group.add(canopy);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 0.5),
    new THREE.MeshStandardMaterial({ map: canvasTexture(1024, 150, drawSign), emissive: 0xffffff, emissiveIntensity: 0.15, emissiveMap: null, roughness: 0.4 })
  );
  sign.material.emissiveMap = sign.material.map;
  sign.rotation.y = -Math.PI / 2;
  sign.position.set(ENTRANCE.x0 - T - 0.02, ENTRANCE.height + 0.05, FRONT_DOOR.z); // über dem Vordach
  group.add(sign);

  // Hecken um den Garten, Zaunstücke zur Hallenecke, Hecken der Nachbargrundstücke am Gehweg
  const hedgeMat = new THREE.MeshStandardMaterial({ map: canvasTexture(256, 256, drawHedge), roughness: 0.95 });
  const hx = STREET.hedgeX;
  const hedges = [
    [hx - 0.3, hx + 0.3, -SIDEWALK_END, FRONT_DOOR.z - 0.9],
    [hx - 0.3, hx + 0.3, FRONT_DOOR.z + 0.9, SIDEWALK_END],
    [hx + 0.3, -HALF, GARDEN.z0 - 0.3, GARDEN.z0 + 0.3],
    [hx + 0.3, -HALF, GARDEN.z1 - 0.3, GARDEN.z1 + 0.3],
  ];
  for (const [x0, x1, z0, z1] of hedges) {
    group.add(hedge(hedgeMat, x0, x1, z0, z1));
    collision.addBox({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 });
  }
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x3b3f44, metalness: 0.5, roughness: 0.5 });
  for (const side of [-1, 1]) {
    const z0 = side * HALF;
    const z1 = side * (GARDEN.z1 + 0.3);
    const fence = new THREE.Group();
    const len = Math.abs(z1 - z0);
    fence.add(box(0.05, 0.05, len, fenceMat, 0, 1.15, 0), box(0.05, 0.05, len, fenceMat, 0, 0.15, 0));
    for (let i = 0; i <= len / 0.12; i++) fence.add(box(0.025, 1.1, 0.025, fenceMat, 0, 0.62, -len / 2 + i * 0.12));
    fence.position.set(-HALF - 0.05, 0, (z0 + z1) / 2);
    group.add(fence);
    collision.addBox({ minX: -HALF - 0.15, maxX: -HALF, minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1) });
  }
  // Ränder für den Spieler: Bordstein zur Fahrbahn und Enden des Gehwegs
  collision.addBox({ minX: s0 - 0.2, maxX: s0, minZ: -SIDEWALK_END, maxZ: SIDEWALK_END });
  for (const side of [-1, 1]) collision.addBox({ minX: s0 - 0.2, maxX: hx, minZ: side * SIDEWALK_END - 0.2, maxZ: side * SIDEWALK_END + 0.2 });

  // Bäume: Garten, Straßenbäume auf beiden Seiten, Nachbargrundstücke
  const trees = [
    { x: -25.5, z: -8.5, scale: 1.35 }, { x: -21, z: 8.2, scale: 1.15 }, { x: -26.5, z: 6, scale: 0.9 },
    { x: -13.5, z: -8.8, scale: 1.0 }, { x: -18, z: -6, scale: 0.75 },
  ];
  const gardenTrees = [...trees];
  for (let z = -SIDEWALK_END + 6; z < SIDEWALK_END; z += 12) {
    if (Math.abs(z) > 3) trees.push({ x: s0 + 0.55, z, scale: 1.1 + Math.random() * 0.2 });
    trees.push({ x: f0 + 0.6, z: z + 6, scale: 1.0 + Math.random() * 0.3 });
  }
  // Weitere Bäume verstreut – nicht auf Straße und Gehwegen, nicht in Häusern
  const blocked = (x, z) => (x > f0 - 1.5 && x < hx + 1)
    || (Math.abs(x + 53) < 7 && Math.abs(z) < 47)
    || (Math.abs(x + 22) < 7 && Math.abs(Math.abs(z) - 24) < 7);
  for (let i = 0; trees.length < 70 && i < 400; i++) {
    const x = rand(-75, 30);
    const z = (i % 2 ? 1 : -1) * rand(16, 75);
    if (!blocked(x, z)) trees.push({ x, z, scale: rand(0.9, 1.6) });
  }
  group.add(createTrees(trees));
  for (const t of gardenTrees) collision.addBox({ minX: t.x - 0.25, maxX: t.x + 0.25, minZ: t.z - 0.25, maxZ: t.z + 0.25 });

  // Büsche entlang der Fassade und Blumenbeete am Weg
  const bushes = [];
  for (let z = -9.5; z <= 9.5; z += 1.2) if (Math.abs(z) > eZ + 0.5) bushes.push({ x: -HALF - 0.7, z, size: rand(0.45, 0.65) });
  for (const z of [-2.6, 2.6]) for (let x = -22; x <= -19.2; x += 0.9) bushes.push({ x, z, size: rand(0.35, 0.5) });
  group.add(createBlobs(bushes, '#3e6e2c', 0.75));
  const flowerColors = ['#e8456b', '#f2c418', '#f08a24', '#b05cd6', '#ffffff', '#ff6f91'];
  const flowers = [];
  const leaves = []; // grünes Laub unter den Blüten
  for (const side of [-1, 1]) {
    for (let x = pathX0 + 1.5; x < pathX1 - 0.5; x += 0.35) {
      for (const dz of [1.15, 1.55]) {
        flowers.push({ x: x + rand(-0.08, 0.08), y: rand(0.2, 0.3), z: FRONT_DOOR.z + side * (dz + rand(-0.06, 0.06)), size: rand(0.045, 0.07), color: flowerColors[Math.floor(Math.random() * flowerColors.length)] });
        leaves.push({ x: x + rand(-0.1, 0.1), z: FRONT_DOOR.z + side * (dz + rand(-0.08, 0.08)), size: rand(0.12, 0.16) });
      }
    }
  }
  group.add(createBlobs(leaves, '#4b7a32', 0.9), createBlobs(flowers, '#ffffff', 0.8));
  // Beete unter den Blumen
  const soil = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 });
  for (const side of [-1, 1]) group.add(flat(pathX1 - pathX0 - 1.5, 0.75, soil, (pathX0 + 1.5 + pathX1) / 2 - 0.25, FRONT_DOOR.z + side * 1.35, 0.003));

  // Bank, Gartenleuchten, Briefkasten
  const bench = createBench();
  bench.position.set(-23.5, 0, -4.2);
  group.add(bench);
  collision.addBox({ minX: -24.35, maxX: -22.65, minZ: -4.5, maxZ: -3.85 });
  for (let x = pathX0 + 2; x < pathX1; x += 4) {
    for (const side of [-1, 1]) {
      const light = createGardenLight();
      light.position.set(x, 0, FRONT_DOOR.z + side * 1.0);
      group.add(light);
    }
  }
  const mailbox = createMailbox();
  mailbox.position.set(hx + 0.55, 0, FRONT_DOOR.z + 1.25);
  mailbox.rotation.y = -Math.PI / 2;
  group.add(mailbox);

  // Laternen am Gehweg, Häuser gegenüber und auf den Nachbargrundstücken
  for (let z = -SIDEWALK_END; z <= SIDEWALK_END; z += 16) {
    const lamp = createStreetLamp();
    lamp.position.set(s0 + 0.3, 0, z + 4);
    lamp.rotation.y = -Math.PI / 2;
    group.add(lamp);
  }
  const houseStyles = [
    { wall: '#e8dcc8', roof: 0x8c3b2a }, { wall: '#d6e2e8', roof: 0x3f4448 }, { wall: '#f0e2b6', roof: 0x7a3426 },
    { wall: '#e6d0c6', roof: 0x4a4a4a }, { wall: '#dfe6d2', roof: 0x803a2a },
  ];
  [-40, -20, 0, 20, 40].forEach((z, i) => {
    const house = createHouse({ w: rand(9, 12), d: 9, h: rand(5.6, 6.6), ...houseStyles[i] });
    house.position.set(-53, 0, z);
    house.rotation.y = Math.PI / 2; // Vorderseite zur Straße (+x)
    group.add(house);
  });
  for (const [x, z, rotY, style] of [[-22, -24, -Math.PI / 2, 1], [-22, 24, -Math.PI / 2, 3]]) {
    const house = createHouse({ w: 10, d: 9, h: 6, ...houseStyles[style] });
    house.position.set(x, 0, z);
    house.rotation.y = rotY;
    group.add(house);
  }

  enableShadows(group);
  ground.castShadow = false;
  // Häuser, Zäune, Laternen, Wege … pro Material und Raster-Feld zu je einem Mesh zusammenfassen
  mergeStatic(group, { cell: 12 });

  // Autos auf beiden Fahrspuren
  const carColors = [0xc8102e, 0x1f4e9c, 0xe8e8e8, 0x2b2d30, 0x8a9198, 0x2e6b3a];
  const cars = Array.from({ length: 5 }, (_, i) => {
    const lane = STREET.lanes[i % 2];
    const mesh = createCar(carColors[i % carColors.length], rand(3.9, 4.6));
    const car = { mesh, lane, speed: rand(8, 12), z: rand(-CAR_END, CAR_END) };
    mesh.rotation.y = lane.dir > 0 ? 0 : Math.PI;
    group.add(mesh);
    return car;
  });

  // camera: Himmel folgt ihr · outsideVisible: ob man die Außenwelt gerade sehen kann (world/room-culling.js) –
  // sonst bleibt sie unsichtbar
  function update(dt, camera, outsideVisible) {
    sky.position.copy(camera.position);
    group.visible = outsideVisible;
    sky.visible = outsideVisible;
    for (const car of cars) {
      car.z += car.lane.dir * car.speed * dt;
      if (car.z > CAR_END) car.z = -CAR_END;
      if (car.z < -CAR_END) car.z = CAR_END;
      car.mesh.position.set(car.lane.x, 0, car.z);
      for (const wheel of car.mesh.userData.wheels) wheel.rotation.x += (car.speed * dt) / 0.33;
    }
  }

  return { group, sky, update, isOutside: (p) => !inside(p) };
}
