// Lieferkarton für einen Drucker. Größe passt sich dem Druckermodell an. Ursprung unten mittig.
import * as THREE from 'three';
import { printerSize } from './printer-model.js';

const MARGIN = 0.06; // Polsterung rund um den Drucker

function drawCardboard(ctx, w, h) {
  ctx.fillStyle = '#b98d5a';
  ctx.fillRect(0, 0, w, h);
  // Fasern und Flecken
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(90,60,25,0.08)' : 'rgba(240,210,160,0.08)';
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 6, 1);
  }
}

function makeTexture(draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  draw(canvas.getContext('2d'), 512, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

let plainMaterials = null;

function getPlainMaterials() {
  if (plainMaterials) return plainMaterials;
  plainMaterials = {
    // Oberseite mit Klebeband in der Mitte
    top: new THREE.MeshStandardMaterial({
      roughness: 0.9,
      map: makeTexture((ctx, w, h) => {
        drawCardboard(ctx, w, h);
        ctx.fillStyle = 'rgba(215,185,135,0.85)';
        ctx.fillRect(w * 0.42, 0, w * 0.16, h);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(w * 0.44, 0, w * 0.02, h);
      }),
    }),
    plain: new THREE.MeshStandardMaterial({ roughness: 0.9, map: makeTexture(drawCardboard) }),
  };
  return plainMaterials;
}

const sideMaterials = new Map();

// Seiten mit Aufdruck: Modellname, Zerbrechlich-Hinweis, „Oben“-Pfeile
function getSideMaterial(model, kind) {
  if (sideMaterials.has(model.id)) return sideMaterials.get(model.id);
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.9,
    map: makeTexture((ctx, w, h) => {
      drawCardboard(ctx, w, h);
      ctx.fillStyle = '#2a2018';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // „Bambu Lab A1 mini“ → Marke klein, Modell groß
      const words = model.name.split(' ');
      const brand = words.length > 2 ? words.slice(0, 2).join(' ') : '';
      const product = words.slice(brand ? 2 : 0).join(' ');
      ctx.font = '600 34px "Segoe UI", Arial, sans-serif';
      ctx.fillText(brand, w / 2, h * 0.3);
      ctx.font = '700 64px "Segoe UI", Arial, sans-serif';
      ctx.fillText(product, w / 2, h * 0.43);
      ctx.font = '22px "Segoe UI", Arial, sans-serif';
      ctx.fillText(kind, w / 2, h * 0.53);

      // Zerbrechlich: Weinglas-Symbol
      ctx.strokeStyle = '#2a2018';
      ctx.lineWidth = 5;
      const gx = w * 0.25;
      const gy = h * 0.78;
      ctx.beginPath();
      ctx.moveTo(gx - 22, gy - 40);
      ctx.quadraticCurveTo(gx - 22, gy, gx, gy + 2);
      ctx.quadraticCurveTo(gx + 22, gy, gx + 22, gy - 40);
      ctx.moveTo(gx, gy + 2);
      ctx.lineTo(gx, gy + 30);
      ctx.moveTo(gx - 16, gy + 30);
      ctx.lineTo(gx + 16, gy + 30);
      ctx.stroke();
      ctx.font = '600 20px "Segoe UI", Arial, sans-serif';
      ctx.fillText('ZERBRECHLICH', gx, gy + 56);

      // Oben-Pfeile
      const ax = w * 0.75;
      for (const dx of [-20, 20]) {
        ctx.beginPath();
        ctx.moveTo(ax + dx, gy + 30);
        ctx.lineTo(ax + dx, gy - 30);
        ctx.moveTo(ax + dx - 14, gy - 14);
        ctx.lineTo(ax + dx, gy - 32);
        ctx.lineTo(ax + dx + 14, gy - 14);
        ctx.stroke();
      }
      ctx.fillText('OBEN', ax, gy + 56);
    }),
  });
  sideMaterials.set(model.id, material);
  return material;
}

// Karton für einen Drucker – oder mit eigener Größe (Vector3) und Aufschrift für Einrichtung wie Regale
export function createPrinterBox(model, size = printerSize(model), kind = '3D-Drucker') {
  const s = size;
  const w = s.x + MARGIN;
  const h = s.y + MARGIN;
  const d = s.z + MARGIN;
  const { top, plain } = getPlainMaterials();
  const side = getSideMaterial(model, kind);

  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, top, plain, side, side]);
  box.position.y = h / 2;
  const group = new THREE.Group();
  group.add(box);
  group.userData.size = { w, h, d };
  return group;
}
