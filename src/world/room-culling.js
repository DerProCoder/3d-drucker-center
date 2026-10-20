// Räume ausblenden, in die man gerade nicht hineinsehen kann: Halle, Lager, Büro, Empfang und Außenbereich werden nur
// gezeichnet, wenn die Spielfigur drin steht oder eine Tür dorthin im Bild ist. Das spart in der Halle Hunderte
// Draw Calls (auch in der Schattenkarte).
// Ausgeblendet wird über eine eigene Ebene (layers) statt über visible, damit es sich nicht mit Modulen beißt, die
// selbst ein- und ausblenden (z. B. der Trockenschrank). Lichter bleiben immer an – ändert sich die Zahl der
// Lichter, müsste three.js alle Shader neu übersetzen, und das Spiel stünde jedes Mal kurz still.
import * as THREE from 'three';
import { ROOM_SIZE, WALL_THICKNESS, STORAGE_DOOR, OFFICE_DOOR, ENTRANCE_DOOR } from './room.js';
import { ENTRANCE, FRONT_DOOR } from './entrance.js';
import { STORAGE_ROOM } from './storage-room.js';
import { OFFICE_ROOM } from './office.js';

const HIDDEN_LAYER = 31; // auf dieser Ebene zeichnet keine Kamera
const HALF = ROOM_SIZE / 2;
const T = WALL_THICKNESS;

// Türöffnungen als Quader (etwas größer, damit nichts zu früh verschwindet)
const doorBox = (x0, x1, z0, z1, h) => new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, h, z1));
const DOORS = {
  storage: doorBox(STORAGE_DOOR.x - STORAGE_DOOR.w / 2, STORAGE_DOOR.x + STORAGE_DOOR.w / 2, HALF - 0.05, HALF + T + 0.05, STORAGE_DOOR.h),
  office: doorBox(HALF - 0.05, HALF + T + 0.05, OFFICE_DOOR.z - OFFICE_DOOR.w / 2, OFFICE_DOOR.z + OFFICE_DOOR.w / 2, OFFICE_DOOR.h),
  entrance: doorBox(-HALF - T - 0.05, -HALF + 0.05, ENTRANCE_DOOR.z - ENTRANCE_DOOR.w / 2, ENTRANCE_DOOR.z + ENTRANCE_DOOR.w / 2, ENTRANCE_DOOR.h),
  front: doorBox(ENTRANCE.x0 - T - 0.05, ENTRANCE.x0 + 0.05, FRONT_DOOR.z - FRONT_DOOR.w / 2, FRONT_DOOR.z + FRONT_DOOR.w / 2, FRONT_DOOR.h),
};

const within = (p, r, margin = 0.3) => p.x > r.x0 - margin && p.x < r.x1 + margin && p.z > r.z0 - margin && p.z < r.z1 + margin;
const AREAS = {
  hall: { x0: -HALF, x1: HALF, z0: -HALF, z1: HALF },
  storage: STORAGE_ROOM,
  office: OFFICE_ROOM,
  entrance: ENTRANCE,
};

// Alle Teile einer Gruppe, die man ausblenden darf: ganze Untergruppen ohne Licht, bei Gruppen mit Licht deren Kinder
function hideableParts(group) {
  const parts = [];
  const visit = (node) => {
    for (const child of node.children) {
      if (child.isLight) continue;
      let hasLight = false;
      child.traverse((o) => { if (o.isLight) hasLight = true; });
      if (hasLight) visit(child);
      else parts.push(child);
    }
  };
  visit(group);
  return parts;
}

// rooms: { hall, storage, office, entrance: [Gruppen] } – der Außenbereich blendet sich in outdoor.update selbst aus,
// fragt dafür aber outdoorVisible() · onShow: wird aufgerufen, wenn ein Raum wieder auftaucht (Lampenschatten
// neu zeichnen – solange er ausgeblendet war, fehlte er darin)
export function createRoomCulling(camera, rooms, onShow = () => {}) {
  const frustum = new THREE.Frustum();
  const matrix = new THREE.Matrix4();
  const state = {};
  const parts = Object.fromEntries(Object.entries(rooms).map(([name, groups]) => [name, groups.flatMap(hideableParts)]));
  const seen = (door) => frustum.intersectsBox(DOORS[door]);
  let outdoor = true;

  function update() {
    camera.updateMatrixWorld();
    matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(matrix);
    const p = camera.position;
    const where = Object.keys(AREAS).find((name) => within(p, AREAS[name])) ?? 'outside';
    const inHall = where === 'hall';
    const visible = {
      // Halle: von den Anbauten aus durch deren Tür, von draußen durch Glastür und Empfangstür
      hall: inHall || (where === 'storage' && seen('storage')) || (where === 'office' && seen('office'))
        || (where === 'entrance' && seen('entrance')) || (where === 'outside' && seen('front') && seen('entrance')),
      storage: where === 'storage' || (inHall && seen('storage')),
      office: where === 'office' || (inHall && seen('office')),
      // Empfang auch von draußen durch die Glastür
      entrance: where === 'entrance' || (inHall && seen('entrance')) || (where === 'outside' && seen('front')),
    };
    outdoor = where === 'outside' || (where === 'entrance' && seen('front')) || (inHall && seen('entrance') && seen('front'));
    for (const [name, list] of Object.entries(parts)) {
      if (state[name] === visible[name]) continue;
      state[name] = visible[name];
      const layer = visible[name] ? 0 : HIDDEN_LAYER;
      for (const part of list) part.traverse((o) => { if (!o.isLight) o.layers.set(layer); });
      if (visible[name]) onShow(name);
    }
  }

  return { update, outdoorVisible: () => outdoor };
}
