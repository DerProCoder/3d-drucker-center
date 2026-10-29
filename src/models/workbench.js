// Werkbank für den Serverraum (Issue #45, Logik in core/workbench.js): Stahlgestell mit Holzplatte, darauf eine
// blaue ESD-Matte, unten eine Ablage, hinten eine Lochwand mit Schild „WERKBANK“, ein paar Werkzeugen und einer
// Teilekiste. Ursprung Mitte unten, vorn ist +z (dort steht der Spieler), die Lochwand steht hinten (−z).
// Gleich zusammengeführt (mergeStatic): wenige Draw Calls, keine Schatten.
import * as THREE from 'three';
import { box, cylinder, mat } from './mesh-helpers.js';
import { canvasTexture } from './canvas-texture.js';
import { mergeStatic } from './merge-static.js';

// Maße in Metern
export const WORKBENCH = Object.freeze({
  width: 1.8,      // längs x
  depth: 0.75,     // längs z (inklusive Lochwand hinten)
  height: 0.9,     // Oberkante der ESD-Matte
  panelHeight: 0.8, // Lochwand über der Platte
});

const TOP = 0.04;   // Dicke der Holzplatte
const MAT = 0.004;  // Dicke der ESD-Matte
const LEG = 0.05;

// Lochwand: hellgrau mit Lochraster und Schild oben
function pegboardMaterial(width, height) {
  const px = 200; // Pixel je Meter
  const texture = canvasTexture(Math.round(width * px), Math.round(height * px), (ctx, w, h) => {
    ctx.fillStyle = '#c9cdd2';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#5d636b';
    const step = 0.04 * px;
    for (let y = step; y < h - 0.16 * px; y += step) {
      for (let x = step / 2; x < w; x += step) {
        ctx.beginPath();
        ctx.arc(x, y + 0.14 * px, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Schild oben
    ctx.fillStyle = '#1f3d66';
    ctx.fillRect(w * 0.3, 0.02 * px, w * 0.4, 0.1 * px);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(0.065 * px)}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('WERKBANK', w / 2, 0.072 * px);
  }, 1, 1, { wrap: false });
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8, metalness: 0.05 });
}

// ESD-Matte: blaugrau mit feinem Rand und Erdungsknopf-Aufdruck
function esdMaterial(width, depth) {
  const px = 160;
  const texture = canvasTexture(Math.round(width * px), Math.round(depth * px), (ctx, w, h) => {
    ctx.fillStyle = '#3c5a78';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = 'rgba(255, 220, 90, 0.85)';
    ctx.font = `bold ${Math.round(0.035 * px)}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText('ESD', 14, h - 14);
  }, 1, 1, { wrap: false });
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, metalness: 0 });
}

export function createWorkbench() {
  const { width: W, depth: D, height: H, panelHeight } = WORKBENCH;
  const g = new THREE.Group();
  const steel = mat(0x4a5059, 0.45, 0.6);
  const wood = mat(0xb08355, 0.7, 0.05);
  const red = mat(0xc8372d, 0.5, 0.1);
  const dark = mat(0x23262b, 0.6, 0.3);
  const topY = H - MAT - TOP / 2;
  // Beine und Rahmen
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(LEG, H - MAT - TOP, LEG, steel, sx * (W / 2 - LEG / 2 - 0.02), (H - MAT - TOP) / 2, sz * (D / 2 - LEG / 2 - 0.02)));
    }
    g.add(box(LEG, 0.04, D - 0.04, steel, sx * (W / 2 - LEG / 2 - 0.02), 0.18, 0));
  }
  g.add(
    box(W - 0.04, 0.05, 0.03, steel, 0, topY - TOP / 2 - 0.025, D / 2 - 0.035), // Zarge vorn
    box(W, TOP, D, wood, 0, topY, 0),                                          // Platte
    box(W - 0.06, 0.02, D - 0.06, wood, 0, 0.21, 0),                           // Ablage unten
    box(W - 0.1, MAT, D - 0.14, esdMaterial(W - 0.1, D - 0.14), 0, H - MAT / 2, 0.03),
  );
  // Lochwand hinten mit zwei Pfosten
  const panel = box(W, panelHeight, 0.015, pegboardMaterial(W, panelHeight), 0, H + panelHeight / 2, -D / 2 + 0.01);
  g.add(panel);
  for (const sx of [-1, 1]) g.add(box(0.04, panelHeight + 0.02, 0.03, steel, sx * (W / 2 - 0.02), H + panelHeight / 2, -D / 2 + 0.02));
  // Werkzeuge an der Lochwand: Schraubendreher (Griff + Klinge) und ein Seitenschneider als einfache Formen
  for (let i = 0; i < 4; i++) {
    const x = -W / 2 + 0.18 + i * 0.07;
    g.add(cylinder(0.012, 0.012, 0.09, 8, red, x, H + 0.42, -D / 2 + 0.04));
    g.add(cylinder(0.003, 0.003, 0.1, 6, steel, x, H + 0.325, -D / 2 + 0.04));
  }
  g.add(box(0.16, 0.012, 0.012, dark, W / 2 - 0.3, H + 0.45, -D / 2 + 0.035));
  g.add(box(0.012, 0.11, 0.012, dark, W / 2 - 0.37, H + 0.39, -D / 2 + 0.035));
  g.add(box(0.012, 0.11, 0.012, dark, W / 2 - 0.23, H + 0.39, -D / 2 + 0.035));
  // Teilekiste hinten rechts auf der Platte
  g.add(box(0.3, 0.07, 0.18, mat(0x2b6cb0, 0.55, 0.05), W / 2 - 0.25, H + 0.035, -D / 2 + 0.13));
  g.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  mergeStatic(g);
  return g;
}
