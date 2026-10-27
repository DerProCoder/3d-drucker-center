// Grundformen für die 3D-Modelle: Quader, abgerundeter Quader, Zylinder (jeweils an einer Position) und ein
// einfaches Standardmaterial. Gemeinsam genutzt von models/ und world/.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Quader mit Mittelpunkt bei (x, y, z)
export function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

// Wie box, wirft und empfängt aber Schatten
export function shadowBox(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = box(w, h, d, material, x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Quader mit abgerundeten Kanten; der Radius wird auf die halbe kleinste Kantenlänge begrenzt
export function rbox(w, h, d, radius, material, x = 0, y = 0, z = 0) {
  const r = Math.min(radius, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), material);
  mesh.position.set(x, y, z);
  return mesh;
}

export function cylinder(rTop, rBottom, h, segments, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
  mesh.position.set(x, y, z);
  return mesh;
}

export const mat = (color, roughness = 0.6, metalness = 0.3) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
