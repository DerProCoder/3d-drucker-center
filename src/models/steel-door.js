// Schwere Stahl-Schiebetür für die Daten-Bunker im Keller (world/basement-fields.js): gelb-schwarze Warnzarge auf
// beiden Wandseiten und ein dickes Türblatt aus Stahl, das seitlich vor der Wand aufgleitet.
// Lokal: Wand entlang x, Türmitte bei x = 0, Boden bei y = 0, Türblatt auf der +z-Seite (Bunker-Seite).
// Die Materialien legt createSteelDoorMaterials() einmal an – alle Türen teilen sie (keine neuen Shader beim Ausbau).
import * as THREE from 'three';
import { box } from './mesh-helpers.js';
import { canvasTexture, speckle } from './canvas-texture.js';

export const STEEL_DOOR = { w: 1.8, h: 2.4, leaf: 0.12, frame: 0.16 };

// Gebürstetes Stahlblech mit Nieten, Querriegeln und Griffstange
function drawLeaf(ctx, w, h) {
  ctx.fillStyle = '#6d737b';
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 2) {
    ctx.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.04})`;
    ctx.fillRect(0, y, w, 1);
  }
  speckle(ctx, w, h, 1500, 0.06);
  ctx.strokeStyle = '#3b3f45';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  // Querriegel
  ctx.fillStyle = '#585d64';
  for (const y of [0.3, 0.7]) ctx.fillRect(14, h * y - 10, w - 28, 20);
  // Nieten
  ctx.fillStyle = '#9aa0a8';
  for (let x = 22; x < w - 10; x += 34) {
    for (const y of [20, h - 20, h * 0.3, h * 0.7]) {
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Griffstange und Warnstreifen unten
  ctx.fillStyle = '#2a2d31';
  ctx.fillRect(w * 0.12, h * 0.42, 12, h * 0.16);
  for (let x = -h; x < w; x += 28) {
    ctx.fillStyle = '#e8b400';
    ctx.beginPath();
    ctx.moveTo(x, h - 8);
    ctx.lineTo(x + 14, h - 8);
    ctx.lineTo(x + 28, h - 30);
    ctx.lineTo(x + 14, h - 30);
    ctx.fill();
  }
}

// Gelb-schwarze Schrägstreifen
function drawHazard(ctx, w, h) {
  ctx.fillStyle = '#1d1d1d';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#e8b400';
  for (let x = -h; x < w + h; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + 16, h);
    ctx.lineTo(x + 16 + h, 0);
    ctx.lineTo(x + h, 0);
    ctx.fill();
  }
}

export function createSteelDoorMaterials() {
  return {
    leaf: new THREE.MeshStandardMaterial({
      map: canvasTexture(256, 340, drawLeaf, 1, 1, { wrap: false, anisotropy: 4 }), roughness: 0.45, metalness: 0.6,
    }),
    hazard: new THREE.MeshStandardMaterial({ map: canvasTexture(128, 128, drawHazard, 1, 4), roughness: 0.6 }),
    rail: new THREE.MeshStandardMaterial({ color: 0x2f3338, roughness: 0.5, metalness: 0.6 }),
  };
}

// m: Materialien aus createSteelDoorMaterials · wall: Wanddicke. Gibt { frame, leaf } zurück: frame ist unbeweglich
// (darf zusammengeführt werden), leaf das bewegliche Türblatt (userData.closedX, userData.travel).
export function createSteelDoor(m, wall) {
  const { w, h, leaf: lt, frame: fw } = STEEL_DOOR;
  const frame = new THREE.Group();
  // Zarge: Pfosten links und rechts und Sturz, je etwas breiter als die Wand
  const depth = wall + 0.04;
  frame.add(
    box(fw, h + fw, depth, m.hazard, -(w / 2 + fw / 2), (h + fw) / 2, 0),
    box(fw, h + fw, depth, m.hazard, w / 2 + fw / 2, (h + fw) / 2, 0),
    box(w, fw, depth, m.hazard, 0, h + fw / 2, 0),
  );
  // Laufschiene über der Tür auf der Bunker-Seite (so weit, wie das Blatt aufgleitet)
  const zLeaf = wall / 2 + lt / 2 + 0.01;
  frame.add(box(2 * w + 0.4, 0.1, 0.08, m.rail, w / 2, h + fw + 0.08, wall / 2 + 0.04));

  const leaf = box(w + 0.16, h + 0.06, lt, m.leaf, 0, (h + 0.06) / 2, zLeaf);
  leaf.userData.closedX = 0;
  leaf.userData.travel = w + 0.1;
  return { frame, leaf };
}
