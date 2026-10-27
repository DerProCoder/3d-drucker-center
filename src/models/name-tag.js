// Namensschild über dem Kopf einer Figur (Mitarbeiter, Empfangskraft): Sprite mit Canvas-Textur
import * as THREE from 'three';

// Namensschild über dem Kopf, z. B. „Azubi Kevin“
export function createNameTag(label) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(10, 12, 16, 0.7)';
  ctx.beginPath();
  ctx.roundRect(4, 8, 248, 48, 24);
  ctx.fill();
  ctx.fillStyle = '#7ef0a8';
  ctx.font = '700 30px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 33);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  tag.scale.set(0.6, 0.15, 1);
  tag.raycast = () => {};
  return tag;
}
