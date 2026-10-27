// Raum: Holzdielenboden, verputzte Wände mit Wandvertäfelung, Fenster mit hellblauem Himmel,
// Decke mit Leuchten. Alle Texturen werden prozedural per Canvas erzeugt (keine Bilddateien nötig).
import * as THREE from 'three';
import { box } from '../models/mesh-helpers.js';
import { canvasTexture, rand, speckle } from '../models/canvas-texture.js';
import { mergeStatic } from '../models/merge-static.js';

export const ROOM_SIZE = 20;      // m, quadratisch
export const ROOM_HEIGHT = 3.5;   // m
export const WALL_THICKNESS = 0.2;
export const STORAGE_DOOR = { x: -5, w: 1.0, h: 2.1 }; // Tür zum Abstellraum in der Südwand (Welt-x)
export const OFFICE_DOOR = { z: 0, w: 1.0, h: 2.1 };   // Tür zum Büro der Azubis in der Ostwand (Welt-z)
export const ENTRANCE_DOOR = { z: 0, w: 1.2, h: 2.1 }; // Tür zum Empfang in der Westwand (Welt-z), dahinter geht es raus

const WAINSCOT_HEIGHT = 1.0;      // Vertäfelung unten an der Wand
const WINDOW_SILL = 1.0;          // Unterkante Fenster
const WINDOW_W = 1.6;
const WINDOW_H = 1.4;

// ---------- Prozedurale Texturen ----------

// Liegen in models/canvas-texture.js; hier weitergereicht für die bisherigen Importeure
export { canvasTexture, rand, speckle };

// Holzdielen: Spalten mit versetzten Stößen, jede Diele leicht anders gefärbt, mit Maserung
function drawPlanks(ctx, w, h) {
  const columns = 8;
  const pw = w / columns;
  for (let c = 0; c < columns; c++) {
    const x = c * pw;
    let y = rand(0, h);        // zufälliger Startpunkt, damit Stöße nicht in einer Linie liegen
    const end = y + h;
    while (y < end) {
      const len = Math.min(rand(h * 0.3, h * 0.75), end - y);
      const hue = rand(24, 34);
      const sat = rand(38, 52);
      const light = rand(30, 42);
      // Zweimal zeichnen (y und y - h), damit die Textur nahtlos kachelt
      for (const yy of [y, y - h]) {
        const grad = ctx.createLinearGradient(x, 0, x + pw, 0);
        grad.addColorStop(0, `hsl(${hue},${sat}%,${light - 2}%)`);
        grad.addColorStop(0.5, `hsl(${hue},${sat}%,${light + 2}%)`);
        grad.addColorStop(1, `hsl(${hue},${sat}%,${light - 1}%)`);
        ctx.fillStyle = grad;
        ctx.fillRect(x, yy, pw, len);

        // Maserung: leicht gewellte Längslinien
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, yy, pw, len);
        ctx.clip();
        for (let g = 0; g < 14; g++) {
          const gx = x + rand(4, pw - 4);
          const amp = rand(1, 4);
          const freq = rand(0.01, 0.03);
          ctx.strokeStyle = `rgba(40,20,5,${rand(0.06, 0.18)})`;
          ctx.lineWidth = rand(0.6, 1.8);
          ctx.beginPath();
          for (let s = 0; s <= len; s += 8) {
            const px = gx + Math.sin((yy + s) * freq + g) * amp;
            if (s === 0) ctx.moveTo(px, yy + s); else ctx.lineTo(px, yy + s);
          }
          ctx.stroke();
        }
        // Astloch, selten
        if (Math.random() < 0.15) {
          const kx = x + rand(15, pw - 15);
          const ky = yy + rand(20, len - 20);
          ctx.fillStyle = 'rgba(50,25,8,0.35)';
          ctx.beginPath();
          ctx.ellipse(kx, ky, rand(3, 6), rand(6, 12), 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        // Fuge am Dielenende
        ctx.fillStyle = 'rgba(20,10,4,0.75)';
        ctx.fillRect(x, yy, pw, 2);
      }
      y += len;
    }
    // Längsfuge
    ctx.fillStyle = 'rgba(20,10,4,0.8)';
    ctx.fillRect(x, 0, 2, h);
  }
  speckle(ctx, w, h, 6000, 0.04);
}

function drawPlaster(base) {
  return (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 9000, 0.05);
  };
}

// Vertäfelung: ein Kassettenfeld pro Kachel mit angedeuteter Fase
function drawWainscotPanel(ctx, w, h) {
  ctx.fillStyle = '#3f5363';
  ctx.fillRect(0, 0, w, h);
  const inset = 26;
  const bevel = 6;
  ctx.fillStyle = '#4a6072';
  ctx.fillRect(inset, inset, w - inset * 2, h - inset * 2);
  // Licht von oben links, Schatten unten rechts
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(inset, inset, w - inset * 2, bevel);
  ctx.fillRect(inset, inset, bevel, h - inset * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(inset, h - inset - bevel, w - inset * 2, bevel);
  ctx.fillRect(w - inset - bevel, inset, bevel, h - inset * 2);
  speckle(ctx, w, h, 1500, 0.04);
}

function drawSky(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#7fbfee');
  grad.addColorStop(1, '#d4ecff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

// ---------- Bauteile ----------

const trimMaterial = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.5 });

// Fenster in lokalen Wandkoordinaten: Wand liegt bei z = 0, Raum ist auf +z
function createWindow(skyMaterial, glassMaterial) {
  const win = new THREE.Group();
  const cy = WINDOW_SILL + WINDOW_H / 2;
  const frame = 0.07;
  const depth = 0.08;

  const sky = new THREE.Mesh(new THREE.PlaneGeometry(WINDOW_W, WINDOW_H), skyMaterial);
  sky.position.set(0, cy, 0.004);
  win.add(sky);

  const glass = new THREE.Mesh(new THREE.PlaneGeometry(WINDOW_W, WINDOW_H), glassMaterial);
  glass.position.set(0, cy, 0.03);
  win.add(glass);

  // Blendrahmen
  const outerW = WINDOW_W + frame * 2;
  win.add(
    box(outerW, frame, depth, trimMaterial, 0, WINDOW_SILL + WINDOW_H + frame / 2, depth / 2),
    box(outerW, frame, depth, trimMaterial, 0, WINDOW_SILL - frame / 2, depth / 2),
    box(frame, WINDOW_H, depth, trimMaterial, -WINDOW_W / 2 - frame / 2, cy, depth / 2),
    box(frame, WINDOW_H, depth, trimMaterial, WINDOW_W / 2 + frame / 2, cy, depth / 2)
  );

  // Sprossen: Mittelpfosten und Kämpfer im oberen Drittel
  const bar = 0.045;
  const transomY = WINDOW_SILL + WINDOW_H * 0.68;
  win.add(
    box(bar, WINDOW_H, depth * 0.7, trimMaterial, 0, cy, depth * 0.35),
    box(WINDOW_W, bar, depth * 0.7, trimMaterial, 0, transomY, depth * 0.35)
  );

  // Griffe an beiden Flügeln
  const handleMaterial = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, metalness: 0.8, roughness: 0.3 });
  for (const side of [-1, 1]) {
    win.add(box(0.02, 0.12, 0.025, handleMaterial, side * 0.06, WINDOW_SILL + WINDOW_H * 0.4, depth * 0.7 + 0.012));
  }

  // Fensterbank
  win.add(box(outerW + 0.16, 0.04, 0.22, trimMaterial, 0, WINDOW_SILL - frame - 0.02, 0.11));

  win.traverse((o) => { if (o.isMesh && o !== sky && o !== glass) o.castShadow = true; });
  return win;
}

// Wandfläche (Ursprung unten mittig, Vorderseite +z) mit rechteckigen Türausschnitten { x, w, h }.
// UVs in Weltmaßen: eine Texturkachel entspricht 2 × 2 m, egal wie lang die Wand ist.
export function createWallGeometry(length, height, doors = []) {
  const shape = new THREE.Shape();
  shape.moveTo(-length / 2, 0);
  for (const d of [...doors].sort((a, b) => a.x - b.x)) {
    shape.lineTo(d.x - d.w / 2, 0);
    shape.lineTo(d.x - d.w / 2, d.h);
    shape.lineTo(d.x + d.w / 2, d.h);
    shape.lineTo(d.x + d.w / 2, 0);
  }
  shape.lineTo(length / 2, 0);
  shape.lineTo(length / 2, height);
  shape.lineTo(-length / 2, height);
  shape.closePath();

  const geo = new THREE.ShapeGeometry(shape);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + length / 2) / 2, pos.getY(i) / 2);
  }
  return geo;
}

const DOOR_TRIM = 0.08;

// Wandabschnitte links/rechts der Türen (inklusive Türrahmenbreite)
function openSegments(length, doors) {
  const segments = [];
  let start = -length / 2;
  for (const d of [...doors].sort((a, b) => a.x - b.x)) {
    segments.push([start, d.x - d.w / 2 - DOOR_TRIM]);
    start = d.x + d.w / 2 + DOOR_TRIM;
  }
  segments.push([start, length / 2]);
  return segments.filter(([a, b]) => b - a > 0.01);
}

// Vertäfelung braucht pro Abschnitt eine eigene Wiederholung, sonst werden die Kassetten verzerrt
function wainscotMaterial(base, length) {
  const material = base.clone();
  material.map = base.map.clone();
  material.map.repeat.set(length / 0.8, 1);
  material.map.needsUpdate = true;
  return material;
}

const revealMaterial = new THREE.MeshStandardMaterial({ color: 0xe2dccf, roughness: 0.9 });

function createSign(text) {
  const texture = canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#2b3440';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#e8e4da';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = '#e8e4da';
    ctx.font = '600 64px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 4);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.12), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.5 }));
}

// Türöffnung zur Raumseite: Rahmen, Laibung durch die Wanddicke, Schwelle, Schild (d.label, sonst „LAGER“)
function createDoorway(d) {
  const door = new THREE.Group();
  const t = WALL_THICKNESS;

  for (const side of [-1, 1]) {
    door.add(box(DOOR_TRIM, d.h + DOOR_TRIM / 2, 0.03, trimMaterial, d.x + side * (d.w / 2 + DOOR_TRIM / 2), (d.h + DOOR_TRIM / 2) / 2, 0.015));
    const jamb = new THREE.Mesh(new THREE.PlaneGeometry(t, d.h), revealMaterial);
    jamb.rotation.y = -side * Math.PI / 2; // links nach +x, rechts nach -x
    jamb.position.set(d.x + side * d.w / 2, d.h / 2, -t / 2);
    door.add(jamb);
  }
  door.add(box(d.w + DOOR_TRIM * 2, DOOR_TRIM, 0.03, trimMaterial, d.x, d.h + DOOR_TRIM / 2, 0.015));
  const head = new THREE.Mesh(new THREE.PlaneGeometry(d.w, t), revealMaterial);
  head.rotation.x = Math.PI / 2; // zeigt nach unten
  head.position.set(d.x, d.h, -t / 2);
  door.add(head);

  const threshold = box(d.w, 0.01, t, new THREE.MeshStandardMaterial({ color: 0x8a8d91, metalness: 0.6, roughness: 0.4 }), d.x, 0.005, -t / 2);
  door.add(threshold);

  const sign = createSign(d.label ?? 'LAGER');
  sign.position.set(d.x, d.h + 0.3, 0.004);
  door.add(sign);
  return door;
}

// keepWindowAt: dieses Fenster bleibt ein eigenes Objekt (userData), damit es sich später ausblenden lässt
function createWall(length, windowsAt, materials, doors = [], keepWindowAt = null) {
  const wall = new THREE.Group();

  const plaster = new THREE.Mesh(createWallGeometry(length, ROOM_HEIGHT, doors), materials.plaster);
  plaster.receiveShadow = true;
  wall.add(plaster);

  // Vertäfelung, Sockelleiste und Abschlussleiste – an Türen unterbrochen
  for (const [a, b] of openSegments(length, doors)) {
    const len = b - a;
    const cx = (a + b) / 2;
    const wainscot = box(len, WAINSCOT_HEIGHT, 0.02, wainscotMaterial(materials.wainscot, len), cx, WAINSCOT_HEIGHT / 2, 0.01);
    wainscot.receiveShadow = true;
    wall.add(
      wainscot,
      box(len, 0.1, 0.03, trimMaterial, cx, 0.05, 0.015),
      box(len, 0.04, 0.04, trimMaterial, cx, WAINSCOT_HEIGHT, 0.02)
    );
  }
  wall.add(box(length, 0.06, 0.05, trimMaterial, 0, ROOM_HEIGHT - 0.03, 0.025)); // Deckenleiste

  for (const d of doors) wall.add(createDoorway(d));

  for (const x of windowsAt) {
    const win = createWindow(materials.sky, materials.glass);
    win.position.x = x;
    if (x === keepWindowAt) win.userData.keep = true;
    wall.add(win);
  }
  return wall;
}

function createCeilingLight() {
  const lamp = new THREE.Group();
  lamp.add(box(1.24, 0.06, 0.34, new THREE.MeshStandardMaterial({ color: 0xdadada, roughness: 0.4 }), 0, -0.03, 0));
  const diffuser = new THREE.Mesh(
    new THREE.PlaneGeometry(1.16, 0.26),
    // Heller als Weiß, damit der Bloom-Effekt die Leuchten nachglühen lässt
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6e8).multiplyScalar(5) })
  );
  diffuser.rotation.x = Math.PI / 2;
  diffuser.position.y = -0.061;
  lamp.add(diffuser);

  // Panel strahlt wie ein echtes nur nach unten (breiter Spot), die Decke bleibt dadurch ohne grellen Fleck.
  // Reichweite begrenzt, damit das Licht nicht durch die Wand in den Abstellraum scheint.
  const light = new THREE.SpotLight(0xfff1dc, 16, 11, Math.PI * 0.42, 0.8, 2);
  light.position.y = -0.07;
  light.target.position.set(0, -1, 0);
  lamp.add(light, light.target);
  return lamp;
}

// ---------- Raum ----------

// Lackierte Dielen: Klarlack spiegelt Leuchten und Fenster, die Maserung gibt per Bump-Map Struktur.
// repeat: Wiederholungen der Textur über die Fläche (bei Geometrie mit UVs in Metern 1 / 1,6)
export function floorMaterial(repeat = ROOM_SIZE / 1.6) {
  const planks = canvasTexture(1024, 1024, drawPlanks, repeat, repeat);
  return new THREE.MeshPhysicalMaterial({
    map: planks,
    bumpMap: planks,
    bumpScale: 0.6,
    roughness: 0.6,
    clearcoat: 0.55,
    clearcoatRoughness: 0.18,
  });
}

export const ceilingMaterial = (repeat = 8) => new THREE.MeshStandardMaterial({
  map: canvasTexture(512, 512, drawPlaster('#f4f3ef'), repeat, repeat), roughness: 0.95,
});

// Materialien der Hallenwände (einmal angelegt, auch für die zweite Etage in world/upper-floor.js)
let wallMaterials = null;
function hallWallMaterials() {
  wallMaterials ??= {
    plaster: new THREE.MeshStandardMaterial({
      map: canvasTexture(512, 512, drawPlaster('#e9e3d8')), // Wand-UVs sind in Weltmaßen
      roughness: 0.95,
    }),
    wainscot: new THREE.MeshStandardMaterial({
      map: canvasTexture(256, 320, drawWainscotPanel, ROOM_SIZE / 0.8, 1),
      roughness: 0.6,
    }),
    sky: new THREE.MeshBasicMaterial({ map: canvasTexture(64, 256, drawSky) }),
    glass: new THREE.MeshStandardMaterial({
      color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.1, depthWrite: false,
    }),
  };
  return wallMaterials;
}

// Hallenwand mit Fenstern (Positionen entlang der Wand), wie im Erdgeschoss – für die zweite Etage
export const createHallWall = (length, windowsAt) => createWall(length, windowsAt, hallWallMaterials());
export { createCeilingLight };

export function createRoom() {
  const room = new THREE.Group();
  const half = ROOM_SIZE / 2;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE), floorMaterial());
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  room.add(floor);

  // Decke bleibt ein eigenes Mesh (userData), damit die zweite Etage sie gegen eine Decke mit Treppenloch tauschen kann
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE), ceilingMaterial());
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM_HEIGHT;
  ceiling.userData.hallCeiling = true;
  room.add(ceiling);
  room.userData.ceiling = ceiling;

  const materials = hallWallMaterials();

  // Lokale +z jeder Wand zeigt in den Raum. Die Südwand ist um 180° gedreht,
  // daher liegt die Tür dort lokal bei -STORAGE_DOOR.x. Bei der Ostwand entspricht lokales x der Welt-z.
  const southDoor = { ...STORAGE_DOOR, x: -STORAGE_DOOR.x };
  const eastDoor = { x: OFFICE_DOOR.z, w: OFFICE_DOOR.w, h: OFFICE_DOOR.h, label: 'BÜRO' };
  // Westwand (rotY = π/2): lokales x entspricht der Welt -z
  const westDoor = { x: -ENTRANCE_DOOR.z, w: ENTRANCE_DOOR.w, h: ENTRANCE_DOOR.h, label: 'EMPFANG' };
  const walls = [
    { pos: [0, 0, -half], rotY: 0, windows: [-6, 0, 6] },                          // Nord
    { pos: [0, 0, half], rotY: Math.PI, windows: [], doors: [southDoor] },        // Süd
    { pos: [-half, 0, 0], rotY: Math.PI / 2, windows: [-4, 4], doors: [westDoor] }, // West
    // Ost – das nördliche Fenster (Welt-z −4) liegt hinter der Treppe zur zweiten Etage und verschwindet mit ihr
    { pos: [half, 0, 0], rotY: -Math.PI / 2, windows: [-4, 4], doors: [eastDoor], keep: -4 },
  ];
  for (const w of walls) {
    const wall = createWall(ROOM_SIZE, w.windows, materials, w.doors, w.keep);
    const kept = wall.children.find((c) => c.userData.keep);
    if (kept) room.userData.stairWindow = kept;
    wall.position.set(...w.pos);
    wall.rotation.y = w.rotY;
    room.add(wall);
  }

  // Deckenleuchten im 3×2-Raster
  for (const x of [-6, 0, 6]) {
    for (const z of [-4, 4]) {
      const lamp = createCeilingLight();
      lamp.position.set(x, ROOM_HEIGHT, z);
      room.add(lamp);
    }
  }

  // Wände, Leisten, Fenster und Lampengehäuse pro Material und Raster-Feld zu je einem Mesh zusammenfassen
  return mergeStatic(room, { cell: 7 });
}

// Wände als Kollisionsrechtecke (Wanddicke liegt außerhalb des Raums), mit Lücken für Lager-, Büro- und Empfangstür
export function roomColliders() {
  const h = ROOM_SIZE / 2;
  const t = WALL_THICKNESS;
  const d = STORAGE_DOOR;
  const o = OFFICE_DOOR;
  const w = ENTRANCE_DOOR;
  return [
    { minX: -h - t, maxX: h + t, minZ: -h - t, maxZ: -h },               // Nord
    { minX: -h - t, maxX: -h, minZ: -h, maxZ: w.z - w.w / 2 },           // West nördlich der Empfangstür
    { minX: -h - t, maxX: -h, minZ: w.z + w.w / 2, maxZ: h },            // West südlich der Empfangstür
    { minX: h, maxX: h + t, minZ: -h, maxZ: o.z - o.w / 2 },             // Ost nördlich der Bürotür
    { minX: h, maxX: h + t, minZ: o.z + o.w / 2, maxZ: h },              // Ost südlich der Bürotür
    { minX: -h - t, maxX: d.x - d.w / 2, minZ: h, maxZ: h + t },         // Süd links der Tür
    { minX: d.x + d.w / 2, maxX: h + t, minZ: h, maxZ: h + t },          // Süd rechts der Tür
  ];
}
