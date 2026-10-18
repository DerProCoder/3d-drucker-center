// Druckertisch: Drucker aufstellen und Filament einlegen/herausnehmen.
import * as THREE from 'three';
import { filamentById, filamentLabel, templateById, speedById } from './catalog.js';
import { getPrintShape, outlinePoint, outlineLength } from './print-shapes.js';
import { createPrinterModel, printerSize } from './printer-model.js';
import { createSpool } from './spool.js';
import { enableShadows } from './util.js';

export const PRINTER_SLOTS_X = [-2.1, -0.7, 0.7, 2.1]; // Stellplätze auf dem Druckertisch (Welt-x)

export function createWorkshop({ table, tableHeight, economy, carry }) {
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
  const freeSlots = () => PRINTER_SLOTS_X
    .map((_, i) => i)
    .filter((i) => !economy.printers.some((p) => p.location === 'table' && p.slot === i));
  const nearestFreeSlot = (x) => freeSlots().reduce((best, i) => (
    best === null || Math.abs(PRINTER_SLOTS_X[i] - x) < Math.abs(PRINTER_SLOTS_X[best] - x) ? i : best
  ), null);

  table.userData.interaction = {
    hint: () => {
      if (!carriedPrinter()) return null;
      return freeSlots().length ? 'Linksklick: Drucker aufstellen' : 'Kein freier Platz auf dem Tisch';
    },
    hover: (hit) => {
      const printer = carriedPrinter();
      const slot = printer ? nearestFreeSlot(hit.point.x) : null;
      ghost.visible = slot !== null;
      if (slot === null) return;
      const size = printerSize(printer.model);
      ghost.scale.copy(size);
      ghost.position.set(PRINTER_SLOTS_X[slot], tableHeight + size.y / 2, 0);
    },
    unhover: () => { ghost.visible = false; },
    action: (hit) => {
      const printer = carriedPrinter();
      const slot = printer ? nearestFreeSlot(hit.point.x) : null;
      if (slot === null) return;
      carry.release();
      economy.placePrinter(printer.id, slot);
      ghost.visible = false;
    },
  };

  function printerInteraction(printer) {
    const name = printer.model.name;
    const supports = (f) => printer.model.materials.includes(f.material);
    return {
      hint: () => {
        const item = carry.item;
        const busy = economy.isBusy(printer);
        if (item?.kind === 'filament') {
          const f = filamentById(item.filamentId);
          if (busy) return `${name} druckt gerade – Spule erst danach wechseln`;
          if (!supports(f)) return `${name} kann kein ${f.material} drucken`;
          return printer.filament
            ? `Linksklick: ${filamentLabel(f)} einlegen (alte Spule nehmen)`
            : `Linksklick: ${filamentLabel(f)} einlegen`;
        }
        if (item) return null;
        if (busy) return `${name} druckt ${Math.floor(printer.job.progress * 100)} % – Steuerung am PC`;
        if (!printer.filament) return `${name} – kein Filament eingelegt`;
        if (printer.filamentGrams <= 0) return 'Linksklick: leere Spule entsorgen';
        return `Linksklick: ${filamentLabel(filamentById(printer.filament))} herausnehmen (${Math.round(printer.filamentGrams)} g)`;
      },
      action: () => {
        const item = carry.item;
        if (economy.isBusy(printer)) return;
        if (item?.kind === 'filament') {
          if (!supports(filamentById(item.filamentId))) return;
          carry.release();
          const previous = economy.loadFilament(printer.id, item.filamentId, item.grams);
          if (previous) carry.holdFilament(previous.filamentId, previous.grams);
        } else if (!item && printer.filament) {
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
    (rig.bedAxis ?? model).add(part);
    model.userData.partMesh = part;
  }

  function updateSpool(model, printer) {
    if (model.userData.loadedFilament === printer.filament) return;
    if (model.userData.spoolMesh) model.remove(model.userData.spoolMesh);
    model.userData.spoolMesh = null;
    model.userData.loadedFilament = printer.filament;
    if (!printer.filament) return;

    const spool = createSpool(filamentById(printer.filament));
    spool.position.copy(model.userData.spoolAnchor);
    if (model.userData.spoolAxis === 'z') spool.rotation.y = Math.PI / 2;
    enableShadows(spool);
    model.add(spool);
    model.userData.spoolMesh = spool;
  }

  function sync() {
    for (const printer of economy.printers) {
      let model = built.get(printer.id);
      if (printer.location === 'table') {
        if (!model) {
          model = createPrinterModel(printer.model);
          model.position.set(PRINTER_SLOTS_X[printer.slot], tableHeight, 0);
          model.userData.interaction = printerInteraction(printer);
          model.userData.printer = printer;
          enableShadows(model);
          group.add(model);
          built.set(printer.id, model);
        }
        updateSpool(model, printer);
        updatePart(model, printer);
      } else if (model) {
        group.remove(model);
        built.delete(printer.id);
      }
    }
  }

  const worldPos = new THREE.Vector3();

  // Jedes Bild: gedruckte Schichten freigeben und die Achsen bewegen wie beim echten Bettschubser:
  // Kopf links/rechts (X), Bett vor/zurück (Y), Portal hoch/runter (Z). Zusammen fährt die Düse
  // den Umriss der aktuellen Schicht ab.
  function animate(dt) {
    for (const model of built.values()) {
      const printer = model.userData.printer;
      const job = printer.job;
      const part = model.userData.partMesh;
      const rig = model.userData.printRig;

      let layerY = 0;
      if (part) {
        const { shape, clip } = part.userData;
        layerY = shape.height * job.progress;
        part.getWorldPosition(worldPos);
        clip.constant = job.status === 'done' ? 1e6 : worldPos.y + layerY + 0.0004;
      }
      if (!rig.zAxis) continue;

      let lift = 0;
      let nozzle = { x: 0, z: 0 };
      if (job && part) {
        const { shape } = part.userData;
        if (job.status === 'done') {
          lift = Math.max(0, shape.height - rig.nozzleGap + 0.02); // geparkt über dem fertigen Teil
        } else {
          lift = layerY - rig.nozzleGap + 0.0005; // Düse sitzt auf der aktuellen Schicht
          const outline = shape.outline(job.progress);
          if (job.status === 'printing') {
            // Bahngeschwindigkeit der Düse (sichtbar verlangsamt), abhängig von der Druckstufe
            const speed = 0.06 * (speedById(printer.speedId).percent / 100);
            part.userData.pathT = (part.userData.pathT + (dt * speed) / Math.max(outlineLength(outline), 0.01)) % 1;
          }
          nozzle = outlinePoint(outline, part.userData.pathT);
        }
      }
      rig.zAxis.position.y = lift;
      rig.head.position.x = rig.plateCenter.x + (job && job.status !== 'done' ? nozzle.x : rig.headX - rig.plateCenter.x);
      if (rig.bedAxis) rig.bedAxis.position.z = -nozzle.z; // Bett fährt entgegen, damit die Düse relativ zur Platte wandert
    }
  }

  return { group, sync, animate };
}
