// Prozedurale Texturen per Canvas (keine Bilddateien nötig) und kleine Zufallshelfer zum Zeichnen.
import * as THREE from 'three';

// Zeichnet per draw(ctx, width, height) auf ein Canvas und macht daraus eine sRGB-Textur.
// Standard: kachelbar (RepeatWrapping, repeatX × repeatY) mit Anisotropie 8.
// wrap: false lässt die Ränder auf Clamp (dann wirkt repeat nicht); anisotropy: 1 schaltet sie ab.
export function canvasTexture(width, height, draw, repeatX = 1, repeatY = 1, { wrap = true, anisotropy = 8 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (wrap) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
  }
  texture.anisotropy = anisotropy;
  return texture;
}

export const rand = (min, max) => min + Math.random() * (max - min);

// Streut helle und dunkle Pünktchen (Körnung) über die Fläche
export function speckle(ctx, w, h, count, alpha) {
  for (let i = 0; i < count; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${rand(0, alpha)})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, rand(1, 3), rand(1, 3));
  }
}
