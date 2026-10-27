// 3D-Modelle der Einrichtung: Filament-Regal (8 Spulen auf zwei Böden), Ersatzteilregal (Sortimentskasten mit
// Ersatzdüsen) und Holzregal (Plattenständer für 10 Holzplatten) am Druckertisch, Ausstellungsregal an der Wand.
// Dazu die Ersatzdüse selbst, z. B. für die Hand.
// Ursprung: Mitte der Unterseite, Vorderseite zeigt nach +z (zum Spieler).
import * as THREE from 'three';
import { box } from './mesh-helpers.js';
import { mergeStatic } from './merge-static.js';
import { createServerHardwareModel } from './server-hardware.js';

const RACK = { w: 0.5, d: 0.3, h: 0.56, levels: [0.03, 0.29], perLevel: 4 };
const PARTS = { w: 0.42, d: 0.26, h: 0.34, cols: 4, rows: 3 };
// Ausstellungsregal: vier Ebenen (Sockel und drei Böden) mit je drei Fächern, dunkle Rückwand (davor leuchten Glow-Teile)
const DISPLAY = { w: 1.6, d: 0.36, h: 1.9, levels: [0.1, 0.55, 1.0, 1.45], perLevel: 3, board: 0.025, side: 0.03 };
// Holzregal: Platten (30 × 20 cm) stehen hochkant, lange Seite nach oben, Fläche zur Seite
const WOOD = { w: 0.48, d: 0.26, base: 0.02, slots: 10, sheetH: 0.3 };

let mats = null;
function materials() {
  mats ??= {
    steel: new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.5, metalness: 0.4 }),
    board: new THREE.MeshStandardMaterial({ color: 0xc8a878, roughness: 0.85 }),
    blue: new THREE.MeshStandardMaterial({ color: 0x2d5fa8, roughness: 0.55, metalness: 0.2 }),
    bin: new THREE.MeshStandardMaterial({ color: 0xe0702a, roughness: 0.6 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a043, roughness: 0.3, metalness: 0.9 }),
    label: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.8 }),
    oak: new THREE.MeshStandardMaterial({ color: 0x9a6f45, roughness: 0.7 }),
    backPanel: new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.9 }),
  };
  return mats;
}

// Filament-Regal: Metallrahmen mit zwei Holzböden. userData.spoolSpots: wo die Spulen liegen (Achse entlang x).
function createFilamentRack() {
  const m = materials();
  const g = new THREE.Group();
  const { w, d, h } = RACK;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) g.add(box(0.025, h, 0.025, m.steel, sx * (w / 2 - 0.0125), h / 2, sz * (d / 2 - 0.0125)));
  }
  for (const y of [...RACK.levels, h - 0.012]) g.add(box(w, 0.015, d, m.board, 0, y, 0));
  // Rückwand-Streben, damit nichts nach hinten fällt
  for (const y of [0.15, 0.41]) g.add(box(w, 0.02, 0.01, m.steel, 0, y, -d / 2 + 0.005));
  const spots = [];
  for (const level of RACK.levels) {
    for (let i = 0; i < RACK.perLevel; i++) {
      spots.push(new THREE.Vector3((i - (RACK.perLevel - 1) / 2) * 0.112, level + 0.0075 + 0.1, 0.01));
    }
  }
  g.userData.spoolSpots = spots;
  return g;
}

// Ersatzdüse: Messing-Sechskant mit Gewinde und Spitze (etwa 2 cm, im Spiel etwas größer, damit man sie sieht)
export function createNozzle(scale = 1) {
  const m = materials();
  const g = new THREE.Group();
  const hex = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.008, 6), m.brass);
  const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.012, 12), m.brass);
  thread.position.y = 0.01;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.008, 12), m.brass);
  tip.rotation.x = Math.PI;
  tip.position.y = -0.008;
  g.add(hex, thread, tip);
  g.scale.setScalar(scale);
  return g;
}

// Ersatzteilregal: Sortimentskasten mit Fächern. userData.nozzleSpots: wo Düsen liegen (eine je Platz).
function createPartsRack() {
  const m = materials();
  const g = new THREE.Group();
  const { w, d, h, cols, rows } = PARTS;
  g.add(box(w, 0.015, d, m.blue, 0, 0.0075, 0));
  g.add(box(w, h, 0.012, m.blue, 0, h / 2, -d / 2 + 0.006));
  for (const sx of [-1, 1]) g.add(box(0.012, h, d, m.blue, sx * (w / 2 - 0.006), h / 2, 0));
  g.add(box(w, 0.012, d, m.blue, 0, h - 0.006, 0));
  const spots = [];
  const binW = (w - 0.03) / cols;
  const binH = (h - 0.03) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + 0.015 + binW * (c + 0.5);
      const y = 0.015 + binH * r;
      // Schütte: Boden, Front mit Etikett
      g.add(box(binW - 0.008, 0.006, d - 0.04, m.bin, x, y + 0.003, 0.01));
      g.add(box(binW - 0.008, binH * 0.45, 0.006, m.bin, x, y + binH * 0.225, d / 2 - 0.02));
      g.add(box(binW * 0.5, 0.018, 0.002, m.label, x, y + binH * 0.25, d / 2 - 0.016));
      spots.push(new THREE.Vector3(x, y + 0.025, 0.0));
    }
  }
  g.userData.nozzleSpots = spots;
  return g;
}

// Ausstellungsregal: Eichen-Korpus mit Sockel, Deckplatte, drei Böden und dunkler Rückwand.
// userData.partSpots: Mitte der Standfläche jedes Fachs (das Teil steht mit der Unterseite darauf),
// userData.cell: wie groß ein Teil höchstens sein darf (größere werden verkleinert).
function createDisplayShelf() {
  const m = materials();
  const g = new THREE.Group();
  const { w, d, h, levels, perLevel, board, side } = DISPLAY;
  const innerW = w - side * 2;
  for (const sx of [-1, 1]) g.add(box(side, h, d, m.oak, sx * (w / 2 - side / 2), h / 2, 0));
  g.add(box(w, board, d, m.oak, 0, h - board / 2, 0));                          // Deckplatte
  g.add(box(innerW, 0.1, d - 0.02, m.oak, 0, 0.05, 0.01));                      // Sockel
  g.add(box(innerW, h - 0.1 - board, 0.012, m.backPanel, 0, 0.1 + (h - 0.1 - board) / 2, -d / 2 + 0.006));
  for (const y of levels.slice(1)) g.add(box(innerW, board, d - 0.012, m.oak, 0, y - board / 2, 0.006)); // unten steht man auf dem Sockel
  const spots = [];
  const cellW = innerW / perLevel;
  for (const y of levels) {
    for (let i = 0; i < perLevel; i++) spots.push(new THREE.Vector3(-innerW / 2 + cellW * (i + 0.5), y, 0.01));
  }
  g.userData.partSpots = spots;
  g.userData.cell = { w: cellW - 0.04, d: d - 0.06, h: levels[1] - levels[0] - board - 0.03 };
  return g;
}

// Holzregal: Bodenbrett, zwei Seitenwangen und Trennstäbe vorne und hinten, zwischen denen die Platten hochkant
// stehen. userData.sheetSpots: Mitte jeder Platte (Platte steht in der y-z-Ebene).
function createWoodRack() {
  const m = materials();
  const g = new THREE.Group();
  const { w, d, base, slots } = WOOD;
  g.add(box(w, base, d, m.board, 0, base / 2, 0));
  for (const sx of [-1, 1]) g.add(box(0.012, 0.24, d, m.steel, sx * (w / 2 - 0.006), base + 0.12, 0));
  // Querstreben vorne unten und hinten oben halten die Platten
  g.add(box(w, 0.02, 0.012, m.steel, 0, base + 0.05, d / 2 - 0.006));
  g.add(box(w, 0.02, 0.012, m.steel, 0, base + 0.2, -d / 2 + 0.006));
  const pitch = (w - 0.03) / slots;
  for (let i = 1; i < slots; i++) {
    const x = -w / 2 + 0.015 + pitch * i;
    for (const sz of [-1, 1]) g.add(box(0.004, 0.12, 0.004, m.steel, x, base + 0.06, sz * (d / 2 - 0.015)));
  }
  const spots = [];
  for (let i = 0; i < slots; i++) spots.push(new THREE.Vector3(-w / 2 + 0.015 + pitch * (i + 0.5), base + WOOD.sheetH / 2, 0));
  g.userData.sheetSpots = spots;
  return g;
}

const BUILDERS = { 'filament-rack': createFilamentRack, 'parts-rack': createPartsRack, 'wood-rack': createWoodRack,
  'display-shelf': createDisplayShelf,
};

export function createFurnitureModel(type) {
  const g = BUILDERS[type.id]?.() ?? createServerHardwareModel(type); // Server-Hardware: Schrank bzw. Gerät
  g.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return mergeStatic(g); // Bretter, Streben und Schütten: ein Mesh pro Material
}

const sizeCache = new Map();

// Abmessungen (Vector3, Meter), z. B. für Karton und Stellplatz-Vorschau
export function furnitureSize(type) {
  if (!sizeCache.has(type.id)) {
    sizeCache.set(type.id, new THREE.Box3().setFromObject(createFurnitureModel(type)).getSize(new THREE.Vector3()));
  }
  return sizeCache.get(type.id);
}
