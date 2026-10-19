// 3D-Modelle fürs Büro der Azubis: Schreibtisch, Bürostuhl, Couch, TV-Lowboard, Fernseher, Spielkonsole mit
// Controller und eine Zimmerpflanze. Ursprung jeweils mittig am Boden, Vorderseite zeigt nach +z.
import * as THREE from 'three';

export const DESK = { w: 3.2, d: 0.75, h: 0.75 };
export const CHAIR_SEAT_HEIGHT = 0.48;
export const COUCH = { w: 2.0, d: 0.85, seatHeight: 0.44 };
export const LOWBOARD = { w: 1.5, d: 0.4, h: 0.45 };
export const TV = { w: 1.2, h: 0.7 };

let mats = null;
function materials() {
  mats ??= {
    oak: new THREE.MeshStandardMaterial({ color: 0xb98a5a, roughness: 0.6 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.45, metalness: 0.5 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xc8cacc, roughness: 0.25, metalness: 0.9 }),
    fabric: new THREE.MeshStandardMaterial({ color: 0x3f6f8f, roughness: 0.95 }),
    cushion: new THREE.MeshStandardMaterial({ color: 0x4b82a6, roughness: 0.95 }),
    mesh: new THREE.MeshStandardMaterial({ color: 0x1f2226, roughness: 0.8 }),
    black: new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.4 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf1f2f4, roughness: 0.35 }),
    lowboard: new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.5 }),
    pot: new THREE.MeshStandardMaterial({ color: 0xc9673d, roughness: 0.8 }),
    soil: new THREE.MeshStandardMaterial({ color: 0x3b2a1c, roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x2f8a3e, roughness: 0.7 }),
    blueLed: new THREE.MeshStandardMaterial({ color: 0x66aaff, emissive: 0x3388ff, emissiveIntensity: 2.5 }),
  };
  return mats;
}

function box(w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

// Werkbank: Eichenplatte auf Stahlkufen, hinten eine Lochwand-Leiste
export function createDesk() {
  const m = materials();
  const g = new THREE.Group();
  const { w, d, h } = DESK;
  g.add(box(w, 0.04, d, m.oak, 0, h - 0.02, 0));
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - 0.08);
    g.add(box(0.05, h - 0.04, 0.05, m.steel, x, (h - 0.04) / 2, 0));
    g.add(box(0.06, 0.03, d - 0.06, m.steel, x, 0.015, 0));          // Kufe
    g.add(box(0.05, 0.04, d - 0.1, m.steel, x, h - 0.06, 0));         // Zarge
  }
  g.add(box(w - 0.16, 0.04, 0.03, m.steel, 0, h - 0.06, -d / 2 + 0.05)); // hinterer Querträger
  return g;
}

// Bürostuhl: Sitz und Netzlehne auf Gasfeder mit Fünfstern-Fuß
export function createOfficeChair() {
  const m = materials();
  const g = new THREE.Group();
  const seatY = CHAIR_SEAT_HEIGHT;
  g.add(box(0.46, 0.07, 0.44, m.mesh, 0, seatY - 0.035, 0));
  g.add(box(0.44, 0.5, 0.04, m.mesh, 0, seatY + 0.32, -0.22));
  g.add(box(0.04, 0.3, 0.03, m.steel, 0, seatY + 0.08, -0.22));       // Lehnenträger
  for (const sx of [-1, 1]) g.add(box(0.04, 0.03, 0.25, m.black, sx * 0.25, seatY + 0.2, -0.04)); // Armlehnen
  for (const sx of [-1, 1]) g.add(box(0.025, 0.2, 0.025, m.black, sx * 0.25, seatY + 0.09, -0.04));
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, seatY - 0.1, 12), m.chrome);
  column.position.y = (seatY - 0.1) / 2 + 0.05;
  g.add(column);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spoke = box(0.04, 0.03, 0.3, m.black, Math.sin(a) * 0.15, 0.06, Math.cos(a) * 0.15);
    spoke.rotation.y = a;
    const wheel = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), m.black);
    wheel.position.set(Math.sin(a) * 0.29, 0.025, Math.cos(a) * 0.29);
    g.add(spoke, wheel);
  }
  return g;
}

// Couch: zwei Sitzkissen, Rücken- und Armlehnen, Holzfüße
export function createCouch() {
  const m = materials();
  const g = new THREE.Group();
  const { w, d, seatHeight } = COUCH;
  g.add(box(w, 0.2, d, m.fabric, 0, 0.18, 0));                           // Unterbau
  for (const sx of [-1, 1]) {
    g.add(box(w / 2 - 0.2, 0.14, d - 0.25, m.cushion, sx * (w / 4 - 0.05), seatHeight - 0.07, 0.1)); // Sitzkissen
    g.add(box(w / 2 - 0.2, 0.42, 0.16, m.cushion, sx * (w / 4 - 0.05), seatHeight + 0.18, -d / 2 + 0.2)); // Rückenkissen
    g.add(box(0.18, 0.62, d, m.fabric, sx * (w / 2 - 0.09), 0.31, 0));    // Armlehne
    for (const sz of [-1, 1]) g.add(box(0.05, 0.08, 0.05, m.oak, sx * (w / 2 - 0.08), 0.04, sz * (d / 2 - 0.08)));
  }
  g.add(box(w, 0.72, 0.14, m.fabric, 0, 0.44, -d / 2 + 0.07));           // Rückenlehne
  return g;
}

// Flacher Schrank unter dem Fernseher, zwei Fächer
export function createLowboard() {
  const m = materials();
  const g = new THREE.Group();
  const { w, d, h } = LOWBOARD;
  g.add(box(w, 0.03, d, m.lowboard, 0, h - 0.015, 0));
  g.add(box(w, 0.03, d, m.lowboard, 0, 0.08, 0));
  for (const x of [-w / 2 + 0.015, 0, w / 2 - 0.015]) g.add(box(0.03, h - 0.08, d, m.lowboard, x, (h + 0.08) / 2, 0));
  g.add(box(w, h - 0.08, 0.02, m.lowboard, 0, (h + 0.08) / 2, -d / 2 + 0.01));
  for (const sx of [-1, 1]) g.add(box(0.04, 0.08, 0.04, m.steel, sx * (w / 2 - 0.06), 0.04, 0));
  return g;
}

// Flachbildfernseher für die Wand. screen: Material für das Bild (leuchtet selbst)
export function createTv(screen) {
  const m = materials();
  const g = new THREE.Group();
  g.add(box(TV.w + 0.04, TV.h + 0.04, 0.05, m.black, 0, 0, 0));
  const picture = new THREE.Mesh(new THREE.PlaneGeometry(TV.w, TV.h), screen);
  picture.position.z = 0.026;
  g.add(picture);
  return g;
}

// Spielkonsole, hochkant: weiße Seitenschalen, schwarzer Kern, blaue Lichtleiste
export function createConsole() {
  const m = materials();
  const g = new THREE.Group();
  g.add(box(0.06, 0.36, 0.24, m.black, 0, 0.19, 0));
  for (const sx of [-1, 1]) {
    const shell = box(0.02, 0.4, 0.26, m.white, sx * 0.04, 0.2, 0);
    shell.rotation.z = sx * -0.04;
    g.add(shell);
  }
  g.add(box(0.008, 0.3, 0.004, m.blueLed, 0, 0.2, 0.121));
  g.add(box(0.14, 0.012, 0.16, m.black, 0, 0.006, 0)); // Standfuß
  return g;
}

// Controller: Griffe links und rechts, zwei Sticks, Lichtleiste. Ursprung in der Mitte, Griffe zeigen nach -z.
export function createController() {
  const m = materials();
  const g = new THREE.Group();
  g.add(box(0.11, 0.025, 0.06, m.white, 0, 0, 0));
  for (const sx of [-1, 1]) {
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.05, 4, 8), m.white);
    grip.rotation.x = Math.PI / 2 - 0.3;
    grip.position.set(sx * 0.05, -0.008, -0.03);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.012, 10), m.black);
    stick.position.set(sx * 0.022, 0.016, -0.008);
    g.add(grip, stick);
  }
  g.add(box(0.05, 0.004, 0.006, m.blueLed, 0, 0.012, 0.028));
  return g;
}

// Zimmerpflanze im Terrakotta-Topf
export function createPlant() {
  const m = materials();
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.32, 20), m.pot);
  pot.position.y = 0.16;
  const soil = new THREE.Mesh(new THREE.CircleGeometry(0.15, 20), m.soil);
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.3;
  g.add(pot, soil);
  // Blätter: flache, gekippte Kugeln rund um den Stamm
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 6), m.leaf);
    leaf.scale.set(0.45, 0.12, 1);
    const height = 0.45 + (i % 3) * 0.18;
    leaf.position.set(Math.sin(a) * 0.12, height, Math.cos(a) * 0.12);
    leaf.rotation.set(-0.5, a, 0);
    g.add(leaf);
  }
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.6, 8), m.leaf);
  stem.position.y = 0.55;
  g.add(stem);
  return g;
}
