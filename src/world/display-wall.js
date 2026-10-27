// Ausstellungsregale an der Südwand der Halle: Karton aus dem Lager an einen freien Wandplatz stellen (grüne
// Vorschau), fertige Teile aus dem Inventar in die Fächer stellen (Mausrad wählt das Teil) und wieder herausnehmen.
// Leere Regale lassen sich am Sockel oder an der Deckplatte wieder aufheben. Spiellogik: core/display-shelf.js
import * as THREE from 'three';
import { furnitureById, isLaserTemplate, templateById } from '../core/catalog.js';
import { DISPLAY_SPOTS, displayableParts, isDisplayShelf, putOnDisplay, takeFromDisplay, wallSlotUsed } from '../core/display-shelf.js';
import { colorsLabel, partFilaments } from '../core/two-color.js';
import { createFurnitureModel, furnitureSize } from '../models/furniture.js';
import { getPrintShape } from '../models/print-shapes.js';
import { createLaserPieceGeometry } from '../models/laser-model.js';
import { partMaterials } from '../models/printed-part.js';
import { ROOM_SIZE } from './room.js';
import { enableShadows } from './util.js';

const HALF = ROOM_SIZE / 2;
export const DISPLAY_SPOTS_X = [-2, 1, 4, 7]; // Wandplätze (Welt-x), rechts der Lagertür bis zur Ostecke
const WALL_GAP = 0.02;                         // Abstand der Rückwand zur Wand
const SHELF_TYPE = furnitureById('display-shelf');

const partName = (part) => `${templateById(part.templateId).name} (${colorsLabel(part.colors ?? part.filamentIds)})`;

export function createDisplayWall({ economy, carry, collision }) {
  const group = new THREE.Group();
  const shelves = new Map(); // Regal-ID → Modell
  let selected = 0;          // welches fertige Teil der nächste Klick ausstellt (Mausrad)

  const spotZ = () => HALF - WALL_GAP - furnitureSize(SHELF_TYPE).z / 2;
  // Boolean: three.js blendet nur bei visible === false aus – null oder undefined zählen als sichtbar
  const carryingShelf = () => !!carry.furniture && isDisplayShelf(carry.furniture);

  // Grüne Vorschau je Wandplatz – nur sichtbar (und anklickbar), solange man ein Ausstellungsregal trägt
  const ghosts = DISPLAY_SPOTS_X.slice(0, DISPLAY_SPOTS).map((x, slot) => {
    const size = furnitureSize(SHELF_TYPE);
    const ghost = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshBasicMaterial({ color: 0x3ad16b, transparent: true, opacity: 0.25, depthWrite: false })
    );
    ghost.position.set(x, size.y / 2, spotZ());
    ghost.visible = false;
    ghost.userData.interaction = {
      hint: () => 'Linksklick: Ausstellungsregal hier aufstellen',
      action: () => economy.placeFurniture(carry.releaseFurniture().id, slot),
    };
    group.add(ghost);
    return ghost;
  });

  // Welches Fach getroffen wurde: aus dem Trefferpunkt im Regal (lokal) – null bei Sockel, Deckplatte und Seiten
  function cellAt(model, hit) {
    const local = model.worldToLocal(hit.point.clone());
    const { partSpots, cell } = model.userData;
    const index = partSpots.findIndex((s) => Math.abs(local.x - s.x) < (cell.w + 0.04) / 2 && local.y >= s.y - 0.03 && local.y < s.y + cell.h + 0.03);
    return index === -1 ? null : index;
  }

  function shelfInteraction(shelf, model) {
    const choice = () => {
      const list = displayableParts(economy);
      if (!list.length) return null;
      selected = ((selected % list.length) + list.length) % list.length;
      return { part: list[selected], index: selected, total: list.length };
    };
    return {
      hint: (hit) => {
        if (!carry.isEmpty) return null;
        const i = cellAt(model, hit);
        if (i === null) {
          return economy.isFurnitureEmpty(shelf) ? 'Linksklick: leeres Ausstellungsregal aufheben' : null;
        }
        const shown = shelf.parts[i];
        if (shown) return `Linksklick: ${partName(shown)} aus dem Regal nehmen`;
        const c = choice();
        if (!c) return 'Keine fertigen Teile zum Ausstellen – erst etwas drucken und entnehmen';
        return `Linksklick: ${partName(c.part)} ausstellen${c.total > 1 ? ` · Mausrad: anderes Teil (${c.index + 1}/${c.total})` : ''}`;
      },
      action: (hit) => {
        if (!carry.isEmpty) return;
        const i = cellAt(model, hit);
        if (i === null) {
          if (economy.pickUpFurniture(shelf.id)) carry.holdFurniture(shelf);
        } else if (shelf.parts[i]) {
          takeFromDisplay(economy, shelf, i);
        } else {
          const c = choice();
          if (c) putOnDisplay(economy, shelf, i, c.part);
        }
      },
    };
  }

  // Teile im Regal neu aufbauen, wenn sich die Belegung geändert hat
  function updateContents(model, shelf) {
    const key = shelf.parts.map((p) => (p ? `${p.templateId}|${p.filamentIds.join('+')}` : '-')).join(',');
    if (model.userData.contentKey === key) return;
    model.userData.contentKey = key;
    model.userData.contents?.removeFromParent();
    const contents = new THREE.Group();
    const { partSpots, cell } = model.userData;
    shelf.parts.forEach((part, i) => {
      if (!part) return;
      try {
        contents.add(partMesh(part, partSpots[i], cell));
      } catch (err) {
        // Ein Teil, das sich nicht darstellen lässt, darf nicht das ganze Spiel anhalten – dann bleibt das Fach leer
        console.warn('Ausstellungsteil konnte nicht dargestellt werden', part, err);
      }
    });
    enableShadows(contents);
    model.add(contents);
    model.userData.contents = contents;
  }

  // Ein ausgestelltes Teil, auf die Standfläche spot gestellt. Laserteile (Holz) haben keine Druckform, sie stehen als
  // Holzfigur bzw. Holzschild im Fach.
  function partMesh(part, spot, cell) {
    const template = templateById(part.templateId);
    const geometry = isLaserTemplate(template) ? createLaserPieceGeometry(template.laser) : getPrintShape(template).geometry;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const size = box.getSize(new THREE.Vector3());
    // Große Teile (z. B. Vase) passen verkleinert ins Fach
    const scale = Math.min(1, cell.w / size.x, cell.d / size.z, cell.h / size.y);
    const mesh = new THREE.Mesh(geometry, partMaterials(partFilaments(template, part.filamentIds)));
    mesh.scale.setScalar(scale);
    const center = box.getCenter(new THREE.Vector3());
    mesh.position.set(spot.x - center.x * scale, spot.y - box.min.y * scale, spot.z - center.z * scale);
    return mesh;
  }

  function sync() {
    const boxes = [];
    for (const shelf of economy.furniture.filter(isDisplayShelf)) {
      let model = shelves.get(shelf.id);
      if (shelf.location !== 'wall') {
        if (model) {
          group.remove(model);
          shelves.delete(shelf.id);
        }
        continue;
      }
      if (!model) {
        model = createFurnitureModel(shelf.type);
        model.rotation.y = Math.PI; // Vorderseite zeigt in die Halle (-z)
        model.position.set(DISPLAY_SPOTS_X[shelf.slot], 0, spotZ());
        model.userData.interaction = shelfInteraction(shelf, model);
        group.add(model);
        shelves.set(shelf.id, model);
      }
      updateContents(model, shelf);
      const size = furnitureSize(shelf.type);
      boxes.push({
        minX: model.position.x - size.x / 2, maxX: model.position.x + size.x / 2,
        minZ: model.position.z - size.z / 2, maxZ: HALF,
      });
    }
    collision.setDynamic('display-shelves', boxes);
  }
  economy.subscribe(sync);

  // Vorschau ein- und ausblenden – getragen wird ohne Meldung der Wirtschaft, darum jedes Bild prüfen
  function update() {
    const show = carryingShelf();
    ghosts.forEach((ghost, slot) => { ghost.visible = show && !wallSlotUsed(economy, slot); });
  }

  // Mausrad, während man auf ein freies Fach zielt: anderes Teil wählen. Gibt zurück, ob das Rad verbraucht wurde.
  function cycle(direction, aimedAt) {
    if (!carry.isEmpty || !aimedAt || ![...shelves.values()].includes(aimedAt)) return false;
    selected += direction;
    return true;
  }

  return { group, update, cycle };
}
