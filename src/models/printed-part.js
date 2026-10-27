// Gedruckte Teile: Materialien in der Filamentfarbe und Filament-Spaghetti bei einem Fehldruck.
// Bekommt fertige Filament-Objekte (core/catalog.js) übergeben, damit hier nichts aus core/ nötig ist.
import * as THREE from 'three';
import { finishProps } from './spool.js';

export function partMaterial(filament, clip = null) {
  return new THREE.MeshStandardMaterial({
    color: filament.hex,
    ...finishProps(filament, 0.45), // matt, Seidenglanz, leuchtend oder durchscheinend je nach Sorte
    side: THREE.DoubleSide, // an der Schnittkante sieht man ins Innere
    clippingPlanes: clip ? [clip] : [],
  });
}

// Material(ien) für ein gedrucktes Teil: zwei- und mehrfarbige Formen haben eine Geometrie-Gruppe pro Farbe.
// filaments: siehe partFilaments (core/two-color.js) – bei einer Sorte ein Material, sonst eins pro Farbe
export function partMaterials(filaments, clip = null) {
  if (filaments.length < 2) return partMaterial(filaments[0], clip);
  return filaments.map((filament) => partMaterial(filament, clip));
}

// Filament-Spaghetti: wirre Schlaufen über dem Druckbett, Ursprung auf der Plattenmitte
export function createSpaghetti(filament, height, spread) {
  const material = new THREE.MeshStandardMaterial({ color: filament.hex, roughness: 0.5 });
  const group = new THREE.Group();
  for (let n = 0; n < 7; n++) {
    const points = [];
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      points.push(new THREE.Vector3(Math.cos(a) * r, 0.002 + Math.random() * height, Math.sin(a) * r));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.0008, 5), material));
  }
  return group;
}
