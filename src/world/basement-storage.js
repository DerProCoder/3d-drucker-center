// Keller-Lager (#53) in 3D: In jedem Lager-Feld des Kellers (core/basement-layout.js) liegen
//   - vier Stapelzonen für Kartons (gelb umrandet, am Mittelgang): Klick auf einen Karton nimmt ihn, mit einem Karton
//     in der Hand stellt ein Klick auf Zone oder Stapel ihn dort ab. Mit „Alles tragen“ (#63) nimmt ein Klick auf einen
//     Karton ihn zum Stapel in der Hand dazu, ein Klick auf den Zonenboden stellt alle getragenen ab, soweit Platz ist,
//   - acht Regalplätze (blau umrandet, beiderseits des Mittelgangs) für Filament-Regale auf einem Stahlgestell. Spulen
//     darin bleiben trocken (core/basement-storage.js).
// Lage der Zonen und Plätze: ZONE_LAYOUT/RACK_LAYOUT aus core/basement-storage.js (relativ zur Feldmitte).
//
// Leistung: Markierungen je Feld zusammengefasst (mergeStatic), Kartons als InstancedMesh je Kartonart (3 Draw Calls
// je Art und Feld, die Seiten mit gleichem Material zusammengelegt), Regale und Gestelle als InstancedMesh, Spulen als
// Spulen-Batch (models/spool.js). Keine Schatten – im Keller gibt es kein Licht, das welche wirft.
// Alles hängt je Feld in basement.fields.contentGroup(Feld) auf Höhe des Kellerbodens und wird mit dem Feld
// ein- und ausgeblendet.
import * as THREE from 'three';
import { mergeGeometries, mergeGroups } from 'three/addons/utils/BufferGeometryUtils.js';
import { BASEMENT_FLOOR_Y, fieldBounds } from '../core/basement-layout.js';
import {
  DRY_RACK_LABEL, RACK_LAYOUT, RACK_SPOTS_PER_FIELD, STACKS_PER_ZONE, ZONE_LAYOUT, ZONES_PER_FIELD,
} from '../core/basement-storage.js';
import { filamentById, furnitureById } from '../core/catalog.js';
import { spoolLabel } from '../core/economy.js';
import { box } from '../models/mesh-helpers.js';
import { mergeStatic } from '../models/merge-static.js';
import { createFurnitureModel } from '../models/furniture.js';
import { createSpoolBatch } from '../models/spool.js';
import { crateHeight, makeCrate } from './storage-room.js';

const LEVEL = -2;               // Stockwerk des Kellers für die Kollision (world/basement.js LEVEL.BASEMENT)
const STAND = { w: 0.6, d: 0.38, h: 0.72 }; // Stahlgestell unter dem Filament-Regal (Regal steht auf Griffhöhe)
const LINE = 0.06;              // Breite der Markierungslinien
const HIT = new THREE.MeshBasicMaterial({ visible: false });
const ZONE_LEN = (STACKS_PER_ZONE - 1) * ZONE_LAYOUT.pitch + 1.1; // Länge einer Zone in z

// Weltlage (x, z) von Zone bzw. Regalplatz in Feld i
function zoneRect(i, zone) {
  const b = fieldBounds(i);
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const z = ZONE_LAYOUT.zones[zone];
  const x = cx + z.x;
  const z0 = cz + z.z - 0.55;
  return { x, z0, z1: z0 + ZONE_LEN, stackZ: (c) => cz + z.z + c * ZONE_LAYOUT.pitch };
}

function rackPlace(i, spot) {
  const b = fieldBounds(i);
  const s = RACK_LAYOUT.spots[spot];
  return { x: (b.minX + b.maxX) / 2 + s.x, z: (b.minZ + b.maxZ) / 2 + s.z, rotY: (s.facing * Math.PI) / 2 };
}

// ---------- gemeinsame Geometrien ----------

// Karton je Art: Geometrie mit Ursprung unten, Seiten mit gleichem Material zusammengelegt (3 statt 6 Gruppen)
const crateKinds = new Map();
function crateKind(entry) {
  const key = entry.model ? `printer:${entry.model.id}` : `furniture:${entry.type.id}`;
  let kind = crateKinds.get(key);
  if (kind) return kind;
  const crate = makeCrate(entry);
  const mesh = crate.children[0];
  const geometry = mesh.geometry.clone().translate(0, mesh.position.y, 0);
  const materials = [...new Set(mesh.material)];
  for (const g of geometry.groups) g.materialIndex = materials.indexOf(mesh.material[g.materialIndex]);
  kind = { key, geometry: mergeGroups(geometry), materials, size: crate.userData.size };
  crateKinds.set(key, kind);
  return kind;
}

// Filament-Regal als Vorlage: Teile (Geometrie, Material, Lage) und Spulenplätze – je Material ein InstancedMesh
let rackTemplate = null;
function getRackTemplate() {
  if (rackTemplate) return rackTemplate;
  const model = createFurnitureModel(furnitureById('filament-rack'));
  model.updateMatrixWorld(true);
  const parts = [];
  model.traverse((o) => { if (o.isMesh) parts.push({ geometry: o.geometry, material: o.material, matrix: o.matrixWorld.clone() }); });
  // Gestell: Platte und vier Beine in einer Geometrie
  const legs = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    legs.push(new THREE.BoxGeometry(0.035, STAND.h - 0.03, 0.035).translate(sx * (STAND.w / 2 - 0.02), (STAND.h - 0.03) / 2, sz * (STAND.d / 2 - 0.02)));
  }
  legs.push(new THREE.BoxGeometry(STAND.w, 0.03, STAND.d).translate(0, STAND.h - 0.015, 0));
  legs.push(new THREE.BoxGeometry(STAND.w - 0.04, 0.02, STAND.d - 0.04).translate(0, 0.12, 0)); // Fußboden-Ablage
  const standMat = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.5, metalness: 0.5 });
  parts.push({ geometry: mergeGeometries(legs), material: standMat, matrix: new THREE.Matrix4().makeTranslation(0, -STAND.h, 0) });
  rackTemplate = { parts, spoolSpots: model.userData.spoolSpots };
  return rackTemplate;
}

// ---------- Markierungen ----------

let markMats = null;
function markMaterials() {
  markMats ??= {
    zone: new THREE.MeshStandardMaterial({ color: 0xe8c21e, roughness: 0.7 }),
    rack: new THREE.MeshStandardMaterial({ color: 0x2d7fd0, roughness: 0.7 }),
  };
  return markMats;
}

function outline(g, material, cx, cz, w, d) {
  g.add(
    box(w, 0.004, LINE, material, cx, 0.003, cz - d / 2),
    box(w, 0.004, LINE, material, cx, 0.003, cz + d / 2),
    box(LINE, 0.004, d, material, cx - w / 2, 0.003, cz),
    box(LINE, 0.004, d, material, cx + w / 2, 0.003, cz),
  );
}

// store: core/basement-storage.js · fields: world/basement-fields.js · layout: core/basement-layout.js
export function createBasementStorage({ economy, store, carry, collision, fields, layout }) {
  store.heightOf = crateHeight; // Kartonhöhen kennt nur die 3D-Seite
  const holders = new Map();    // Feld → { group, marks, contents, key }

  const boxName = (item) => (item.model ? `Karton ${item.model.name}` : `Karton ${item.type.name}`);
  const heldBox = () => carry.printer ?? carry.furniture;

  // ---------- Interaktion ----------

  // Getragene Kartons, der oberste zuerst – auf einer Zone wird alles abgestellt, was dort noch Platz hat (#63:
  // mit „Alles tragen“ mehrere, sonst ist es ohnehin nur einer)
  function putHint(field, zone) {
    const items = heldBox() ? carry.boxItems : [];
    if (!items.length) return null;
    const n = store.fittingCount(field, zone, items);
    if (!n) return 'Stapelplatz voll – die Kartons reichen bis unter die Decke';
    if (items.length === 1) return `Linksklick: ${boxName(items[0])} hier abstellen (Keller-Lager)`;
    const what = n === items.length ? `alle ${n} Kartons` : `${n} von ${items.length} Kartons (mehr passen nicht)`;
    return `Linksklick: ${what} hier abstellen (Keller-Lager)`;
  }

  function put(field, zone) {
    while (heldBox()) {
      const item = heldBox();
      if (store.putBox(item, field, zone)) return;
      if (item.model) carry.releasePrinter();
      else carry.releaseFurniture();
    }
  }

  function zoneInteraction(field, zone) {
    return { hint: () => putHint(field, zone), action: () => put(field, zone) };
  }

  // Mit „Alles tragen“ und Platz in den Händen nimmt ein Klick auf einen Karton ihn dazu (wie im Abstellraum);
  // abgestellt wird dann über den gelb markierten Boden der Zone. Sonst stellt der Klick den Karton auf den Stapel.
  const collecting = () => heldBox() && carry.maxBoxes > 1 && carry.canTakeBox;

  function crateInteraction(item, field, zone) {
    return {
      hint: () => {
        if (collecting()) {
          return `Linksklick: ${boxName(item)} dazunehmen (${carry.boxes.length + 1}/${carry.maxBoxes} in der Hand) · `
            + 'zum Abstellen auf den gelb markierten Boden der Zone zielen';
        }
        if (heldBox()) return putHint(field, zone);
        if (!carry.canTakeBox) return 'Hände voll – Q legt alles zurück ins Lager';
        return `Linksklick: ${boxName(item)} aufheben`;
      },
      action: () => {
        if (heldBox() && !collecting()) {
          put(field, zone);
          return;
        }
        if (!carry.canTakeBox || !store.takeBox(item)) return;
        if (item.model) carry.holdPrinter(item);
        else carry.holdFurniture(item);
      },
    };
  }

  function spotInteraction(field, spot) {
    return {
      hint: () => {
        const item = carry.furniture;
        if (item?.type.id !== 'filament-rack' || store.rackAt(field, spot)) return null;
        return 'Linksklick: Filament-Regal hier aufstellen – Spulen darin bleiben trocken';
      },
      action: () => {
        const item = carry.furniture;
        if (item?.type.id === 'filament-rack' && !store.placeRack(item, field, spot)) carry.releaseFurniture();
      },
    };
  }

  // Filament-Regal: Spulen hineinlegen, leer wieder aufheben (wie am Druckertisch, world/workshop.js)
  function rackInteraction(rack) {
    const free = () => rack.spools.filter((s) => !s).length;
    return {
      hint: () => {
        if (carry.printer || carry.furniture || carry.nozzle || carry.sheet) return null;
        if (carry.hasSpools) {
          if (!free()) return `Filament-Regal ist voll · ${DRY_RACK_LABEL}`;
          const n = Math.min(free(), carry.spools.length);
          return `Linksklick: ${n === 1 ? 'Spule' : `${n} Spulen`} ins Filament-Regal legen (${free()} frei) · ${DRY_RACK_LABEL}`;
        }
        if (economy.isFurnitureEmpty(rack)) return `Linksklick: leeres Filament-Regal aufheben · ${DRY_RACK_LABEL}`;
        return `Filament-Regal: ${rack.type.capacity - free()}/${rack.type.capacity} Spulen · ${DRY_RACK_LABEL} – auf eine Spule zielen, um sie zu nehmen`;
      },
      action: () => {
        if (carry.hasSpools) {
          while (carry.spools.length && free()) economy.putSpoolInRack(rack.id, carry.takeSpool(carry.spools.length - 1));
        } else if (carry.isEmpty && store.pickUpRack(rack)) {
          carry.holdFurniture(rack);
        }
      },
    };
  }

  function rackSpoolInteraction(rack, index) {
    const whole = rackInteraction(rack);
    return {
      hint: () => {
        const spool = rack.spools[index];
        if (!spool) return whole.hint();
        if (carry.canTakeSpool) {
          // Mehrere Spulen nacheinander (bis carry.maxSpools, mit „Alles tragen“ mehr), wie an den Regalen oben
          const count = carry.hasSpools ? ` (${carry.spools.length + 1}/${carry.maxSpools} in der Hand)` : '';
          return `Linksklick: ${spoolLabel(spool)} nehmen${count} · ${DRY_RACK_LABEL}`;
        }
        return whole.hint();
      },
      action: () => {
        if (!carry.canTakeSpool) {
          whole.action();
          return;
        }
        const spool = economy.takeSpoolFromRack(rack.id, index);
        if (spool) carry.addSpool(spool);
      },
    };
  }

  // ---------- Aufbau je Feld ----------

  // Feste Teile eines Lager-Feldes: Markierungen und unsichtbare Klickflächen
  function buildMarks(i) {
    const m = markMaterials();
    const g = new THREE.Group();
    for (let zone = 0; zone < ZONES_PER_FIELD; zone++) {
      const r = zoneRect(i, zone);
      outline(g, m.zone, r.x, (r.z0 + r.z1) / 2, ZONE_LAYOUT.width, r.z1 - r.z0);
    }
    for (let spot = 0; spot < RACK_SPOTS_PER_FIELD; spot++) {
      const p = rackPlace(i, spot);
      // Gestell ist in Blickrichtung STAND.d tief: Rechteck entsprechend drehen
      const along = Math.abs(Math.sin(p.rotY)) > 0.5;
      outline(g, m.rack, p.x, p.z, along ? STAND.d + 0.1 : STAND.w + 0.1, along ? STAND.w + 0.1 : STAND.d + 0.1);
    }
    mergeStatic(g);
    // Klickflächen (unsichtbar, kosten keinen Draw Call)
    for (let zone = 0; zone < ZONES_PER_FIELD; zone++) {
      const r = zoneRect(i, zone);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(ZONE_LAYOUT.width, 0.05, r.z1 - r.z0), HIT);
      hit.position.set(r.x, 0.025, (r.z0 + r.z1) / 2);
      hit.userData.interaction = zoneInteraction(i, zone);
      g.add(hit);
    }
    g.userData.spotHits = [];
    for (let spot = 0; spot < RACK_SPOTS_PER_FIELD; spot++) {
      const p = rackPlace(i, spot);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(STAND.w, 1.2, STAND.d), HIT);
      hit.position.set(p.x, 0.6, p.z);
      hit.rotation.y = p.rotY;
      hit.userData.interaction = spotInteraction(i, spot);
      g.add(hit);
      g.userData.spotHits.push(hit);
    }
    return g;
  }

  // Veränderliches: Kartons, Regale, Spulen. Gibt Kollisionsboxen zurück.
  function buildContents(i, group) {
    group.clear();
    const colliders = [];
    // Kartons je Zone stapeln (core/storage-stack.js über store.stack) und je Art als InstancedMesh zeichnen
    const byKind = new Map();
    for (let zone = 0; zone < ZONES_PER_FIELD; zone++) {
      const r = zoneRect(i, zone);
      for (const { box: { entry: item }, column, y } of store.stack(i, zone).placed) {
        if (item.location !== 'basement') continue; // unterwegs: Platz reserviert, aber noch nicht da
        const kind = crateKind(item);
        const z = r.stackZ(column);
        if (!byKind.has(kind)) byKind.set(kind, []);
        byKind.get(kind).push({ item, zone, x: r.x, y, z });
        if (y > 0) continue;
        const { w, d } = kind.size;
        colliders.push({ minX: r.x - w / 2, maxX: r.x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, level: LEVEL });
      }
    }
    const matrix = new THREE.Matrix4();
    for (const [kind, list] of byKind) {
      const mesh = new THREE.InstancedMesh(kind.geometry, kind.materials, list.length);
      list.forEach((c, k) => mesh.setMatrixAt(k, matrix.makeTranslation(c.x, c.y, c.z)));
      mesh.computeBoundingSphere();
      const interactions = list.map((c) => crateInteraction(c.item, i, c.zone));
      mesh.userData.interaction = {
        hint: (hit) => interactions[hit?.instanceId]?.hint() ?? null,
        action: (hit) => interactions[hit?.instanceId]?.action(),
      };
      group.add(mesh);
    }

    // Filament-Regale auf Gestellen
    const racks = store.racksIn(i);
    if (racks.length) {
      const t = getRackTemplate();
      const places = racks.map((rack) => {
        const p = rackPlace(i, rack.basement.spot);
        return new THREE.Matrix4().compose(
          new THREE.Vector3(p.x, STAND.h, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY), new THREE.Vector3(1, 1, 1),
        );
      });
      const interactions = racks.map((rack) => rackInteraction(rack));
      for (const part of t.parts) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, racks.length);
        places.forEach((place, k) => mesh.setMatrixAt(k, matrix.multiplyMatrices(place, part.matrix)));
        mesh.computeBoundingSphere();
        mesh.userData.interaction = {
          hint: (hit) => interactions[hit?.instanceId]?.hint() ?? null,
          action: (hit) => interactions[hit?.instanceId]?.action(),
        };
        group.add(mesh);
      }
      const spools = [];
      racks.forEach((rack, k) => {
        const p = rackPlace(i, rack.basement.spot);
        rack.spools.forEach((spool, s) => {
          if (!spool) return;
          spools.push({
            filament: filamentById(spool.filamentId),
            position: t.spoolSpots[s].clone().applyMatrix4(places[k]),
            rotationY: p.rotY,
            interaction: rackSpoolInteraction(rack, s),
          });
        });
        const half = Math.abs(Math.sin(p.rotY)) > 0.5 ? [STAND.d / 2, STAND.w / 2] : [STAND.w / 2, STAND.d / 2];
        colliders.push({ minX: p.x - half[0], maxX: p.x + half[0], minZ: p.z - half[1], maxZ: p.z + half[1], level: LEVEL });
      });
      if (spools.length) group.add(createSpoolBatch(spools));
    }
    group.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
    return colliders;
  }

  // Schlüssel: Was in Feld i liegt – neu gebaut wird nur, wenn er sich ändert
  const ids = new WeakMap();
  let nextId = 1;
  const idOf = (o) => {
    if (!ids.has(o)) ids.set(o, nextId++);
    return ids.get(o);
  };
  function fieldKey(i) {
    const boxes = store.boxes.filter((x) => x.basement.field === i).map((x) => [idOf(x), x.basement.zone, x.basement.order]);
    const racks = store.racksIn(i).map((r) => [idOf(r), r.basement.spot, r.spools.map((s) => s?.filamentId ?? 0)]);
    return JSON.stringify([boxes, racks]);
  }

  const colliderMap = new Map(); // Feld → Kollisionsboxen

  function sync() {
    const wanted = new Set(store.storageFields());
    let changed = false;
    // Felder, die kein Lager (mehr) sind, räumen
    for (const [i, h] of holders) {
      if (wanted.has(i)) continue;
      h.group.removeFromParent();
      holders.delete(i);
      colliderMap.delete(i);
      changed = true;
    }
    for (const i of wanted) {
      let h = holders.get(i);
      if (!h) {
        const parent = fields.contentGroup(i);
        if (!parent) continue;
        const group = new THREE.Group();
        group.name = `basement-storage-${i}`;
        group.position.y = BASEMENT_FLOOR_Y;
        const contents = new THREE.Group();
        const marks = buildMarks(i);
        group.add(marks, contents);
        parent.add(group);
        h = { group, contents, spotHits: marks.userData.spotHits, key: null };
        holders.set(i, h);
      }
      const key = fieldKey(i);
      if (key === h.key) continue;
      h.key = key;
      colliderMap.set(i, buildContents(i, h.contents));
      // Belegte Regalplätze: Klickfläche aus, sonst verdeckt sie das Regal
      h.spotHits.forEach((hit, spot) => { hit.visible = !store.rackAt(i, spot); });
      changed = true;
    }
    if (changed) collision.setDynamic('basement-storage', [...colliderMap.values()].flat());
  }

  economy.subscribe(sync);
  layout.subscribe(() => sync());
  return { sync, zoneRect, rackPlace };
}
