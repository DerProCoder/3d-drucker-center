// Filamentspule (1 kg, Ø 200 mm, 70 mm breit). Achse entlang x, Ursprung in der Mitte.
import * as THREE from 'three';

const RADIUS = 0.1;
const WIDTH = 0.07;

let shared = null;

function getShared() {
  if (shared) return shared;
  // Wicklung: feine Rillen quer zur Spulenachse
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < 64; y++) {
    ctx.fillStyle = y % 2 ? '#ffffff' : '#c8c8c8';
    ctx.fillRect(0, y, 4, 1);
  }
  const winding = new THREE.CanvasTexture(canvas);
  winding.colorSpace = THREE.SRGBColorSpace;

  shared = {
    winding,
    flangeGeo: new THREE.CylinderGeometry(RADIUS, RADIUS, 0.005, 48),
    coreGeo: new THREE.CylinderGeometry(RADIUS * 0.86, RADIUS * 0.86, WIDTH - 0.01, 48),
    hubGeo: new THREE.CylinderGeometry(0.03, 0.03, WIDTH + 0.002, 24),
    holeGeo: new THREE.CircleGeometry(0.027, 24),
    labelGeo: new THREE.PlaneGeometry(0.05, 0.03),
    flangeMat: new THREE.MeshStandardMaterial({ color: 0x26282b, roughness: 0.5 }),
    hubMat: new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.6 }),
    holeMat: new THREE.MeshBasicMaterial({ color: 0x050505 }),
    labelMat: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.8 }),
    filamentMats: new Map(),
  };
  return shared;
}

function filamentMaterial(filament) {
  const s = getShared();
  if (!s.filamentMats.has(filament.id)) {
    const transparent = filament.color === 'Transparent';
    s.filamentMats.set(filament.id, new THREE.MeshStandardMaterial({
      color: filament.hex,
      map: s.winding,
      roughness: 0.35,
      transparent,
      opacity: transparent ? 0.7 : 1,
    }));
  }
  return s.filamentMats.get(filament.id);
}

export function createSpool(filament) {
  const s = getShared();
  const spool = new THREE.Group();
  const inner = new THREE.Group();
  inner.rotation.z = Math.PI / 2; // Zylinderachse y → x
  spool.add(inner);

  inner.add(new THREE.Mesh(s.coreGeo, filamentMaterial(filament)));
  inner.add(new THREE.Mesh(s.hubGeo, s.hubMat));
  for (const side of [-1, 1]) {
    const flange = new THREE.Mesh(s.flangeGeo, s.flangeMat);
    flange.position.y = side * (WIDTH / 2 - 0.0025);
    inner.add(flange);
    const hole = new THREE.Mesh(s.holeGeo, s.holeMat);
    hole.rotation.x = side * -Math.PI / 2;
    hole.position.y = side * (WIDTH / 2 + 0.0002);
    inner.add(hole);
  }

  // Etikett auf der +x-Seite
  const label = new THREE.Mesh(s.labelGeo, s.labelMat);
  label.rotation.y = Math.PI / 2;
  label.position.set(WIDTH / 2 + 0.0003, 0.06, 0);
  spool.add(label);

  spool.userData.filament = filament;
  return spool;
}
