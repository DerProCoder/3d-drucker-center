// Bausteine, die mehrere Druckermodelle brauchen (A1-Serie in printer-a1.js, Würfeldrucker in printer-cube.js):
// Schriftzug, Schläuche zum Druckkopf und eingebaute Kamera.
import * as THREE from 'three';
import { rbox, box, createFlexTube, createLabel } from './printer-parts.js';

// Schriftzug „Bambu Lab <Modell>“ an einer Vorderseite
export function addLogo(parent, title, height, color, x, y, z) {
  const logo = createLabel(`Bambu Lab ${title}`, height, color);
  logo.position.set(x, y, z);
  parent.add(logo);
}

// Flexibler Schlauch/Kabel vom Gerät zum Druckkopf (Anfang in Modellkoordinaten)
export function addFlexTube(g, options) {
  const tube = createFlexTube(options);
  g.add(tube);
  (g.userData.flexTubes ??= []).push(tube);
}

// Eingebaute Kamera: kleines Gehäuse mit Linse, das auf target zeigt (Modellkoordinaten).
// userData.camMount sagt der Drucker-Cam, von wo sie filmt: knapp vor der Linse, damit das Gehäuse nicht im Bild ist.
export function addChamberCamera(g, m, position, target) {
  const cam = new THREE.Group();
  cam.add(rbox(0.022, 0.016, 0.014, 0.004, m.black));
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.003, 20), m.glass);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(-0.003, 0, 0.0075);
  cam.add(lens);
  cam.add(box(0.002, 0.002, 0.001, m.statusGreen, 0.007, 0.004, 0.0072)); // Aufnahme-LED
  cam.position.set(...position);
  cam.lookAt(...target); // Linse (+z) zeigt aufs Bett – das Modell steht beim Bauen noch im Ursprung
  cam.updateMatrixWorld(true);
  g.add(cam);
  const lensPos = cam.localToWorld(new THREE.Vector3(-0.003, 0, 0.012));
  g.userData.camMount = { position: lensPos, target: new THREE.Vector3(...target) };
}
