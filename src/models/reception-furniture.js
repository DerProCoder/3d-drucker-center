// 3D-Modelle für den Empfang: Tresen mit Klingel und Bildschirm, Wartestuhl, Abholregal mit Fächern und das
// verpackte Paket mit Namensetikett. Ursprung jeweils mittig am Boden, Vorderseite nach +z.
import * as THREE from 'three';
import { box } from './mesh-helpers.js';

export const COUNTER = { w: 2.4, d: 0.6, h: 1.08 };
export const PICKUP_SHELF = { w: 2.4, d: 0.42, h: 1.75, cols: 4, rows: 2 };
export const CHAIR_SEAT = 0.46;

let mats = null;
function materials() {
  mats ??= {
    front: new THREE.MeshStandardMaterial({ color: 0x2f3a46, roughness: 0.6 }),
    top: new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.35 }),
    wood: new THREE.MeshStandardMaterial({ color: 0xb58a5c, roughness: 0.6 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x9aa1a8, metalness: 0.7, roughness: 0.35 }),
    black: new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.5 }),
    accent: new THREE.MeshStandardMaterial({ color: 0x00ae42, roughness: 0.5 }),
    seat: new THREE.MeshStandardMaterial({ color: 0xd9643a, roughness: 0.7 }),
    cardboard: new THREE.MeshStandardMaterial({ color: 0xb98c58, roughness: 0.9 }),
    tape: new THREE.MeshStandardMaterial({ color: 0xd2b27c, roughness: 0.5 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xd4a53a, metalness: 0.9, roughness: 0.25 }),
  };
  return mats;
}

// Tresen: Kundenseite nach +z mit grünem Lichtband, Arbeitsplatte, Bildschirm und Klingel
export function createCounter(screenMaterial) {
  const m = materials();
  const g = new THREE.Group();
  const { w, d, h } = COUNTER;
  g.add(box(w, h - 0.04, d, m.front, 0, (h - 0.04) / 2, 0));
  g.add(box(w + 0.08, 0.04, d + 0.12, m.top, 0, h - 0.02, 0.03));
  g.add(box(w, 0.03, 0.01, m.accent, 0, 0.12, d / 2 + 0.005)); // Lichtband unten
  // Bildschirm zur Mitarbeiterseite, Klingel zum Kunden
  const monitor = new THREE.Group();
  monitor.add(box(0.05, 0.16, 0.05, m.black, 0, 0.08, 0), box(0.5, 0.3, 0.03, m.black, 0, 0.3, 0));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.26), screenMaterial);
  screen.position.set(0, 0.3, -0.016);
  screen.rotation.y = Math.PI;
  monitor.add(screen);
  monitor.position.set(-0.5, h, -0.1);
  g.add(monitor);
  const bell = new THREE.Group();
  bell.add(box(0.12, 0.015, 0.12, m.black, 0, 0.0075, 0));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.brass);
  dome.position.y = 0.015;
  bell.add(dome);
  bell.position.set(0.55, h, 0.15);
  g.add(bell);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Wartestuhl: Kunststoffsitz auf Metallgestell, Sitz zeigt nach +z
export function createWaitingChair() {
  const m = materials();
  const g = new THREE.Group();
  g.add(box(0.46, 0.05, 0.44, m.seat, 0, CHAIR_SEAT - 0.025, 0));
  const back = box(0.46, 0.42, 0.04, m.seat, 0, CHAIR_SEAT + 0.24, -0.21);
  back.rotation.x = -0.1;
  g.add(back);
  for (const sx of [-0.2, 0.2]) {
    for (const sz of [-0.18, 0.18]) g.add(box(0.03, CHAIR_SEAT - 0.05, 0.03, m.steel, sx, (CHAIR_SEAT - 0.05) / 2, sz));
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Abholregal: Holzrahmen mit cols × rows Fächern. userData.slots: Mitte jedes Fachbodens (lokal), Index wie
// SHELF-Fach (0 = oben links)
export function createPickupShelf() {
  const m = materials();
  const g = new THREE.Group();
  const { w, d, h, cols, rows } = PICKUP_SHELF;
  const t = 0.03;
  g.add(box(w, h, 0.02, m.wood, 0, h / 2, -d / 2 + 0.01));                  // Rückwand
  for (let c = 0; c <= cols; c++) g.add(box(t, h, d, m.wood, -w / 2 + t / 2 + c * ((w - t) / cols), h / 2, 0));
  const levels = [0.25, 0.25 + (h - 0.3) / rows];
  for (const y of [0, ...levels, h - t]) g.add(box(w, t, d, m.wood, 0, y + t / 2, 0));
  g.add(box(w, 0.2, 0.02, m.accent, 0, h + 0.12, -d / 2 + 0.02));            // Schildträger oben
  const slots = [];
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = 0; c < cols; c++) {
      slots.push(new THREE.Vector3(-w / 2 + (c + 0.5) * ((w - t) / cols) + t / 2, levels[r] + t, 0.02));
    }
  }
  g.userData.slots = slots;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function labelTexture(lines) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fbfaf6';
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#00ae42';
  ctx.fillRect(0, 0, 256, 14);
  ctx.fillStyle = '#1d2228';
  ctx.textAlign = 'center';
  ctx.font = '700 30px "Segoe UI", Arial, sans-serif';
  ctx.fillText(lines[0].slice(0, 18), 128, 60);
  ctx.font = '500 22px "Segoe UI", Arial, sans-serif';
  ctx.fillText((lines[1] ?? '').slice(0, 24), 128, 100);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Paket: Karton mit Klebeband und Etikett (Kunde, Inhalt) auf der Vorderseite
export function createParcel(customer, content, size = { w: 0.42, h: 0.28, d: 0.32 }) {
  const m = materials();
  const g = new THREE.Group();
  g.add(box(size.w, size.h, size.d, m.cardboard, 0, size.h / 2, 0));
  g.add(box(0.06, 0.004, size.d + 0.002, m.tape, 0, size.h + 0.002, 0));
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(size.w * 0.8, size.w * 0.4),
    new THREE.MeshStandardMaterial({ map: labelTexture([customer, content]), roughness: 0.8 })
  );
  label.position.set(0, size.h / 2, size.d / 2 + 0.002);
  g.add(label);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
