// 3D-Modelle der Einrichtung am Druckertisch: Filament-Regal (8 Spulen auf zwei Böden) und Ersatzteilregal
// (Sortimentskasten mit Ersatzdüsen). Dazu die Ersatzdüse selbst, z. B. für die Hand.
// Ursprung: Mitte der Unterseite, Vorderseite zeigt nach +z (zum Spieler).
import * as THREE from 'three';
import { mergeStatic } from './merge-static.js';

const RACK = { w: 0.5, d: 0.3, h: 0.56, levels: [0.03, 0.29], perLevel: 4 };
const PARTS = { w: 0.42, d: 0.26, h: 0.34, cols: 4, rows: 3 };

let mats = null;
function materials() {
  mats ??= {
    steel: new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.5, metalness: 0.4 }),
    board: new THREE.MeshStandardMaterial({ color: 0xc8a878, roughness: 0.85 }),
    blue: new THREE.MeshStandardMaterial({ color: 0x2d5fa8, roughness: 0.55, metalness: 0.2 }),
    bin: new THREE.MeshStandardMaterial({ color: 0xe0702a, roughness: 0.6 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a043, roughness: 0.3, metalness: 0.9 }),
    label: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.8 }),
  };
  return mats;
}

function box(w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
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

const BUILDERS = { 'filament-rack': createFilamentRack, 'parts-rack': createPartsRack };

export function createFurnitureModel(type) {
  const g = BUILDERS[type.id]();
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
