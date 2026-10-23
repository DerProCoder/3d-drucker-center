// Einfache Kollision für die Spielfigur: Spieler als Kreis auf dem Boden (XZ-Ebene),
// Hindernisse als achsenparallele Rechtecke { minX, maxX, minZ, maxZ, level? }. level: Stockwerk (0 = Erdgeschoss,
// 1 = zweite Etage, siehe world/upper-floor.js) – ohne Angabe gilt das Hindernis im Erdgeschoss.
import * as THREE from 'three';

export class CollisionWorld {
  constructor() {
    this.boxes = [];
    this.dynamic = new Map(); // Gruppen, die sich ändern (z. B. Kartons im Lager)
  }

  addBox(box) {
    this.boxes.push(box);
  }

  // Ganze Objektgruppe (z. B. Tisch mit allem, was darauf/darunter steht) als Hindernis eintragen
  addObject(object, padding = 0) {
    const box = new THREE.Box3().setFromObject(object);
    this.addBox({
      minX: box.min.x - padding, maxX: box.max.x + padding,
      minZ: box.min.z - padding, maxZ: box.max.z + padding,
    });
  }

  // Ersetzt alle Hindernisse einer dynamischen Gruppe
  setDynamic(key, boxes) {
    this.dynamic.set(key, boxes);
  }

  // Schiebt position (Vector3, nur x/z) aus allen Hindernissen heraus. Entlang der Kante
  // bleibt die Bewegung erhalten, man rutscht also an Tischen und Wänden entlang.
  // level: Stockwerk, auf dem die Figur gerade läuft
  resolve(position, radius, level = 0) {
    const all = [this.boxes, ...this.dynamic.values()].flat().filter((b) => (b.level ?? 0) === level);
    for (let pass = 0; pass < 2; pass++) {
      for (const b of all) {
        const nearestX = THREE.MathUtils.clamp(position.x, b.minX, b.maxX);
        const nearestZ = THREE.MathUtils.clamp(position.z, b.minZ, b.maxZ);
        const dx = position.x - nearestX;
        const dz = position.z - nearestZ;
        const distSq = dx * dx + dz * dz;
        if (distSq >= radius * radius) continue;

        if (distSq > 1e-12) {
          const dist = Math.sqrt(distSq);
          const push = radius - dist;
          position.x += (dx / dist) * push;
          position.z += (dz / dist) * push;
        } else {
          // Mittelpunkt steckt im Hindernis: über die nächstgelegene Kante hinausschieben
          const exits = [
            { d: position.x - b.minX, x: b.minX - radius, z: position.z },
            { d: b.maxX - position.x, x: b.maxX + radius, z: position.z },
            { d: position.z - b.minZ, x: position.x, z: b.minZ - radius },
            { d: b.maxZ - position.z, x: position.x, z: b.maxZ + radius },
          ];
          const best = exits.reduce((a, e) => (e.d < a.d ? e : a));
          position.x = best.x;
          position.z = best.z;
        }
      }
    }
  }
}
