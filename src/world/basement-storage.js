// Keller-Lager (#53, Raster #72) in 3D: Jedes Lager-Feld des Kellers (core/basement-layout.js) ist voller gelb
// umrandeter Lagerplätze in Doppelreihen mit Gängen dazwischen (STORAGE_PLACES aus core/basement-storage.js). Auf jedem
// Platz steht ein Kartonstapel oder ein Filament-Regal:
//   - Kartons: Klick auf einen Karton nimmt ihn, mit einem Karton in der Hand stellt ein Klick auf einen Platz oder
//     Stapel ihn dort ab. Mit „Alles tragen“ (#63) nimmt ein Klick auf einen Karton ihn zum Stapel in der Hand dazu,
//     ein Klick auf den Boden eines Platzes stellt alle getragenen ab, soweit Platz ist.
//   - Filament-Regal: mit dem Regal-Karton in der Hand auf einen leeren Platz → das Regal steht dort auf einem
//     Stahlgestell, Vorderseite zum Gang. Spulen darin bleiben trocken (core/basement-storage.js).
//   Beim Zielen zeigt ein grüner Rahmen, wo abgestellt wird (rot, wenn es dort nicht geht – der Hinweis nennt den Grund).
//
// Leistung: Markierungen je Feld zusammengefasst (mergeStatic, ein Draw Call), Klickflächen der Plätze als ein
// unsichtbares InstancedMesh je Feld (kein Draw Call, Strahltest über die Instanz-Nummer), Kartons als InstancedMesh je
// Kartonart (3 Draw Calls je Art und Feld, die Seiten mit gleichem Material zusammengelegt), Regale und Gestelle als
// InstancedMesh, Spulen als Spulen-Batch (models/spool.js). Keine Schatten – im Keller gibt es kein Licht, das welche
// wirft. Alles hängt je Feld in basement.fields.contentGroup(Feld) auf Höhe des Kellerbodens und wird mit dem Feld
// ein- und ausgeblendet (weit entfernte Felder zeichnet world/basement-fields.js gar nicht).
import * as THREE from 'three';
import { mergeGeometries, mergeGroups } from 'three/addons/utils/BufferGeometryUtils.js';
import { BASEMENT_FLOOR_Y } from '../core/basement-layout.js';
import { DRY_RACK_LABEL, PLACE, placeCenter, placesOf } from '../core/basement-storage.js';
import { filamentById, furnitureById } from '../core/catalog.js';
import { spoolLabel } from '../core/economy.js';
import { mergeStatic } from '../models/merge-static.js';
import { createFurnitureModel } from '../models/furniture.js';
import { createSpoolBatch } from '../models/spool.js';
import { crateHeight, makeCrate } from './storage-room.js';

const LEVEL = -2;               // Stockwerk des Kellers für die Kollision (world/basement.js LEVEL.BASEMENT)
const STAND = { w: 0.6, d: 0.38, h: 0.72 }; // Stahlgestell unter dem Filament-Regal (Regal steht auf Griffhöhe)
const RACK_SHIFT = 0.25;        // so weit rückt das Regal aus der Platzmitte zum Gang
const LINE = 0.05;              // Breite der Markierungslinien
const INSET = 0.04;             // Markierung so weit innerhalb der Platzgrenze (zwei Plätze: zwei Linien mit Fuge)
const HIT = new THREE.MeshBasicMaterial({ visible: false });

// Lage eines Platzes in Feld i (Welt x/z) samt Drehung eines Regals dort (Vorderseite zum Gang)
function placeRect(i, place) {
  const c = placeCenter(i, place);
  return { ...c, rotY: (c.facing * Math.PI) / 2, rackX: c.x + c.facing * RACK_SHIFT };
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

let markMat = null;
const markMaterial = () => (markMat ??= new THREE.MeshStandardMaterial({ color: 0xe8c21e, roughness: 0.7 }));

// Flacher Streifen auf dem Boden (2 Dreiecke statt 12 eines Quaders – je Feld fast 400 Stück)
function strip(w, d, material, x, z, y = 0.003) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
}

function outline(g, material, cx, cz, w, d, t = LINE) {
  g.add(
    strip(w, t, material, cx, cz - d / 2 + t / 2),
    strip(w, t, material, cx, cz + d / 2 - t / 2),
    strip(t, d - 2 * t, material, cx - w / 2 + t / 2, cz),
    strip(t, d - 2 * t, material, cx + w / 2 - t / 2, cz),
  );
}

// Rahmen beim Zielen: am Boden des Platzes und auf Höhe der Stapeloberkante
function createAimFrame() {
  const material = new THREE.MeshBasicMaterial({ color: 0x35e06a, transparent: true, opacity: 0.9, depthWrite: false });
  const frame = new THREE.Group();
  frame.name = 'basement-storage-aim';
  const ring = () => {
    const g = new THREE.Group();
    const w = PLACE.w - 0.02;
    const d = PLACE.d - 0.02;
    const t = 0.05;
    g.add(
      new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, t), material).translateZ(-d / 2),
      new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, t), material).translateZ(d / 2),
      new THREE.Mesh(new THREE.BoxGeometry(t, 0.02, d), material).translateX(-w / 2),
      new THREE.Mesh(new THREE.BoxGeometry(t, 0.02, d), material).translateX(w / 2),
    );
    return g;
  };
  const bottom = ring();
  bottom.position.y = 0.012;
  const top = ring();
  frame.add(bottom, top);
  frame.visible = false;
  frame.renderOrder = 2;
  return { frame, material, bottom, top };
}

// store: core/basement-storage.js · fields: world/basement-fields.js · layout: core/basement-layout.js
export function createBasementStorage({ economy, store, carry, collision, fields, layout }) {
  store.heightOf = crateHeight; // Kartonhöhen kennt nur die 3D-Seite (sortiert auch ein, was beim Laden offen blieb)
  const holders = new Map();    // Feld → { group, contents, key, tops }
  const aim = createAimFrame();

  const boxName = (item) => (item.model ? `Karton ${item.model.name}` : `Karton ${item.type.name}`);
  const heldBox = () => carry.printer ?? carry.furniture;
  // Genau ein Filament-Regal in der Hand: auf einem leeren Platz wird es aufgestellt statt als Karton abgestellt
  const heldRack = () => (carry.boxItems.length === 1 && carry.furniture?.type.id === 'filament-rack' ? carry.furniture : null);

  // ---------- Rahmen beim Zielen ----------

  function showAim(field, place, ok) {
    const h = holders.get(field);
    if (!h) return;
    const r = placeRect(field, place);
    if (aim.frame.parent !== h.group) h.group.add(aim.frame);
    aim.frame.position.set(r.x, 0, r.z);
    const top = h.tops.get(place) ?? 0;
    aim.top.visible = top > 0.05;
    aim.top.position.y = top + 0.012;
    aim.material.color.setHex(ok ? 0x35e06a : 0xe04535);
    aim.frame.visible = true;
  }
  const hideAim = () => { aim.frame.visible = false; };

  // ---------- Interaktion ----------

  // Was ein Klick auf Platz (field, place) mit dem, was man trägt, täte: { text, ok, rack } oder null
  function putPlan(field, place) {
    const items = heldBox() ? carry.boxItems : [];
    if (!items.length) return null;
    const rack = heldRack();
    if (rack && !store.rackProblem(rack, field, place)) {
      return { ok: true, rack, text: 'Linksklick: Filament-Regal hier aufstellen – Spulen darin bleiben trocken' };
    }
    // Getragene Kartons, der oberste zuerst – auf einem Platz wird alles abgestellt, was dort noch Platz hat (#63:
    // mit „Alles tragen“ mehrere, sonst ist es ohnehin nur einer)
    const n = store.fittingCount(field, place, items);
    if (!n) return { ok: false, text: store.boxProblem(field, place, items[0]) ?? 'Hier ist kein Platz' };
    // Regal auf einem Platz mit Kartons: geht nur als Karton auf den Stapel – der Hinweis sagt, warum
    if (rack) return { ok: true, text: `Linksklick: ${boxName(rack)} auf den Stapel stellen · zum Aufstellen braucht ein Regal einen leeren Platz` };
    if (items.length === 1) return { ok: true, text: `Linksklick: ${boxName(items[0])} hier abstellen (Keller-Lager)` };
    const what = n === items.length ? `alle ${n} Kartons` : `${n} von ${items.length} Kartons (mehr passen nicht)`;
    return { ok: true, text: `Linksklick: ${what} hier abstellen (Keller-Lager)` };
  }

  function put(field, place) {
    const rack = heldRack();
    if (rack && !store.rackProblem(rack, field, place)) {
      if (!store.placeRack(rack, field, place)) carry.releaseFurniture();
      return;
    }
    while (heldBox()) {
      const item = heldBox();
      if (store.putBox(item, field, place)) return;
      if (item.model) carry.releasePrinter();
      else carry.releaseFurniture();
    }
  }

  function placeInteraction(field, place) {
    return {
      hint: () => putPlan(field, place)?.text ?? null,
      action: () => put(field, place),
      hover: () => {
        const plan = putPlan(field, place);
        if (plan) showAim(field, place, plan.ok);
        else hideAim();
      },
    };
  }

  // Mit „Alles tragen“ und Platz in den Händen nimmt ein Klick auf einen Karton ihn dazu (wie im Abstellraum);
  // abgestellt wird dann über den gelb markierten Boden des Platzes. Sonst stellt der Klick den Karton auf den Stapel.
  const collecting = () => heldBox() && carry.maxBoxes > 1 && carry.canTakeBox;

  function crateInteraction(item, field, place) {
    return {
      hint: () => {
        if (collecting()) {
          return `Linksklick: ${boxName(item)} dazunehmen (${carry.boxes.length + 1}/${carry.maxBoxes} in der Hand) · `
            + 'zum Abstellen auf den gelb markierten Boden eines Platzes zielen';
        }
        if (heldBox()) return putPlan(field, place)?.text ?? null;
        if (!carry.canTakeBox) return 'Hände voll – Q legt alles zurück ins Lager';
        return `Linksklick: ${boxName(item)} aufheben`;
      },
      action: () => {
        if (heldBox() && !collecting()) {
          put(field, place);
          return;
        }
        if (!carry.canTakeBox || !store.takeBox(item)) return;
        if (item.model) carry.holdPrinter(item);
        else carry.holdFurniture(item);
      },
      hover: () => {
        const plan = heldBox() && !collecting() ? putPlan(field, place) : null;
        if (plan) showAim(field, place, plan.ok);
        else hideAim();
      },
    };
  }

  // Filament-Regal: Spulen hineinlegen, leer wieder aufheben (wie am Druckertisch, world/workshop.js)
  function rackInteraction(rack) {
    const free = () => rack.spools.filter((s) => !s).length;
    return {
      hint: () => {
        if (heldBox()) return 'Hier steht ein Filament-Regal – Kartons nur auf freie Plätze oder Kartonstapel';
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
        if (heldBox()) return;
        if (carry.hasSpools) {
          while (carry.spools.length && free()) economy.putSpoolInRack(rack.id, carry.takeSpool(carry.spools.length - 1));
        } else if (carry.isEmpty && store.pickUpRack(rack)) {
          carry.holdFurniture(rack);
        }
      },
      hover: () => {
        if (heldBox() && rack.basement) showAim(rack.basement.field, rack.basement.place, false);
        else hideAim();
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
      hover: () => whole.hover(),
    };
  }

  // Interaktion eines InstancedMesh: je Instanz eine eigene (Strahl liefert hit.instanceId)
  function instanced(mesh, interactions) {
    mesh.userData.interaction = {
      hint: (hit) => interactions[hit?.instanceId]?.hint() ?? null,
      action: (hit) => interactions[hit?.instanceId]?.action(),
      hover: (hit) => interactions[hit?.instanceId]?.hover?.(),
      unhover: hideAim,
    };
  }

  // ---------- Aufbau je Feld ----------

  // Feste Teile eines Lager-Feldes: gelbe Umrandung jedes Platzes und unsichtbare Klickflächen
  function buildMarks(i) {
    const m = markMaterial();
    const g = new THREE.Group();
    const places = placesOf(i);
    for (const place of places) {
      const r = placeRect(i, place);
      outline(g, m, r.x, r.z, PLACE.w - 2 * INSET, PLACE.d - 2 * INSET);
    }
    mergeStatic(g);
    // Klickflächen: ein InstancedMesh für alle Plätze (unsichtbar, kostet keinen Draw Call)
    const hits = new THREE.InstancedMesh(new THREE.BoxGeometry(PLACE.w - 0.04, 0.05, PLACE.d - 0.04), HIT, places.length);
    const matrix = new THREE.Matrix4();
    places.forEach((place, k) => {
      const r = placeRect(i, place);
      hits.setMatrixAt(k, matrix.makeTranslation(r.x, 0.025, r.z));
    });
    hits.computeBoundingSphere();
    hits.name = `basement-storage-places-${i}`;
    instanced(hits, places.map((place) => placeInteraction(i, place)));
    g.add(hits);
    return g;
  }

  // Veränderliches: Kartons, Regale, Spulen. Gibt Kollisionsboxen und die Stapelhöhen je Platz zurück.
  function buildContents(i, group, idx) {
    group.clear();
    const colliders = [];
    const tops = new Map();
    // Kartons je Platz stapeln (core/storage-stack.js über store.stack) und je Art als InstancedMesh zeichnen
    const byKind = new Map();
    for (const place of placesOf(i)) {
      if (!store.boxesIn(i, place, idx).length) continue;
      const r = placeRect(i, place);
      let w = 0;
      let d = 0;
      let top = 0;
      for (const { box: { entry: item, h }, y } of store.stack(i, place, [], idx).placed) {
        if (item.location !== 'basement') continue; // unterwegs: Platz reserviert, aber noch nicht da
        const kind = crateKind(item);
        if (!byKind.has(kind)) byKind.set(kind, []);
        byKind.get(kind).push({ item, place, x: r.x, y, z: r.z });
        w = Math.max(w, kind.size.w);
        d = Math.max(d, kind.size.d);
        top = Math.max(top, y + h);
      }
      if (!top) continue;
      tops.set(place, top);
      colliders.push({ minX: r.x - w / 2, maxX: r.x + w / 2, minZ: r.z - d / 2, maxZ: r.z + d / 2, level: LEVEL });
    }
    const matrix = new THREE.Matrix4();
    for (const [kind, list] of byKind) {
      const mesh = new THREE.InstancedMesh(kind.geometry, kind.materials, list.length);
      list.forEach((c, k) => mesh.setMatrixAt(k, matrix.makeTranslation(c.x, c.y, c.z)));
      mesh.computeBoundingSphere();
      instanced(mesh, list.map((c) => crateInteraction(c.item, i, c.place)));
      group.add(mesh);
    }

    // Filament-Regale auf Gestellen
    const racks = store.racksIn(i).filter((rack) => Number.isInteger(rack.basement.place));
    if (racks.length) {
      const t = getRackTemplate();
      const up = new THREE.Vector3(0, 1, 0);
      const one = new THREE.Vector3(1, 1, 1);
      const rects = racks.map((rack) => placeRect(i, rack.basement.place));
      const places = rects.map((p) => new THREE.Matrix4().compose(
        new THREE.Vector3(p.rackX, STAND.h, p.z), new THREE.Quaternion().setFromAxisAngle(up, p.rotY), one,
      ));
      const interactions = racks.map((rack) => rackInteraction(rack));
      for (const part of t.parts) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, racks.length);
        places.forEach((place, k) => mesh.setMatrixAt(k, matrix.multiplyMatrices(place, part.matrix)));
        mesh.computeBoundingSphere();
        instanced(mesh, interactions);
        group.add(mesh);
      }
      const spools = [];
      racks.forEach((rack, k) => {
        const p = rects[k];
        rack.spools.forEach((spool, s) => {
          if (!spool) return;
          spools.push({
            filament: filamentById(spool.filamentId),
            position: t.spoolSpots[s].clone().applyMatrix4(places[k]),
            rotationY: p.rotY,
            interaction: rackSpoolInteraction(rack, s),
          });
        });
        // Vorderseite nach Osten/Westen: das Gestell ist in x STAND.d tief, in z STAND.w breit
        colliders.push({ minX: p.rackX - STAND.d / 2, maxX: p.rackX + STAND.d / 2, minZ: p.z - STAND.w / 2, maxZ: p.z + STAND.w / 2, level: LEVEL });
      });
      if (spools.length) {
        const batch = createSpoolBatch(spools);
        for (const mesh of batch.children) {
          const inner = mesh.userData.interaction;
          mesh.userData.interaction = { ...inner, hover: () => { if (heldBox()) hideAim(); }, unhover: hideAim };
        }
        group.add(batch);
      }
    }
    group.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
    return { colliders, tops };
  }

  // Schlüssel je Feld: was dort liegt – neu gebaut wird nur, wenn er sich ändert. Alle Felder in einem Durchgang.
  const ids = new WeakMap();
  let nextId = 1;
  const idOf = (o) => {
    if (!ids.has(o)) ids.set(o, nextId++);
    return ids.get(o);
  };
  function fieldKeys() {
    const keys = new Map();
    const at = (f) => {
      if (!keys.has(f)) keys.set(f, []);
      return keys.get(f);
    };
    for (const x of store.items) {
      const b = x.basement;
      if (!b || !Number.isInteger(b.place)) continue;
      if (x.location === 'basement') at(b.field).push(idOf(x), b.place, b.order);
      else if (x.location === 'basement-rack') at(b.field).push('r', idOf(x), b.place, ...x.spools.map((s) => s?.filamentId ?? 0));
    }
    return keys;
  }

  const colliderMap = new Map(); // Feld → Kollisionsboxen

  function sync() {
    const wanted = new Set(store.storageFields());
    let changed = false;
    // Felder, die kein Lager (mehr) sind, räumen
    for (const [i, h] of holders) {
      if (wanted.has(i)) continue;
      if (aim.frame.parent === h.group) hideAim();
      h.group.removeFromParent();
      holders.delete(i);
      colliderMap.delete(i);
      changed = true;
    }
    const keys = fieldKeys();
    let idx = null;
    for (const i of wanted) {
      let h = holders.get(i);
      if (!h) {
        const parent = fields.contentGroup(i);
        if (!parent) continue;
        const group = new THREE.Group();
        group.name = `basement-storage-${i}`;
        group.position.y = BASEMENT_FLOOR_Y;
        const contents = new THREE.Group();
        group.add(buildMarks(i), contents);
        parent.add(group);
        h = { group, contents, key: null, tops: new Map() };
        holders.set(i, h);
      }
      const key = (keys.get(i) ?? []).join(',');
      if (key === h.key) continue;
      h.key = key;
      idx ??= store.index();
      const built = buildContents(i, h.contents, idx);
      colliderMap.set(i, built.colliders);
      h.tops = built.tops;
      changed = true;
    }
    if (changed) collision.setDynamic('basement-storage', [...colliderMap.values()].flat());
  }

  economy.subscribe(sync);
  layout.subscribe(() => sync());
  return { sync, placeRect };
}
