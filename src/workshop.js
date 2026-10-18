// Druckertisch: Drucker aufstellen, Filament einlegen/herausnehmen, fertige Teile entnehmen, Pannen beheben
// (Fehldruck wegräumen, Düse freistechen). Dazu Statussymbole über den Druckern und vom Kater
// heruntergeworfene Teile auf dem Boden.
import * as THREE from 'three';
import { FAILURES, filamentById, filamentLabel, templateById, speedById } from './catalog.js';
import { NOZZLE_POKES, spoolLabel } from './economy.js';
import { getPrintShape, outlinePoint, outlineLength } from './print-shapes.js';
import { createPrinterModel, printerSize, updatePrinterTubes } from './printer-model.js';
import { createSpool } from './spool.js';
import { enableShadows } from './util.js';

export const PRINTER_SLOTS_X = [-2.1, -0.7, 0.7, 2.1]; // Stellplätze auf dem Druckertisch (Welt-x)

// ---------- Hilfsmodelle ----------

function partMaterial(filament, clip = null) {
  const transparent = filament.color === 'Transparent';
  return new THREE.MeshStandardMaterial({
    color: filament.hex,
    roughness: 0.45,
    side: THREE.DoubleSide, // an der Schnittkante sieht man ins Innere
    clippingPlanes: clip ? [clip] : [],
    transparent,
    opacity: transparent ? 0.75 : 1,
  });
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
  if (job?.pauseReason === 'filament') return ['🧵', '#d68910'];
  if (job?.status === 'done') return ['✔', '#27ae60'];
  return null;
}

export function createWorkshop({ table, tableHeight, economy, carry }) {
  const group = new THREE.Group();
  const built = new Map(); // Drucker-ID → 3D-Modell
  const loose = new Map(); // ID loses Teil → Mesh auf dem Boden

  // Grüne Vorschau, wo der getragene Drucker landen würde
  const ghost = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0x3ad16b, transparent: true, opacity: 0.25, depthWrite: false })
  );
  ghost.visible = false;
  ghost.raycast = () => {}; // darf den Klickstrahl nicht abfangen
  group.add(ghost);

  const freeSlots = () => PRINTER_SLOTS_X
    .map((_, i) => i)
    .filter((i) => !economy.printers.some((p) => p.location === 'table' && p.slot === i));
  const nearestFreeSlot = (x) => freeSlots().reduce((best, i) => (
    best === null || Math.abs(PRINTER_SLOTS_X[i] - x) < Math.abs(PRINTER_SLOTS_X[best] - x) ? i : best
  ), null);

  table.userData.interaction = {
    hint: () => {
      if (!carry.printer) return null;
      return freeSlots().length ? 'Linksklick: Drucker aufstellen' : 'Kein freier Platz auf dem Tisch';
    },
    hover: (hit) => {
      const printer = carry.printer;
      const slot = printer ? nearestFreeSlot(hit.point.x) : null;
      ghost.visible = slot !== null;
      if (slot === null) return;
      const size = printerSize(printer.model);
      ghost.scale.copy(size);
      ghost.position.set(PRINTER_SLOTS_X[slot], tableHeight + size.y / 2, 0);
    },
    unhover: () => { ghost.visible = false; },
    action: (hit) => {
      const printer = carry.printer;
      const slot = printer ? nearestFreeSlot(hit.point.x) : null;
      if (slot === null) return;
      carry.releasePrinter();
      economy.placePrinter(printer.id, slot);
      ghost.visible = false;
    },
  };

  // Was ein Linksklick auf den Drucker gerade bewirkt: { text, run } oder null.
  // Reihenfolge: Pannen beheben, fertiges Teil entnehmen, dann erst Spulen.
  function printerAction(printer) {
    const name = printer.model.name;
    const job = printer.job;
    const supports = (spool) => printer.model.materials.includes(filamentById(spool.filamentId).material);

    if (carry.printer) return null;
    if (job?.status === 'failed') {
      const failure = FAILURES[job.failure];
      return { text: `Linksklick: Fehldruck wegräumen (${failure.name})`, run: () => economy.clearFailedPrint(printer.id) };
    }
    if (printer.clogged) {
      return {
        text: `Linksklick: Düse freistechen (${printer.nozzlePokes}/${NOZZLE_POKES})`,
        run: () => economy.pokeNozzle(printer.id),
      };
    }
    if (job?.status === 'done') {
      const part = `${templateById(job.templateId).name}, ${filamentLabel(filamentById(job.filamentId))}`;
      return { text: `Linksklick: fertiges Teil entnehmen (${part})`, run: () => economy.collectPart(printer.id) };
    }

    const canChange = economy.canChangeSpools(printer);
    const ams = printer.spools.length > 1;
    // Mit Spulen in der Hand: einlegen. Ist das AMS voll und noch Platz in der Hand, lieber herausnehmen.
    if (carry.hasSpools && !(ams && economy.loadTarget(printer) === -1 && carry.canTakeSpool && canChange)) {
      if (!canChange) return { text: `${name} druckt gerade – Spulen erst danach wechseln` };
      // Wartet der Drucker auf Filament, wird automatisch die passende Spule aus der Hand genommen
      let index = carry.selected;
      if (job?.pauseReason === 'filament') {
        index = carry.spools.findIndex((s) => s.filamentId === job.filamentId);
        if (index === -1) return { text: `Zum Weiterdrucken braucht ${name} ${filamentLabel(filamentById(job.filamentId))}` };
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

  function printerInteraction(printer) {
    return {
      hint: () => printerAction(printer)?.text ?? null,
      action: () => printerAction(printer)?.run?.(),
    };
  }

  // Gedrucktes Teil auf der Platte. Es ist von Anfang an vollständig modelliert, eine Schnittebene
  // gibt aber nur die bereits gedruckten Schichten frei. Das Teil liegt auf dem Druckbett und fährt mit ihm.
  // Bei Fehldrucken kommt die passende Sauerei dazu.
  function updatePart(model, printer) {
    const job = printer.job;
    const key = job ? `${job.templateId}|${job.filamentId}|${job.status === 'failed' ? job.failure : ''}` : null;
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
    const part = new THREE.Mesh(shape.geometry, partMaterial(filament, clip));
    const rig = model.userData.printRig;
    part.position.copy(rig.plateCenter);
    part.castShadow = true;
    part.userData = { shape, clip, pathT: 0 };
    rig.partParent.add(part);
    model.userData.partMesh = part;

    if (job.status !== 'failed') return;
    const printed = shape.height * job.progress;
    if (job.failure === 'spaghetti') {
      const mess = createSpaghetti(filament, Math.max(0.015, printed * 0.6), 0.07);
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
      const filament = filamentById(part.filamentId);
      const mesh = new THREE.Mesh(getPrintShape(template).geometry, partMaterial(filament));
      mesh.position.set(part.x, 0, part.z);
      mesh.rotation.y = part.rotY;
      mesh.castShadow = true;
      mesh.userData.interaction = {
        hint: () => `Linksklick: ${template.name} (${filamentLabel(filament)}) aufheben – der Kater war’s`,
        action: () => economy.pickUpLoosePart(part.id),
      };
      group.add(mesh);
      loose.set(part.id, mesh);
    }
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
        updateSpools(model, printer);
        updatePart(model, printer);
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
        // Schnittebene erst nach dem Bewegen setzen, weil das Teil mit dem Bett mitfährt.
        // Umgekippte Teile werden nicht beschnitten, sondern nur kürzer.
        part.getWorldPosition(worldPos);
        const detached = job.status === 'failed' && job.failure === 'detached';
        part.scale.y = detached ? Math.max(0.15, job.progress) : 1;
        part.userData.clip.constant = job.status === 'done' || detached ? 1e6 : worldPos.y + state.layerY + 0.0004;
      }
      // Statussymbol wippt leicht, damit es auffällt
      if (model.userData.badge) {
        model.userData.badge.position.y = printerSize(printer.model).y + 0.14 + Math.sin(time * 3) * 0.015;
      }
      updatePrinterTubes(model); // Schlauch und Kabel biegen sich mit, ihr Anfang bleibt am Gerät
    }
  }

  // Weltposition eines aufgestellten Druckers (für Kater und Geräusche), oder null
  function printerPosition(printerId) {
    const model = built.get(printerId);
    return model ? model.position : null;
  }

  return { group, sync, animate, printerPosition };
}
