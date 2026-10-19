// Druckertisch: Drucker und Regale aufstellen, Filament einlegen/herausnehmen, fertige Teile entnehmen, Pannen
// beheben (Fehldruck wegräumen, Düse freistechen oder tauschen). Filament-Regal und Ersatzteilregal belegen je
// einen eigenen Platz zwischen zwei Druckern. Dazu Statussymbole über den Druckern und vom Kater heruntergeworfene Teile auf dem Boden.
import * as THREE from 'three';
import { FAILURES, filamentById, filamentColorName, filamentLabel, ledColorById, templateById, speedById, woodById } from '../core/catalog.js';
import { NOZZLE_POKES, WASTE_BIN_GRAMS, WASTE_EMPTY_AT, plateLayout, spoolLabel } from '../core/economy.js';
import { colorCount, partColors, waitingFilament } from '../core/two-color.js';
import { getPrintShape, nearestPathT, outlinePoint, outlineLength, plateOutline } from '../models/print-shapes.js';
import { createPrinterModel, printerSize, updatePrinterTubes } from '../models/printer-model.js';
import { animateNozzles } from '../models/printer-parts.js';
import { createSpool, finishProps } from '../models/spool.js';
import { createFurnitureModel, createNozzle, furnitureSize } from '../models/furniture.js';
import { enableShadows } from './util.js';
import { isChangingTool, updateToolChanger } from './tool-changer.js';
import { isPurging, updatePurge } from './purge.js';
import { animateLaser, syncLaserWorkpiece } from './laser.js';
import { isLaser, laserJobLabel } from '../core/laser.js';
import { RACKS_PER_TABLE, SLOTS_PER_TABLE } from '../core/upgrades.js';

export const PRINTER_SLOTS_X = [-2.1, -0.7, 0.7, 2.1]; // Stellplätze auf einem Drucktisch (Welt-x)
export const RACK_SLOTS_X = [-1.4, 0, 1.4];            // Regalplätze in den Lücken zwischen den Druckern
export const TABLE_ROWS_Z = [0, -2.6, -5.2, -7.8];      // Drucktische hintereinander (Welt-z), der erste vorne
const TRAVEL_FACTOR = 3;     // Leerfahrten zur nächsten Kontur gehen so viel schneller als das Drucken
const MAX_HEAD_SPEED = 0.4;  // m/s – mehr gilt als Sprung (z. B. neue Schicht), nicht als Bewegung

// Weltposition eines Drucker- bzw. Regalplatzes. Plätze sind über alle Tische durchnummeriert.
export const slotX = (slot) => PRINTER_SLOTS_X[slot % SLOTS_PER_TABLE];
export const slotZ = (slot) => TABLE_ROWS_Z[Math.floor(slot / SLOTS_PER_TABLE)];
export const rackX = (slot) => RACK_SLOTS_X[slot % RACKS_PER_TABLE];
export const rackZ = (slot) => TABLE_ROWS_Z[Math.floor(slot / RACKS_PER_TABLE)];

// ---------- Hilfsmodelle ----------

function partMaterial(filament, clip = null) {
  return new THREE.MeshStandardMaterial({
    color: filament.hex,
    ...finishProps(filament, 0.45), // matt, Seidenglanz, leuchtend oder durchscheinend je nach Sorte
    side: THREE.DoubleSide, // an der Schnittkante sieht man ins Innere
    clippingPlanes: clip ? [clip] : [],
  });
}

// Material(ien) für ein gedrucktes Teil: zwei- und mehrfarbige Formen haben eine Geometrie-Gruppe pro Farbe.
// colors: alle Farben [Grundfarbe, …] (siehe partColors)
function partMaterials(template, colors, clip = null) {
  if (colorCount(template) < 2 || colors.length < 2) return partMaterial(filamentById(colors[0]), clip);
  return colors.map((id) => partMaterial(filamentById(id), clip));
}

// „PLA Schwarz“, zweifarbig „PLA Schwarz + Matte Weiß“, mehrfarbig „PLA in 8 Farben“
function colorsLabel(colors) {
  const label = filamentLabel(filamentById(colors[0]));
  if (colors.length > 2) return `${filamentById(colors[0]).material} in ${colors.length} Farben`;
  return colors.length === 2 ? `${label} + ${filamentColorName(filamentById(colors[1]))}` : label;
}

// Filament-Spaghetti: wirre Schlaufen über dem Druckbett, Ursprung auf der Plattenmitte
function createSpaghetti(filament, height, spread) {
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

// Schwebendes Symbol über dem Drucker (Textur wird pro Symbol einmal gezeichnet)
const badgeTextures = new Map();
function badgeTexture(symbol, color) {
  const key = `${symbol}|${color}`;
  if (!badgeTextures.has(key)) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(64, 64, 56, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
    ctx.font = '64px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, 64, 70);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    badgeTextures.set(key, texture);
  }
  return badgeTextures.get(key);
}

// Was über dem Drucker angezeigt wird, oder null
function badgeFor(printer) {
  const job = printer.job;
  if (job?.status === 'failed') return ['⚠️', '#c0392b'];
  if (printer.clogged) return ['🪡', '#c0392b'];
  if ((printer.nozzleWear ?? 0) >= 1) return ['🔧', '#c0392b'];
  if (job?.pauseReason === 'filament') return ['🧵', '#d68910'];
  if (job?.pauseReason === 'waste') return ['🗑️', '#d68910'];
  if (job?.status === 'done') return ['✔', '#27ae60'];
  return null;
}

// tables: Drucktisch-Objekte in der Reihenfolge von TABLE_ROWS_Z (hall.js) · upgrades: wie viele Tische gekauft sind
export function createWorkshop({ tables, tableHeight, economy, carry, upgrades }) {
  const group = new THREE.Group();
  const built = new Map(); // Drucker-ID → 3D-Modell
  const racks = new Map(); // Regal-ID → 3D-Modell
  const loose = new Map(); // ID loses Teil → Mesh auf dem Boden

  // Grüne Vorschau, wo der getragene Drucker landen würde
  const ghost = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0x3ad16b, transparent: true, opacity: 0.25, depthWrite: false })
  );
  ghost.visible = false;
  ghost.raycast = () => {}; // darf den Klickstrahl nicht abfangen
  group.add(ghost);

  // Was gerade aufgestellt werden kann: Druckerkarton (auf Druckerplätze) oder Regalkarton (zwischen die Drucker)
  const carriedBox = () => {
    if (carry.printer) {
      return {
        name: 'Drucker', size: printerSize(carry.printer.model), perTable: SLOTS_PER_TABLE, x: slotX, z: slotZ,
        used: (i) => economy.tableSlotUsed(i),
      };
    }
    if (carry.furniture) {
      return {
        name: carry.furniture.type.name, size: furnitureSize(carry.furniture.type), perTable: RACKS_PER_TABLE, x: rackX, z: rackZ,
        used: (i) => economy.rackSlotUsed(i),
      };
    }
    return null;
  };
  // Freie Plätze auf einem bestimmten Tisch (nur gekaufte Tische haben Plätze)
  const freeSlots = (box, tableIndex) => {
    if (tableIndex >= upgrades.tables) return [];
    return Array.from({ length: box.perTable }, (_, i) => tableIndex * box.perTable + i).filter((i) => !box.used(i));
  };
  const nearestFreeSlot = (box, tableIndex, x) => freeSlots(box, tableIndex).reduce((best, i) => (
    best === null || Math.abs(box.x(i) - x) < Math.abs(box.x(best) - x) ? i : best
  ), null);

  tables.forEach((table, tableIndex) => {
    table.userData.interaction = {
      hint: () => {
        const box = carriedBox();
        if (!box) return null;
        if (!freeSlots(box, tableIndex).length) {
          return carry.furniture ? 'Kein freier Platz zwischen den Druckern auf diesem Tisch' : 'Kein freier Platz auf diesem Tisch';
        }
        return `Linksklick: ${box.name} ${carry.furniture ? 'zwischen die Drucker stellen' : 'aufstellen'}`;
      },
      hover: (hit) => {
        const box = carriedBox();
        const slot = box ? nearestFreeSlot(box, tableIndex, hit.point.x) : null;
        ghost.visible = slot !== null;
        if (slot === null) return;
        ghost.scale.copy(box.size);
        ghost.position.set(box.x(slot), tableHeight + box.size.y / 2, box.z(slot));
      },
      unhover: () => { ghost.visible = false; },
      action: (hit) => {
        const box = carriedBox();
        const slot = box ? nearestFreeSlot(box, tableIndex, hit.point.x) : null;
        if (slot === null) return;
        if (carry.printer) economy.placePrinter(carry.releasePrinter().id, slot);
        else economy.placeFurniture(carry.releaseFurniture().id, slot);
        ghost.visible = false;
      },
    };
  });

  // Was ein Linksklick auf den Drucker gerade bewirkt: { text, run } oder null.
  // Reihenfolge: Pannen beheben, fertiges Teil entnehmen, dann erst Spulen.
  function printerAction(printer) {
    const name = printer.model.name;
    const job = printer.job;
    const supports = (spool) => printer.model.materials.includes(filamentById(spool.filamentId).material);

    if (carry.printer || carry.furniture) return null;
    if (isLaser(printer)) return laserAction(printer);
    if (job?.status === 'failed') {
      const failure = FAILURES[job.failure];
      return { text: `Linksklick: Fehldruck wegräumen (${failure.name})`, run: () => economy.clearFailedPrint(printer.id) };
    }
    // Ersatzdüse in der Hand: tauschen (behebt auch eine verstopfte Düse)
    if (carry.nozzle) {
      if (economy.isBusy(printer)) return { text: `${name} druckt gerade – Düse erst danach tauschen` };
      const wear = Math.round((printer.nozzleWear ?? 0) * 100);
      return {
        text: `Linksklick: Ersatzdüse einbauen (alte Düse ${wear} % abgenutzt${printer.clogged ? ', verstopft' : ''})`,
        run: () => { if (economy.replaceNozzle(printer.id)) carry.releaseNozzle(); },
      };
    }
    // Mülleimer hinten am Drucker: ab WASTE_EMPTY_AT kann man ihn leeren, ist er voll, wartet der Druck darauf
    if ((printer.waste ?? 0) >= WASTE_EMPTY_AT && !carry.hasSpools) {
      const grams = Math.min(WASTE_BIN_GRAMS, Math.round(printer.waste));
      const full = job?.pauseReason === 'waste' ? ' – Druck wartet' : '';
      return { text: `Linksklick: Mülleimer leeren (${grams} / ${WASTE_BIN_GRAMS} g${full})`, run: () => economy.emptyWasteBin(printer.id) };
    }
    if (printer.clogged) {
      return {
        text: `Linksklick: Düse freistechen (${printer.nozzlePokes}/${NOZZLE_POKES})`,
        run: () => economy.pokeNozzle(printer.id),
      };
    }
    if (job?.status === 'done') {
      const count = job.count ?? 1;
      const part = `${count > 1 ? `${count} × ` : ''}${templateById(job.templateId).name}, ${colorsLabel(partColors(job))}`;
      const what = count > 1 ? 'fertige Teile' : 'fertiges Teil';
      return { text: `Linksklick: ${what} entnehmen (${part})`, run: () => economy.collectPart(printer.id) };
    }

    const canChange = economy.canChangeSpools(printer);
    const ams = printer.spools.length > 1;
    // Mit Spulen in der Hand: einlegen. Ist das AMS voll und noch Platz in der Hand, lieber herausnehmen.
    if (carry.hasSpools && !(ams && economy.loadTarget(printer) === -1 && carry.canTakeSpool && canChange)) {
      if (!canChange) return { text: `${name} druckt gerade – Spulen erst danach wechseln` };
      // Wartet der Drucker auf Filament, wird automatisch die passende Spule aus der Hand genommen
      let index = carry.selected;
      if (job?.pauseReason === 'filament') {
        const missing = waitingFilament(job);
        index = carry.spools.findIndex((s) => s.filamentId === missing);
        if (index === -1) return { text: `Zum Weiterdrucken braucht ${name} ${filamentLabel(filamentById(missing))}` };
      }
      const spool = carry.spools[index];
      if (!supports(spool)) return { text: `${name} kann kein ${filamentById(spool.filamentId).material} drucken` };
      const slot = economy.loadTarget(printer);
      if (slot === -1) return { text: 'AMS ist voll – erst eine Spule herausnehmen' };
      const where = ams ? ` in AMS-Fach ${slot + 1}` : '';
      const swap = !ams && printer.spools[0] ? ' (alte Spule nehmen)' : '';
      return {
        text: `Linksklick: ${spoolLabel(spool)}${where} einlegen${swap}`,
        run: () => {
          const taken = carry.takeSpool(index);
          const previous = economy.loadFilament(printer.id, taken);
          if (previous && !carry.addSpool(previous)) economy.returnFilamentToStorage(previous);
        },
      };
    }

    if (!canChange) return { text: `${name} druckt ${Math.floor(job.progress * 100)} % – Steuerung am PC` };
    const slot = economy.unloadTarget(printer);
    if (slot === -1) return { text: `${name} – kein Filament eingelegt` };
    const spool = printer.spools[slot];
    if (spool.grams <= 0) return { text: 'Linksklick: leere Spule entsorgen', run: () => economy.unloadFilament(printer.id) };
    const where = ams ? ` aus AMS-Fach ${slot + 1}` : '';
    if (!carry.canTakeSpool) return { text: 'Hände voll – erst Spulen ablegen (Q)' };
    return {
      text: `Linksklick: ${spoolLabel(spool)}${where} herausnehmen`,
      run: () => {
        const taken = economy.unloadFilament(printer.id);
        if (taken) carry.addSpool(taken);
      },
    };
  }

  // Laser R1: fertige Teile entnehmen, Holzplatte einlegen (gegen die eingelegte tauschen) oder herausnehmen
  function laserAction(printer) {
    const name = printer.model.name;
    const job = printer.job;
    if (job?.status === 'done') {
      const what = job.pieces > 1 ? `${job.pieces} fertige Teile` : 'fertiges Teil';
      return { text: `Linksklick: ${what} entnehmen (${laserJobLabel(job)})`, run: () => economy.collectPart(printer.id) };
    }
    if (economy.isBusy(printer)) return { text: `${name} lasert ${Math.floor(job.progress * 100)} % – Steuerung am PC` };
    if (carry.nozzle || carry.hasSpools) return { text: `${name} ist ein Laser – er braucht Holzplatten, keine Spulen oder Düsen` };
    if (carry.sheet) {
      const wood = woodById(carry.sheet.woodId);
      const swap = printer.sheet ? ` (${woodById(printer.sheet.woodId).name} nehmen)` : '';
      return {
        text: `Linksklick: ${wood.name} einlegen${swap}`,
        run: () => {
          const previous = economy.insertSheet(printer.id, carry.releaseSheet());
          if (previous) carry.holdSheet(previous);
        },
      };
    }
    if (printer.sheet) {
      return {
        text: `Linksklick: ${woodById(printer.sheet.woodId).name} herausnehmen · lasern am PC im Druckermenü`,
        run: () => {
          const sheet = economy.removeSheet(printer.id);
          if (sheet) carry.holdSheet(sheet);
        },
      };
    }
    return { text: `${name} – Holzplatte aus dem Abstellraum holen und einlegen` };
  }

  function printerInteraction(printer) {
    return {
      hint: () => {
        const text = printerAction(printer)?.text ?? null;
        if (!carry.isEmpty || !economy.canLift(printer)) return text;
        return text ? `${text} · E: hochheben` : `${printer.model.name} · E: hochheben`;
      },
      action: () => printerAction(printer)?.run?.(),
    };
  }

  // Gedruckte Teile auf der Platte (bei Mehrfachdruck im Raster). Sie sind von Anfang an vollständig modelliert,
  // eine gemeinsame Schnittebene gibt aber nur die bereits gedruckten Schichten frei. Die Teile liegen auf dem
  // Druckbett und fahren mit ihm. Bei Fehldrucken kommt die passende Sauerei dazu.
  function updatePart(model, printer) {
    const job = printer.job;
    const count = job?.count ?? 1;
    const key = job ? `${job.templateId}|${partColors(job).join('+')}|${count}|${job.status === 'failed' ? job.failure : ''}` : null;
    if (model.userData.partKey === key) return;
    for (const old of [model.userData.partMesh, model.userData.mess]) old?.parent.remove(old);
    model.userData.partMesh = null;
    model.userData.mess = null;
    model.userData.partKey = key;
    if (!job) return;

    const template = templateById(job.templateId);
    const shape = getPrintShape(template);
    const filament = filamentById(job.filamentId);
    const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    const material = partMaterials(template, partColors(job), clip);
    const rig = model.userData.printRig;
    const part = new THREE.Group();
    part.position.copy(rig.plateCenter);
    const layout = plateLayout(template, printer.model.build, count);
    let hx = 0;
    let hz = 0;
    for (const pos of layout.positions) {
      const mesh = new THREE.Mesh(shape.geometry, material);
      mesh.position.set(pos.x * 0.001, 0, pos.y * 0.001);
      if (layout.rotated) mesh.rotation.y = Math.PI / 2;
      mesh.castShadow = true;
      part.add(mesh);
      hx = Math.max(hx, Math.abs(pos.x) * 0.001);
      hz = Math.max(hz, Math.abs(pos.y) * 0.001);
    }
    // Die Düse fährt in jeder Schicht die echten Umrisse aller Teile nacheinander ab
    const w = (layout.rotated ? template.size.y : template.size.x) * 0.0005;
    const d = (layout.rotated ? template.size.x : template.size.y) * 0.0005;
    const offsets = layout.positions.map((pos) => ({ x: pos.x * 0.001, z: pos.y * 0.001 }));
    const outline = plateOutline(shape, offsets, layout.rotated);
    part.userData = { shape, clip, pathT: 0, outline, spread: Math.max(hx + w, hz + d) };
    rig.partParent.add(part);
    model.userData.partMesh = part;

    if (job.status !== 'failed') return;
    const printed = shape.height * job.progress;
    if (job.failure === 'spaghetti') {
      const mess = createSpaghetti(filament, Math.max(0.015, printed * 0.6), Math.max(0.07, part.userData.spread));
      mess.position.copy(rig.plateCenter);
      rig.partParent.add(mess);
      model.userData.mess = mess;
    } else if (job.failure === 'detached') {
      // Teil liegt umgekippt neben seiner Stelle
      part.rotation.z = Math.PI / 2 * 0.92;
      part.position.x += Math.min(0.05, printed * 0.4);
    } else if (job.failure === 'warp') {
      part.rotation.x = 0.06; // eine Ecke hat sich hochgebogen
      part.position.y += 0.003;
    }
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

  function updateBadge(model, printer) {
    const badge = badgeFor(printer);
    const key = badge?.join('|') ?? null;
    if (model.userData.badgeKey === key) return;
    model.userData.badgeKey = key;
    if (model.userData.badge) model.remove(model.userData.badge);
    model.userData.badge = null;
    if (!badge) return;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture(...badge), depthTest: false }));
    sprite.scale.set(0.12, 0.12, 1);
    sprite.position.y = printerSize(printer.model).y + 0.14;
    sprite.raycast = () => {};
    sprite.renderOrder = 10;
    model.add(sprite);
    model.userData.badge = sprite;
  }

  // Teile, die der Kater vom Tisch geworfen hat
  function syncLooseParts() {
    const ids = new Set(economy.looseParts.map((l) => l.id));
    for (const [id, mesh] of loose) {
      if (ids.has(id)) continue;
      group.remove(mesh);
      loose.delete(id);
    }
    for (const part of economy.looseParts) {
      if (loose.has(part.id)) continue;
      const template = templateById(part.templateId);
      const colors = colorsLabel(partColors(part));
      const mesh = new THREE.Mesh(getPrintShape(template).geometry, partMaterials(template, partColors(part)));
      mesh.position.set(part.x, 0, part.z);
      mesh.rotation.y = part.rotY;
      mesh.castShadow = true;
      mesh.userData.interaction = {
        hint: () => `Linksklick: ${template.name} (${colors}) aufheben – der Kater war’s`,
        action: () => economy.pickUpLoosePart(part.id),
      };
      group.add(mesh);
      loose.set(part.id, mesh);
    }
  }

  // ---------- Regale ----------

  // Filament-Regal: Spulen hineinlegen (alle, die passen), einzelne Spulen herausnehmen, leer wieder aufheben
  function filamentRackInteraction(rack) {
    const free = () => rack.spools.filter((s) => !s).length;
    return {
      hint: () => {
        if (carry.printer || carry.furniture || carry.nozzle) return null;
        if (carry.hasSpools) {
          if (!free()) return 'Filament-Regal ist voll';
          const n = Math.min(free(), carry.spools.length);
          return `Linksklick: ${n === 1 ? 'Spule' : `${n} Spulen`} ins Filament-Regal legen (${free()} frei)`;
        }
        if (economy.isFurnitureEmpty(rack)) return 'Linksklick: leeres Filament-Regal aufheben';
        return `Filament-Regal: ${rack.type.capacity - free()}/${rack.type.capacity} Spulen – auf eine Spule zielen, um sie zu nehmen`;
      },
      action: () => {
        if (carry.hasSpools) {
          while (carry.spools.length && free()) economy.putSpoolInRack(rack.id, carry.takeSpool(carry.spools.length - 1));
        } else if (carry.isEmpty && economy.pickUpFurniture(rack.id)) {
          carry.holdFurniture(rack);
        }
      },
    };
  }

  function rackSpoolInteraction(rack, index) {
    const rackInteraction = filamentRackInteraction(rack);
    return {
      hint: () => {
        if (carry.hasSpools && carry.canTakeSpool) {
          const spool = rack.spools[index];
          return `Linksklick: ${spoolLabel(spool)} nehmen (${carry.spools.length + 1}/5 in der Hand)`;
        }
        if (carry.hasSpools) return rackInteraction.hint();
        if (!carry.canTakeSpool) return null;
        return `Linksklick: ${spoolLabel(rack.spools[index])} nehmen`;
      },
      action: () => {
        if (!carry.canTakeSpool) {
          rackInteraction.action();
          return;
        }
        const spool = economy.takeSpoolFromRack(rack.id, index);
        if (spool) carry.addSpool(spool);
      },
    };
  }

  // Ersatzteilregal: Düse nehmen, zurücklegen, leer wieder aufheben
  function partsRackInteraction(rack) {
    return {
      hint: () => {
        if (carry.printer || carry.furniture) return null;
        if (carry.nozzle) return rack.nozzles < rack.type.capacity ? 'Linksklick: Ersatzdüse zurücklegen' : 'Ersatzteilregal ist voll';
        if (carry.hasSpools) return 'Hände voll – erst die Spulen ablegen';
        if (rack.nozzles) return `Linksklick: Ersatzdüse nehmen (${rack.nozzles} im Regal)`;
        return 'Linksklick: leeres Ersatzteilregal aufheben · Ersatzdüsen gibt es im Filament-Shop';
      },
      action: () => {
        if (carry.nozzle) {
          if (economy.putNozzleInRack(rack.id)) carry.releaseNozzle();
        } else if (carry.isEmpty && rack.nozzles) {
          if (economy.takeNozzleFromRack(rack.id)) carry.holdNozzle();
        } else if (carry.isEmpty && economy.pickUpFurniture(rack.id)) {
          carry.holdFurniture(rack);
        }
      },
    };
  }

  // Inhalt eines Regals neu aufbauen, wenn er sich geändert hat
  function updateRackContents(model, rack) {
    const key = rack.spools ? rack.spools.map((s) => s?.filamentId ?? '-').join(',') : String(rack.nozzles);
    if (model.userData.contentKey === key) return;
    model.userData.contentKey = key;
    model.userData.contents?.removeFromParent();
    const contents = new THREE.Group();
    if (rack.spools) {
      rack.spools.forEach((spool, i) => {
        if (!spool) return;
        const mesh = createSpool(filamentById(spool.filamentId));
        mesh.position.copy(model.userData.spoolSpots[i]);
        mesh.userData.interaction = rackSpoolInteraction(rack, i);
        contents.add(mesh);
      });
    } else {
      for (let i = 0; i < rack.nozzles; i++) {
        const nozzle = createNozzle(1.6);
        nozzle.position.copy(model.userData.nozzleSpots[i]);
        contents.add(nozzle);
      }
    }
    enableShadows(contents);
    model.add(contents);
    model.userData.contents = contents;
  }

  function syncRacks() {
    for (const rack of economy.furniture) {
      let model = racks.get(rack.id);
      if (rack.location === 'table') {
        if (!model) {
          model = createFurnitureModel(rack.type);
          model.position.set(rackX(rack.slot), tableHeight, rackZ(rack.slot));
          model.userData.interaction = rack.spools ? filamentRackInteraction(rack) : partsRackInteraction(rack);
          group.add(model);
          racks.set(rack.id, model);
        }
        updateRackContents(model, rack);
      } else if (model) {
        group.remove(model);
        racks.delete(rack.id);
      }
    }
  }

  function sync() {
    syncRacks();
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
        if (isLaser(printer)) syncLaserWorkpiece(model, printer);
        else updatePart(model, printer);
        updateBadge(model, printer);
      } else if (model) {
        group.remove(model);
        built.delete(printer.id);
      }
    }
    syncLooseParts();
  }

  const worldPos = new THREE.Vector3();
  let time = 0;

  // Jedes Bild: Düse den Umriss der aktuellen Schicht abfahren lassen. Welche Achse sich dafür bewegt,
  // entscheidet das Druckermodell (rig.pose): beim A1 Kopf + Bett vor/zurück + Portal hoch,
  // bei P1/P2 Kopf vor/zurück/seitlich + Bett runter. Danach die gedruckten Schichten freigeben.
  function animate(dt) {
    time += dt;
    for (const model of built.values()) {
      const printer = model.userData.printer;
      const job = printer.job;
      const part = model.userData.partMesh;
      const rig = model.userData.printRig;

      // Laser R1: eigener Ablauf (world/laser.js) statt Düse, Schichten und Farbwechsel
      if (isLaser(printer)) {
        measureHeadSpeed(model, animateLaser(model, printer), dt);
        bobBadge(model, printer);
        continue;
      }

      // Lüfter am Druckkopf: drehen beim Drucken hoch (schneller bei höherer Stufe), danach laufen sie aus
      const fanTarget = job?.status === 'printing' ? 40 * (speedById(printer.speedId).percent / 100) : 0;
      for (const rotor of rig.head.userData.fans ?? []) {
        rotor.userData.speed = THREE.MathUtils.damp(rotor.userData.speed ?? 0, fanTarget, 1.5, dt);
        rotor.rotation.z += rotor.userData.speed * dt;
      }

      // Dual-Nozzle: die linke Düse druckt die Grundfarbe, die rechte die zweite Farbe. Ist eine verstopft,
      // druckt die rechte alles. Während des Wechsels fährt eine Düse ein, die andere aus – die Bahn wartet so lange.
      const color = job?.status === 'printing' || job?.status === 'paused' ? part?.userData.lastPoint?.color ?? 0 : 0;
      // Düsenwechsler (H2C) und Spülen beim Farbwechsel (eine Düse mit AMS): solange der Kopf zum Wechsler bzw.
      // Trichter und zurück fährt, wartet die Bahn ebenfalls
      const swapping = animateNozzles(rig.head, printer.clogged ? 1 : color, dt) || isChangingTool(model) || isPurging(model);

      // LED-Leiste (H2C) in der im Druckermenü gewählten Farbe
      if (model.userData.setLedColor && model.userData.ledColor !== printer.ledColor) {
        model.userData.ledColor = printer.ledColor;
        model.userData.setLedColor(ledColorById(printer.ledColor).hex);
      }

      const state = { mode: 'idle', x: 0, z: 0, layerY: 0, partHeight: 0 };
      if (job && part) {
        const { shape } = part.userData;
        state.partHeight = shape.height;
        state.layerY = shape.height * job.progress;
        if (job.status === 'done') {
          state.mode = 'done';
        } else if (job.status === 'failed') {
          state.mode = 'done'; // Kopf parkt über der Sauerei
          state.partHeight = state.layerY;
        } else {
          state.mode = 'printing'; // auch pausiert: Achsen bleiben an der Stelle stehen
          const outline = part.userData.outline(job.progress);
          if (part.userData.path !== outline) {
            // Neue Schicht: dort weitermachen, wo die Düse gerade ist, statt quer übers Bett zu springen
            const last = part.userData.lastPoint;
            if (last) part.userData.pathT = nearestPathT(outline, last.x, last.z, last.color);
            part.userData.path = outline;
          }
          if (job.status === 'printing' && !swapping) {
            // Bahngeschwindigkeit der Düse (sichtbar verlangsamt), abhängig von der Druckstufe. Leerfahrten zur
            // nächsten Kontur gehen schneller, wie bei einem echten Drucker.
            const travel = part.userData.lastPoint?.travel ? TRAVEL_FACTOR : 1;
            const speed = 0.06 * (speedById(printer.speedId).percent / 100) * travel;
            part.userData.pathT = (part.userData.pathT + (dt * speed) / Math.max(outlineLength(outline), 0.01)) % 1;
          }
          part.userData.lastPoint = outlinePoint(outline, part.userData.pathT);
          Object.assign(state, part.userData.lastPoint);
        }
      }
      if (model.userData.toolRack) {
        // Braucht die Bahn eine andere Farbe, fährt die Düse statt zum Bahnpunkt zum Wechsler
        const printing = state.mode === 'printing' ? part.userData.lastPoint : null;
        const change = updateToolChanger(model, printer, printing, dt);
        if (change) Object.assign(state, change);
      } else if (model.userData.purge) {
        // Eine Düse mit AMS: bei einer anderen Farbe erst zum Spültrichter, dann weiter
        const printing = state.mode === 'printing' ? part.userData.lastPoint : null;
        const purge = updatePurge(model, printer, printing, dt);
        if (purge) Object.assign(state, purge);
      }
      rig.pose(state);
      measureHeadSpeed(model, state, dt);

      if (part) {
        // Schnittebene erst nach dem Bewegen setzen, weil das Teil mit dem Bett mitfährt.
        // Umgekippte Teile werden nicht beschnitten, sondern nur kürzer.
        part.getWorldPosition(worldPos);
        const detached = job.status === 'failed' && job.failure === 'detached';
        part.scale.y = detached ? Math.max(0.15, job.progress) : 1;
        part.userData.clip.constant = job.status === 'done' || detached ? 1e6 : worldPos.y + state.layerY + 0.0004;
      }
      bobBadge(model, printer);
      updatePrinterTubes(model); // Schlauch und Kabel biegen sich mit, ihr Anfang bleibt am Gerät
    }
  }

  // Statussymbol wippt leicht, damit es auffällt
  function bobBadge(model, printer) {
    if (!model.userData.badge) return;
    model.userData.badge.position.y = printerSize(printer.model).y + 0.14 + Math.sin(time * 3) * 0.015;
  }

  // Wie schnell die Düse gerade über das Bett fährt (m/s, leicht geglättet) – fürs Surren der Motoren.
  // Gemessen an der tatsächlichen Bewegung: Drucken, Leerfahrten und Fahrten zum Düsenwechsler.
  function measureHeadSpeed(model, state, dt) {
    const last = model.userData.lastHead;
    let measured = 0;
    if (state.mode === 'printing' && last && dt > 0) {
      measured = Math.min(MAX_HEAD_SPEED, Math.hypot(state.x - last.x, state.z - last.z) / dt);
    }
    model.userData.lastHead = state.mode === 'printing' ? { x: state.x, z: state.z } : null;
    model.userData.headSpeed = THREE.MathUtils.damp(model.userData.headSpeed ?? 0, measured, 10, dt);
  }

  // Aktuelle Kopfgeschwindigkeit eines aufgestellten Druckers in m/s (0, wenn er steht)
  const headSpeed = (printerId) => built.get(printerId)?.userData.headSpeed ?? 0;

  // Weltposition eines aufgestellten Druckers (für Kater und Geräusche), oder null
  function printerPosition(printerId) {
    const model = built.get(printerId);
    return model ? model.position : null;
  }

  // 3D-Modell eines aufgestellten Druckers (z. B. für die Drucker-Cam) oder undefined
  const modelOf = (printerId) => built.get(printerId);

  return { group, sync, animate, printerPosition, headSpeed, modelOf };
}
