// Drucktische: Drucker aufstellen und Filament einlegen/herausnehmen.
import * as THREE from 'three';
import { filamentById, filamentLabel, templateById, speedById } from './catalog.js';
import { getPrintShape, outlinePoint, outlineLength } from './print-shapes.js';
import { createPrinterModel, printerSize, updatePrinterTubes } from './printer-model.js';
import { createSpool } from './spool.js';
import { enableShadows } from './util.js';
import { SLOTS_PER_TABLE } from './upgrades.js';

export const PRINTER_SLOTS_X = [-2.1, -0.7, 0.7, 2.1]; // Stellplätze auf einem Drucktisch (Welt-x)
export const TABLE_ROWS_Z = [0, -2.6, -5.2, -7.8];      // Drucktische hintereinander (Welt-z), der erste vorne

// Weltposition eines Stellplatzes
export const slotX = (slot) => PRINTER_SLOTS_X[slot % SLOTS_PER_TABLE];
export const slotZ = (slot) => TABLE_ROWS_Z[Math.floor(slot / SLOTS_PER_TABLE)];

// tables: Drucktisch-Objekte in der Reihenfolge von TABLE_ROWS_Z · usableSlots: () => Anzahl gekaufter Stellplätze
export function createWorkshop({ tables, tableHeight, economy, carry, usableSlots }) {
  const group = new THREE.Group();
  const built = new Map(); // Drucker-ID → 3D-Modell

  // Grüne Vorschau, wo der getragene Drucker landen würde
  const ghost = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0x3ad16b, transparent: true, opacity: 0.25, depthWrite: false })
  );
  ghost.visible = false;
  ghost.raycast = () => {}; // darf den Klickstrahl nicht abfangen
  group.add(ghost);

  const carriedPrinter = () => (carry.item?.kind === 'printer' ? economy.printerById(carry.item.printerId) : null);
  const freeSlots = (tableIndex) => PRINTER_SLOTS_X
    .map((_, i) => tableIndex * SLOTS_PER_TABLE + i)
    .filter((slot) => slot < usableSlots())
    .filter((slot) => !economy.printers.some((p) => p.location === 'table' && p.slot === slot));
  const nearestFreeSlot = (tableIndex, x) => freeSlots(tableIndex).reduce((best, slot) => (
    best === null || Math.abs(slotX(slot) - x) < Math.abs(slotX(best) - x) ? slot : best
  ), null);

  tables.forEach((table, tableIndex) => { table.userData.interaction = {
    hint: () => {
      if (!carriedPrinter()) return null;
      return freeSlots(tableIndex).length ? 'Linksklick: Drucker aufstellen' : 'Kein freier Platz auf diesem Tisch';
    },
    hover: (hit) => {
      const printer = carriedPrinter();
      const slot = printer ? nearestFreeSlot(tableIndex, hit.point.x) : null;
      ghost.visible = slot !== null;
      if (slot === null) return;
      const size = printerSize(printer.model);
      ghost.scale.copy(size);
      ghost.position.set(slotX(slot), tableHeight + size.y / 2, slotZ(slot));
    },
    unhover: () => { ghost.visible = false; },
    action: (hit) => {
      const printer = carriedPrinter();
      const slot = printer ? nearestFreeSlot(tableIndex, hit.point.x) : null;
      if (slot === null) return;
      carry.takeTop();
      economy.placePrinter(printer.id, slot);
      ghost.visible = false;
    },
  }; });

  function printerInteraction(printer) {
    const name = printer.model.name;
    const supports = (f) => printer.model.materials.includes(f.material);
    return {
      hint: () => {
        const item = carry.item;
        const busy = economy.isBusy(printer);
        const ams = printer.spools.length > 1;
        if (item?.kind === 'filament') {
          const f = filamentById(item.filamentId);
          if (busy) return `${name} druckt gerade – Spulen erst danach wechseln`;
          if (!supports(f)) return `${name} kann kein ${f.material} drucken`;
          const slot = economy.loadTarget(printer);
          if (slot === -1) {
            const out = economy.unloadTarget(printer);
            const outSpool = printer.spools[out];
            return carry.canTakeSpool && outSpool
              ? `AMS ist voll – Linksklick: ${filamentLabel(filamentById(outSpool.filamentId))} aus Fach ${out + 1} herausnehmen`
              : 'AMS ist voll und deine Hände auch';
          }
          if (ams) return `Linksklick: ${filamentLabel(f)} in AMS-Fach ${slot + 1} einlegen`;
          return printer.spools[0]
            ? `Linksklick: ${filamentLabel(f)} einlegen (alte Spule nehmen)`
            : `Linksklick: ${filamentLabel(f)} einlegen`;
        }
        if (item?.kind === 'printer') return null;
        if (busy) return `${name} druckt ${Math.floor(printer.job.progress * 100)} % – Steuerung am PC`;
        const slot = economy.unloadTarget(printer);
        if (slot === -1) return `${name} – kein Filament eingelegt`;
        const spool = printer.spools[slot];
        if (spool.grams <= 0) return 'Linksklick: leere Spule entsorgen';
        const where = ams ? ` aus AMS-Fach ${slot + 1}` : '';
        return `Linksklick: ${filamentLabel(filamentById(spool.filamentId))}${where} herausnehmen (${Math.round(spool.grams)} g)`;
      },
      action: () => {
        const item = carry.item;
        if (economy.isBusy(printer)) return;
        // Mit Spulen in der Hand: oberste einlegen. Ist das AMS voll, wird stattdessen eine herausgenommen.
        if (item?.kind === 'filament' && economy.loadTarget(printer) !== -1) {
          if (!supports(filamentById(item.filamentId))) return;
          carry.takeTop();
          const previous = economy.loadFilament(printer.id, item.filamentId, item.grams);
          if (previous) carry.holdFilament(previous.filamentId, previous.grams);
        } else if (item?.kind !== 'printer' && carry.canTakeSpool && economy.unloadTarget(printer) !== -1) {
          const spool = economy.unloadFilament(printer.id);
          if (spool) carry.holdFilament(spool.filamentId, spool.grams);
        }
      },
    };
  }

  // Gedrucktes Teil auf der Platte. Es ist von Anfang an vollständig modelliert, eine Schnittebene
  // gibt aber nur die bereits gedruckten Schichten frei. Das Teil liegt auf dem Druckbett und fährt mit ihm.
  function updatePart(model, printer) {
    const job = printer.job;
    const key = job ? `${job.templateId}|${job.filamentId}` : null;
    if (model.userData.partKey === key) return;
    const old = model.userData.partMesh;
    if (old) old.parent.remove(old);
    model.userData.partMesh = null;
    model.userData.partKey = key;
    if (!job) return;

    const shape = getPrintShape(templateById(job.templateId));
    const filament = filamentById(job.filamentId);
    const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    const part = new THREE.Mesh(shape.geometry, new THREE.MeshStandardMaterial({
      color: filament.hex,
      roughness: 0.45,
      side: THREE.DoubleSide, // an der Schnittkante sieht man ins Innere
      clippingPlanes: [clip],
      transparent: filament.color === 'Transparent',
      opacity: filament.color === 'Transparent' ? 0.75 : 1,
    }));
    const rig = model.userData.printRig;
    part.position.copy(rig.plateCenter);
    part.castShadow = true;
    part.userData = { shape, clip, pathT: 0 };
    rig.partParent.add(part);
    model.userData.partMesh = part;
  }

  // Eingelegte Spulen am Spulenhalter bzw. in den AMS-Fächern anzeigen
  function updateSpools(model, printer) {
    const meshes = (model.userData.spoolMeshes ??= []);
    printer.spools.forEach((spool, i) => {
      const filamentId = spool?.filamentId ?? null;
      if (meshes[i]?.userData.filament.id === filamentId) return;
      if (meshes[i]) model.remove(meshes[i]);
      meshes[i] = null;
      if (!filamentId) return;

      const { position, axis } = model.userData.spoolSlots[i];
      const mesh = createSpool(filamentById(filamentId));
      mesh.position.copy(position);
      if (axis === 'z') mesh.rotation.y = Math.PI / 2;
      enableShadows(mesh);
      model.add(mesh);
      meshes[i] = mesh;
    });
  }

  function sync() {
    for (const printer of economy.printers) {
      let model = built.get(printer.id);
      if (printer.location === 'table') {
        if (!model) {
          model = createPrinterModel(printer.model);
          model.position.set(slotX(printer.slot), tableHeight, slotZ(printer.slot));
          model.userData.interaction = printerInteraction(printer);
          model.userData.printer = printer;
          enableShadows(model);
          group.add(model);
          built.set(printer.id, model);
        }
        updateSpools(model, printer);
        updatePart(model, printer);
      } else if (model) {
        group.remove(model);
        built.delete(printer.id);
      }
    }
  }

  const worldPos = new THREE.Vector3();

  // Jedes Bild: Düse den Umriss der aktuellen Schicht abfahren lassen. Welche Achse sich dafür bewegt,
  // entscheidet das Druckermodell (rig.pose): beim A1 Kopf + Bett vor/zurück + Portal hoch,
  // bei P1/P2 Kopf vor/zurück/seitlich + Bett runter. Danach die gedruckten Schichten freigeben.
  function animate(dt) {
    for (const model of built.values()) {
      const printer = model.userData.printer;
      const job = printer.job;
      const part = model.userData.partMesh;
      const rig = model.userData.printRig;

      const state = { mode: 'idle', x: 0, z: 0, layerY: 0, partHeight: 0 };
      if (job && part) {
        const { shape } = part.userData;
        state.partHeight = shape.height;
        state.layerY = shape.height * job.progress;
        if (job.status === 'done') {
          state.mode = 'done';
        } else {
          state.mode = 'printing'; // auch pausiert: Achsen bleiben an der Stelle stehen
          const outline = shape.outline(job.progress);
          if (job.status === 'printing') {
            // Bahngeschwindigkeit der Düse (sichtbar verlangsamt), abhängig von der Druckstufe
            const speed = 0.06 * (speedById(printer.speedId).percent / 100);
            part.userData.pathT = (part.userData.pathT + (dt * speed) / Math.max(outlineLength(outline), 0.01)) % 1;
          }
          Object.assign(state, outlinePoint(outline, part.userData.pathT));
        }
      }
      rig.pose(state);

      if (part) {
        // Schnittebene erst nach dem Bewegen setzen, weil das Teil mit dem Bett mitfährt
        part.getWorldPosition(worldPos);
        part.userData.clip.constant = job.status === 'done' ? 1e6 : worldPos.y + state.layerY + 0.0004;
      }
      updatePrinterTubes(model); // Schlauch und Kabel biegen sich mit, ihr Anfang bleibt am Gerät
    }
  }

  // 3D-Modell eines aufgestellten Druckers (z. B. für die Drucker-Cam) oder undefined
  const modelOf = (printerId) => built.get(printerId);

  return { group, sync, animate, modelOf };
}
