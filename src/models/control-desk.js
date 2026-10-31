// 3D-Modelle für den Leitstand (#58): Pult mit drei kleinen Bildschirmen, Schaltfeld und Tastatur sowie die
// Bildschirmwand (Rückwand mit Rahmen für 3 × 2 große Bildschirme). Ursprung jeweils mittig am Boden (Pult) bzw. in
// der Mitte der Wand (Bildschirmwand), Vorderseite zeigt nach +z. Die Inhalte der großen Bildschirme malt
// world/control-wall.js – hier gibt es nur die festen Teile und die Plätze (slots) der Bildschirmflächen.
import * as THREE from 'three';
import { box } from './mesh-helpers.js';
import { canvasTexture } from './canvas-texture.js';

export const CONTROL_DESK = { w: 3.2, d: 1.2, h: 0.76 };

let mats = null;
function materials() {
  mats ??= {
    body: new THREE.MeshStandardMaterial({ color: 0x3a4049, roughness: 0.55, metalness: 0.3 }),
    top: new THREE.MeshStandardMaterial({ color: 0x23272d, roughness: 0.7 }),
    edge: new THREE.MeshStandardMaterial({ color: 0x8a939e, roughness: 0.35, metalness: 0.7 }),
    panel: new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.5, metalness: 0.4 }),
    black: new THREE.MeshStandardMaterial({ color: 0x111316, roughness: 0.45 }),
    key: new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6 }),
    ledGreen: new THREE.MeshStandardMaterial({ color: 0x4be08a, emissive: 0x2bd36a, emissiveIntensity: 1.6 }),
    ledAmber: new THREE.MeshStandardMaterial({ color: 0xffb340, emissive: 0xff9a1a, emissiveIntensity: 1.6 }),
    ledRed: new THREE.MeshStandardMaterial({ color: 0xff5a4a, emissive: 0xff2a1a, emissiveIntensity: 1.6 }),
    wallBack: new THREE.MeshStandardMaterial({ color: 0x1b1e23, roughness: 0.8 }),
    bezel: new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.35, metalness: 0.2 }),
    strip: new THREE.MeshStandardMaterial({ color: 0x3a8bd6, emissive: 0x1f6fc0, emissiveIntensity: 1.2 }),
  };
  return mats;
}

// Kleine Pultbildschirme: ein festes Bild (Kurven, Balken) – sie leuchten, ändern sich aber nicht
let deskScreenMaterial = null;
function deskScreen() {
  deskScreenMaterial ??= new THREE.MeshBasicMaterial({
    map: canvasTexture(256, 144, (ctx, w, h) => {
      ctx.fillStyle = '#0e1622';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#1f6fc0';
      ctx.fillRect(0, 0, w, 16);
      ctx.strokeStyle = '#4be08a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) ctx.lineTo(x, 70 + Math.sin(x / 19) * 18 + Math.cos(x / 7) * 6);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 3 ? '#3a8bd6' : '#ffb340';
        const bh = 12 + ((i * 37) % 30);
        ctx.fillRect(14 + i * 29, h - 10 - bh, 18, bh);
      }
    }, 1, 1, { wrap: false, anisotropy: 4 }),
  });
  return deskScreenMaterial;
}

// Pult: Unterschrank hinten, Arbeitsplatte mit Kantenleiste, schräges Schaltfeld mit Leuchttasten, drei kleine
// Bildschirme und Tastatur. Vorne (+z) sitzt man; die Beinfreiheit liegt unter dem vorderen Teil der Platte.
export function createControlDesk() {
  const m = materials();
  const g = new THREE.Group();
  const { w, d, h } = CONTROL_DESK;
  const back = -d / 2;
  // Unterschrank (hintere Hälfte) und Seitenwangen
  g.add(box(w, h - 0.04, 0.5, m.body, 0, (h - 0.04) / 2, back + 0.25));
  for (const sx of [-1, 1]) g.add(box(0.05, h - 0.04, d - 0.04, m.body, sx * (w / 2 - 0.025), (h - 0.04) / 2, 0));
  g.add(box(w - 0.1, 0.02, 0.01, m.edge, 0, h - 0.25, back + 0.505)); // Zierleiste am Schrank
  // Arbeitsplatte mit vorderer Kante
  g.add(box(w, 0.04, d, m.top, 0, h - 0.02, 0));
  g.add(box(w, 0.045, 0.03, m.edge, 0, h - 0.022, d / 2 - 0.015));
  // Schräges Schaltfeld hinten auf der Platte, zum Platz hin geneigt
  const slope = new THREE.Group();
  slope.position.set(0, h + 0.09, back + 0.2);
  slope.rotation.x = 0.55;
  slope.add(box(w - 0.12, 0.03, 0.34, m.panel, 0, 0, 0));
  const leds = [m.ledGreen, m.ledGreen, m.ledAmber, m.ledGreen, m.ledRed, m.ledGreen];
  for (let i = 0; i < 18; i++) {
    const x = -w / 2 + 0.25 + i * ((w - 0.5) / 17);
    slope.add(box(0.05, 0.012, 0.03, leds[i % leds.length], x, 0.02, -0.08));
    slope.add(box(0.06, 0.014, 0.05, m.key, x, 0.02, 0.06));
  }
  g.add(slope);
  g.add(box(w - 0.12, 0.18, 0.04, m.panel, 0, h + 0.09, back + 0.05)); // Rückwand unter dem Schaltfeld
  // Drei kleine Bildschirme auf Füßen, leicht zum Platz hin gedreht
  const screen = deskScreen();
  for (const [x, rot] of [[-0.85, 0.18], [0, 0], [0.85, -0.18]]) {
    const mon = new THREE.Group();
    mon.position.set(x, h, back + 0.5);
    mon.rotation.y = rot;
    mon.add(box(0.2, 0.015, 0.14, m.black, 0, 0.008, 0));
    mon.add(box(0.035, 0.14, 0.03, m.black, 0, 0.08, -0.02));
    mon.add(box(0.56, 0.33, 0.03, m.black, 0, 0.3, 0));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.29), screen);
    face.position.set(0, 0.3, 0.016);
    mon.add(face);
    g.add(mon);
  }
  // Tastatur und Maus vor dem mittleren Bildschirm
  g.add(box(0.46, 0.02, 0.15, m.key, 0, h + 0.01, 0.12));
  g.add(box(0.06, 0.02, 0.1, m.key, 0.36, h + 0.01, 0.13));
  return g;
}

// Bildschirmwand: dunkle Rückwand, darauf cols × rows Bildschirme mit Rahmen, darunter ein Leuchtstreifen.
// width/height: Außenmaße der Wand. Gibt { group, slots } zurück – slots: Bildschirmflächen { x, y, w, h, z } in den
// Koordinaten der Gruppe (Mitte der Fläche, z = Vorderseite der Rahmen), Reihenfolge zeilenweise von oben links.
export function createScreenWall({ width, height, cols = 3, rows = 2, gap = 0.08 }) {
  const m = materials();
  const g = new THREE.Group();
  const depth = 0.06;
  g.add(box(width, height, 0.02, m.wallBack, 0, 0, 0.01));
  const cellW = (width - gap * (cols + 1)) / cols;
  const cellH = (height - 0.12 - gap * (rows + 1)) / rows; // unten 12 cm für den Leuchtstreifen
  const slots = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -width / 2 + gap + cellW / 2 + c * (cellW + gap);
      const y = height / 2 - gap - cellH / 2 - r * (cellH + gap);
      g.add(box(cellW + 0.04, cellH + 0.04, depth, m.bezel, x, y, 0.02 + depth / 2));
      slots.push({ x, y, w: cellW - 0.02, h: cellH - 0.02, z: 0.02 + depth + 0.002 });
    }
  }
  g.add(box(width - 0.2, 0.03, 0.02, m.strip, 0, -height / 2 + 0.06, 0.03));
  return { group: g, slots };
}
