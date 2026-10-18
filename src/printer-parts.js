// Detaillierte Einzelteile für Druckermodelle: Druckkopf, Druckplatte, Motoren, Schienen,
// Touchscreen, Schläuche. Maße in Metern, angelehnt an echte Bauteile.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ---------- Materialien ----------

let plateTexture = null;

// Strukturierte PEI-Platte: goldfarben mit feiner Körnung
function getPlateTexture() {
  if (plateTexture) return plateTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#b48d52';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 14000; i++) {
    const light = Math.random() < 0.5;
    ctx.fillStyle = light ? `rgba(255,235,190,${Math.random() * 0.25})` : `rgba(60,40,10,${Math.random() * 0.25})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5);
  }
  plateTexture = new THREE.CanvasTexture(canvas);
  plateTexture.colorSpace = THREE.SRGBColorSpace;
  plateTexture.wrapS = plateTexture.wrapT = THREE.RepeatWrapping;
  plateTexture.repeat.set(2, 2);
  return plateTexture;
}

export function createMaterials() {
  return {
    shell: new THREE.MeshStandardMaterial({ color: 0xd5d7da, roughness: 0.55 }),       // hellgraues Gehäuse
    shellDark: new THREE.MeshStandardMaterial({ color: 0x2c2e32, roughness: 0.6 }),    // dunkle Kunststoffteile
    black: new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.7 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0e0e0f, roughness: 0.95 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc4c8cd, metalness: 0.85, roughness: 0.28 }),
    alu: new THREE.MeshStandardMaterial({ color: 0x9da2a8, metalness: 0.7, roughness: 0.4 }),
    bedAlu: new THREE.MeshStandardMaterial({ color: 0x3b3e43, metalness: 0.6, roughness: 0.45 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.85, roughness: 0.3 }),
    plate: new THREE.MeshStandardMaterial({ map: getPlateTexture(), metalness: 0.3, roughness: 0.6 }),
    ptfe: new THREE.MeshStandardMaterial({ color: 0xf4f4f0, transparent: true, opacity: 0.85, roughness: 0.3 }),
    led: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  };
}

// ---------- Grundformen ----------

export function rbox(w, h, d, radius, material, x = 0, y = 0, z = 0) {
  const r = Math.min(radius, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), material);
  mesh.position.set(x, y, z);
  return mesh;
}

export function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

function cylinder(rTop, rBottom, h, segments, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
  mesh.position.set(x, y, z);
  return mesh;
}

// ---------- Bauteile ----------

// NEMA-17-Schrittmotor, Achse entlang y, Ursprung in der Mitte
export function createStepper(m) {
  const motor = new THREE.Group();
  const s = 0.042;
  motor.add(box(s * 0.98, 0.026, s * 0.98, m.black, 0, 0, 0));
  motor.add(rbox(s, 0.008, s, 0.003, m.alu, 0, 0.017, 0));
  motor.add(rbox(s, 0.008, s, 0.003, m.alu, 0, -0.017, 0));
  motor.add(cylinder(0.011, 0.011, 0.002, 24, m.alu, 0, 0.022, 0));   // Zentrierbund
  motor.add(cylinder(0.0025, 0.0025, 0.016, 12, m.steel, 0, 0.029, 0)); // Welle
  // Schrauben in den Ecken
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      motor.add(cylinder(0.0025, 0.0025, 0.0015, 10, m.black, sx * 0.0155, 0.0215, sz * 0.0155));
    }
  }
  return motor;
}

// Linearführung entlang z mit Wagen, Unterseite bei y = 0
export function createLinearRail(length, m) {
  const rail = new THREE.Group();
  rail.add(box(0.012, 0.008, length, m.steel, 0, 0.004, 0));
  rail.add(box(0.026, 0.011, 0.04, m.steel, 0, 0.0095, 0));
  rail.add(box(0.027, 0.004, 0.006, m.black, 0, 0.0095, 0.023));  // Abstreifer vorne
  rail.add(box(0.027, 0.004, 0.006, m.black, 0, 0.0095, -0.023)); // Abstreifer hinten
  return rail;
}

// Zahnriemen als flaches Band entlang z
export function createBelt(length, m) {
  return box(0.006, 0.0015, length, m.rubber);
}

// Heizbett mit magnetischer, strukturierter PEI-Platte. Unterseite bei y = 0.
export function createBuildPlate(size, m) {
  const plate = new THREE.Group();
  plate.add(rbox(size + 0.012, 0.008, size + 0.012, 0.004, m.bedAlu, 0, 0.004, 0));
  plate.add(rbox(size, 0.0015, size, 0.003, m.plate, 0, 0.0088, 0));
  // Griffzunge vorne an der Platte
  plate.add(rbox(0.05, 0.0015, 0.016, 0.004, m.plate, 0, 0.0088, size / 2 + 0.006));
  // Kabel zum Heizbett hinten
  plate.add(box(0.03, 0.004, 0.02, m.black, 0, 0.002, -size / 2 - 0.012));
  plate.userData.topY = 0.0096;
  return plate;
}

// Druckkopf im Stil der A1-Serie. Ursprung in der Mitte des Gehäuses, Rückseite bei z = -depth/2.
export function createToolhead(m) {
  const head = new THREE.Group();
  const w = 0.055;
  const h = 0.075;
  const d = 0.045;

  head.add(rbox(w, h, d, 0.006, m.shellDark));
  // Frontabdeckung
  head.add(rbox(w + 0.003, h - 0.004, 0.01, 0.004, m.shell, 0, 0.001, d / 2 + 0.003));
  // Logo-Feld und Status-LED
  head.add(box(0.02, 0.004, 0.001, m.shellDark, 0, 0.02, d / 2 + 0.0085));
  head.add(box(0.012, 0.0015, 0.001, m.led, 0, -0.026, d / 2 + 0.0085));

  // Lüftergitter links (Bauteilkühlung): konzentrische Ringe
  const grille = new THREE.Group();
  grille.add(new THREE.Mesh(new THREE.CircleGeometry(0.0185, 32), m.black));
  for (const r of [0.007, 0.012, 0.017]) {
    grille.add(new THREE.Mesh(new THREE.TorusGeometry(r, 0.0011, 6, 32), m.shellDark));
  }
  grille.add(new THREE.Mesh(new THREE.CircleGeometry(0.0045, 20), m.shellDark));
  grille.rotation.y = -Math.PI / 2;
  grille.position.set(-w / 2 - 0.0008, -0.005, 0.002);
  head.add(grille);

  // Schneidhebel oben links, PTFE-Kupplung oben
  head.add(rbox(0.008, 0.012, 0.007, 0.002, m.shell, -w / 2 + 0.006, h / 2 + 0.004, d / 2 - 0.006));
  head.add(cylinder(0.0055, 0.0055, 0.009, 16, m.black, 0, h / 2 + 0.0045, -0.004));

  // Unterseite: Luftdüse, Heizblock, Düse
  head.add(rbox(0.042, 0.01, 0.014, 0.003, m.shellDark, 0, -h / 2 - 0.003, d / 2 - 0.004));
  head.add(box(0.016, 0.011, 0.018, m.alu, 0, -h / 2 - 0.0055, -0.002));
  head.add(cylinder(0.0045, 0.0045, 0.004, 6, m.brass, 0, -h / 2 - 0.013, -0.002));
  const tip = cylinder(0.0008, 0.0035, 0.005, 16, m.brass, 0, -h / 2 - 0.0175, -0.002);
  head.add(tip);

  head.userData.depth = d;
  head.userData.nozzleBelowCenter = h / 2 + 0.02;
  head.userData.topAboveCenter = h / 2 + 0.009;
  return head;
}

// Touchscreen mit Bambu-ähnlicher Statusanzeige. Ursprung in der Mitte, Anzeige nach +z.
export function createTouchscreen(w, h, title, m) {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = Math.round(320 * (h / w));
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  ctx.fillStyle = '#141619';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1f2226';
  ctx.fillRect(0, 0, W, 30);
  ctx.fillStyle = '#e8e8e8';
  ctx.font = '600 16px "Segoe UI", Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 10, 15);
  // WLAN-Balken
  ctx.fillStyle = '#00ae42';
  [6, 10, 14].forEach((bh, i) => ctx.fillRect(W - 40 + i * 8, 22 - bh, 5, bh));
  // Status
  ctx.fillStyle = '#00ae42';
  ctx.font = '600 30px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Bereit', W / 2, H * 0.45);
  // Temperaturen
  ctx.font = '15px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = '#bbbbbb';
  ctx.fillText('Düse 25 °C      Bett 25 °C', W / 2, H - 26);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const screen = new THREE.Group();
  screen.add(rbox(w + 0.008, h + 0.008, 0.008, 0.003, m.shellDark));
  const display = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture }));
  display.position.z = 0.0041;
  screen.add(display);
  return screen;
}

export function createTube(points, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 64, radius, 8, false), material);
}

// Spulenhalter: Sockel mit Stange entlang +x
export function createSpoolHolder(length, m) {
  const holder = new THREE.Group();
  holder.add(rbox(0.03, 0.02, 0.03, 0.005, m.shellDark, 0, 0.01, 0));
  const rod = cylinder(0.008, 0.008, length, 20, m.shell, length / 2, 0.022, 0);
  rod.rotation.z = Math.PI / 2;
  holder.add(rod);
  const cap = cylinder(0.012, 0.012, 0.004, 20, m.shellDark, length, 0.022, 0);
  cap.rotation.z = Math.PI / 2;
  holder.add(cap);
  return holder;
}

// Gummifüße unter einer Grundfläche w × d, Oberseite bei y = height
export function addFeet(group, w, d, height, m) {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      group.add(cylinder(0.012, 0.013, height, 16, m.rubber, sx * (w / 2 - 0.025), height / 2, sz * (d / 2 - 0.025)));
    }
  }
}
