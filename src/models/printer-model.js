// 3D-Modelle der Drucker. Ursprung mittig am Boden, Vorderseite zeigt nach +z.
// Bambu-Modelle sind nach den echten Geräten modelliert (Maße in Metern).
//
// Jedes Modell legt in userData ab:
//   printRig: { partParent, plateCenter, head, pose(state) } – partParent trägt das gedruckte Teil (das Bett),
//             pose stellt die Achsen für einen Druckzustand ein:
//             state = { mode: 'idle' | 'printing' | 'done', x, z (Düse relativ zur Plattenmitte), layerY, partHeight }
//   spoolSlots: [{ position, axis }] – wo eingelegte Spulen sitzen (1 Spulenhalter oder 4 AMS-Fächer)
//   flexTubes: Schläuche/Kabel, die dem Druckkopf folgen
//
// Die Modelle selbst stehen in printer-a1.js (A1 mini, A1, A2L), printer-cube.js (P1P bis H2C) und laser-model.js (R1),
// gemeinsame Bausteine in printer-model-helpers.js. Hier liegen nur die Weiche und das Biegen der Schläuche.
import * as THREE from 'three';
import { createMaterials, updateFlexTube } from './printer-parts.js';
import { buildA1Mini, buildA1, A1_VARIANTS } from './printer-a1.js';
import { buildBambuCube, CUBE_VARIANTS } from './printer-cube.js';
import { buildLaserR1 } from './laser-model.js';
import { mergeStatic } from './merge-static.js';

const tubeEnd = new THREE.Vector3();

// Biegt alle Schläuche passend zur aktuellen Kopfposition. Aufrufen, nachdem sich die Achsen bewegt haben.
export function updatePrinterTubes(model) {
  const tubes = model.userData.flexTubes;
  const head = model.userData.printRig?.head;
  if (!tubes || !head) return;
  model.updateMatrixWorld(true);
  for (const tube of tubes) {
    tubeEnd.copy(tube.userData.flex.endOffset);
    head.localToWorld(tubeEnd);
    model.worldToLocal(tubeEnd);
    updateFlexTube(tube, tubeEnd);
  }
}

const BUILDERS = {
  'a1-mini': (g) => buildA1Mini(g),
  r1: (g) => buildLaserR1(g, createMaterials()),
  a1: (g) => buildA1(g, A1_VARIANTS.a1),
  a2l: (g) => buildA1(g, A1_VARIANTS.a2l),
  p1p: (g) => buildBambuCube(g, CUBE_VARIANTS.p1p),
  p1s: (g) => buildBambuCube(g, CUBE_VARIANTS.p1s),
  p2s: (g) => buildBambuCube(g, CUBE_VARIANTS.p2s),
  x2d: (g) => buildBambuCube(g, CUBE_VARIANTS.x2d),
  x1c: (g) => buildBambuCube(g, CUBE_VARIANTS.x1c),
  x1e: (g) => buildBambuCube(g, CUBE_VARIANTS.x1e),
  h2d: (g) => buildBambuCube(g, CUBE_VARIANTS.h2d),
  h2s: (g) => buildBambuCube(g, CUBE_VARIANTS.h2s),
  'h2d-pro': (g) => buildBambuCube(g, CUBE_VARIANTS['h2d-pro']),
  h2c: (g) => buildBambuCube(g, CUBE_VARIANTS.h2c),
};

export function createPrinterModel(model) {
  const group = new THREE.Group();
  BUILDERS[model.style](group, model);
  mergeStatic(group); // Hunderte Einzelteile → wenige Meshes pro Material (bewegliche Achsen bleiben eigenständig)
  updatePrinterTubes(group); // Schläuche in Ruheposition biegen
  group.userData.model = model;
  return group;
}

const sizeCache = new Map();

// Abmessungen des fertigen Modells (Vector3 in Metern), z. B. für Karton und Stellplatz-Vorschau
export function printerSize(model) {
  if (!sizeCache.has(model.id)) {
    // Lichtschein u. Ä. (userData.noBounds) zählt nicht mit
    const printer = createPrinterModel(model);
    printer.updateMatrixWorld(true);
    const box = new THREE.Box3();
    printer.traverse((o) => {
      if (o.isMesh && !o.userData.noBounds) box.expandByObject(o, false);
    });
    sizeCache.set(model.id, box.getSize(new THREE.Vector3()));
  }
  return sizeCache.get(model.id);
}
