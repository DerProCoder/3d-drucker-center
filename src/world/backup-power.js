// Notstrom im Technikraum (#59, Logik in core/backup-power.js): Batterieschränke an der Ostwand und der
// Dieselgenerator an der Südwand des Technikraums im Raum bei −10,5 m (Plätze aus world/control-room.js
// CONTROL_ANCHORS). Trägt man einen Akku- bzw. Generatorkarton, zeigen grüne Markierungen die freien Plätze; ein
// Klick stellt ihn auf. Aufgestellte Akkus zeigen ihren Ladestand auf dem LED-Balken, der Generator vibriert und
// brummt im Betrieb (Ton über audio/sound.js, main.js reicht audioState() weiter). Ein Klick auf ein Gerät meldet
// seinen Zustand über onNotice.
//
// Alles hängt in controlRoom.technik (wird mit dem Raum ein- und ausgeblendet, anklickbar unter basement.group);
// Koordinaten sind Weltkoordinaten wie in CONTROL_ANCHORS. Hindernisse: collision.setDynamic('backup-power', …).
import * as THREE from 'three';
import { BATTERY, GENERATOR, generatorStartText, isBatteryType, isGeneratorType } from '../core/backup-power.js';
import { createBatteryCabinet } from '../models/battery-cabinet.js';
import { createGenerator } from '../models/generator.js';
import { CONTROL_ANCHORS, CONTROL_LEVEL, CONTROL_ROOM } from './control-room.js';

const EXHAUST_TOP = CONTROL_ROOM.height - 0.05; // Auspuff bis knapp unter die Decke
const VIBRATE = 0.004;                          // m – so stark wackelt die Haube im Betrieb
const MARKER_COLOR = 'rgba(75, 224, 138, ';
const kw = (v) => `${Math.round(Math.abs(v))} kW`;

// Gestrichelte grüne Bodenmarkierung (w × d, Vorderseite des Geräts nach +z der Markierung)
function createMarker(w, d) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = Math.max(32, Math.round((128 * d) / w));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `${MARKER_COLOR}0.18)`;
  ctx.fillRect(4, 4, canvas.width - 8, canvas.height - 8);
  ctx.strokeStyle = `${MARKER_COLOR}0.95)`;
  ctx.lineWidth = 5;
  ctx.setLineDash([14, 9]);
  ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  plane.rotation.x = -Math.PI / 2;
  return plane;
}

// Grundfläche (Welt-x/z) eines Geräts auf einem Platz – Drehungen sind Vielfache von 90°
function footprint(anchor, w, d, pad = 0.05) {
  const turned = Math.abs(Math.sin(anchor.rotY)) > 0.5;
  const hx = (turned ? d : w) / 2 + pad;
  const hz = (turned ? w : d) / 2 + pad;
  return { minX: anchor.x - hx, maxX: anchor.x + hx, minZ: anchor.z - hz, maxZ: anchor.z + hz, level: CONTROL_LEVEL };
}

// backup: core/backup-power.js · carry: world/carry.js · controlRoom: basement.controlRoom (world/control-room.js)
// collision: Kollision der Spielfigur (optional) · onNotice(text, tone): Meldung bei Klick auf ein Gerät (optional)
export function createBackupPowerWorld({ backup, carry, controlRoom, collision = null, onNotice = null }) {
  const root = new THREE.Group();
  root.name = 'backup-power';
  const markers = new THREE.Group();
  const devices = new THREE.Group();
  root.add(markers, devices);
  controlRoom.technik.add(root);

  const carried = () => carry.furniture;
  const carryingType = (test) => !!carried() && test(carried().type);

  // ---------- Markierungen ----------

  function markerFor(anchor, w, d, test, slot) {
    const g = new THREE.Group();
    g.position.set(anchor.x, anchor.y + 0.008, anchor.z);
    g.rotation.y = anchor.rotY;
    g.add(createMarker(w, d));
    g.userData.slot = slot;
    g.userData.test = test;
    g.userData.interaction = {
      hint: () => (carryingType(test) && !backup.slotUsed(carried().type, slot) ? `Linksklick: ${carried().type.name} hier aufstellen` : null),
      action: () => {
        const item = carried();
        if (item && test(item.type) && backup.place(item.id, slot)) carry.releaseFurniture();
      },
    };
    g.visible = false;
    markers.add(g);
    return g;
  }

  CONTROL_ANCHORS.batterySlots.slice(0, BATTERY.max).forEach((a, i) => markerFor(a, a.width, a.depth, isBatteryType, i));
  markerFor(CONTROL_ANCHORS.generatorSlot, CONTROL_ANCHORS.generatorSlot.width, CONTROL_ANCHORS.generatorSlot.depth, isGeneratorType, 0);

  // ---------- Geräte ----------

  let signature = '';
  let batteryModels = new Map(); // Furniture-ID → Modell
  let generatorModel = null;

  function batteryHint(item) {
    const charge = backup.chargeOf(item);
    const pct = Math.round((charge / BATTERY.capacityKwh) * 100);
    const mode = backup.mode === 'charging' ? `lädt (${kw(backup.flowKw / Math.max(1, backup.batteries.length))})`
      : backup.mode === 'discharging' || (backup.mode === 'backup' && backup.flowKw < -0.01) ? `gibt ab (${kw(backup.flowKw / Math.max(1, backup.batteries.length))})`
        : backup.mode === 'backup' ? 'Notstrom bereit' : 'Ruhe';
    return `Batterieschrank ${item.slot + 1}: ${pct} % (${Math.round(charge)} / ${BATTERY.capacityKwh} kWh) · ${mode}`;
  }

  function generatorHint() {
    const state = backup.generatorRunning ? `läuft (${kw(backup.generatorKw)})`
      : backup.generatorStartsIn !== null ? generatorStartText(backup.generatorStartsIn) : backup.diesel <= 0 ? 'Tank leer' : 'Bereitschaft';
    return `Dieselgenerator ${GENERATOR.kw} kW: ${state} · Diesel ${Math.round(backup.diesel)} / ${GENERATOR.tankLiters} L`;
  }

  function rebuild() {
    for (const child of [...devices.children]) devices.remove(child);
    batteryModels = new Map();
    generatorModel = null;
    const boxes = [];
    for (const item of backup.batteries) {
      const a = CONTROL_ANCHORS.batterySlots[item.slot];
      if (!a) continue;
      const model = createBatteryCabinet();
      model.position.set(a.x, a.y, a.z);
      model.rotation.y = a.rotY;
      model.userData.interaction = {
        hint: () => (carried() ? null : `${batteryHint(item)} · Linksklick: Details`),
        action: () => onNotice?.(`🔋 ${batteryHint(item)} – alle Akkus: ${Math.round(backup.percent)} %`),
      };
      devices.add(model);
      batteryModels.set(item.id, model);
      boxes.push(footprint(a, model.userData.size.w, model.userData.size.d));
    }
    const gen = backup.generator;
    if (gen) {
      const a = CONTROL_ANCHORS.generatorSlot;
      generatorModel = createGenerator({ exhaustHeight: EXHAUST_TOP });
      generatorModel.position.set(a.x, a.y, a.z);
      generatorModel.rotation.y = a.rotY;
      generatorModel.userData.interaction = {
        hint: () => (carried() ? null : `${generatorHint()} · Linksklick: Details`),
        action: () => onNotice?.(`⛽ ${generatorHint()} – Diesel im Server-Shop (Technik) nachkaufen`, backup.diesel < GENERATOR.tankLiters * 0.15 ? 'bad' : undefined),
      };
      devices.add(generatorModel);
      boxes.push(footprint(a, generatorModel.userData.size.w, generatorModel.userData.size.d));
    }
    collision?.setDynamic('backup-power', boxes);
  }

  // ---------- Bild für Bild ----------

  let time = 0;
  let lastCarry = null;
  // dt: echte Sekunden · cameraPosition: für den Abstand zum Generator (Ton)
  function update(dt = 0, cameraPosition = null) {
    time += dt;
    const sig = backup.items.filter((f) => f.location === 'technik').map((f) => `${f.type.id}:${f.id}:${f.slot}`).join('|');
    if (sig !== signature) {
      signature = sig;
      rebuild();
    }
    // Markierungen nur mit passendem Karton in der Hand und auf freien Plätzen
    const item = carried();
    const key = item ? `${item.id}|${sig}` : null;
    if (key !== lastCarry) {
      lastCarry = key;
      for (const m of markers.children) m.visible = !!item && m.userData.test(item.type) && !backup.slotUsed(item.type, m.userData.slot);
    }
    if (!controlRoom.group.visible) return;
    for (const b of backup.batteries) batteryModels.get(b.id)?.userData.setLevel(backup.chargeOf(b) / BATTERY.capacityKwh, backup.mode, time);
    if (generatorModel) {
      const running = backup.generatorRunning;
      generatorModel.userData.setState({
        running, starting: backup.generatorStartsIn !== null, diesel: backup.diesel / GENERATOR.tankLiters, time,
      });
      const housing = generatorModel.userData.housing;
      if (running) {
        housing.position.x = Math.sin(time * 97) * VIBRATE;
        housing.position.z = Math.cos(time * 83) * VIBRATE * 0.6;
        housing.rotation.z = Math.sin(time * 61) * VIBRATE * 0.4;
      } else if (housing.position.x || housing.position.z) {
        housing.position.x = 0;
        housing.position.z = 0;
        housing.rotation.z = 0;
      }
    }
    if (cameraPosition) lastCamera = cameraPosition;
  }

  let lastCamera = null;
  // Für audio/sound.js updateGenerator(running, distance): läuft der Generator, wie weit ist die Kamera weg (m)?
  function audioState(cameraPosition = lastCamera) {
    const a = CONTROL_ANCHORS.generatorSlot;
    const running = !!backup.generator && backup.generatorRunning;
    if (!running || !cameraPosition) return { running, distance: Infinity };
    return { running, distance: Math.hypot(cameraPosition.x - a.x, cameraPosition.y - (a.y + 1), cameraPosition.z - a.z) };
  }

  update(0);
  return { group: root, update, audioState, markers, devices };
}
